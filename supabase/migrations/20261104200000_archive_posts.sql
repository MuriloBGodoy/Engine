-- ---------------------------------------------------------------------------
-- Arquivar publicação (04/11/2026)
-- ---------------------------------------------------------------------------
--
-- Até aqui, tirar um post do ar só tinha um caminho: apagar. E apagar leva
-- junto as curtidas, os comentários e a conversa inteira que aconteceu ali —
-- some para todo mundo, para sempre. Quem só queria a publicação fora da
-- vista pagava esse preço, ou não tirava.
--
-- Arquivar é o meio-termo que toda rede tem: o post sai do ar, inteiro, e
-- volta igual quando o dono quiser.
--
-- A decisão de desenho aqui é QUEM esconde. Dava para deixar a política
-- liberar o post arquivado para o dono e pedir a cada consulta que filtrasse
-- — e aí bastava um `select` esquecido no feed, no mural do clube, na busca
-- ou na aba de salvos para o post arquivado reaparecer justamente para quem
-- o arquivou. Em vez disso o banco esconde de TODO MUNDO, inclusive do dono,
-- e o arquivo é lido por uma função só (`my_archived_posts`). Uma porta, não
-- uma dúzia de filtros que precisam todos estar certos.
--
-- Consequência aceita: o link direto (/post/:id) de um post arquivado não
-- abre nem para o dono. É o que o Instagram faz — arquivado não tem endereço
-- público.

alter table public.community_goals
  add column if not exists archived_at timestamptz;

-- Só o arquivo de uma pessoa; o índice parcial não pesa no feed.
create index if not exists community_goals_archived
  on public.community_goals (owner_id, archived_at desc)
  where archived_at is not null;

-- Restritiva: soma-se às outras (pública, suspensão) em vez de substituir.
drop policy if exists "arquivo: some do ar" on public.community_goals;
create policy "arquivo: some do ar" on public.community_goals
  as restrictive for select using (archived_at is null);

-- ---------------------------------------------------------------------------
-- Arquivar e restaurar
-- ---------------------------------------------------------------------------
--
-- `security definer` por dois motivos: o dono deixa de enxergar o próprio
-- post arquivado (a política acima), então um `update` comum não acharia a
-- linha para restaurar; e `trust_this_transaction` evita que o gatilho
-- `community_goals_guard` carimbe `updated_at = now()`. Sem isso, restaurar
-- jogaria um post de três meses atrás para o topo do feed de todo mundo.

create or replace function public.set_post_archived(p_post_id text, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;

  select owner_id into v_owner from public.community_goals where id = p_post_id;
  if v_owner is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  if v_owner <> v_uid then
    raise exception 'not-owner' using errcode = '42501';
  end if;

  perform public.trust_this_transaction();
  update public.community_goals
    set archived_at = case when p_archived then now() else null end
    where id = p_post_id;
end;
$$;

revoke execute on function public.set_post_archived(text, boolean) from public, anon;
grant execute on function public.set_post_archived(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- O arquivo de quem está logado
-- ---------------------------------------------------------------------------
--
-- Devolve a linha inteira, do arquivado mais recente para o mais antigo, para
-- a tela montar o mesmo cartão do feed. Só as próprias: o `where` é por
-- `auth.uid()`, não por parâmetro, então não há id de outra pessoa para
-- passar aqui.

create or replace function public.my_archived_posts(p_limit integer default 60)
returns setof public.community_goals
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from public.community_goals
  where owner_id = auth.uid()
    and archived_at is not null
  order by archived_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

revoke execute on function public.my_archived_posts(integer) from public, anon;
grant execute on function public.my_archived_posts(integer) to authenticated;
