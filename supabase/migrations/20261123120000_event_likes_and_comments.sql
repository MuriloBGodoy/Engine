-- Curtir e comentar um evento.
--
-- O evento já tinha a presença ("eu vou", em `event_participants`), que é a
-- resposta mais cara que alguém dá: compromisso de aparecer num sábado. O que
-- faltava era o degrau de baixo — achar legal, perguntar se tem vaga no
-- estacionamento, marcar com um amigo. Sem ele o evento é um cartaz colado na
-- parede: a página só servia para quem já tinha decidido ir.
--
-- Duas formas diferentes, de propósito:
--
--  * **Curtida é linha**, como a presença (`event_likes`). Precisa responder
--    "eu curti?" para a pessoa certa e "quantos?" para todo mundo, e é isso
--    que uma linha por pessoa faz bem. A LISTA é de quem tem conta; o total
--    sai por função (`event_like_counts`), igual ao de confirmados — quem
--    chega sem login vê o número, não a plateia.
--
--  * **Comentário é jsonb no próprio evento**, como no carro
--    (20261104150000_car_comments) e no post. Tabela nova para comentário
--    seria política nova, índice novo e moderação nova para resolver um
--    problema que o feed já resolve assim. O autor é carimbado pelo servidor
--    a partir de `auth.uid()`; o navegador manda só o texto.
--
-- Não há contador de curtida guardado no evento: contagem é a verdade, e
-- contador guardado sai de sincronia (a mesma decisão da presença). O de
-- comentário existe porque a lista mora no registro, e `jsonb_array_length`
-- numa listagem de 50 eventos seria conta repetida à toa.

-- ---------------------------------------------------------------------------
-- 1. Curtida
-- ---------------------------------------------------------------------------

create table if not exists public.event_likes (
  event_id text not null references public.events (id) on delete cascade,
  uid uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, uid)
);
create index if not exists event_likes_uid on public.event_likes (uid);
alter table public.event_likes enable row level security;

drop policy if exists "curtida de evento: quem tem conta ve" on public.event_likes;
create policy "curtida de evento: quem tem conta ve" on public.event_likes
  for select to authenticated using (true);

drop policy if exists "curtida de evento: curte por si" on public.event_likes;
create policy "curtida de evento: curte por si" on public.event_likes
  for insert to authenticated with check (uid = (select auth.uid()));

drop policy if exists "curtida de evento: descurte por si" on public.event_likes;
create policy "curtida de evento: descurte por si" on public.event_likes
  for delete using (uid = (select auth.uid()));

/** O total por evento, para quem está sem conta também. */
create or replace function public.event_like_counts(p_event_ids text[])
returns table (event_id text, total bigint)
language sql stable
security definer
set search_path = ''
as $func$
  select e.id, (select count(*) from public.event_likes l where l.event_id = e.id)
  from unnest(coalesce(p_event_ids, '{}')) as e(id);
$func$;
grant execute on function public.event_like_counts(text[]) to anon, authenticated;

/** A data é do servidor: curtida não é carimbada pelo navegador. */
create or replace function public.event_likes_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  new.created_at := now();
  return new;
end;
$func$;
drop trigger if exists event_likes_stamp on public.event_likes;
create trigger event_likes_stamp before insert on public.event_likes
  for each row execute function public.event_likes_stamp();

/** Aviso para quem organiza, uma vez por pessoa (dedupe). */
create or replace function public.event_likes_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_event public.events;
begin
  select * into v_event from public.events where id = new.event_id;
  if v_event.id is null then
    return new;
  end if;
  perform public.notify(v_event.created_by, new.uid, 'like', jsonb_build_object(
    'eventId', new.event_id,
    'goalTitle', left(coalesce(v_event.data ->> 'title', ''), 120),
    'targetPath', '/events/' || new.event_id
  ), true);
  return new;
end;
$func$;
drop trigger if exists event_likes_notify on public.event_likes;
create trigger event_likes_notify after insert on public.event_likes
  for each row execute function public.event_likes_notify();

-- ---------------------------------------------------------------------------
-- 2. Comentário
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists comments jsonb not null default '[]'::jsonb,
  add column if not exists comment_count integer not null default 0;

-- O guarda de `events` devolve id e created_at do registro antigo a cada
-- update, e a política de update é só do criador. Por isso comentário não é
-- update do cliente: ele passa pelas funções abaixo, que rodam como dono do
-- banco — é lá que mora a regra de quem pode escrever e quem pode apagar.

create or replace function public.add_event_comment(p_event_id text, p_comment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_profile record;
  v_comment jsonb;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  -- Quem bloqueou quem organiza (ou foi bloqueado) não comenta no evento
  -- dele: comentário é conversa.
  if public.is_blocked_between(v_uid, v_event.created_by) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if btrim(coalesce(p_comment ->> 'text', '')) = '' then
    raise exception 'empty-comment' using errcode = '22023';
  end if;
  -- Teto por evento: a lista mora no próprio registro, e registro jsonb tem
  -- limite de tamanho. 300 é o mesmo teto do post e do carro.
  if jsonb_array_length(v_event.comments) >= 300 then
    raise exception 'too-many-comments' using errcode = '22023';
  end if;

  -- Nome e retrato saem do perfil público, não do cliente (mesma regra que a
  -- lista de presença passou a seguir em 20261025163000).
  select author, username, data into v_profile
    from public.public_profiles where user_id = v_uid;

  v_comment := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'userId', v_uid::text,
    'author', coalesce(nullif(left(v_profile.author, 80), ''), 'Engine'),
    'username', coalesce(left(v_profile.username, 32), ''),
    'avatar', coalesce(v_profile.data ->> 'avatar', ''),
    'text', left(btrim(p_comment ->> 'text'), 300),
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  update public.events
    set comments = comments || jsonb_build_array(v_comment),
        comment_count = comment_count + 1
    where id = p_event_id;

  if v_event.created_by <> v_uid then
    perform public.notify(v_event.created_by, v_uid, 'comment', jsonb_build_object(
      'eventId', p_event_id,
      'postTitle', left(coalesce(v_event.data ->> 'title', ''), 120),
      'targetPath', '/events/' || p_event_id
    ));
  end if;

  return v_comment;
end;
$func$;

revoke execute on function public.add_event_comment(text, jsonb) from public, anon;
grant execute on function public.add_event_comment(text, jsonb) to authenticated;

/** Apaga o próprio comentário; quem organiza e a moderação apagam qualquer um. */
create or replace function public.delete_event_comment(p_event_id text, p_comment_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_rest jsonb;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(c order by ord), '[]'::jsonb) into v_rest
  from jsonb_array_elements(v_event.comments) with ordinality as t(c, ord)
  where not (
    c ->> 'id' = p_comment_id
    and (
      c ->> 'userId' = v_uid::text
      or v_event.created_by = v_uid
      or public.is_service_admin()
    )
  );

  if jsonb_array_length(v_rest) = jsonb_array_length(v_event.comments) then
    raise exception 'not-allowed' using errcode = '42501';
  end if;

  update public.events
    set comments = v_rest,
        comment_count = jsonb_array_length(v_rest)
    where id = p_event_id;
end;
$func$;

revoke execute on function public.delete_event_comment(text, text) from public, anon;
grant execute on function public.delete_event_comment(text, text) to authenticated;
