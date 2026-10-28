-- O sino passa a ser escrito SÓ pelo servidor (auditoria social, achado 0.4).
--
-- Antes: a política "avisos: honesto" deixava qualquer conta logada inserir
-- um aviso no sino de qualquer outra, desde que assinasse com o próprio id.
-- `notificationTitle`, `notificationBody` e `targetPath` eram texto livre e o
-- `type` podia ser 'service_rejected' — dava para mandar a alguém "Anúncio
-- recusado — clique aqui" com link e texto escolhidos. Sem limite de volume.
--
-- Agora:
--   - nenhuma política de INSERT em `notifications`: o cliente só lê, marca
--     como lido e apaga o próprio aviso;
--   - quem cria é `public.notify`, chamada só por triggers e funções
--     `security definer` deste banco, com tipo fixo e campos montados aqui
--     (o nome de quem agiu vem do perfil público, não do cliente);
--   - nada de título/corpo gravado: a tela traduz pelo `type`, no idioma de
--     quem LÊ (antes saía em pt-BR para todo mundo, no idioma de quem mandou);
--   - bloqueio vale: quem bloqueou não recebe aviso do bloqueado;
--   - repetição contida: curtir/descurtir/curtir, seguir de novo e reavaliar
--     não geram um aviso novo dentro de 24 h.
--
-- Também redefine add_comment, rate_goal, start_conversation e send_message
-- com a checagem de bloqueio (tabela criada em 20261025160000_social_blocks).

drop policy if exists "avisos: honesto" on public.notifications;

-- 'service_suspended' (anúncio tirado do ar, 20261025150000) faltava na lista:
-- o aviso daquele caso era recusado pelo banco e morria num console.warn.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'follow', 'like', 'comment', 'rating', 'achievement', 'message',
  'service_approved', 'service_changes_requested', 'service_rejected', 'service_suspended'
));

create index if not exists notifications_dedupe
  on public.notifications (user_id, actor_id, type, created_at desc);

-- ---------------------------------------------------------------------------
-- A única porta de entrada do sino
-- ---------------------------------------------------------------------------

create or replace function public.notify(
  p_user uuid,
  p_actor uuid,
  p_type text,
  p_data jsonb default '{}'::jsonb,
  p_dedupe boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card jsonb := '{}'::jsonb;
  v_profile record;
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  if p_actor is not null and public.is_blocked_between(p_user, p_actor) then
    return;
  end if;
  if p_dedupe and exists (
    select 1 from public.notifications n
    where n.user_id = p_user
      and n.actor_id is not distinct from p_actor
      and n.type = p_type
      and coalesce(n.data ->> 'goalId', '') = coalesce(p_data ->> 'goalId', '')
      and n.created_at > now() - interval '24 hours'
  ) then
    return;
  end if;

  if p_actor is not null then
    select author, username into v_profile from public.public_profiles where user_id = p_actor;
    if found then
      v_card := jsonb_strip_nulls(jsonb_build_object(
        'actorName', nullif(left(v_profile.author, 80), ''),
        'actorUsername', nullif(left(v_profile.username, 32), '')
      ));
    end if;
  end if;

  insert into public.notifications (user_id, actor_id, type, read, data)
  values (
    p_user, p_actor, p_type, false,
    jsonb_build_object('actorName', 'Alguém') || coalesce(p_data, '{}'::jsonb) || v_card
  );
end;
$$;
revoke execute on function public.notify(uuid, uuid, text, jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seguir e curtir: o aviso nasce da linha que de fato foi gravada
-- ---------------------------------------------------------------------------

create or replace function public.follows_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify(new.target_id, new.follower_id, 'follow', jsonb_build_object(
    'targetPath', '/community?user=' || new.follower_id::text
  ), true);
  return new;
end;
$$;
create trigger follows_notify after insert on public.follows
  for each row execute function public.follows_notify();

create or replace function public.post_likes_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  select left(coalesce(data ->> 'title', ''), 120) into v_title
    from public.community_goals where id = new.post_id;
  perform public.notify(new.post_owner_id, new.liker_id, 'like', jsonb_build_object(
    'goalId', new.post_id,
    'goalTitle', coalesce(v_title, ''),
    'targetPath', '/community?goal=' || new.post_id
  ), true);
  return new;
end;
$$;
create trigger post_likes_notify after insert on public.post_likes
  for each row execute function public.post_likes_notify();

-- ---------------------------------------------------------------------------
-- Comentar e avaliar: bloqueio + aviso, dentro da mesma função
-- ---------------------------------------------------------------------------

create or replace function public.add_comment(p_post_id text, p_comment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_comment jsonb;
  v_owner uuid;
  v_title text;
  v_profile record;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select owner_id, left(coalesce(data ->> 'title', ''), 120) into v_owner, v_title
    from public.community_goals where id = p_post_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if public.is_blocked_between(v_uid, v_owner) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  -- O cartão (nome, @, retrato) vem do perfil público quando existe: o nome
  -- exibido no comentário deixa de ser o que o cliente quiser mandar.
  select author, username, data into v_profile from public.public_profiles where user_id = v_uid;

  v_comment := jsonb_build_object(
    'id', coalesce(nullif(p_comment ->> 'id', ''), gen_random_uuid()::text),
    'userId', v_uid::text,
    'author', left(coalesce(nullif(v_profile.author, ''), p_comment ->> 'author', ''), 80),
    'username', left(coalesce(nullif(v_profile.username, ''), p_comment ->> 'username', ''), 32),
    'avatar', coalesce(nullif(v_profile.data ->> 'avatar', ''), p_comment ->> 'avatar', ''),
    'avatarInitials', left(coalesce(nullif(v_profile.data ->> 'avatarInitials', ''), p_comment ->> 'avatarInitials', ''), 4),
    'text', left(btrim(coalesce(p_comment ->> 'text', '')), 180),
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  if v_comment ->> 'text' = '' then
    raise exception 'empty-comment' using errcode = 'P0001';
  end if;

  perform public.trust_this_transaction();
  update public.community_goals
    set comments = comments || jsonb_build_array(v_comment), updated_at = now()
    where id = p_post_id;

  perform public.notify(v_owner, v_uid, 'comment', jsonb_build_object(
    'goalId', p_post_id,
    'goalTitle', coalesce(v_title, ''),
    'commentId', v_comment ->> 'id',
    'actorName', v_comment ->> 'author',
    'targetPath', '/community?goal=' || p_post_id || '&comments=1'
  ));
  return v_comment;
end;
$$;

create or replace function public.rate_goal(p_post_id text, p_rating integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_title text;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select owner_id, left(coalesce(data ->> 'title', ''), 120) into v_owner, v_title
    from public.community_goals where id = p_post_id;
  if not found then
    return;
  end if;
  if public.is_blocked_between(v_uid, v_owner) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  perform public.trust_this_transaction();
  update public.community_goals
    set ratings_by = ratings_by || jsonb_build_object(v_uid::text, greatest(1, least(coalesce(p_rating, 1), 5))),
        updated_at = now()
    where id = p_post_id;
  perform public.notify(v_owner, v_uid, 'rating', jsonb_build_object(
    'goalId', p_post_id,
    'goalTitle', coalesce(v_title, ''),
    'targetPath', '/community?goal=' || p_post_id
  ), true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Mensagens: bloqueio nos dois sentidos
-- ---------------------------------------------------------------------------

create or replace function public.start_conversation(p_other uuid, p_my_card jsonb, p_other_card jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_id text;
begin
  if v_uid is null or p_other is null or p_other = v_uid then
    raise exception 'invalid-conversation' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(v_uid, p_other) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  v_ids := case when v_uid::text < p_other::text then array[v_uid, p_other] else array[p_other, v_uid] end;
  v_id := v_ids[1]::text || '__' || v_ids[2]::text;

  insert into public.conversations (id, member_ids, members, unread)
  values (
    v_id, v_ids,
    jsonb_build_object(v_uid::text, coalesce(p_my_card, '{}'::jsonb), p_other::text, coalesce(p_other_card, '{}'::jsonb)),
    jsonb_build_object(v_uid::text, 0, p_other::text, 0)
  )
  on conflict (id) do update
    set members = public.conversations.members || jsonb_build_object(v_uid::text, coalesce(p_my_card, '{}'::jsonb));
  return v_id;
end;
$$;

create or replace function public.send_message(p_conversation text, p_text text, p_type text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conv public.conversations;
  v_recipient uuid;
  v_msg uuid;
  v_text text := left(btrim(coalesce(p_text, '')), 2000);
  v_preview text;
  v_sender jsonb;
begin
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found or not (v_uid = any (v_conv.member_ids)) then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  v_recipient := (select m from unnest(v_conv.member_ids) m where m <> v_uid limit 1);
  if public.is_blocked_between(v_uid, v_recipient) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  insert into public.messages (conversation_id, sender_id, text, type, data)
  values (p_conversation, v_uid, v_text,
          coalesce(nullif(p_type, ''), 'text'), coalesce(p_data, '{}'::jsonb))
  returning id into v_msg;

  v_preview := case
    when v_text <> '' then v_text
    when p_type = 'gif' then '🎬 GIF'
    when p_type = 'image' then '📷 Imagem'
    when p_data -> 'attachment' ->> 'title' is not null then '📷 ' || (p_data -> 'attachment' ->> 'title')
    else '📷 Publicação'
  end;

  update public.conversations set
    updated_at = now(),
    last_message = jsonb_build_object(
      'text', v_preview, 'senderId', v_uid::text, 'type', coalesce(nullif(p_type, ''), 'text'),
      'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    unread = unread
      || jsonb_build_object(v_uid::text, 0)
      || jsonb_build_object(v_recipient::text, coalesce((unread ->> v_recipient::text)::integer, 0) + 1)
  where id = p_conversation;

  -- Aviso só quando a conversa estava zerada para quem recebe.
  if coalesce((v_conv.unread ->> v_recipient::text)::integer, 0) = 0 then
    v_sender := coalesce(v_conv.members -> v_uid::text, '{}'::jsonb);
    perform public.notify(v_recipient, v_uid, 'message', jsonb_build_object(
      'actorName', coalesce(nullif(left(v_sender ->> 'author', 80), ''), 'Alguém'),
      'conversationId', p_conversation,
      'targetPath', '/messages/' || p_conversation
    ));
  end if;
  return v_msg;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anúncios: a decisão da moderação vira aviso aqui, não no navegador dela
-- ---------------------------------------------------------------------------

create or replace function public.service_listings_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if not public.is_service_admin() then
    return new;
  end if;
  v_type := case new.moderation_status
    when 'approved' then 'service_approved'
    when 'changes_requested' then 'service_changes_requested'
    when 'rejected' then 'service_rejected'
    when 'suspended' then 'service_suspended'
  end;
  if v_type is null then
    return new;
  end if;
  perform public.notify(new.owner_id, auth.uid(), v_type, jsonb_build_object(
    'actorName', 'Moderação Engine',
    'serviceId', new.id,
    'serviceTitle', left(coalesce(new.data ->> 'title', ''), 120),
    'moderationNote', left(coalesce(new.data ->> 'moderationNote', ''), 600),
    'targetPath', '/services'
  ));
  return new;
end;
$$;
create trigger service_listings_notify
  after update of moderation_status on public.service_listings
  for each row
  when (old.moderation_status is distinct from new.moderation_status)
  execute function public.service_listings_notify();
