-- Buscar carro escrevendo, em vez de caçar filtro.
--
-- A aba Carros nasceu com duas tiras de etiquetas (stage e modificação) que
-- num celular rolavam para fora da tela: quem procurava "stage 1" tinha que
-- descobrir que existia uma etiqueta chamada Stage 1 e alcançá-la rolando.
-- Busca é o gesto que a pessoa já faz.
--
-- Para isso o carro ganha uma linha de texto só para ser procurada:
-- marca, modelo, ano, região, a preparação contada pelo dono (`specs.notes`,
-- o campo livre da ficha) e — isto é o que faz funcionar — as PALAVRAS que
-- as etiquetas significam, nos dois idiomas e nas abreviações que o meio usa.
-- Assim "stg1", "stage 1", "suspensão" e "coilover" chegam no mesmo carro,
-- sem o dono ter escrito nenhuma delas.
--
-- Fica como coluna desnormalizada, escrita por `publish_car`, e não como
-- índice de texto completo: o acervo é de milhares, não de milhões, e um
-- `ilike` por palavra é mais simples de explicar do que um tsquery que
-- tropeça em "stg1".

/** Minúscula, sem acento, só letras e números separados por espaço. */
create or replace function public.car_search_normalize(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(
      lower(coalesce(p_text, '')),
      'áàâãäåāéèêëēíìîïīóòôõöøōúùûüūçñýÿß',
      'aaaaaaaeeeeeiiiiiooooooouuuuucnyys'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

/** As palavras que cada stage significa, incluindo como as pessoas escrevem. */
create or replace function public.car_stage_words(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_stage, 'stock')
    when 'stock'  then 'stock original de fabrica standard'
    when 'stage1' then 'stage1 stage 1 stg1 stg 1 estagio 1'
    when 'stage2' then 'stage2 stage 2 stg2 stg 2 estagio 2'
    when 'stage3' then 'stage3 stage 3 stg3 stg 3 estagio 3'
    when 'custom' then 'custom preparacao propria preparado projeto'
    else ''
  end;
$$;

/**
 * As palavras de cada modificação. Os ids são os de `MOD_CHIPS`
 * (services/carSpecSheet.js); as palavras são o que se fala numa garagem,
 * em português e em inglês.
 */
create or replace function public.car_mod_words(p_mods text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(w, ' '), '')
  from unnest(coalesce(p_mods, '{}'::text[])) as m(id)
  cross join lateral (
    select case m.id
      when 'turbo'       then 'turbo turbina aspirado sobrealimentado'
      when 'remap'       then 'remap chip reprogramacao reprogramado mapa ecu'
      when 'intake'      then 'intake admissao filtro de ar aspiracao'
      when 'exhaust'     then 'exhaust escape descarga coletor ponteira'
      when 'intercooler' then 'intercooler trocador'
      when 'injection'   then 'injection injecao injetores bico combustivel'
      when 'camshaft'    then 'camshaft comando de valvulas eixo'
      when 'internals'   then 'internals motor forjado pistao biela virabrequim'
      when 'gnv'         then 'gnv gas natural kit gas'
      when 'clutch'      then 'clutch embreagem cerametalica'
      when 'gearbox'     then 'gearbox cambio transmissao marcha'
      when 'suspension'  then 'suspension suspensao coilover rosca fixa mola amortecedor rebaixado'
      when 'brakes'      then 'brakes freio freios disco pinca pastilha'
      when 'wheels'      then 'wheels roda rodas aro pneu liga leve'
      when 'bodykit'     then 'bodykit body kit aerofolio spoiler saia parachoque envelopamento'
      when 'sound'       then 'sound som caixa subwoofer modulo alto falante'
      when 'armor'       then 'armor blindagem blindado'
      else m.id
    end as w
  ) as words;
$$;

/** A linha inteira que a busca varre. */
create or replace function public.car_search_text(
  p_brand text, p_model text, p_year text,
  p_stage text, p_mods text[], p_state text, p_city text, p_data jsonb
)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.car_search_normalize(
    concat_ws(' ',
      p_brand, p_model, p_year, p_state, p_city,
      public.car_stage_words(p_stage),
      public.car_mod_words(p_mods),
      -- A preparação contada pelo dono, que é o campo livre da ficha.
      coalesce(p_data #>> '{specs,notes}', ''),
      coalesce(p_data ->> 'title', '')
    )
  );
$$;

alter table public.car_showcase
  add column if not exists search_text text not null default '';

-- `text_pattern_ops` serve o `ilike 'palavra%'`; o `%palavra%` que o app usa
-- continua varrendo, o que a este tamanho de acervo é barato e previsível.
create index if not exists car_showcase_search
  on public.car_showcase (search_text text_pattern_ops);

-- Carro já publicado antes desta migração também precisa ser achável.
update public.car_showcase set search_text = public.car_search_text(
  brand, model, model_year, stage, mods, state, city, data
);

-- ---------------------------------------------------------------------------
-- `publish_car` passa a escrever a linha de busca
-- ---------------------------------------------------------------------------
-- Igual à de 20261103150000, com `search_text` a mais. Repetida inteira em vez
-- de remendada porque função em Postgres se substitui inteira.

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
  v_search text;
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

  select slug into v_slug from public.car_showcase where id = p_car_id;
  if v_slug is null then
    v_base := left(public.slugify_text(v_brand || ' ' || v_model || ' ' || v_year), 60);
    v_base := btrim(v_base, '-');
    if v_base = '' then v_base := 'carro'; end if;
    v_slug := v_base;
    while exists (select 1 from public.car_showcase where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n::text;
    end loop;
  end if;

  v_search := public.car_search_text(
    v_brand, v_model, v_year, v_stage, v_mods, v_state, v_city, p_data
  );

  insert into public.car_showcase as c
    (id, user_id, slug, brand, model, model_year, stage, mods, state, city,
     data, search_text, updated_at)
  values
    (p_car_id, v_uid, v_slug, v_brand, v_model, v_year, v_stage, v_mods, v_state,
     v_city, p_data, v_search, now())
  on conflict (id) do update set
    brand = excluded.brand,
    model = excluded.model,
    model_year = excluded.model_year,
    stage = excluded.stage,
    mods = excluded.mods,
    state = excluded.state,
    city = excluded.city,
    data = excluded.data,
    search_text = excluded.search_text,
    updated_at = now()
  where c.user_id = v_uid;

  return v_slug;
end;
$$;

revoke execute on function public.publish_car(text, jsonb) from public, anon;
grant execute on function public.publish_car(text, jsonb) to authenticated;
