-- Moderação mínima do social (auditoria social, achado 0.2).
--
-- Antes: denúncia de post ia para `reports` sem motivo e ninguém lia (a fila
-- só mostrava anúncio); o admin não conseguia apagar post alheio (RLS só do
-- dono) e não existia denúncia de comentário, perfil, mensagem, clube nem
-- evento.
--
-- Agora:
--   - `reports.target_type` tem lista fechada, com os tipos novos;
--   - `reports.context` guarda, no momento da denúncia, um retrato do que foi
--     denunciado (texto do comentário, da mensagem, título do post...). Quem
--     preenche é o BANCO, lendo o alvo — o denunciante não escreve o retrato.
--     Assim a moderação vê o que foi denunciado mesmo que o autor apague
--     depois, e mensagem privada só chega à moderação quando um dos dois
--     participantes denuncia aquela mensagem;
--   - `reported_user_id` também é carimbado pelo banco (não dá para denunciar
--     o post de A apontando o dedo para B);
--   - moderação (is_service_admin) apaga post, comentário e evento alheios, e
--     `moderation_remove(report)` tira do ar o alvo de uma denúncia e fecha
--     todas as denúncias abertas daquele alvo.
--
-- Motivos (códigos, gravados no começo de `reason`): spam, scam, offensive,
-- harassment, nudity, minor (parece ser menor de idade), other.

alter table public.reports add column if not exists context jsonb not null default '{}'::jsonb;

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in (
  'goal', 'post', 'comment', 'profile', 'message', 'club', 'event',
  'service_listing', 'service_review'
)) not valid;

create index if not exists reports_open on public.reports (status, created_at);

create or replace function public.reports_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_post text;
  v_comment text;
  v_row record;
  v_c jsonb;
begin
  if public.is_trusted_write() or public.is_service_admin() then
    return new;
  end if;
  new.status := 'pending';
  new.created_at := now();
  new.context := '{}'::jsonb;

  if new.target_type in ('goal', 'post') then
    select owner_id, kind, data into v_row from public.community_goals where id = new.target_id;
    if not found then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := v_row.owner_id::text;
    new.context := jsonb_build_object(
      'kind', v_row.kind,
      'author', left(coalesce(v_row.data ->> 'author', ''), 80),
      'username', left(coalesce(v_row.data ->> 'username', ''), 32),
      'title', left(coalesce(v_row.data ->> 'title', ''), 120),
      'text', left(coalesce(v_row.data ->> 'note', ''), 500),
      'image', left(coalesce(v_row.data ->> 'image', ''), 500)
    );

  elsif new.target_type = 'comment' then
    -- target_id = "<post>#<comentário>"
    v_post := split_part(new.target_id, '#', 1);
    v_comment := split_part(new.target_id, '#', 2);
    select c into v_c
      from public.community_goals g, jsonb_array_elements(g.comments) c
      where g.id = v_post and c ->> 'id' = v_comment;
    if v_c is null then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := coalesce(v_c ->> 'userId', '');
    new.context := jsonb_build_object(
      'postId', v_post,
      'commentId', v_comment,
      'author', left(coalesce(v_c ->> 'author', ''), 80),
      'username', left(coalesce(v_c ->> 'username', ''), 32),
      'text', left(coalesce(v_c ->> 'text', ''), 500)
    );

  elsif new.target_type = 'message' then
    select m.sender_id, m.conversation_id, m.text, m.type into v_row
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id::text = new.target_id and v_uid = any (c.member_ids);
    if not found or v_row.sender_id is not distinct from v_uid then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := coalesce(v_row.sender_id::text, '');
    new.context := jsonb_build_object(
      'conversationId', v_row.conversation_id,
      'type', v_row.type,
      'text', left(coalesce(v_row.text, ''), 500)
    );

  elsif new.target_type = 'profile' then
    select author, username, data into v_row from public.public_profiles where user_id::text = new.target_id;
    new.reported_user_id := new.target_id;
    new.context := jsonb_build_object(
      'author', left(coalesce(v_row.author, ''), 80),
      'username', left(coalesce(v_row.username, ''), 32),
      'text', left(coalesce(v_row.data ->> 'note', ''), 500),
      'image', left(coalesce(v_row.data ->> 'avatar', ''), 500)
    );

  elsif new.target_type = 'club' then
    select founder_id, tag, data into v_row from public.clubs where id = new.target_id;
    if not found then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := coalesce(v_row.founder_id::text, '');
    new.context := jsonb_build_object(
      'tag', v_row.tag,
      'title', left(coalesce(v_row.data ->> 'name', ''), 120),
      'text', left(coalesce(v_row.data ->> 'description', ''), 500)
    );

  elsif new.target_type = 'event' then
    select created_by, data into v_row from public.events where id = new.target_id;
    if not found then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
    new.reported_user_id := v_row.created_by::text;
    new.context := jsonb_build_object(
      'title', left(coalesce(v_row.data ->> 'title', ''), 120),
      'text', left(coalesce(v_row.data ->> 'description', ''), 500)
    );
  end if;
  return new;
end;
$$;
create trigger reports_context before insert on public.reports
  for each row execute function public.reports_context();

-- ---------------------------------------------------------------------------
-- A moderação remove conteúdo alheio
-- ---------------------------------------------------------------------------

create policy "posts: moderacao apaga" on public.community_goals
  for delete using (public.is_service_admin());
create policy "eventos: moderacao apaga" on public.events
  for delete using (public.is_service_admin());

-- Apagar comentário: o autor, o dono do post ou a moderação.
create or replace function public.delete_comment(p_post_id text, p_comment_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_service_admin();
begin
  perform public.trust_this_transaction();
  update public.community_goals g set
    comments = (
      select coalesce(jsonb_agg(c order by ord), '[]'::jsonb)
      from jsonb_array_elements(g.comments) with ordinality as t(c, ord)
      where not (
        c ->> 'id' = p_comment_id
        and (v_admin or c ->> 'userId' = v_uid::text or g.owner_id = v_uid)
      )
    ),
    updated_at = now()
  where g.id = p_post_id;
end;
$$;
revoke execute on function public.delete_comment(text, text) from public, anon;

-- Tira do ar o alvo de uma denúncia e fecha todas as denúncias abertas dele.
create or replace function public.moderation_remove(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  if not public.is_service_admin() then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  select * into v_report from public.reports where id = p_report_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  perform public.trust_this_transaction();
  if v_report.target_type in ('goal', 'post') then
    delete from public.community_goals where id = v_report.target_id;
  elsif v_report.target_type = 'comment' then
    update public.community_goals g set
      comments = (
        select coalesce(jsonb_agg(c order by ord), '[]'::jsonb)
        from jsonb_array_elements(g.comments) with ordinality as t(c, ord)
        where c ->> 'id' is distinct from split_part(v_report.target_id, '#', 2)
      )
    where g.id = split_part(v_report.target_id, '#', 1);
  elsif v_report.target_type = 'message' then
    delete from public.messages where id::text = v_report.target_id;
  elsif v_report.target_type = 'event' then
    delete from public.events where id = v_report.target_id;
  elsif v_report.target_type = 'club' then
    update public.clubs set archived = true, updated_at = now() where id = v_report.target_id;
  elsif v_report.target_type = 'profile' then
    -- Perfil não se apaga: limpa bio, retrato e capa públicos.
    update public.public_profiles
      set data = data || jsonb_build_object('note', '', 'avatar', '', 'banner', '')
      where user_id::text = v_report.target_id;
  else
    raise exception 'unsupported-target' using errcode = 'P0001';
  end if;

  update public.reports set status = 'resolved'
    where target_type = v_report.target_type and target_id = v_report.target_id and status = 'pending';
end;
$$;
revoke execute on function public.moderation_remove(uuid) from public, anon;
grant execute on function public.moderation_remove(uuid) to authenticated;
