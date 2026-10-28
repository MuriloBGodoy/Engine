import { must, supabase } from "./supabase";

/**
 * "Baixar uma cópia dos meus dados" — portabilidade (LGPD art. 18, V), que a
 * Política de Privacidade promete em Configurações.
 *
 * Só lê o que as regras do banco já deixam o dono ler; nada passa por
 * servidor próprio. Uma tabela que falhar (ou não existir ainda) entra no
 * arquivo como erro, em vez de impedir o resto.
 */
const SOURCES = [
  ["settings", (uid) => supabase.from("user_private").select("doc_id, data, updated_at").eq("user_id", uid)],
  ["consents", (uid) => supabase.from("user_consents").select("*").eq("user_id", uid)],
  ["publicProfile", (uid) => supabase.from("public_profiles").select("*").eq("user_id", uid)],
  ["cars", (uid) => supabase.from("cars").select("*").eq("user_id", uid)],
  ["posts", (uid) => supabase.from("community_goals").select("*").eq("owner_id", uid)],
  ["serviceListings", (uid) => supabase.from("service_listings").select("*").eq("owner_id", uid)],
  ["following", (uid) => supabase.from("follows").select("target_id, created_at").eq("follower_id", uid)],
  ["followers", (uid) => supabase.from("follows").select("follower_id, created_at").eq("target_id", uid)],
];

export async function buildMyDataExport(user) {
  const uid = user?.uid;
  if (!uid) throw new Error("not-signed-in");

  const results = await Promise.all(
    SOURCES.map(async ([key, query]) => {
      try {
        return [key, must(await query(uid))];
      } catch (error) {
        return [key, { error: error?.message || "unavailable" }];
      }
    }),
  );

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: uid,
      email: user.email || "",
      createdAt: user.metadata?.creationTime || "",
      providers: (user.providerData || []).map((item) => item.providerId),
    },
    ...Object.fromEntries(results),
  };
}

/** Gera o JSON e oferece o download. */
export async function downloadMyData(user) {
  const data = await buildMyDataExport(user);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `engine-meus-dados-${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
