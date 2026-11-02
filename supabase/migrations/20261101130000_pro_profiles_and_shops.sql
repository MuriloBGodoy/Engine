-- Conta profissional, página profissional e Lojas (produtos).
--
-- Antes: quem anunciava era só "a pessoa" — o anúncio guardava nome, cidade e
-- WhatsApp soltos em `data`, e o "perfil de vendedor" era um modal que lia as
-- configurações. Não havia como uma oficina com três sócios ter UMA vitrine,
-- nem como vender uma peça.
--
-- Agora há dois caminhos, copiados de quem já resolveu isso:
--
--   1. "Anunciar como você" (Instagram/TikTok: trocar a conta para
--      profissional). A pessoa continua com o MESMO @; ganha categoria,
--      contato, horário e área de atendimento. É uma linha `pro_profiles`
--      kind='person' com user_id = a pessoa. Voltar para conta pessoal é
--      apagar essa linha (os anúncios dela vão junto — a tela avisa).
--
--   2. "Criar página profissional" (Facebook Pages / TikTok Shop): entidade
--      separada, com @ PRÓPRIO, logo, capa, bio, endereço, horário, WhatsApp
--      e equipe. kind='page', handle = o @ sem arroba.
--
-- Decisões:
--
--   a. O @ da página mora no MESMO registro dos @ das pessoas
--      (`usernames`), numa coluna nova `page_id`. Uma linha é de uma pessoa
--      OU de uma página, nunca das duas. Por isso @menção resolve sem
--      ambiguidade (`resolve_handle`) e ninguém registra como pessoa o @ de
--      uma página (nem o contrário). O @ da página não muda depois de criado,
--      pelo mesmo motivo do slug do anúncio: é link de bio.
--
--   b. Equipe com três papéis, no espírito do "controle total / parcial" do
--      Facebook:
--        owner  — tudo, inclusive apagar a página e mexer em qualquer papel;
--        admin  — edita a página, anúncios e mensagens; convida/remove editor;
--        editor — anúncios e mensagens.
--      Entrar na equipe é CONVITE (status 'invited') que a pessoa aceita.
--      Toda página tem pelo menos um owner ativo: o último não sai nem é
--      rebaixado; se a conta dele for excluída, o admin mais antigo vira
--      owner, e sem admin a página é apagada (como o Facebook desativa a
--      página sem ninguém com controle total).
--
--   c. Anúncio (serviço OU produto) pertence a um perfil profissional:
--      `service_listings.profile_id`. `owner_id` continua sendo QUEM CRIOU
--      (responsabilidade e pasta das fotos); quem pode editar/apagar é a
--      equipe do perfil. Produto é a mesma tabela com kind='product': herda a
--      fila de moderação, o guard dos campos leves, o slug, as métricas, a
--      denúncia e a conversa. Cliente antigo (PWA em cache) que grava sem
--      profile_id cai no perfil pessoal profissional do autor, criado na hora.
--
--   d. Conversa sobre anúncio de PÁGINA é da página: `conversations.profile_id`
--      e o cartão do lado do prestador é o da página (nome, @, logo). Quem
--      está na equipe lê e responde (caixa compartilhada); `provider_id`
--      continua sendo quem criou o anúncio e é quem recebe o aviso no sino.
--      A mensagem guarda o remetente real (sender_id) — responsabilidade.
--
--   e. Produto vendido não abre conversa nova ('sold'); quem já conversava
--      continua.
--
--   f. Sem pagamento na plataforma: preço é informação, o negócio fecha no
--      chat ou no WhatsApp.

-- ---------------------------------------------------------------------------
-- Perfis profissionais
-- ---------------------------------------------------------------------------

create table public.pro_profiles (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('person', 'page')),
  user_id uuid unique references auth.users (id) on delete cascade,
  handle text unique,
  name text not null default '',
  data jsonb not null default '{}'::jsonb,
  suspended boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_profiles_shape check (
    (kind = 'person' and user_id is not null and handle is null)
    or (kind = 'page' and user_id is null and handle ~ '^[a-z0-9._]{3,24}$')
  )
);
create index pro_profiles_created_by on public.pro_profiles (created_by);
alter table public.pro_profiles enable row level security;

create table public.pro_profile_members (
  profile_id uuid not null references public.pro_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (profile_id, user_id)
);
create index pro_profile_members_user on public.pro_profile_members (user_id);
alter table public.pro_profile_members enable row level security;

-- O @ da página no mesmo registro dos @ das pessoas (decisão a).
alter table public.usernames alter column user_id drop not null;
alter table public.usernames
  add column page_id uuid references public.pro_profiles (id) on delete cascade;
alter table public.usernames
  add constraint usernames_one_owner check (num_nonnulls(user_id, page_id) = 1);
create index usernames_page on public.usernames (page_id);

-- ---------------------------------------------------------------------------
-- Quem é o quê
-- ---------------------------------------------------------------------------

-- Papel ATIVO de p_user no perfil (null = não é da equipe). Interno.
create or replace function public.pro_role(p_profile uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.pro_profile_members m
  where m.profile_id = p_profile and m.user_id = p_user and m.status = 'active';
$$;
revoke execute on function public.pro_role(uuid, uuid) from public, anon, authenticated;

-- "Eu sou da equipe deste perfil?" (com papel entre p_roles). As políticas
-- perguntam isto, então roda para quem lê.
create or replace function public.is_pro_member(p_profile uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile is not null and auth.uid() is not null and exists (
    select 1 from public.pro_profile_members m
    where m.profile_id = p_profile and m.user_id = auth.uid() and m.status = 'active'
      and (p_roles is null or m.role = any (p_roles))
  );
$$;
grant execute on function public.is_pro_member(uuid, text[]) to anon, authenticated;

-- O perfil aparece para quem lê? Suspenso pela moderação, ou de conta
-- suspensa, só a equipe e a moderação veem.
create or replace function public.pro_profile_visible(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile is null or public.is_service_admin() or public.is_pro_member(p_profile) or exists (
    select 1 from public.pro_profiles p
    where p.id = p_profile and not p.suspended
      and (p.kind = 'page' or not public.is_account_suspended(p.user_id))
  );
$$;
grant execute on function public.pro_profile_visible(uuid) to anon, authenticated;

-- Cartão da página para a conversa (o lado do prestador). Interno.
create or replace function public.pro_page_card(p_profile uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'author', coalesce(nullif(left(p.name, 80), ''), '@' || p.handle),
    'username', '@' || p.handle,
    'avatar', left(coalesce(p.data ->> 'logo', ''), 500),
    'avatarInitials', upper(left(regexp_replace(coalesce(nullif(p.name, ''), p.handle), '[^[:alnum:]]', '', 'g'), 2)),
    'pageId', p.id,
    'pageHandle', p.handle
  )
  from public.pro_profiles p where p.id = p_profile and p.kind = 'page';
$$;
revoke execute on function public.pro_page_card(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O que o perfil guarda (lista fechada, tamanhos curtos)
-- ---------------------------------------------------------------------------

create or replace function public.pro_profile_clean_data(p_data jsonb, p_kind text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := coalesce(p_data, '{}'::jsonb);
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_max integer;
  v_text text;
  v_limits jsonb := jsonb_build_object(
    'category', 60, 'bio', 500, 'hours', 300, 'address', 160, 'city', 80,
    'state', 8, 'country', 4, 'serviceArea', 160, 'whatsapp', 32,
    'whatsappCountry', 6, 'email', 120, 'instagram', 40, 'tiktok', 40,
    'website', 160, 'logo', 500, 'cover', 500
  );
begin
  for v_key, v_max in select key, value::integer from jsonb_each_text(v_limits) loop
    -- Página tem logo e capa próprios; a pessoa usa o avatar do perfil.
    if p_kind = 'person' and v_key in ('logo', 'cover') then
      continue;
    end if;
    v_text := btrim(coalesce(v ->> v_key, ''));
    if v_text <> '' then
      -- Imagem só por https (o Storage); nada de data: ou javascript:.
      if v_key in ('logo', 'cover', 'website') and v_text !~* '^https://' then
        continue;
      end if;
      v_out := v_out || jsonb_build_object(v_key, left(v_text, v_max));
    end if;
  end loop;
  -- Esconder o contato, como o "não mostrar contato" do Instagram.
  if jsonb_typeof(v -> 'hideContact') = 'boolean' then
    v_out := v_out || jsonb_build_object('hideContact', v -> 'hideContact');
  end if;
  return v_out;
end;
$$;

create or replace function public.pro_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.data := public.pro_profile_clean_data(new.data, case when tg_op = 'INSERT' then new.kind else old.kind end);
  new.name := left(btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g')), 80);
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  new.updated_at := now();
  -- Identidade não muda por edição comum. A moderação suspende.
  new.id := old.id;
  new.kind := old.kind;
  new.user_id := old.user_id;
  new.handle := old.handle;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if not public.is_service_admin() then
    new.suspended := old.suspended;
    if public.is_account_suspended(auth.uid()) then
      raise exception 'account-suspended' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.pro_profiles_guard() from public, anon, authenticated;
create trigger pro_profiles_guard before insert or update on public.pro_profiles
  for each row execute function public.pro_profiles_guard();

-- Leitura pública (é vitrine). Criar só pelas funções; editar: owner/admin
-- da página, ou a própria pessoa; apagar: owner (ou a pessoa).
create policy "pro: vitrine publica" on public.pro_profiles
  for select using (public.pro_profile_visible(id));
create policy "pro: equipe edita" on public.pro_profiles
  for update using (public.is_pro_member(id, array['owner', 'admin']) or public.is_service_admin())
  with check (public.is_pro_member(id, array['owner', 'admin']) or public.is_service_admin());
create policy "pro: dono apaga" on public.pro_profiles
  for delete using (public.is_pro_member(id, array['owner']) or public.is_service_admin());

-- Equipe: cada um vê a própria linha (inclusive o convite) e quem está na
-- equipe vê a equipe inteira. Escrita só pelas funções.
create policy "pro equipe: a propria e a da equipe" on public.pro_profile_members
  for select using (
    user_id = (select auth.uid())
    or public.is_pro_member(profile_id)
    or public.is_service_admin()
  );

-- ---------------------------------------------------------------------------
-- Equipe: nunca sem owner (decisão b)
-- ---------------------------------------------------------------------------

create or replace function public.pro_profile_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next uuid;
begin
  if old.role <> 'owner' or old.status <> 'active' then
    return old;
  end if;
  if not exists (select 1 from public.pro_profiles where id = old.profile_id and kind = 'page') then
    return old;
  end if;
  if exists (
    select 1 from public.pro_profile_members
    where profile_id = old.profile_id and role = 'owner' and status = 'active'
  ) then
    return old;
  end if;
  select user_id into v_next from public.pro_profile_members
    where profile_id = old.profile_id and role = 'admin' and status = 'active'
    order by accepted_at nulls last, created_at
    limit 1;
  if v_next is null then
    delete from public.pro_profiles where id = old.profile_id;
  else
    update public.pro_profile_members set role = 'owner'
      where profile_id = old.profile_id and user_id = v_next;
  end if;
  return old;
end;
$$;
revoke execute on function public.pro_profile_members_after_delete() from public, anon, authenticated;
create trigger pro_profile_members_after_delete after delete on public.pro_profile_members
  for each row execute function public.pro_profile_members_after_delete();

-- ---------------------------------------------------------------------------
-- O @ das pessoas: não pega o de uma página
-- ---------------------------------------------------------------------------

-- Igual à de 20261016230000, com `is distinct from`: a linha de uma página
-- tem user_id nulo, e `nulo <> eu` não é verdadeiro — a versão antiga
-- devolvia o @ da página como se fosse da pessoa.
create or replace function public.reserve_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := lower(regexp_replace(coalesce(p_username, ''), '^@+', ''));
  v_owner uuid;
  v_found boolean;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  v_name := left(regexp_replace(v_name, '[^a-z0-9._]', '', 'g'), 24);
  if v_name = '' then
    return '';
  end if;

  insert into public.usernames (username, user_id)
  values (v_name, v_uid)
  on conflict (username) do nothing;

  select user_id, true into v_owner, v_found from public.usernames where username = v_name;
  if not coalesce(v_found, false) or v_owner is distinct from v_uid then
    raise exception 'username-taken' using errcode = 'P0001';
  end if;

  update public.usernames set updated_at = now() where username = v_name;
  return '@' || v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Criar e editar
-- ---------------------------------------------------------------------------

-- O perfil profissional pessoal de p_user, criado se ainda não existe. Usado
-- pelo "anunciar como você" e pelo anúncio gravado sem perfil. Interno.
create or replace function public.ensure_person_pro_profile(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user is null then
    return null;
  end if;
  select id into v_id from public.pro_profiles where user_id = p_user;
  if v_id is null then
    insert into public.pro_profiles (kind, user_id, name, created_by)
    values ('person', p_user, coalesce((select author from public.public_profiles where user_id = p_user), ''), p_user)
    on conflict (user_id) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.pro_profiles where user_id = p_user;
    end if;
  end if;
  insert into public.pro_profile_members (profile_id, user_id, role, status, accepted_at)
  values (v_id, p_user, 'owner', 'active', now())
  on conflict (profile_id, user_id) do nothing;
  return v_id;
end;
$$;
revoke execute on function public.ensure_person_pro_profile(uuid) from public, anon, authenticated;

-- "Anunciar como você": liga (ou atualiza) a conta profissional da pessoa.
create or replace function public.save_my_professional(p_name text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if public.is_account_suspended(v_uid) then
    raise exception 'account-suspended' using errcode = '42501';
  end if;
  v_id := public.ensure_person_pro_profile(v_uid);
  update public.pro_profiles
    set name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
        data = coalesce(p_data, '{}'::jsonb)
    where id = v_id;
  return v_id;
end;
$$;
revoke execute on function public.save_my_professional(text, jsonb) from public, anon;
grant execute on function public.save_my_professional(text, jsonb) to authenticated;

-- "Criar página profissional": reserva o @ e vira owner.
create or replace function public.create_pro_page(p_handle text, p_name text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_handle text := lower(regexp_replace(btrim(coalesce(p_handle, '')), '^@+', ''));
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 80);
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if public.is_account_suspended(v_uid) then
    raise exception 'account-suspended' using errcode = '42501';
  end if;
  if v_handle !~ '^[a-z0-9._]{3,24}$'
     or v_handle in ('engine', 'admin', 'moderacao', 'suporte', 'support', 'servicos', 'lojas', 'produtos') then
    raise exception 'invalid-handle' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception 'invalid-name' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('pro_page_create:' || v_uid::text));
  if (select count(*) from public.pro_profile_members m join public.pro_profiles p on p.id = m.profile_id
      where m.user_id = v_uid and m.role = 'owner' and p.kind = 'page') >= 5 then
    raise exception 'too-many-pages' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.usernames where username = v_handle) then
    raise exception 'handle-taken' using errcode = 'P0001';
  end if;

  insert into public.pro_profiles (kind, handle, name, data, created_by)
  values ('page', v_handle, v_name, coalesce(p_data, '{}'::jsonb), v_uid)
  returning id into v_id;
  begin
    insert into public.usernames (username, page_id) values (v_handle, v_id);
  exception when unique_violation then
    raise exception 'handle-taken' using errcode = 'P0001';
  end;
  insert into public.pro_profile_members (profile_id, user_id, role, status, accepted_at)
  values (v_id, v_uid, 'owner', 'active', now());
  return v_id;
end;
$$;
revoke execute on function public.create_pro_page(text, text, jsonb) from public, anon;
grant execute on function public.create_pro_page(text, text, jsonb) to authenticated;

-- "@x está livre?" enquanto a pessoa digita (página nova ou @ de pessoa).
-- 'available' | 'taken' | 'invalid' | 'reserved'. Leitura de um fato que o
-- registro de @ já mostra publicamente; não reserva nada.
create or replace function public.handle_available(p_handle text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when v !~ '^[a-z0-9._]{3,24}$' then 'invalid'
    when v in ('engine', 'admin', 'moderacao', 'suporte', 'support', 'servicos', 'lojas', 'produtos') then 'reserved'
    when exists (select 1 from public.usernames where username = v) then 'taken'
    else 'available'
  end
  from (select lower(regexp_replace(btrim(coalesce(p_handle, '')), '^@+', '')) v) t;
$$;
grant execute on function public.handle_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Equipe
-- ---------------------------------------------------------------------------

-- Convida por @. owner convida qualquer papel; admin, só editor.
create or replace function public.invite_pro_member(p_profile uuid, p_username text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_my_role text := public.pro_role(p_profile, auth.uid());
  v_target uuid;
  v_name text := lower(regexp_replace(btrim(coalesce(p_username, '')), '^@+', ''));
  v_page public.pro_profiles;
begin
  select * into v_page from public.pro_profiles where id = p_profile;
  if not found or v_page.kind <> 'page' or v_my_role is null or v_my_role = 'editor' then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if p_role not in ('owner', 'admin', 'editor') then
    raise exception 'invalid-role' using errcode = 'P0001';
  end if;
  if v_my_role = 'admin' and p_role <> 'editor' then
    raise exception 'forbidden-role' using errcode = '42501';
  end if;
  select user_id into v_target from public.usernames where username = v_name and user_id is not null;
  if v_target is null or public.is_account_suspended(v_target) then
    raise exception 'user-not-found' using errcode = 'P0002';
  end if;
  if v_target = v_uid then
    raise exception 'already-member' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(v_uid, v_target) then
    raise exception 'user-not-found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.pro_profile_members where profile_id = p_profile and user_id = v_target) then
    raise exception 'already-member' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pro_profile_members where profile_id = p_profile) >= 20 then
    raise exception 'team-full' using errcode = 'P0001';
  end if;

  insert into public.pro_profile_members (profile_id, user_id, role, status, invited_by)
  values (p_profile, v_target, p_role, 'invited', v_uid);

  perform public.notify(v_target, v_uid, 'pro_invite', jsonb_build_object(
    'pageId', p_profile,
    'pageHandle', v_page.handle,
    'pageName', left(v_page.name, 80),
    'role', p_role,
    'targetPath', '/services?pro=1'
  ));
  return v_target;
end;
$$;
revoke execute on function public.invite_pro_member(uuid, text, text) from public, anon;
grant execute on function public.invite_pro_member(uuid, text, text) to authenticated;

-- Aceitar (vira ativo) ou recusar (some) o próprio convite.
create or replace function public.respond_pro_invite(p_profile uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_accept then
    update public.pro_profile_members set status = 'active', accepted_at = now()
      where profile_id = p_profile and user_id = v_uid and status = 'invited';
  else
    delete from public.pro_profile_members
      where profile_id = p_profile and user_id = v_uid and status = 'invited';
  end if;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.respond_pro_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_pro_invite(uuid, boolean) to authenticated;

-- Tirar alguém (ou sair). owner tira qualquer um; admin tira editor e
-- convite que ele mesmo pode fazer; qualquer um sai. O último owner não sai.
create or replace function public.remove_pro_member(p_profile uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_my_role text := public.pro_role(p_profile, auth.uid());
  v_target public.pro_profile_members;
begin
  select * into v_target from public.pro_profile_members where profile_id = p_profile and user_id = p_user;
  if not found or not exists (select 1 from public.pro_profiles where id = p_profile and kind = 'page') then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if p_user <> v_uid then
    if v_my_role is null or v_my_role = 'editor'
       or (v_my_role = 'admin' and v_target.role <> 'editor') then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
  end if;
  if v_target.role = 'owner' and v_target.status = 'active' and (
    select count(*) from public.pro_profile_members
    where profile_id = p_profile and role = 'owner' and status = 'active'
  ) <= 1 then
    raise exception 'last-owner' using errcode = 'P0001';
  end if;
  delete from public.pro_profile_members where profile_id = p_profile and user_id = p_user;
end;
$$;
revoke execute on function public.remove_pro_member(uuid, uuid) from public, anon;
grant execute on function public.remove_pro_member(uuid, uuid) to authenticated;

-- Trocar papel: só owner. O último owner não se rebaixa.
create or replace function public.set_pro_member_role(p_profile uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.pro_profile_members;
begin
  if public.pro_role(p_profile, auth.uid()) is distinct from 'owner'
     or not exists (select 1 from public.pro_profiles where id = p_profile and kind = 'page') then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if p_role not in ('owner', 'admin', 'editor') then
    raise exception 'invalid-role' using errcode = 'P0001';
  end if;
  select * into v_target from public.pro_profile_members where profile_id = p_profile and user_id = p_user;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if v_target.role = 'owner' and p_role <> 'owner' and v_target.status = 'active' and (
    select count(*) from public.pro_profile_members
    where profile_id = p_profile and role = 'owner' and status = 'active'
  ) <= 1 then
    raise exception 'last-owner' using errcode = 'P0001';
  end if;
  update public.pro_profile_members set role = p_role where profile_id = p_profile and user_id = p_user;
end;
$$;
revoke execute on function public.set_pro_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_pro_member_role(uuid, uuid, text) to authenticated;

-- A equipe com cartão (nome, @, avatar) para a tela de equipe. Só quem é da
-- equipe; os outros recebem lista vazia.
create or replace function public.pro_team(p_profile uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'userId', m.user_id,
      'role', m.role,
      'status', m.status,
      'createdAt', m.created_at,
      'author', coalesce(nullif(p.author, ''), 'Usuário Engine'),
      'username', coalesce(p.username, ''),
      'avatar', coalesce(p.data ->> 'avatar', '')
    ) order by array_position(array['owner', 'admin', 'editor'], m.role), m.created_at), '[]'::jsonb)
  from public.pro_profile_members m
  left join public.public_profiles p on p.user_id = m.user_id
  where m.profile_id = p_profile and public.is_pro_member(p_profile);
$$;
revoke execute on function public.pro_team(uuid) from public, anon;
grant execute on function public.pro_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- @ -> quem é (para @menção na bio, no post, no link)
-- ---------------------------------------------------------------------------

-- Devolve { type: person|page|club|event, id, handle, proProfileId? } ou
-- null. Pessoa e página dividem o mesmo registro (`usernames`), então nunca
-- empatam. Clube responde pela sigla (TAG) e evento pelo id, só quando
-- nenhum @ casa — a outra frente pode trocar isso quando clube/evento
-- ganharem @ próprio no mesmo registro.
create or replace function public.resolve_handle(p_text text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw text := btrim(regexp_replace(coalesce(p_text, ''), '^@+', ''));
  v_name text := lower(v_raw);
  v_row public.usernames;
  v_club text;
  v_event text;
begin
  if v_raw = '' or length(v_raw) > 120 then
    return null;
  end if;
  select * into v_row from public.usernames where username = v_name;
  if found then
    if v_row.user_id is not null then
      if not public.account_visible(v_row.user_id) then
        return null;
      end if;
      return jsonb_build_object(
        'type', 'person', 'id', v_row.user_id, 'handle', v_row.username,
        'proProfileId', (select p.id from public.pro_profiles p
                         where p.user_id = v_row.user_id and public.pro_profile_visible(p.id))
      );
    end if;
    if public.pro_profile_visible(v_row.page_id) then
      return jsonb_build_object('type', 'page', 'id', v_row.page_id, 'handle', v_row.username);
    end if;
    return null;
  end if;
  if v_raw ~ '^[A-Za-z0-9]{2,5}$' then
    select id into v_club from public.clubs where tag = upper(v_raw) and not archived;
    if v_club is not null then
      return jsonb_build_object('type', 'club', 'id', v_club, 'handle', upper(v_raw));
    end if;
  end if;
  select id into v_event from public.events where id = v_raw;
  if v_event is not null then
    return jsonb_build_object('type', 'event', 'id', v_event, 'handle', v_event);
  end if;
  return null;
end;
$$;
grant execute on function public.resolve_handle(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Anúncio pertence a um perfil; produto é anúncio com kind='product'
-- ---------------------------------------------------------------------------

alter table public.service_listings
  add column kind text not null default 'service' check (kind in ('service', 'product')),
  add column profile_id uuid references public.pro_profiles (id) on delete cascade;
create index service_listings_profile on public.service_listings (profile_id, moderation_status);
create index service_listings_kind on public.service_listings (kind, moderation_status, updated_at desc);

-- Migração dos anúncios que já existem (em produção: um de teste). Cada
-- autor ganha o perfil profissional pessoal, com o contato e o lugar do
-- anúncio mais recente dele. Escrita de confiança: a guarda não carimba
-- updated_at nem manda nada de volta para a fila.
select public.trust_this_transaction();

insert into public.pro_profiles (kind, user_id, name, data, created_by)
select distinct on (l.owner_id)
  'person', l.owner_id,
  coalesce(nullif(p.author, ''), l.data ->> 'providerName', ''),
  jsonb_strip_nulls(jsonb_build_object(
    'category', l.data ->> 'category',
    'city', l.data ->> 'city',
    'state', l.data ->> 'state',
    'country', l.data ->> 'country',
    'address', l.data ->> 'address',
    'serviceArea', l.data ->> 'serviceArea',
    'hours', l.data ->> 'availability',
    'whatsapp', l.data ->> 'whatsapp',
    'whatsappCountry', l.data ->> 'whatsappCountry',
    'instagram', l.data ->> 'instagram',
    'tiktok', l.data ->> 'tiktok'
  )),
  l.owner_id
from public.service_listings l
left join public.public_profiles p on p.user_id = l.owner_id
order by l.owner_id, l.updated_at desc
on conflict (user_id) do nothing;

insert into public.pro_profile_members (profile_id, user_id, role, status, accepted_at)
select id, user_id, 'owner', 'active', now()
from public.pro_profiles where kind = 'person'
on conflict (profile_id, user_id) do nothing;

update public.service_listings l
  set profile_id = p.id, kind = 'service'
  from public.pro_profiles p
  where p.user_id = l.owner_id and l.profile_id is null;

alter table public.service_listings alter column profile_id set not null;

-- Lista fechada das categorias de produto (a tela traduz o id).
create or replace function public.product_categories()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['parts', 'wheels-tires', 'sound', 'accessories', 'detailing', 'tools', 'other'];
$$;
grant execute on function public.product_categories() to anon, authenticated;

-- Os campos de produto, limpos: categoria da lista, condição, status de
-- venda, preço numérico ou "a combinar", e o "serve em" (marca, modelo, ano).
create or replace function public.product_clean_data(p_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := coalesce(p_data, '{}'::jsonb);
  v_price numeric;
  v_fit jsonb;
  v_from integer;
  v_to integer;
  v_fits jsonb := '[]'::jsonb;
  v_entry jsonb;
begin
  begin
    v_price := round(nullif(v ->> 'priceAmount', '')::numeric, 2);
  exception when others then
    v_price := null;
  end;
  if v_price is not null and (v_price < 0 or v_price > 100000000) then
    v_price := null;
  end if;
  -- "Serve em": até 5 entradas do MESMO catálogo da Garagem (códigos FIPE de
  -- marca e, opcional, de modelo) + faixa de anos. O nome vai junto só para
  -- exibir; quem casa com o carro do visitante é o código.
  if jsonb_typeof(v -> 'fits') = 'array' then
    for v_fit in select value from jsonb_array_elements(v -> 'fits') limit 5 loop
      continue when jsonb_typeof(v_fit) <> 'object';
      continue when coalesce(v_fit ->> 'brandCode', '') !~ '^[0-9]{1,6}$';
      begin
        v_from := nullif(v_fit ->> 'yearFrom', '')::integer;
      exception when others then v_from := null;
      end;
      begin
        v_to := nullif(v_fit ->> 'yearTo', '')::integer;
      exception when others then v_to := null;
      end;
      if v_from is not null and v_from not between 1900 and 2100 then v_from := null; end if;
      if v_to is not null and v_to not between 1900 and 2100 then v_to := null; end if;
      if v_from is not null and v_to is not null and v_to < v_from then v_to := v_from; end if;
      v_entry := jsonb_strip_nulls(jsonb_build_object(
        'brandCode', v_fit ->> 'brandCode',
        'brand', nullif(left(btrim(coalesce(v_fit ->> 'brand', '')), 40), ''),
        'modelCode', case when coalesce(v_fit ->> 'modelCode', '') ~ '^[0-9]{1,8}$' then v_fit ->> 'modelCode' end,
        'model', nullif(left(btrim(coalesce(v_fit ->> 'model', '')), 80), ''),
        'yearFrom', v_from,
        'yearTo', v_to
      ));
      v_fits := v_fits || jsonb_build_array(v_entry);
    end loop;
  end if;

  return (v - 'fits' - 'priceAmount' - 'priceNegotiable' - 'acceptsOffers' - 'condition' - 'saleStatus' - 'category' - 'currency')
    || jsonb_build_object(
      'category', case when v ->> 'category' = any (public.product_categories()) then v ->> 'category' else 'other' end,
      'condition', case when v ->> 'condition' in ('new', 'used') then v ->> 'condition' else 'used' end,
      'saleStatus', case when v ->> 'saleStatus' = 'sold' then 'sold' else 'available' end,
      'priceNegotiable', v_price is null or coalesce(v -> 'priceNegotiable' = 'true'::jsonb, false),
      'acceptsOffers', coalesce(v -> 'acceptsOffers' = 'true'::jsonb, false),
      'priceAmount', v_price,
      'currency', case when upper(coalesce(v ->> 'currency', '')) ~ '^[A-Z]{3}$' then upper(v ->> 'currency') else 'BRL' end,
      'fits', v_fits
    )
    || case when jsonb_typeof(v -> 'photos') = 'array'
         then jsonb_build_object('photos', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                select value x from jsonb_array_elements(v -> 'photos') limit 10) t))
         else '{}'::jsonb end;
end;
$$;

-- Roda depois do service_listings_guard e antes do slug (ordem alfabética
-- dos BEFORE triggers): decide perfil e tipo, limpa os campos de produto e
-- barra conta suspensa da equipe (o suspension_guard só olha o owner_id).
create or replace function public.service_listings_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_service_admin();
begin
  if public.is_trusted_write() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.kind := case when new.kind = 'product' then 'product' else 'service' end;
    if new.profile_id is null then
      new.profile_id := public.ensure_person_pro_profile(new.owner_id);
    elsif not v_admin and public.pro_role(new.profile_id, auth.uid()) is null then
      -- Anunciar em nome de um perfil exige estar na equipe dele. Checado
      -- aqui, e não na política: o perfil criado na linha acima ainda não é
      -- visível para uma função STABLE dentro do mesmo comando.
      raise exception 'not-found' using errcode = 'P0002';
    end if;
  elsif not v_admin then
    new.kind := old.kind;
    new.profile_id := old.profile_id;
  end if;
  if not v_admin and public.is_account_suspended(auth.uid()) then
    raise exception 'account-suspended' using errcode = '42501';
  end if;
  if new.kind = 'product' then
    new.data := public.product_clean_data(new.data);
  end if;
  return new;
end;
$$;
revoke execute on function public.service_listings_profile() from public, anon, authenticated;
create trigger service_listings_profile before insert or update on public.service_listings
  for each row execute function public.service_listings_profile();

-- Campos leves ganham os do produto: preço, "a combinar", moeda e vendido.
-- (Mesma lista de engine/src/services/serviceListingRules.js.)
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
      'priceAmount', 'priceNegotiable', 'acceptsOffers', 'priceFrom', 'currency', 'saleStatus',
      -- contabilidade
      'id', 'ownerId', 'slug', 'moderationStatus', 'moderationNote',
      'moderationHistory', 'reviewedBy', 'reviewedAt', 'submittedAt',
      'createdAt', 'updatedAt', 'viewCount', 'detailCount', 'whatsappCount',
      'ratingCount', 'ratingAvg', 'subscriptionStatus',
      'profileId', 'kind'
    ])
    and value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, 'false'::jsonb);
$$;

-- Quem mexe no anúncio é a equipe do perfil (decisão c).
drop policy if exists "anuncios: aprovado, dono ou moderacao" on public.service_listings;
drop policy if exists "anuncios: dono envia para fila" on public.service_listings;
drop policy if exists "anuncios: dono edita ou moderacao" on public.service_listings;
drop policy if exists "anuncios: dono ou moderacao apaga" on public.service_listings;

create policy "anuncios: aprovado, equipe ou moderacao" on public.service_listings
  for select using (
    moderation_status = 'approved'
    or public.is_pro_member(profile_id)
    or public.is_service_admin()
  );
-- A equipe do perfil é conferida no service_listings_profile (acima).
create policy "anuncios: equipe envia para fila" on public.service_listings
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and moderation_status = 'pending'
  );
create policy "anuncios: equipe edita ou moderacao" on public.service_listings
  for update using (public.is_pro_member(profile_id) or public.is_service_admin())
  with check (
    public.is_service_admin()
    or (public.is_pro_member(profile_id) and moderation_status in ('pending', 'approved'))
  );
create policy "anuncios: equipe ou moderacao apaga" on public.service_listings
  for delete using (public.is_pro_member(profile_id) or public.is_service_admin());
-- Página suspensa: os anúncios dela somem junto.
create policy "anuncios: perfil suspenso some" on public.service_listings
  as restrictive for select using (public.pro_profile_visible(profile_id));

-- Pedido de orçamento é só para SERVIÇO (a categoria 'other' existe nos dois).
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
    when p_listing.kind <> 'service'
      or p_listing.moderation_status <> 'approved'
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

-- ---------------------------------------------------------------------------
-- Conversa: a de anúncio de página é da página (decisão d)
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column profile_id uuid references public.pro_profiles (id) on delete set null;
create index conversations_profile on public.conversations (profile_id, updated_at desc) where profile_id is not null;

-- Preenche o perfil a partir do anúncio e mantém o cartão da página no lado
-- do prestador — inclusive quando reply_quote_request regrava o cartão.
create or replace function public.conversations_pro_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card jsonb;
begin
  if new.kind <> 'service' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.profile_id is null and new.listing_id is not null then
    select profile_id into new.profile_id from public.service_listings where id = new.listing_id;
  elsif tg_op = 'UPDATE' then
    -- Ninguém troca a página de uma conversa (só preenche a que não tinha).
    -- Nulo passa: é a página apagada (on delete set null).
    if new.profile_id is not null then
      new.profile_id := coalesce(old.profile_id, new.profile_id);
    end if;
  end if;
  if new.profile_id is not null and new.provider_id is not null then
    v_card := public.pro_page_card(new.profile_id);
    if v_card is not null then
      new.members := coalesce(new.members, '{}'::jsonb) || jsonb_build_object(new.provider_id::text, v_card);
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.conversations_pro_profile() from public, anon, authenticated;
create trigger conversations_pro_profile before insert or update on public.conversations
  for each row execute function public.conversations_pro_profile();

-- Quem age em nome de quem na conversa: o próprio membro, ou — para quem é
-- da equipe da página e não é o cliente — o prestador. Null = não é dela.
create or replace function public.conversation_actor(p_conv public.conversations, p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user is null then null
    when p_user = any (p_conv.member_ids) then p_user
    when p_conv.kind = 'service' and p_conv.profile_id is not null
         and p_user is distinct from p_conv.customer_id
         and public.pro_role(p_conv.profile_id, p_user) is not null
      then p_conv.provider_id
    else null
  end;
$$;
revoke execute on function public.conversation_actor(public.conversations, uuid) from public, anon, authenticated;

create or replace function public.is_conversation_member(p_conversation text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation and public.conversation_actor(c, auth.uid()) is not null
  );
$$;

drop policy if exists "conversas: so os dois" on public.conversations;
create policy "conversas: os dois ou a equipe da pagina" on public.conversations
  for select using (
    (select auth.uid()) = any (member_ids)
    or (profile_id is not null and public.is_pro_member(profile_id) and (select auth.uid()) is distinct from customer_id)
  );

-- Abrir o fio: igual à de 20261030120000, mais: equipe da página não abre
-- fio com o próprio anúncio, produto vendido não abre fio novo, e o retrato
-- guarda o tipo do anúncio.
create or replace function public.start_service_conversation(
  p_listing text,
  p_car text default '',
  p_quote_request uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.service_listings;
  v_id text;
  v_ids uuid[];
  v_car text := left(btrim(regexp_replace(coalesce(p_car, ''), '\s+', ' ', 'g')), 120);
  v_quote uuid;
  v_context jsonb;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select * into v_listing from public.service_listings where id = p_listing;
  if not found or v_listing.moderation_status <> 'approved'
     or public.is_account_suspended(v_listing.owner_id)
     or not exists (select 1 from public.pro_profiles p where p.id = v_listing.profile_id and not p.suspended) then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if v_listing.owner_id = v_uid or public.pro_role(v_listing.profile_id, v_uid) is not null then
    raise exception 'own-listing' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(v_uid, v_listing.owner_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  v_id := 'svc__' || v_listing.id || '__' || v_uid::text;
  if v_listing.kind = 'product' and v_listing.data ->> 'saleStatus' = 'sold'
     and not exists (select 1 from public.conversations where id = v_id) then
    raise exception 'sold' using errcode = 'P0001';
  end if;
  if p_quote_request is not null then
    select id into v_quote from public.quote_requests
      where id = p_quote_request and customer_id = v_uid;
  end if;

  v_ids := case when v_uid::text < v_listing.owner_id::text
                then array[v_uid, v_listing.owner_id] else array[v_listing.owner_id, v_uid] end;
  v_context := jsonb_build_object(
    'listingTitle', left(coalesce(v_listing.data ->> 'title', ''), 120),
    'listingPhoto', left(coalesce(v_listing.data -> 'photos' ->> 0, ''), 500),
    'category', left(coalesce(v_listing.data ->> 'category', ''), 60),
    'listingKind', v_listing.kind
  );

  insert into public.conversations (
    id, member_ids, members, unread, kind, listing_id, customer_id, provider_id,
    quote_request_id, service_status, context, started_by, profile_id
  ) values (
    v_id, v_ids,
    jsonb_build_object(
      v_uid::text, public.chat_member_card(v_uid),
      v_listing.owner_id::text, public.chat_member_card(v_listing.owner_id)
    ),
    jsonb_build_object(v_uid::text, 0, v_listing.owner_id::text, 0),
    'service', v_listing.id, v_uid, v_listing.owner_id,
    v_quote, 'new',
    v_context || case when v_car <> '' then jsonb_build_object('car', v_car) else '{}'::jsonb end,
    v_uid, v_listing.profile_id
  )
  on conflict (id) do update set
    members = public.conversations.members || jsonb_build_object(v_uid::text, public.chat_member_card(v_uid)),
    quote_request_id = coalesce(excluded.quote_request_id, public.conversations.quote_request_id),
    context = public.conversations.context || v_context
      || case when v_car <> '' then jsonb_build_object('car', v_car) else '{}'::jsonb end;
  return v_id;
end;
$$;
revoke execute on function public.start_service_conversation(text, text, uuid) from public, anon;
grant execute on function public.start_service_conversation(text, text, uuid) to authenticated;

-- Mandar mensagem: igual à de 20261030120000, agindo pelo `conversation_actor`
-- (quem é da equipe responde como o prestador; o remetente real fica na
-- mensagem).
create or replace function public.send_message(p_conversation text, p_text text, p_type text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limits jsonb := public.quote_limits();
  v_conv public.conversations;
  v_actor uuid;
  v_recipient uuid;
  v_msg uuid;
  v_type text := coalesce(nullif(p_type, ''), 'text');
  v_text text := left(btrim(coalesce(p_text, '')), 2000);
  v_preview text;
  v_sender jsonb;
  v_metered boolean := false;
begin
  select * into v_conv from public.conversations where id = p_conversation for update;
  v_actor := case when found then public.conversation_actor(v_conv, v_uid) end;
  if v_actor is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  v_recipient := (select m from unnest(v_conv.member_ids) m where m <> v_actor limit 1);
  if public.is_blocked_between(v_uid, v_recipient) or public.is_blocked_between(v_actor, v_recipient) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if v_type not in ('text', 'post', 'image', 'gif') then
    raise exception 'invalid-type' using errcode = 'P0001';
  end if;

  if v_conv.started_by = v_actor and v_conv.first_reply_at is null and (
       (v_conv.kind = 'service' and v_actor = v_conv.customer_id)
       or (
         v_conv.kind = 'direct'
         and public.is_service_provider(v_recipient)
         and not exists (
           select 1 from public.follows f where f.follower_id = v_recipient and f.target_id = v_actor
         )
       )
     ) then
    if v_conv.opened_at is null then
      perform pg_advisory_xact_lock(hashtext('chat_first_contact:' || v_actor::text));
      if (select count(*) from public.conversations c
          where c.started_by = v_actor and c.metered and c.first_reply_at is null
            and c.opened_at > now() - make_interval(days => (v_limits ->> 'ttlDays')::integer))
         >= (v_limits ->> 'maxPendingChatsPerCustomer')::integer then
        raise exception 'too-many-open' using errcode = 'P0001';
      end if;
      if (select count(*) from public.conversations c
          where c.started_by = v_actor and c.metered and c.opened_at > now() - interval '24 hours')
         >= (v_limits ->> 'maxNewChatsPerDayPerCustomer')::integer then
        raise exception 'rate-limited' using errcode = 'P0001';
      end if;
      v_metered := true;
    elsif (select count(*) from public.messages m
           where m.conversation_id = p_conversation and m.sender_id = v_actor)
          >= (v_limits ->> 'maxMessagesBeforeReply')::integer then
      raise exception 'awaiting-reply' using errcode = 'P0001';
    end if;
  end if;

  insert into public.messages (conversation_id, sender_id, text, type, data)
  values (p_conversation, v_uid, v_text, v_type, coalesce(p_data, '{}'::jsonb))
  returning id into v_msg;

  v_preview := case
    when v_text <> '' then v_text
    when v_type = 'gif' then '🎬 GIF'
    when v_type = 'image' then '📷 Imagem'
    when p_data -> 'attachment' ->> 'title' is not null then '📷 ' || (p_data -> 'attachment' ->> 'title')
    else '📷 Publicação'
  end;

  update public.conversations set
    updated_at = now(),
    last_message = jsonb_build_object(
      'text', v_preview, 'senderId', v_uid::text, 'type', v_type,
      'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    unread = unread
      || jsonb_build_object(v_actor::text, 0)
      || jsonb_build_object(v_recipient::text, coalesce((unread ->> v_recipient::text)::integer, 0) + 1),
    opened_at = coalesce(opened_at, case when started_by = v_actor then now() end),
    metered = metered or v_metered,
    first_reply_at = case
      when first_reply_at is null and started_by is not null and started_by <> v_actor then now()
      else first_reply_at
    end,
    service_status = case
      when kind <> 'service' then service_status
      when service_status = 'closed' then 'closed'
      when v_actor = provider_id then 'replied'
      else 'new'
    end
  where id = p_conversation;

  if coalesce((v_conv.unread ->> v_recipient::text)::integer, 0) = 0 then
    v_sender := coalesce(v_conv.members -> v_actor::text, '{}'::jsonb);
    perform public.notify(v_recipient, v_uid, 'message', jsonb_build_object(
      'actorName', coalesce(nullif(left(v_sender ->> 'author', 80), ''), 'Alguém'),
      'conversationId', p_conversation,
      'targetPath', '/messages/' || p_conversation
    ));
  end if;
  return v_msg;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conv public.conversations;
  v_actor uuid;
begin
  select * into v_conv from public.conversations where id = p_conversation;
  v_actor := case when found then public.conversation_actor(v_conv, v_uid) end;
  if v_actor is null then
    return;
  end if;
  update public.conversations
    set unread = unread || jsonb_build_object(v_actor::text, 0)
    where id = p_conversation;
  update public.messages set status = 'seen'
    where conversation_id = p_conversation and status = 'delivered'
      and case
        when v_conv.kind = 'service' and v_actor = v_conv.provider_id then sender_id = v_conv.customer_id
        else sender_id is distinct from v_uid
      end;
end;
$$;

create or replace function public.set_service_conversation_status(p_conversation text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
begin
  if p_status not in ('new', 'replied', 'closed') then
    raise exception 'invalid-status' using errcode = 'P0001';
  end if;
  select * into v_conv from public.conversations where id = p_conversation and kind = 'service';
  if not found or public.conversation_actor(v_conv, auth.uid()) is distinct from v_conv.provider_id then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  update public.conversations set service_status = p_status where id = p_conversation;
end;
$$;

-- O cartão fixado: igual ao de 20261030120000, com os campos de produto e a
-- página (quando o anúncio é de página).
create or replace function public.service_conversation_context(p_conversation text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conv public.conversations;
  v_listing public.service_listings;
  v_actor uuid;
  v_role text;
  v_quote jsonb := null;
  v_page jsonb := null;
begin
  select * into v_conv from public.conversations where id = p_conversation;
  if not found or v_conv.kind <> 'service' then
    return null;
  end if;
  v_actor := public.conversation_actor(v_conv, v_uid);
  if v_actor is null then
    return null;
  end if;
  v_role := case when v_actor = v_conv.provider_id then 'provider' else 'customer' end;

  if v_conv.listing_id is not null then
    select * into v_listing from public.service_listings where id = v_conv.listing_id;
  end if;
  if v_conv.profile_id is not null then
    v_page := public.pro_page_card(v_conv.profile_id);
  end if;

  if v_conv.quote_request_id is not null then
    select jsonb_build_object(
      'id', r.id,
      'status', public.quote_status(r.status, r.expires_at),
      'category', r.category,
      'carLabel', r.car_label,
      'description', r.description,
      'city', r.city,
      'createdAt', r.created_at,
      'expiresAt', r.expires_at,
      'reply', (
        select jsonb_build_object(
          'id', q.id, 'priceMin', q.price_min, 'priceMax', q.price_max, 'currency', q.currency,
          'estimatedTime', q.estimated_time, 'message', q.message, 'createdAt', q.created_at,
          'chosen', r.chosen_reply_id is not distinct from q.id
        )
        from public.quote_replies q
        where q.request_id = r.id and q.provider_id = v_conv.provider_id
      )
    ) into v_quote
    from public.quote_requests r where r.id = v_conv.quote_request_id;
  end if;

  return jsonb_build_object(
    'role', v_role,
    'status', v_conv.service_status,
    'car', coalesce(v_conv.context ->> 'car', ''),
    'quote', v_quote,
    'page', v_page,
    'listing', case when v_listing.id is null then null else jsonb_build_object(
      'id', v_listing.id,
      'slug', v_listing.slug,
      'kind', v_listing.kind,
      'approved', v_listing.moderation_status = 'approved',
      'title', v_listing.data ->> 'title',
      'category', v_listing.data ->> 'category',
      'photo', v_listing.data -> 'photos' ->> 0,
      'price', v_listing.data ->> 'price',
      'priceFrom', coalesce(v_listing.data -> 'priceFrom' = 'true'::jsonb, false),
      'priceAmount', v_listing.data -> 'priceAmount',
      'priceNegotiable', v_listing.data -> 'priceNegotiable',
      'currency', v_listing.data ->> 'currency',
      'condition', v_listing.data ->> 'condition',
      'saleStatus', v_listing.data ->> 'saleStatus',
      'providerName', v_listing.data ->> 'providerName',
      'city', v_listing.data ->> 'city',
      'state', v_listing.data ->> 'state',
      'serviceMode', v_listing.data ->> 'serviceMode',
      'whatsapp', case when v_role = 'customer' and v_listing.moderation_status = 'approved'
                       then nullif(v_listing.data ->> 'whatsapp', '') end,
      'whatsappCountry', case when v_role = 'customer' and v_listing.moderation_status = 'approved'
                              then v_listing.data ->> 'whatsappCountry' end
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Sino: convite para a equipe da página
-- ---------------------------------------------------------------------------

-- Acrescenta 'pro_invite' à lista que estiver valendo, em vez de reescrevê-la
-- inteira: outra migração da mesma leva pode estar acrescentando tipos dela.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conname = 'notifications_type_check' and conrelid = 'public.notifications'::regclass;
  if v_def is null or position('''pro_invite''' in v_def) > 0 then
    return;
  end if;
  execute 'alter table public.notifications drop constraint notifications_type_check';
  execute 'alter table public.notifications add constraint notifications_type_check '
    || regexp_replace(v_def, '\]\)+\s*$', '') || ', ''pro_invite''::text])))';
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões e tempo real
-- ---------------------------------------------------------------------------

grant select on public.pro_profiles to anon, authenticated;
grant update, delete on public.pro_profiles to authenticated;
grant select on public.pro_profile_members to anon, authenticated;

-- Fios de serviço que já existem apontam para o perfil do anúncio.
update public.conversations c set profile_id = l.profile_id
  from public.service_listings l
  where c.kind = 'service' and c.listing_id = l.id and c.profile_id is null;
alter publication supabase_realtime add table public.pro_profile_members;
