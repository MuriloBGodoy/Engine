-- Métricas do anúncio por dia.
--
-- `service_listings` guarda só o total desde a criação (view_count, ...), que
-- não responde a pergunta do prestador no mês 2: "quantos clientes vieram
-- daqui ESTE mês?". Esta tabela guarda o mesmo evento por dia e por origem,
-- e começa a juntar histórico desde já, antes de o plano Pro existir, para que
-- o painel mês a mês nasça com dados.
--
-- Uma linha por (anúncio, dia, métrica, origem); a contagem sobe por upsert.

create table public.service_listing_metrics_daily (
  listing_id text not null references public.service_listings (id) on delete cascade,
  day date not null,
  metric text not null check (metric in ('view', 'detail', 'whatsapp')),
  source text not null default 'direct'
    check (source in ('search', 'profile', 'link', 'community', 'direct')),
  count integer not null default 0,
  primary key (listing_id, day, metric, source)
);
create index service_listing_metrics_daily_day
  on public.service_listing_metrics_daily (listing_id, day desc);
alter table public.service_listing_metrics_daily enable row level security;
-- Só o dono do anúncio (e a moderação) lê. Ninguém escreve direto: a escrita
-- passa pela função abaixo, que roda como definer.
create policy "metricas diarias: dono ou moderacao le" on public.service_listing_metrics_daily
  for select using (
    public.is_service_admin()
    or exists (
      select 1 from public.service_listings l
      where l.id = listing_id and l.owner_id = (select auth.uid())
    )
  );

-- A mesma assinatura antiga continua valendo (clientes em cache mandam só
-- dois argumentos); a origem é opcional. O dia é o de São Paulo, porque é o
-- "hoje" do prestador brasileiro, não o UTC.
drop function if exists public.track_listing_metric(text, text);
create or replace function public.track_listing_metric(
  p_listing_id text,
  p_metric text,
  p_source text default 'direct'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := case
    when p_source in ('search', 'profile', 'link', 'community', 'direct') then p_source
    else 'direct'
  end;
begin
  if p_metric not in ('view', 'detail', 'whatsapp') then
    return;
  end if;

  perform public.trust_this_transaction();
  update public.service_listings set
    view_count = view_count + (p_metric = 'view')::integer,
    detail_count = detail_count + (p_metric = 'detail')::integer,
    whatsapp_count = whatsapp_count + (p_metric = 'whatsapp')::integer
  where id = p_listing_id and moderation_status = 'approved';

  -- Anúncio inexistente ou não aprovado: não conta em lugar nenhum.
  if not found then
    return;
  end if;

  insert into public.service_listing_metrics_daily (listing_id, day, metric, source, count)
  values (p_listing_id, (now() at time zone 'America/Sao_Paulo')::date, p_metric, v_source, 1)
  on conflict (listing_id, day, metric, source)
  do update set count = public.service_listing_metrics_daily.count + 1;
end;
$$;
grant execute on function public.track_listing_metric(text, text, text) to anon, authenticated;
