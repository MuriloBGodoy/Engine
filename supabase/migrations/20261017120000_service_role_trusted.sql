-- A chave service_role é o servidor: webhook de pagamento, script de admin,
-- migração. Ela já ignora a RLS; faltava os triggers de proteção (contadores,
-- comentários, datas) também reconhecerem que quem escreve é de confiança.
-- Sem isto, um script de admin não conseguia corrigir um contador nem plantar
-- dado de teste com o formato real.
create or replace function public.is_trusted_write()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(current_setting('engine.trusted', true), '') = 'on'
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;
