import {
  BriefcaseBusiness,
  Camera,
  ChevronsDown,
  ClipboardCheck,
  Cog,
  Droplets,
  FileText,
  Gauge,
  Grid2x2,
  Hammer,
  KeyRound,
  Layers,
  LayoutGrid,
  Music,
  Navigation,
  PaintBucket,
  Snowflake,
  Sparkles,
  SprayCan,
  Store,
  SunDim,
  Truck,
  UserRoundCheck,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * Como um anúncio de serviço é mostrado: categoria, modo de atendimento,
 * contato e mapa. Usado pela vitrine (/services) e pela página pública de
 * cada anúncio (/servicos/<slug>), que é um pacote à parte para abrir rápido
 * no 4G de quem tocou no link da bio — por isso isto não mora no Services.jsx.
 */

export const serviceCategories = [
  { value: "automotive-aesthetics", labelKey: "services.categories.automotiveAesthetics" },
  { value: "car-cleaning", labelKey: "services.categories.carCleaning" },
  { value: "mechanics", labelKey: "services.categories.mechanics" },
  { value: "body-paint", labelKey: "services.categories.bodyPaint" },
  { value: "electrical", labelKey: "services.categories.electrical" },
  { value: "tires-wheels", labelKey: "services.categories.tiresWheels" },
  { value: "tow", labelKey: "services.categories.tow" },
  { value: "sound-accessories", labelKey: "services.categories.soundAccessories" },
  { value: "inspection", labelKey: "services.categories.inspection" },
  { value: "consulting", labelKey: "services.categories.consulting" },
  // Categorias de 25/10/2026. O id é estável (fica gravado no anúncio e em
  // links); o texto é que muda por idioma. "other" fica sempre por último.
  { value: "vehicle-wrap", labelKey: "services.categories.vehicleWrap" },
  { value: "window-film-ppf", labelKey: "services.categories.windowFilmPpf" },
  { value: "polishing-detailing", labelKey: "services.categories.polishingDetailing" },
  { value: "paintless-dent-repair", labelKey: "services.categories.paintlessDentRepair" },
  { value: "performance-tuning", labelKey: "services.categories.performanceTuning" },
  { value: "suspension-lowering", labelKey: "services.categories.suspensionLowering" },
  { value: "air-conditioning", labelKey: "services.categories.airConditioning" },
  { value: "car-locksmith", labelKey: "services.categories.carLocksmith" },
  { value: "vehicle-paperwork", labelKey: "services.categories.vehiclePaperwork" },
  { value: "automotive-photo-video", labelKey: "services.categories.automotivePhotoVideo" },
  { value: "other", labelKey: "services.categories.other" },
];

const serviceCategoryByValue = Object.fromEntries(
  serviceCategories.map((category) => [category.value, category]),
);

const legacyCategoryMap = {
  "Estética automotiva": "automotive-aesthetics",
  "Limpeza de carros": "car-cleaning",
  Mecânica: "mechanics",
  "Funilaria e pintura": "body-paint",
  Elétrica: "electrical",
  "Pneus e rodas": "tires-wheels",
  Guincho: "tow",
  "Som e acessórios": "sound-accessories",
  Vistoria: "inspection",
  Consultoria: "consulting",
  Outro: "other",
};

export const normalizeServiceCategory = (category) =>
  serviceCategoryByValue[category] ? category : legacyCategoryMap[category] || "other";

export const getServiceCategoryLabel = (category, t) =>
  t(
    serviceCategoryByValue[normalizeServiceCategory(category)]?.labelKey ||
      "services.categories.other",
  );

export const modeLabelKeys = {
  place: "services.modes.place",
  mobile: "services.modes.mobile",
  hybrid: "services.modes.hybrid",
};

export const modeIcons = {
  place: Store,
  mobile: Navigation,
  hybrid: BriefcaseBusiness,
};

export const categoryIcons = {
  all: LayoutGrid,
  "automotive-aesthetics": Sparkles,
  "car-cleaning": Droplets,
  mechanics: Wrench,
  "body-paint": PaintBucket,
  electrical: Zap,
  "tires-wheels": Cog,
  tow: Truck,
  "sound-accessories": Music,
  inspection: ClipboardCheck,
  consulting: UserRoundCheck,
  "vehicle-wrap": Layers,
  "window-film-ppf": SunDim,
  "polishing-detailing": SprayCan,
  "paintless-dent-repair": Hammer,
  "performance-tuning": Gauge,
  "suspension-lowering": ChevronsDown,
  "air-conditioning": Snowflake,
  "car-locksmith": KeyRound,
  "vehicle-paperwork": FileText,
  "automotive-photo-video": Camera,
  other: Grid2x2,
};

export const fallbackPhoto =
  "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1100&q=80";

/** Iniciais do nome ("Estética do João" -> "ED"). */
export const getInitials = (name = "S") =>
  String(name || "S")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "S";

export const normalizeWhatsApp = (value = "") => String(value || "").replace(/\D/g, "");

/**
 * Link do WhatsApp com a mensagem pronta ("Vi seu serviço X no Engine").
 * Todo botão de WhatsApp de anúncio passa por aqui: o texto é o que prova
 * para o prestador, no próprio celular dele, que o cliente veio do Engine.
 * `t` resolve `services.whatsappMessage` no idioma de quem está chamando.
 */
export const getWhatsAppHref = (listing, t) => {
  const phone = normalizeWhatsApp(listing?.whatsapp);
  if (!phone) return undefined;
  const message = t("services.whatsappMessage", { title: listing.title || "" });
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

export const mapQuery = (listing) =>
  [listing.address, listing.city].filter(Boolean).join(", ");

export const hasMapAddress = (listing) => Boolean(mapQuery(listing));

export const getMapUrl = (listing) =>
  `https://www.google.com/maps?q=${encodeURIComponent(mapQuery(listing))}&output=embed`;

export const getDirectionsUrl = (listing) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(listing))}`;

/**
 * Devolve o id do vídeo quando o link é do YouTube.
 *
 * Só o YouTube é embutido: Instagram e TikTok exigem carregar script deles na
 * página, o que traz rastreamento de terceiro e uma dependência externa que
 * pode quebrar o anúncio. Para esses dois o link abre em aba nova.
 */
export const youtubeId = (url = "") => {
  const match = String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
  );
  return match?.[1] || "";
};
