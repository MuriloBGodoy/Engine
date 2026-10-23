-- Engine no Supabase: esquema, segurança (RLS) e funções.
--
-- Port do `firestore.rules` (700 linhas) para Postgres. Cada coleção virou
-- tabela; o que regra e consulta precisam enxergar é coluna, o resto mora em
-- `data jsonb` — é o que deixa o front devolver às telas o mesmo formato de
-- objeto de antes.
--
-- Três coisas ficaram MAIS fortes que no Firestore, e por isso mudaram de
-- forma, não só de sintaxe:
--
--   1. Contadores de vitrine (`likes_count` do post, `member_count` do clube)
--      não são mais escritos pelo cliente com passo preso em ±1. Quem mantém é
--      trigger, a partir da tabela de verdade. Não há escrita alheia para
--      vigiar porque ela deixou de existir.
--   2. Cascata. Apagar post leva as curtidas; apagar evento leva a presença;
--      apagar a conta leva tudo que é dela. No Firestore isso ficava órfão
--      ("pede Cloud Function").
--   3. Lotação de evento é checada no banco, dentro da escrita. Antes dava
--      para estourar o teto por um com duas confirmações no mesmo instante.
--
-- Escrita que precisa tocar linha de outra pessoa (comentar, avaliar, criar
-- clube, mandar mensagem, excluir conta) passa por função `security definer`.
-- Essas funções ligam `engine.trusted` só dentro da transação; os triggers de
-- proteção liberam as colunas sensíveis apenas com essa bandeira.

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------

create or replace function public.is_service_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'email', '') in ('muxdtuber@gmail.com');
$$;

create or replace function public.is_trusted_write()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(current_setting('engine.trusted', true), '') = 'on';
$$;

create or replace function public.trust_this_transaction()
returns void
language sql volatile
set search_path = ''
as $$
  select set_config('engine.trusted', 'on', true);
$$;
revoke execute on function public.trust_this_transaction() from public, anon, authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conta: plano, garagem e espaço privado
-- ---------------------------------------------------------------------------

-- `plan` é escrito SÓ pelo webhook de pagamento (service role, que ignora RLS).
-- Nenhuma política de escrita aqui: senão bastava o console do navegador para
-- virar premium de graça.
create table public.user_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free',
  subscription jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_plans enable row level security;
create policy "plano: dono ou admin le" on public.user_plans
  for select using (user_id = (select auth.uid()) or public.is_service_admin());

create table public.cars (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.cars enable row level security;
create policy "carros: so o dono" on public.cars
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- settings, community e moderation (lista de bloqueados): o que antes era
-- `users/{uid}/private/{doc}`.
create table public.user_private (
  user_id uuid not null references auth.users (id) on delete cascade,
  doc_id text not null check (doc_id in ('settings', 'community', 'moderation')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, doc_id)
);
alter table public.user_private enable row level security;
create policy "privado: so o dono" on public.user_private
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Conquistas
-- ---------------------------------------------------------------------------

-- Um registro por marco. Quem detecta o cruzamento continua sendo o cliente
-- de quem praticou a ação (quem curtiu concede ao dono do post), então é
-- escrita no perfil alheio: lista FECHADA de ids e `unlocked_at` carimbado
-- pelo banco. A chave primária é a dedup — o segundo insert falha sozinho.
create table public.achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null check (achievement_id in (
    'first_goal', 'owned_car', 'first_contribution', 'halfway', 'first_conquest',
    'streak_3', 'streak_6', 'streak_12',
    'first_expense', 'expenses_10', 'expenses_50', 'expenses_100',
    'measured_consumption',
    'first_post', 'first_comment',
    'likes_10', 'likes_50', 'likes_100', 'likes_500', 'likes_1000', 'likes_10000',
    'likes_50000', 'likes_100000', 'likes_500000', 'likes_1000000',
    'followers_10', 'followers_100', 'followers_1000',
    'club_joined', 'club_founder', 'club_first_post', 'club_members_10', 'club_members_50',
    'event_rsvp', 'event_organizer', 'event_attendees_10',
    'first_simulation'
  )),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
alter table public.achievements enable row level security;
create policy "conquistas: vitrine publica" on public.achievements for select using (true);
create policy "conquistas: qualquer logado concede" on public.achievements
  for insert to authenticated with check (true);
create policy "conquistas: dono ou admin revoga" on public.achievements
  for delete using (user_id = (select auth.uid()) or public.is_service_admin());

create or replace function public.achievements_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_trusted_write() then
    new.unlocked_at := now();
  end if;
  return new;
end;
$$;
create trigger achievements_stamp before insert on public.achievements
  for each row execute function public.achievements_stamp();

-- ---------------------------------------------------------------------------
-- Notificações
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid,
  type text not null check (type in (
    'follow', 'like', 'comment', 'rating', 'achievement', 'message',
    'service_approved', 'service_changes_requested', 'service_rejected'
  )),
  read boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index notifications_user_created on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "avisos: dono le" on public.notifications
  for select using (user_id = (select auth.uid()));
create policy "avisos: dono marca lido" on public.notifications
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "avisos: dono apaga" on public.notifications
  for delete using (user_id = (select auth.uid()));
-- Notificar é escrita alheia por natureza. Não dá para assinar em nome de
-- outro, nem chegar já lido, nem com texto gigante. A data é do banco.
create policy "avisos: honesto" on public.notifications
  for insert to authenticated with check (
    actor_id = (select auth.uid())
    and read = false
    and length(coalesce(data ->> 'text', '')) < 500
  );

create or replace function public.notifications_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_trusted_write() then
      new.created_at := now();
    end if;
    return new;
  end if;
  -- O dono só muda `read`. O resto do aviso é de quem mandou.
  new.id := old.id;
  new.user_id := old.user_id;
  new.actor_id := old.actor_id;
  new.type := old.type;
  new.data := old.data;
  new.created_at := old.created_at;
  return new;
end;
$$;
create trigger notifications_stamp before insert or update on public.notifications
  for each row execute function public.notifications_stamp();

-- ---------------------------------------------------------------------------
-- Perfil público, @ e seguidores
-- ---------------------------------------------------------------------------

-- `username` é o @ SEM a arroba (era o id do doc em `usernames/`). Leitura
-- pública: o cadastro pergunta se o nome existe ANTES de criar a conta.
create table public.usernames (
  username text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index usernames_user on public.usernames (user_id);
alter table public.usernames enable row level security;
create policy "arroba: leitura publica" on public.usernames for select using (true);
create policy "arroba: libera o proprio" on public.usernames
  for delete using (user_id = (select auth.uid()));

-- A reserva é uma função para ser atômica: o nome já é de outra pessoa →
-- `username-taken`, sem janela entre ler e gravar.
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

  select user_id into v_owner from public.usernames where username = v_name;
  if v_owner <> v_uid then
    raise exception 'username-taken' using errcode = 'P0001';
  end if;

  update public.usernames set updated_at = now() where username = v_name;
  return '@' || v_name;
end;
$$;

create table public.public_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null default '',
  author text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index public_profiles_username on public.public_profiles (username);
create index public_profiles_author on public.public_profiles (author);
create index public_profiles_updated on public.public_profiles (updated_at desc);
alter table public.public_profiles enable row level security;
create policy "perfil: vitrine publica" on public.public_profiles for select using (true);
create policy "perfil: dono cria" on public.public_profiles
  for insert with check (user_id = (select auth.uid()));
create policy "perfil: dono edita" on public.public_profiles
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "perfil: dono apaga" on public.public_profiles
  for delete using (user_id = (select auth.uid()));
create trigger public_profiles_touch before update on public.public_profiles
  for each row execute function public.touch_updated_at();

-- Seguidores e "seguindo" eram dois espelhos no Firestore (um em cada perfil).
-- Aqui é uma tabela só: a linha (quem segue, quem é seguido) responde as duas
-- listas, e não tem como um lado existir sem o outro.
create table public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  -- Cartão de quem segue (nome, @, avatar), para a lista de seguidores não
  -- ler um perfil por pessoa.
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (follower_id, target_id),
  check (follower_id <> target_id)
);
create index follows_target on public.follows (target_id);
alter table public.follows enable row level security;
create policy "seguidores: logado ve" on public.follows
  for select to authenticated using (true);
create policy "seguidores: segue por si" on public.follows
  for insert with check (follower_id = (select auth.uid()));
create policy "seguidores: atualiza o proprio cartao" on public.follows
  for update using (follower_id = (select auth.uid())) with check (follower_id = (select auth.uid()));
create policy "seguidores: deixa de seguir por si" on public.follows
  for delete using (follower_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Clubes (antes dos posts e eventos, que carimbam `club_id`)
-- ---------------------------------------------------------------------------

create table public.clubs (
  id text primary key default gen_random_uuid()::text,
  founder_id uuid references auth.users (id) on delete set null,
  -- A unicidade da sigla é a restrição; não precisa mais de `clubTags/`.
  tag text not null unique check (tag ~ '^[A-Z0-9]{2,5}$'),
  name_lower text not null default '',
  archived boolean not null default false,
  official boolean not null default false,
  member_count integer not null default 0,
  country text not null default 'BR',
  state text not null default '',
  join_policy text not null default 'open' check (join_policy in ('open', 'approval')),
  content_visibility text not null default 'public' check (content_visibility in ('public', 'members')),
  focus_brands text[] not null default '{}',
  focus_styles text[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clubs_listing on public.clubs (archived, member_count desc);
create index clubs_region on public.clubs (archived, country, state, member_count desc);
create index clubs_name on public.clubs (archived, name_lower);
create index clubs_brands on public.clubs using gin (focus_brands);
create index clubs_styles on public.clubs using gin (focus_styles);
alter table public.clubs enable row level security;
-- O card é público inclusive para clube fechado: descoberta precisa dele.
create policy "clubes: vitrine publica" on public.clubs for select using (true);
-- Criação, edição e arquivo passam por função (create_club / update_club /
-- archive_club). O admin edita direto (selo de oficial, moderação).
create policy "clubes: admin edita" on public.clubs
  for update using (public.is_service_admin()) with check (public.is_service_admin());

create table public.club_members (
  club_id text not null references public.clubs (id) on delete cascade,
  uid uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('founder', 'captain', 'member')),
  display_name text not null default '',
  username text not null default '',
  avatar text not null default '',
  title text not null default '',
  joined_at timestamptz not null default now(),
  primary key (club_id, uid)
);
create index club_members_uid on public.club_members (uid);
alter table public.club_members enable row level security;

create table public.club_requests (
  club_id text not null references public.clubs (id) on delete cascade,
  uid uuid not null references auth.users (id) on delete cascade,
  message text not null default '',
  display_name text not null default '',
  username text not null default '',
  avatar text not null default '',
  created_at timestamptz not null default now(),
  primary key (club_id, uid)
);
alter table public.club_requests enable row level security;

-- `security definer` para ler `club_members` sem cair na própria RLS dele.
create or replace function public.club_role(p_club text)
returns text
language sql stable
security definer
set search_path = ''
as $$
  select role from public.club_members
  where club_id = p_club and uid = auth.uid();
$$;

create or replace function public.is_club_member(p_club text)
returns boolean
language sql stable
set search_path = ''
as $$
  select public.club_role(p_club) is not null;
$$;

create or replace function public.is_club_staff(p_club text)
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(public.club_role(p_club) in ('founder', 'captain'), false);
$$;

create or replace function public.is_club_founder(p_club text)
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(public.club_role(p_club) = 'founder', false);
$$;

create or replace function public.club_is_public(p_club text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce((select content_visibility = 'public' from public.clubs where id = p_club), false);
$$;

create or replace function public.club_is_open(p_club text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce((select join_policy = 'open' and not archived from public.clubs where id = p_club), false);
$$;

create or replace function public.club_has_request(p_club text, p_uid uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.club_requests where club_id = p_club and uid = p_uid);
$$;

-- `contentVisibility: members` esconde a LISTA DE MEMBROS de quem é de fora,
-- não a existência do clube. A própria linha a pessoa sempre vê.
create policy "membros: publico ou membro ve" on public.club_members
  for select using (
    uid = (select auth.uid())
    or public.club_is_public(club_id)
    or public.is_club_member(club_id)
  );
-- Entrada aberta: a pessoa entra sozinha. Clube de aprovação: quem cria a
-- linha é a direção, e só se existir pedido daquela pessoa — é o que impede
-- capitão de arrastar gente para dentro sem ela ter pedido. Fundação passa
-- por create_club.
create policy "membros: entrada aberta ou aprovada" on public.club_members
  for insert to authenticated with check (
    role = 'member'
    and (
      (uid = (select auth.uid()) and public.club_is_open(club_id))
      or (public.is_club_staff(club_id) and public.club_has_request(club_id, uid))
    )
  );
-- Duas escritas cabem aqui: a pessoa atualizando o próprio cartão, e o
-- fundador mudando cargo. O trigger abaixo separa uma da outra.
create policy "membros: proprio cartao ou fundador" on public.club_members
  for update using (uid = (select auth.uid()) or public.is_club_founder(club_id));
-- Fundador NÃO sai (regra do Strava): passa o bastão antes, ou arquiva.
create policy "membros: sair ou remover" on public.club_members
  for delete using (
    (uid = (select auth.uid()) and role <> 'founder')
    or (public.is_club_staff(club_id) and role = 'member')
    or (public.is_club_founder(club_id) and role <> 'founder')
  );

create or replace function public.club_members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_write() then
    return new;
  end if;
  if new.club_id <> old.club_id or new.uid <> old.uid or new.joined_at <> old.joined_at then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  if new.role <> old.role then
    -- Capitão não mexe em cargo: com três papéis, capitão promovendo capitão
    -- é o mesmo que não haver papel nenhum.
    if not public.is_club_founder(old.club_id)
       or old.role = 'founder'
       or new.role not in ('captain', 'member') then
      raise exception 'not-allowed' using errcode = '42501';
    end if;
  end if;
  if (new.display_name, new.username, new.avatar, new.title)
     is distinct from (old.display_name, old.username, old.avatar, old.title)
     and old.uid <> auth.uid() then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger club_members_guard before update on public.club_members
  for each row execute function public.club_members_guard();

-- `member_count` é vitrine para a grade; quem mantém é o banco, a partir da
-- tabela de membros. Entrar também consome o pedido pendente.
create or replace function public.club_members_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.clubs set member_count = member_count + 1, updated_at = now()
      where id = new.club_id;
    delete from public.club_requests where club_id = new.club_id and uid = new.uid;
    return new;
  end if;
  update public.clubs set member_count = greatest(member_count - 1, 0), updated_at = now()
    where id = old.club_id;
  return old;
end;
$$;
create trigger club_members_count after insert or delete on public.club_members
  for each row execute function public.club_members_count();

-- O pedido é entre quem pediu e a direção do clube.
create policy "pedidos: quem pediu ou direcao le" on public.club_requests
  for select using (uid = (select auth.uid()) or public.is_club_staff(club_id));
create policy "pedidos: so em clube de aprovacao" on public.club_requests
  for insert to authenticated with check (
    uid = (select auth.uid())
    and exists (
      select 1 from public.clubs c
      where c.id = club_id and c.join_policy = 'approval' and not c.archived
    )
  );
create policy "pedidos: quem pediu ou direcao apaga" on public.club_requests
  for delete using (uid = (select auth.uid()) or public.is_club_staff(club_id));

-- Criação: clube + fundador num passo só, tudo ou nada. A sigla repetida bate
-- na restrição única e vira `tag-taken`.
create or replace function public.create_club(p_club jsonb, p_member jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id text := gen_random_uuid()::text;
  v_tag text := upper(coalesce(p_club ->> 'tag', ''));
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  perform public.trust_this_transaction();

  begin
    insert into public.clubs (
      id, founder_id, tag, name_lower, archived, official, member_count,
      country, state, join_policy, content_visibility, focus_brands, focus_styles, data
    ) values (
      v_id, v_uid, v_tag,
      lower(coalesce(p_club ->> 'name', '')),
      false,
      false,
      0,
      coalesce(nullif(p_club ->> 'country', ''), 'BR'),
      coalesce(p_club ->> 'state', ''),
      case when p_club ->> 'joinPolicy' = 'approval' then 'approval' else 'open' end,
      case when p_club ->> 'contentVisibility' = 'members' then 'members' else 'public' end,
      coalesce(array(select jsonb_array_elements_text(p_club -> 'focus' -> 'brands')), '{}'),
      coalesce(array(select jsonb_array_elements_text(p_club -> 'focus' -> 'styles')), '{}'),
      p_club - array['tag', 'founderId', 'memberCount', 'official', 'archived', 'createdAt', 'updatedAt']
    );
  exception when unique_violation then
    raise exception 'tag-taken' using errcode = 'P0001';
  end;

  insert into public.club_members (club_id, uid, role, display_name, username, avatar)
  values (
    v_id, v_uid, 'founder',
    coalesce(p_member ->> 'displayName', ''),
    coalesce(p_member ->> 'username', ''),
    coalesce(p_member ->> 'avatar', '')
  );
  return v_id;
end;
$$;

-- Edição: fundador mexe em tudo menos identidade imutável (sigla, fundador,
-- selo oficial, contador); capitão só no recheio. O filtro é AQUI, no banco —
-- checagem que só existe em React não é checagem.
create or replace function public.update_club(p_club_id text, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.club_role(p_club_id);
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_captain_keys text[] := array['description', 'rules', 'links', 'meetupSchedule', 'cover'];
  v_key text;
begin
  if v_role is null then
    raise exception 'not-member' using errcode = '42501';
  end if;
  if v_role not in ('founder', 'captain') then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  v_patch := v_patch - array['tag', 'founderId', 'memberCount', 'official', 'archived', 'createdAt', 'updatedAt', 'id'];
  if v_role = 'captain' then
    for v_key in select jsonb_object_keys(v_patch) loop
      if not v_key = any (v_captain_keys) then
        raise exception 'not-allowed' using errcode = '42501';
      end if;
    end loop;
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

-- Clube não se apaga, arquiva: os membros e a sigla continuam apontando para
-- algo que existe.
create or replace function public.archive_club(p_club_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_club_founder(p_club_id) and not public.is_service_admin() then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  update public.clubs set archived = true, updated_at = now() where id = p_club_id;
end;
$$;

create table public.featured (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.featured enable row level security;
create policy "vitrine editorial: publica" on public.featured for select using (true);
create policy "vitrine editorial: admin escreve" on public.featured
  for all using (public.is_service_admin()) with check (public.is_service_admin());

-- ---------------------------------------------------------------------------
-- Comunidade: publicações, curtidas, comentários, avaliações
-- ---------------------------------------------------------------------------

create table public.community_goals (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'goal',
  -- "" e não null: o mural do clube é igualdade em `club_id`.
  club_id text not null default '',
  likes_count integer not null default 0,
  comments jsonb not null default '[]'::jsonb,
  ratings_by jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_goals_feed on public.community_goals (updated_at desc, id desc);
create index community_goals_owner on public.community_goals (owner_id);
create index community_goals_club on public.community_goals (club_id, created_at desc);
alter table public.community_goals enable row level security;
-- Conteúdo público: quem abre o link vê o feed antes de criar conta.
create policy "posts: publico" on public.community_goals for select using (true);
-- Carimbar post de clube exige ser MEMBRO; senão qualquer um plantava post no
-- mural de qualquer clube.
create policy "posts: dono publica" on public.community_goals
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and (club_id = '' or public.is_club_member(club_id))
  );
create policy "posts: dono edita" on public.community_goals
  for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "posts: dono apaga" on public.community_goals
  for delete using (owner_id = (select auth.uid()));

-- O dono edita o conteúdo dele, mas curtida, comentário e avaliação são de
-- quem interagiu: essas colunas só mudam pelas funções abaixo. E trocar o
-- carimbo de clube na edição passa pela mesma checagem da criação — senão
-- dava para criar sem clube e pendurar o `[TAG]` de um clube alheio depois.
create or replace function public.community_goals_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_trusted_write() then
      new.likes_count := 0;
      new.comments := '[]'::jsonb;
      new.ratings_by := '{}'::jsonb;
      new.created_at := now();
      new.updated_at := now();
    end if;
    return new;
  end if;

  if public.is_trusted_write() then
    return new;
  end if;
  new.id := old.id;
  new.owner_id := old.owner_id;
  new.likes_count := old.likes_count;
  new.comments := old.comments;
  new.ratings_by := old.ratings_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.club_id <> old.club_id and new.club_id <> '' and not public.is_club_member(new.club_id) then
    raise exception 'not-member' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger community_goals_guard before insert or update on public.community_goals
  for each row execute function public.community_goals_guard();

-- Quem curtiu: uma linha por pessoa. `post_owner_id` é carimbado pelo banco a
-- partir do dono real do post — é o campo que soma o total do perfil, e não
-- pode ser escolhido por quem curte.
create table public.post_likes (
  post_id text not null references public.community_goals (id) on delete cascade,
  liker_id uuid not null references auth.users (id) on delete cascade,
  post_owner_id uuid,
  created_at timestamptz not null default now(),
  primary key (post_id, liker_id)
);
create index post_likes_liker on public.post_likes (liker_id);
create index post_likes_owner on public.post_likes (post_owner_id);
alter table public.post_likes enable row level security;
create policy "curtidas: publicas" on public.post_likes for select using (true);
create policy "curtidas: curte por si" on public.post_likes
  for insert to authenticated with check (liker_id = (select auth.uid()));
create policy "curtidas: descurte por si" on public.post_likes
  for delete using (liker_id = (select auth.uid()));

create or replace function public.post_likes_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.trust_this_transaction();
  if tg_op = 'INSERT' then
    update public.community_goals set likes_count = likes_count + 1, updated_at = now()
      where id = new.post_id;
    return new;
  end if;
  update public.community_goals set likes_count = greatest(likes_count - 1, 0), updated_at = now()
    where id = old.post_id;
  return old;
end;
$$;

create or replace function public.post_likes_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.post_owner_id := (select owner_id from public.community_goals where id = new.post_id);
  new.created_at := now();
  return new;
end;
$$;
create trigger post_likes_stamp before insert on public.post_likes
  for each row execute function public.post_likes_stamp();
create trigger post_likes_sync after insert or delete on public.post_likes
  for each row execute function public.post_likes_sync();

-- Comentário: autor carimbado pelo banco (`userId` = quem chama).
create or replace function public.add_comment(p_post_id text, p_comment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_comment jsonb;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  v_comment := jsonb_build_object(
    'id', coalesce(nullif(p_comment ->> 'id', ''), gen_random_uuid()::text),
    'userId', v_uid::text,
    'author', left(coalesce(p_comment ->> 'author', ''), 80),
    'username', left(coalesce(p_comment ->> 'username', ''), 32),
    'avatar', coalesce(p_comment ->> 'avatar', ''),
    'avatarInitials', left(coalesce(p_comment ->> 'avatarInitials', ''), 4),
    'text', left(btrim(coalesce(p_comment ->> 'text', '')), 180),
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  perform public.trust_this_transaction();
  update public.community_goals
    set comments = comments || jsonb_build_array(v_comment), updated_at = now()
    where id = p_post_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  return v_comment;
end;
$$;

-- Editar: só o autor do comentário.
create or replace function public.update_comment(p_post_id text, p_comment_id text, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := auth.uid()::text;
begin
  perform public.trust_this_transaction();
  update public.community_goals g set
    comments = (
      select coalesce(jsonb_agg(
        case when c ->> 'id' = p_comment_id and c ->> 'userId' = v_uid
          then c || jsonb_build_object(
            'text', left(btrim(coalesce(p_text, '')), 180),
            'editedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          else c end
        order by ord), '[]'::jsonb)
      from jsonb_array_elements(g.comments) with ordinality as t(c, ord)
    ),
    updated_at = now()
  where g.id = p_post_id;
end;
$$;

-- Apagar: o autor do comentário ou o dono do post.
create or replace function public.delete_comment(p_post_id text, p_comment_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  perform public.trust_this_transaction();
  update public.community_goals g set
    comments = (
      select coalesce(jsonb_agg(c order by ord), '[]'::jsonb)
      from jsonb_array_elements(g.comments) with ordinality as t(c, ord)
      where not (
        c ->> 'id' = p_comment_id
        and (c ->> 'userId' = v_uid::text or g.owner_id = v_uid)
      )
    ),
    updated_at = now()
  where g.id = p_post_id;
end;
$$;

-- Avaliar: cada pessoa só mexe na própria nota, de 1 a 5.
create or replace function public.rate_goal(p_post_id text, p_rating integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  perform public.trust_this_transaction();
  update public.community_goals
    set ratings_by = ratings_by || jsonb_build_object(v_uid::text, greatest(1, least(coalesce(p_rating, 1), 5))),
        updated_at = now()
    where id = p_post_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------

create table public.events (
  id text primary key default gen_random_uuid()::text,
  created_by uuid not null references auth.users (id) on delete cascade,
  club_id text not null default '',
  event_date text not null default '',
  type text not null default 'casual',
  state text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_date on public.events (event_date);
create index events_club on public.events (club_id, event_date);
create index events_creator on public.events (created_by);
alter table public.events enable row level security;
-- O Engine abre sem login e a agenda é parte do convite.
create policy "eventos: publicos" on public.events for select using (true);
-- Encontro oficial de clube é da direção (capitão e fundador).
create policy "eventos: cria por si" on public.events
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (club_id = '' or public.is_club_staff(club_id))
  );
create policy "eventos: criador edita" on public.events
  for update using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "eventos: criador apaga" on public.events
  for delete using (created_by = (select auth.uid()));

create or replace function public.events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.club_id <> old.club_id and new.club_id <> '' and not public.is_club_staff(new.club_id) then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger events_guard before update on public.events
  for each row execute function public.events_guard();

create table public.event_participants (
  event_id text not null references public.events (id) on delete cascade,
  uid uuid not null references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  rsvp_date timestamptz not null default now(),
  primary key (event_id, uid)
);
create index event_participants_uid on public.event_participants (uid);
alter table public.event_participants enable row level security;
create policy "presenca: publica" on public.event_participants for select using (true);
create policy "presenca: confirma por si" on public.event_participants
  for insert to authenticated with check (uid = (select auth.uid()));
create policy "presenca: atualiza a propria" on public.event_participants
  for update using (uid = (select auth.uid())) with check (uid = (select auth.uid()));
create policy "presenca: cancela por si" on public.event_participants
  for delete using (uid = (select auth.uid()));

-- Lotação checada dentro da escrita, com o evento travado: duas confirmações
-- no mesmo instante não estouram mais o teto.
create or replace function public.event_participants_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_count integer;
begin
  select coalesce((data ->> 'maxParticipants')::integer, 0) into v_max
    from public.events where id = new.event_id for update;
  if v_max > 0 then
    select count(*) into v_count from public.event_participants where event_id = new.event_id;
    if v_count >= v_max then
      raise exception 'event-full' using errcode = 'P0001';
    end if;
  end if;
  new.rsvp_date := now();
  return new;
end;
$$;
create trigger event_participants_capacity before insert on public.event_participants
  for each row execute function public.event_participants_capacity();

-- ---------------------------------------------------------------------------
-- Denúncias
-- ---------------------------------------------------------------------------

-- Qualquer pessoa logada abre; só a moderação lê. Nem quem denunciou relê.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  target_type text not null default 'goal',
  target_id text not null,
  reported_user_id text not null default '',
  reason text not null default '' check (length(reason) <= 280),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy "denuncias: logado abre" on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "denuncias: moderacao le" on public.reports
  for select using (public.is_service_admin());
create policy "denuncias: moderacao edita" on public.reports
  for update using (public.is_service_admin()) with check (public.is_service_admin());
create policy "denuncias: moderacao apaga" on public.reports
  for delete using (public.is_service_admin());

-- ---------------------------------------------------------------------------
-- Mensagens diretas
-- ---------------------------------------------------------------------------

create table public.conversations (
  -- Determinístico: "uidA__uidB" ordenado. Abrir a mesma pessoa duas vezes
  -- nunca duplica.
  id text primary key,
  member_ids uuid[] not null check (cardinality(member_ids) = 2),
  members jsonb not null default '{}'::jsonb,
  unread jsonb not null default '{}'::jsonb,
  last_message jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_members on public.conversations using gin (member_ids);
alter table public.conversations enable row level security;
-- Só quem está na conversa lê. Escrita passa pelas funções abaixo.
create policy "conversas: so os dois" on public.conversations
  for select using ((select auth.uid()) = any (member_ids));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null references public.conversations (id) on delete cascade,
  sender_id uuid,
  text text not null default '',
  type text not null default 'text',
  status text not null default 'delivered',
  -- attachment, imageData, gifData, gifId
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_conversation on public.messages (conversation_id, created_at desc);
alter table public.messages enable row level security;

create or replace function public.is_conversation_member(p_conversation text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations
    where id = p_conversation and auth.uid() = any (member_ids)
  );
$$;

create policy "mensagens: so os dois leem" on public.messages
  for select using (public.is_conversation_member(conversation_id));
create policy "mensagens: autor apaga" on public.messages
  for delete using (sender_id = (select auth.uid()));

-- Abre (ou reabre) a conversa e mantém o PRÓPRIO cartão em dia. O cartão do
-- outro só é gravado quando a conversa nasce.
create or replace function public.start_conversation(p_other uuid, p_my_card jsonb, p_other_card jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_id text;
begin
  if v_uid is null or p_other is null or p_other = v_uid then
    raise exception 'invalid-conversation' using errcode = 'P0001';
  end if;
  v_ids := case when v_uid::text < p_other::text then array[v_uid, p_other] else array[p_other, v_uid] end;
  v_id := v_ids[1]::text || '__' || v_ids[2]::text;

  insert into public.conversations (id, member_ids, members, unread)
  values (
    v_id, v_ids,
    jsonb_build_object(v_uid::text, coalesce(p_my_card, '{}'::jsonb), p_other::text, coalesce(p_other_card, '{}'::jsonb)),
    jsonb_build_object(v_uid::text, 0, p_other::text, 0)
  )
  on conflict (id) do update
    set members = public.conversations.members || jsonb_build_object(v_uid::text, coalesce(p_my_card, '{}'::jsonb));
  return v_id;
end;
$$;

-- Mensagem + prévia + contador de não lidas num passo só. O aviso no sino só
-- sai quando a conversa estava zerada para quem recebe: papo seguido não vira
-- enxurrada de notificação.
create or replace function public.send_message(p_conversation text, p_text text, p_type text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conv public.conversations;
  v_recipient uuid;
  v_msg uuid;
  v_text text := left(btrim(coalesce(p_text, '')), 2000);
  v_preview text;
  v_sender jsonb;
  v_author text;
begin
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found or not (v_uid = any (v_conv.member_ids)) then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  v_recipient := (select m from unnest(v_conv.member_ids) m where m <> v_uid limit 1);

  insert into public.messages (conversation_id, sender_id, text, type, data)
  values (p_conversation, v_uid, v_text,
          coalesce(nullif(p_type, ''), 'text'), coalesce(p_data, '{}'::jsonb))
  returning id into v_msg;

  v_preview := case
    when v_text <> '' then v_text
    when p_type = 'gif' then '🎬 GIF'
    when p_type = 'image' then '📷 Imagem'
    when p_data -> 'attachment' ->> 'title' is not null then '📷 ' || (p_data -> 'attachment' ->> 'title')
    else '📷 Publicação'
  end;

  update public.conversations set
    updated_at = now(),
    last_message = jsonb_build_object(
      'text', v_preview, 'senderId', v_uid::text, 'type', coalesce(nullif(p_type, ''), 'text'),
      'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    unread = unread
      || jsonb_build_object(v_uid::text, 0)
      || jsonb_build_object(v_recipient::text, coalesce((unread ->> v_recipient::text)::integer, 0) + 1)
  where id = p_conversation;

  if coalesce((v_conv.unread ->> v_recipient::text)::integer, 0) = 0 then
    v_sender := coalesce(v_conv.members -> v_uid::text, '{}'::jsonb);
    v_author := coalesce(nullif(v_sender ->> 'author', ''), 'Alguém');
    insert into public.notifications (user_id, actor_id, type, data)
    values (v_recipient, v_uid, 'message', jsonb_build_object(
      'actorName', v_author,
      'actorUsername', coalesce(v_sender ->> 'username', ''),
      'conversationId', p_conversation,
      'targetPath', '/messages/' || p_conversation,
      'notificationTitle', 'Nova mensagem',
      'notificationBody', v_author || ' te enviou uma mensagem.',
      'text', v_author || ' te enviou uma mensagem.'
    ));
  end if;
  return v_msg;
end;
$$;

-- Zera o meu contador e marca como vistas as mensagens que o OUTRO mandou.
-- No Firestore esta segunda parte era negada pela regra (só o autor editava a
-- mensagem) e o erro morria num console.warn: o "visto" nunca funcionou.
create or replace function public.mark_conversation_read(p_conversation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_conversation_member(p_conversation) then
    return;
  end if;
  update public.conversations
    set unread = unread || jsonb_build_object(v_uid::text, 0)
    where id = p_conversation;
  update public.messages set status = 'seen'
    where conversation_id = p_conversation and sender_id is distinct from v_uid and status = 'delivered';
end;
$$;

-- ---------------------------------------------------------------------------
-- Serviços (anúncios)
-- ---------------------------------------------------------------------------

create table public.service_listings (
  id text primary key default gen_random_uuid()::text,
  owner_id uuid not null references auth.users (id) on delete cascade,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'changes_requested', 'rejected')),
  view_count integer not null default 0,
  detail_count integer not null default 0,
  whatsapp_count integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_listings_status on public.service_listings (moderation_status, updated_at desc);
create index service_listings_owner on public.service_listings (owner_id);
alter table public.service_listings enable row level security;
-- Aprovado é público de propósito: o prestador divulga o link na bio, e quem
-- chega por ali ainda não tem conta.
create policy "anuncios: aprovado, dono ou moderacao" on public.service_listings
  for select using (
    moderation_status = 'approved'
    or owner_id = (select auth.uid())
    or public.is_service_admin()
  );
create policy "anuncios: dono envia para fila" on public.service_listings
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and moderation_status = 'pending'
  );
-- O dono edita, mas qualquer edição volta para a fila. A moderação edita tudo.
create policy "anuncios: dono edita (volta pra fila) ou moderacao" on public.service_listings
  for update using (owner_id = (select auth.uid()) or public.is_service_admin())
  with check (
    public.is_service_admin()
    or (owner_id = (select auth.uid()) and moderation_status = 'pending')
  );
create policy "anuncios: dono ou moderacao apaga" on public.service_listings
  for delete using (owner_id = (select auth.uid()) or public.is_service_admin());

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
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  -- Métrica não é do dono nem da moderação: só sobe pela função de contagem.
  new.id := old.id;
  new.view_count := old.view_count;
  new.detail_count := old.detail_count;
  new.whatsapp_count := old.whatsapp_count;
  new.created_at := old.created_at;
  new.updated_at := now();
  if not public.is_service_admin() then
    new.owner_id := old.owner_id;
  end if;
  return new;
end;
$$;
create trigger service_listings_guard before insert or update on public.service_listings
  for each row execute function public.service_listings_guard();

-- Visita, abertura e clique no WhatsApp: qualquer um, inclusive visitante,
-- soma 1 — e só 1, num anúncio aprovado.
create or replace function public.track_listing_metric(p_listing_id text, p_metric text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.trust_this_transaction();
  update public.service_listings set
    view_count = view_count + (p_metric = 'view')::integer,
    detail_count = detail_count + (p_metric = 'detail')::integer,
    whatsapp_count = whatsapp_count + (p_metric = 'whatsapp')::integer
  where id = p_listing_id and moderation_status = 'approved';
end;
$$;

-- ---------------------------------------------------------------------------
-- Excluir a conta
-- ---------------------------------------------------------------------------

-- Tudo que é só da pessoa sai em cascata quando a linha de `auth.users` sai:
-- garagem, configurações, conquistas, avisos, @, perfil, seguidores, posts
-- (com as curtidas deles), eventos criados, presenças, curtidas dadas,
-- anúncios, filiação a clube, pedidos. Esta função cuida só do que fica em
-- conteúdo ALHEIO e precisa ser limpo ou anonimizado antes:
--
--   - comentários e avaliações nos posts dos outros saem;
--   - o cartão dela nas conversas vira "Conta excluída" (a mensagem é dos
--     dois lados, como no WhatsApp);
--   - o clube que ela fundou é arquivado, porque ninguém mais poderia editar
--     a identidade dele.
--
-- Não pede "login recente": quem chama é a própria sessão. A tela confere a
-- senha antes.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  perform public.trust_this_transaction();

  update public.community_goals g set
    comments = (
      select coalesce(jsonb_agg(c order by ord), '[]'::jsonb)
      from jsonb_array_elements(g.comments) with ordinality as t(c, ord)
      where c ->> 'userId' is distinct from v_uid::text
    ),
    ratings_by = g.ratings_by - v_uid::text
  where g.owner_id <> v_uid
    and (g.ratings_by ? v_uid::text
         or exists (select 1 from jsonb_array_elements(g.comments) c where c ->> 'userId' = v_uid::text));

  update public.conversations set
    members = members || jsonb_build_object(v_uid::text, jsonb_build_object(
      'author', 'Conta excluída', 'username', '', 'avatar', '', 'avatarInitials', '',
      'deletedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
  where v_uid = any (member_ids);

  update public.clubs set archived = true, updated_at = now()
  where founder_id = v_uid and not archived;

  delete from auth.users where id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------------

revoke execute on function public.reserve_username(text) from public, anon;
revoke execute on function public.create_club(jsonb, jsonb) from public, anon;
revoke execute on function public.update_club(text, jsonb) from public, anon;
revoke execute on function public.archive_club(text) from public, anon;
revoke execute on function public.add_comment(text, jsonb) from public, anon;
revoke execute on function public.update_comment(text, text, text) from public, anon;
revoke execute on function public.delete_comment(text, text) from public, anon;
revoke execute on function public.rate_goal(text, integer) from public, anon;
revoke execute on function public.start_conversation(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.send_message(text, text, text, jsonb) from public, anon;
revoke execute on function public.mark_conversation_read(text) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
-- Métrica de anúncio: visitante também conta.
grant execute on function public.track_listing_metric(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tempo real: o que as telas escutam
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.community_goals,
  public.notifications,
  public.conversations,
  public.messages,
  public.user_plans,
  public.service_listings;

-- ---------------------------------------------------------------------------
-- Fotos
-- ---------------------------------------------------------------------------

-- Pública para leitura (a foto do carro aparece no feed para visitante), e
-- cada pessoa só escreve na própria pasta: `users/<uid>/...`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 6291456, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "fotos: cada um na sua pasta" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
create policy "fotos: dono apaga" on storage.objects
  for delete to authenticated using (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
