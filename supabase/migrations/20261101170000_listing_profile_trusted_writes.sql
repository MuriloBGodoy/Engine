-- Anúncio criado por escrita de confiança (service_role, scripts do servidor,
-- funções que ligam engine.trusted) sem perfil profissional.
--
-- Em 20261101130000 o trigger service_listings_profile saía logo no começo
-- quando is_trusted_write() era verdadeiro. Desde 20261017120000 isso inclui
-- o service_role — então todo anúncio inserido pelo servidor sem
-- `profile_id` batia no NOT NULL e falhava (o check:rls de 01/11/2026 pegou:
-- os anúncios de teste do orçamento e da conversa não nasciam). Quem grava
-- pelo app não era afetado.
--
-- Agora a escrita de confiança continua livre para escolher perfil e tipo,
-- mas o que ela deixar vazio é preenchido como no caminho comum: sem perfil,
-- o perfil profissional pessoal do autor (criado na hora); produto continua
-- com os campos limpos.

create or replace function public.service_listings_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_service_admin();
begin
  if public.is_trusted_write() then
    if tg_op = 'INSERT' then
      new.kind := case when new.kind = 'product' then 'product' else 'service' end;
    end if;
    if new.profile_id is null then
      new.profile_id := public.ensure_person_pro_profile(new.owner_id);
    end if;
    if new.kind = 'product' and tg_op = 'INSERT' then
      new.data := public.product_clean_data(new.data);
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.kind := case when new.kind = 'product' then 'product' else 'service' end;
    if new.profile_id is null then
      new.profile_id := public.ensure_person_pro_profile(new.owner_id);
    elsif not v_admin and public.pro_role(new.profile_id, auth.uid()) is null then
      raise exception 'not-found' using errcode = 'P0002';
    end if;
  elsif not v_admin then
    new.kind := old.kind;
    new.profile_id := old.profile_id;
  end if;
  if not v_admin and public.is_account_suspended(auth.uid()) then
    raise exception 'account-suspended' using errcode = '42501';
  end if;
  if new.kind = 'product' then
    new.data := public.product_clean_data(new.data);
  end if;
  return new;
end;
$$;
revoke execute on function public.service_listings_profile() from public, anon, authenticated;
