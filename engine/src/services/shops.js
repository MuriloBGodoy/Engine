import { must, supabase, watchTable } from "./supabase";
import { listingEditNeedsReview } from "./serviceListingRules";
import { compressPhotoForUpload, isImageFile, uploadToStorage } from "./photos";

/**
 * Lojas: produtos à venda (peças, rodas, som...). Produto é um anúncio da
 * mesma tabela dos serviços com kind = "product" (migration 20261101130000):
 * mesma fila de moderação, mesmo guard de campos leves (preço, "a combinar",
 * "aceito proposta" e vendido editam com o anúncio no ar), mesmo slug, mesma
 * conversa. Sem pagamento: o negócio fecha no chat ou no WhatsApp.
 */

export const PRODUCT_PUBLIC_BASE_PATH = "/produtos";
export const PRODUCT_MAX_PHOTOS = 10;
export const PRODUCT_MAX_FITS = 5;
export const PRODUCT_CATEGORIES = ["parts", "wheels-tires", "sound", "accessories", "detailing", "tools", "other"];
export const PRODUCT_CONDITIONS = ["new", "used"];

const categoryKey = (id) => String(id || "other").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
export const productCategoryLabel = (id, t) => t(`shops.categories.${categoryKey(id)}`);

const fold = (text = "") =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** "Golf Comfortline 1.4 TSI" -> "golf". É a família que a peça atende. */
export const modelFamily = (name = "") => fold(name).split(/[\s/-]+/)[0] || "";

const cleanFit = (fit = {}) => {
  const yearFrom = Number.parseInt(fit.yearFrom, 10);
  const yearTo = Number.parseInt(fit.yearTo, 10);
  const from = yearFrom >= 1900 && yearFrom <= 2100 ? yearFrom : null;
  let to = yearTo >= 1900 && yearTo <= 2100 ? yearTo : null;
  if (from && to && to < from) to = from;
  return {
    brandCode: String(fit.brandCode || "").replace(/\D/g, "").slice(0, 6),
    brand: String(fit.brand || "").trim().slice(0, 40),
    modelCode: String(fit.modelCode || "").replace(/\D/g, "").slice(0, 8),
    model: String(fit.model || "").trim().slice(0, 80),
    yearFrom: from,
    yearTo: to,
  };
};

export const emptyProduct = () => ({
  id: "",
  kind: "product",
  profileId: "",
  title: "",
  description: "",
  photos: [],
  category: "",
  condition: "used",
  priceAmount: "",
  priceNegotiable: false,
  acceptsOffers: false,
  currency: "BRL",
  fits: [],
  saleStatus: "available",
});

/** Anúncio de produto no formato das telas (aceita linha crua ou objeto). */
export const normalizeProduct = (input = {}) => {
  const row = input.data ? { ...input.data, ...rowColumns(input) } : input;
  const price = row.priceAmount === "" || row.priceAmount == null ? null : Number(row.priceAmount);
  return {
    id: String(row.id || ""),
    kind: "product",
    profileId: String(row.profileId || ""),
    ownerId: String(row.ownerId || ""),
    slug: String(row.slug || ""),
    title: String(row.title || "").trim().slice(0, 90),
    description: String(row.description || "").trim().slice(0, 1500),
    photos: (Array.isArray(row.photos) ? row.photos : [])
      .map((photo) => String(photo || "").trim())
      .filter(Boolean)
      .slice(0, PRODUCT_MAX_PHOTOS),
    category: PRODUCT_CATEGORIES.includes(row.category) ? row.category : "",
    condition: PRODUCT_CONDITIONS.includes(row.condition) ? row.condition : "used",
    priceAmount: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null,
    priceNegotiable: Boolean(row.priceNegotiable) || !(Number.isFinite(price) && price >= 0),
    acceptsOffers: Boolean(row.acceptsOffers),
    currency: /^[A-Z]{3}$/.test(String(row.currency || "")) ? row.currency : "BRL",
    fits: (Array.isArray(row.fits) ? row.fits : []).map(cleanFit).filter((fit) => fit.brandCode).slice(0, PRODUCT_MAX_FITS),
    saleStatus: row.saleStatus === "sold" ? "sold" : "available",
    providerName: String(row.providerName || ""),
    city: String(row.city || ""),
    state: String(row.state || ""),
    country: String(row.country || ""),
    whatsapp: String(row.whatsapp || ""),
    whatsappCountry: String(row.whatsappCountry || ""),
    moderationStatus: row.moderationStatus || "pending",
    moderationNote: String(row.moderationNote || ""),
    active: row.active !== false,
    viewCount: Number(row.viewCount) || 0,
    detailCount: Number(row.detailCount) || 0,
    whatsappCount: Number(row.whatsappCount) || 0,
    submittedAt: row.submittedAt || "",
    createdAt: row.createdAt || "",
    updatedAt: row.updatedAt || "",
  };
};

function rowColumns(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    profileId: row.profile_id,
    slug: row.slug,
    moderationStatus: row.moderation_status,
    viewCount: row.view_count,
    detailCount: row.detail_count,
    whatsappCount: row.whatsapp_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const productFromRow = (row) => normalizeProduct(row);

/** Linha crua de anúncio (serviço ou produto) com o tipo. */
export const listingKindOf = (row) => (row?.kind === "product" ? "product" : "service");

export const productPath = (product) =>
  `${PRODUCT_PUBLIC_BASE_PATH}/${encodeURIComponent(product?.slug || product?.id || "")}`;

export const productUrl = (product) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}${productPath(product)}`;

/** "R$ 1.500" ou "A combinar". */
export const formatProductPrice = (product, t, locale = "pt-BR") => {
  if (!product || product.priceNegotiable || product.priceAmount == null) return t("shops.price.negotiable");
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: product.currency || "BRL",
      maximumFractionDigits: Number.isInteger(product.priceAmount) ? 0 : 2,
    }).format(product.priceAmount);
  } catch {
    return String(product.priceAmount);
  }
};

/** "VW Golf 2014–2020" */
export const fitLabel = (fit = {}) => {
  const years =
    fit.yearFrom && fit.yearTo && fit.yearFrom !== fit.yearTo
      ? `${fit.yearFrom}–${fit.yearTo}`
      : fit.yearFrom || fit.yearTo || "";
  return [fit.brand, fit.model, years].filter(Boolean).join(" ");
};

const carYear = (car = {}) => {
  const year = Number.parseInt(String(car.year || "").slice(0, 5), 10);
  // 32000 é o "zero km" da FIPE.
  if (year === 32000) return new Date().getFullYear();
  return year >= 1900 && year <= 2100 ? year : null;
};

/**
 * A peça serve neste carro da garagem? Marca pelo código FIPE (ou pelo nome,
 * para carro cadastrado antes do código existir), modelo pela família
 * ("Golf" serve em "Golf Comfortline 1.4"), ano dentro da faixa. Entrada sem
 * modelo = serve na marca toda; sem ano = qualquer ano.
 */
export const productFitsCar = (product, car) => {
  if (!product?.fits?.length || !car) return false;
  const brandCode = String(car.fipe?.brandCode || "");
  const brand = fold(car.brand);
  const family = modelFamily(car.model);
  const year = carYear(car);
  return product.fits.some((fit) => {
    const brandOk = (brandCode && fit.brandCode === brandCode) || (fit.brand && fold(fit.brand) === brand);
    if (!brandOk) return false;
    const modelOk =
      !fit.model ||
      (fit.modelCode && fit.modelCode === String(car.fipe?.modelCode || "")) ||
      modelFamily(fit.model) === family;
    if (!modelOk) return false;
    if (!year) return !fit.yearFrom && !fit.yearTo;
    return (!fit.yearFrom || year >= fit.yearFrom) && (!fit.yearTo || year <= fit.yearTo);
  });
};

/** O primeiro carro da garagem em que o produto serve, ou null. */
export const fittingCar = (product, cars = []) => cars.find((car) => productFitsCar(product, car)) || null;

/**
 * A linha pronta do primeiro contato, no chat e no WhatsApp:
 * produto — "Oi! Tenho interesse no *X*. Ainda está disponível?"
 * serviço — "Oi! Tenho interesse no serviço *X*. Pode me passar mais detalhes?"
 * O * é negrito no WhatsApp.
 */
export const interestMessage = (listing, t) =>
  t(listing?.kind === "product" ? "shops.interest.product" : "shops.interest.service", {
    title: listing?.title || "",
  });

/**
 * Foto de produto, logo ou capa: sempre recomprimida no aparelho e sem EXIF
 * (services/cleanImage.js, via photos.js), na pasta de quem sobe.
 */
export async function uploadListingPhoto(file, userId, folder = "shops") {
  if (!userId) throw new Error("not-signed-in");
  if (!isImageFile(file)) throw new Error("invalid-file");
  if ((file?.size || 0) > 20 * 1024 * 1024) throw new Error("file-too-big");
  const blob = await compressPhotoForUpload(file);
  return uploadToStorage(`users/${userId}/${folder}/${Date.now()}-${crypto.randomUUID()}.jpg`, blob);
}

/** Produtos aprovados (vitrine de Lojas), ao vivo. */
export function subscribeProducts(callback) {
  let active = true;
  const load = async () => {
    try {
      const rows = must(
        await supabase
          .from("service_listings")
          .select("*")
          .eq("kind", "product")
          .eq("moderation_status", "approved")
          .order("updated_at", { ascending: false })
          .limit(300),
      );
      if (active) callback(rows.map(productFromRow).filter((product) => product.active));
    } catch (error) {
      console.warn("[shops] subscribeProducts", error);
      if (active) callback([], error);
    }
  };
  load();
  const stop = watchTable("products", { table: "service_listings" }, load);
  return () => {
    active = false;
    stop();
  };
}

/** Anúncios (serviços e produtos) de um perfil. A RLS decide o que volta. */
export async function fetchProfileListings(profileId) {
  if (!profileId) return [];
  return must(
    await supabase
      .from("service_listings")
      .select("*")
      .eq("profile_id", profileId)
      .order("updated_at", { ascending: false })
      .limit(200),
  );
}

/** Produto pelo endereço público (slug ou id). Null = não existe ou não pode ver. */
export async function getProductByHandle(handle) {
  const clean = String(handle || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,120}$/.test(clean)) return null;
  const rows = must(
    await supabase.from("service_listings").select("*").eq("kind", "product").or(`slug.eq.${clean},id.eq.${clean}`).limit(1),
  );
  return rows[0] ? productFromRow(rows[0]) : null;
}

/**
 * Cria ou edita. O contato, o lugar e o nome vêm do perfil profissional na
 * hora de salvar (é o que o cartão da conversa e a pré-visualização do link
 * leem). Devolve `{ product, queued }`.
 */
export async function saveProduct(product, { profile, userId, original = null }) {
  if (!userId) throw new Error("not-signed-in");
  if (!profile?.id) throw new Error("not-found");
  const draft = normalizeProduct({ ...product, id: product.id || crypto.randomUUID() });
  const data = {
    title: draft.title,
    description: draft.description,
    photos: draft.photos,
    category: draft.category || "other",
    condition: draft.condition,
    priceAmount: draft.priceNegotiable ? null : draft.priceAmount,
    priceNegotiable: draft.priceNegotiable,
    acceptsOffers: draft.acceptsOffers,
    currency: draft.currency,
    fits: draft.fits,
    saleStatus: draft.saleStatus,
    providerName: profile.name || "",
    city: profile.data.city || "",
    state: profile.data.state || "",
    country: profile.data.country || "",
    whatsapp: profile.data.hideContact ? "" : profile.data.whatsapp || "",
    whatsappCountry: profile.data.whatsappCountry || "",
    active: true,
  };
  const comparableOriginal = original ? { ...normalizeProduct(original), moderationStatus: original.moderationStatus } : null;
  const staysLive = original && !listingEditNeedsReview(productReviewShape(comparableOriginal), productReviewShape({ ...comparableOriginal, ...data }));
  const status = staysLive ? "approved" : "pending";

  let saved = [];
  if (original) {
    saved = must(
      await supabase
        .from("service_listings")
        .update({ moderation_status: status, data: { ...stripColumns(original), ...data } })
        .eq("id", draft.id)
        .select("*"),
    );
  }
  if (!saved.length) {
    saved = must(
      await supabase
        .from("service_listings")
        .insert({ id: draft.id, owner_id: userId, kind: "product", profile_id: profile.id, moderation_status: "pending", data })
        .select("*"),
    );
  }
  const result = productFromRow(saved[0]);
  return { product: result, queued: result.moderationStatus !== "approved" };
}

/** Só marcar vendido / disponível (campo leve: continua no ar). */
export async function setProductSaleStatus(product, saleStatus) {
  const row = must(await supabase.from("service_listings").select("data, moderation_status").eq("id", product.id).maybeSingle());
  if (!row) throw new Error("not-found");
  must(
    await supabase
      .from("service_listings")
      .update({ moderation_status: row.moderation_status === "approved" ? "approved" : "pending", data: { ...row.data, saleStatus } })
      .eq("id", product.id),
  );
}

export async function deleteListing(listingId) {
  const rows = must(await supabase.from("service_listings").delete().eq("id", String(listingId)).select("id"));
  if (!rows.length) throw new Error("not-found");
}

// O guard compara `data`; aqui, o mesmo recorte para prever a fila.
const productReviewShape = (product = {}) => {
  const copy = { ...product };
  for (const key of ["ownerId", "profileId", "kind", "slug", "moderationStatus", "moderationNote", "viewCount", "detailCount", "whatsappCount", "submittedAt", "createdAt", "updatedAt", "id"]) {
    if (key !== "moderationStatus") delete copy[key];
  }
  return copy;
};

const stripColumns = (original = {}) => {
  const {
    id: _id, ownerId: _o, profileId: _p, slug: _s, moderationStatus: _m, viewCount: _v, detailCount: _d,
    whatsappCount: _w, createdAt: _c, updatedAt: _u, kind: _k, ...rest
  } = original;
  return rest;
};
