-- ---------------------------------------------------------------------------
-- Baixar meus dados (05/11/2026)
-- ---------------------------------------------------------------------------
--
-- O Engine já sabia apagar uma conta em cascata, mas não sabia DEVOLVER o que
-- ela tem. Toda rede de verdade tem isso em Configurações, e no Brasil não é
-- só cortesia: a LGPD (art. 18, V) dá à pessoa o direito à portabilidade dos
-- dados dela.
--
-- O que entra: tudo o que é meu ou sobre mim e que eu JÁ ENXERGO dentro do
-- app. Exportar é portabilidade do que já está à vista — não uma porta para
-- ver o que não se via. Por isso a conversa vem inteira (eu já leio as duas
-- pontas dela na tela de mensagens) e o perfil de terceiro não vem.
--
-- Publicação arquivada entra: é minha, e justamente por estar fora do ar é a
-- que mais faz falta num backup.
--
-- `security definer` porque a própria política de arquivo esconde o post
-- arquivado até do dono; o `where` é sempre `auth.uid()`, então não existe id
-- de outra pessoa para passar aqui.

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'geradoEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'versao', 1,
    'usuario', jsonb_build_object('id', v_uid::text),

    'perfil', (
      select to_jsonb(p) from public.public_profiles p where p.user_id = v_uid
    ),

    'configuracoes', coalesce((
      select jsonb_object_agg(up.doc_id, up.data)
      from public.user_private up where up.user_id = v_uid
    ), '{}'::jsonb),

    'garagem', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'dados', c.data, 'atualizadoEm', c.updated_at))
      from public.cars c where c.user_id = v_uid
    ), '[]'::jsonb),

    -- Inclui as arquivadas: são minhas, e fora do ar é quando o backup conta.
    'publicacoes', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.created_at)
      from public.community_goals g where g.owner_id = v_uid
    ), '[]'::jsonb),

    -- Meus comentários nos posts dos outros, com o endereço de onde estão.
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object('publicacao', g.id, 'comentario', c))
      from public.community_goals g
      cross join lateral jsonb_array_elements(g.comments) as c
      where c ->> 'userId' = v_uid::text
    ), '[]'::jsonb),

    'curtidas', coalesce((
      select jsonb_agg(jsonb_build_object('publicacao', l.post_id, 'em', l.created_at))
      from public.post_likes l where l.liker_id = v_uid
    ), '[]'::jsonb),

    'seguindo', coalesce((
      select jsonb_agg(f.target_id) from public.follows f where f.follower_id = v_uid
    ), '[]'::jsonb),
    'seguidores', coalesce((
      select jsonb_agg(f.follower_id) from public.follows f where f.target_id = v_uid
    ), '[]'::jsonb),

    'salvos', jsonb_build_object(
      'publicacoes', coalesce((
        select jsonb_agg(s.post_id) from public.saved_posts s where s.user_id = v_uid
      ), '[]'::jsonb),
      'carros', coalesce((
        select jsonb_agg(s.car_id) from public.saved_cars s where s.user_id = v_uid
      ), '[]'::jsonb)
    ),

    'silenciados', coalesce((
      select jsonb_agg(m.muted_id) from public.mutes m where m.muter_id = v_uid
    ), '[]'::jsonb),
    'bloqueados', coalesce((
      select jsonb_agg(b.blocked_id) from public.blocks b where b.blocker_id = v_uid
    ), '[]'::jsonb),

    'conquistas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.achievement_id, 'em', a.created_at))
      from public.achievements a where a.user_id = v_uid
    ), '[]'::jsonb),

    -- A conversa inteira: as duas pontas já aparecem na tela de mensagens, e
    -- exportar não é dar acesso novo, é levar embora o que já se vê.
    'conversas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', conv.id,
        'participantes', conv.member_ids,
        'criadaEm', conv.created_at,
        'mensagens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'de', m.sender_id, 'texto', m.text, 'tipo', m.type, 'em', m.created_at
          ) order by m.created_at)
          from public.messages m where m.conversation_id = conv.id
        ), '[]'::jsonb)
      ))
      from public.conversations conv where v_uid = any (conv.member_ids)
    ), '[]'::jsonb),

    'eventos', coalesce((
      select jsonb_agg(to_jsonb(e)) from public.events e where e.created_by = v_uid
    ), '[]'::jsonb),

    'anuncios', coalesce((
      select jsonb_agg(to_jsonb(sl)) from public.service_listings sl where sl.owner_id = v_uid
    ), '[]'::jsonb),

    'avaliacoesQueEscrevi', coalesce((
      select jsonb_agg(to_jsonb(r)) from public.service_reviews r where r.author_id = v_uid
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
