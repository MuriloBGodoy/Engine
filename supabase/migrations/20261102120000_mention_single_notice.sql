-- Um aviso só para quem é mencionado E dirige um clube mencionado na mesma
-- bio (decisão de produto, 02/11/2026).
--
-- Antes (20261101160000): a bio que mencionava @fulano e o clube que fulano
-- dirige mandava a fulano dois avisos — o de pessoa e o de clube. Agora o de
-- clube pula quem já está mencionado como pessoa nesta mesma escrita. O resto
-- de `set_bio_mentions` é idêntico.

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
  v_people text[];
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

  -- Pessoas mencionadas nesta mesma escrita (e que não se tiraram da bio):
  -- elas já recebem o aviso de pessoa, e não ganham o do clube também.
  select coalesce(array_agg(distinct r ->> 'id'), '{}') into v_people
  from jsonb_array_elements(p_refs) r
  where jsonb_typeof(r) = 'object' and r ->> 'kind' = 'person'
    and not exists (
      select 1 from public.profile_mentions pm
      where pm.owner_id = v_uid and pm.kind = 'person' and pm.target_id = r ->> 'id'
        and pm.status = 'removed_by_target'
    );

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
            and not (m.uid::text = any (v_people))
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

