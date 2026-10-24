-- Pedidos de patrocínio que chegam pela tela /anuncie.
--
-- Quem anuncia ainda não tem conta, então o insert é aberto a visitante. O
-- resto é fechado: o público não lê de volta nem altera o que mandou; só a
-- moderação (is_service_admin) lê, para responder.
--
-- Os limites de tamanho estão no banco, e não só no formulário, porque o
-- formulário é a parte que qualquer um pode pular.

create table public.sponsor_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Quem estava logado ao enviar. Vem do token, nunca do corpo: a coluna não
  -- tem grant de insert para o público (ver abaixo).
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  company text not null check (char_length(btrim(company)) between 1 and 160),
  email text not null check (
    char_length(email) between 5 and 254
    and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  whatsapp text check (whatsapp is null or char_length(whatsapp) <= 30),
  city text not null check (char_length(btrim(city)) between 2 and 120),
  state text check (state is null or char_length(state) <= 60),
  format text not null check (format in ('city', 'event', 'featured', 'other')),
  message text not null default '' check (char_length(message) <= 2000),
  -- LGPD: sem o aceite explícito a linha não entra.
  consent boolean not null check (consent),
  locale text check (locale is null or char_length(locale) <= 10)
);

create index sponsor_leads_created on public.sponsor_leads (created_at desc);

alter table public.sponsor_leads enable row level security;

-- Privilégio por coluna: o público só escolhe o conteúdo do pedido. `id`,
-- `created_at` e `user_id` saem dos defaults. O revoke vem antes porque o
-- Supabase concede tudo em tabela nova do schema public por padrão, e um
-- grant de coluna não restringe um grant de tabela que já existe.
revoke all on public.sponsor_leads from anon, authenticated;
grant insert (name, company, email, whatsapp, city, state, format, message, consent, locale)
  on public.sponsor_leads to anon, authenticated;
grant select on public.sponsor_leads to authenticated;

create policy "patrocinio: qualquer um envia" on public.sponsor_leads
  for insert to anon, authenticated
  with check (consent);

create policy "patrocinio: so a moderacao le" on public.sponsor_leads
  for select to authenticated
  using (public.is_service_admin());

-- Sem política de update nem de delete: o público não altera nem apaga.
