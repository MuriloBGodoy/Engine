-- @menções na bio e o bloco "No Engine" do perfil.
--
-- A bio continua sendo texto em `public_profiles.data.note`, escrito pelo
-- dono. A menção mora no texto como marcador `@[tipo:id]` (pessoa, clube,
-- evento, página) — o id, não o nome, para renomear não quebrar nada. Mas o
-- marcador sozinho não vale: a tela só desenha o chip se existir a linha
-- ATIVA em `profile_mentions`, que só o banco grava (`set_bio_mentions`).
-- É a linha que garante:
--
--   - limite de 10 menções por bio;
--   - alvo que existe e aparece (pessoa não suspensa e sem bloqueio entre os
--     dois; clube não arquivado; evento; página visível);
--   - UM aviso por pessoa/clube mencionado, uma vez na vida da menção (tirar
--     e pôr de novo não avisa outra vez);
--   - quem foi mencionado se tira da bio alheia (`remove_mention`) e o dono
--     não consegue pôr de volta — no clube, quem edita o clube responde por
--     ele.
--
-- `profile_mentions_for` devolve os cartões vivos (nome, @, foto atuais) e
-- `profile_engine_presence` monta o bloco "No Engine": clubes de que a
-- pessoa é membro (com o cargo), páginas que ela administra e próximos
-- eventos — com privacidade: clube só-para-membros só aparece para quem é
-- membro dele; presença em evento só para quem tem conta (como a lista de
-- presença); bloqueio entre quem vê e o dono esconde tudo; e o dono pode
-- esconder o bloco (`data.hideEngineBlock` no perfil público).
--
-- Páginas profissionais vêm de `pro_profiles` (20261101120000, outra frente).
-- As funções só tocam nessa tabela se ela existir (`to_regclass`): sem a
-- migration das páginas, menção de página é recusada e a lista de páginas
-- sai vazia, em vez de quebrar.

create table public.profile_mentions (
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('person', 'club', 'event', 'page')),
  target_id text not null check (char_length(target_id) between 1 and 64),
  status text not null default 'active'
    check (status in ('active', 'removed_by_owner', 'removed_by_target')),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, kind, target_id)
);
create index profile_mentions_target on public.profile_mentions (kind, target_id);
alter table public.profile_mentions enable row level security;
-- A menção ativa é pública como a bio. A retirada, só o dono vê (é o que a
-- tela usa para dizer "fulano saiu da sua bio").
create policy "mencoes: ativa publica, dono ve todas" on public.profile_mentions
  for select using (status = 'active' or owner_id = (select auth.uid()));
create policy "suspensao: mencoes somem" on public.profile_mentions
  as restrictive for select using (public.account_visible(owner_id));
-- Escrita só pelas funções abaixo.

-- ---------------------------------------------------------------------------
-- Alvos
-- ---------------------------------------------------------------------------

create or replace function public.mention_is_uuid(p_text text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
$$;

-- A página existe e aparece? Falso se a migration das páginas não entrou.
create or replace function public.mention_page_ok(p_id text)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('public.pro_profiles') is null or not public.mention_is_uuid(p_id) then
    return false;
  end if;
  return exists (
    select 1 from public.pro_profiles p
    where p.id = p_id::uuid and p.kind = 'page' and not p.suspended
  );
end;
$$;
revoke execute on function public.mention_page_ok(text) from public, anon, authenticated;

create or replace function public.mention_page_card(p_id text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_card jsonb;
begin
  if not public.mention_page_ok(p_id) then
    return null;
  end if;
  select jsonb_build_object(
    'label', '@' || p.handle,
    'name', left(coalesce(nullif(p.name, ''), '@' || p.handle), 80),
    'avatar', left(coalesce(p.data ->> 'logo', ''), 500),
    'path', '/p/' || p.handle,
    'handle', p.handle
  ) into v_card
  from public.pro_profiles p where p.id = p_id::uuid;
  return v_card;
end;
$$;
revoke execute on function public.mention_page_card(text) from public, anon, authenticated;

create or replace function public.mention_target_ok(p_actor uuid, p_kind text, p_id text)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_kind = 'person' then
    if not public.mention_is_uuid(p_id) then
      return false;
    end if;
    return p_id::uuid <> p_actor
      and exists (select 1 from public.public_profiles where user_id = p_id::uuid)
      and not public.is_account_suspended(p_id::uuid)
      and not public.is_blocked_between(p_actor, p_id::uuid);
  elsif p_kind = 'club' then
    return exists (select 1 from public.clubs where id = p_id and not archived);
  elsif p_kind = 'event' then
    return exists (
      select 1 from public.events e
      where e.id = p_id and not public.is_account_suspended(e.created_by)
    );
  elsif p_kind = 'page' then
    return public.mention_page_ok(p_id);
  end if;
  return false;
end;
$$;
revoke execute on function public.mention_target_ok(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gravar as menções da minha bio
-- ---------------------------------------------------------------------------

-- `p_refs`: [{kind, id}, ...] na ordem em que aparecem. Devolve
-- {accepted: [...], skipped: [...]} — skipped é quem não existe, não pode
-- ser mencionado ou se tirou da bio.
create or replace function public.set_bio_mentions(p_refs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ref record;
  v_accepted jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_row public.profile_mentions;
  v_owner_handle text;
  v_path text;
  v_club_name text;
  v_leader uuid;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if public.is_account_suspended(v_uid) then
    raise exception 'account-suspended' using errcode = '42501';
  end if;
  if p_refs is null or jsonb_typeof(p_refs) <> 'array' then
    raise exception 'invalid-mentions' using errcode = 'P0001';
  end if;
  if (
    select count(distinct (r ->> 'kind', r ->> 'id'))
    from jsonb_array_elements(p_refs) r
  ) > 10 then
    raise exception 'too-many-mentions' using errcode = 'P0001';
  end if;

  select username into v_owner_handle from public.public_profiles where user_id = v_uid;
  v_path := case when coalesce(v_owner_handle, '') <> ''
    then '/community/' || v_owner_handle
    else '/community?user=' || v_uid::text end;

  for v_ref in
    select distinct on (r ->> 'kind', r ->> 'id') r ->> 'kind' as kind, left(coalesce(r ->> 'id', ''), 64) as id
    from jsonb_array_elements(p_refs) r
    where jsonb_typeof(r) = 'object'
  loop
    select * into v_row from public.profile_mentions
      where owner_id = v_uid and kind = v_ref.kind and target_id = v_ref.id;
    if found and v_row.status = 'removed_by_target' then
      v_skipped := v_skipped || jsonb_build_object('kind', v_ref.kind, 'id', v_ref.id, 'reason', 'removed');
      continue;
    end if;
    if v_ref.kind is null or v_ref.id = '' or not public.mention_target_ok(v_uid, v_ref.kind, v_ref.id) then
      v_skipped := v_skipped || jsonb_build_object('kind', v_ref.kind, 'id', v_ref.id, 'reason', 'invalid');
      continue;
    end if;

    insert into public.profile_mentions (owner_id, kind, target_id, status)
    values (v_uid, v_ref.kind, v_ref.id, 'active')
    on conflict (owner_id, kind, target_id) do update
      set status = 'active', updated_at = now()
      where public.profile_mentions.status <> 'active'
    returning * into v_row;
    if v_row.owner_id is null then
      select * into v_row from public.profile_mentions
        where owner_id = v_uid and kind = v_ref.kind and target_id = v_ref.id;
    end if;
    v_accepted := v_accepted || jsonb_build_object('kind', v_ref.kind, 'id', v_ref.id);

    -- Um aviso por menção, uma vez.
    if v_row.notified_at is null then
      if v_ref.kind = 'person' then
        perform public.notify(v_ref.id::uuid, v_uid, 'mention', jsonb_build_object(
          'mentionKind', 'person',
          'targetPath', v_path
        ));
      elsif v_ref.kind = 'club' then
        select left(coalesce(data ->> 'name', ''), 80) into v_club_name from public.clubs where id = v_ref.id;
        -- O clube é avisado na direção que responde por ele (até 3).
        for v_leader in
          select m.uid from public.club_members m
          join public.club_roles r on r.club_id = m.club_id and r.id = m.role_id
          where m.club_id = v_ref.id and (m.role_id = 'founder' or 'edit_club' = any (r.permissions))
          order by r.position, m.joined_at
          limit 3
        loop
          perform public.notify(v_leader, v_uid, 'mention', jsonb_build_object(
            'mentionKind', 'club',
            'clubId', v_ref.id,
            'clubName', coalesce(v_club_name, ''),
            'targetPath', v_path
          ));
        end loop;
      end if;
      update public.profile_mentions set notified_at = now()
        where owner_id = v_uid and kind = v_ref.kind and target_id = v_ref.id;
    end if;
  end loop;

  -- O que saiu do texto deixa de valer (sem apagar: o aviso não se repete).
  update public.profile_mentions m set status = 'removed_by_owner', updated_at = now()
  where m.owner_id = v_uid and m.status = 'active'
    and not exists (
      select 1 from jsonb_array_elements(v_accepted) a
      where a ->> 'kind' = m.kind and a ->> 'id' = m.target_id
    );

  return jsonb_build_object('accepted', v_accepted, 'skipped', v_skipped);
end;
$$;
revoke execute on function public.set_bio_mentions(jsonb) from public, anon;
grant execute on function public.set_bio_mentions(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Sair da bio alheia
-- ---------------------------------------------------------------------------

create or replace function public.remove_mention(p_owner uuid, p_kind text, p_target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  v_ok := p_owner = v_uid
    or (p_kind = 'person' and p_target = v_uid::text)
    or (p_kind = 'club' and public.club_can(p_target, 'edit_club'))
    or (p_kind = 'event' and public.event_can_edit(p_target));
  -- Página: só se a migration das páginas entrou (a função é dela). Em
  -- comando separado, porque a expressão inteira é planejada de uma vez.
  if not v_ok and p_kind = 'page' and to_regclass('public.pro_profile_members') is not null
     and public.mention_is_uuid(p_target) then
    execute 'select exists (select 1 from public.pro_profile_members where profile_id = $1 and user_id = $2'
      || ' and status = ''active'' and role in (''owner'', ''admin''))'
      into v_ok using p_target::uuid, v_uid;
  end if;
  if not v_ok then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  update public.profile_mentions set
    status = case when p_owner = v_uid then 'removed_by_owner' else 'removed_by_target' end,
    updated_at = now()
  where owner_id = p_owner and kind = p_kind and target_id = p_target and status = 'active';
end;
$$;
revoke execute on function public.remove_mention(uuid, text, text) from public, anon;
grant execute on function public.remove_mention(uuid, text, text) to authenticated;

-- Conta, clube arquivado de vez ou evento que somem levam a menção junto.
create or replace function public.profile_mentions_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'public_profiles' then
    delete from public.profile_mentions where kind = 'person' and target_id = old.user_id::text;
  elsif tg_table_name = 'events' then
    delete from public.profile_mentions where kind = 'event' and target_id = old.id;
  elsif tg_table_name = 'clubs' then
    delete from public.profile_mentions where kind = 'club' and target_id = old.id;
  end if;
  return old;
end;
$$;
revoke execute on function public.profile_mentions_cleanup() from public, anon, authenticated;
create trigger profile_mentions_cleanup after delete on public.public_profiles
  for each row execute function public.profile_mentions_cleanup();
create trigger profile_mentions_cleanup after delete on public.events
  for each row execute function public.profile_mentions_cleanup();
create trigger profile_mentions_cleanup after delete on public.clubs
  for each row execute function public.profile_mentions_cleanup();

-- ---------------------------------------------------------------------------
-- Leitura: cartões vivos e o bloco "No Engine"
-- ---------------------------------------------------------------------------

create or replace function public.profile_mentions_for(p_user uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_out jsonb;
begin
  if p_user is null or not public.account_visible(p_user) or public.is_blocked_between(v_viewer, p_user) then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(x.card || jsonb_build_object('kind', x.kind, 'id', x.target_id) order by x.created_at), '[]'::jsonb)
  into v_out
  from (
    select m.kind, m.target_id, m.created_at,
      case m.kind
        when 'person' then (
          select jsonb_build_object(
            'label', coalesce(nullif(p.username, ''), p.author),
            'name', left(p.author, 80),
            'avatar', left(coalesce(p.data ->> 'avatar', ''), 500),
            'initials', left(coalesce(p.data ->> 'avatarInitials', ''), 4),
            'path', case when p.username <> '' then '/community/' || p.username
                         else '/community?user=' || p.user_id::text end
          )
          from public.public_profiles p
          where p.user_id::text = m.target_id
            and public.account_visible(p.user_id)
            and not public.is_blocked_between(v_viewer, p.user_id)
        )
        when 'club' then (
          select jsonb_build_object(
            'label', '[' || c.tag || ']',
            'name', left(coalesce(c.data ->> 'name', c.tag), 80),
            'tag', c.tag,
            'logo', left(coalesce(c.data ->> 'logo', ''), 300),
            'color', coalesce(c.data -> 'colors' ->> 'primary', ''),
            'path', '/clubs/' || c.id
          )
          from public.clubs c where c.id = m.target_id and not c.archived
        )
        when 'event' then (
          select jsonb_build_object(
            'label', left(coalesce(e.data ->> 'title', ''), 80),
            'name', left(coalesce(e.data ->> 'title', ''), 80),
            'date', e.event_date,
            'path', '/events/' || e.id
          )
          from public.events e where e.id = m.target_id and public.account_visible(e.created_by)
        )
        when 'page' then public.mention_page_card(m.target_id)
      end as card
    from public.profile_mentions m
    where m.owner_id = p_user and m.status = 'active'
  ) x
  where x.card is not null;
  return v_out;
end;
$$;
grant execute on function public.profile_mentions_for(uuid) to anon, authenticated;

-- Páginas que a pessoa administra (dona ou admin, ativa). Vazio sem a
-- migration das páginas.
create or replace function public.profile_presence_pages(p_user uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if to_regclass('public.pro_profiles') is null or to_regclass('public.pro_profile_members') is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'handle', p.handle,
    'name', left(coalesce(nullif(p.name, ''), '@' || p.handle), 80),
    'logo', left(coalesce(p.data ->> 'logo', ''), 500),
    'role', m.role,
    'path', '/p/' || p.handle
  ) order by m.role, p.name), '[]'::jsonb)
  into v_out
  from public.pro_profile_members m
  join public.pro_profiles p on p.id = m.profile_id
  where m.user_id = p_user and m.status = 'active' and m.role in ('owner', 'admin')
    and p.kind = 'page' and not p.suspended;
  return v_out;
end;
$$;
revoke execute on function public.profile_presence_pages(uuid) from public, anon, authenticated;

create or replace function public.profile_engine_presence(p_user uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_hide boolean;
  v_clubs jsonb;
  v_events jsonb;
  v_cutoff text := to_char((now() - interval '12 hours') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS');
begin
  if p_user is null or not public.account_visible(p_user) or public.is_blocked_between(v_viewer, p_user) then
    return jsonb_build_object('hidden', true);
  end if;
  select coalesce(data ->> 'hideEngineBlock', '') = 'true' into v_hide
    from public.public_profiles where user_id = p_user;
  if coalesce(v_hide, false) and v_viewer is distinct from p_user then
    return jsonb_build_object('hidden', true);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', left(coalesce(c.data ->> 'name', c.tag), 80),
    'tag', c.tag,
    'logo', left(coalesce(c.data ->> 'logo', ''), 300),
    'colors', coalesce(c.data -> 'colors', '{}'::jsonb),
    'emblem', coalesce(c.data -> 'emblem', '{}'::jsonb),
    'role', jsonb_build_object('id', r.id, 'preset', r.preset, 'name', r.name, 'color', r.color, 'position', r.position)
  ) order by r.position, c.member_count desc), '[]'::jsonb)
  into v_clubs
  from public.club_members m
  join public.clubs c on c.id = m.club_id
  join public.club_roles r on r.club_id = m.club_id and r.id = m.role_id
  where m.uid = p_user and not c.archived
    and (
      c.content_visibility = 'public'
      or v_viewer = p_user
      or exists (select 1 from public.club_members v where v.club_id = c.id and v.uid = v_viewer)
    );

  select coalesce(jsonb_agg(x.card order by x.event_date), '[]'::jsonb) into v_events
  from (
    select e.event_date, jsonb_build_object(
      'id', e.id,
      'title', left(coalesce(e.data ->> 'title', ''), 120),
      'date', e.event_date,
      'image', left(coalesce(e.data ->> 'image', ''), 500),
      'role', case
        when e.created_by = p_user then 'organizer'
        else coalesce(public.event_team_role(e.id, p_user), 'going')
      end
    ) as card
    from public.events e
    where e.event_date >= v_cutoff
      and public.account_visible(e.created_by)
      and (
        e.created_by = p_user
        -- Presença e equipe seguem a lista de presença: só quem tem conta.
        or (v_viewer is not null and (
          exists (select 1 from public.event_participants ep where ep.event_id = e.id and ep.uid = p_user)
          or exists (select 1 from public.event_team t where t.event_id = e.id and t.uid = p_user)
        ))
      )
    order by e.event_date
    limit 6
  ) x;

  return jsonb_build_object(
    'hidden', false,
    'hiddenForOthers', coalesce(v_hide, false),
    'clubs', v_clubs,
    'events', v_events,
    'pages', public.profile_presence_pages(p_user)
  );
end;
$$;
grant execute on function public.profile_engine_presence(uuid) to anon, authenticated;
