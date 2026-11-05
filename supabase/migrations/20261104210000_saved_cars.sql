-- ---------------------------------------------------------------------------
-- Salvar carro (04/11/2026)
-- ---------------------------------------------------------------------------
--
-- Salvar só existia para publicação. Mas o que uma pessoa guarda no Engine
-- não é um post — é um CARRO: a build que ela quer copiar, o escape que quer
-- perguntar onde comprou, a suspensão que quer saber quanto custou. A aba
-- Carros é uma grade de carros de desconhecido, e até aqui a única forma de
-- não perder um era decorar o nome ou curtir (que é outra coisa: curtir é
-- para o dono, salvar é para mim).
--
-- Tabela espelhada em `saved_posts`, de propósito, para herdar as mesmas
-- três garantias em vez de inventar outras:
--
-- 1. Lista privada: só quem salvou lê. Ninguém vê o que você guardou.
-- 2. Chave estrangeira com cascata: carro despublicado sai da lista sozinho,
--    sem linha órfã apontando para nada.
-- 3. Salvar exige ENXERGAR o carro — a subconsulta roda sob a RLS de quem
--    salva — e não haver bloqueio entre as duas pessoas.
--
-- Uma tabela genérica (`saved_items` com `kind`) foi considerada e descartada:
-- alvo polimórfico não aceita chave estrangeira, e aí (2) e (3) viram código
-- de aplicação que alguém esquece de chamar.

create table if not exists public.saved_cars (
  user_id uuid not null references auth.users (id) on delete cascade,
  car_id text not null references public.car_showcase (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, car_id)
);
create index if not exists saved_cars_user on public.saved_cars (user_id, created_at desc);
create index if not exists saved_cars_car on public.saved_cars (car_id);
alter table public.saved_cars enable row level security;

create policy "carros salvos: so o dono le" on public.saved_cars
  for select to authenticated using (user_id = (select auth.uid()));

-- `is_blocked_between` não é executável pelo cliente; a política chama esta
-- casca, que só responde sobre quem está logado.
create or replace function public.car_blocked_for_me(p_car text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.car_showcase c
    where c.id = p_car and public.is_blocked_between(auth.uid(), c.user_id)
  );
$$;
revoke execute on function public.car_blocked_for_me(text) from public, anon;
grant execute on function public.car_blocked_for_me(text) to authenticated;

create policy "carros salvos: salva o que enxerga" on public.saved_cars
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.car_showcase c where c.id = car_id)
    and not public.car_blocked_for_me(car_id)
  );

create policy "carros salvos: dono tira" on public.saved_cars
  for delete to authenticated using (user_id = (select auth.uid()));

-- A data é do banco: é ela que ordena a lista "Salvos".
create or replace function public.saved_cars_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists saved_cars_stamp on public.saved_cars;
create trigger saved_cars_stamp before insert on public.saved_cars
  for each row execute function public.saved_cars_stamp();
