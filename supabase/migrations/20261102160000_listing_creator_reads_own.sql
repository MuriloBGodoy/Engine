-- O primeiro anúncio de uma conta nova falhava com 403.
--
-- Em 20261101130000 a leitura de anúncio passou a ser "aprovado, equipe do
-- perfil ou moderação". Quem anuncia pela primeira vez ainda não tem perfil
-- profissional: o trigger service_listings_profile cria o perfil pessoal e a
-- linha de equipe no MESMO comando do insert. O app grava com
-- `.insert(...).select(...)` (RETURNING), e o RETURNING passa pela política de
-- leitura — que pergunta a is_pro_member(), uma função STABLE que ainda não
-- enxerga a linha de equipe recém-criada. Resultado: "new row violates
-- row-level security policy" e o anúncio não era salvo. Achado na auditoria
-- de Serviços de 02/11/2026; o check:rls não pegava porque o insert dele não
-- pede o RETURNING.
--
-- Correção: quem CRIOU o anúncio sempre o lê (como era antes de 20261101130000).
-- É o mesmo dado que ele acabou de escrever; não abre nada para terceiros.
-- A edição e a exclusão continuam sendo da equipe do perfil.

drop policy if exists "anuncios: aprovado, equipe ou moderacao" on public.service_listings;
create policy "anuncios: aprovado, autor, equipe ou moderacao" on public.service_listings
  for select using (
    moderation_status = 'approved'
    or owner_id = (select auth.uid())
    or public.is_pro_member(profile_id)
    or public.is_service_admin()
  );

-- A trava "perfil suspenso some" tropeça no mesmo ponto: o perfil criado no
-- comando ainda não aparece para pro_profile_visible(). O autor passa por ela
-- (ele vê o próprio anúncio mesmo com a página suspensa — o público não).
drop policy if exists "anuncios: perfil suspenso some" on public.service_listings;
create policy "anuncios: perfil suspenso some" on public.service_listings
  as restrictive for select using (
    owner_id = (select auth.uid())
    or public.pro_profile_visible(profile_id)
  );
