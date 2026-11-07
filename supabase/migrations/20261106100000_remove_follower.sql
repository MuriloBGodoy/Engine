-- ---------------------------------------------------------------------------
-- Remover um seguidor (06/11/2026)
-- ---------------------------------------------------------------------------
--
-- A lista de seguidores virou folha, aberta pelo contador do perfil, e com
-- ela veio a pergunta que toda rede já responde: "quem é essa pessoa que me
-- segue, e como eu tiro ela daqui?".
--
-- Até agora só quem segue podia desfazer o vínculo (`deixa de seguir por si`).
-- Quem é seguido não tinha saída nenhuma entre aguentar e bloquear — e
-- bloquear é pesado demais para "não quero essa pessoa na minha lista".
--
-- É a mesma gradação de silenciar: entre o nada e a ruptura tem que existir o
-- gesto pequeno. Remover seguidor NÃO avisa a pessoa e NÃO a impede de seguir
-- de novo (igual Instagram): quem quer barreira de verdade bloqueia, e aí o
-- `follows_block_guard` já cuida dos dois lados.
--
-- Política nova em vez de alterar a existente: as duas são permissivas e o
-- Postgres soma. Quem apaga continua sendo um dos dois lados do vínculo,
-- nunca um terceiro.

create policy "seguidores: o seguido tambem pode tirar" on public.follows
  for delete to authenticated using (target_id = (select auth.uid()));
