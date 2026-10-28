-- Bloqueio que vale no SERVIDOR (auditoria social de 25/10/2026, achado 0.3).
--
-- Até aqui a lista de bloqueados morava em `user_private` (doc 'moderation'),
-- que só o dono lê — então só a tela da Comunidade sabia dela, e só para
-- esconder posts. O bloqueado continuava mandando DM, abrindo conversa,
-- comentando, curtindo, avaliando, seguindo e gerando aviso no sino de quem
-- bloqueou.
--
-- Agora a lista é a tabela `blocks`, que as funções do banco conseguem ler.
-- Quem bloqueou lê e mexe na própria lista; o bloqueado NÃO lê nada (não dá
-- para descobrir quem te bloqueou consultando a tabela).
--
-- Bloqueio vale nos dois sentidos para interação direta: nem o bloqueado fala
-- com quem bloqueou, nem quem bloqueou fala com o bloqueado (senão bastava
-- bloquear para mandar mensagem sem poder receber resposta). Bloquear também
-- desfaz o "seguir" dos dois lados, como nas redes de referência.
--
-- As verificações entram em: curtir (post_likes_stamp), seguir (trigger novo),
-- e nas funções add_comment, rate_goal, start_conversation e send_message,
-- redefinidas em 20261025161000_server_notifications.sql (que também
-- reescreve o sino — as duas mudanças mexem nas mesmas funções).

create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);
alter table public.blocks enable row level security;
create policy "bloqueios: dono le" on public.blocks
  for select using (blocker_id = (select auth.uid()));
create policy "bloqueios: dono bloqueia" on public.blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "bloqueios: dono desbloqueia" on public.blocks
  for delete using (blocker_id = (select auth.uid()));

-- Algum dos dois bloqueou o outro? Só para uso interno das funções e
-- triggers: exposta ao cliente, ela responderia "fulano me bloqueou?".
create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;

-- Bloquear desfaz o seguir dos dois lados. A data é do banco.
create or replace function public.blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and target_id = new.blocked_id)
     or (follower_id = new.blocked_id and target_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_after_insert after insert on public.blocks
  for each row execute function public.blocks_after_insert();

create or replace function public.blocks_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;
create trigger blocks_stamp before insert on public.blocks
  for each row execute function public.blocks_stamp();

-- Lista antiga (user_private 'moderation' -> blockedUserIds) vira linha.
-- Id que não é uuid ou que não é mais conta é ignorado. O doc antigo fica
-- onde está: o cliente novo não lê mais dele, e apagar é irreversível.
insert into public.blocks (blocker_id, blocked_id)
select p.user_id, ids.value::uuid
from public.user_private p
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(p.data -> 'blockedUserIds') = 'array' then p.data -> 'blockedUserIds' else '[]'::jsonb end
) as ids(value)
where p.doc_id = 'moderation'
  and ids.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and ids.value::uuid <> p.user_id
  and exists (select 1 from auth.users u where u.id = ids.value::uuid)
on conflict do nothing;

-- Curtir: o dono do post bloqueou quem curte (ou o contrário) → recusado.
create or replace function public.post_likes_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.post_owner_id := (select owner_id from public.community_goals where id = new.post_id);
  if public.is_blocked_between(new.liker_id, new.post_owner_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end;
$$;

-- Seguir: recusado entre quem tem bloqueio.
create or replace function public.follows_block_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_blocked_between(new.follower_id, new.target_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end;
$$;
create trigger follows_block_guard before insert on public.follows
  for each row execute function public.follows_block_guard();
