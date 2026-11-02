-- Cargos personalizáveis no clube, "árvore" (organograma e linhagem) e
-- equipe do evento.
--
-- Até aqui o clube tinha três papéis fixos (founder / captain / member) e o
-- capitão podia tudo da direção. Agora:
--
--   1. Cada clube tem a sua lista de CARGOS (`club_roles`): nome, cor da
--      paleta, posição na hierarquia e um conjunto de permissões entre cinco:
--      manage_members, edit_club, post_announcements, manage_events,
--      approve_requests. Todo clube nasce com sete cargos-padrão (Fundador,
--      Presidente, Vice, Diretor, Moderador, Membro, Prospect); o nome do
--      cargo-padrão fica vazio e a tela traduz pelo `preset`, no idioma de
--      quem lê. Renomeou, vale o nome gravado.
--
--   2. Hierarquia como a do Discord e o subconjunto do Telegram: quem tem
--      manage_members só mexe em quem está ABAIXO dele, só atribui cargo
--      abaixo do dele, e só cargo cujas permissões ele mesmo tem. Ninguém
--      muda o próprio cargo. O Fundador é único, não se atribui e não sai.
--      Editar a LISTA de cargos (criar, renomear, cores, permissões, ordem)
--      é só do Fundador.
--
--   3. A coluna antiga `club_members.role` continua existindo e coerente
--      (founder / captain / member), derivada do cargo: cargo com alguma
--      permissão de direção vira 'captain'. O app antigo e o caminho antigo
--      ("fundador promove a capitão" = update role='captain') continuam
--      funcionando — 'captain' vira o cargo Diretor, que tem exatamente o que
--      o capitão tinha. Os capitães de hoje viram Diretor.
--
--   4. As políticas que olhavam `is_club_staff` passam a olhar a permissão
--      certa (`club_can`): aprovar pedido → approve_requests; remover membro
--      → manage_members + hierarquia; editar o clube e subir foto → edit_club;
--      criar e editar encontro do clube → manage_events; fixar aviso no mural
--      → post_announcements (o `pinned` do post deixa de ser escrito pelo
--      dono do post).
--
--   5. Padrinho (`sponsor_id`), a "linhagem" — quem trouxe quem, como o
--      sponsor dos motoclubes. Gravado pelo banco na entrada: na aprovação, é
--      quem convidou (se o pedido veio de convite de um membro) ou quem
--      aprovou; na entrada aberta por link de convite, é quem convidou, se
--      ainda é membro. Membros que já existiam ficam sem padrinho. Ninguém
--      edita depois.
--
--   6. Equipe do evento (`event_team`): co-organizador, staff e convidado,
--      com selo. Co-organizador edita o evento; staff e convidado são selo.
--      Quem organiza mexe em tudo; co-organizador mexe só em staff e
--      convidado. A direção do clube com manage_events conta como
--      co-organizadora nos encontros do clube.
--
--   7. Avisos novos no sino: 'club_role' (subiu de cargo), 'event_team'
--      (entrou na equipe de um evento) e 'mention' (usado pela migration
--      seguinte, das menções na bio). A lista de tipos é LIDA da restrição
--      atual e acrescida, para não apagar tipo de outra frente que tenha
--      entrado antes.

-- ---------------------------------------------------------------------------
-- 0. Tipos novos no sino (aditivo)
-- ---------------------------------------------------------------------------

do $$
declare
  v_types text[];
begin
  select coalesce(array_agg(distinct m.arr[1]), '{}') into v_types
  from pg_constraint c,
       lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') as m(arr)
  where c.conname = 'notifications_type_check'
    and c.conrelid = 'public.notifications'::regclass;
  v_types := array(select distinct x from unnest(v_types || array['mention', 'club_role', 'event_team']) x order by x);
  alter table public.notifications drop constraint if exists notifications_type_check;
  -- Mesma forma que o Postgres devolve (ARRAY['a'::text, ...]): outra
  -- migration que acrescente tipo pelo texto da restrição continua casando.
  execute 'alter table public.notifications add constraint notifications_type_check check (type = any (array['
    || (select string_agg(quote_literal(x) || '::text', ', ') from unnest(v_types) x)
    || ']))';
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Vocabulário de permissões
-- ---------------------------------------------------------------------------

create or replace function public.club_permission_list()
returns text[]
language sql immutable
set search_path = ''
as $$
  select array['manage_members', 'edit_club', 'post_announcements', 'manage_events', 'approve_requests'];
$$;

-- O papel antigo, derivado do cargo. post_announcements sozinho não faz de
-- ninguém "direção" no sentido antigo.
create or replace function public.club_legacy_role(p_role_id text, p_perms text[])
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p_role_id = 'founder' then 'founder'
    when coalesce(p_perms, '{}') && array['manage_members', 'edit_club', 'manage_events', 'approve_requests'] then 'captain'
    else 'member'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Cargos
-- ---------------------------------------------------------------------------

create table public.club_roles (
  club_id text not null references public.clubs (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9-]{1,40}$'),
  preset text not null default '' check (preset in (
    '', 'founder', 'president', 'vice', 'director', 'moderator', 'member', 'prospect'
  )),
  name text not null default '' check (char_length(name) <= 24),
  color text not null default '' check (public.club_palette_ok(color)),
  position integer not null default 85 check (position between 0 and 1000),
  permissions text[] not null default '{}' check (permissions <@ public.club_permission_list()),
  created_at timestamptz not null default now(),
  primary key (club_id, id)
);
create index club_roles_order on public.club_roles (club_id, position);
alter table public.club_roles enable row level security;
-- Nome e cor de cargo são vitrine (o selo aparece em qualquer lista).
-- Escrita só pelas funções abaixo.
create policy "cargos: vitrine publica" on public.club_roles for select using (true);

create or replace function public.club_seed_roles(p_club text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.club_roles (club_id, id, preset, color, position, permissions) values
    (p_club, 'founder', 'founder', 'laranja-turbo', 0, public.club_permission_list()),
    (p_club, 'president', 'president', 'vermelho-corrida', 10, public.club_permission_list()),
    (p_club, 'vice', 'vice', 'vinho', 20, public.club_permission_list()),
    (p_club, 'director', 'director', 'azul-mercosul', 30, public.club_permission_list()),
    (p_club, 'moderator', 'moderator', 'verde-bandeira', 40,
      array['manage_members', 'approve_requests', 'post_announcements']),
    (p_club, 'member', 'member', '', 90, '{}'),
    (p_club, 'prospect', 'prospect', 'grafite', 95, '{}')
  on conflict do nothing;
$$;
revoke execute on function public.club_seed_roles(text) from public, anon, authenticated;

create or replace function public.clubs_seed_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.club_seed_roles(new.id);
  return new;
end;
$$;
create trigger clubs_seed_roles after insert on public.clubs
  for each row execute function public.clubs_seed_roles();

do $$
declare
  v_id text;
begin
  for v_id in select id from public.clubs loop
    perform public.club_seed_roles(v_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Membros: cargo e padrinho
-- ---------------------------------------------------------------------------

alter table public.club_members
  add column role_id text,
  add column sponsor_id uuid references auth.users (id) on delete set null;
create index club_members_sponsor on public.club_members (club_id, sponsor_id);

alter table public.club_requests
  add column invited_by uuid references auth.users (id) on delete set null;

-- Quem posso o quê, para MIM. `security definer` para ler club_members sem
-- cair na RLS dele. Fundador pode tudo.
create or replace function public.club_can(p_club text, p_perm text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce((
    select m.role_id = 'founder' or p_perm = any (r.permissions)
    from public.club_members m
    join public.club_roles r on r.club_id = m.club_id and r.id = m.role_id
    where m.club_id = p_club and m.uid = auth.uid()
  ), false);
$$;

-- Posição do cargo de alguém no clube (menor = mais alto). null = não é membro.
create or replace function public.club_member_position(p_club text, p_uid uuid)
returns integer
language sql stable
security definer
set search_path = ''
as $$
  select r.position
  from public.club_members m
  join public.club_roles r on r.club_id = m.club_id and r.id = m.role_id
  where m.club_id = p_club and m.uid = p_uid;
$$;
revoke execute on function public.club_member_position(text, uuid) from public, anon, authenticated;

-- Remover alguém: nunca o Fundador, nunca a si mesmo (isso é sair), e só
-- quem está abaixo na hierarquia.
create or replace function public.club_can_remove(p_club text, p_target uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_target is distinct from auth.uid()
    and coalesce((select role_id from public.club_members where club_id = p_club and uid = p_target), 'founder') <> 'founder'
    and public.club_can(p_club, 'manage_members')
    and coalesce(
      public.club_member_position(p_club, auth.uid()) < public.club_member_position(p_club, p_target),
      false
    );
$$;

-- Entrada. O cliente não escolhe cargo nem (fora do convite) padrinho.
create or replace function public.club_members_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_server boolean := public.is_trusted_write() or auth.uid() is null;
  v_entry text;
  v_inviter uuid;
  v_perms text[];
begin
  if new.role = 'founder' and v_server then
    new.role_id := 'founder';
    new.sponsor_id := null;
  else
    if not v_server and (new.role <> 'member' or new.role_id is not null) then
      raise exception 'not-allowed' using errcode = '42501';
    end if;
    if v_server and new.role_id is null and new.role = 'captain' then
      -- Servidor (seed, script) ainda falando o papel antigo.
      new.role_id := 'director';
    elsif new.role_id is null or not v_server then
      -- Cargo de entrada do clube (ex.: Prospect), desde que sem permissão.
      select data ->> 'entryRoleId' into v_entry from public.clubs where id = new.club_id;
      if v_entry is null or not exists (
        select 1 from public.club_roles
        where club_id = new.club_id and id = v_entry and id <> 'founder' and permissions = '{}'
      ) then
        v_entry := 'member';
      end if;
      new.role_id := v_entry;
    end if;

    if not v_server then
      if v_uid <> new.uid then
        -- Aprovação: o padrinho é quem convidou (se ainda é membro) ou quem
        -- aprovou.
        select invited_by into v_inviter from public.club_requests
          where club_id = new.club_id and uid = new.uid;
        if v_inviter is null or v_inviter = new.uid or not exists (
          select 1 from public.club_members where club_id = new.club_id and uid = v_inviter
        ) then
          v_inviter := v_uid;
        end if;
        new.sponsor_id := v_inviter;
      elsif new.sponsor_id is not null and (
        new.sponsor_id = new.uid
        or not exists (select 1 from public.club_members where club_id = new.club_id and uid = new.sponsor_id)
        or public.is_blocked_between(new.uid, new.sponsor_id)
      ) then
        new.sponsor_id := null;
      end if;
    end if;
  end if;

  select permissions into v_perms from public.club_roles where club_id = new.club_id and id = new.role_id;
  if not found then
    raise exception 'invalid-role' using errcode = 'P0001';
  end if;
  new.role := public.club_legacy_role(new.role_id, v_perms);
  return new;
end;
$$;
revoke execute on function public.club_members_before_insert() from public, anon, authenticated;

-- Troca de cargo. Substitui o guard antigo (só fundador, só captain/member).
create or replace function public.club_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_perms text[];
  v_new_pos integer;
  v_old_pos integer;
  v_actor_role text;
  v_actor_pos integer;
  v_actor_perms text[];
begin
  if public.is_trusted_write() or v_uid is null then
    -- Servidor: só mantém role e role_id coerentes.
    if new.role_id is distinct from old.role_id then
      select permissions into v_perms from public.club_roles where club_id = new.club_id and id = new.role_id;
      if not found then
        raise exception 'invalid-role' using errcode = 'P0001';
      end if;
      new.role := public.club_legacy_role(new.role_id, v_perms);
    elsif new.role is distinct from old.role then
      -- Mexeu só no papel antigo: se ele já bate com o cargo (a lista de
      -- permissões do cargo mudou), fica; senão vale o mapa antigo.
      select permissions into v_perms from public.club_roles where club_id = new.club_id and id = new.role_id;
      if public.club_legacy_role(new.role_id, v_perms) is distinct from new.role then
        new.role_id := case new.role when 'founder' then 'founder' when 'captain' then 'director' else 'member' end;
      end if;
    end if;
    return new;
  end if;

  if new.club_id <> old.club_id or new.uid <> old.uid or new.joined_at <> old.joined_at
     or new.sponsor_id is distinct from old.sponsor_id then
    raise exception 'not-allowed' using errcode = '42501';
  end if;

  -- Caminho antigo: mexeu só no `role`. 'captain' é o Diretor.
  if new.role_id is not distinct from old.role_id and new.role is distinct from old.role then
    if new.role not in ('captain', 'member') then
      raise exception 'not-allowed' using errcode = '42501';
    end if;
    new.role_id := case new.role when 'captain' then 'director' else 'member' end;
  end if;

  if new.role_id is distinct from old.role_id then
    if old.uid = v_uid or old.role_id = 'founder' or new.role_id = 'founder' then
      raise exception 'not-allowed' using errcode = '42501';
    end if;
    select position, permissions into v_new_pos, v_perms
      from public.club_roles where club_id = old.club_id and id = new.role_id;
    if not found then
      raise exception 'invalid-role' using errcode = 'P0001';
    end if;
    select m.role_id, r.position, r.permissions into v_actor_role, v_actor_pos, v_actor_perms
      from public.club_members m
      join public.club_roles r on r.club_id = m.club_id and r.id = m.role_id
      where m.club_id = old.club_id and m.uid = v_uid;
    if v_actor_role is null then
      raise exception 'not-allowed' using errcode = '42501';
    end if;
    if v_actor_role <> 'founder' then
      select position into v_old_pos from public.club_roles where club_id = old.club_id and id = old.role_id;
      if not ('manage_members' = any (v_actor_perms))
         or v_actor_pos >= coalesce(v_old_pos, 1000)
         or v_actor_pos >= v_new_pos
         or not (v_perms <@ v_actor_perms) then
        raise exception 'not-allowed' using errcode = '42501';
      end if;
    end if;
    new.role := public.club_legacy_role(new.role_id, v_perms);
  else
    new.role := old.role;
  end if;

  if (new.display_name, new.username, new.avatar, new.title)
     is distinct from (old.display_name, old.username, old.avatar, old.title)
     and old.uid <> v_uid then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.club_members_guard() from public, anon, authenticated;

-- Os membros de hoje: fundador → Fundador, capitão → Diretor, resto → Membro.
-- Sem sessão, o guard novo só mantém a coerência.
update public.club_members set role_id = case role
  when 'founder' then 'founder'
  when 'captain' then 'director'
  else 'member'
end
where role_id is null;

alter table public.club_members alter column role_id set not null;
alter table public.club_members
  add constraint club_members_role_fk foreign key (club_id, role_id)
  references public.club_roles (club_id, id);
create index club_members_role on public.club_members (club_id, role_id);

create trigger club_members_before_insert before insert on public.club_members
  for each row execute function public.club_members_before_insert();

-- Subiu de cargo: um aviso. Rebaixar não avisa (o Discord também não).
create or replace function public.club_members_role_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old integer;
  v_role public.club_roles;
  v_club_name text;
begin
  select position into v_old from public.club_roles where club_id = old.club_id and id = old.role_id;
  select * into v_role from public.club_roles where club_id = new.club_id and id = new.role_id;
  if v_role.position >= coalesce(v_old, 1000) then
    return new;
  end if;
  select left(coalesce(data ->> 'name', ''), 80) into v_club_name from public.clubs where id = new.club_id;
  perform public.notify(new.uid, auth.uid(), 'club_role', jsonb_build_object(
    'clubId', new.club_id,
    'clubName', coalesce(v_club_name, ''),
    'roleId', v_role.id,
    'rolePreset', v_role.preset,
    'roleName', v_role.name,
    'targetPath', '/clubs/' || new.club_id
  ));
  return new;
end;
$$;
revoke execute on function public.club_members_role_notify() from public, anon, authenticated;
create trigger club_members_role_notify after update of role_id on public.club_members
  for each row when (old.role_id is distinct from new.role_id)
  execute function public.club_members_role_notify();

-- Pedido que veio de convite: o convidante tem de ser membro.
create or replace function public.club_requests_inviter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invited_by is not null and (
    new.invited_by = new.uid
    or not exists (select 1 from public.club_members where club_id = new.club_id and uid = new.invited_by)
    or public.is_blocked_between(new.uid, new.invited_by)
  ) then
    new.invited_by := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.club_requests_inviter() from public, anon, authenticated;
create trigger club_requests_inviter before insert on public.club_requests
  for each row execute function public.club_requests_inviter();

-- ---------------------------------------------------------------------------
-- 4. Políticas: da permissão certa, não de "ser direção"
-- ---------------------------------------------------------------------------

drop policy if exists "membros: entrada aberta ou aprovada" on public.club_members;
create policy "membros: entrada aberta ou aprovada" on public.club_members
  for insert to authenticated with check (
    role = 'member'
    and (
      (uid = (select auth.uid()) and public.club_is_open(club_id))
      or (public.club_can(club_id, 'approve_requests') and public.club_has_request(club_id, uid))
    )
  );

drop policy if exists "membros: proprio cartao ou fundador" on public.club_members;
create policy "membros: proprio cartao ou direcao" on public.club_members
  for update using (uid = (select auth.uid()) or public.club_can(club_id, 'manage_members'));

drop policy if exists "membros: sair ou remover" on public.club_members;
create policy "membros: sair ou remover" on public.club_members
  for delete using (
    (uid = (select auth.uid()) and role <> 'founder')
    or public.club_can_remove(club_id, uid)
  );

drop policy if exists "pedidos: quem pediu ou direcao le" on public.club_requests;
create policy "pedidos: quem pediu ou direcao le" on public.club_requests
  for select using (uid = (select auth.uid()) or public.club_can(club_id, 'approve_requests'));
drop policy if exists "pedidos: quem pediu ou direcao apaga" on public.club_requests;
create policy "pedidos: quem pediu ou direcao apaga" on public.club_requests
  for delete using (uid = (select auth.uid()) or public.club_can(club_id, 'approve_requests'));

-- Foto do clube: quem edita o clube.
create or replace function public.club_can_upload(p_club text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.club_can(p_club, 'edit_club')
      and exists (select 1 from public.clubs where id = p_club and not archived),
    false
  );
$$;
drop policy if exists "fotos: direcao do clube ve a pasta" on storage.objects;
create policy "fotos: direcao do clube ve a pasta" on storage.objects
  for select to authenticated using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'clubs'
    and public.club_can((storage.foldername(name))[2], 'edit_club')
  );
drop policy if exists "fotos: direcao do clube apaga" on storage.objects;
create policy "fotos: direcao do clube apaga" on storage.objects
  for delete to authenticated using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'clubs'
    and public.club_can((storage.foldername(name))[2], 'edit_club')
  );

-- ---------------------------------------------------------------------------
-- 5. Edição do clube por permissão (mesma função de 20261029150000, com o
--    portão trocado e `entryRoleId`, do Fundador)
-- ---------------------------------------------------------------------------

create or replace function public.update_club(p_club_id text, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.club_role(p_club_id);
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_captain_keys text[] := array[
    'description', 'rules', 'links', 'meetupSchedule',
    'cover', 'logo', 'colors', 'emblem'
  ];
  v_key text;
begin
  if v_role is null then
    raise exception 'not-member' using errcode = '42501';
  end if;
  if v_role <> 'founder' and not public.club_can(p_club_id, 'edit_club') then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'invalid-patch' using errcode = 'P0001';
  end if;
  v_patch := v_patch - array['tag', 'founderId', 'memberCount', 'official', 'archived', 'createdAt', 'updatedAt', 'id'];
  if v_role <> 'founder' then
    for v_key in select jsonb_object_keys(v_patch) loop
      if not v_key = any (v_captain_keys) then
        raise exception 'not-allowed' using errcode = '42501';
      end if;
    end loop;
  end if;

  foreach v_key in array array['logo', 'cover'] loop
    if v_patch ? v_key then
      if jsonb_typeof(v_patch -> v_key) <> 'string'
         or not public.club_image_ok(p_club_id, v_patch ->> v_key) then
        raise exception 'invalid-image' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  if v_patch ? 'colors' and (jsonb_typeof(v_patch -> 'colors') <> 'object' or not public.club_colors_ok(v_patch -> 'colors')) then
    raise exception 'invalid-colors' using errcode = 'P0001';
  end if;
  if v_patch ? 'emblem' and (jsonb_typeof(v_patch -> 'emblem') <> 'object' or not public.club_emblem_ok(v_patch -> 'emblem')) then
    raise exception 'invalid-emblem' using errcode = 'P0001';
  end if;
  -- Cargo de entrada: '' (Membro) ou um cargo do clube sem permissão.
  if v_patch ? 'entryRoleId' and not (
    jsonb_typeof(v_patch -> 'entryRoleId') = 'string'
    and (
      v_patch ->> 'entryRoleId' = ''
      or exists (
        select 1 from public.club_roles
        where club_id = p_club_id and id = v_patch ->> 'entryRoleId' and id <> 'founder' and permissions = '{}'
      )
    )
  ) then
    raise exception 'invalid-role' using errcode = 'P0001';
  end if;

  update public.clubs set
    data = data || v_patch,
    name_lower = case when v_patch ? 'name' then lower(v_patch ->> 'name') else name_lower end,
    country = case when v_patch ? 'country' then coalesce(nullif(v_patch ->> 'country', ''), 'BR') else country end,
    state = case when v_patch ? 'state' then coalesce(v_patch ->> 'state', '') else state end,
    join_policy = case when v_patch ? 'joinPolicy'
      then case when v_patch ->> 'joinPolicy' = 'approval' then 'approval' else 'open' end
      else join_policy end,
    content_visibility = case when v_patch ? 'contentVisibility'
      then case when v_patch ->> 'contentVisibility' = 'members' then 'members' else 'public' end
      else content_visibility end,
    focus_brands = case when v_patch -> 'focus' ? 'brands'
      then coalesce(array(select jsonb_array_elements_text(v_patch -> 'focus' -> 'brands')), '{}')
      else focus_brands end,
    focus_styles = case when v_patch -> 'focus' ? 'styles'
      then coalesce(array(select jsonb_array_elements_text(v_patch -> 'focus' -> 'styles')), '{}')
      else focus_styles end,
    updated_at = now()
  where id = p_club_id;
end;
$$;
revoke execute on function public.update_club(text, jsonb) from public, anon;
grant execute on function public.update_club(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Editar a lista de cargos (só o Fundador)
-- ---------------------------------------------------------------------------

create or replace function public.club_roles_refresh_members(p_club text, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perms text[];
begin
  select permissions into v_perms from public.club_roles where club_id = p_club and id = p_role;
  perform public.trust_this_transaction();
  update public.club_members set role = public.club_legacy_role(role_id, v_perms)
    where club_id = p_club and role_id = p_role
      and role is distinct from public.club_legacy_role(role_id, v_perms);
end;
$$;
revoke execute on function public.club_roles_refresh_members(text, text) from public, anon, authenticated;

create or replace function public.club_require_founder(p_club text)
returns void
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if public.is_account_suspended(auth.uid()) then
    raise exception 'account-suspended' using errcode = '42501';
  end if;
  if public.club_role(p_club) is distinct from 'founder' then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.clubs where id = p_club and archived) then
    raise exception 'club-archived' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.club_require_founder(text) from public, anon, authenticated;

-- Cria (sem id) ou edita um cargo. Fundador e Membro: nome e cor; as
-- permissões e a posição desses dois são fixas.
create or replace function public.club_save_role(p_club text, p_role jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(p_role ->> 'id', '');
  v_row public.club_roles;
  v_name text := btrim(coalesce(p_role ->> 'name', ''));
  v_color text := coalesce(p_role ->> 'color', '');
  v_perms text[];
  v_pos integer;
begin
  perform public.club_require_founder(p_club);
  if jsonb_typeof(p_role) <> 'object' then
    raise exception 'invalid-role' using errcode = 'P0001';
  end if;
  if char_length(v_name) > 24 or v_name ~ '[<>]' then
    raise exception 'invalid-role-name' using errcode = 'P0001';
  end if;
  if not public.club_palette_ok(v_color) then
    raise exception 'invalid-colors' using errcode = 'P0001';
  end if;
  if p_role ? 'permissions' then
    if jsonb_typeof(p_role -> 'permissions') <> 'array' then
      raise exception 'invalid-role' using errcode = 'P0001';
    end if;
    v_perms := array(select distinct x from jsonb_array_elements_text(p_role -> 'permissions') x order by x);
    if not (v_perms <@ public.club_permission_list()) then
      raise exception 'invalid-role' using errcode = 'P0001';
    end if;
  end if;

  if v_id is null then
    if (select count(*) from public.club_roles where club_id = p_club) >= 20 then
      raise exception 'too-many-roles' using errcode = 'P0001';
    end if;
    if v_name = '' then
      raise exception 'invalid-role-name' using errcode = 'P0001';
    end if;
    v_id := 'r-' || substr(md5(gen_random_uuid()::text), 1, 10);
    -- Novo cargo entra logo acima de Membro.
    select coalesce(min(position), 90) - 1 into v_pos from public.club_roles
      where club_id = p_club and preset in ('member', 'prospect');
    insert into public.club_roles (club_id, id, preset, name, color, position, permissions)
    values (p_club, v_id, '', v_name, v_color, greatest(v_pos, 1), coalesce(v_perms, '{}'));
    return v_id;
  end if;

  select * into v_row from public.club_roles where club_id = p_club and id = v_id for update;
  if not found then
    raise exception 'invalid-role' using errcode = 'P0001';
  end if;
  if v_row.preset = '' and v_name = '' then
    raise exception 'invalid-role-name' using errcode = 'P0001';
  end if;
  if v_row.id in ('founder', 'member') then
    v_perms := v_row.permissions;
  end if;
  update public.club_roles set
    name = v_name,
    color = v_color,
    permissions = coalesce(v_perms, permissions)
  where club_id = p_club and id = v_id;
  perform public.club_roles_refresh_members(p_club, v_id);
  return v_id;
end;
$$;
revoke execute on function public.club_save_role(text, jsonb) from public, anon;
grant execute on function public.club_save_role(text, jsonb) to authenticated;

-- Apagar: quem tinha o cargo vira Membro. Fundador e Membro não se apagam.
create or replace function public.club_delete_role(p_club text, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.club_require_founder(p_club);
  if p_role in ('founder', 'member') then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.club_roles where club_id = p_club and id = p_role) then
    raise exception 'invalid-role' using errcode = 'P0001';
  end if;
  perform public.trust_this_transaction();
  update public.club_members set role_id = 'member' where club_id = p_club and role_id = p_role;
  update public.clubs set data = data || jsonb_build_object('entryRoleId', '')
    where id = p_club and data ->> 'entryRoleId' = p_role;
  delete from public.club_roles where club_id = p_club and id = p_role;
end;
$$;
revoke execute on function public.club_delete_role(text, text) from public, anon;
grant execute on function public.club_delete_role(text, text) to authenticated;

-- Ordem: a lista inteira (menos o Fundador, que é sempre o primeiro).
create or replace function public.club_reorder_roles(p_club text, p_ids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text[];
  v_i integer;
begin
  perform public.club_require_founder(p_club);
  select array_agg(id order by id) into v_expected from public.club_roles
    where club_id = p_club and id <> 'founder';
  if p_ids is null
     or array_length(p_ids, 1) is distinct from array_length(v_expected, 1)
     or (select array_agg(x order by x) from unnest(p_ids) x) is distinct from v_expected then
    raise exception 'invalid-role' using errcode = 'P0001';
  end if;
  for v_i in 1 .. array_length(p_ids, 1) loop
    update public.club_roles set position = v_i * 10 where club_id = p_club and id = p_ids[v_i];
  end loop;
end;
$$;
revoke execute on function public.club_reorder_roles(text, text[]) from public, anon;
grant execute on function public.club_reorder_roles(text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Aviso fixado no mural (post_announcements)
-- ---------------------------------------------------------------------------

-- `pinned` em community_goals.data deixa de ser do dono do post.
create or replace function public.community_goals_pin_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_write() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.data := coalesce(new.data, '{}'::jsonb) - 'pinned';
    return new;
  end if;
  new.data := (coalesce(new.data, '{}'::jsonb) - 'pinned')
    || case when old.data ? 'pinned' then jsonb_build_object('pinned', old.data -> 'pinned') else '{}'::jsonb end;
  return new;
end;
$$;
create trigger community_goals_pin_guard before insert or update on public.community_goals
  for each row execute function public.community_goals_pin_guard();

create or replace function public.club_pin_post(p_post_id text, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club text;
begin
  if auth.uid() is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select club_id into v_club from public.community_goals where id = p_post_id;
  if not found or v_club = '' then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if not public.club_can(v_club, 'post_announcements') then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  if coalesce(p_pinned, false) and (
    select count(*) from public.community_goals
    where club_id = v_club and id <> p_post_id and data ->> 'pinned' = 'true'
  ) >= 3 then
    raise exception 'too-many-pinned' using errcode = 'P0001';
  end if;
  perform public.trust_this_transaction();
  update public.community_goals
    set data = data || jsonb_build_object('pinned', coalesce(p_pinned, false)), updated_at = now()
    where id = p_post_id;
end;
$$;
revoke execute on function public.club_pin_post(text, boolean) from public, anon;
grant execute on function public.club_pin_post(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Equipe do evento
-- ---------------------------------------------------------------------------

create table public.event_team (
  event_id text not null references public.events (id) on delete cascade,
  uid uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('co_organizer', 'staff', 'guest')),
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, uid)
);
create index event_team_uid on public.event_team (uid);
alter table public.event_team enable row level security;
-- Mesma regra da lista de presença: quem tem conta vê. Escrita só pelas
-- funções abaixo.
create policy "equipe: quem tem conta ve" on public.event_team
  for select to authenticated using (true);
create policy "suspensao: equipe some" on public.event_team
  as restrictive for select using (public.account_visible(uid));

create or replace function public.event_team_role(p_event text, p_uid uuid)
returns text
language sql stable
security definer
set search_path = ''
as $$
  select role from public.event_team where event_id = p_event and uid = p_uid;
$$;
revoke execute on function public.event_team_role(text, uuid) from public, anon, authenticated;

-- Pode editar o evento: quem criou, co-organizador, ou a direção do clube
-- com manage_events (encontro do clube).
create or replace function public.event_can_edit(p_event text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = p_event and (
      e.created_by = auth.uid()
      or public.event_team_role(e.id, auth.uid()) = 'co_organizer'
      or (e.club_id <> '' and public.club_can(e.club_id, 'manage_events'))
    )
  );
$$;

drop policy if exists "eventos: cria por si" on public.events;
create policy "eventos: cria por si" on public.events
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (club_id = '' or public.club_can(club_id, 'manage_events'))
  );
drop policy if exists "eventos: criador edita" on public.events;
create policy "eventos: organizacao edita" on public.events
  for update using (public.event_can_edit(id)) with check (public.event_can_edit(id));

create or replace function public.events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if public.is_trusted_write() then
    return new;
  end if;
  new.created_by := old.created_by;
  if new.club_id <> old.club_id then
    -- Só quem criou troca o clube do evento, e para um clube onde pode.
    if auth.uid() is distinct from old.created_by
       or (new.club_id <> '' and not public.club_can(new.club_id, 'manage_events')) then
      raise exception 'not-allowed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.event_team_set(p_event text, p_uid uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_actor_org boolean;
  v_current text;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if public.is_account_suspended(v_uid) then
    raise exception 'account-suspended' using errcode = '42501';
  end if;
  if p_role not in ('co_organizer', 'staff', 'guest') then
    raise exception 'invalid-role' using errcode = 'P0001';
  end if;
  select * into v_event from public.events where id = p_event for update;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if not public.event_can_edit(p_event) then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  v_actor_org := v_event.created_by = v_uid;
  if p_uid is null or p_uid = v_event.created_by or p_uid = v_uid then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  v_current := public.event_team_role(p_event, p_uid);
  -- Co-organizador é escolha de quem organiza.
  if not v_actor_org and (p_role = 'co_organizer' or v_current = 'co_organizer') then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.public_profiles where user_id = p_uid)
     or public.is_account_suspended(p_uid)
     or public.is_blocked_between(v_uid, p_uid)
     or public.is_blocked_between(v_event.created_by, p_uid) then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if v_current is null and (select count(*) from public.event_team where event_id = p_event) >= 30 then
    raise exception 'team-full' using errcode = 'P0001';
  end if;
  if v_current is not distinct from p_role then
    return;
  end if;

  insert into public.event_team (event_id, uid, role, added_by)
  values (p_event, p_uid, p_role, v_uid)
  on conflict (event_id, uid) do update set role = excluded.role, added_by = excluded.added_by;

  perform public.notify(p_uid, v_uid, 'event_team', jsonb_build_object(
    'eventId', p_event,
    'eventTitle', left(coalesce(v_event.data ->> 'title', ''), 120),
    'teamRole', p_role,
    'targetPath', '/events/' || p_event
  ));
end;
$$;
revoke execute on function public.event_team_set(text, uuid, text) from public, anon;
grant execute on function public.event_team_set(text, uuid, text) to authenticated;

-- Sair da equipe é sempre livre; tirar alguém segue a mesma régua.
create or replace function public.event_team_remove(p_event text, p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_creator uuid;
  v_current text;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  v_current := public.event_team_role(p_event, p_uid);
  if v_current is null then
    return;
  end if;
  if p_uid <> v_uid then
    select created_by into v_creator from public.events where id = p_event;
    if not public.event_can_edit(p_event)
       or (v_current = 'co_organizer' and v_creator is distinct from v_uid) then
      raise exception 'not-allowed' using errcode = '42501';
    end if;
  end if;
  delete from public.event_team where event_id = p_event and uid = p_uid;
end;
$$;
revoke execute on function public.event_team_remove(text, uuid) from public, anon;
grant execute on function public.event_team_remove(text, uuid) to authenticated;
