-- O que o público lê, e só isso (auditoria social, achados 0.6, 0.7, p9, e6).
--
-- 1. Dinheiro fora do post público. O card dizia "Valores privados ocultos" e
--    a Política diz "Metas publicadas aparecem sem os valores em dinheiro",
--    mas `savedValue` e `targetValue` iam no `data` de `community_goals`, que
--    o anônimo lê. Agora o banco guarda só a porcentagem (`progress`, 0–100,
--    inteiro) e descarta os valores em toda escrita — inclusive de cliente
--    antigo ou adulterado. O dono continua vendo os dele, que moram em `cars`.
--
-- 2. Ordem do feed por `created_at` (índice novo). Antes era `updated_at`, que
--    sobe a cada curtida, comentário e a cada troca de tema (um update por
--    post) — o feed virava "último que alguém mexeu".
--
-- 3. Contagem de seguidores para visitante: a lista continua só para quem
--    tem conta, mas o número é público (`follow_counts`).
--
-- 4. Presença em evento: a lista com nome e carro deixa de ser legível por
--    anônimo; visitante vê só o total (`event_participant_counts`). O nome
--    gravado passa a ser o nome de exibição do Engine, carimbado pelo banco —
--    antes era o displayName da conta Google (nome completo).

-- ---------------------------------------------------------------------------
-- 1. Valores em dinheiro
-- ---------------------------------------------------------------------------

create or replace function public.community_goals_private_values()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_saved numeric;
  v_target numeric;
begin
  if new.data ? 'savedValue' or new.data ? 'targetValue' then
    v_saved := case when jsonb_typeof(new.data -> 'savedValue') = 'number' then (new.data ->> 'savedValue')::numeric
                    when (new.data ->> 'savedValue') ~ '^-?[0-9]+(\.[0-9]+)?$' then (new.data ->> 'savedValue')::numeric end;
    v_target := case when jsonb_typeof(new.data -> 'targetValue') = 'number' then (new.data ->> 'targetValue')::numeric
                     when (new.data ->> 'targetValue') ~ '^-?[0-9]+(\.[0-9]+)?$' then (new.data ->> 'targetValue')::numeric end;
    if coalesce(v_target, 0) > 0 then
      new.data := jsonb_set(new.data, '{progress}',
        to_jsonb(greatest(0, least(100, floor(coalesce(v_saved, 0) * 100 / v_target)))::integer));
    end if;
    new.data := new.data - 'savedValue' - 'targetValue';
  end if;
  -- Porcentagem enviada direto também é presa entre 0 e 100.
  if new.data ? 'progress' then
    new.data := jsonb_set(new.data, '{progress}', to_jsonb(greatest(0, least(100,
      coalesce(case when jsonb_typeof(new.data -> 'progress') = 'number' then floor((new.data ->> 'progress')::numeric) end, 0)))::integer));
  end if;
  return new;
end;
$$;
create trigger community_goals_private_values before insert or update on public.community_goals
  for each row execute function public.community_goals_private_values();

-- Posts que já estão no ar. Escrita de confiança para não carimbar
-- `updated_at` em todos de uma vez.
select public.trust_this_transaction();
update public.community_goals
  set data = data
  where data ? 'savedValue' or data ? 'targetValue';

-- ---------------------------------------------------------------------------
-- 2. Feed por data de publicação
-- ---------------------------------------------------------------------------

create index if not exists community_goals_feed_created
  on public.community_goals (created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- 3. Seguidores: número público, lista para quem tem conta
-- ---------------------------------------------------------------------------

create or replace function public.follow_counts(p_user uuid)
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'followers', (select count(*) from public.follows where target_id = p_user),
    'following', (select count(*) from public.follows where follower_id = p_user)
  );
$$;
grant execute on function public.follow_counts(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Presença em evento
-- ---------------------------------------------------------------------------

drop policy if exists "presenca: publica" on public.event_participants;
create policy "presenca: quem tem conta ve" on public.event_participants
  for select to authenticated using (true);

create or replace function public.event_participant_counts(p_event_ids text[])
returns table (event_id text, total bigint)
language sql stable
security definer
set search_path = ''
as $$
  select e.id, (select count(*) from public.event_participants p where p.event_id = e.id)
  from unnest(coalesce(p_event_ids, '{}')) as e(id);
$$;
grant execute on function public.event_participant_counts(text[]) to anon, authenticated;

-- Nome e retrato vêm do perfil público, não do cliente.
create or replace function public.event_participants_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
begin
  select author, username, data into v_profile from public.public_profiles where user_id = new.uid;
  new.data := coalesce(new.data, '{}'::jsonb)
    || jsonb_build_object(
      'displayName', coalesce(nullif(left(v_profile.author, 80), ''), 'Usuário Engine'),
      'username', coalesce(left(v_profile.username, 32), ''),
      'avatar', coalesce(v_profile.data ->> 'avatar', '')
    );
  return new;
end;
$$;
create trigger event_participants_card before insert or update on public.event_participants
  for each row execute function public.event_participants_card();

-- Presenças já gravadas trocam o nome da conta Google pelo do Engine.
update public.event_participants set data = data;
