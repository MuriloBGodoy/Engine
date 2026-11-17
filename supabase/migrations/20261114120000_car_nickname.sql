-- O APELIDO DO CARRO, E O ENDEREÇO QUE SAI DELE.
--
-- Por que isto existe: muita gente que usa o Engine já tem conta de TikTok e
-- de Instagram com o nome que deu ao carro, não com o próprio nome. O carro
-- tem público antes de ter página. Até aqui o endereço público do carro era
-- montado pela máquina a partir de marca + modelo + ano
-- (`/carro/chevrolet-corsa-wind-2002`), e nunca mudava. A pessoa que divulga
-- "@bruxa" em todo lugar não tinha como fazer o Engine falar a mesma língua.
--
-- O apelido em si NÃO precisa de coluna: `public.cars.data` é jsonb e a cópia
-- pública (`car_showcase.data`) também. Quem precisa de banco é o ENDEREÇO,
-- por dois motivos que só o banco resolve:
--
--   1. Ele é único entre todos os carros do app. Dois carros chamados "bruxa"
--      não podem morar no mesmo endereço, e quem decide quem chegou primeiro
--      é o banco, não o app.
--
--   2. Ele é IMPRESSO. O adesivo com o QR Code vai colado no vidro de um
--      carro de verdade. Se o dono trocar o apelido depois, o adesivo que
--      está na rua não pode virar erro 404 — ninguém vai raspar o vidro para
--      trocar o adesivo. Então endereço velho nunca morre: ele vira um
--      apelido antigo que continua levando ao mesmo carro, e ninguém mais
--      pode tomá-lo. É o que o Instagram faz com @ trocado (ele fica preso ao
--      dono por um tempo); aqui fica preso para sempre, porque o nosso está
--      em papel.
--
-- O que entra: a tabela do histórico, a validação do formato, a função que
-- troca o endereço, e o `publish_car` passando a usar o apelido como base
-- quando o carro estreia na vitrine.

-- ---------------------------------------------------------------------------
-- Os endereços já usados
-- ---------------------------------------------------------------------------

create table if not exists public.car_slug_history (
  slug text primary key,
  car_id text not null references public.car_showcase (id) on delete cascade,
  -- Guardado junto para a conta do limite de trocas: sem isto, trocar de
  -- apelido 200 vezes num dia reservaria 200 endereços de graça.
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists car_slug_history_car on public.car_slug_history (car_id);
create index if not exists car_slug_history_user on public.car_slug_history (user_id, created_at desc);

alter table public.car_slug_history enable row level security;

-- Leitura pública: é isto que faz um link velho (ou um adesivo impresso)
-- continuar achando o carro. O par "endereço antigo → carro" não é segredo —
-- a vitrine inteira é pública, e o carro em si já decide o que mostra.
create policy "endereco antigo: leitura publica" on public.car_slug_history
  for select using (true);

-- Ninguém escreve aqui direto. Quem escreve é `set_car_slug`, logo abaixo,
-- que roda como security definer. Sem política de insert/update/delete, a
-- tabela é só-leitura para todo mundo que não é a função.

-- ---------------------------------------------------------------------------
-- O formato de um endereço
-- ---------------------------------------------------------------------------

/**
 * Nomes que um carro não pode tomar.
 *
 * Não é para evitar conflito de rota — o carro mora dentro de `/carro/`, que
 * é um espaço só dele. É para evitar que um carro qualquer se passe pelo
 * próprio app: `/carro/engine` ou `/carro/suporte` num adesivo colado na rua
 * parece página oficial.
 */
create or replace function public.car_slug_reserved(p_slug text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_slug, ''))) = any (array[
    'engine','enginegarage','engine-garage','garage','garagem',
    'admin','administrador','moderacao','moderation','suporte','support',
    'oficial','official','ajuda','help','api','carro','car','novo','new'
  ]);
$$;

/**
 * O formato: de 3 a 30 caracteres, minúsculas, números, ponto, hífen e
 * sublinhado — o mesmo alfabeto de @ do Instagram e do TikTok, para que o
 * apelido que a pessoa já usa lá caiba aqui sem tradução.
 *
 * As regras que vão além do alfabeto, e por quê:
 *
 *   - tem de ter ao menos UMA letra. Um endereço só de números ("123456")
 *     parece id de sistema, e é justamente o que o dono não quer no adesivo.
 *   - não começa nem termina com pontuação, e não tem pontuação dobrada:
 *     ".bruxa", "bruxa-" e "bru--xa" são erro de digitação em 99% dos casos,
 *     e geram dois endereços que a olho nu são o mesmo.
 */
create or replace function public.car_slug_ok(p_slug text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_slug ~ '^[a-z0-9](?:[a-z0-9]|[._-](?=[a-z0-9])){1,28}[a-z0-9]$'
     and p_slug ~ '[a-z]'
     and not public.car_slug_reserved(p_slug);
$$;

-- ---------------------------------------------------------------------------
-- Trocar o endereço
-- ---------------------------------------------------------------------------

/**
 * Dá ao carro do próprio dono o endereço `p_slug`.
 *
 * Devolve o endereço gravado. Erros, todos com código próprio para a tela
 * poder dizer a frase certa em vez de "algo deu errado":
 *
 *   bad-slug        o formato não passa (`car_slug_ok`)
 *   slug-taken      é de outro carro, ou já foi de outro carro
 *   car-not-shown   o carro não está na vitrine (não tem endereço para trocar)
 *   too-many-slugs  mais de 5 trocas em 30 dias
 *
 * O limite de 5 em 30 dias não é anti-abuso de verdade — é anti-garimpo: sem
 * ele, um script trocaria o apelido em loop para ir reservando no histórico
 * todo nome curto e bonito do app.
 */
create or replace function public.set_car_slug(p_car_id text, p_slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_atual text;
  v_trocas integer;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;

  select slug into v_atual
  from public.car_showcase
  where id = p_car_id and user_id = v_uid;

  if v_atual is null then
    raise exception 'car-not-shown' using errcode = '42501';
  end if;

  -- Pedir o endereço que já é seu não é erro, e não gasta troca.
  if v_atual = v_slug then
    return v_atual;
  end if;

  if not public.car_slug_ok(v_slug) then
    raise exception 'bad-slug' using errcode = '22023';
  end if;

  -- Tomado por outro carro, ou aposentado por qualquer carro (inclusive por
  -- este mesmo: voltar para um apelido que já foi seu é permitido e cai no
  -- `delete` lá embaixo).
  if exists (select 1 from public.car_showcase where slug = v_slug and id <> p_car_id)
     or exists (select 1 from public.car_slug_history where slug = v_slug and car_id <> p_car_id)
  then
    raise exception 'slug-taken' using errcode = '23505';
  end if;

  select count(*) into v_trocas
  from public.car_slug_history
  where user_id = v_uid and created_at > now() - interval '30 days';
  if v_trocas >= 5 then
    raise exception 'too-many-slugs' using errcode = '53400';
  end if;

  -- O endereço de agora vai para o histórico ANTES da troca: é ele que vai
  -- manter de pé o adesivo que já está no vidro.
  insert into public.car_slug_history (slug, car_id, user_id)
  values (v_atual, p_car_id, v_uid)
  on conflict (slug) do nothing;

  -- E o endereço novo sai do histórico, se estava lá: ele volta a ser o vivo.
  delete from public.car_slug_history where slug = v_slug and car_id = p_car_id;

  update public.car_showcase
  set slug = v_slug, updated_at = now()
  where id = p_car_id and user_id = v_uid;

  return v_slug;
end;
$$;

revoke execute on function public.set_car_slug(text, text) from public, anon;
grant execute on function public.set_car_slug(text, text) to authenticated;

/**
 * O endereço está livre?
 *
 * Existe para a tela poder dizer "esse já é de outro carro" enquanto a pessoa
 * digita, em vez de só na hora de salvar. Não vaza nada: a vitrine é pública
 * e qualquer um descobre o mesmo abrindo o endereço no navegador.
 */
create or replace function public.car_slug_free(p_slug text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.car_slug_ok(lower(btrim(coalesce(p_slug, ''))))
     and not exists (select 1 from public.car_showcase where slug = lower(btrim(p_slug)))
     and not exists (select 1 from public.car_slug_history where slug = lower(btrim(p_slug)));
$$;

grant execute on function public.car_slug_free(text) to authenticated, anon;

/**
 * O carro que mora (ou morou) neste endereço.
 *
 * Uma chamada só, em vez de duas idas ao banco: a página pública do carro
 * pergunta por aqui e já recebe o id certo, seja o endereço o atual ou um
 * antigo de adesivo impresso.
 */
create or replace function public.car_id_for_slug(p_slug text)
returns text
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (select id from public.car_showcase where slug = lower(btrim(coalesce(p_slug, '')))),
    (select car_id from public.car_slug_history where slug = lower(btrim(coalesce(p_slug, ''))))
  );
$$;

grant execute on function public.car_id_for_slug(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- O apelido como base do endereço na estreia
-- ---------------------------------------------------------------------------

/**
 * `publish_car`, com uma mudança: quando o carro estreia na vitrine e o dono
 * já deu um apelido, o endereço nasce do APELIDO ("bruxa"), e não de marca +
 * modelo + ano ("chevrolet-corsa-wind-2002").
 *
 * O resto é igual à versão de 20261103150000 — a função é recriada inteira
 * porque Postgres não tem "editar um pedaço".
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
  v_nick text := left(btrim(coalesce(p_data ->> 'nickname', '')), 40);
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

  -- Endereço legível, estável. Trocar depois é trabalho de `set_car_slug`,
  -- que guarda o antigo; aqui só se decide o de estreia.
  select slug into v_slug from public.car_showcase where id = p_car_id;
  if v_slug is null then
    -- Mesma função que dá endereço aos anúncios.
    v_base := left(
      public.slugify_text(
        case when v_nick <> '' then v_nick
             else v_brand || ' ' || v_model || ' ' || v_year end
      ),
      60
    );
    v_base := btrim(v_base, '-');
    -- Apelido que virou nada ou quase nada depois do slugify (só emoji, só
    -- pontuação, "Zé" → "ze" com 2 letras) cai de volta no nome do veículo:
    -- 3 caracteres é o piso de `car_slug_ok`, e um endereço de estreia que
    -- não passaria na própria validação seria impossível de reeditar depois.
    if length(v_base) < 3 and v_nick <> '' then
      v_base := btrim(left(public.slugify_text(v_brand || ' ' || v_model || ' ' || v_year), 60), '-');
    end if;
    if length(v_base) < 3 or public.car_slug_reserved(v_base) then v_base := 'carro'; end if;
    v_slug := v_base;
    -- O histórico conta na disputa: endereço aposentado não é reaproveitado.
    while exists (select 1 from public.car_showcase where slug = v_slug)
       or exists (select 1 from public.car_slug_history where slug = v_slug and car_id <> p_car_id)
    loop
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
