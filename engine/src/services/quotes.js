import { must, supabase } from "./supabase";
import { compressPhotoForUpload, uploadToStorage } from "./photos";

/**
 * Pedido de orçamento (Serviços) — migration 20261029120000_quote_requests.
 *
 * Tudo que escreve é função do banco: o app manda o pedido, a resposta e o
 * fechamento; data, status, validade, limites e quem recebe aviso são de lá.
 * Os números abaixo são o espelho para a TELA (avisar antes de bater no
 * limite); quem vale é `quote_limits()` no banco, que o app também lê.
 */
export const QUOTE_DEFAULT_LIMITS = Object.freeze({
  ttlDays: 7,
  maxOpenPerCustomer: 3,
  maxPerDayPerCustomer: 5,
  maxPhotos: 4,
  providerRepliesPerMonth: null,
});

export const QUOTE_DESCRIPTION_MIN = 20;
export const QUOTE_DESCRIPTION_MAX = 1500;
export const QUOTE_CAR_MAX = 120;
export const QUOTE_REPLY_MESSAGE_MAX = 1000;
export const QUOTE_REPLY_TIME_MAX = 80;
export const QUOTE_URGENCIES = ["today", "week", "flexible"];
export const QUOTE_CONTACTS = ["message", "whatsapp"];

// Códigos que o banco devolve e a tela sabe explicar (quotes.errors.*).
const KNOWN_ERRORS = new Set([
  "not-signed-in", "too-many-open", "rate-limited", "invalid-photo", "too-many-photos",
  "invalid-category", "invalid-place", "description-too-short", "invalid-request",
  "not-found", "request-closed", "already-replied", "reply-limit", "invalid-price",
  "already-closed", "invalid-reply", "account-suspended", "upload-failed",
]);

export const quoteErrorKey = (error) => {
  const code = error?.code || error?.message || "";
  return `quotes.errors.${KNOWN_ERRORS.has(code) ? code : "unknown"}`;
};

let limitsCache = null;
export const fetchQuoteLimits = async () => {
  if (limitsCache) return limitsCache;
  try {
    const data = must(await supabase.rpc("quote_limits"));
    limitsCache = { ...QUOTE_DEFAULT_LIMITS, ...(data || {}) };
  } catch {
    limitsCache = { ...QUOTE_DEFAULT_LIMITS };
  }
  return limitsCache;
};

const requestFromRow = (row = {}) => ({
  id: row.id,
  category: row.category || "other",
  carLabel: row.car_label || "",
  description: row.description || "",
  photos: Array.isArray(row.photos) ? row.photos : [],
  country: row.country || "BR",
  state: row.state || "",
  city: row.city || "",
  urgency: row.urgency || "week",
  contact: row.contact || "message",
  status: row.status || "open",
  chosenReplyId: row.chosen_reply_id || null,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  closedAt: row.closed_at || null,
});

/** Meus pedidos, cada um com as respostas (mais barata primeiro). */
export const fetchMyQuoteRequests = async () => {
  const rows = must(await supabase.rpc("my_quote_requests")) || [];
  return rows.map((row) => ({
    ...requestFromRow(row),
    replies: Array.isArray(row.replies) ? row.replies : [],
  }));
};

/** Caixa do prestador: pedidos no alcance dos anúncios aprovados + os que respondi. */
export const fetchQuoteInbox = async () => {
  const rows = must(await supabase.rpc("quote_inbox")) || [];
  return rows.map((row) => ({
    ...requestFromRow(row),
    reach: row.reach || "state",
    listingId: row.listing_id || "",
    replyCount: Number(row.reply_count) || 0,
    myReply: row.my_reply || null,
    chosenMe: Boolean(row.chosen_me),
    customerId: row.customer_id || "",
    customer: row.customer || null,
  }));
};

/**
 * Fotos do pedido: redesenhadas e sem EXIF (services/cleanImage.js, via
 * compressPhotoForUpload) já na escolha; aqui só sobem. Falhou a subida, o
 * pedido não sai — o banco recusa foto em data URI.
 */
export const prepareQuotePhoto = (file) => compressPhotoForUpload(file);

const uploadQuotePhotos = async (userId, blobs) => {
  const urls = [];
  for (const blob of blobs) {
    const path = `users/${userId}/quotes/${Date.now()}-${crypto.randomUUID()}.jpg`;
    try {
      urls.push(await uploadToStorage(path, blob));
    } catch (error) {
      throw Object.assign(new Error("upload-failed"), { code: "upload-failed", cause: error });
    }
  }
  return urls;
};

export const createQuoteRequest = async (userId, input, photoBlobs = []) => {
  const photos = photoBlobs.length ? await uploadQuotePhotos(userId, photoBlobs) : [];
  return must(
    await supabase.rpc("create_quote_request", {
      p_request: {
        category: input.category,
        carLabel: String(input.carLabel || "").trim().slice(0, QUOTE_CAR_MAX),
        description: String(input.description || "").trim().slice(0, QUOTE_DESCRIPTION_MAX),
        photos,
        country: input.country || "BR",
        state: input.state,
        city: String(input.city || "").trim(),
        urgency: input.urgency,
        contact: input.contact,
      },
    }),
  );
};

/**
 * Preço digitado → número. "1.234,50", "1,234.50", "1500", "1.500" (mil e
 * quinhentos), "99,90". Com os dois separadores, o último é o decimal; com um
 * só, ele é decimal apenas se aparece uma vez e tem 1 ou 2 dígitos depois.
 * Vazio ou ilegível → null.
 */
export const parsePrice = (raw) => {
  const text = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!/\d/.test(text)) return null;
  let normalized;
  if (text.includes(",") && text.includes(".")) {
    const decimal = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = text.split(thousands).join("").replace(decimal, ".");
  } else {
    const sep = text.includes(",") ? "," : text.includes(".") ? "." : "";
    const parts = sep ? text.split(sep) : [text];
    normalized =
      parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2
        ? `${parts[0]}.${parts[1]}`
        : parts.join("");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
};

export const replyToQuoteRequest = async (requestId, reply) =>
  must(
    await supabase.rpc("reply_quote_request", {
      p_request: requestId,
      p_reply: {
        priceMin: reply.priceMin,
        priceMax: reply.priceMax ?? null,
        currency: reply.currency || "BRL",
        estimatedTime: String(reply.estimatedTime || "").trim().slice(0, QUOTE_REPLY_TIME_MAX),
        message: String(reply.message || "").trim().slice(0, QUOTE_REPLY_MESSAGE_MAX),
      },
    }),
  );

/** outcome: "chosen" (com a resposta escolhida) ou "gave_up". */
export const closeQuoteRequest = async (requestId, outcome, replyId = null) =>
  must(
    await supabase.rpc("close_quote_request", {
      p_request: requestId,
      p_outcome: outcome,
      p_reply: outcome === "chosen" ? replyId : null,
    }),
  );

export const formatQuotePrice = (reply, locale = "pt-BR") => {
  if (!reply || reply.priceMin == null) return "";
  let format;
  try {
    format = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: reply.currency || "BRL",
      maximumFractionDigits: Number(reply.priceMin) % 1 === 0 && Number(reply.priceMax ?? 0) % 1 === 0 ? 0 : 2,
    });
  } catch {
    format = new Intl.NumberFormat(locale);
  }
  const min = format.format(Number(reply.priceMin));
  return reply.priceMax != null ? `${min} – ${format.format(Number(reply.priceMax))}` : min;
};

/** Dias inteiros até vencer (0 = vence hoje). */
export const daysLeft = (expiresAt) => {
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
};
