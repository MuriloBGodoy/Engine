-- Pedido de orçamento (Serviços).
--
-- O dono do carro descreve o que precisa (categoria, carro, descrição, fotos,
-- cidade, urgência) e os prestadores APROVADOS daquela categoria e região
-- recebem o pedido numa caixa "Pedidos na sua região". Cada um responde uma
-- vez com faixa de preço, prazo e mensagem; o cliente compara lado a lado,
-- abre conversa com quem quiser e fecha o pedido (escolhi / desisti).
--
-- Decisões:
--
--   1. Escrita só por função (`create_quote_request`, `reply_quote_request`,
--      `close_quote_request`). As tabelas não têm política de escrita: data,
--      status, validade e contadores são do banco, nunca do cliente.
--
--   2. Privacidade: o pedido é ANÔNIMO para o prestador até ele responder.
--      A caixa de entrada (`quote_inbox`) não devolve quem pediu; o id do
--      cliente (para abrir a conversa) só aparece depois da resposta. O
--      aviso 'quote_request' sai sem `actor_id` pelo mesmo motivo — o
--      `notify` gravaria o nome e o @ do cliente no sino do prestador. O
--      pedido nunca carrega telefone nem e-mail: a conversa é pelo DM do
--      Engine, ou o cliente chama o WhatsApp do anúncio, se preferir.
--
--   3. Região: mesmo país e estado, e
--        - mesma cidade (comparada sem acento/caixa), ou
--        - o prestador atende a domicílio no estado (serviceMode mobile/híbrido).
--      O sino só toca para quem é da MESMA cidade (no máximo 50 contas por
--      pedido); o móvel do resto do estado vê o pedido na caixa, sem aviso.
--      É o que segura o pedido de virar disparo em massa.
--
--   4. Anti-spam do cliente: no máximo 3 pedidos abertos e 5 por 24 h. Do
--      prestador: uma resposta por pedido (unique). Bloqueio vale nos dois
--      sentidos (o pedido some da caixa, a resposta é recusada e some da tela
--      do cliente). Conta suspensa não cria nem responde (`suspension_guard`)
--      e some para os outros. Pedido e resposta são denunciáveis
--      (reports.target_type 'quote_request' e 'quote_reply').
--
--   5. Validade: `expires_at` = criação + 7 dias, sem cron — pedido vencido é
--      lido como 'expired' e sai da caixa. Os números moram em
--      `quote_limits()`, que o app também lê: um limite do plano Pro (ex.:
--      respostas por mês do prestador) entra ali sem mudar o resto. Hoje é
--      tudo grátis — `providerRepliesPerMonth` nulo = sem limite.

-- ---------------------------------------------------------------------------
-- Sino: os dois tipos novos
-- ---------------------------------------------------------------------------

-- 'garage_reminder' entra na migração do Brian (20261029130000), que redefine
-- esta mesma lista incluindo os dois tipos daqui.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'follow', 'like', 'comment', 'rating', 'achievement', 'message',
  'service_approved', 'service_changes_requested', 'service_rejected', 'service_suspended',
  'quote_request', 'quote_reply'
));

-- ---------------------------------------------------------------------------
-- Os números
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
    'providerRepliesPerMonth', null
  );
$$;
grant execute on function public.quote_limits() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (char_length(category) between 1 and 60),
  car_label text not null default '' check (char_length(car_label) <= 120),
  description text not null check (char_length(description) between 20 and 1500),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  country text not null default 'BR' check (char_length(country) between 2 and 4),
  state text not null check (char_length(state) between 1 and 8),
  city text not null check (char_length(city) between 1 and 80),
  urgency text not null default 'week' check (urgency in ('today', 'week', 'flexible')),
  contact text not null default 'message' check (contact in ('message', 'whatsapp')),
  status text not null default 'open' check (status in ('open', 'chosen', 'gave_up')),
  chosen_reply_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz
);
create index quote_requests_customer on public.quote_requests (customer_id, created_at desc);
create index quote_requests_open on public.quote_requests (category, state, expires_at) where status = 'open';
alter table public.quote_requests enable row level security;
revoke insert, update, delete on public.quote_requests from anon, authenticated;
create policy "orcamentos: cliente ou moderacao le" on public.quote_requests
  for select to authenticated using (customer_id = (select auth.uid()) or public.is_service_admin());

create table public.quote_replies (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  provider_id uuid not null references auth.users (id) on delete cascade,
  listing_id text not null references public.service_listings (id) on delete cascade,
  price_min numeric(12, 2) not null check (price_min >= 0 and price_min <= 10000000),
  price_max numeric(12, 2) check (price_max is null or (price_max >= price_min and price_max <= 10000000)),
  currency text not null default 'BRL' check (char_length(currency) = 3),
  estimated_time text not null default '' check (char_length(estimated_time) <= 80),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (request_id, provider_id)
);
create index quote_replies_provider on public.quote_replies (provider_id, created_at desc);
alter table public.quote_replies enable row level security;
revoke insert, update, delete on public.quote_replies from anon, authenticated;
create policy "respostas: prestador, cliente ou moderacao le" on public.quote_replies
  for select to authenticated using (
    provider_id = (select auth.uid())
    or public.is_service_admin()
    or exists (
      select 1 from public.quote_requests r
      where r.id = request_id and r.customer_id = (select auth.uid())
    )
  );
create policy "suspensao: respostas somem" on public.quote_replies
  as restrictive for select using (public.account_visible(provider_id));

alter table public.quote_requests
  add constraint quote_requests_chosen_reply
  foreign key (chosen_reply_id) references public.quote_replies (id) on delete set null;

-- Conta suspensa não pede nem responde (mesmo trigger das outras tabelas).
create trigger suspension_guard before insert on public.quote_requests
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert on public.quote_replies
  for each row execute function public.suspension_guard();

-- ---------------------------------------------------------------------------
-- Quem vê o quê
-- ---------------------------------------------------------------------------

-- Status como o app mostra: aberto e vencido vira 'expired'.
create or replace function public.quote_status(p_status text, p_expires timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_status = 'open' and p_expires <= now() then 'expired' else p_status end;
$$;

-- Este anúncio atende este pedido? (categoria + região, decisão 3.)
-- Devolve 'city' (mesma cidade: recebe aviso), 'state' (atende a domicílio
-- no estado: só vê na caixa) ou null.
create or replace function public.quote_listing_reach(
  p_listing public.service_listings,
  p_category text,
  p_country text,
  p_state text,
  p_city text
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_listing.moderation_status <> 'approved'
      or coalesce(p_listing.data ->> 'category', '') <> p_category
      or upper(coalesce(nullif(btrim(p_listing.data ->> 'country'), ''), p_country)) <> p_country
      or upper(btrim(coalesce(p_listing.data ->> 'state', ''))) <> p_state
      then null
    when public.slugify_text(p_listing.data ->> 'city') = public.slugify_text(p_city)
      then 'city'
    when coalesce(nullif(p_listing.data ->> 'serviceMode', ''), 'hybrid') in ('mobile', 'hybrid')
      then 'state'
    else null
  end;
$$;
revoke execute on function public.quote_listing_reach(public.service_listings, text, text, text, text) from public, anon, authenticated;

-- O anúncio aprovado de p_provider que atende o pedido (o da mesma cidade
-- primeiro). Null = ele não está no alcance desse pedido.
create or replace function public.quote_provider_listing(
  p_provider uuid,
  p_category text,
  p_country text,
  p_state text,
  p_city text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select l.id
  from public.service_listings l
  where l.owner_id = p_provider
    and public.quote_listing_reach(l, p_category, p_country, p_state, p_city) is not null
  order by (public.quote_listing_reach(l, p_category, p_country, p_state, p_city) = 'city') desc,
           l.updated_at desc
  limit 1;
$$;
revoke execute on function public.quote_provider_listing(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cliente: criar e fechar
-- ---------------------------------------------------------------------------

create or replace function public.create_quote_request(p_request jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limits jsonb := public.quote_limits();
  v_req public.quote_requests;
  v_photos jsonb := '[]'::jsonb;
  v_photo text;
  v_prefix text;
  v_provider uuid;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  -- Dois pedidos no mesmo instante não furam o limite.
  perform pg_advisory_xact_lock(hashtext('quote_request:' || v_uid::text));

  if (select count(*) from public.quote_requests
      where customer_id = v_uid and status = 'open' and expires_at > now())
     >= (v_limits ->> 'maxOpenPerCustomer')::integer then
    raise exception 'too-many-open' using errcode = 'P0001';
  end if;
  if (select count(*) from public.quote_requests
      where customer_id = v_uid and created_at > now() - interval '24 hours')
     >= (v_limits ->> 'maxPerDayPerCustomer')::integer then
    raise exception 'rate-limited' using errcode = 'P0001';
  end if;

  -- Fotos: só URL do próprio Storage (pasta da pessoa), no máximo 4.
  -- Data URI e link externo ficam de fora: o primeiro incha a linha, o
  -- segundo é foto que ninguém limpou (EXIF) nem moderou.
  v_prefix := '/storage/v1/object/public/photos/users/' || v_uid::text || '/';
  if jsonb_typeof(p_request -> 'photos') = 'array' then
    for v_photo in select jsonb_array_elements_text(p_request -> 'photos') loop
      if v_photo ~ '^https://' and position(v_prefix in v_photo) > 0 and char_length(v_photo) <= 500 then
        v_photos := v_photos || to_jsonb(v_photo);
      else
        raise exception 'invalid-photo' using errcode = 'P0001';
      end if;
    end loop;
  end if;
  if jsonb_array_length(v_photos) > (v_limits ->> 'maxPhotos')::integer then
    raise exception 'too-many-photos' using errcode = 'P0001';
  end if;
  -- A lista de categorias é a do app (serviceListingDisplay.js); aqui só o
  -- formato do id. Fora disso nenhum anúncio casa e o pedido não chega a
  -- ninguém — melhor recusar do que deixar o cliente esperando.
  if coalesce(p_request ->> 'category', '') !~ '^[a-z0-9-]{1,60}$' then
    raise exception 'invalid-category' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_request ->> 'state', '')) = '' or btrim(coalesce(p_request ->> 'city', '')) = '' then
    raise exception 'invalid-place' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_request ->> 'description', ''))) < 20 then
    raise exception 'description-too-short' using errcode = 'P0001';
  end if;
  if coalesce(nullif(p_request ->> 'urgency', ''), 'week') not in ('today', 'week', 'flexible')
     or coalesce(nullif(p_request ->> 'contact', ''), 'message') not in ('message', 'whatsapp') then
    raise exception 'invalid-request' using errcode = 'P0001';
  end if;

  insert into public.quote_requests (
    customer_id, category, car_label, description, photos, country, state, city,
    urgency, contact, status, created_at, expires_at
  ) values (
    v_uid,
    left(btrim(coalesce(p_request ->> 'category', '')), 60),
    left(btrim(coalesce(p_request ->> 'carLabel', '')), 120),
    left(btrim(coalesce(p_request ->> 'description', '')), 1500),
    v_photos,
    upper(left(btrim(coalesce(nullif(p_request ->> 'country', ''), 'BR')), 4)),
    upper(left(btrim(coalesce(p_request ->> 'state', '')), 8)),
    left(btrim(coalesce(p_request ->> 'city', '')), 80),
    coalesce(nullif(p_request ->> 'urgency', ''), 'week'),
    coalesce(nullif(p_request ->> 'contact', ''), 'message'),
    'open',
    now(),
    now() + make_interval(days => (v_limits ->> 'ttlDays')::integer)
  )
  returning * into v_req;

  -- Sino de quem é da mesma cidade. Sem actor (decisão 2): o bloqueio é
  -- conferido aqui, porque o notify só confere quando há actor.
  for v_provider in
    select distinct l.owner_id
    from public.service_listings l
    where public.quote_listing_reach(l, v_req.category, v_req.country, v_req.state, v_req.city) = 'city'
      and l.owner_id <> v_uid
      and not public.is_blocked_between(l.owner_id, v_uid)
      and not public.is_account_suspended(l.owner_id)
    limit (v_limits ->> 'maxNotifiedProviders')::integer
  loop
    perform public.notify(v_provider, null, 'quote_request', jsonb_build_object(
      'actorName', '',
      'requestId', v_req.id,
      'quoteCategory', v_req.category,
      'quoteCity', v_req.city,
      'targetPath', '/services/orcamentos?tab=inbox&req=' || v_req.id::text
    ));
  end loop;

  return v_req.id;
end;
$$;
revoke execute on function public.create_quote_request(jsonb) from public, anon;
grant execute on function public.create_quote_request(jsonb) to authenticated;

create or replace function public.close_quote_request(p_request uuid, p_outcome text, p_reply uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.quote_requests;
begin
  select * into v_req from public.quote_requests where id = p_request for update;
  if not found or v_req.customer_id is distinct from v_uid then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'open' then
    raise exception 'already-closed' using errcode = 'P0001';
  end if;
  if p_outcome = 'chosen' then
    if p_reply is null or not exists (
      select 1 from public.quote_replies where id = p_reply and request_id = p_request
    ) then
      raise exception 'invalid-reply' using errcode = 'P0001';
    end if;
  elsif p_outcome is distinct from 'gave_up' then
    raise exception 'invalid-outcome' using errcode = 'P0001';
  end if;
  update public.quote_requests set
    status = p_outcome,
    chosen_reply_id = case when p_outcome = 'chosen' then p_reply end,
    closed_at = now()
  where id = p_request;
end;
$$;
revoke execute on function public.close_quote_request(uuid, text, uuid) from public, anon;
grant execute on function public.close_quote_request(uuid, text, uuid) to authenticated;

-- Meus pedidos, com as respostas e o cartão de cada prestador. Resposta de
-- quem está bloqueado (em qualquer sentido) ou suspenso não aparece.
create or replace function public.my_quote_requests()
returns table (
  id uuid,
  category text,
  car_label text,
  description text,
  photos jsonb,
  country text,
  state text,
  city text,
  urgency text,
  contact text,
  status text,
  chosen_reply_id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  closed_at timestamptz,
  replies jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.category, r.car_label, r.description, r.photos, r.country, r.state, r.city,
         r.urgency, r.contact, public.quote_status(r.status, r.expires_at), r.chosen_reply_id,
         r.created_at, r.expires_at, r.closed_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'id', q.id,
             'providerId', q.provider_id,
             'listingId', q.listing_id,
             'priceMin', q.price_min,
             'priceMax', q.price_max,
             'currency', q.currency,
             'estimatedTime', q.estimated_time,
             'message', q.message,
             'createdAt', q.created_at,
             'listing', jsonb_build_object(
               'id', l.id,
               'slug', l.slug,
               'title', l.data ->> 'title',
               'providerName', l.data ->> 'providerName',
               'photo', l.data -> 'photos' ->> 0,
               'city', l.data ->> 'city',
               'state', l.data ->> 'state',
               'serviceMode', l.data ->> 'serviceMode',
               -- O WhatsApp do anúncio já é público; só vai junto quando o
               -- cliente pediu para ser por lá.
               'whatsapp', case when r.contact = 'whatsapp' then l.data ->> 'whatsapp' end,
               'whatsappCountry', case when r.contact = 'whatsapp' then l.data ->> 'whatsappCountry' end,
               'ratingAvg', l.rating_avg,
               'ratingCount', l.rating_count
             ),
             'provider', jsonb_build_object(
               'author', p.author,
               'username', p.username,
               'avatar', p.data ->> 'avatar'
             )
           ) order by q.price_min, q.created_at)
           from public.quote_replies q
           join public.service_listings l on l.id = q.listing_id
           left join public.public_profiles p on p.user_id = q.provider_id
           where q.request_id = r.id
             and not public.is_blocked_between(r.customer_id, q.provider_id)
             and not public.is_account_suspended(q.provider_id)
         ), '[]'::jsonb)
  from public.quote_requests r
  where r.customer_id = auth.uid()
  order by r.created_at desc
  limit 50;
$$;
revoke execute on function public.my_quote_requests() from public, anon;
grant execute on function public.my_quote_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- Prestador: caixa de entrada e resposta
-- ---------------------------------------------------------------------------

-- Pedidos abertos no alcance dos meus anúncios aprovados, e os que eu já
-- respondi (30 dias, com o desfecho). Sem o id do cliente até eu responder.
create or replace function public.quote_inbox()
returns table (
  id uuid,
  category text,
  car_label text,
  description text,
  photos jsonb,
  country text,
  state text,
  city text,
  urgency text,
  contact text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  reach text,
  listing_id text,
  reply_count integer,
  my_reply jsonb,
  chosen_me boolean,
  customer_id uuid,
  customer jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or public.is_account_suspended(v_uid) then
    return;
  end if;
  return query
  with candidates as (
    select r.id as rid, r.customer_id as rcustomer, r.category as rcategory, r.car_label as rcar,
           r.description as rdescription, r.photos as rphotos, r.country as rcountry, r.state as rstate,
           r.city as rcity, r.urgency as rurgency, r.contact as rcontact, r.status as rstatus,
           r.chosen_reply_id as rchosen, r.created_at as rcreated, r.expires_at as rexpires,
           public.quote_provider_listing(v_uid, r.category, r.country, r.state, r.city) as match_listing,
           q.id as reply_id, q.listing_id as reply_listing, q.price_min as qmin, q.price_max as qmax,
           q.currency as qcurrency, q.estimated_time as qtime, q.message as qmessage, q.created_at as qcreated
    from public.quote_requests r
    left join public.quote_replies q on q.request_id = r.id and q.provider_id = v_uid
    where r.customer_id <> v_uid
      and (
        q.id is not null
        or r.category in (
          select l.data ->> 'category' from public.service_listings l
          where l.owner_id = v_uid and l.moderation_status = 'approved'
        )
      )
      and (
        (r.status = 'open' and r.expires_at > now())
        or (q.id is not null and r.created_at > now() - interval '30 days')
      )
  )
  select c.rid, c.rcategory, c.rcar, c.rdescription, c.rphotos, c.rcountry, c.rstate, c.rcity,
         c.rurgency, c.rcontact, public.quote_status(c.rstatus, c.rexpires),
         c.rcreated, c.rexpires,
         case
           when c.reply_id is not null then 'replied'
           when exists (
             select 1 from public.service_listings m
             where m.id = c.match_listing
               and public.quote_listing_reach(m, c.rcategory, c.rcountry, c.rstate, c.rcity) = 'city'
           ) then 'city'
           else 'state'
         end,
         coalesce(c.reply_listing, c.match_listing),
         (select count(*)::integer from public.quote_replies x where x.request_id = c.rid),
         case when c.reply_id is null then null else jsonb_build_object(
           'id', c.reply_id, 'listingId', c.reply_listing, 'priceMin', c.qmin, 'priceMax', c.qmax,
           'currency', c.qcurrency, 'estimatedTime', c.qtime, 'message', c.qmessage,
           'createdAt', c.qcreated
         ) end,
         c.reply_id is not null and c.rchosen is not distinct from c.reply_id,
         case when c.reply_id is not null then c.rcustomer end,
         case when c.reply_id is not null then (
           select jsonb_build_object('author', p.author, 'username', p.username, 'avatar', p.data ->> 'avatar')
           from public.public_profiles p where p.user_id = c.rcustomer
         ) end
  from candidates c
  where (c.reply_id is not null or c.match_listing is not null)
    and not public.is_blocked_between(v_uid, c.rcustomer)
    and not public.is_account_suspended(c.rcustomer)
  order by (c.reply_id is null) desc, c.rcreated desc
  limit 100;
end;
$$;
revoke execute on function public.quote_inbox() from public, anon;
grant execute on function public.quote_inbox() to authenticated;

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
  v_listing_title text;
  v_min numeric;
  v_max numeric;
  v_id uuid;
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

  insert into public.quote_replies (request_id, provider_id, listing_id, price_min, price_max, currency, estimated_time, message, created_at)
  values (
    p_request, v_uid, v_listing, v_min, v_max,
    case when upper(coalesce(p_reply ->> 'currency', '')) ~ '^[A-Z]{3}$' then upper(p_reply ->> 'currency') else 'BRL' end,
    left(btrim(coalesce(p_reply ->> 'estimatedTime', '')), 80),
    left(btrim(coalesce(p_reply ->> 'message', '')), 1000),
    now()
  )
  returning id into v_id;

  select left(coalesce(data ->> 'title', ''), 120) into v_listing_title
    from public.service_listings where id = v_listing;
  perform public.notify(v_req.customer_id, v_uid, 'quote_reply', jsonb_build_object(
    'requestId', p_request,
    'replyId', v_id,
    'serviceId', v_listing,
    'serviceTitle', coalesce(v_listing_title, ''),
    'quoteCategory', v_req.category,
    'targetPath', '/services/orcamentos?req=' || p_request::text
  ));
  return v_id;
end;
$$;
revoke execute on function public.reply_quote_request(uuid, jsonb) from public, anon;
grant execute on function public.reply_quote_request(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Denúncia de pedido e de resposta
-- ---------------------------------------------------------------------------

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in (
  'goal', 'post', 'comment', 'profile', 'message', 'club', 'event',
  'service_listing', 'service_review', 'quote_request', 'quote_reply'
)) not valid;

-- Mesma função de 20261025164000_social_moderation.sql, com os dois ramos
-- novos no fim (o retrato do pedido e da resposta).
create or replace function public.reports_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_post text;
  v_comment text;
  v_row record;
  v_c jsonb;
begin
  if public.is_trusted_write() or public.is_service_admin() then
    return new;
  end if;
  new.status := 'pending';
  new.created_at := now();
  new.context := '{}'::jsonb;

  if new.target_type in ('goal', 'post') then
    select owner_id, kind, data into v_row from public.community_goals where id = new.target_id;
    if not found then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := v_row.owner_id::text;
    new.context := jsonb_build_object(
      'kind', v_row.kind,
      'author', left(coalesce(v_row.data ->> 'author', ''), 80),
      'username', left(coalesce(v_row.data ->> 'username', ''), 32),
      'title', left(coalesce(v_row.data ->> 'title', ''), 120),
      'text', left(coalesce(v_row.data ->> 'note', ''), 500),
      'image', left(coalesce(v_row.data ->> 'image', ''), 500)
    );

  elsif new.target_type = 'comment' then
    -- target_id = "<post>#<comentário>"
    v_post := split_part(new.target_id, '#', 1);
    v_comment := split_part(new.target_id, '#', 2);
    select c into v_c
      from public.community_goals g, jsonb_array_elements(g.comments) c
      where g.id = v_post and c ->> 'id' = v_comment;
    if v_c is null then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := coalesce(v_c ->> 'userId', '');
    new.context := jsonb_build_object(
      'postId', v_post,
      'commentId', v_comment,
      'author', left(coalesce(v_c ->> 'author', ''), 80),
      'username', left(coalesce(v_c ->> 'username', ''), 32),
      'text', left(coalesce(v_c ->> 'text', ''), 500)
    );

  elsif new.target_type = 'message' then
    select m.sender_id, m.conversation_id, m.text, m.type into v_row
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id::text = new.target_id and v_uid = any (c.member_ids);
    if not found or v_row.sender_id is not distinct from v_uid then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := coalesce(v_row.sender_id::text, '');
    new.context := jsonb_build_object(
      'conversationId', v_row.conversation_id,
      'type', v_row.type,
      'text', left(coalesce(v_row.text, ''), 500)
    );

  elsif new.target_type = 'profile' then
    select author, username, data into v_row from public.public_profiles where user_id::text = new.target_id;
    new.reported_user_id := new.target_id;
    new.context := jsonb_build_object(
      'author', left(coalesce(v_row.author, ''), 80),
      'username', left(coalesce(v_row.username, ''), 32),
      'text', left(coalesce(v_row.data ->> 'note', ''), 500),
      'image', left(coalesce(v_row.data ->> 'avatar', ''), 500)
    );

  elsif new.target_type = 'club' then
    select founder_id, tag, data into v_row from public.clubs where id = new.target_id;
    if not found then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := coalesce(v_row.founder_id::text, '');
    new.context := jsonb_build_object(
      'tag', v_row.tag,
      'title', left(coalesce(v_row.data ->> 'name', ''), 120),
      'text', left(coalesce(v_row.data ->> 'description', ''), 500)
    );

  elsif new.target_type = 'event' then
    select created_by, data into v_row from public.events where id = new.target_id;
    if not found then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := v_row.created_by::text;
    new.context := jsonb_build_object(
      'title', left(coalesce(v_row.data ->> 'title', ''), 120),
      'text', left(coalesce(v_row.data ->> 'description', ''), 500)
    );

  -- Pedido de orçamento: denuncia quem pediu ou um prestador que o vê na
  -- caixa (anúncio aprovado no alcance). Ninguém mais sabe que ele existe.
  elsif new.target_type = 'quote_request' then
    select r.customer_id, r.category, r.car_label, r.description, r.photos, r.country, r.state, r.city
      into v_row
      from public.quote_requests r
      where r.id::text = new.target_id;
    if not found or (
      v_row.customer_id is distinct from v_uid
      and public.quote_provider_listing(v_uid, v_row.category, v_row.country, v_row.state, v_row.city) is null
    ) then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := v_row.customer_id::text;
    new.context := jsonb_build_object(
      'title', left(v_row.category || coalesce(' · ' || nullif(v_row.car_label, ''), ''), 120),
      'text', left(coalesce(v_row.description, ''), 500),
      'image', left(coalesce(v_row.photos ->> 0, ''), 500)
    );

  -- Resposta a orçamento: só o cliente do pedido denuncia (é o único que a vê).
  elsif new.target_type = 'quote_reply' then
    select q.provider_id, q.message, q.price_min, q.price_max, l.data ->> 'title' as listing_title
      into v_row
      from public.quote_replies q
      join public.quote_requests r on r.id = q.request_id
      left join public.service_listings l on l.id = q.listing_id
      where q.id::text = new.target_id and r.customer_id = v_uid;
    if not found then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := v_row.provider_id::text;
    new.context := jsonb_build_object(
      'title', left(coalesce(v_row.listing_title, ''), 120),
      'text', left(
        v_row.price_min::text || coalesce(' – ' || v_row.price_max::text, '') || E'
' || coalesce(v_row.message, ''),
        500
      )
    );
  end if;
  return new;
end;
$$;

-- Mesma função de 20261025164000_social_moderation.sql, apagando pedido e
-- resposta denunciados.
create or replace function public.moderation_remove(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  if not public.is_service_admin() then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  select * into v_report from public.reports where id = p_report_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  perform public.trust_this_transaction();
  if v_report.target_type in ('goal', 'post') then
    delete from public.community_goals where id = v_report.target_id;
  elsif v_report.target_type = 'comment' then
    update public.community_goals g set
      comments = (
        select coalesce(jsonb_agg(c order by ord), '[]'::jsonb)
        from jsonb_array_elements(g.comments) with ordinality as t(c, ord)
        where c ->> 'id' is distinct from split_part(v_report.target_id, '#', 2)
      )
    where g.id = split_part(v_report.target_id, '#', 1);
  elsif v_report.target_type = 'message' then
    delete from public.messages where id::text = v_report.target_id;
  elsif v_report.target_type = 'event' then
    delete from public.events where id = v_report.target_id;
  elsif v_report.target_type = 'club' then
    update public.clubs set archived = true, updated_at = now() where id = v_report.target_id;
  elsif v_report.target_type = 'profile' then
    -- Perfil não se apaga: limpa bio, retrato e capa públicos.
    update public.public_profiles
      set data = data || jsonb_build_object('note', '', 'avatar', '', 'banner', '')
      where user_id::text = v_report.target_id;
  elsif v_report.target_type = 'quote_request' then
    delete from public.quote_requests where id::text = v_report.target_id;
  elsif v_report.target_type = 'quote_reply' then
    delete from public.quote_replies where id::text = v_report.target_id;
  else
    raise exception 'unsupported-target' using errcode = 'P0001';
  end if;

  update public.reports set status = 'resolved'
    where target_type = v_report.target_type and target_id = v_report.target_id and status = 'pending';
end;
$$;
