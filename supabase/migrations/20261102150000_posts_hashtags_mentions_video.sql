-- Publicações como numa rede social de verdade (pedido de 02/11/2026: "DM,
-- edição de posts, reels, hashtags, edição do vídeo, horário do post").
--
-- 1. "Editado": `community_goals.edited_at`, carimbado pelo BANCO quando a
--    legenda muda. O cliente não escolhe a data nem esconde a edição.
--
-- 2. #hashtags: o banco lê a legenda e mantém `post_hashtags` (uma linha por
--    post e tag, normalizada em minúsculas, acento preservado). É o que faz a
--    página /community/tag/<tag> e o bloco "em alta" funcionarem sem varrer o
--    feed inteiro. Limite de 30 por legenda, como no Instagram — recusado na
--    escrita da legenda, nunca numa curtida em post antigo.
--
-- 3. @menção em legenda e comentário: `@usuario` em texto puro (o mesmo @ do
--    perfil). Quem é mencionado recebe o aviso 'mention' (já existente), uma
--    vez por menção nova: editar a legenda sem acrescentar ninguém não avisa
--    de novo. Bloqueio vale (é o `notify`).
--
-- 4. Vídeo enviado (não só link do YouTube): bucket `videos`, cada pessoa na
--    própria pasta, 50 MB por arquivo. O post guarda o CAMINHO do arquivo e os
--    metadados de edição (corte início/fim, sem som, capa); o banco recusa
--    caminho fora da pasta do dono e prende os números. Não há transcodificação
--    no servidor: o corte é tocado pelo player, o arquivo é o original.
--
-- 5. Mensagens: apagar a última mensagem atualiza a prévia da conversa e o
--    contador de não lidas (antes a prévia continuava mostrando o texto
--    apagado); editar mensagem de texto própria por até 15 minutos.

-- ---------------------------------------------------------------------------
-- Leitura do texto: tags e menções
-- ---------------------------------------------------------------------------

-- Letras aceitas numa tag: ASCII, Latin-1 e Latin Extended-A/B (pt, es, fr,
-- de, pl...). A mesma classe vive em `engine/src/services/socialText.js`.
create or replace function public.extract_hashtags(p_text text)
returns text[]
language sql immutable
set search_path = ''
as $$
  select coalesce(array_agg(tag order by first_at), '{}')
  from (
    select tag, min(ord) as first_at
    from (
      select
        translate(lower(m[2]),
          'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ',
          'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþ') as tag,
        ord
      from regexp_matches(
        coalesce(p_text, ''),
        '(^|[^0-9A-Za-z_À-ÖØ-öø-ÿĀ-ɏ&#/])#([0-9A-Za-z_À-ÖØ-öø-ÿĀ-ɏ]+)',
        'g'
      ) with ordinality as t(m, ord)
    ) found
    -- Só número (#2024) não é tag; tag gigante é ruído.
    where char_length(tag) <= 50 and tag ~ '[A-Za-zÀ-ÖØ-öø-ÿĀ-ɏ]'
    group by tag
  ) tags;
$$;

-- `@usuario` → o @ como é guardado em `usernames` (minúsculo, sem arroba).
-- E-mail (`ana@gmail.com`) não conta: a arroba precisa vir depois de espaço
-- ou pontuação.
create or replace function public.extract_mentions(p_text text)
returns text[]
language sql immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct name), '{}')
  from (
    select rtrim(lower(m[2]), '.') as name
    from regexp_matches(
      coalesce(p_text, ''),
      '(^|[^0-9A-Za-z_.@/])@([A-Za-z0-9._]{1,30})',
      'g'
    ) as t(m)
  ) found
  where name <> '' and char_length(name) <= 24;
$$;

-- ---------------------------------------------------------------------------
-- 1 e 4. Carimbo de edição e vídeo saneado
-- ---------------------------------------------------------------------------

alter table public.community_goals add column if not exists edited_at timestamptz;

-- Número do JSON preso entre limites (texto ou lixo vira o mínimo).
create or replace function public.jsonb_num(p_value jsonb, p_min numeric, p_max numeric)
returns numeric
language sql immutable
set search_path = ''
as $$
  select greatest(p_min, least(p_max, case
    when jsonb_typeof(p_value) = 'number' then (p_value #>> '{}')::numeric
    else p_min
  end));
$$;

create or replace function public.community_goals_social_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_video jsonb;
  v_folder text := '^users/' || new.owner_id::text || '/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$';
  v_start numeric;
  v_end numeric;
  v_duration numeric;
  v_note_changed boolean;
begin
  v_note_changed := tg_op = 'INSERT' or (new.data ->> 'note') is distinct from (old.data ->> 'note');

  -- "Editado" só quando a LEGENDA muda, e a data é a do banco.
  if tg_op = 'INSERT' then
    new.edited_at := null;
  elsif v_note_changed then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  if v_note_changed and cardinality(public.extract_hashtags(new.data ->> 'note')) > 30 then
    raise exception 'too-many-hashtags' using errcode = 'P0001';
  end if;

  -- Vídeo: só caminho dentro da pasta do dono no bucket `videos` (nada de
  -- URL arbitrária — rastreador, arquivo alheio) e números com limite.
  if new.data ? 'video' then
    v_video := new.data -> 'video';
    if jsonb_typeof(v_video) <> 'object'
       or coalesce(v_video ->> 'path', '') !~ v_folder
       or position('..' in coalesce(v_video ->> 'path', '')) > 0
       or char_length(v_video ->> 'path') > 300 then
      new.data := new.data - 'video';
    else
      v_duration := public.jsonb_num(v_video -> 'duration', 0, 600);
      v_start := public.jsonb_num(v_video -> 'trimStart', 0, greatest(v_duration, 0));
      v_end := public.jsonb_num(v_video -> 'trimEnd', 0, greatest(v_duration, 0));
      if v_end <= v_start then
        v_end := least(v_duration, v_start + 60);
      end if;
      -- O trecho tocado vai até 60 s (meio segundo de folga para arredondamento).
      if v_end - v_start > 60.5 then
        v_end := v_start + 60;
      end if;
      new.data := jsonb_set(new.data, '{video}', jsonb_strip_nulls(jsonb_build_object(
        'path', v_video ->> 'path',
        'posterPath', case
          when coalesce(v_video ->> 'posterPath', '') ~ v_folder
               and position('..' in v_video ->> 'posterPath') = 0
               and char_length(v_video ->> 'posterPath') <= 300
            then v_video ->> 'posterPath'
        end,
        'duration', round(v_duration, 2),
        'trimStart', round(v_start, 2),
        'trimEnd', round(v_end, 2),
        'muted', coalesce((v_video ->> 'muted')::boolean, false),
        'width', public.jsonb_num(v_video -> 'width', 0, 8192)::integer,
        'height', public.jsonb_num(v_video -> 'height', 0, 8192)::integer
      )));
    end if;
  end if;
  return new;
exception
  when invalid_text_representation then
    -- `muted` que não é booleano: o vídeo sai inteiro em vez de quebrar o post.
    new.data := new.data - 'video';
    return new;
end;
$$;
revoke execute on function public.community_goals_social_stamp() from public, anon, authenticated;

create trigger community_goals_social_stamp before insert or update on public.community_goals
  for each row execute function public.community_goals_social_stamp();

-- Reels: só os posts com vídeo enviado, do mais novo para o mais velho.
create index if not exists community_goals_videos
  on public.community_goals (created_at desc, id desc)
  where (data -> 'video') is not null;

-- ---------------------------------------------------------------------------
-- 2. Hashtags
-- ---------------------------------------------------------------------------

create table public.post_hashtags (
  post_id text not null references public.community_goals (id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 50),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Data do POST (não da tag): a página da tag é cronológica como o feed.
  created_at timestamptz not null,
  primary key (post_id, tag)
);
create index post_hashtags_tag on public.post_hashtags (tag, created_at desc, post_id desc);
create index post_hashtags_recent on public.post_hashtags (created_at desc);
alter table public.post_hashtags enable row level security;
-- Público como o post. Escrita só pelo gatilho abaixo.
create policy "hashtags: publicas" on public.post_hashtags for select using (true);
create policy "suspensao: hashtags somem" on public.post_hashtags
  as restrictive for select using (public.account_visible(owner_id));

create or replace function public.community_goals_hashtags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tags text[];
begin
  if tg_op = 'UPDATE' and (new.data ->> 'note') is not distinct from (old.data ->> 'note') then
    return null;
  end if;
  v_tags := public.extract_hashtags(new.data ->> 'note');
  delete from public.post_hashtags where post_id = new.id and not (tag = any (v_tags));
  insert into public.post_hashtags (post_id, tag, owner_id, created_at)
  select new.id, t, new.owner_id, new.created_at from unnest(v_tags) as t
  on conflict (post_id, tag) do nothing;
  return null;
end;
$$;
revoke execute on function public.community_goals_hashtags() from public, anon, authenticated;

create trigger community_goals_hashtags after insert or update on public.community_goals
  for each row execute function public.community_goals_hashtags();

-- Posts que já estão no ar.
insert into public.post_hashtags (post_id, tag, owner_id, created_at)
select g.id, t, g.owner_id, g.created_at
from public.community_goals g, unnest(public.extract_hashtags(g.data ->> 'note')) as t
on conflict (post_id, tag) do nothing;

-- Feed de uma tag, paginado por data (cursor = created_at + id do último).
-- `security invoker`: a RLS do post (inclusive a da suspensão) vale aqui.
create or replace function public.hashtag_feed(
  p_tag text,
  p_before timestamptz default null,
  p_before_id text default null,
  p_limit integer default 20
)
returns setof public.community_goals
language sql stable
set search_path = ''
as $$
  select g.*
  from public.post_hashtags h
  join public.community_goals g on g.id = h.post_id
  where h.tag = lower(btrim(coalesce(p_tag, ''), '# '))
    and (
      p_before is null
      or h.created_at < p_before
      or (h.created_at = p_before and h.post_id < coalesce(p_before_id, ''))
    )
  order by h.created_at desc, h.post_id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
grant execute on function public.hashtag_feed(text, timestamptz, text, integer) to anon, authenticated;

-- Quantos posts uma tag tem (cabeçalho da página da tag).
create or replace function public.hashtag_count(p_tag text)
returns bigint
language sql stable
set search_path = ''
as $$
  select count(*) from public.post_hashtags where tag = lower(btrim(coalesce(p_tag, ''), '# '));
$$;
grant execute on function public.hashtag_count(text) to anon, authenticated;

-- Em alta: tags com mais posts DE PESSOAS DIFERENTES nos últimos dias. Contar
-- autores, e não posts, impede uma conta só de empurrar a própria tag.
create or replace function public.trending_hashtags(p_days integer default 7, p_limit integer default 12)
returns table (tag text, posts bigint, authors bigint)
language sql stable
set search_path = ''
as $$
  select h.tag, count(*) as posts, count(distinct h.owner_id) as authors
  from public.post_hashtags h
  where h.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)))
  group by h.tag
  order by count(distinct h.owner_id) desc, count(*) desc, max(h.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;
grant execute on function public.trending_hashtags(integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. @menção em legenda e comentário
-- ---------------------------------------------------------------------------

create or replace function public.community_goals_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_new text[];
  v_old text[];
  v_target uuid;
  v_comment jsonb;
  v_before jsonb;
  v_sent integer := 0;
begin
  -- Sem sessão (migration, service role): ninguém "mencionou" ninguém.
  if v_uid is null then
    return null;
  end if;

  -- Legenda: só o dono escreve. Avisa quem ENTROU no texto agora.
  if v_uid = new.owner_id
     and (tg_op = 'INSERT' or (new.data ->> 'note') is distinct from (old.data ->> 'note')) then
    v_new := public.extract_mentions(new.data ->> 'note');
    v_old := case when tg_op = 'UPDATE' then public.extract_mentions(old.data ->> 'note') else '{}' end;
    for v_target in
      select u.user_id from public.usernames u
      where u.username = any (v_new) and not (u.username = any (v_old))
      limit 10
    loop
      perform public.notify(v_target, v_uid, 'mention', jsonb_build_object(
        'mentionKind', 'post',
        'goalId', new.id,
        'goalTitle', left(coalesce(new.data ->> 'title', ''), 120),
        'targetPath', '/post/' || new.id
      ), true);
    end loop;
  end if;

  -- Comentário novo ou editado por quem está escrevendo agora.
  if tg_op = 'UPDATE' and new.comments is distinct from old.comments then
    for v_comment in
      select c from jsonb_array_elements(new.comments) c
      where c ->> 'userId' = v_uid::text
        and not exists (select 1 from jsonb_array_elements(old.comments) o where o = c)
    loop
      select o into v_before from jsonb_array_elements(old.comments) o
        where o ->> 'id' = v_comment ->> 'id' limit 1;
      v_new := public.extract_mentions(v_comment ->> 'text');
      v_old := public.extract_mentions(v_before ->> 'text');
      for v_target in
        select u.user_id from public.usernames u
        where u.username = any (v_new) and not (u.username = any (v_old))
        limit 5
      loop
        exit when v_sent >= 10;
        perform public.notify(v_target, v_uid, 'mention', jsonb_build_object(
          'mentionKind', 'comment',
          'goalId', new.id,
          'commentId', v_comment ->> 'id',
          'goalTitle', left(coalesce(new.data ->> 'title', ''), 120),
          'targetPath', '/post/' || new.id || '?comments=1'
        ));
        v_sent := v_sent + 1;
      end loop;
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function public.community_goals_mentions() from public, anon, authenticated;

create trigger community_goals_mentions after insert or update on public.community_goals
  for each row execute function public.community_goals_mentions();

-- ---------------------------------------------------------------------------
-- 4. Bucket de vídeos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy "videos: cada um na sua pasta" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
-- O `remove()` do Storage apaga com RETURNING: o dono precisa enxergar a linha.
create policy "videos: dono ve a pasta" on storage.objects
  for select to authenticated using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
create policy "videos: dono apaga" on storage.objects
  for delete to authenticated using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
-- A restrição "fotos: conta suspensa nao sobe" (20261028120000) não filtra
-- bucket: já vale para `videos`.

-- ---------------------------------------------------------------------------
-- 5. Mensagens: apagar e editar
-- ---------------------------------------------------------------------------

-- A mesma prévia que `send_message` grava.
create or replace function public.message_preview(p_text text, p_type text, p_data jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when coalesce(p_text, '') <> '' then p_text
    when p_type = 'gif' then '🎬 GIF'
    when p_type = 'image' then '📷 Imagem'
    when p_data -> 'attachment' ->> 'title' is not null then '📷 ' || (p_data -> 'attachment' ->> 'title')
    else '📷 Publicação'
  end;
$$;

-- Mensagem apagada: se era a mais recente, a prévia passa a ser a anterior
-- (ou nenhuma); se o outro lado ainda não tinha visto, sai do contador dele.
-- Não mexe em `updated_at`: apagar não sobe a conversa na lista.
create or replace function public.messages_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
  v_actor uuid;
  v_last public.messages;
  v_unread jsonb;
  v_member uuid;
begin
  select * into v_conv from public.conversations where id = old.conversation_id for update;
  if not found then
    return null;
  end if;
  v_unread := v_conv.unread;

  if old.status = 'delivered' then
    -- De que lado veio: um dos dois, ou (fio de página) a equipe falando
    -- como o prestador.
    v_actor := case
      when old.sender_id = any (v_conv.member_ids) then old.sender_id
      when v_conv.kind = 'service' then v_conv.provider_id
      else old.sender_id
    end;
    foreach v_member in array v_conv.member_ids loop
      if v_member is distinct from v_actor then
        v_unread := v_unread || jsonb_build_object(v_member::text,
          greatest(coalesce((v_unread ->> v_member::text)::integer, 0) - 1, 0));
      end if;
    end loop;
  end if;

  if not exists (
    select 1 from public.messages m
    where m.conversation_id = old.conversation_id and m.created_at > old.created_at
  ) then
    select * into v_last from public.messages m
      where m.conversation_id = old.conversation_id
      order by m.created_at desc, m.id desc limit 1;
    update public.conversations set
      unread = v_unread,
      last_message = case when v_last.id is null then null else jsonb_build_object(
        'text', public.message_preview(v_last.text, v_last.type, v_last.data),
        'senderId', coalesce(v_last.sender_id::text, ''),
        'type', v_last.type,
        'createdAt', to_char(v_last.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      end
    where id = old.conversation_id;
  elsif v_unread is distinct from v_conv.unread then
    update public.conversations set unread = v_unread where id = old.conversation_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.messages_after_delete() from public, anon, authenticated;

create trigger messages_after_delete after delete on public.messages
  for each row execute function public.messages_after_delete();

-- Editar: só o autor, só texto, até 15 minutos depois de mandar. A denúncia
-- já guardou o texto original no momento em que foi feita (reports_context),
-- então editar depois não apaga a prova.
create or replace function public.edit_message(p_message uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
  v_conv public.conversations;
  v_actor uuid;
  v_text text := left(btrim(coalesce(p_text, '')), 2000);
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select * into v_msg from public.messages where id = p_message for update;
  if not found or v_msg.sender_id is distinct from v_uid then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if v_msg.type <> 'text' then
    raise exception 'invalid-type' using errcode = 'P0001';
  end if;
  if v_msg.created_at < now() - interval '15 minutes' then
    raise exception 'edit-window-closed' using errcode = 'P0001';
  end if;
  if v_text = '' then
    raise exception 'empty-message' using errcode = 'P0001';
  end if;
  if public.is_account_suspended(v_uid) then
    raise exception 'account-suspended' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations where id = v_msg.conversation_id for update;
  v_actor := public.conversation_actor(v_conv, v_uid);
  if v_actor is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  foreach v_other in array v_conv.member_ids loop
    if v_other <> v_actor and (public.is_blocked_between(v_uid, v_other) or public.is_blocked_between(v_actor, v_other)) then
      raise exception 'blocked' using errcode = '42501';
    end if;
  end loop;
  if v_text = v_msg.text then
    return;
  end if;

  update public.messages set
    text = v_text,
    data = data || jsonb_build_object('editedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  where id = p_message;

  -- Era a última: a prévia da lista acompanha.
  if not exists (
    select 1 from public.messages m
    where m.conversation_id = v_msg.conversation_id and m.created_at > v_msg.created_at
  ) then
    update public.conversations
      set last_message = coalesce(last_message, '{}'::jsonb) || jsonb_build_object('text', v_text)
      where id = v_msg.conversation_id;
  end if;
end;
$$;
revoke execute on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Publicações salvas ("Salvar" do cartão)
-- ---------------------------------------------------------------------------

-- Lista privada: só quem salvou lê e mexe. Salvar exige ENXERGAR o post (a
-- subconsulta roda com a RLS de quem salva — post de conta suspensa não
-- aparece, então não salva) e não ter bloqueio entre os dois. Post apagado
-- sai da lista em cascata.
create table public.saved_posts (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id text not null references public.community_goals (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index saved_posts_user on public.saved_posts (user_id, created_at desc);
create index saved_posts_post on public.saved_posts (post_id);
alter table public.saved_posts enable row level security;

create policy "salvos: so o dono le" on public.saved_posts
  for select to authenticated using (user_id = (select auth.uid()));
-- `is_blocked_between` não é executável pelo cliente; a política chama esta
-- casca, que só responde sobre quem está logado.
create or replace function public.post_blocked_for_me(p_post text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_goals g
    where g.id = p_post and public.is_blocked_between(auth.uid(), g.owner_id)
  );
$$;
revoke execute on function public.post_blocked_for_me(text) from public, anon;
grant execute on function public.post_blocked_for_me(text) to authenticated;

create policy "salvos: salva o que enxerga" on public.saved_posts
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.community_goals g where g.id = post_id)
    and not public.post_blocked_for_me(post_id)
  );
create policy "salvos: dono tira" on public.saved_posts
  for delete to authenticated using (user_id = (select auth.uid()));

-- A data é do banco (ordem da lista "Salvos").
create or replace function public.saved_posts_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;
revoke execute on function public.saved_posts_stamp() from public, anon, authenticated;
create trigger saved_posts_stamp before insert on public.saved_posts
  for each row execute function public.saved_posts_stamp();
