-- Avaliações de serviço (nota de 1 a 5 + comentário) nos anúncios da aba
-- Serviços.
--
-- O que o banco garante, e não a tela:
--   - uma avaliação por pessoa por anúncio (editável), só em anúncio aprovado;
--   - o dono do anúncio não avalia o próprio;
--   - conta com menos de 24 h não avalia, e ninguém abre mais de 5 avaliações
--     em 24 h (anti-fake simples: não impede quem quer fraudar com paciência,
--     mas tira a enxurrada de contas criadas na hora);
--   - o dono do anúncio responde uma vez (editável), mas NÃO apaga nem oculta
--     a avaliação. Ocultar é só da moderação (is_service_admin), por violação
--     das regras — nunca por pedido ou pagamento do prestador (supressão de
--     avaliação negativa é o que a regra 16 CFR 465 da FTC proíbe nos EUA, e
--     publicidade enganosa por omissão no CDC art. 37 §3º);
--   - média e contagem moram em `service_listings`, mantidas por trigger a
--     partir da tabela de verdade (recontagem, não ±1), então não derivam.
--
-- Denúncia de avaliação usa a tabela `reports` que já existe, com
-- target_type = 'service_review'. Denunciar não oculta nada sozinho: o
-- prestador poderia derrubar toda nota ruim denunciando.
--
-- Excluir a conta: a avaliação sai em cascata (author_id on delete cascade),
-- como os comentários nos posts alheios saem em `delete_my_account`. A média
-- do anúncio é recontada pelo trigger de agregado. Por isso
-- `delete_my_account` não precisa mudar.

-- ---------------------------------------------------------------------------
-- Agregado no anúncio
-- ---------------------------------------------------------------------------

alter table public.service_listings
  add column rating_count integer not null default 0,
  add column rating_sum integer not null default 0;
-- Média pronta para ordenar a lista; nula sem avaliação (não é zero estrela).
alter table public.service_listings
  add column rating_avg numeric(3, 2) generated always as (
    case when rating_count > 0 then round(rating_sum::numeric / rating_count, 2) end
  ) stored;

-- O guard do anúncio ganha as duas colunas novas: nem o dono nem a moderação
-- escrevem a nota à mão; só o trigger de agregado, com a bandeira de confiança.
create or replace function public.service_listings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_write() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.view_count := 0;
    new.detail_count := 0;
    new.whatsapp_count := 0;
    new.rating_count := 0;
    new.rating_sum := 0;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  -- Métrica e nota não são do dono nem da moderação: só sobem pelas funções
  -- de contagem.
  new.id := old.id;
  new.view_count := old.view_count;
  new.detail_count := old.detail_count;
  new.whatsapp_count := old.whatsapp_count;
  new.rating_count := old.rating_count;
  new.rating_sum := old.rating_sum;
  new.created_at := old.created_at;
  new.updated_at := now();
  if not public.is_service_admin() then
    new.owner_id := old.owner_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------

create table public.service_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.service_listings (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  owner_reply text check (owner_reply is null or char_length(owner_reply) between 1 and 1000),
  owner_reply_at timestamptz,
  -- 'reported' não existe de propósito: denúncia vai para `reports` e não
  -- muda o que o público vê até a moderação decidir.
  status text not null default 'published' check (status in ('published', 'hidden')),
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, author_id)
);
create index service_reviews_listing on public.service_reviews (listing_id, status, created_at desc);
create index service_reviews_author on public.service_reviews (author_id, created_at desc);
alter table public.service_reviews enable row level security;

-- Publicada é pública, inclusive para visitante (quem chega pelo link do
-- prestador ainda não tem conta). Quem escreveu continua vendo a sua mesmo
-- oculta, para saber o que aconteceu com ela.
create policy "avaliacoes: publicada, autor ou moderacao le" on public.service_reviews
  for select using (
    status = 'published'
    or author_id = (select auth.uid())
    or public.is_service_admin()
  );
create policy "avaliacoes: logado avalia por si" on public.service_reviews
  for insert to authenticated with check (author_id = (select auth.uid()));
-- Autor (nota e texto), dono do anúncio (resposta) e moderação (status). Qual
-- coluna cada um pode mudar quem decide é o guard abaixo.
create policy "avaliacoes: autor, dono do anuncio ou moderacao edita" on public.service_reviews
  for update to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.service_listings l
      where l.id = listing_id and l.owner_id = (select auth.uid())
    )
    or public.is_service_admin()
  )
  with check (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.service_listings l
      where l.id = listing_id and l.owner_id = (select auth.uid())
    )
    or public.is_service_admin()
  );
-- O dono do anúncio NÃO apaga: só o autor e a moderação.
create policy "avaliacoes: autor ou moderacao apaga" on public.service_reviews
  for delete to authenticated using (
    author_id = (select auth.uid()) or public.is_service_admin()
  );

-- ---------------------------------------------------------------------------
-- Guard: quem pode o quê
-- ---------------------------------------------------------------------------

-- `security definer` porque precisa ler `auth.users.created_at` (idade da
-- conta), que o papel `authenticated` não enxerga.
create or replace function public.service_reviews_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_account_created timestamptz;
begin
  if public.is_trusted_write() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_uid is null then
      raise exception 'not-signed-in' using errcode = '42501';
    end if;
    select owner_id, moderation_status into v_owner, v_status
    from public.service_listings where id = new.listing_id;
    if v_owner is null or v_status <> 'approved' then
      raise exception 'listing-unavailable' using errcode = '42501';
    end if;
    if v_owner = v_uid then
      raise exception 'own-listing' using errcode = '42501';
    end if;
    select created_at into v_account_created from auth.users where id = v_uid;
    if v_account_created is null or v_account_created > now() - interval '24 hours' then
      raise exception 'account-too-new' using errcode = '42501';
    end if;
    if (select count(*) from public.service_reviews
        where author_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
      raise exception 'rate-limited' using errcode = '42501';
    end if;
    new.author_id := v_uid;
    new.comment := btrim(coalesce(new.comment, ''));
    new.owner_reply := null;
    new.owner_reply_at := null;
    new.status := 'published';
    new.moderated_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE. O que não é de ninguém mudar:
  new.id := old.id;
  new.listing_id := old.listing_id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;

  select owner_id into v_owner from public.service_listings where id = old.listing_id;

  -- Nota e texto: só o autor.
  if v_uid is distinct from old.author_id then
    new.rating := old.rating;
    new.comment := old.comment;
  else
    new.comment := btrim(coalesce(new.comment, ''));
  end if;
  if new.rating is distinct from old.rating or new.comment is distinct from old.comment then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  -- Resposta: só o dono do anúncio. Texto vazio apaga a resposta.
  if v_uid is distinct from v_owner then
    new.owner_reply := old.owner_reply;
  else
    new.owner_reply := nullif(btrim(coalesce(new.owner_reply, '')), '');
  end if;
  if new.owner_reply is distinct from old.owner_reply then
    new.owner_reply_at := case when new.owner_reply is null then null else now() end;
  else
    new.owner_reply_at := old.owner_reply_at;
  end if;

  -- Ocultar/republicar: só a moderação.
  if not public.is_service_admin() then
    new.status := old.status;
  end if;
  if new.status is distinct from old.status then
    new.moderated_at := now();
  else
    new.moderated_at := old.moderated_at;
  end if;

  return new;
end;
$$;
create trigger service_reviews_guard before insert or update on public.service_reviews
  for each row execute function public.service_reviews_guard();

-- ---------------------------------------------------------------------------
-- Agregado: recontagem a cada mudança
-- ---------------------------------------------------------------------------

-- Reconta em vez de somar ±1: com o índice (listing_id, status) custa pouco e
-- nunca deriva. Liga a bandeira de confiança só para esta escrita (o guard do
-- anúncio trava rating_count/rating_sum) e devolve o valor anterior depois,
-- para não deixar o resto da transação confiável por tabela.
create or replace function public.service_reviews_aggregate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing text := coalesce(new.listing_id, old.listing_id);
  v_previous text := coalesce(current_setting('engine.trusted', true), '');
begin
  perform public.trust_this_transaction();
  update public.service_listings l set
    rating_count = s.n,
    rating_sum = s.total
  from (
    select count(*)::integer as n, coalesce(sum(rating), 0)::integer as total
    from public.service_reviews
    where listing_id = v_listing and status = 'published'
  ) s
  where l.id = v_listing
    and (l.rating_count, l.rating_sum) is distinct from (s.n, s.total);
  perform set_config('engine.trusted', v_previous, true);
  return null;
end;
$$;
create trigger service_reviews_aggregate after insert or update or delete on public.service_reviews
  for each row execute function public.service_reviews_aggregate();

-- ---------------------------------------------------------------------------
-- Distribuição por estrela (barras do resumo)
-- ---------------------------------------------------------------------------

-- Só publicadas, mesmo para o autor de uma oculta. Visitante também lê.
create or replace function public.service_review_distribution(p_listing_id text)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    '1', count(*) filter (where rating = 1),
    '2', count(*) filter (where rating = 2),
    '3', count(*) filter (where rating = 3),
    '4', count(*) filter (where rating = 4),
    '5', count(*) filter (where rating = 5)
  )
  from public.service_reviews
  where listing_id = p_listing_id and status = 'published';
$$;
grant execute on function public.service_review_distribution(text) to anon, authenticated;

-- Funções de trigger não são chamáveis pela API.
revoke execute on function public.service_reviews_guard() from public, anon, authenticated;
revoke execute on function public.service_reviews_aggregate() from public, anon, authenticated;
