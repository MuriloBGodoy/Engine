import { must, supabase } from "./supabase";
import { goalFromRow, normalizeCommunityGoal } from "./db";

/**
 * Publicações salvas (o marcador do canto direito do post).
 *
 * Tabela `saved_posts` (migration 20261102150000). Lista privada: a RLS só
 * deixa o dono ler e mexer, e recusa salvar post que a pessoa não enxerga
 * (autor suspenso) ou de alguém com bloqueio entre os dois. Post apagado sai
 * da lista em cascata. A tela conhece só esta interface (a mesma da versão
 * provisória em localStorage):
 *
 *   listSavedPostIds(userId)         -> Promise<string[]>  (mais recente primeiro)
 *   setPostSaved(userId, postId, on) -> Promise<void>      (lança se o banco recusar)
 *   fetchSavedPosts(userId)          -> Promise<post[]>    (aba "Salvos" do perfil)
 *
 * Quem salvou na versão provisória (só neste aparelho) tem a lista levada
 * para o banco na primeira leitura, e a cópia local é apagada.
 */

const legacyKey = (userId) => `engine:saved-posts:${userId}`;

const takeLegacy = (userId) => {
  try {
    const raw = window.localStorage.getItem(legacyKey(userId));
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((id) => typeof id === "string" && id) : [];
  } catch {
    return [];
  }
};

const dropLegacy = (userId) => {
  try {
    window.localStorage.removeItem(legacyKey(userId));
  } catch {
    // Navegação privada: nada a limpar.
  }
};

const migrateLegacy = async (userId) => {
  const ids = takeLegacy(userId);
  if (!ids.length) return;
  // Um por vez: post que sumiu ou de quem bloqueou é recusado sozinho, sem
  // derrubar os outros.
  for (const postId of ids.slice(0, 200).reverse()) {
    await supabase.from("saved_posts").insert({ user_id: userId, post_id: postId });
  }
  dropLegacy(userId);
};

export async function listSavedPostIds(userId) {
  if (!userId) return [];
  await migrateLegacy(userId).catch(() => {});
  const rows =
    must(
      await supabase
        .from("saved_posts")
        .select("post_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1000),
    ) || [];
  return rows.map((row) => row.post_id);
}

export async function setPostSaved(userId, postId, saved) {
  if (!userId || !postId) return;
  if (saved) {
    const { error } = await supabase.from("saved_posts").insert({ user_id: userId, post_id: String(postId) });
    // Já estava salvo (outra aba, toque duplo): não é erro.
    if (error && error.code !== "23505") must({ data: null, error });
    return;
  }
  must(await supabase.from("saved_posts").delete().eq("user_id", userId).eq("post_id", String(postId)));
}

/**
 * A aba "Salvos" do próprio perfil, do salvo mais recente para o mais antigo.
 * Post que a pessoa deixou de enxergar (autor suspenso) não volta: quem
 * decide é a RLS do post.
 */
export async function fetchSavedPosts(userId, { limit = 60 } = {}) {
  if (!userId) return [];
  const ids = (await listSavedPostIds(userId)).slice(0, limit);
  if (!ids.length) return [];
  const rows = must(await supabase.from("community_goals").select("*").in("id", ids)) || [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((row) => normalizeCommunityGoal(goalFromRow(row)));
}
