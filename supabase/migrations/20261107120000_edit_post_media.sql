-- Editar a publicação inteira, não só a legenda (07/11/2026)
--
-- Trocar uma foto, somar mais uma ou tirar o vídeo exigia apagar o post e
-- publicar de novo — e aí iam junto as curtidas, os comentários e a data.
-- A política de UPDATE do dono já permitia a escrita (`posts: dono edita`,
-- 20261016230000); o que faltava era o app oferecer, e este carimbo.
--
-- `edited_at` só era marcado quando a LEGENDA mudava. Um post que troca de
-- foto e mantém o texto dizia outra coisa sem se declarar editado, que é
-- exatamente o caso em que o selo importa. Agora a mídia conta também.
--
-- Só isto muda na função; o resto é o original de 20261102150000, copiado
-- inteiro porque `create or replace` substitui o corpo todo.

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
  v_media_changed boolean;
begin
  v_note_changed := tg_op = 'INSERT' or (new.data ->> 'note') is distinct from (old.data ->> 'note');
  -- Trocar a foto, somar outra ou tirar o vídeo é edição tanto quanto
  -- reescrever a legenda — e é a mudança que mais muda o que o post diz.
  v_media_changed := tg_op <> 'INSERT' and (
       (new.data -> 'images') is distinct from (old.data -> 'images')
    or (new.data -> 'video') is distinct from (old.data -> 'video')
    or (new.data ->> 'videoUrl') is distinct from (old.data ->> 'videoUrl'));

  -- "Editado" quando o CONTEÚDO muda, e a data é a do banco.
  if tg_op = 'INSERT' then
    new.edited_at := null;
  elsif v_note_changed or v_media_changed then
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
