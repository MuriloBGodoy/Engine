/**
 * Regras do anúncio de serviço que a tela e o banco precisam concordar.
 *
 * O banco é quem decide (guard de `service_listings`, migração
 * 20261025150000_service_listing_light_edits.sql). Daqui a tela só AVISA
 * antes de salvar — "isso volta para aprovação" — e por isso as listas abaixo
 * têm de andar junto com as de lá. Mudou uma, muda a outra.
 */

/**
 * Prazo prometido para revisar um anúncio. Um lugar só: a tela de "recebido",
 * o "Meus anúncios" e o aviso de edição leem daqui, nos 3 idiomas, por
 * interpolação ({{hours}}).
 */
export const APPROVAL_SLA_HOURS = 24;

/** Preço é texto livre ("A partir de R$ 120", "R$ 80–150", "Sob orçamento"). */
export const PRICE_MAX_LENGTH = 60;

/**
 * Campos que o dono edita com o anúncio no ar: contato, preço e agenda.
 * Site e vídeo NÃO estão aqui de propósito — são links livres (ver a
 * migração).
 */
export const LIGHT_EDIT_KEYS = [
  "price",
  "availability",
  "whatsapp",
  "whatsappCountry",
  "email",
  "instagram",
  "tiktok",
  "serviceArea",
  "active",
];

// Contabilidade: não é conteúdo do anúncio, não conta como mudança.
const BOOKKEEPING_KEYS = [
  "id",
  "ownerId",
  "slug",
  "moderationStatus",
  "moderationNote",
  "moderationHistory",
  "reviewedBy",
  "reviewedAt",
  "submittedAt",
  "createdAt",
  "updatedAt",
  "viewCount",
  "detailCount",
  "whatsappCount",
  "ratingCount",
  "ratingAvg",
  "subscriptionStatus",
];

const IGNORED = new Set([...LIGHT_EDIT_KEYS, ...BOOKKEEPING_KEYS]);

const isEmpty = (value) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

// JSON com chaves em ordem, para comparar dois objetos pelo conteúdo.
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

/** O que, num anúncio, passa pela moderação. */
export const reviewFields = (listing = {}) =>
  Object.fromEntries(
    Object.entries(listing).filter(([key, value]) => !IGNORED.has(key) && !isEmpty(value)),
  );

/**
 * A edição precisa de nova aprovação? Sempre que o anúncio não estava no ar,
 * ou quando algo além dos campos leves mudou. Os dois lados chegam
 * normalizados (`normalizeServiceListing`), para "" e ausente valerem igual.
 */
export const listingEditNeedsReview = (original, next) => {
  if (!original || original.moderationStatus !== "approved") return true;
  return stable(reviewFields(original)) !== stable(reviewFields(next));
};

/** Quais campos que passam pela moderação mudaram (para dizer na tela). */
export const changedReviewKeys = (original, next) => {
  const before = reviewFields(original);
  const after = reviewFields(next);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => stable(before[key]) !== stable(after[key]),
  );
};

/** Todos os status de moderação; "suspended" = tirado do ar pela moderação. */
export const MODERATION_STATUSES = [
  "pending",
  "approved",
  "changes_requested",
  "rejected",
  "suspended",
];
