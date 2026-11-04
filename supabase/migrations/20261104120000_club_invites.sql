-- Convite de clube: a direção chama alguém pelo @, e a pessoa aceita ou
-- recusa pelo sino.
--
-- Até aqui a porta só abria de fora para dentro: dava para pedir entrada
-- (`club_requests`), não para chamar. Tabela separada de propósito — pedido e
-- convite se parecem, mas quem decide é o contrário em cada um, e a tela do
-- clube precisa mostrar as duas filas lado a lado sem misturar.
--
-- O padrinho da linhagem (20261101150000) sai de quem convidou.

create table if not exists public.club_invites (
  club_id text not null references public.clubs (id) on delete cascade,
  uid uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  message text not null default '',
  created_at timestamptz not null default now(),
  primary key (club_id, uid)
);
create index if not exists club_invites_uid on public.club_invites (uid, created_at desc);
alter table public.club_invites enable row level security;

-- Quem foi convidado vê o próprio convite; a direção vê os que o clube mandou.
create policy "convite: convidado ou direcao ve" on public.club_invites
  for select using (
    uid = (select auth.uid())
    or public.club_can(club_id, 'manage_members')
    or public.is_service_admin()
  );
-- Recusar (o convidado) e cancelar (a direção). Criar é só pela função.
create policy "convite: convidado recusa ou direcao cancela" on public.club_invites
  for delete using (
    uid = (select auth.uid())
    or public.club_can(club_id, 'manage_members')
    or public.is_service_admin()
  );

-- Tipo novo no sino, pela mesma forma das migrações anteriores.
do $$
declare
  v_types text[];
begin
  select coalesce(array_agg(distinct m.arr[1]), '{}') into v_types
  from pg_constraint c,
       lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') as m(arr)
  where c.conname = 'notifications_type_check'
    and c.conrelid = 'public.notifications'::regclass;
  v_types := array(select distinct x from unnest(v_types || array['club_invite']) x order by x);
  alter table public.notifications drop constraint if exists notifications_type_check;
  execute 'alter table public.notifications add constraint notifications_type_check check (type = any (array['
    || (select string_agg(quote_literal(x) || '::text', ', ') from unnest(v_types) x)
    || ']))';
end;
$$;

/**
 * Convida pelo @. Quem convida precisa da permissão de cuidar dos membros.
 *
 * Bloqueio nos dois sentidos impede o convite: convite é mensagem, e quem
 * bloqueou não deve receber mensagem nenhuma.
 */
create or replace function public.invite_to_club(
  p_club text,
  p_username text,
  p_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_club public.clubs;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if not public.club_can(p_club, 'manage_members') then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  select * into v_club from public.clubs where id = p_club and not archived;
  if v_club.id is null then
    raise exception 'club-not-found' using errcode = '42501';
  end if;

  select user_id into v_target from public.usernames
    where lower(username) = lower(btrim(coalesce(p_username, '')));
  if v_target is null then
    raise exception 'user-not-found' using errcode = '22023';
  end if;
  if v_target = v_uid then
    raise exception 'cannot-invite-self' using errcode = '22023';
  end if;
  if exists (select 1 from public.club_members where club_id = p_club and uid = v_target) then
    raise exception 'already-member' using errcode = '22023';
  end if;
  if public.is_blocked_between(v_uid, v_target) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if public.is_account_suspended(v_target) then
    raise exception 'account-suspended' using errcode = '42501';
  end if;

  insert into public.club_invites (club_id, uid, invited_by, message)
  values (p_club, v_target, v_uid, left(btrim(coalesce(p_message, '')), 280))
  on conflict (club_id, uid) do update set
    invited_by = excluded.invited_by,
    message = excluded.message,
    created_at = now();

  perform public.notify(v_target, v_uid, 'club_invite', jsonb_build_object(
    'clubId', p_club,
    'clubName', coalesce(v_club.data ->> 'name', ''),
    'clubTag', v_club.tag
  ));

  return v_target;
end;
$$;

revoke execute on function public.invite_to_club(text, text, text) from public, anon;
grant execute on function public.invite_to_club(text, text, text) to authenticated;

/** Aceita o convite: entra no clube com o padrinho sendo quem chamou. */
create or replace function public.accept_club_invite(p_club text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inviter uuid;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select invited_by into v_inviter from public.club_invites
    where club_id = p_club and uid = v_uid;
  if v_inviter is null then
    raise exception 'invite-not-found' using errcode = '42501';
  end if;

  -- Transação de confiança: o cargo de entrada continua sendo calculado pelo
  -- gatilho de sempre, e o padrinho vai escrito aqui, que é a única coisa que
  -- este caminho sabe e o gatilho não.
  perform public.trust_this_transaction();
  insert into public.club_members (club_id, uid, sponsor_id)
  values (p_club, v_uid, case when v_inviter = v_uid then null else v_inviter end)
  on conflict (club_id, uid) do nothing;

  delete from public.club_invites where club_id = p_club and uid = v_uid;
  -- Pedido antigo da mesma pessoa deixa de fazer sentido.
  delete from public.club_requests where club_id = p_club and uid = v_uid;
end;
$$;

revoke execute on function public.accept_club_invite(text) from public, anon;
grant execute on function public.accept_club_invite(text) to authenticated;
