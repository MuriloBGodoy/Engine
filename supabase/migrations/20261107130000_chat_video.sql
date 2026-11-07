-- Vídeo na conversa (07/11/2026)
--
-- A DM mandava foto e GIF, as duas como data URL dentro da própria linha de
-- `messages` — protegida pela RLS da conversa, como tem que ser. Vídeo não
-- cabe nesse formato: um clipe de celular tem dezenas de MB e viraria uma
-- string gigante no banco.
--
-- Vai para o Storage, então. Mas NÃO para o bucket `videos` dos posts, que é
-- público: qualquer um com o endereço veria um vídeo de conversa privada. Daí
-- um bucket próprio, fechado, onde o caminho carrega a conversa
--
--     conversations/<id da conversa>/<quem mandou>/<arquivo>
--
-- e a permissão de ler é a MESMA de ler a conversa (`is_conversation_member`).
-- O app pega o arquivo por URL assinada, que vence; sem fazer parte da
-- conversa não há assinatura.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 52428800,
        array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

-- Subir: só membro, só na pasta dele, dentro da conversa dele.
create policy "chat: membro sobe na conversa" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = 'conversations'
    and public.is_conversation_member((storage.foldername(name))[2])
    and (storage.foldername(name))[3] = (select auth.uid())::text
  );
-- Ler: quem está na conversa, inclusive o que o outro mandou.
create policy "chat: membro le a conversa" on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = 'conversations'
    and public.is_conversation_member((storage.foldername(name))[2])
  );
-- Apagar: só quem mandou (é o que acompanha "apagar a mensagem").
create policy "chat: autor apaga" on storage.objects
  for delete to authenticated using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = 'conversations'
    and (storage.foldername(name))[3] = (select auth.uid())::text
  );

-- A prévia da lista de conversas precisa saber dizer "vídeo"; sem isto um
-- clipe aparecia como "📷 Publicação" na caixa de entrada.
create or replace function public.message_preview(p_text text, p_type text, p_data jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when coalesce(p_text, '') <> '' then p_text
    when p_type = 'gif' then '🎬 GIF'
    when p_type = 'image' then '📷 Imagem'
    when p_type = 'video' then '🎥 Vídeo'
    when p_data -> 'attachment' ->> 'title' is not null then '📷 ' || (p_data -> 'attachment' ->> 'title')
    else '📷 Publicação'
  end;
$$;

-- `send_message` monta a mesma prévia por dentro. Cópia inteira da versão de
-- 20261101130000 (create or replace troca o corpo todo), com o caso novo.

create or replace function public.send_message(p_conversation text, p_text text, p_type text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limits jsonb := public.quote_limits();
  v_conv public.conversations;
  v_actor uuid;
  v_recipient uuid;
  v_msg uuid;
  v_type text := coalesce(nullif(p_type, ''), 'text');
  v_text text := left(btrim(coalesce(p_text, '')), 2000);
  v_preview text;
  v_sender jsonb;
  v_metered boolean := false;
begin
  select * into v_conv from public.conversations where id = p_conversation for update;
  v_actor := case when found then public.conversation_actor(v_conv, v_uid) end;
  if v_actor is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  v_recipient := (select m from unnest(v_conv.member_ids) m where m <> v_actor limit 1);
  if public.is_blocked_between(v_uid, v_recipient) or public.is_blocked_between(v_actor, v_recipient) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if v_type not in ('text', 'post', 'image', 'gif') then
    raise exception 'invalid-type' using errcode = 'P0001';
  end if;

  if v_conv.started_by = v_actor and v_conv.first_reply_at is null and (
       (v_conv.kind = 'service' and v_actor = v_conv.customer_id)
       or (
         v_conv.kind = 'direct'
         and public.is_service_provider(v_recipient)
         and not exists (
           select 1 from public.follows f where f.follower_id = v_recipient and f.target_id = v_actor
         )
       )
     ) then
    if v_conv.opened_at is null then
      perform pg_advisory_xact_lock(hashtext('chat_first_contact:' || v_actor::text));
      if (select count(*) from public.conversations c
          where c.started_by = v_actor and c.metered and c.first_reply_at is null
            and c.opened_at > now() - make_interval(days => (v_limits ->> 'ttlDays')::integer))
         >= (v_limits ->> 'maxPendingChatsPerCustomer')::integer then
        raise exception 'too-many-open' using errcode = 'P0001';
      end if;
      if (select count(*) from public.conversations c
          where c.started_by = v_actor and c.metered and c.opened_at > now() - interval '24 hours')
         >= (v_limits ->> 'maxNewChatsPerDayPerCustomer')::integer then
        raise exception 'rate-limited' using errcode = 'P0001';
      end if;
      v_metered := true;
    elsif (select count(*) from public.messages m
           where m.conversation_id = p_conversation and m.sender_id = v_actor)
          >= (v_limits ->> 'maxMessagesBeforeReply')::integer then
      raise exception 'awaiting-reply' using errcode = 'P0001';
    end if;
  end if;

  insert into public.messages (conversation_id, sender_id, text, type, data)
  values (p_conversation, v_uid, v_text, v_type, coalesce(p_data, '{}'::jsonb))
  returning id into v_msg;

  v_preview := case
    when v_text <> '' then v_text
    when v_type = 'gif' then '🎬 GIF'
    when v_type = 'image' then '📷 Imagem'
    when v_type = 'video' then '🎥 Vídeo'
    when p_data -> 'attachment' ->> 'title' is not null then '📷 ' || (p_data -> 'attachment' ->> 'title')
    else '📷 Publicação'
  end;

  update public.conversations set
    updated_at = now(),
    last_message = jsonb_build_object(
      'text', v_preview, 'senderId', v_uid::text, 'type', v_type,
      'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    unread = unread
      || jsonb_build_object(v_actor::text, 0)
      || jsonb_build_object(v_recipient::text, coalesce((unread ->> v_recipient::text)::integer, 0) + 1),
    opened_at = coalesce(opened_at, case when started_by = v_actor then now() end),
    metered = metered or v_metered,
    first_reply_at = case
      when first_reply_at is null and started_by is not null and started_by <> v_actor then now()
      else first_reply_at
    end,
    service_status = case
      when kind <> 'service' then service_status
      when service_status = 'closed' then 'closed'
      when v_actor = provider_id then 'replied'
      else 'new'
    end
  where id = p_conversation;

  if coalesce((v_conv.unread ->> v_recipient::text)::integer, 0) = 0 then
    v_sender := coalesce(v_conv.members -> v_actor::text, '{}'::jsonb);
    perform public.notify(v_recipient, v_uid, 'message', jsonb_build_object(
      'actorName', coalesce(nullif(left(v_sender ->> 'author', 80), ''), 'Alguém'),
      'conversationId', p_conversation,
      'targetPath', '/messages/' || p_conversation
    ));
  end if;
  return v_msg;
end;
$$;
