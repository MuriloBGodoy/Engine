-- "Encontrar carros": a Comunidade ganha um acervo dos carros do Engine, com
-- filtro por marca, modelo, ano, preparação e região, e cada carro com página
-- própria para curtir e compartilhar.
--
-- POR QUE UMA TABELA NOVA, E NÃO ABRIR `public.cars`.
-- O documento do carro carrega gasto lançado, aporte guardado, simulação e
-- renda necessária. Abrir a leitura dele para o mundo, mesmo com um campo
-- "público", seria expor a vida financeira de quem só queria mostrar o motor.
-- Aqui vai uma CÓPIA PUBLICADA, com os campos que a pessoa escolheu publicar —
-- o mesmo recorte que `communityCarPatch` e `publicSpecSheet` já usam quando
-- ela posta o carro no feed.
--
-- A ficha declarada (stage, potência, modificações) não é inventada aqui: ela
-- já existe em `services/carSpecSheet.js`, com `origin` e `method`, e número
-- declarado sempre chega etiquetado como afirmação do dono. Esta migração só
-- copia e indexa o que dá para filtrar.

create table if not exists public.car_showcase (
  -- Mesmo id do carro na garagem: um carro, uma vitrine.
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique,
  -- Colunas de filtro, desnormalizadas do payload pela função de publicar.
  -- Ficam fora do jsonb porque é por elas que a aba Carros busca.
  brand text not null default '',
  model text not null default '',
  model_year text not null default '',
  stage text not null default 'stock',
  mods text[] not null default '{}',
  state text not null default '',
  city text not null default '',
  data jsonb not null default '{}'::jsonb,
  like_count integer not null default 0,
  -- Moderação esconde sem apagar, como nos anúncios.
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists car_showcase_user on public.car_showcase (user_id);
create index if not exists car_showcase_brand on public.car_showcase (brand, model);
create index if not exists car_showcase_stage on public.car_showcase (stage);
create index if not exists car_showcase_region on public.car_showcase (state, city);
create index if not exists car_showcase_recent on public.car_showcase (created_at desc);
create index if not exists car_showcase_mods on public.car_showcase using gin (mods);

alter table public.car_showcase enable row level security;

-- Leitura pública, como a de anúncio aprovado: escondido pela moderação some,
-- e conta suspensa some junto (mesma função que o perfil já usa).
create policy "vitrine: visivel para todos" on public.car_showcase
  for select using (
    (not hidden and public.account_visible(user_id))
    or user_id = (select auth.uid())
    or public.is_service_admin()
  );

-- Escrita só pela moderação (esconder) e pelas funções abaixo, que rodam como
-- security definer. Ninguém publica carro escrevendo direto na tabela: é o que
-- garante que o payload passou pelo recorte.
create policy "vitrine: moderacao esconde" on public.car_showcase
  for update using (public.is_service_admin()) with check (public.is_service_admin());
create policy "vitrine: dono ou moderacao tira do ar" on public.car_showcase
  for delete using (user_id = (select auth.uid()) or public.is_service_admin());

-- ---------------------------------------------------------------------------
-- Curtidas
-- ---------------------------------------------------------------------------

create table if not exists public.car_likes (
  car_id text not null references public.car_showcase (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (car_id, user_id)
);
create index if not exists car_likes_user on public.car_likes (user_id);
alter table public.car_likes enable row level security;

-- Quem curtiu é público (o contador precisa bater), mas só dá para curtir em
-- nome próprio e em carro que você consegue ver.
create policy "curtida de carro: leitura publica" on public.car_likes
  for select using (true);
create policy "curtida de carro: so a propria" on public.car_likes
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.car_showcase c
      where c.id = car_id and not c.hidden and public.account_visible(c.user_id)
    )
  );
create policy "curtida de carro: descurtir a propria" on public.car_likes
  for delete using (user_id = (select auth.uid()));

create or replace function public.car_likes_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.car_showcase set like_count = like_count + 1 where id = new.car_id;
    return new;
  end if;
  update public.car_showcase set like_count = greatest(like_count - 1, 0) where id = old.car_id;
  return old;
end;
$$;

drop trigger if exists car_likes_count on public.car_likes;
create trigger car_likes_count
after insert or delete on public.car_likes
for each row execute function public.car_likes_count();

-- ---------------------------------------------------------------------------
-- Publicar e tirar do ar
-- ---------------------------------------------------------------------------

/** Os mesmos ids de `MOD_CHIPS` e `STAGES` em services/carSpecSheet.js. */
create or replace function public.car_showcase_mods_ok(p_mods text[])
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_mods <@ array[
    'turbo','remap','intake','exhaust','intercooler','injection','camshaft',
    'internals','gnv','clutch','gearbox','suspension','brakes','wheels',
    'bodykit','sound','armor'
  ]::text[];
$$;

/**
 * Publica (ou atualiza) o carro do próprio dono na vitrine.
 *
 * `p_data` é o recorte público montado no app — título, fotos, ficha
 * declarada, texto da preparação. Marca, modelo, ano, stage, modificações e
 * região saem dele para as colunas de filtro, validados aqui.
 */
create or replace function public.publish_car(p_car_id text, p_data jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_slug text;
  v_base text;
  v_brand text := left(btrim(coalesce(p_data ->> 'brand', '')), 80);
  v_model text := left(btrim(coalesce(p_data ->> 'model', '')), 120);
  v_year text := left(btrim(coalesce(p_data ->> 'year', '')), 40);
  v_stage text := coalesce(p_data ->> 'stage', 'stock');
  v_mods text[] := coalesce(
    (select array_agg(value) from jsonb_array_elements_text(coalesce(p_data -> 'mods', '[]'::jsonb))),
    '{}'::text[]
  );
  v_state text := left(btrim(coalesce(p_data ->> 'state', '')), 40);
  v_city text := left(btrim(coalesce(p_data ->> 'city', '')), 80);
  v_n integer := 0;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cars where user_id = v_uid and id = p_car_id) then
    raise exception 'car-not-found' using errcode = '42501';
  end if;
  if v_brand = '' or v_model = '' then
    raise exception 'car-needs-name' using errcode = '22023';
  end if;
  if v_stage not in ('stock', 'stage1', 'stage2', 'stage3', 'custom') then
    raise exception 'bad-stage' using errcode = '22023';
  end if;
  if not public.car_showcase_mods_ok(v_mods) then
    raise exception 'bad-mods' using errcode = '22023';
  end if;

  -- Endereço legível, estável enquanto o carro não troca de nome.
  select slug into v_slug from public.car_showcase where id = p_car_id;
  if v_slug is null then
    -- Mesma função que dá endereço aos anúncios.
    v_base := left(public.slugify_text(v_brand || ' ' || v_model || ' ' || v_year), 60);
    v_base := btrim(v_base, '-');
    if v_base = '' then v_base := 'carro'; end if;
    v_slug := v_base;
    while exists (select 1 from public.car_showcase where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n::text;
    end loop;
  end if;

  insert into public.car_showcase as c
    (id, user_id, slug, brand, model, model_year, stage, mods, state, city, data, updated_at)
  values
    (p_car_id, v_uid, v_slug, v_brand, v_model, v_year, v_stage, v_mods, v_state, v_city, p_data, now())
  on conflict (id) do update set
    brand = excluded.brand,
    model = excluded.model,
    model_year = excluded.model_year,
    stage = excluded.stage,
    mods = excluded.mods,
    state = excluded.state,
    city = excluded.city,
    data = excluded.data,
    updated_at = now()
  where c.user_id = v_uid;

  return v_slug;
end;
$$;

revoke execute on function public.publish_car(text, jsonb) from public, anon;
grant execute on function public.publish_car(text, jsonb) to authenticated;

/** Tira o carro da vitrine. O carro na garagem continua intacto. */
create or replace function public.unpublish_car(p_car_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.car_showcase
  where id = p_car_id and user_id = auth.uid();
$$;

revoke execute on function public.unpublish_car(text) from public, anon;
grant execute on function public.unpublish_car(text) to authenticated;

-- Apagar o carro da garagem tira ele da vitrine junto: sem isto sobraria uma
-- página pública de um carro que não existe mais.
create or replace function public.car_showcase_follows_car()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.car_showcase where id = old.id and user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists car_showcase_follows_car on public.cars;
create trigger car_showcase_follows_car
after delete on public.cars
for each row execute function public.car_showcase_follows_car();
