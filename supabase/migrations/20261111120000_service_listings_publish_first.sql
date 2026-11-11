-- Publicar direto, revisar por exceção.
--
-- Antes: TODO anúncio novo nascia 'pending' e ficava invisível até a moderação
-- (uma pessoa) aprovar. Com o marketplace em zero anúncios, isso cobra o preço
-- errado: um anúncio ruim no ar por três horas, com quatro usuários, não custa
-- quase nada; o anúncio de um prestador invisível por três dias custa o
-- prestador — ele não volta, e conta para os outros do bairro. A pré-aprovação
-- estava protegendo uma reputação que o Engine ainda não tem.
--
-- É também o que as plataformas grandes fazem. Nenhuma revisa tudo na entrada:
-- filtro automático na gravação, denúncia depois, e pré-análise só para a
-- fatia de risco. A OLX se comporta assim (o anúncio cai DEPOIS, por denúncia
-- ou detecção de fraude; editar joga de volta para a fila). E desde 26/06/2025
-- o STF deixou o art. 21 do Marco Civil como regra: a obrigação da plataforma
-- é remover rápido quando notificada, não triar na entrada.
--
-- Agora o guard decide no INSERT:
--
--   risco vazio  -> 'approved', vai ao ar na hora
--   risco achado -> 'pending', cai na fila como antes
--
-- O que conta como risco (public.service_listing_risk):
--
--   termo       termo barrado achado no texto livre (título, descrição, nome
--               do prestador, tags). A lista mora em
--               public.service_moderation_flags e é EDITÁVEL pela moderação
--               sem migration nova — mesma ideia do public.service_admins.
--   categoria   categoria marcada como sensível na mesma tabela.
--   link        link no texto livre. O anúncio tem campo de site e de vídeo;
--               link solto na descrição é o jeito clássico de levar a pessoa
--               para fora e trocar o destino depois da aprovação.
--   conta       e-mail (ou telefone) da conta não confirmado.
--   historico   o dono já teve anúncio rejeitado ou tirado do ar.
--   duplicado   o dono já tem outro anúncio com o mesmo título.
--
-- O motivo NÃO vai para dentro de `data`: o dono lê a própria linha, e dizer
-- "barrado pelo termo X" ensina a contornar. Vai para
-- public.service_listing_risk_log, que só a moderação lê. É também de onde se
-- afere se o filtro está apertado demais.
--
-- A lista de termos também não é espelhada no front-end, de propósito. A
-- convenção da casa é tela e banco andarem juntos (LIGHT_EDIT_KEYS), mas uma
-- lista de bloqueio no bundle é uma lista de bloqueio publicada. A tela
-- descobre o resultado pelo status que o banco devolve, que ela já relê.
--
-- Edição segue como estava: campo leve mantém no ar, o resto volta para a
-- fila. Quem publicou direto e depois troca a foto cai na fila — e está certo,
-- é justamente o golpe de trocar o conteúdo depois de aprovado.
--
-- Nada para migrar: service_listings está com zero linhas hoje.

-- ---------------------------------------------------------------------------
-- A lista, editável pela moderação
-- ---------------------------------------------------------------------------

create table if not exists public.service_moderation_flags (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('term', 'category')),
  value text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (kind, value)
);
alter table public.service_moderation_flags enable row level security;

-- Sem policy de leitura para anon/authenticated de propósito: quem publica não
-- vê a lista. A função de risco lê por ser security definer.
drop policy if exists "flags: moderacao" on public.service_moderation_flags;
create policy "flags: moderacao" on public.service_moderation_flags
  for all using (public.is_service_admin()) with check (public.is_service_admin());

-- ---------------------------------------------------------------------------
-- O log, só para a moderação
-- ---------------------------------------------------------------------------

create table if not exists public.service_listing_risk_log (
  id bigint generated always as identity primary key,
  listing_id text not null references public.service_listings (id) on delete cascade,
  owner_id uuid not null,
  reasons text[] not null,
  created_at timestamptz not null default now()
);
create index if not exists service_listing_risk_log_recent
  on public.service_listing_risk_log (created_at desc);
alter table public.service_listing_risk_log enable row level security;

drop policy if exists "risco: moderacao le" on public.service_listing_risk_log;
create policy "risco: moderacao le" on public.service_listing_risk_log
  for select using (public.is_service_admin());

-- ---------------------------------------------------------------------------
-- Texto livre do anúncio: o que a pessoa escreveu com as próprias mãos
-- ---------------------------------------------------------------------------

create or replace function public.service_listing_free_text(p_data jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(concat_ws(' ',
    coalesce(p_data ->> 'title', ''),
    coalesce(p_data ->> 'description', ''),
    coalesce(p_data ->> 'providerName', ''),
    coalesce((
      select string_agg(tag, ' ')
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_data -> 'tags') = 'array'
          then p_data -> 'tags'
          else '[]'::jsonb
        end
      ) as t(tag)
    ), '')
  ));
$$;

-- ---------------------------------------------------------------------------
-- O risco. Array vazio = publica direto.
-- ---------------------------------------------------------------------------

create or replace function public.service_listing_risk(
  p_data jsonb,
  p_owner uuid,
  p_id text
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_free text := public.service_listing_free_text(p_data);
  -- Hífen nas pontas para o termo casar só em começo de palavra: "arma" acha
  -- "arma de fogo" e "armas", mas não "armario".
  v_slug text := '-' || public.slugify_text(v_free) || '-';
  v_title text := public.slugify_text(coalesce(p_data ->> 'title', ''));
  v_reasons text[] := array[]::text[];
  v_term text;
begin
  -- Um termo com '+' exige TODAS as partes no texto, em qualquer ordem e em
  -- qualquer lugar: 'catalisador + remo' pega "remoção de catalisador",
  -- "removo catalisador" e "remover o catalisador", e deixa passar "limpeza de
  -- catalisador". É o que evita listar toda conjugação do verbo — a lista de
  -- frase exata furava justamente aí.
  select value into v_term
  from public.service_moderation_flags
  where kind = 'term'
    and (
      select bool_and(v_slug like '%-' || public.slugify_text(parte) || '%')
      from unnest(string_to_array(value, '+')) as p(parte)
      where public.slugify_text(parte) <> ''
    )
  limit 1;
  if v_term is not null then
    v_reasons := v_reasons || ('termo:' || v_term);
  end if;

  if exists (
    select 1 from public.service_moderation_flags
    where kind = 'category' and value = coalesce(p_data ->> 'category', '')
  ) then
    v_reasons := v_reasons || 'categoria';
  end if;

  -- Link no texto livre. Site e vídeo têm campo próprio e não entram aqui.
  if v_free ~ '(https?://|www\.|wa\.me|t\.me|bit\.ly|encurtador|[a-z0-9][a-z0-9-]*\.(com|com\.br|net|org|io|me|xyz|top|shop|site|link|app|online)([/ ,;]|$))' then
    v_reasons := v_reasons || 'link';
  end if;

  if not exists (
    select 1 from auth.users
    where id = p_owner
      and (email_confirmed_at is not null or phone_confirmed_at is not null)
  ) then
    v_reasons := v_reasons || 'conta';
  end if;

  if exists (
    select 1 from public.service_listings
    where owner_id = p_owner
      and id is distinct from p_id
      and moderation_status in ('rejected', 'suspended')
  ) then
    v_reasons := v_reasons || 'historico';
  end if;

  if v_title <> '' and exists (
    select 1 from public.service_listings
    where owner_id = p_owner
      and id is distinct from p_id
      and public.slugify_text(data ->> 'title') = v_title
  ) then
    v_reasons := v_reasons || 'duplicado';
  end if;

  return v_reasons;
end;
$$;

revoke execute on function public.service_listing_risk(jsonb, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sim ou não, para o guard
--
-- O guard NÃO é security definer: ele roda como a pessoa logada. Então ele não
-- consegue chamar a função acima, que é fechada — e abrir a função acima para
-- `authenticated` entregaria a lista de termos a quem quisesse perguntar
-- ("isto é barrado? e isto?"), com o motivo e tudo.
--
-- Então o guard pergunta por aqui: mesma conta, resposta booleana. Quem chamar
-- na mão descobre no máximo que um texto seu cai na fila — o que já descobriria
-- publicando. O dono é sempre auth.uid(), não um parâmetro, para ninguém
-- perguntar pelo histórico de outra pessoa. Mesmo desenho do
-- public.is_service_admin(), que também é definer sobre tabela fechada.
-- ---------------------------------------------------------------------------

create or replace function public.service_listing_is_risky(p_data jsonb, p_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select cardinality(
    public.service_listing_risk(p_data, (select auth.uid()), p_id)
  ) > 0;
$$;

revoke execute on function public.service_listing_is_risky(jsonb, text) from public, anon;
grant execute on function public.service_listing_is_risky(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Guard: igual à versão de 20261025150000, só o ramo de INSERT muda
-- ---------------------------------------------------------------------------

create or replace function public.service_listings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_admin boolean := public.is_service_admin();
  v_changed boolean;
  v_keep jsonb;
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
    if not v_admin then
      -- Anúncio novo vai ao ar, a menos que o filtro ache motivo. Sem nota de
      -- moderação herdada e com a data de envio do servidor.
      new.moderation_status := case
        when public.service_listing_is_risky(new.data, new.id) then 'pending'
        else 'approved'
      end;
      new.data := (coalesce(new.data, '{}'::jsonb)
          - 'moderationNote' - 'moderationHistory' - 'reviewedBy' - 'reviewedAt')
        || jsonb_build_object('submittedAt', public.service_listing_now_iso());
    end if;
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

  if v_admin then
    return new;
  end if;

  new.owner_id := old.owner_id;
  new.data := coalesce(new.data, '{}'::jsonb);

  -- O histórico e quem revisou são da moderação: voltam como estavam.
  v_keep := jsonb_strip_nulls(jsonb_build_object(
    'moderationHistory', old.data -> 'moderationHistory',
    'reviewedBy', old.data -> 'reviewedBy',
    'reviewedAt', old.data -> 'reviewedAt'
  ));
  new.data := (new.data
      - 'moderationHistory' - 'reviewedBy' - 'reviewedAt'
      - 'moderationNote' - 'submittedAt')
    || v_keep;

  v_changed := public.service_listing_review_fields(old.data)
    is distinct from public.service_listing_review_fields(new.data);

  if old.moderation_status = 'approved' and not v_changed then
    -- Só campos leves: continua no ar, com a mesma nota e data de envio.
    new.moderation_status := 'approved';
    new.data := new.data || jsonb_strip_nulls(jsonb_build_object(
      'moderationNote', old.data -> 'moderationNote',
      'submittedAt', old.data -> 'submittedAt'
    ));
  else
    -- Mudou o que o anúncio é, ou ele não estava no ar: fila. Quem já estava
    -- esperando não perde o lugar por corrigir um detalhe.
    new.moderation_status := 'pending';
    new.data := new.data || jsonb_build_object(
      'moderationNote', '',
      'submittedAt', case
        when old.moderation_status = 'pending' and old.data ? 'submittedAt'
          then old.data -> 'submittedAt'
        else to_jsonb(public.service_listing_now_iso())
      end
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.service_listings_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O log do que o filtro pegou
--
-- Este, sim, é security definer: roda como o dono do banco, e por isso pode
-- chamar a função detalhada (fechada) e gravar em service_listing_risk_log,
-- que só tem policy de leitura — dono de tabela não passa pela RLS dela.
-- ---------------------------------------------------------------------------

create or replace function public.service_listings_log_risk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_risk text[];
begin
  if public.is_trusted_write() or public.is_service_admin() then
    return null;
  end if;
  v_risk := public.service_listing_risk(new.data, new.owner_id, new.id);
  if cardinality(v_risk) > 0 then
    insert into public.service_listing_risk_log (listing_id, owner_id, reasons)
    values (new.id, new.owner_id, v_risk);
  end if;
  return null;
end;
$$;

drop trigger if exists service_listings_log_risk on public.service_listings;
create trigger service_listings_log_risk
  after insert on public.service_listings
  for each row
  execute function public.service_listings_log_risk();

revoke execute on function public.service_listings_log_risk() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: o dono grava 'pending' ou 'approved' — e o guard acima já decidiu qual
-- dos dois, antes desta checagem (WITH CHECK roda depois dos BEFORE triggers).
-- 'approved' vindo do dono só passa porque o guard só o escolhe quando o
-- filtro não achou nada. O dono não consegue forçar.
-- ---------------------------------------------------------------------------

drop policy if exists "anuncios: dono envia para fila" on public.service_listings;
drop policy if exists "anuncios: dono publica (guard decide)" on public.service_listings;
create policy "anuncios: dono publica (guard decide)" on public.service_listings
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and moderation_status in ('pending', 'approved')
  );

-- ---------------------------------------------------------------------------
-- A lista inicial
--
-- Critério: só entra termo que, num marketplace de serviço automotivo, não tem
-- leitura inocente. Termo ambíguo fica FORA de propósito — falso positivo aqui
-- é anúncio legítimo parado numa fila que ninguém está olhando, que é
-- exatamente o problema que esta migration existe para resolver.
--
-- Por isso NÃO entraram: "leilão" e "sinistro" (venda de recuperado é legal
-- com documentação), "recurso de multa" e "despachante" (serviço legítimo),
-- "silenciador" (vizinho de escapamento no vocabulário de oficina), e telefone
-- na descrição (quase todo prestador repete o número — mandaria a maioria dos
-- anúncios honestos para a fila).
-- ---------------------------------------------------------------------------

insert into public.service_moderation_flags (kind, value, note) values
  -- Peça e veículo de origem ilícita
  ('term', 'desmanche',              'peça de desmanche'),
  ('term', 'sem procedencia',        'peça sem origem'),
  ('term', 'chassi + remarc',        'remarcação de chassi'),
  ('term', 'placa fria',             'placa de outro veículo'),
  ('term', 'placa + clonad',         'clonagem'),
  ('term', 'carro + clonad',         'clonagem'),
  ('term', 'duble',                  'carro dublê'),
  ('term', 'documento frio',         'documento falso'),
  ('term', 'documento + falso',      'documento falso'),

  -- Adulteração de odômetro. É a fraude que a lista pega PIOR: dá para
  -- descrever sem usar nenhuma destas palavras ("deixo o painel do jeito que
  -- você quiser"). Aqui quem resolve é a denúncia, não o filtro.
  ('term', 'odometro + adulter',     'adulteração de odômetro'),
  ('term', 'odometro + baix',        'adulteração de odômetro'),
  ('term', 'quilometragem + baix',   'adulteração de odômetro'),
  ('term', 'km + adulter',           'adulteração de odômetro'),

  -- CNH e pontuação. 'cnh + facil' ficou FORA: despachante honesto escreve
  -- "renovação de CNH fácil e rápida".
  ('term', 'cnh + sem autoescola',   'habilitação irregular'),
  ('term', 'cnh + sem prova',        'habilitação irregular'),
  ('term', 'cnh + quente',           'habilitação irregular'),
  ('term', 'limpar pontos',          'pontuação da CNH'),
  ('term', 'pontos + sumir',         'pontuação da CNH'),
  ('term', 'multa + sumir',          'pontuação da CNH'),

  -- Segurança e emissões: ILEGAIS no Brasil, mas vizinhos do vocabulário de
  -- oficina. São os primeiros candidatos a sair se derem falso positivo — o
  -- '+' é o que separa "remoção de catalisador" de "limpeza de catalisador".
  ('term', 'catalisador + remo',     'CONAMA — emissões'),
  ('term', 'catalisador + tirar',    'CONAMA — emissões'),
  ('term', 'airbag + cancel',        'item de segurança'),
  ('term', 'airbag + desativ',       'item de segurança'),
  ('term', 'abs + desativ',          'item de segurança'),

  -- Fora do escopo do app
  ('term', 'arma de fogo',           'fora de escopo'),
  ('term', 'municao',                'fora de escopo'),
  ('term', 'cocaina',                'fora de escopo'),
  ('term', 'maconha',                'fora de escopo'),
  ('term', 'garota de programa',     'fora de escopo'),
  ('term', 'acompanhante de luxo',   'fora de escopo'),

  -- Golpe financeiro
  ('term', 'lucro garantido',        'promessa de retorno'),
  ('term', 'renda extra + garantid', 'promessa de retorno'),
  ('term', 'investimento + garantid','promessa de retorno')

  -- Nenhuma categoria entra sensível. 'vehicle-paperwork' (documentação) era a
  -- candidata óbvia, e o teste mostrou o custo: mandava para a fila o
  -- despachante registrado que anuncia transferência e licenciamento, serviço
  -- legítimo e dos mais buscados. O anúncio irregular dessa categoria já cai
  -- pelos termos de CNH. Se um dia valer marcar alguma:
  --   insert into public.service_moderation_flags (kind, value, note)
  --   values ('category', 'vehicle-paperwork', 'motivo aqui');
on conflict (kind, value) do nothing;
