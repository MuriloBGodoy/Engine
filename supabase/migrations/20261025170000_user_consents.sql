-- Primeiro uso: 18+ e aceite dos Termos/Privacidade, gravados pelo servidor.
--
-- Até aqui o aceite só existia como checkbox no cadastro por e-mail, e quem
-- entrava pelo Google criava a conta sem passar por ele. Agora a tela de
-- primeiro uso (comum aos dois caminhos) chama `accept_terms`, e a data sai do
-- relógio do banco, não do aparelho: é a prova de quando a pessoa aceitou.
--
-- `terms_version` existe para a política poder mudar: quando o app sobe a
-- versão, quem aceitou a anterior vê a tela de novo antes de seguir. É o
-- "pedimos o aceite de novo" que a Privacidade promete.
--
-- Só o dono lê a própria linha. Ninguém escreve direto na tabela: a única
-- porta é a função, que não aceita data vinda do cliente.

create table public.user_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  adult_confirmed_at timestamptz not null,
  terms_accepted_at timestamptz not null,
  terms_version text not null check (char_length(terms_version) between 1 and 32),
  updated_at timestamptz not null default now()
);

alter table public.user_consents enable row level security;

revoke all on public.user_consents from anon, authenticated;
grant select on public.user_consents to authenticated;

create policy "consentimento: so o dono le" on public.user_consents
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Sem política de insert/update/delete: a escrita passa só por accept_terms.
-- A linha some junto com a conta (on delete cascade em auth.users).

create or replace function public.accept_terms(p_terms_version text)
returns public.user_consents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_consents;
begin
  if v_uid is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if p_terms_version is null or char_length(btrim(p_terms_version)) not between 1 and 32 then
    raise exception 'invalid-terms-version' using errcode = '22023';
  end if;

  insert into public.user_consents as c (user_id, adult_confirmed_at, terms_accepted_at, terms_version, updated_at)
  values (v_uid, now(), now(), btrim(p_terms_version), now())
  on conflict (user_id) do update set
    -- A idade foi confirmada uma vez; reaceitar uma versão nova dos termos
    -- não reescreve quando isso aconteceu.
    adult_confirmed_at = c.adult_confirmed_at,
    terms_accepted_at = now(),
    terms_version = excluded.terms_version,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
