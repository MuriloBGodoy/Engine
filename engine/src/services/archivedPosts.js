import { must, supabase } from "./supabase";
import { goalFromRow, normalizeCommunityGoal } from "./db";

/**
 * Publicações arquivadas (migration 20261104200000).
 *
 * Arquivar é o meio-termo que faltava entre deixar no ar e apagar. Apagar
 * leva junto as curtidas e a conversa inteira, para todo mundo, para sempre;
 * arquivar só tira do ar, e volta igual.
 *
 * Quem esconde é o banco: a publicação arquivada some de TODA consulta,
 * inclusive das minhas. Por isso o arquivo não é um `select` com filtro — é
 * uma função (`my_archived_posts`), e é o único lugar por onde ele aparece.
 * Assim nenhuma tela nova precisa lembrar de filtrar nada.
 */

export async function setPostArchived(postId, archived) {
  if (!postId) return;
  must(
    await supabase.rpc("set_post_archived", {
      p_post_id: String(postId),
      p_archived: Boolean(archived),
    }),
  );
}

/** O meu arquivo, do arquivado mais recente para o mais antigo. */
export async function fetchArchivedPosts({ limit = 60 } = {}) {
  const rows = must(await supabase.rpc("my_archived_posts", { p_limit: limit })) || [];
  return rows.map((row) => normalizeCommunityGoal(goalFromRow(row)));
}
