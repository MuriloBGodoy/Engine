import { auth, must, supabase } from "./supabase";
import { engineDB } from "./db";

/**
 * Avaliações de serviço (tabela `service_reviews`).
 *
 * As regras moram no banco (migration 20261025130000_service_reviews.sql):
 * uma por pessoa por anúncio, dono não avalia o próprio, conta com menos de
 * 24 h não avalia, no máximo 5 novas em 24 h, só a moderação oculta. Aqui é
 * só o acesso e a tradução do erro do banco para um código que a tela entende.
 *
 * Os erros saem com `code` em um destes valores, para a tela escolher o texto:
 *   not-signed-in, listing-unavailable, own-listing, account-too-new,
 *   rate-limited, already-reviewed, unknown.
 */

export const REVIEW_COMMENT_MAX = 1000;
export const REVIEW_REPLY_MAX = 1000;
export const REVIEW_PAGE_SIZE = 10;
export const REVIEW_MIN_ACCOUNT_AGE_HOURS = 24;

const KNOWN_CODES = new Set([
  "not-signed-in",
  "listing-unavailable",
  "own-listing",
  "account-too-new",
  "rate-limited",
]);

const reviewError = (error) => {
  const message = String(error?.message || "");
  let code = "unknown";
  if (KNOWN_CODES.has(message)) code = message;
  else if (error?.code === "23505") code = "already-reviewed";
  else if (error?.code === "42501" || /row-level security/i.test(message)) code = "not-allowed";
  return Object.assign(new Error(message || code), { code, cause: error });
};

const call = async (request) => {
  const { data, error } = await request;
  if (error) throw reviewError(error);
  return data;
};

const reviewFromRow = (row) => ({
  id: row.id,
  listingId: row.listing_id,
  authorId: row.author_id,
  rating: Number(row.rating) || 0,
  comment: row.comment || "",
  ownerReply: row.owner_reply || "",
  ownerReplyAt: row.owner_reply_at || "",
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  edited: Boolean(row.updated_at && row.created_at && row.updated_at !== row.created_at),
});

const clampRating = (value) => Math.min(5, Math.max(1, Math.round(Number(value) || 0)));

/** Média e contagem que o banco já guarda no anúncio. */
export const listingRating = (listing = {}) => {
  const count = Number(listing.ratingCount ?? listing.rating_count) || 0;
  const raw = listing.ratingAvg ?? listing.rating_avg;
  const average = count > 0 && raw != null ? Number(raw) : null;
  return { count, average };
};

/**
 * Uma página de avaliações publicadas, mais novas primeiro, já com o perfil
 * público de quem escreveu (`author`, `username`, `avatar`...). Perfil ausente
 * = conta sem perfil público; a tela mostra um nome genérico.
 */
export async function listServiceReviews(listingId, { page = 0, pageSize = REVIEW_PAGE_SIZE } = {}) {
  if (!listingId) return { reviews: [], hasMore: false };
  const from = page * pageSize;
  // Um a mais para saber se há próxima página sem pedir o total.
  const rows = await call(
    supabase
      .from("service_reviews")
      .select("*")
      .eq("listing_id", String(listingId))
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize),
  );
  const pageRows = (rows || []).slice(0, pageSize);
  const profiles = await engineDB.getPublicProfilesByIds(pageRows.map((row) => row.author_id));
  return {
    reviews: pageRows.map((row) => ({ ...reviewFromRow(row), authorProfile: profiles[row.author_id] || null })),
    hasMore: (rows || []).length > pageSize,
  };
}

/** Quantas publicadas em cada estrela: { 1: n, ..., 5: n }. */
export async function getServiceReviewDistribution(listingId) {
  const empty = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (!listingId) return empty;
  const data = await call(supabase.rpc("service_review_distribution", { p_listing_id: String(listingId) }));
  return Object.fromEntries(Object.keys(empty).map((key) => [key, Number(data?.[key]) || 0]));
}

/** A avaliação de quem está logado neste anúncio (inclusive oculta), ou null. */
export async function getMyServiceReview(listingId) {
  const uid = auth.currentUser?.uid;
  if (!uid || !listingId) return null;
  const row = await call(
    supabase
      .from("service_reviews")
      .select("*")
      .eq("listing_id", String(listingId))
      .eq("author_id", uid)
      .maybeSingle(),
  );
  return row ? reviewFromRow(row) : null;
}

/**
 * Cria ou edita a avaliação de quem está logado. Com `reviewId`, edita; sem,
 * cria. Devolve a avaliação como ficou no banco.
 */
export async function saveServiceReview(listingId, { rating, comment = "", reviewId = "" } = {}) {
  if (!auth.currentUser?.uid) throw Object.assign(new Error("not-signed-in"), { code: "not-signed-in" });
  const payload = {
    rating: clampRating(rating),
    comment: String(comment || "").trim().slice(0, REVIEW_COMMENT_MAX),
  };
  const request = reviewId
    ? supabase.from("service_reviews").update(payload).eq("id", reviewId).select("*").single()
    : supabase
        .from("service_reviews")
        .insert({ ...payload, listing_id: String(listingId) })
        .select("*")
        .single();
  return reviewFromRow(await call(request));
}

/** Apaga a avaliação de quem está logado. */
export async function deleteMyServiceReview(reviewId) {
  const uid = auth.currentUser?.uid;
  if (!uid || !reviewId) return;
  await call(supabase.from("service_reviews").delete().eq("id", reviewId).eq("author_id", uid));
}

/**
 * Resposta do dono do anúncio (uma por avaliação; texto vazio apaga). O banco
 * ignora a escrita de quem não é o dono.
 */
export async function replyToServiceReview(reviewId, text) {
  const reply = String(text || "").trim().slice(0, REVIEW_REPLY_MAX);
  const row = await call(
    supabase
      .from("service_reviews")
      .update({ owner_reply: reply || null })
      .eq("id", reviewId)
      .select("*")
      .single(),
  );
  return reviewFromRow(row);
}

/**
 * Denuncia uma avaliação. Vai para a fila de denúncias que a moderação já lê;
 * não oculta nada sozinho.
 */
export async function reportServiceReview(review, reason = "") {
  if (!auth.currentUser?.uid) throw Object.assign(new Error("not-signed-in"), { code: "not-signed-in" });
  must(
    await supabase.from("reports").insert({
      target_type: "service_review",
      target_id: String(review.id),
      reported_user_id: String(review.authorId || ""),
      reporter_id: auth.currentUser.uid,
      reason: String(reason || "").slice(0, 280),
    }),
  );
}

/**
 * Conta nova demais para avaliar? Só um aviso antecipado: quem decide é o
 * banco. `user` é o usuário do app (services/supabase.js, `toEngineUser`).
 */
export const accountTooNewToReview = (user) => {
  const created = Date.parse(user?.metadata?.creationTime || "");
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < REVIEW_MIN_ACCOUNT_AGE_HOURS * 3600 * 1000;
};
