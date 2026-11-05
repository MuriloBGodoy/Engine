import { must, supabase } from "./supabase";

/**
 * Carros salvos (migration 20261104210000).
 *
 * Salvar é diferente de curtir, e a diferença importa: curtir é um recado
 * para o dono, salvar é um bilhete para mim mesmo. A grade da aba Carros é
 * de gente desconhecida — sem o marcador, a única forma de não perder uma
 * build era decorar o nome.
 *
 * Lista privada; carro despublicado some dela sozinho (cascata no banco).
 */

export async function listSavedCarIds(userId) {
  if (!userId) return [];
  const rows =
    must(
      await supabase
        .from("saved_cars")
        .select("car_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500),
    ) || [];
  return rows.map((row) => row.car_id);
}

export async function setCarSaved(userId, carId, saved) {
  if (!userId || !carId) return;
  if (saved) {
    const { error } = await supabase
      .from("saved_cars")
      .insert({ user_id: userId, car_id: String(carId) });
    // Já estava salvo (outra aba, toque duplo): não é erro.
    if (error && error.code !== "23505") must({ data: null, error });
    return;
  }
  must(
    await supabase.from("saved_cars").delete().eq("user_id", userId).eq("car_id", String(carId)),
  );
}

/** A lista "Salvos → Carros" do próprio perfil, do mais recente ao mais antigo. */
export async function fetchSavedCars(userId, { limit = 60 } = {}) {
  const ids = (await listSavedCarIds(userId)).slice(0, limit);
  if (!ids.length) return [];
  const rows = must(await supabase.from("car_showcase").select("*").in("id", ids)) || [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      title: [row.brand, row.model].filter(Boolean).join(" ").trim() || row.slug,
      year: row.model_year || "",
      city: row.city || "",
      stage: row.stage || "stock",
      likeCount: Number(row.like_count) || 0,
      // `data.image` é a capa que o dono escolheu para a vitrine.
      image: row.data?.image || row.data?.images?.[0] || "",
    }));
}
