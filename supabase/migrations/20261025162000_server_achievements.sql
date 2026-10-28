-- Conquistas concedidas pelo SERVIDOR (auditoria social, achado 0.5).
--
-- Antes: "conquistas: qualquer logado concede" era `insert ... with check
-- (true)`. Pelo console, qualquer conta gravava `likes_1000000` ou
-- `followers_1000` para si ou para qualquer outra pessoa.
--
-- Agora há dois tipos de marco:
--
--   SOCIAIS (curtidas, seguidores, posts, comentários, clubes, eventos):
--   quem concede é o banco, em trigger, contando as tabelas de verdade
--   (post_likes, follows, community_goals, club_members, clubs, events,
--   event_participants). O cliente não grava nenhum deles, nem para si.
--
--   DA GARAGEM (meta, aporte, gastos, consumo medido, simulação): dependem do
--   conteúdo de `cars`, que é privado e cuja régua (sequência de meses,
--   consumo real) vive no app. O cliente continua podendo gravar esses — mas
--   SÓ para a própria conta. O pior caso passa a ser alguém se dar um selo de
--   "primeiro aporte" sem ter aportado, no próprio perfil.
--
-- `sync_my_achievements()` recalcula os sociais da própria conta (para quem
-- já tinha cruzado um marco antes desta migration) e é idempotente.

drop policy if exists "conquistas: qualquer logado concede" on public.achievements;
create policy "conquistas: dono grava marco da garagem" on public.achievements
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and achievement_id in (
      'first_goal', 'owned_car', 'first_contribution', 'halfway', 'first_conquest',
      'streak_3', 'streak_6', 'streak_12',
      'first_expense', 'expenses_10', 'expenses_50', 'expenses_100',
      'measured_consumption', 'first_simulation'
    )
  );

-- Concede (se ainda não existir) e devolve true só quando ESTA chamada criou.
create or replace function public.grant_achievement_internal(p_user uuid, p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_user is null then
    return false;
  end if;
  insert into public.achievements (user_id, achievement_id) values (p_user, p_id)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
revoke execute on function public.grant_achievement_internal(uuid, text) from public, anon, authenticated;

-- Degraus de uma série que `p_value` cruzou. Avisa no sino só o MAIOR degrau
-- concedido nesta chamada (quem ganha 10 e 50 juntos recebe um aviso só).
create or replace function public.grant_series_internal(p_user uuid, p_series text, p_tiers integer[], p_value bigint, p_notify boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier integer;
  v_top text;
begin
  foreach v_tier in array p_tiers loop
    if p_value >= v_tier and public.grant_achievement_internal(p_user, p_series || '_' || v_tier) then
      v_top := p_series || '_' || v_tier;
    end if;
  end loop;
  if p_notify and v_top is not null then
    perform public.notify(p_user, null, 'achievement', jsonb_build_object(
      'achievementId', v_top,
      'actorName', 'Engine',
      'targetPath', '/settings'
    ));
  end if;
end;
$$;
revoke execute on function public.grant_series_internal(uuid, text, integer[], bigint, boolean) from public, anon, authenticated;

create or replace function public.sync_likes_achievements(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.grant_series_internal(p_user, 'likes',
    array[10, 50, 100, 500, 1000, 10000, 50000, 100000, 500000, 1000000],
    (select count(*) from public.post_likes where post_owner_id = p_user), true);
end;
$$;

create or replace function public.sync_followers_achievements(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.grant_series_internal(p_user, 'followers', array[10, 100, 1000],
    (select count(*) from public.follows where target_id = p_user), true);
end;
$$;

create or replace function public.sync_club_members_achievements(p_club text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_founder uuid;
begin
  select founder_id into v_founder from public.clubs where id = p_club;
  if v_founder is null then
    return;
  end if;
  perform public.grant_series_internal(v_founder, 'club_members', array[10, 50],
    (select count(*) from public.club_members where club_id = p_club), true);
end;
$$;

create or replace function public.sync_event_attendees_achievements(p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator uuid;
begin
  select created_by into v_creator from public.events where id = p_event;
  if v_creator is null then
    return;
  end if;
  perform public.grant_series_internal(v_creator, 'event_attendees', array[10],
    (select count(*) from public.event_participants where event_id = p_event), true);
end;
$$;

revoke execute on function public.sync_likes_achievements(uuid) from public, anon, authenticated;
revoke execute on function public.sync_followers_achievements(uuid) from public, anon, authenticated;
revoke execute on function public.sync_club_members_achievements(text) from public, anon, authenticated;
revoke execute on function public.sync_event_attendees_achievements(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: o marco nasce da linha que de fato foi gravada
-- ---------------------------------------------------------------------------

create or replace function public.achievements_on_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_likes_achievements(new.post_owner_id);
  return new;
end;
$$;
create trigger achievements_on_like after insert on public.post_likes
  for each row execute function public.achievements_on_like();

create or replace function public.achievements_on_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_followers_achievements(new.target_id);
  return new;
end;
$$;
create trigger achievements_on_follow after insert on public.follows
  for each row execute function public.achievements_on_follow();

create or replace function public.achievements_on_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.grant_achievement_internal(new.owner_id, 'first_post');
  if new.club_id <> '' then
    perform public.grant_achievement_internal(new.owner_id, 'club_first_post');
  end if;
  return new;
end;
$$;
create trigger achievements_on_post after insert on public.community_goals
  for each row execute function public.achievements_on_post();

create or replace function public.achievements_on_club_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.grant_achievement_internal(new.uid, 'club_joined');
  if new.role = 'founder' then
    perform public.grant_achievement_internal(new.uid, 'club_founder');
  end if;
  perform public.sync_club_members_achievements(new.club_id);
  return new;
end;
$$;
create trigger achievements_on_club_member after insert on public.club_members
  for each row execute function public.achievements_on_club_member();

create or replace function public.achievements_on_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.grant_achievement_internal(new.created_by, 'event_organizer');
  return new;
end;
$$;
create trigger achievements_on_event after insert on public.events
  for each row execute function public.achievements_on_event();

create or replace function public.achievements_on_rsvp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.grant_achievement_internal(new.uid, 'event_rsvp');
  perform public.sync_event_attendees_achievements(new.event_id);
  return new;
end;
$$;
create trigger achievements_on_rsvp after insert on public.event_participants
  for each row execute function public.achievements_on_rsvp();

-- Primeiro comentário: o comentário mora no jsonb do post (só add_comment o
-- acrescenta, sempre no fim), então o marco sai do trigger de update quando a
-- lista cresce.
create or replace function public.achievements_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
begin
  if jsonb_array_length(new.comments) > jsonb_array_length(old.comments) then
    v_new := new.comments -> (jsonb_array_length(new.comments) - 1);
    if v_new ? 'userId' and (v_new ->> 'userId') ~* '^[0-9a-f-]{36}$' then
      perform public.grant_achievement_internal((v_new ->> 'userId')::uuid, 'first_comment');
    end if;
  end if;
  return new;
end;
$$;
create trigger achievements_on_comment after update of comments on public.community_goals
  for each row execute function public.achievements_on_comment();

-- ---------------------------------------------------------------------------
-- Recalcular os da própria conta (marcos cruzados antes desta migration)
-- ---------------------------------------------------------------------------

create or replace function public.sync_my_achievements()
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_before text[];
begin
  if v_uid is null then
    return;
  end if;
  select coalesce(array_agg(achievement_id), '{}') into v_before
    from public.achievements where user_id = v_uid;

  if exists (select 1 from public.community_goals where owner_id = v_uid) then
    perform public.grant_achievement_internal(v_uid, 'first_post');
  end if;
  if exists (select 1 from public.community_goals where owner_id = v_uid and club_id <> '') then
    perform public.grant_achievement_internal(v_uid, 'club_first_post');
  end if;
  if exists (
    select 1 from public.community_goals g, jsonb_array_elements(g.comments) c
    where c ->> 'userId' = v_uid::text
  ) then
    perform public.grant_achievement_internal(v_uid, 'first_comment');
  end if;
  if exists (select 1 from public.club_members where uid = v_uid) then
    perform public.grant_achievement_internal(v_uid, 'club_joined');
  end if;
  if exists (select 1 from public.clubs where founder_id = v_uid) then
    perform public.grant_achievement_internal(v_uid, 'club_founder');
  end if;
  if exists (select 1 from public.events where created_by = v_uid) then
    perform public.grant_achievement_internal(v_uid, 'event_organizer');
  end if;
  if exists (select 1 from public.event_participants where uid = v_uid) then
    perform public.grant_achievement_internal(v_uid, 'event_rsvp');
  end if;
  perform public.grant_series_internal(v_uid, 'likes',
    array[10, 50, 100, 500, 1000, 10000, 50000, 100000, 500000, 1000000],
    (select count(*) from public.post_likes where post_owner_id = v_uid), false);
  perform public.grant_series_internal(v_uid, 'followers', array[10, 100, 1000],
    (select count(*) from public.follows where target_id = v_uid), false);
  perform public.grant_series_internal(v_uid, 'club_members', array[10, 50],
    coalesce((select max(member_count) from public.clubs where founder_id = v_uid), 0), false);
  perform public.grant_series_internal(v_uid, 'event_attendees', array[10],
    coalesce((select max(cnt) from (
      select count(*) as cnt from public.event_participants p
      join public.events e on e.id = p.event_id
      where e.created_by = v_uid group by p.event_id) s), 0), false);

  return query
    select achievement_id from public.achievements
    where user_id = v_uid and not (achievement_id = any (v_before));
end;
$$;
revoke execute on function public.sync_my_achievements() from public, anon;
grant execute on function public.sync_my_achievements() to authenticated;
