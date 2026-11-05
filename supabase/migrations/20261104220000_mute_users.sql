-- ---------------------------------------------------------------------------
-- Silenciar alguém (04/11/2026)
-- ---------------------------------------------------------------------------
--
-- Entre seguir e bloquear não havia nada. Quem cansou do feed de alguém —
-- o primo que posta dez vezes por dia, o perfil que virou outra coisa — só
-- tinha duas saídas, e as duas são sociais: deixar de seguir (a pessoa vê) ou
-- bloquear (que é uma ruptura, e some com tudo nos dois sentidos).
--
-- Silenciar é a terceira, e é o que as redes todas têm: o feed para de
-- trazer aquela pessoa e MAIS NADA muda. Continuo seguindo, continuo podendo
-- abrir o perfil dela, ela continua me vendo, e ela não é avisada.
--
-- É preferência, não segurança — e por isso NÃO é uma política de RLS como o
-- bloqueio. Bloqueio o banco precisa garantir, porque alguém depende dele
-- para não ser alcançado; silêncio é arrumação da minha própria tela, e quem
-- aplica é o feed. Confundir os dois acaba em "silenciei e ela não recebe
-- mais minha mensagem", que não é o que ninguém pediu.
--
-- A lista é privada: ninguém descobre que foi silenciado.

create table if not exists public.mutes (
  muter_id uuid not null references auth.users (id) on delete cascade,
  muted_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  constraint mutes_nao_eu check (muter_id <> muted_id)
);
create index if not exists mutes_muter on public.mutes (muter_id, created_at desc);
alter table public.mutes enable row level security;

create policy "silenciados: so o dono le" on public.mutes
  for select to authenticated using (muter_id = (select auth.uid()));
create policy "silenciados: so o dono poe" on public.mutes
  for insert to authenticated with check (muter_id = (select auth.uid()));
create policy "silenciados: so o dono tira" on public.mutes
  for delete to authenticated using (muter_id = (select auth.uid()));

-- A data é do banco: é ela que ordena a lista em Configurações.
create or replace function public.mutes_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists mutes_stamp on public.mutes;
create trigger mutes_stamp before insert on public.mutes
  for each row execute function public.mutes_stamp();
