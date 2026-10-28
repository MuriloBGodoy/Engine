-- Suspensão de conta pela moderação (ECA Digital / conta de menor de idade,
-- e os demais motivos da denúncia).
--
-- Uma linha por suspensão, com histórico: suspender grava, levantar carimba
-- `lifted_at`. Vale a que está sem `lifted_at` (no máximo uma por conta). Só a
-- moderação escreve, e só pelas funções `moderation_suspend` e
-- `moderation_lift_suspension` — não há política de escrita na tabela.
--
-- O que a suspensão faz:
--
--   1. A conta não cria nada: post, comentário, curtida, avaliação de post,
--      seguir, conversa, mensagem, evento, presença em evento, clube, entrada
--      ou pedido de clube, anúncio, avaliação de serviço, perfil, foto. A
--      checagem é um trigger por tabela (`suspension_guard`), e não uma linha
--      em cada função, para pegar também as funções `security definer`
--      (add_comment, send_message, create_club...) e as que vierem depois.
--      Remover continua liberado: apagar o próprio post, desfazer curtida,
--      sair de clube, excluir a conta.
--
--   2. Ninguém interage com ela: seguir, curtir, comentar, avaliar, mandar
--      mensagem, confirmar presença em evento dela ou aprovar pedido dela
--      devolve "não encontrado" — o mesmo que o app mostra para o perfil, que
--      some. Conta de menor de idade não pode continuar recebendo DM.
--
--   3. Some para os outros: perfil público, posts, anúncios, eventos criados,
--      avaliações de serviço, linhas de seguidores, de membros de clube e de
--      presença. São políticas RESTRITIVAS de leitura (somam um AND às que já
--      existem), então nada das políticas antigas precisou ser reescrito. A
--      própria pessoa e a moderação continuam vendo — é o que deixa o
--      "baixar meus dados" funcionar e a moderação revisar o caso.
--
-- Limite conhecido: comentário que ela fez no post de outra pessoa mora no
-- jsonb `comments` do post alheio, que RLS não filtra por elemento. Ele fica
-- visível até a moderação remover (moderation_remove) ou a conta ser
-- excluída.
--
-- Motivos: os mesmos códigos da denúncia (minor, spam, scam, offensive,
-- harassment, nudity, other).

create table public.account_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('minor', 'spam', 'scam', 'offensive', 'harassment', 'nudity', 'other')),
  -- Anotação interna da moderação. A pessoa suspensa NÃO lê (my_suspension
  -- devolve só o motivo e a data).
  note text not null default '' check (char_length(note) <= 500),
  report_id uuid references public.reports (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references auth.users (id) on delete set null,
  lift_note text not null default '' check (char_length(lift_note) <= 500)
);
create unique index account_suspensions_active on public.account_suspensions (user_id) where lifted_at is null;
create index account_suspensions_user on public.account_suspensions (user_id, created_at desc);
alter table public.account_suspensions enable row level security;
revoke all on public.account_suspensions from anon, authenticated;
grant select on public.account_suspensions to authenticated;
create policy "suspensoes: moderacao le" on public.account_suspensions
  for select to authenticated using (public.is_service_admin());

-- ---------------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------------

-- Uso interno (triggers e funções): exposta, ela responderia "fulano está
-- suspenso?" para qualquer um.
create or replace function public.is_account_suspended(p_user uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select p_user is not null and exists (
    select 1 from public.account_suspensions
    where user_id = p_user and lifted_at is null
  );
$$;
revoke execute on function public.is_account_suspended(uuid) from public, anon, authenticated;

-- O que as políticas de leitura perguntam: "o dono desta linha aparece para
-- quem está lendo?". Precisa ser executável por anon/authenticated (política
-- roda como quem lê). Vaza o mesmo que o perfil sumido já mostra.
create or replace function public.account_visible(p_user uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select p_user is null
    or p_user = auth.uid()
    or public.is_service_admin()
    or not public.is_account_suspended(p_user);
$$;
grant execute on function public.account_visible(uuid) to anon, authenticated;

-- "Eu estou suspenso?" — só sobre a própria conta.
create or replace function public.i_am_suspended()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select public.is_account_suspended(auth.uid());
$$;
revoke execute on function public.i_am_suspended() from public, anon;
grant execute on function public.i_am_suspended() to authenticated;

-- A tela de conta suspensa: motivo e desde quando. Sem anotação interna.
create or replace function public.my_suspension()
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('reason', s.reason, 'since', s.created_at)
  from public.account_suspensions s
  where s.user_id = auth.uid() and s.lifted_at is null
  limit 1;
$$;
revoke execute on function public.my_suspension() from public, anon;
grant execute on function public.my_suspension() to authenticated;

-- ---------------------------------------------------------------------------
-- Moderação: suspender, levantar, listar
-- ---------------------------------------------------------------------------

create or replace function public.moderation_suspend(
  p_user uuid,
  p_reason text,
  p_note text default '',
  p_report_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
begin
  if not public.is_service_admin() then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  if p_user is null or p_user = v_admin then
    raise exception 'invalid-target' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if public.is_account_suspended(p_user) then
    raise exception 'already-suspended' using errcode = 'P0001';
  end if;

  insert into public.account_suspensions (user_id, reason, note, report_id, created_by)
  values (
    p_user,
    coalesce(nullif(p_reason, ''), 'other'),
    left(btrim(coalesce(p_note, '')), 500),
    case when exists (select 1 from public.reports where id = p_report_id) then p_report_id end,
    v_admin
  )
  returning id into v_id;

  -- O conteúdo dela saiu do ar junto com a conta: as denúncias abertas
  -- contra ela estão resolvidas.
  update public.reports set status = 'resolved'
    where reported_user_id = p_user::text and status = 'pending';
  return v_id;
end;
$$;
revoke execute on function public.moderation_suspend(uuid, text, text, uuid) from public, anon;
grant execute on function public.moderation_suspend(uuid, text, text, uuid) to authenticated;

create or replace function public.moderation_lift_suspension(p_user uuid, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_service_admin() then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  update public.account_suspensions set
    lifted_at = now(),
    lifted_by = auth.uid(),
    lift_note = left(btrim(coalesce(p_note, '')), 500)
  where user_id = p_user and lifted_at is null;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.moderation_lift_suspension(uuid, text) from public, anon;
grant execute on function public.moderation_lift_suspension(uuid, text) to authenticated;

-- Suspensões em vigor, com o cartão público da conta (que os outros já não
-- leem) para a moderação saber quem é.
create or replace function public.moderation_list_suspensions()
returns table (
  user_id uuid,
  username text,
  author text,
  avatar text,
  reason text,
  note text,
  created_at timestamptz
)
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if not public.is_service_admin() then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  return query
    select s.user_id, coalesce(p.username, ''), coalesce(p.author, ''),
           coalesce(p.data ->> 'avatar', ''), s.reason, s.note, s.created_at
    from public.account_suspensions s
    left join public.public_profiles p on p.user_id = s.user_id
    where s.lifted_at is null
    order by s.created_at desc;
end;
$$;
revoke execute on function public.moderation_list_suspensions() from public, anon;
grant execute on function public.moderation_list_suspensions() to authenticated;

-- ---------------------------------------------------------------------------
-- 1 e 2. Escrita: a conta suspensa não cria, e ninguém interage com ela
-- ---------------------------------------------------------------------------

create or replace function public.suspension_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
begin
  -- Sem sessão (service role, webhook, migration) e moderação: livre.
  -- Escrita disparada por OUTRO trigger (contador de curtidas, de membros,
  -- média das avaliações) também: a checagem é na porta, não no efeito
  -- colateral — senão desfazer uma curtida travaria no contador do post.
  if v_uid is null or public.is_service_admin() or pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name = 'community_goals' then
      -- Só tirando: comentário apagado, avaliação retirada (delete_comment,
      -- excluir a conta). Remover é sempre liberado.
      if new.data is not distinct from old.data
         and new.club_id = old.club_id
         and new.kind = old.kind
         and new.comments <@ old.comments
         and new.ratings_by <@ old.ratings_by then
        return new;
      end if;
      v_target := old.owner_id;
    elsif tg_table_name = 'service_listings' then
      -- Contador de visita/WhatsApp (track_listing_metric) roda como quem
      -- visita; só a edição do dono interessa aqui.
      if v_uid is distinct from old.owner_id then
        return new;
      end if;
    elsif tg_table_name = 'clubs' then
      -- Excluir a conta arquiva o clube fundado (escrita de confiança).
      if public.is_trusted_write() then
        return new;
      end if;
    end if;
  end if;

  if public.is_account_suspended(v_uid) then
    raise exception 'account-suspended' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if tg_table_name = 'post_likes' then
      v_target := (select owner_id from public.community_goals where id = new.post_id);
    elsif tg_table_name = 'follows' then
      v_target := new.target_id;
    elsif tg_table_name = 'conversations' then
      v_target := (select m from unnest(new.member_ids) m where m <> v_uid limit 1);
    elsif tg_table_name = 'messages' then
      v_target := (
        select m from public.conversations c, unnest(c.member_ids) m
        where c.id = new.conversation_id and m <> v_uid limit 1
      );
    elsif tg_table_name = 'event_participants' then
      v_target := (select created_by from public.events where id = new.event_id);
    elsif tg_table_name = 'club_members' then
      v_target := new.uid;
    elsif tg_table_name = 'service_reviews' then
      v_target := (select owner_id from public.service_listings where id = new.listing_id);
    end if;
  end if;

  if v_target is not null and v_target <> v_uid and public.is_account_suspended(v_target) then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
revoke execute on function public.suspension_guard() from public, anon, authenticated;

create trigger suspension_guard before insert or update on public.community_goals
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert on public.post_likes
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert on public.follows
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert on public.conversations
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert on public.messages
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert or update on public.events
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert on public.event_participants
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert or update on public.clubs
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert on public.club_members
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert on public.club_requests
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert or update on public.service_listings
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert or update on public.service_reviews
  for each row execute function public.suspension_guard();
create trigger suspension_guard before insert or update on public.public_profiles
  for each row execute function public.suspension_guard();

-- Foto: a pasta é da pessoa, mas conta suspensa não sobe nada.
create policy "fotos: conta suspensa nao sobe" on storage.objects
  as restrictive
  for insert to authenticated
  with check (not public.i_am_suspended());

-- ---------------------------------------------------------------------------
-- 3. Leitura: a conta suspensa some para os outros
-- ---------------------------------------------------------------------------

create policy "suspensao: perfil some" on public.public_profiles
  as restrictive for select using (public.account_visible(user_id));
create policy "suspensao: posts somem" on public.community_goals
  as restrictive for select using (public.account_visible(owner_id));
create policy "suspensao: anuncios somem" on public.service_listings
  as restrictive for select using (public.account_visible(owner_id));
create policy "suspensao: eventos somem" on public.events
  as restrictive for select using (public.account_visible(created_by));
create policy "suspensao: avaliacoes somem" on public.service_reviews
  as restrictive for select using (public.account_visible(author_id));
create policy "suspensao: seguidores somem" on public.follows
  as restrictive for select using (public.account_visible(follower_id) and public.account_visible(target_id));
create policy "suspensao: membros somem" on public.club_members
  as restrictive for select using (public.account_visible(uid));
create policy "suspensao: presencas somem" on public.event_participants
  as restrictive for select using (public.account_visible(uid));
