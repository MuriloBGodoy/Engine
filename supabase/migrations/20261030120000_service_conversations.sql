-- Conversa cliente ↔ prestador, dentro de Mensagens.
--
-- Antes: o anúncio só tinha WhatsApp e e-mail, e o orçamento abria um DM
-- comum — misturado com os amigos, sem dizer de que serviço se tratava.
-- Agora existe um segundo tipo de conversa, 'service', amarrada a UM anúncio:
--
--   id = 'svc__<anúncio>__<cliente>'   (um fio por anúncio e cliente, como
--                                       OLX/Airbnb: o anúncio é o assunto)
--
-- e o app separa as abas (Conversas · Serviços · Clientes) pelo `kind`.
--
-- Decisões:
--
--   1. O cartão de contexto (anúncio, foto, carro do cliente, pedido de
--      orçamento e a resposta com preço) é lido AO VIVO por
--      `service_conversation_context`, só para os dois da conversa. Na linha
--      fica só um retrato curto (`context`) para a lista não ler N anúncios.
--
--   2. A resposta de orçamento cai no fio. `reply_quote_request` abre (ou
--      reabre) a conversa do anúncio com o cliente e grava a resposta como
--      mensagem 'quote'. O aviso continua sendo um só, 'quote_reply', agora
--      apontando para a conversa. O cliente só é revelado ao prestador depois
--      da resposta, como já era.
--
--   3. Anti-spam do primeiro contato, com os mesmos números do orçamento
--      (`quote_limits()`): quem inicia contato com um prestador (fio de
--      serviço, OU DM comum para dono de anúncio aprovado que não o segue)
--      tem no máximo 3 contatos sem resposta nos últimos 7 dias, 5 contatos
--      novos por 24 h e 5 mensagens num fio até o prestador responder.
--      Conta no ENVIO da primeira mensagem, não ao abrir: abrir a tela e
--      desistir não gasta nada. Respondeu, acabou o limite naquele fio.
--      Prestador falando com cliente nunca é limitado.
--
--   4. Status do lado do prestador (novo · respondido · fechado). 'novo' e
--      'respondido' andam sozinhos com as mensagens; 'fechado' é dele e fica
--      até ele reabrir.
--
--   5. Nada de telefone no fio: o WhatsApp do anúncio só aparece no cartão
--      se o próprio prestador publicou no anúncio (já é público). O do
--      cliente nunca. O carro do cliente vai só se ele escolheu mandar, e
--      vai como rótulo (marca, modelo, ano) — sem placa.
--
--   6. Bloqueio, denúncia e suspensão são os do DM: as mensagens são as
--      mesmas (`messages`), `send_message` já recusa com bloqueio e a
--      denúncia 'message' já confere que quem denuncia está na conversa.
--
--   7. Tipo de mensagem agora é lista fechada em `send_message`
--      (text, post, image, gif). 'quote' só o banco grava — ninguém forja um
--      cartão de orçamento digitando.

-- ---------------------------------------------------------------------------
-- Os números (os de antes + os do primeiro contato)
-- ---------------------------------------------------------------------------

create or replace function public.quote_limits()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'ttlDays', 7,
    'maxOpenPerCustomer', 3,
    'maxPerDayPerCustomer', 5,
    'maxPhotos', 4,
    'maxNotifiedProviders', 50,
    'providerRepliesPerMonth', null,
    'maxPendingChatsPerCustomer', 3,
    'maxNewChatsPerDayPerCustomer', 5,
    'maxMessagesBeforeReply', 5
  );
$$;
grant execute on function public.quote_limits() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Colunas novas na conversa
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column kind text not null default 'direct' check (kind in ('direct', 'service')),
  add column listing_id text references public.service_listings (id) on delete set null,
  add column customer_id uuid,
  add column provider_id uuid,
  add column quote_request_id uuid references public.quote_requests (id) on delete set null,
  add column service_status text check (service_status in ('new', 'replied', 'closed')),
  -- Retrato curto para a lista: listingTitle, listingPhoto, category, car.
  add column context jsonb not null default '{}'::jsonb,
  -- Quem abriu, quando mandou a 1ª mensagem, quando o outro respondeu pela
  -- 1ª vez, e se esse primeiro contato entrou na conta do limite.
  add column started_by uuid,
  add column opened_at timestamptz,
  add column first_reply_at timestamptz,
  add column metered boolean not null default false;

alter table public.conversations add constraint conversations_service_shape check (
  kind = 'direct'
  or (
    customer_id is not null and provider_id is not null and customer_id <> provider_id
    and member_ids @> array[customer_id, provider_id]
    and service_status is not null
  )
);

create index conversations_first_contact
  on public.conversations (started_by, opened_at desc)
  where metered;

-- ---------------------------------------------------------------------------
-- Ajudantes (internos)
-- ---------------------------------------------------------------------------

-- Cartão montado do perfil público, nunca do que o cliente manda.
create or replace function public.chat_member_card(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'author', coalesce(nullif(left(p.author, 80), ''), 'Usuário Engine'),
      'username', left(coalesce(p.username, ''), 32),
      'avatar', left(coalesce(p.data ->> 'avatar', ''), 500),
      'avatarInitials', coalesce((
        select upper(left(string_agg(left(t.w, 1), '' order by t.n), 2))
        from regexp_split_to_table(btrim(coalesce(p.author, '')), '\s+') with ordinality as t(w, n)
        where t.w <> ''
      ), '')
    )
    from public.public_profiles p where p.user_id = p_user
  ), jsonb_build_object('author', 'Usuário Engine', 'username', '', 'avatar', '', 'avatarInitials', ''));
$$;
revoke execute on function public.chat_member_card(uuid) from public, anon, authenticated;

create or replace function public.is_service_provider(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.service_listings
    where owner_id = p_user and moderation_status = 'approved'
  );
$$;
revoke execute on function public.is_service_provider(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- DM comum: guarda quem abriu (para o limite do primeiro contato)
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

  insert into public.conversations (id, member_ids, members, unread, kind, started_by)
  values (
    v_id, v_ids,
    jsonb_build_object(v_uid::text, coalesce(p_my_card, '{}'::jsonb), p_other::text, coalesce(p_other_card, '{}'::jsonb)),
    jsonb_build_object(v_uid::text, 0, p_other::text, 0),
    'direct', v_uid
  )
  on conflict (id) do update
    set members = public.conversations.members || jsonb_build_object(v_uid::text, coalesce(p_my_card, '{}'::jsonb)),
        -- Conversa de antes desta migração, ainda vazia: quem abre agora é
        -- quem está iniciando o contato.
        started_by = coalesce(
          public.conversations.started_by,
          case when public.conversations.last_message is null then v_uid end
        );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fio de serviço: o cliente abre a partir do anúncio
-- ---------------------------------------------------------------------------

create or replace function public.start_service_conversation(
  p_listing text,
  p_car text default '',
  p_quote_request uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.service_listings;
  v_id text;
  v_ids uuid[];
  v_car text := left(btrim(regexp_replace(coalesce(p_car, ''), '\s+', ' ', 'g')), 120);
  v_quote uuid;
  v_context jsonb;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select * into v_listing from public.service_listings where id = p_listing;
  if not found or v_listing.moderation_status <> 'approved'
     or public.is_account_suspended(v_listing.owner_id) then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if v_listing.owner_id = v_uid then
    raise exception 'own-listing' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(v_uid, v_listing.owner_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  -- Só o próprio pedido de orçamento pode ser amarrado ao fio.
  if p_quote_request is not null then
    select id into v_quote from public.quote_requests
      where id = p_quote_request and customer_id = v_uid;
  end if;

  v_id := 'svc__' || v_listing.id || '__' || v_uid::text;
  v_ids := case when v_uid::text < v_listing.owner_id::text
                then array[v_uid, v_listing.owner_id] else array[v_listing.owner_id, v_uid] end;
  v_context := jsonb_build_object(
    'listingTitle', left(coalesce(v_listing.data ->> 'title', ''), 120),
    'listingPhoto', left(coalesce(v_listing.data -> 'photos' ->> 0, ''), 500),
    'category', left(coalesce(v_listing.data ->> 'category', ''), 60)
  );

  insert into public.conversations (
    id, member_ids, members, unread, kind, listing_id, customer_id, provider_id,
    quote_request_id, service_status, context, started_by
  ) values (
    v_id, v_ids,
    jsonb_build_object(
      v_uid::text, public.chat_member_card(v_uid),
      v_listing.owner_id::text, public.chat_member_card(v_listing.owner_id)
    ),
    jsonb_build_object(v_uid::text, 0, v_listing.owner_id::text, 0),
    'service', v_listing.id, v_uid, v_listing.owner_id,
    v_quote, 'new',
    v_context || case when v_car <> '' then jsonb_build_object('car', v_car) else '{}'::jsonb end,
    v_uid
  )
  on conflict (id) do update set
    members = public.conversations.members || jsonb_build_object(v_uid::text, public.chat_member_card(v_uid)),
    quote_request_id = coalesce(excluded.quote_request_id, public.conversations.quote_request_id),
    context = public.conversations.context || v_context
      || case when v_car <> '' then jsonb_build_object('car', v_car) else '{}'::jsonb end;
  return v_id;
end;
$$;
revoke execute on function public.start_service_conversation(text, text, uuid) from public, anon;
grant execute on function public.start_service_conversation(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mandar mensagem: tipos fechados, status do fio e limite do 1º contato
-- ---------------------------------------------------------------------------

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
  v_recipient uuid;
  v_msg uuid;
  v_type text := coalesce(nullif(p_type, ''), 'text');
  v_text text := left(btrim(coalesce(p_text, '')), 2000);
  v_preview text;
  v_sender jsonb;
  v_metered boolean := false;
begin
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found or not (v_uid = any (v_conv.member_ids)) then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  v_recipient := (select m from unnest(v_conv.member_ids) m where m <> v_uid limit 1);
  if public.is_blocked_between(v_uid, v_recipient) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if v_type not in ('text', 'post', 'image', 'gif') then
    raise exception 'invalid-type' using errcode = 'P0001';
  end if;

  -- Primeiro contato com prestador (decisão 3).
  if v_conv.started_by = v_uid and v_conv.first_reply_at is null and (
       (v_conv.kind = 'service' and v_uid = v_conv.customer_id)
       or (
         v_conv.kind = 'direct'
         and public.is_service_provider(v_recipient)
         and not exists (
           select 1 from public.follows f where f.follower_id = v_recipient and f.target_id = v_uid
         )
       )
     ) then
    if v_conv.opened_at is null then
      perform pg_advisory_xact_lock(hashtext('chat_first_contact:' || v_uid::text));
      if (select count(*) from public.conversations c
          where c.started_by = v_uid and c.metered and c.first_reply_at is null
            and c.opened_at > now() - make_interval(days => (v_limits ->> 'ttlDays')::integer))
         >= (v_limits ->> 'maxPendingChatsPerCustomer')::integer then
        raise exception 'too-many-open' using errcode = 'P0001';
      end if;
      if (select count(*) from public.conversations c
          where c.started_by = v_uid and c.metered and c.opened_at > now() - interval '24 hours')
         >= (v_limits ->> 'maxNewChatsPerDayPerCustomer')::integer then
        raise exception 'rate-limited' using errcode = 'P0001';
      end if;
      v_metered := true;
    elsif (select count(*) from public.messages m
           where m.conversation_id = p_conversation and m.sender_id = v_uid)
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
    when p_data -> 'attachment' ->> 'title' is not null then '📷 ' || (p_data -> 'attachment' ->> 'title')
    else '📷 Publicação'
  end;

  update public.conversations set
    updated_at = now(),
    last_message = jsonb_build_object(
      'text', v_preview, 'senderId', v_uid::text, 'type', v_type,
      'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    unread = unread
      || jsonb_build_object(v_uid::text, 0)
      || jsonb_build_object(v_recipient::text, coalesce((unread ->> v_recipient::text)::integer, 0) + 1),
    opened_at = coalesce(opened_at, case when started_by = v_uid then now() end),
    metered = metered or v_metered,
    first_reply_at = case
      when first_reply_at is null and started_by is not null and started_by <> v_uid then now()
      else first_reply_at
    end,
    service_status = case
      when kind <> 'service' then service_status
      when service_status = 'closed' then 'closed'
      when v_uid = provider_id then 'replied'
      else 'new'
    end
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
-- Prestador marca o fio (novo · respondido · fechado)
-- ---------------------------------------------------------------------------

create or replace function public.set_service_conversation_status(p_conversation text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_status not in ('new', 'replied', 'closed') then
    raise exception 'invalid-status' using errcode = 'P0001';
  end if;
  update public.conversations set service_status = p_status
    where id = p_conversation and kind = 'service' and provider_id = v_uid;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.set_service_conversation_status(text, text) from public, anon;
grant execute on function public.set_service_conversation_status(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- O cartão fixado no topo do fio (ao vivo, só para os dois)
-- ---------------------------------------------------------------------------

create or replace function public.service_conversation_context(p_conversation text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conv public.conversations;
  v_listing public.service_listings;
  v_role text;
  v_out jsonb;
  v_quote jsonb := null;
begin
  select * into v_conv from public.conversations where id = p_conversation;
  if not found or v_uid is null or not (v_uid = any (v_conv.member_ids)) or v_conv.kind <> 'service' then
    return null;
  end if;
  v_role := case when v_uid = v_conv.provider_id then 'provider' else 'customer' end;

  if v_conv.listing_id is not null then
    select * into v_listing from public.service_listings where id = v_conv.listing_id;
  end if;

  if v_conv.quote_request_id is not null then
    select jsonb_build_object(
      'id', r.id,
      'status', public.quote_status(r.status, r.expires_at),
      'category', r.category,
      'carLabel', r.car_label,
      'description', r.description,
      'city', r.city,
      'createdAt', r.created_at,
      'expiresAt', r.expires_at,
      'reply', (
        select jsonb_build_object(
          'id', q.id, 'priceMin', q.price_min, 'priceMax', q.price_max, 'currency', q.currency,
          'estimatedTime', q.estimated_time, 'message', q.message, 'createdAt', q.created_at,
          'chosen', r.chosen_reply_id is not distinct from q.id
        )
        from public.quote_replies q
        where q.request_id = r.id and q.provider_id = v_conv.provider_id
      )
    ) into v_quote
    from public.quote_requests r where r.id = v_conv.quote_request_id;
  end if;

  v_out := jsonb_build_object(
    'role', v_role,
    'status', v_conv.service_status,
    'car', coalesce(v_conv.context ->> 'car', ''),
    'quote', v_quote,
    'listing', case when v_listing.id is null then null else jsonb_build_object(
      'id', v_listing.id,
      'slug', v_listing.slug,
      'approved', v_listing.moderation_status = 'approved',
      'title', v_listing.data ->> 'title',
      'category', v_listing.data ->> 'category',
      'photo', v_listing.data -> 'photos' ->> 0,
      'price', v_listing.data ->> 'price',
      'providerName', v_listing.data ->> 'providerName',
      'city', v_listing.data ->> 'city',
      'state', v_listing.data ->> 'state',
      'serviceMode', v_listing.data ->> 'serviceMode',
      -- Telefone só o que o prestador publicou no anúncio aprovado, e só
      -- para o cliente (decisão 5).
      'whatsapp', case when v_role = 'customer' and v_listing.moderation_status = 'approved'
                       then nullif(v_listing.data ->> 'whatsapp', '') end,
      'whatsappCountry', case when v_role = 'customer' and v_listing.moderation_status = 'approved'
                              then v_listing.data ->> 'whatsappCountry' end
    ) end
  );
  return v_out;
end;
$$;
revoke execute on function public.service_conversation_context(text) from public, anon;
grant execute on function public.service_conversation_context(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Resposta de orçamento cai no fio (decisão 2)
-- ---------------------------------------------------------------------------

create or replace function public.reply_quote_request(p_request uuid, p_reply jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limits jsonb := public.quote_limits();
  v_req public.quote_requests;
  v_listing text;
  v_listing_row public.service_listings;
  v_min numeric;
  v_max numeric;
  v_id uuid;
  v_conv text;
  v_ids uuid[];
  v_message text;
  v_prev_unread integer;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select * into v_req from public.quote_requests where id = p_request for update;
  -- Pedido alheio fora do alcance, de quem tem bloqueio comigo ou de conta
  -- suspensa: "não encontrado", como se não existisse.
  if not found
     or v_req.customer_id = v_uid
     or public.is_blocked_between(v_uid, v_req.customer_id)
     or public.is_account_suspended(v_req.customer_id) then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  v_listing := public.quote_provider_listing(v_uid, v_req.category, v_req.country, v_req.state, v_req.city);
  if v_listing is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if public.quote_status(v_req.status, v_req.expires_at) <> 'open' then
    raise exception 'request-closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.quote_replies where request_id = p_request and provider_id = v_uid) then
    raise exception 'already-replied' using errcode = 'P0001';
  end if;
  -- Gancho do plano Pro: limite mensal de respostas. Nulo = sem limite (hoje).
  if (v_limits ->> 'providerRepliesPerMonth') is not null
     and (select count(*) from public.quote_replies
          where provider_id = v_uid and created_at > now() - interval '30 days')
         >= (v_limits ->> 'providerRepliesPerMonth')::integer then
    raise exception 'reply-limit' using errcode = 'P0001';
  end if;

  begin
    v_min := round((p_reply ->> 'priceMin')::numeric, 2);
    v_max := round(nullif(p_reply ->> 'priceMax', '')::numeric, 2);
  exception when others then
    raise exception 'invalid-price' using errcode = 'P0001';
  end;
  if v_min is null or v_min < 0 or (v_max is not null and v_max < v_min) then
    raise exception 'invalid-price' using errcode = 'P0001';
  end if;
  if v_max = v_min then
    v_max := null;
  end if;
  v_message := left(btrim(coalesce(p_reply ->> 'message', '')), 1000);

  insert into public.quote_replies (request_id, provider_id, listing_id, price_min, price_max, currency, estimated_time, message, created_at)
  values (
    p_request, v_uid, v_listing, v_min, v_max,
    case when upper(coalesce(p_reply ->> 'currency', '')) ~ '^[A-Z]{3}$' then upper(p_reply ->> 'currency') else 'BRL' end,
    left(btrim(coalesce(p_reply ->> 'estimatedTime', '')), 80),
    v_message,
    now()
  )
  returning id into v_id;

  -- O fio do anúncio com o cliente (mesmo id que o cliente abriria).
  select * into v_listing_row from public.service_listings where id = v_listing;
  v_conv := 'svc__' || v_listing || '__' || v_req.customer_id::text;
  v_ids := case when v_uid::text < v_req.customer_id::text
                then array[v_uid, v_req.customer_id] else array[v_req.customer_id, v_uid] end;
  insert into public.conversations (
    id, member_ids, members, unread, kind, listing_id, customer_id, provider_id,
    quote_request_id, service_status, context, started_by, opened_at
  ) values (
    v_conv, v_ids,
    jsonb_build_object(
      v_uid::text, public.chat_member_card(v_uid),
      v_req.customer_id::text, public.chat_member_card(v_req.customer_id)
    ),
    jsonb_build_object(v_uid::text, 0, v_req.customer_id::text, 0),
    'service', v_listing, v_req.customer_id, v_uid,
    p_request, 'replied',
    jsonb_build_object(
      'listingTitle', left(coalesce(v_listing_row.data ->> 'title', ''), 120),
      'listingPhoto', left(coalesce(v_listing_row.data -> 'photos' ->> 0, ''), 500),
      'category', left(coalesce(v_listing_row.data ->> 'category', ''), 60)
    ) || case when v_req.car_label <> '' then jsonb_build_object('car', v_req.car_label) else '{}'::jsonb end,
    v_uid, now()
  )
  on conflict (id) do update set
    quote_request_id = p_request,
    members = public.conversations.members || jsonb_build_object(v_uid::text, public.chat_member_card(v_uid));

  select coalesce((unread ->> v_req.customer_id::text)::integer, 0) into v_prev_unread
    from public.conversations where id = v_conv;

  insert into public.messages (conversation_id, sender_id, text, type, data)
  values (v_conv, v_uid, v_message, 'quote', jsonb_build_object('quote', jsonb_build_object(
    'requestId', p_request, 'replyId', v_id, 'priceMin', v_min, 'priceMax', v_max,
    'currency', case when upper(coalesce(p_reply ->> 'currency', '')) ~ '^[A-Z]{3}$' then upper(p_reply ->> 'currency') else 'BRL' end,
    'estimatedTime', left(btrim(coalesce(p_reply ->> 'estimatedTime', '')), 80)
  )));

  update public.conversations set
    updated_at = now(),
    last_message = jsonb_build_object(
      'text', v_message, 'senderId', v_uid::text, 'type', 'quote',
      'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    unread = unread
      || jsonb_build_object(v_uid::text, 0)
      || jsonb_build_object(v_req.customer_id::text, v_prev_unread + 1),
    opened_at = coalesce(opened_at, now()),
    first_reply_at = case
      when first_reply_at is null and started_by is not null and started_by <> v_uid then now()
      else first_reply_at
    end,
    service_status = case when service_status = 'closed' then 'closed' else 'replied' end
  where id = v_conv;

  -- Um aviso só (o 'quote_reply'), levando para o fio.
  perform public.notify(v_req.customer_id, v_uid, 'quote_reply', jsonb_build_object(
    'requestId', p_request,
    'replyId', v_id,
    'serviceId', v_listing,
    'serviceTitle', left(coalesce(v_listing_row.data ->> 'title', ''), 120),
    'quoteCategory', v_req.category,
    'conversationId', v_conv,
    'targetPath', '/messages/' || v_conv
  ));
  return v_id;
end;
$$;
revoke execute on function public.reply_quote_request(uuid, jsonb) from public, anon;
grant execute on function public.reply_quote_request(uuid, jsonb) to authenticated;
