-- Endereço público e legível de cada anúncio: /servicos/<slug>.
--
-- É o "link da bio" do prestador. Quem divulga o trabalho no Instagram ou no
-- TikTok cola esse link no perfil, então ele precisa ser curto, dizer o que é
-- (estetica-do-joao-araraquara) e, acima de tudo, NÃO MUDAR: link que muda
-- quebra a bio, o story salvo e a mensagem antiga no WhatsApp.
--
-- Decisões:
--
--   1. O slug nasce no servidor, do título + cidade, na hora de criar. O
--      cliente não escolhe. Colidiu? Ganha sufixo (-2, -3...). O mais antigo
--      fica com o nome limpo (o backfill anda por ordem de criação).
--
--   2. Depois de criado, o dono NÃO muda o slug — nem diretamente, nem
--      trocando o título. Editar o anúncio mantém o mesmo link. Isso é de
--      propósito: o anúncio de "Lavagem do Zé" que vira "Estética do Zé"
--      continua achável pelo link antigo que já está espalhado por aí.
--
--   3. A moderação pode trocar: gravando um slug novo (ele é limpo e, se
--      colidir, ganha sufixo) ou gravando `null`, que regenera a partir do
--      título e cidade atuais. É a saída para o caso raro de um nome
--      ofensivo ou de um prestador que mudou de cidade e pediu.
--
--   4. Escrita de confiança (contagem de métricas, service_role) não mexe no
--      slug: passa adiante o que veio.
--
-- O trigger se chama service_listings_slug e roda DEPOIS do
-- service_listings_guard (o Postgres dispara BEFORE triggers em ordem
-- alfabética), então já recebe id e datas acertados pela guarda.
--
-- Corrida: dois anúncios com o mesmo título e cidade criados no mesmo
-- instante podem calcular o mesmo slug; o segundo cai na unique e o salvar
-- falha uma vez (o app mostra o erro e a pessoa tenta de novo). Raro demais
-- para justificar um lock.

alter table public.service_listings add column if not exists slug text;

-- Texto -> pedaço de URL: minúsculas, sem acento, só a-z, 0-9 e hífen.
create or replace function public.slugify_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(coalesce(p_text, '')),
      'áàâãäåāéèêëēíìîïīóòôõöøōúùûüūçñýÿß',
      'aaaaaaaeeeeeiiiiiooooooouuuuucnyys'
    ),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

-- Base do slug: título + cidade, sem repetir a cidade quando o título já a
-- traz ("Estética do João Araraquara" não vira ...-araraquara-araraquara).
-- No máximo 60 caracteres, cortando no hífen para não partir palavra.
create or replace function public.service_listing_slug_base(p_title text, p_city text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_title text := public.slugify_text(p_title);
  v_city text := public.slugify_text(p_city);
  v_base text;
begin
  if v_city <> '' and position(v_city in v_title) = 0 then
    v_base := concat_ws('-', nullif(v_title, ''), v_city);
  else
    v_base := v_title;
  end if;

  if length(v_base) > 60 then
    v_base := left(v_base, 60);
    -- Corta no último hífen se ele não estiver cedo demais.
    if position('-' in reverse(v_base)) between 1 and 20 then
      v_base := left(v_base, 60 - position('-' in reverse(v_base)));
    end if;
    v_base := trim(both '-' from v_base);
  end if;

  return coalesce(nullif(v_base, ''), 'servico');
end;
$$;

-- Trigger: decide o slug de cada linha. SECURITY DEFINER porque a busca por
-- colisão precisa enxergar TODOS os anúncios — pela RLS o prestador só vê os
-- aprovados e os dele, e um pendente alheio com o mesmo nome passaria batido
-- até estourar a unique. Função de trigger não pode ser chamada direto.
create or replace function public.service_listings_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_privileged boolean := public.is_service_admin() or public.is_trusted_write();
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  if not v_privileged then
    if tg_op = 'INSERT' then
      new.slug := null;          -- quem cria não escolhe
    else
      new.slug := old.slug;      -- e quem edita não troca
    end if;
  end if;

  -- Nada a decidir: manteve o que já tinha.
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug and new.slug is not null then
    return new;
  end if;

  if coalesce(new.slug, '') = '' then
    v_base := public.service_listing_slug_base(new.data ->> 'title', new.data ->> 'city');
  else
    -- A moderação (ou o servidor) mandou um slug: limpa e garante o formato.
    v_base := coalesce(nullif(left(public.slugify_text(new.slug), 60), ''), 'servico');
    v_base := trim(both '-' from v_base);
  end if;

  v_slug := v_base;
  while exists (
    select 1 from public.service_listings
    where slug = v_slug and id <> new.id
  ) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

drop trigger if exists service_listings_slug on public.service_listings;
create trigger service_listings_slug before insert or update on public.service_listings
  for each row execute function public.service_listings_slug();

-- Backfill dos anúncios que já existem, do mais antigo para o mais novo. Como
-- escrita de confiança: assim a guarda não carimba updated_at = agora em
-- todos (o que bagunçaria a ordem da vitrine) e o trigger acima gera o slug.
do $$
declare
  r record;
begin
  perform public.trust_this_transaction();
  for r in
    select id from public.service_listings where slug is null order by created_at, id
  loop
    update public.service_listings set slug = null where id = r.id;
  end loop;
end;
$$;

alter table public.service_listings alter column slug set not null;
alter table public.service_listings
  add constraint service_listings_slug_key unique (slug);
alter table public.service_listings
  add constraint service_listings_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
