/**
 * A vitrine de carros: o lado público de um carro da garagem.
 *
 * O carro da garagem NUNCA é lido por outra pessoa — ele carrega gasto,
 * aporte e renda. O que vai para a Comunidade é a cópia montada aqui, com o
 * que o dono escolheu publicar, e é a tabela `car_showcase` (20261103150000)
 * que guarda essa cópia.
 *
 * A ficha declarada (stage, modificações, potência) sai de `publicSpecSheet`,
 * a mesma que o post do feed já usa: número declarado chega sempre etiquetado
 * como afirmação do dono, nunca como medição verificada.
 */
import { supabase, auth, must } from "./supabase";
import { normalizeSpecSheet, publicSpecSheet } from "./carSpecSheet";
import { engineDB } from "./db";

const texto = (valor, limite) => String(valor ?? "").trim().slice(0, limite);

/** O recorte publicável de um carro da garagem. */
export function showcasePayload(car = {}, { state = "", city = "" } = {}) {
  const sheet = normalizeSpecSheet(car.specs);
  const images = Array.isArray(car.images) ? car.images.filter(Boolean) : [];
  return {
    brand: texto(car.brand, 80),
    model: texto(car.model, 120),
    year: texto(car.year, 40),
    title: texto(`${car.brand || ""} ${car.model || ""}`, 160),
    image: texto(car.image || images[0] || "", 500),
    images: images.slice(0, 10),
    stage: sheet?.stage || "stock",
    mods: Array.isArray(sheet?.mods) ? sheet.mods : [],
    state: texto(state, 40),
    city: texto(city, 80),
    specs: publicSpecSheet(car),
  };
}

/**
 * Publica (ou atualiza) o carro na vitrine. Devolve o endereço dele.
 *
 * A região sai do perfil de quem publica, não do carro: o carro não tem
 * cidade, a pessoa tem. É o que faz o filtro "em SP" da aba Carros achar
 * alguma coisa.
 */
export async function publishCar(car, place = null) {
  let regiao = place;
  if (!regiao) {
    const settings = await engineDB.getSettings().catch(() => null);
    regiao = {
      state: settings?.profile?.state || "",
      city: settings?.profile?.location || "",
    };
  }
  const data = showcasePayload(car, regiao);
  return must(
    await supabase.rpc("publish_car", { p_car_id: String(car.id), p_data: data }),
  );
}

export async function unpublishCar(carId) {
  must(await supabase.rpc("unpublish_car", { p_car_id: String(carId) }));
}

/** Os ids dos meus carros que estão na vitrine, para marcar o interruptor. */
export async function myShowcasedCarIds() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const rows = must(await supabase.from("car_showcase").select("id").eq("user_id", uid));
  return rows.map((row) => row.id);
}

const fromRow = (row) => ({
  id: row.id,
  ownerId: row.user_id,
  slug: row.slug,
  brand: row.brand,
  model: row.model,
  year: row.model_year,
  stage: row.stage,
  mods: row.mods || [],
  state: row.state,
  city: row.city,
  likeCount: row.like_count || 0,
  updatedAt: row.updated_at,
  ...(row.data || {}),
});

/** A mesma normalização do banco (`car_search_normalize`), do lado de cá. */
const paraBusca = (valor = "") =>
  String(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Busca na vitrine.
 *
 * Cada palavra digitada vira uma condição que a linha de busca do carro
 * precisa conter — "golf stage 1" acha o Golf preparado, não todo Golf e todo
 * stage 1. A linha inclui a preparação que o dono escreveu na garagem e as
 * palavras que cada etiqueta significa, então "stg1", "suspensão" e
 * "coilover" chegam no mesmo lugar (ver 20261104180000_car_search_text.sql).
 *
 * Marca e região continuam exatos: são escolha de etiqueta, não digitação.
 */
export async function listShowcase({
  term = "",
  brand = "",
  state = "",
  limit = 30,
} = {}) {
  let query = supabase
    .from("car_showcase")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (brand) query = query.ilike("brand", brand);
  if (state) query = query.eq("state", state);

  // Teto de 6 palavras: passar disso é frase, não busca, e cada palavra é
  // mais uma varredura.
  for (const palavra of paraBusca(term).split(" ").filter(Boolean).slice(0, 6)) {
    query = query.ilike("search_text", `%${palavra}%`);
  }

  return must(await query).map(fromRow);
}

/** Marcas que existem na vitrine hoje, para montar o filtro sem lista fixa. */
export async function showcaseBrands() {
  const rows = must(await supabase.from("car_showcase").select("brand").limit(500));
  return [...new Set(rows.map((row) => row.brand).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

export async function getShowcaseBySlug(slug) {
  const row = must(
    await supabase.from("car_showcase").select("*").eq("slug", String(slug)).maybeSingle(),
  );
  return row ? fromRow(row) : null;
}

export async function didILike(carId) {
  const uid = auth.currentUser?.uid;
  if (!uid || !carId) return false;
  const row = must(
    await supabase
      .from("car_likes")
      .select("car_id")
      .eq("car_id", String(carId))
      .eq("user_id", uid)
      .maybeSingle(),
  );
  return Boolean(row);
}

/** Comentar na página do carro. O autor quem carimba é o banco. */
export async function addCarComment(carId, text) {
  const settings = await engineDB.getSettings().catch(() => null);
  const perfil = settings?.profile || {};
  return must(
    await supabase.rpc("add_car_comment", {
      p_car_id: String(carId),
      p_comment: {
        text: texto(text, 300),
        author: texto(perfil.displayName, 80),
        username: texto(perfil.username, 32),
        avatar: String(perfil.avatar || ""),
      },
    }),
  );
}

export async function deleteCarComment(carId, commentId) {
  must(
    await supabase.rpc("delete_car_comment", {
      p_car_id: String(carId),
      p_comment_id: String(commentId),
    }),
  );
}

export async function likeCar(carId, like) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("not-signed-in");
  if (like) {
    must(await supabase.from("car_likes").insert({ car_id: String(carId), user_id: uid }));
    return;
  }
  must(
    await supabase
      .from("car_likes")
      .delete()
      .eq("car_id", String(carId))
      .eq("user_id", uid),
  );
}
