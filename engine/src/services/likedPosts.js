import { must, supabase } from "./supabase";
import { goalFromRow, normalizeCommunityGoal } from "./db";

/**
 * As publicações que EU curti.
 *
 * Toda rede guarda isso e esconde no mesmo lugar: atrás do menu "..." do
 * próprio perfil, nunca como aba à vista. O motivo é o mesmo em todas —
 * curtida é rastro, não coleção. Serve para "aquele post do turbo que eu vi
 * semana passada", e não para alguém folhear o seu gosto.
 *
 * Não precisou de tabela nem de migração: `post_likes` já existe, já tem
 * índice por `liker_id` e a leitura dela é pública (é o que permite contar
 * curtida de qualquer post). O que é privado é só a TELA — ninguém tem por
 * onde pedir esta lista de outra pessoa dentro do app.
 *
 * Post arquivado ou apagado não volta aqui: quem decide o que aparece é a
 * política de `community_goals`, e a arquivada é escondida até do dono.
 */
export async function fetchLikedPosts(userId, { limit = 60 } = {}) {
  if (!userId) return [];
  const curtidas =
    must(
      await supabase
        .from("post_likes")
        .select("post_id")
        .eq("liker_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit),
    ) || [];
  const ids = curtidas.map((row) => row.post_id).filter(Boolean);
  if (!ids.length) return [];

  const rows = must(await supabase.from("community_goals").select("*").in("id", ids)) || [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  // A ordem é a da curtida, não a do post: a pessoa procura pelo "quando eu
  // curti", que é a única coisa que ela lembra.
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((row) => normalizeCommunityGoal(goalFromRow(row)));
}
