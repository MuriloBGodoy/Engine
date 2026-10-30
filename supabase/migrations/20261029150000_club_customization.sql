-- Personalização do clube: logo, capa, cores e edição depois de criado.
--
-- Até aqui o clube só tinha o emblema gerado (forma × símbolo × sigla × cor)
-- e um campo `cover` que nenhuma tela preenchia. Agora a direção do clube
-- (fundador e capitães) sobe logo quadrada e capa larga, troca as cores e o
-- símbolo, e o fundador edita nome, cidade e foco depois de fundar.
--
-- O que muda no banco:
--
--   1. Storage: pasta `clubs/<club_id>/` no bucket `photos`. Só a direção de
--      um clube não arquivado sobe; só a direção apaga. A conta suspensa já
--      é barrada pela política restritiva "fotos: conta suspensa nao sobe"
--      (20261028120000), que vale para qualquer pasta. Tamanho e formatos
--      são os do bucket (6 MB; JPEG/PNG/WebP/GIF) — o app sobe JPEG limpo,
--      sem EXIF, por services/cleanImage.js.
--
--   2. `data.logo` e `data.cover` guardam o CAMINHO do objeto
--      (`clubs/<id>/arquivo.jpg`), não a URL. O `update_club` só aceita
--      caminho dentro da pasta do próprio clube e de objeto que EXISTE no
--      Storage — ou seja, que passou pela política acima. Link externo
--      (foto que ninguém limpou nem moderou, pixel de rastreio) e data URI
--      (que incha a linha) ficam de fora.
--
--   3. Capitão passa a mexer também no visual (logo, capa, cores, emblema).
--      Identidade (nome, sigla, cidade, foco, regras de entrada) continua do
--      fundador. Sigla continua imutável.
--
--   4. `create_club` não aceita logo nem capa: na criação o clube ainda não
--      tem pasta, então qualquer valor ali seria de fora.

-- ---------------------------------------------------------------------------
-- 1. Storage
-- ---------------------------------------------------------------------------

-- Política roda como quem sobe; `security definer` para ler club_members e
-- clubs sem cair na RLS deles.
create or replace function public.club_can_upload(p_club text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_club_staff(p_club)
      and exists (select 1 from public.clubs where id = p_club and not archived),
    false
  );
$$;
revoke execute on function public.club_can_upload(text) from public, anon;
grant execute on function public.club_can_upload(text) to authenticated;

create policy "fotos: direcao do clube sobe" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'clubs'
    and public.club_can_upload((storage.foldername(name))[2])
  );

-- O `remove()` do Storage apaga com RETURNING, e por isso também precisa
-- enxergar a linha. Só a direção, só na pasta do clube; o arquivo em si já é
-- público pelo bucket.
create policy "fotos: direcao do clube ve a pasta" on storage.objects
  for select to authenticated using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'clubs'
    and public.is_club_staff((storage.foldername(name))[2])
  );

create policy "fotos: direcao do clube apaga" on storage.objects
  for delete to authenticated using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'clubs'
    and public.is_club_staff((storage.foldername(name))[2])
  );

-- ---------------------------------------------------------------------------
-- 2. Validação da imagem do clube
-- ---------------------------------------------------------------------------

-- '' (tirar a imagem) ou um objeto que existe em `clubs/<id>/`.
create or replace function public.club_image_ok(p_club text, p_value text)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_prefix text := 'clubs/' || p_club || '/';
  v_rest text;
begin
  if p_value is null or p_value = '' then
    return true;
  end if;
  if left(p_value, char_length(v_prefix)) <> v_prefix then
    return false;
  end if;
  v_rest := substr(p_value, char_length(v_prefix) + 1);
  if v_rest !~ '^[A-Za-z0-9._-]{1,120}$' or v_rest like '..%' then
    return false;
  end if;
  return exists (select 1 from storage.objects where bucket_id = 'photos' and name = p_value);
end;
$$;
revoke execute on function public.club_image_ok(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Edição
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
  if v_role not in ('founder', 'captain') then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'invalid-patch' using errcode = 'P0001';
  end if;
  v_patch := v_patch - array['tag', 'founderId', 'memberCount', 'official', 'archived', 'createdAt', 'updatedAt', 'id'];
  if v_role = 'captain' then
    for v_key in select jsonb_object_keys(v_patch) loop
      if not v_key = any (v_captain_keys) then
        raise exception 'not-allowed' using errcode = '42501';
      end if;
    end loop;
  end if;

  -- Imagens: só caminho da pasta do clube, de objeto que existe.
  foreach v_key in array array['logo', 'cover'] loop
    if v_patch ? v_key then
      if jsonb_typeof(v_patch -> v_key) <> 'string'
         or not public.club_image_ok(p_club_id, v_patch ->> v_key) then
        raise exception 'invalid-image' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- Cores e emblema são NOMES do vocabulário da tela (clubStyles.js), não
  -- hex nem SVG: aqui só o formato, para nada estranho chegar ao card.
  if v_patch ? 'colors' then
    if jsonb_typeof(v_patch -> 'colors') <> 'object'
       or coalesce(v_patch -> 'colors' ->> 'primary', '') !~ '^[a-z0-9-]{0,32}$'
       or coalesce(v_patch -> 'colors' ->> 'secondary', '') !~ '^[a-z0-9-]{0,32}$' then
      raise exception 'invalid-colors' using errcode = 'P0001';
    end if;
  end if;
  if v_patch ? 'emblem' then
    if jsonb_typeof(v_patch -> 'emblem') <> 'object'
       or coalesce(v_patch -> 'emblem' ->> 'shape', '') !~ '^[a-z0-9-]{0,12}$'
       or coalesce(v_patch -> 'emblem' ->> 'icon', '') !~ '^[a-z0-9-]{0,24}$' then
      raise exception 'invalid-emblem' using errcode = 'P0001';
    end if;
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
-- 4. Criação: sem logo nem capa
-- ---------------------------------------------------------------------------

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
      (p_club - array['tag', 'founderId', 'memberCount', 'official', 'archived', 'createdAt', 'updatedAt', 'logo', 'cover'])
        || jsonb_build_object('logo', '', 'cover', '')
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
revoke execute on function public.create_club(jsonb, jsonb) from public, anon;
grant execute on function public.create_club(jsonb, jsonb) to authenticated;
