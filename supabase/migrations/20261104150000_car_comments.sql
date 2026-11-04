-- Comentário na página do carro.
--
-- Mesma forma dos comentários de post (`community_goals.comments`): lista
-- jsonb no próprio registro, escrita só por função. Tabela separada daria
-- política, índice e moderação novos para resolver o mesmo problema que o
-- feed já resolve desse jeito.
--
-- O autor é carimbado pelo servidor a partir de `auth.uid()`; o que vem do
-- navegador é só o texto e o cartão de exibição, como no post.

alter table public.car_showcase
  add column if not exists comments jsonb not null default '[]'::jsonb,
  add column if not exists comment_count integer not null default 0;

create or replace function public.add_car_comment(p_car_id text, p_comment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_car public.car_showcase;
  v_comment jsonb;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select * into v_car from public.car_showcase where id = p_car_id;
  if v_car.id is null or v_car.hidden or not public.account_visible(v_car.user_id) then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  -- Quem bloqueou o dono (ou foi bloqueado por ele) não comenta na página
  -- dele: comentário é conversa.
  if public.is_blocked_between(v_uid, v_car.user_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if btrim(coalesce(p_comment ->> 'text', '')) = '' then
    raise exception 'empty-comment' using errcode = '22023';
  end if;
  -- Teto por carro: a lista mora no próprio registro, e registro jsonb tem
  -- limite de tamanho. 300 é o mesmo teto do post.
  if jsonb_array_length(v_car.comments) >= 300 then
    raise exception 'too-many-comments' using errcode = '22023';
  end if;

  v_comment := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'userId', v_uid::text,
    'author', left(coalesce(p_comment ->> 'author', ''), 80),
    'username', left(coalesce(p_comment ->> 'username', ''), 32),
    'avatar', coalesce(p_comment ->> 'avatar', ''),
    'text', left(btrim(p_comment ->> 'text'), 300),
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  update public.car_showcase
    set comments = comments || jsonb_build_array(v_comment),
        comment_count = comment_count + 1,
        updated_at = now()
    where id = p_car_id;

  -- Aviso para o dono, menos quando ele comenta no próprio carro.
  if v_car.user_id <> v_uid then
    perform public.notify(v_car.user_id, v_uid, 'comment', jsonb_build_object(
      'targetPath', '/carro/' || v_car.slug,
      'postTitle', coalesce(v_car.data ->> 'title', '')
    ));
  end if;

  return v_comment;
end;
$$;

revoke execute on function public.add_car_comment(text, jsonb) from public, anon;
grant execute on function public.add_car_comment(text, jsonb) to authenticated;

/** Apaga o próprio comentário; o dono do carro e a moderação apagam qualquer um. */
create or replace function public.delete_car_comment(p_car_id text, p_comment_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_car public.car_showcase;
  v_rest jsonb;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  select * into v_car from public.car_showcase where id = p_car_id;
  if v_car.id is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(c order by ord), '[]'::jsonb) into v_rest
  from jsonb_array_elements(v_car.comments) with ordinality as t(c, ord)
  where not (
    c ->> 'id' = p_comment_id
    and (
      c ->> 'userId' = v_uid::text
      or v_car.user_id = v_uid
      or public.is_service_admin()
    )
  );

  if jsonb_array_length(v_rest) = jsonb_array_length(v_car.comments) then
    raise exception 'not-allowed' using errcode = '42501';
  end if;

  update public.car_showcase
    set comments = v_rest,
        comment_count = jsonb_array_length(v_rest),
        updated_at = now()
    where id = p_car_id;
end;
$$;

revoke execute on function public.delete_car_comment(text, text) from public, anon;
grant execute on function public.delete_car_comment(text, text) to authenticated;
