import {
  BriefcaseBusiness,
  ClipboardCheck,
  Cog,
  Droplets,
  Grid2x2,
  LayoutGrid,
  Music,
  Navigation,
  PaintBucket,
  Sparkles,
  Store,
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
