-- O e-mail da moderação estava escrito dentro de public.is_service_admin(), e
-- o repositório é público. Ter o e-mail não dava acesso a nada (ainda é
-- preciso entrar na conta Google dele), mas é um alvo a menos para phishing.
--
-- A lista passa a morar numa tabela do banco, que a API não serve para
-- ninguém. Quem lê é só a função abaixo, que é security definer, e o service
-- role (painel do Supabase).
--
-- Para dar moderação a alguém, pelo SQL editor do Supabase:
--   insert into public.service_admins (email, note) values ('x@y.com', 'quem é');
-- Para tirar:
--   delete from public.service_admins where email = 'x@y.com';
--
-- É por e-mail, e não por id de usuário, de propósito: se a conta for
-- recriada um dia, a moderação volta sozinha em vez de ficar trancada.

create table if not exists public.service_admins (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

alter table public.service_admins enable row level security;
-- Nenhuma policy: pela API ninguém lê nem escreve, nem o próprio admin. Assim
-- não dá para descobrir quem modera o Engine.

-- Mesma assinatura e mesmo contrato de antes (57 policies dependem dela), só
-- muda de onde sai a lista. Precisa de security definer para enxergar a tabela
-- acima apesar da RLS.
create or replace function public.is_service_admin()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.service_admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
