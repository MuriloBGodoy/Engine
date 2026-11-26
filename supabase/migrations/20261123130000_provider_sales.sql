-- "Quanto eu vendi com o Engine?" — o caderninho do prestador.
--
-- É a pergunta que paga a conta. O modelo de receita do Engine é a assinatura
-- de quem presta serviço (ROADMAP.md), e ninguém renova uma assinatura sem
-- saber o que ela trouxe. O app já contava APARIÇÃO, ABERTURA e CONTATO por
-- anúncio (20261024120000) — o caminho até o cliente. O que faltava era o fim
-- do caminho: o dinheiro.
--
-- A honestidade manda aqui, e ela custa uma decisão de arquitetura:
--
--   O Engine NÃO processa o pagamento do serviço. Não existe, dentro deste
--   banco, nenhum número que signifique "esta oficina faturou R$ 4.200". Se
--   o painel inventasse esse número a partir de orçamento enviado, estaria
--   mentindo para o cliente que mais confia nele — e a primeira vez que o
--   dono conferisse com o caixa dele, perdia o app.
--
-- Então o painel tem DUAS metades, e elas nunca se misturam na tela:
--
--   1. **O que o Engine mediu.** Aparições, aberturas, contatos, orçamentos
--      respondidos e orçamentos GANHOS (o cliente escolheu esta resposta).
--      Isso o banco sabe sozinho — é a função `provider_results` aqui
--      embaixo, que não escreve nada.
--
--   2. **O que você registrou.** `provider_sales`: uma linha por venda
--      fechada, com o valor que foi cobrado de verdade. Quem escreve é o
--      prestador. Começa pelo atalho do orçamento ganho (o valor já vem
--      preenchido), e aceita a venda que entrou por fora — quem viu o
--      anúncio e ligou.
--
-- Privacidade: venda é dado de caixa. Lê e escreve quem é DONO ou ADMIN do
-- perfil profissional — nem editor da equipe, nem moderação do Engine. É por
-- isso que não há política para `is_service_admin()` aqui: a moderação existe
-- para tirar anúncio irregular do ar, não para olhar o faturamento de
-- ninguém.

-- ---------------------------------------------------------------------------
-- 1. O caderno de vendas
-- ---------------------------------------------------------------------------

create table if not exists public.provider_sales (
  id uuid primary key default gen_random_uuid(),
  -- Da EMPRESA (perfil profissional), não da pessoa: numa página com equipe,
  -- quem registrou a venda muda e o caixa é o mesmo.
  profile_id uuid not null references public.pro_profiles (id) on delete cascade,
  -- Quem registrou, para a linha ter autor.
  registered_by uuid not null references auth.users (id) on delete cascade,
  -- De onde veio, quando veio de algum lugar que o Engine conhece.
  listing_id text references public.service_listings (id) on delete set null,
  quote_request_id uuid references public.quote_requests (id) on delete set null,
  amount numeric(12, 2) not null check (amount >= 0 and amount <= 10000000),
  currency text not null default 'BRL' check (char_length(currency) = 3),
  -- O dia é o do prestador brasileiro (São Paulo), como nas métricas diárias.
  sold_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  label text not null default '' check (char_length(label) <= 120),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_sales_profile
  on public.provider_sales (profile_id, sold_on desc);
-- Orçamento ganho vira UMA venda: o atalho "registrar venda" não duplica
-- linha se alguém tocar duas vezes.
create unique index if not exists provider_sales_quote
  on public.provider_sales (quote_request_id)
  where quote_request_id is not null;

alter table public.provider_sales enable row level security;

drop policy if exists "vendas: dono ou admin le" on public.provider_sales;
create policy "vendas: dono ou admin le" on public.provider_sales
  for select to authenticated
  using (public.is_pro_member(profile_id, array['owner', 'admin']));

drop policy if exists "vendas: dono ou admin registra" on public.provider_sales;
create policy "vendas: dono ou admin registra" on public.provider_sales
  for insert to authenticated
  with check (
    registered_by = (select auth.uid())
    and public.is_pro_member(profile_id, array['owner', 'admin'])
  );

drop policy if exists "vendas: dono ou admin corrige" on public.provider_sales;
create policy "vendas: dono ou admin corrige" on public.provider_sales
  for update to authenticated
  using (public.is_pro_member(profile_id, array['owner', 'admin']))
  with check (public.is_pro_member(profile_id, array['owner', 'admin']));

drop policy if exists "vendas: dono ou admin apaga" on public.provider_sales;
create policy "vendas: dono ou admin apaga" on public.provider_sales
  for delete to authenticated
  using (public.is_pro_member(profile_id, array['owner', 'admin']));

/** Data de criação e autor são do servidor, não do navegador. */
create or replace function public.provider_sales_guard()
returns trigger
language plpgsql
set search_path = ''
as $func$
begin
  if tg_op = 'INSERT' then
    new.registered_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  new.id := old.id;
  new.profile_id := old.profile_id;
  new.registered_by := old.registered_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$func$;
drop trigger if exists provider_sales_guard on public.provider_sales;
create trigger provider_sales_guard before insert or update on public.provider_sales
  for each row execute function public.provider_sales_guard();

-- ---------------------------------------------------------------------------
-- 2. O que o Engine mediu
-- ---------------------------------------------------------------------------

/**
 * Resultados do perfil profissional num período.
 *
 * Uma função só porque a tela faz UMA pergunta ("como foi o mês?") e a
 * resposta mora em quatro tabelas. Cada metade vem rotulada: `measured` é o
 * que o Engine contou; `sales` é o que o prestador registrou.
 *
 * Só para quem é dono ou admin do perfil. Não escreve nada.
 */
create or replace function public.provider_results(
  p_profile uuid,
  p_from date,
  p_to date default (now() at time zone 'America/Sao_Paulo')::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $func$
declare
  v_uid uuid := auth.uid();
  v_listings text[];
  v_measured jsonb;
  v_quotes jsonb;
  v_sales jsonb;
  v_months jsonb;
  v_pending jsonb;
begin
  if v_uid is null or not public.is_pro_member(p_profile, array['owner', 'admin']) then
    raise exception 'not-allowed' using errcode = '42501';
  end if;

  select coalesce(array_agg(id), '{}') into v_listings
    from public.service_listings where profile_id = p_profile;

  -- Aparição, abertura e contato, somados no período.
  select jsonb_build_object(
    'listings', coalesce(array_length(v_listings, 1), 0),
    'views', coalesce(sum(d.count) filter (where d.metric = 'view'), 0),
    'details', coalesce(sum(d.count) filter (where d.metric = 'detail'), 0),
    'contacts', coalesce(sum(d.count) filter (where d.metric = 'whatsapp'), 0)
  ) into v_measured
  from public.service_listing_metrics_daily d
  where d.listing_id = any (v_listings) and d.day between p_from and p_to;

  -- Orçamentos: respondidos, ganhos (o cliente escolheu esta resposta),
  -- perdidos (escolheu outra) e ainda abertos. O período conta pela data da
  -- RESPOSTA — é o trabalho do prestador que está sendo medido.
  select jsonb_build_object(
    'replied', count(*),
    'won', count(*) filter (where m.ganhei),
    'lost', count(*) filter (where m.status = 'chosen' and not m.ganhei),
    'open', count(*) filter (where m.status = 'open' and m.expires_at > now()),
    'wonMin', coalesce(sum(m.price_min) filter (where m.ganhei), 0),
    'wonMax', coalesce(sum(coalesce(m.price_max, m.price_min)) filter (where m.ganhei), 0)
  ) into v_quotes
  from (
    select q.price_min, q.price_max,
           r.status, r.expires_at,
           (r.status = 'chosen' and r.chosen_reply_id = q.id) as ganhei
    from public.quote_replies q
    join public.quote_requests r on r.id = q.request_id
    join public.service_listings l on l.id = q.listing_id
    where l.profile_id = p_profile
      and (q.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ) as m;

  -- O que foi registrado.
  select jsonb_build_object(
    'count', count(*),
    'total', coalesce(sum(amount), 0),
    'average', coalesce(round(avg(amount), 2), 0)
  ) into v_sales
  from public.provider_sales
  where profile_id = p_profile and sold_on between p_from and p_to;

  -- Mês a mês, para o gráfico. Mês sem venda aparece zerado: buraco na linha
  -- do tempo faz um mês fraco parecer inexistente.
  select coalesce(jsonb_agg(linha order by linha ->> 'month'), '[]'::jsonb) into v_months
  from (
    select jsonb_build_object(
      'month', to_char(m.mes, 'YYYY-MM'),
      'total', coalesce((
        select sum(s.amount) from public.provider_sales s
        where s.profile_id = p_profile
          and date_trunc('month', s.sold_on) = m.mes
      ), 0),
      'count', coalesce((
        select count(*) from public.provider_sales s
        where s.profile_id = p_profile
          and date_trunc('month', s.sold_on) = m.mes
      ), 0),
      'contacts', coalesce((
        select sum(d.count) from public.service_listing_metrics_daily d
        where d.listing_id = any (v_listings)
          and d.metric = 'whatsapp'
          and date_trunc('month', d.day) = m.mes
      ), 0)
    ) as linha
    from generate_series(
      date_trunc('month', p_from::timestamp),
      date_trunc('month', p_to::timestamp),
      interval '1 month'
    ) as m(mes)
  ) as meses;

  -- Orçamentos ganhos que ainda não viraram linha no caderno: é daqui que
  -- sai o atalho "registrar venda", com o valor já preenchido.
  select coalesce(jsonb_agg(linha order by linha ->> 'closedAt' desc), '[]'::jsonb) into v_pending
  from (
    select jsonb_build_object(
      'requestId', r.id,
      'category', r.category,
      'carLabel', r.car_label,
      'listingId', q.listing_id,
      'priceMin', q.price_min,
      'priceMax', q.price_max,
      'currency', q.currency,
      'closedAt', r.closed_at
    ) as linha
    from public.quote_replies q
    join public.quote_requests r on r.id = q.request_id
    join public.service_listings l on l.id = q.listing_id
    where l.profile_id = p_profile
      and r.status = 'chosen'
      and r.chosen_reply_id = q.id
      and not exists (
        select 1 from public.provider_sales s where s.quote_request_id = r.id
      )
    limit 20
  ) as ganhos;

  return jsonb_build_object(
    'profileId', p_profile,
    'from', p_from,
    'to', p_to,
    'measured', coalesce(v_measured, '{}'::jsonb) || coalesce(v_quotes, '{}'::jsonb),
    'sales', coalesce(v_sales, '{}'::jsonb),
    'months', coalesce(v_months, '[]'::jsonb),
    'wonPending', coalesce(v_pending, '[]'::jsonb)
  );
end;
$func$;

revoke execute on function public.provider_results(uuid, date, date) from public, anon;
grant execute on function public.provider_results(uuid, date, date) to authenticated;
