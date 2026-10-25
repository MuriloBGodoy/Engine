-- Editar um anúncio aprovado sem tirar ele do ar, e a moderação podendo
-- tirar do ar um anúncio que já estava aprovado.
--
-- Antes: qualquer edição do dono voltava o anúncio para 'pending' (a RLS só
-- aceitava 'pending' do dono), e a leitura pública só mostra 'approved'.
-- Trocar o preço derrubava o anúncio até alguém da moderação olhar de novo.
--
-- Agora o banco separa dois tipos de campo dentro de `data`:
--
--   LEVES (editam com o anúncio no ar): price, availability, whatsapp,
--   whatsappCountry, email, instagram, tiktok, serviceArea, active.
--   São contato, preço e agenda — o que o prestador muda toda semana e que
--   não muda o que o anúncio É.
--
--   O RESTO (título, descrição, fotos, categoria, nome, endereço, cidade,
--   modo de atendimento, tags, experiência, site, vídeo): mudou qualquer um,
--   o anúncio volta para a fila. Site e vídeo ficam aqui de propósito: são
--   links livres, e trocar um link aprovado por outro qualquer é o golpe
--   clássico depois da aprovação. Instagram e TikTok guardam só o @ (o app
--   monta o link), por isso podem ser leves.
--
-- Quem decide é o guard (trigger), não a tela: a tela só AVISA antes de
-- salvar ("isso volta para aprovação"), com a mesma lista
-- (engine/src/services/serviceListingRules.js). As duas listas precisam
-- andar juntas.
--
-- O dono também deixa de poder mexer no que é da moderação dentro de `data`:
-- moderationNote, moderationHistory, reviewedBy, reviewedAt e submittedAt.
-- submittedAt passa a ser carimbado pelo servidor — é por ele que a fila
-- anda do mais antigo para o mais novo, e o dono não pode furar a fila
-- escrevendo uma data antiga.
--
-- Novo status 'suspended' ("tirado do ar"): a moderação tira do ar um
-- anúncio que já estava aprovado, com motivo. Público não vê; o dono vê o
-- motivo e pode corrigir e reenviar (volta para 'pending').
--
-- Categoria: `category` mora dentro de `data` (jsonb) e não tem CHECK no
-- banco, então as 10 categorias novas de 25/10/2026 não pedem nada aqui.
--
-- Moderador: continua sendo public.is_service_admin(), agora a ÚNICA fonte.
-- O app pergunta ao banco (rpc) em vez de ter a própria lista de e-mails.
-- Trocar o e-mail da moderação = mudar só essa função.
--
-- Parte da versão MAIS RECENTE do guard (20261025130000_service_reviews.sql,
-- que acrescentou rating_count/rating_sum) e mantém tudo o que ela fazia.

-- ---------------------------------------------------------------------------
-- Status 'suspended'
-- ---------------------------------------------------------------------------

alter table public.service_listings
  drop constraint if exists service_listings_moderation_status_check;
alter table public.service_listings
  add constraint service_listings_moderation_status_check
  check (moderation_status in ('pending', 'approved', 'changes_requested', 'rejected', 'suspended'));

-- ---------------------------------------------------------------------------
-- O que conta como "mudou o anúncio"
-- ---------------------------------------------------------------------------

-- `data` sem os campos leves e sem a contabilidade (moderação, datas,
-- contadores). Vazio ("", null, []) some, para que "campo ausente" e "campo
-- vazio" não pareçam mudança — o app às vezes omite a chave, às vezes manda "".
create or replace function public.service_listing_review_fields(p_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(coalesce(p_data, '{}'::jsonb))
  where key <> all (array[
      -- leves
      'price', 'availability', 'whatsapp', 'whatsappCountry', 'email',
      'instagram', 'tiktok', 'serviceArea', 'active',
      -- contabilidade
      'id', 'ownerId', 'slug', 'moderationStatus', 'moderationNote',
      'moderationHistory', 'reviewedBy', 'reviewedAt', 'submittedAt',
      'createdAt', 'updatedAt', 'viewCount', 'detailCount', 'whatsappCount',
      'ratingCount', 'ratingAvg', 'subscriptionStatus'
    ])
    and value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);
$$;

-- Agora em ISO com "Z", no mesmo formato que o app grava (toISOString), para
-- a ordenação da fila comparar maçã com maçã.
create or replace function public.service_listing_now_iso()
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- ---------------------------------------------------------------------------
-- Guard
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
      -- Anúncio novo entra na fila, sem nota de moderação herdada e com a
      -- data de envio do servidor.
      new.moderation_status := 'pending';
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
    -- Mudou o que o anúncio é, ou ele não estava no ar: fila. Quem já
    -- estava esperando não perde o lugar por corrigir um detalhe.
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

-- ---------------------------------------------------------------------------
-- RLS: o dono grava 'pending' ou 'approved' — e o guard acima já decidiu
-- qual dos dois, antes desta checagem (WITH CHECK roda depois dos BEFORE
-- triggers). 'approved' vindo do dono só passa porque o guard só o mantém
-- quando já era aprovado e nada além de campo leve mudou.
-- ---------------------------------------------------------------------------

drop policy if exists "anuncios: dono edita (volta pra fila) ou moderacao" on public.service_listings;
drop policy if exists "anuncios: dono edita ou moderacao" on public.service_listings;
create policy "anuncios: dono edita ou moderacao" on public.service_listings
  for update using (owner_id = (select auth.uid()) or public.is_service_admin())
  with check (
    public.is_service_admin()
    or (owner_id = (select auth.uid()) and moderation_status in ('pending', 'approved'))
  );

-- O app pergunta "sou moderação?" ao banco. Visitante recebe false.
grant execute on function public.is_service_admin() to anon, authenticated;

revoke execute on function public.service_listings_guard() from public, anon, authenticated;
