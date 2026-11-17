-- O número da Carteira de Garagem passa a ser a ORDEM DE ENTRADA.
--
-- Até aqui ele era um hash do id da conta: estável e anônimo, mas sem
-- significado nenhum — "EG-4821" não conta nada sobre quem você é. Ordem de
-- entrada conta: quem é o nº 1 foi o primeiro, e isso não se compra depois.
-- É a diferença entre um número de série e uma data de fundação.
--
-- Três coisas que o desenho precisa garantir:
--
--   1. O número é ATRIBUÍDO UMA VEZ e nunca muda. Se fosse calculado na hora
--      ("quantas contas nasceram antes de mim"), apagar uma conta antiga
--      renumeraria todo mundo depois dela — e alguém que imprimiu a carteira
--      com o nº 7 passaria a ser o 6.
--   2. Por isso ele também NÃO é reaproveitado: conta apagada leva o número
--      embora. Uma sequência garante isso de graça.
--   3. O retroativo segue a ordem real de criação das contas que já existem,
--      lida de auth.users — não a ordem em que as linhas foram escritas aqui.
--
-- O que ele revela: o número é público (vai impresso num cartão que a pessoa
-- compartilha), então ele também diz mais ou menos quantas contas o Engine
-- tem. Nos primeiros meses isso é um número pequeno. É uma troca consciente:
-- para quem chega cedo, ser o nº 3 é o próprio prêmio, e daqui a alguns
-- milhares de contas o número para de revelar qualquer coisa.

create sequence if not exists public.member_number_seq as integer start with 1;

create table if not exists public.member_numbers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  number integer not null unique,
  created_at timestamptz not null default now()
);

alter table public.member_numbers enable row level security;

-- Leitura pública: o número é impresso na carteira, que é feita para ser
-- mostrada. Escrita não tem política nenhuma — só a função abaixo grava, e
-- ela é security definer. Assim ninguém escolhe o próprio número.
drop policy if exists "membro: numero publico" on public.member_numbers;
create policy "membro: numero publico" on public.member_numbers for select using (true);

-- Retroativo, na ordem real de criação das contas.
insert into public.member_numbers (user_id, number, created_at)
select u.id, nextval('public.member_number_seq'), u.created_at
from (select id, created_at from auth.users order by created_at asc) u
on conflict (user_id) do nothing;

/*
 * Pega o número de quem está pedindo, criando na primeira vez.
 *
 * Idempotente: chamar dez vezes devolve o mesmo número e consome uma posição
 * só da sequência. O `on conflict do nothing` seguido do select resolve
 * também a corrida de dois aparelhos da mesma pessoa abrindo o app junto.
 */
create or replace function public.my_member_number()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_number integer;
begin
  if v_user is null then
    return null;
  end if;

  select number into v_number from public.member_numbers where user_id = v_user;
  if v_number is not null then
    return v_number;
  end if;

  insert into public.member_numbers (user_id, number)
  values (v_user, nextval('public.member_number_seq'))
  on conflict (user_id) do nothing;

  select number into v_number from public.member_numbers where user_id = v_user;
  return v_number;
end;
$$;

grant execute on function public.my_member_number() to authenticated;

-- Conta nova já nasce com número, sem depender de ninguém abrir a carteira.
create or replace function public.assign_member_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_numbers (user_id, number)
  values (new.user_id, nextval('public.member_number_seq'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists public_profiles_member_number on public.public_profiles;
create trigger public_profiles_member_number
  after insert on public.public_profiles
  for each row execute function public.assign_member_number();
