-- ---------------------------------------------------------------------------
-- Responder comentário (04/11/2026)
-- ---------------------------------------------------------------------------
--
-- Até aqui a conversa de um post era uma lista plana: quem respondia alguém
-- escrevia "@fulano ..." e torcia para a pessoa reparar. Agora o comentário
-- carrega `replyTo` (o id do comentário respondido) e a tela desenha o fio.
--
-- Três decisões que o banco garante, e não o cliente:
--
-- 1. O fio tem um nível só, como no Instagram. Responder uma resposta prende
--    o novo comentário na MESMA raiz, não cria um terceiro degrau — uma
--    árvore de profundidade livre no celular vira uma coluna de 20px.
-- 2. `replyTo` que não existe (o pai foi apagado enquanto a pessoa escrevia)
--    vira comentário de raiz em vez de erro: a pessoa não perde o que digitou.
-- 3. Quem é respondido recebe aviso. Antes só o dono do post sabia que havia
--    conversa; numa thread de 10 respostas, o dono recebia 10 avisos e os
--    respondidos, nenhum.
--
-- `replyToAuthor` guarda o @ de quem foi respondido no momento da escrita.
-- É cópia de leitura: serve para o "respondendo a @fulano" aparecer mesmo
-- quando o comentário pai some.

create or replace function public.add_comment(p_post_id text, p_comment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_comment jsonb;
  v_owner uuid;
  v_title text;
  v_profile record;
  v_reply_id text := nullif(btrim(coalesce(p_comment ->> 'replyTo', '')), '');
  v_parent jsonb;
  v_reply_author text := '';
  v_reply_user uuid := null;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select owner_id, left(coalesce(data ->> 'title', ''), 120) into v_owner, v_title
    from public.community_goals where id = p_post_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if public.is_blocked_between(v_uid, v_owner) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  -- O cartão (nome, @, retrato) vem do perfil público quando existe: o nome
  -- exibido no comentário deixa de ser o que o cliente quiser mandar.
  select author, username, data into v_profile from public.public_profiles where user_id = v_uid;

  -- O comentário respondido, se ainda existir.
  if v_reply_id is not null then
    select c into v_parent
      from public.community_goals g
      cross join lateral jsonb_array_elements(g.comments) as c
      where g.id = p_post_id and c ->> 'id' = v_reply_id
      limit 1;

    if v_parent is null then
      v_reply_id := null;  -- pai apagado: desce para a raiz
    else
      v_reply_author := left(coalesce(
        nullif(v_parent ->> 'username', ''), nullif(v_parent ->> 'author', ''), ''), 80);
      v_reply_user := nullif(v_parent ->> 'userId', '')::uuid;
      -- Resposta de resposta: prende na raiz do fio.
      if nullif(v_parent ->> 'replyTo', '') is not null then
        v_reply_id := v_parent ->> 'replyTo';
      end if;
      -- Quem me bloqueou (ou quem eu bloqueei) não vira destino de resposta.
      if v_reply_user is not null and public.is_blocked_between(v_uid, v_reply_user) then
        raise exception 'blocked' using errcode = '42501';
      end if;
    end if;
  end if;

  v_comment := jsonb_build_object(
    'id', coalesce(nullif(p_comment ->> 'id', ''), gen_random_uuid()::text),
    'userId', v_uid::text,
    'author', left(coalesce(nullif(v_profile.author, ''), p_comment ->> 'author', ''), 80),
    'username', left(coalesce(nullif(v_profile.username, ''), p_comment ->> 'username', ''), 32),
    'avatar', coalesce(nullif(v_profile.data ->> 'avatar', ''), p_comment ->> 'avatar', ''),
    'avatarInitials', left(coalesce(nullif(v_profile.data ->> 'avatarInitials', ''), p_comment ->> 'avatarInitials', ''), 4),
    'text', left(btrim(coalesce(p_comment ->> 'text', '')), 180),
    'replyTo', coalesce(v_reply_id, ''),
    'replyToAuthor', v_reply_author,
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  if v_comment ->> 'text' = '' then
    raise exception 'empty-comment' using errcode = 'P0001';
  end if;

  perform public.trust_this_transaction();
  update public.community_goals
    set comments = comments || jsonb_build_array(v_comment), updated_at = now()
    where id = p_post_id;

  perform public.notify(v_owner, v_uid, 'comment', jsonb_build_object(
    'goalId', p_post_id,
    'goalTitle', coalesce(v_title, ''),
    'commentId', v_comment ->> 'id',
    'actorName', v_comment ->> 'author',
    'targetPath', '/community?goal=' || p_post_id || '&comments=1'
  ));

  -- Aviso de resposta. `notify` já ignora eu mesmo e quem está bloqueado; o
  -- dono do post não leva dois avisos pelo mesmo comentário.
  if v_reply_user is not null and v_reply_user is distinct from v_owner then
    perform public.notify(v_reply_user, v_uid, 'comment', jsonb_build_object(
      'goalId', p_post_id,
      'goalTitle', coalesce(v_title, ''),
      'commentId', v_comment ->> 'id',
      'actorName', v_comment ->> 'author',
      'reply', true,
      'targetPath', '/community?goal=' || p_post_id || '&comments=1'
    ));
  end if;

  return v_comment;
end;
$$;

revoke execute on function public.add_comment(text, jsonb) from public, anon;
grant execute on function public.add_comment(text, jsonb) to authenticated;
