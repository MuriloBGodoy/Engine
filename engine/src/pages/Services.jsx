import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  Gauge,
  Globe,
  ImagePlus,
  LayoutGrid,
  Mail,
  Map,
  MapPin,
  Maximize2,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Trash2,
  UserRoundCheck,
  Wrench,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { engineDB } from "../services/db";
import { uploadToStorage } from "../services/photos";
import {
  countries,
  getStates,
  getCities,
  getCountryName,
  getStateName,
  isCityInCountry,
} from "../services/locations";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { AdSlot } from "../components/AdSlot";
import { ServiceRatingBadge, ServiceReviews } from "../components/services/ServiceReviews";
import { useRegion } from "../hooks/RegionProvider";
import {
  categoryIcons,
  fallbackPhoto,
  getDirectionsUrl,
  getInitials,
  getServiceCategoryLabel,
  getWhatsAppHref,
  hasMapAddress,
  mapQuery,
  modeIcons,
  modeLabelKeys,
  normalizeServiceCategory,
  normalizeWhatsApp,
  serviceCategories,
} from "../services/serviceListingDisplay";
import { serviceListingPath } from "../services/serviceListingPublic";
import { MapPreview, PortfolioLinks, WhatsAppIcon } from "../components/services/ListingParts";
import { BioLinkCard, ShareListingButton } from "../components/services/ShareListing";
import { ListingMonthPanel } from "../components/services/ListingMonthPanel";

// Publicar serviço é grátis para sempre (decisão de 24/10/2026). O plano Pro
// vende as ferramentas em volta do anúncio, nunca o anúncio em si.
const MAX_PHOTOS = 6;
const PHOTO_UPLOAD_TIMEOUT_MS = 15000;
const FALLBACK_IMAGE_MAX_SIZE = 1100;
const FALLBACK_IMAGE_QUALITY = 0.72;
const SERVICE_ADMIN_EMAILS = (
  import.meta.env.VITE_SERVICE_ADMIN_EMAILS || "muxdtuber@gmail.com"
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const emptyForm = {
  id: "",
  title: "",
  providerName: "",
  category: "car-cleaning",
  description: "",
  price: "",
  serviceMode: "hybrid",
  country: "BR",
  state: "",
  city: "",
  address: "",
  serviceArea: "",
  whatsappCountry: "+55",
  whatsapp: "",
  email: "",
  website: "",
  instagram: "",
  tiktok: "",
  videoUrl: "",
  availability: "",
  experience: "",
  tags: "",
  photos: [],
  moderationStatus: "pending",
};

const modeFilterIcons = {
  all: LayoutGrid,
  hybrid: BriefcaseBusiness,
  mobile: Navigation,
  place: Store,
};

const modeCopyKeys = {
  place: "services.modeCopy.place",
  mobile: "services.modeCopy.mobile",
  hybrid: "services.modeCopy.hybrid",
};

const modeFilters = [
  { value:"all", labelKey:"services.filters.all" },
  { value:"hybrid", labelKey:"services.filters.hybrid" },
  { value:"mobile", labelKey:"services.filters.mobile" },
  { value:"place", labelKey:"services.filters.place" },
];

const statusLabelKeys = {
  approved: "services.status.approved",
  pending: "services.status.pending",
  changes_requested:"services.status.changesRequested",
  rejected: "services.status.rejected",
};

const phoneCountries = [
  { code:"+55", label:"BR" },
  { code:"+1", label:"US/CA" },
  { code:"+351", label:"PT" },
  { code:"+34", label:"ES" },
  { code:"+44", label:"UK" },
  { code:"+33", label:"FR" },
  { code:"+49", label:"DE" },
  { code:"+39", label:"IT" },
  { code:"+52", label:"MX" },
  { code:"+54", label:"AR" },
  { code:"+56", label:"CL" },
  { code:"+57", label:"CO" },
];

const inferPhoneCountry = (value = "") => {
  const cleanValue = String(value).replace(/\s/g,"");
  return (
    phoneCountries
      .map((country) => country.code)
      .sort((a, b) => b.length - a.length)
      .find((code) => cleanValue.startsWith(code)) || "+55"
  );
};

const stripPhoneCountry = (value ="", countryCode ="+55") => {
  const cleanCountry = countryCode.replace(/\D/g,"");
  const digits = String(value).replace(/\D/g,"");
  return digits.startsWith(cleanCountry) ? digits.slice(cleanCountry.length) : digits;
};

const formatPhoneInput = (value ="", countryCode ="+55") => {
  const digits = String(value).replace(/\D/g,"").slice(0, 14);

  if (countryCode === "+55") {
    const localDigits = stripPhoneCountry(digits, countryCode).slice(0, 11);
    const areaCode = localDigits.slice(0, 2);
    const firstPart = localDigits.length > 10
      ? localDigits.slice(2, 7)
      : localDigits.slice(2, 6);
    const secondPart = localDigits.length > 10
      ? localDigits.slice(7, 11)
      : localDigits.slice(6, 10);

    let formatted = "";
    if (areaCode) formatted += `(${areaCode}`;
    if (areaCode.length === 2) formatted += ") ";
    if (firstPart) formatted += firstPart;
    if (secondPart) formatted += `-${secondPart}`;
    return formatted;
  }

  if (countryCode === "+1") {
    const localDigits = stripPhoneCountry(digits, countryCode).slice(0, 10);
    const areaCode = localDigits.slice(0, 3);
    const firstPart = localDigits.slice(3, 6);
    const secondPart = localDigits.slice(6, 10);

    let formatted = "";
    if (areaCode) formatted += `(${areaCode}`;
    if (areaCode.length === 3) formatted += ") ";
    if (firstPart) formatted += firstPart;
    if (secondPart) formatted += `-${secondPart}`;
    return formatted;
  }

  return stripPhoneCountry(digits, countryCode)
    .replace(/(\d{3})(?=\d)/g, "$1 ")
    .trim();
};

const splitStoredPhone = (value ="", fallbackCountry ="+55") => {
  const cleanValue = String(value || "").trim();
  const countryCode = cleanValue.startsWith("+")
    ? inferPhoneCountry(cleanValue)
    : fallbackCountry;
  return {
    whatsappCountry: countryCode,
    whatsapp: formatPhoneInput(stripPhoneCountry(value, countryCode), countryCode),
  };
};

const formatCurrencyInput = (value = "") => {
  const digits = value.replace(/\D/g,"").slice(0, 9);
  if (!digits) return"";
  return Number(digits).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
};

const withUploadTimeout = (promise, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(
        () => reject(new Error(`${label} demorou demais para responder.`)),
        PHOTO_UPLOAD_TIMEOUT_MS,
      );
    }),
  ]);

const compressImageFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Imagem inválida."));
      image.onload = () => {
        const scale = Math.min(
          1,
          FALLBACK_IMAGE_MAX_SIZE / Math.max(image.width, image.height),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Não foi possível preparar a imagem."));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", FALLBACK_IMAGE_QUALITY));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

const getSellerProfile = (settings, user) => {
  const profile = settings?.profile || {};
  const displayName =
    profile.displayName ||
    user?.displayName ||
    String(user?.email || "").split("@")[0] ||
    "Usuario Engine";

  return {
    displayName,
    username: profile.username || "",
    country: profile.country || "BR",
    state: profile.state || "",
    city: profile.location || "",
    phone: profile.phone || "",
    avatar: profile.avatar || user?.photoURL || "",
    email: user?.email || "",
  };
};

const makeInitialForm = (settings, user) => {
  const seller = getSellerProfile(settings, user);
  return {
    ...emptyForm,
    providerName: seller.displayName,
    country: seller.country,
    state: seller.state,
    city: seller.city,
    ...splitStoredPhone(seller.phone),
    email: seller.email,
  };
};

function Field({ label, children, wide = false }) {
  return (
    <label className={`grid min-w-0 gap-2 ${wide ? "md:col-span-2" : ""}`}>
      <span className="text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className="min-h-12 w-full min-w-0 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 text-sm font-bold text-[var(--engine-text)] outline-none transition placeholder:text-[var(--engine-text-subtle)] focus:border-[var(--engine-accent)] focus:bg-[var(--engine-surface)] dark:text-white dark:[color-scheme:dark] dark:placeholder:text-[var(--engine-text-muted)] dark:focus:bg-[var(--engine-elevated)]"
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      className="min-h-32 w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3 text-sm font-bold leading-6 text-[var(--engine-text)] outline-none transition placeholder:text-[var(--engine-text-subtle)] focus:border-[var(--engine-accent)] focus:bg-[var(--engine-surface)] dark:text-white dark:[color-scheme:dark] dark:placeholder:text-[var(--engine-text-muted)] dark:focus:bg-[var(--engine-elevated)]"
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      className="min-h-12 w-full appearance-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 pr-9 text-sm font-bold text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)] focus:bg-[var(--engine-surface)] dark:text-white dark:[color-scheme:dark] dark:focus:bg-[var(--engine-elevated)]"
    />
  );
}

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const styles = {
    approved: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    pending: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    changes_requested:"border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300",
    rejected: "border-[var(--engine-accent)]/25 bg-[var(--engine-accent)]/10 text-[var(--engine-accent)]",
  };
  const Icon =
    status === "approved" ? CheckCircle2 : status === "rejected" ? XCircle : Clock;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
        styles[status] || styles.pending
      }`}
    >
      <Icon size={13} />
      {t(statusLabelKeys[status] || statusLabelKeys.pending)}
    </span>
  );
}

function ServiceCard({ listing, isMine, onEdit, onDelete, onOpen }) {
  const { t } = useTranslation();
  const ModeIcon = modeIcons[listing.serviceMode] || BriefcaseBusiness;
  const phone = normalizeWhatsApp(listing.whatsapp);
  const photos = listing.photos?.length ? listing.photos : [fallbackPhoto];
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const showMap = hasMapAddress(listing);
  const stopAction = (event) => event.stopPropagation();
  const activePhoto = photos[activePhotoIndex] || photos[0];
  const cardRef = useRef(null);

  // "Apareceu na busca": conta quando metade do card fica visível. O dono não
  // conta pra si mesmo, e o db já trava em uma vez por sessão.
  useEffect(() => {
    const node = cardRef.current;
    if (isMine || !listing.id || !node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          engineDB.trackServiceListingMetric(listing.id, "view", "search");
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isMine, listing.id]);

  // Sem efeito para zerar a foto: a lista monta cada card com `key` do
  // anúncio, então anúncio novo já nasce com a primeira foto.

  const movePhoto = (event, direction) => {
    stopAction(event);
    setActivePhotoIndex((current) =>
      (current + direction + photos.length) % photos.length,
    );
  };

  return (
    <article
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(listing)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(listing);
        }
      }}
      /* Sem altura travada: a linha da grade ja iguala os cards (o `stretch` do
         grid), e o `justify-between` la embaixo prende o rodape no fim. Com
         `h-[420px]` o conteudo nao cabia e o flex cobrava a diferenca da unica
         parte que podia encolher — a foto. */
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] transition hover:-translate-y-0.5 hover:border-[var(--engine-accent)]/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:shadow-none"
    >
      {/* `shrink-0`: sem ele a faixa de 160px media 120px num card e 96px no
          outro, conforme o texto de cada anuncio. Foto de tamanho diferente em
          cada card e o que fazia a grade parecer torta. */}
      <div className="relative h-[160px] shrink-0 overflow-hidden bg-[var(--engine-surface-2)] sm:h-[180px]">
        <img
          src={activePhoto}
          alt={listing.title}
          onError={(event) => {
            event.currentTarget.src = fallbackPhoto;
          }}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-[var(--engine-accent)] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
          {getServiceCategoryLabel(listing.category, t)}
        </span>
        {/* Compartilhar direto do card: é o gesto de quem achou um bom
            prestador e quer mandar para o amigo. Embaixo à direita, longe das
            setas e dos pontos das fotos. */}
        {listing.moderationStatus === "approved" && (
          <ShareListingButton
            listing={listing}
            variant="overlay"
            asOwner={isMine}
            source="card"
            className="absolute bottom-2 right-2 z-10"
          />
        )}
        {photos.length > 1 && (
          <>
            <div className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur">
              {activePhotoIndex + 1}/{photos.length}
            </div>
            <button
              type="button"
              onClick={(event) => movePhoto(event, -1)}
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white opacity-100 backdrop-blur transition hover:bg-[var(--engine-accent)] sm:left-3 sm:h-9 sm:w-9 sm:opacity-0 sm:group-hover:opacity-100"
              title={t("services.previousPhoto")}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={(event) => movePhoto(event, 1)}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white opacity-100 backdrop-blur transition hover:bg-[var(--engine-accent)] sm:right-3 sm:h-9 sm:w-9 sm:opacity-0 sm:group-hover:opacity-100"
              title={t("services.nextPhoto")}
            >
              <ChevronRight size={18} />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {photos.map((photo, index) => (
                <button
                  key={`${listing.id}-photo-dot-${photo}-${index}`}
                  type="button"
                  onClick={(event) => {
                    stopAction(event);
                    setActivePhotoIndex(index);
                  }}
                  /* O ponto continua com 6px de altura; quem cresce para 44px
                     é a área de toque em volta dele (o `span` é o desenho, o
                     `button` é o alvo). */
                  className="-my-[19px] flex h-11 items-center justify-center px-0.5"
                  title={t("services.viewPhoto", { value: index + 1 })}
                >
                  <span
                    aria-hidden="true"
                    className={`block h-1.5 rounded-full transition ${
                      index === activePhotoIndex ? "w-6 bg-white" : "w-1.5 bg-white/45"
                    }`}
                  />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3 p-3.5 sm:p-4">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-base font-extrabold italic leading-5 tracking-tight text-[var(--engine-text)] sm:text-lg sm:leading-6 dark:text-white">
                {listing.title}
              </h2>
              <p className="mt-1 truncate text-xs font-semibold text-[var(--engine-text-subtle)]">
                {listing.providerName || t("services.engineProfessional")}
              </p>
              <ServiceRatingBadge listing={listing} />
            </div>
            {isMine && (
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    stopAction(event);
                    onEdit(listing);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-accent)] hover:text-white sm:h-9 sm:w-9"
                  title={t("services.editListing")}
                  aria-label={t("services.editListing")}
                >
                  <Edit3 size={14} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    stopAction(event);
                    onDelete(listing);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-accent)] hover:text-white sm:h-9 sm:w-9"
                  title={t("services.deleteListing")}
                  aria-label={t("services.deleteListing")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          <p className="mt-2 line-clamp-2 text-xs font-medium leading-4 text-[var(--engine-text-muted)]">
            {listing.description}
          </p>
        </div>

        <div className="grid gap-2 text-xs font-semibold text-[var(--engine-text-muted)]">
          <div className="flex min-w-0 items-center gap-2">
            <ModeIcon className="shrink-0 text-[var(--engine-accent)]" size={15} />
            <span className="truncate">{t(modeLabelKeys[listing.serviceMode] || modeLabelKeys.hybrid)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="shrink-0 text-emerald-500" size={15} />
            <span className="truncate">
              {listing.city || listing.serviceArea || t("services.locationFallback")}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="shrink-0 text-amber-500" size={15} />
            <span className="truncate">{listing.availability || t("services.scheduleFallback")}</span>
          </div>
        </div>

        <div className="space-y-2.5 border-t border-[var(--engine-border)] pt-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-subtle)]">
              {t("services.priceLabel")}
            </span>
            <p className="text-sm font-black italic text-[var(--engine-accent)]">
              {listing.price || t("services.priceFallback")}
            </p>
          </div>

          {isMine && listing.moderationStatus && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-subtle)]">
                {t("services.statusLabel")}
              </span>
              <StatusBadge status={listing.moderationStatus} />
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(listing.tags || []).slice(0, 2).map((tag) => (
              <span
                key={`${listing.id}-${tag}`}
                className="rounded-full border border-[var(--engine-border)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1 sm:gap-2">
            <a
              href={getWhatsAppHref(listing, t)}
              onClick={(event) => {
                stopAction(event);
                if (phone && !isMine) engineDB.trackServiceListingMetric(listing.id, "whatsapp", "search");
              }}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!phone}
              aria-label={t("services.whatsapp")}
              className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg text-xs font-black transition sm:h-9 ${
                phone
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "pointer-events-none bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)]"
              }`}
              title={t("services.whatsapp")}
            >
              <WhatsAppIcon className="shrink-0" size={16} />
              <span className="hidden sm:inline">{t("services.cardActions.chat")}</span>
            </a>
            <a
              href={listing.email ? `mailto:${listing.email}?subject=${encodeURIComponent(t("services.emailSubject", { title: listing.title }))}` : undefined}
              onClick={stopAction}
              aria-disabled={!listing.email}
              aria-label={t("services.sendEmail")}
              className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg text-xs font-black transition sm:h-9 ${
                listing.email
                  ? "bg-[var(--engine-accent)] text-white hover:brightness-95"
                  : "pointer-events-none bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)]"
              }`}
              title={t("services.sendEmail")}
            >
              <Mail className="shrink-0" size={16} />
              <span className="hidden sm:inline">{t("services.cardActions.email")}</span>
            </a>
            <a
              href={showMap ? getDirectionsUrl(listing) : undefined}
              onClick={stopAction}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!showMap}
              aria-label={t("services.viewRoute")}
              className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg text-xs font-black transition sm:h-9 ${
                showMap
                  ? "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                  : "pointer-events-none bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)]"
              }`}
              title={t("services.viewRouteShort")}
            >
              <Map className="shrink-0" size={16} />
              <span className="hidden sm:inline">{t("services.cardActions.map")}</span>
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

function ServiceDetailModal({ listing, isMine, user, onClose, onEdit, onDelete }) {
  const { t } = useTranslation();
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Zerar foto, lightbox e zoom ao trocar de anúncio é feito remontando:
  // quem abre este modal passa `key` com o id do anúncio.

  if (!listing) return null;

  const ModeIcon = modeIcons[listing.serviceMode] || BriefcaseBusiness;
  const phone = normalizeWhatsApp(listing.whatsapp);
  const photos = listing.photos?.length ? listing.photos : [fallbackPhoto];
  const activePhoto = photos[activePhotoIndex] || photos[0];
  const showMap = hasMapAddress(listing);
  const movePhoto = (direction) => {
    setActivePhotoIndex((current) =>
      (current + direction + photos.length) % photos.length,
    );
    setZoom(1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <section className="h-[100dvh] w-full max-w-6xl overflow-y-auto rounded-none border-0 border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text)] shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:border dark:text-white">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--engine-border)] bg-[var(--engine-surface)]/95 px-3 py-3 backdrop-blur sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--engine-accent)]">
              {getServiceCategoryLabel(listing.category, t)}
            </p>
            <h2 className="mt-1 line-clamp-2 text-lg font-extrabold italic tracking-tight sm:truncate sm:text-2xl">
              {listing.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {listing.moderationStatus === "approved" && (
              <ShareListingButton listing={listing} variant="icon" asOwner={isMine} source="detalhe" />
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-accent)] hover:text-white"
              title={t("common.close")}
              aria-label={t("common.close")}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="grid gap-5 p-3 pb-28 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
          <div className="min-w-0 space-y-5">
            <div className="relative overflow-hidden rounded-xl bg-[var(--engine-surface-2)]">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="block w-full cursor-zoom-in"
                title={t("services.enlargePhoto")}
              >
                <img
                  src={activePhoto}
                  alt={listing.title}
                  onError={(event) => {
                    event.currentTarget.src = fallbackPhoto;
                  }}
                  className="aspect-[4/3] w-full object-cover sm:aspect-[16/9]"
                />
              </button>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/75 to-transparent" />
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-[var(--engine-accent)] sm:right-4 sm:top-4 sm:h-10 sm:w-10"
                title={t("services.openPreview")}
              >
                <Maximize2 size={18} />
              </button>
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => movePhoto(-1)}
                    className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-[var(--engine-accent)] sm:left-4"
                    title={t("services.previousPhoto")}
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePhoto(1)}
                    className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-[var(--engine-accent)] sm:right-4"
                    title={t("services.nextPhoto")}
                  >
                    <ChevronRight size={22} />
                  </button>
                  <div className="absolute bottom-4 right-4 rounded-full bg-black/65 px-3 py-1 text-xs font-black uppercase tracking-widest text-white backdrop-blur">
                    {activePhotoIndex + 1}/{photos.length}
                  </div>
                </>
              )}
            </div>

            {photos.length > 1 && (
              <div className="engine-chip-scroll -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
                {photos.map((photo, index) => (
                  <button
                    key={`${listing.id}-detail-photo-${photo}-${index}`}
                    type="button"
                    onClick={() => {
                      setActivePhotoIndex(index);
                      setZoom(1);
                    }}
                    className={`relative h-18 w-24 shrink-0 overflow-hidden rounded-lg border transition sm:h-24 sm:w-36 ${
                      index === activePhotoIndex
                        ? "border-[var(--engine-accent)] ring-2 ring-red-500/25"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                    title={t("services.viewPhoto", { value: index + 1 })}
                  >
                    <img
                      src={photo}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
                {t("services.description")}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm font-medium leading-7 text-[var(--engine-text-muted)]">
                {listing.description}
              </p>
            </div>

            {(listing.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {listing.tags.map((tag) => (
                  <span
                    key={`${listing.id}-detail-${tag}`}
                    className="rounded-full border border-[var(--engine-border)] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {showMap && <MapPreview listing={listing} />}
          </div>

          <aside className={`min-w-0 space-y-4 ${isMine ? "order-first lg:order-none" : ""}`}>
            {/* Para o dono, o topo do detalhe é o que ele mais usa: o link da
                bio e o retorno do mês. O resto é o anúncio como o cliente vê. */}
            {isMine && (
              <>
                <BioLinkCard listing={listing} />
                <ListingMonthPanel listing={listing} />
              </>
            )}

            <div className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] font-black italic text-white">
                  {getInitials(listing.providerName || listing.title)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold italic">
                    {listing.providerName || t("services.engineProfessional")}
                  </p>
                  <p className="mt-1 truncate text-xs font-medium text-[var(--engine-text-subtle)]">
                    {listing.city || t("services.online")}
                  </p>
                </div>
              </div>

              <p className="mt-5 text-2xl font-black italic text-[var(--engine-accent)]">
                {listing.price || t("services.quoteFallback")}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <InfoPill icon={ModeIcon} label={t("services.serviceMode")} value={t(modeLabelKeys[listing.serviceMode] || modeLabelKeys.hybrid)} tone="red" />
              <InfoPill icon={Clock} label={t("services.schedule")} value={listing.availability || t("services.toArrange")} tone="amber" />
              {listing.experience && (
                <InfoPill icon={Gauge} label={t("services.experience")} value={listing.experience} tone="sky" />
              )}
              <InfoPill icon={ShieldCheck} label={t("services.statusLabel")} value={t(statusLabelKeys[listing.moderationStatus] || statusLabelKeys.pending)} tone="emerald" />
            </div>

            <div className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
                {t("services.location")}
              </p>
              <p className="mt-2 flex items-start gap-2 text-sm font-black">
                <MapPin className="mt-0.5 shrink-0 text-[var(--engine-accent)]" size={17} />
                <span>
                  {mapQuery(listing) || listing.serviceArea || t("services.remoteFallback")}
                </span>
              </p>
            </div>

            <div className="grid gap-3">
              <ContactButton
                disabled={!phone}
                href={getWhatsAppHref(listing, t)}
                icon={WhatsAppIcon}
                label={t("services.whatsapp")}
                value={listing.whatsapp || t("services.noPhone")}
                onActivate={
                  isMine
                    ? undefined
                    : () => engineDB.trackServiceListingMetric(listing.id, "whatsapp", "search")
                }
              />
              <ContactButton
                disabled={!listing.email}
                href={listing.email ? `mailto:${listing.email}?subject=${encodeURIComponent(t("services.emailSubject", { title: listing.title }))}` : undefined}
                icon={Mail}
                label={t("services.sendEmail")}
                value={listing.email || t("services.noEmail")}
              />
              <ContactButton
                disabled={!showMap}
                href={showMap ? getDirectionsUrl(listing) : undefined}
                icon={Map}
                label={t("services.openMap")}
                value={showMap ? t("services.googleRoute") : t("services.noAddress")}
              />
            </div>

            <PortfolioLinks listing={listing} t={t} />

            {listing.moderationStatus === "approved" && (
              <ServiceReviews listing={listing} user={user} />
            )}

            {!isMine && listing.moderationStatus === "approved" && (
              <a
                href={serviceListingPath(listing)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:text-[var(--engine-accent)]"
              >
                <ExternalLink size={15} aria-hidden="true" />
                {t("services.share.openPage")}
              </a>
            )}

            {isMine && (
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onEdit(listing)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                >
                  <Edit3 size={16} />
                  {t("services.edit")}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(listing)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--engine-accent)]/30 text-xs font-black uppercase tracking-widest text-[var(--engine-accent)] transition hover:bg-[var(--engine-accent)] hover:text-white"
                >
                  <Trash2 className="shrink-0" size={18} />
                  {t("common.delete")}
                </button>
              </div>
            )}
          </aside>
        </div>
      </section>

      {lightboxOpen && (
        <PhotoLightbox
          listing={listing}
          photos={photos}
          activePhotoIndex={activePhotoIndex}
          zoom={zoom}
          onClose={() => {
            setLightboxOpen(false);
            setZoom(1);
          }}
          onMove={movePhoto}
          onZoomIn={() => setZoom((current) => Math.min(current + 0.25, 2.5))}
          onZoomOut={() => setZoom((current) => Math.max(current - 0.25, 1))}
          onResetZoom={() => setZoom(1)}
        />
      )}
    </div>
  );
}

function PhotoLightbox({
  listing,
  photos,
  activePhotoIndex,
  zoom,
  onClose,
  onMove,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) {
  const { t } = useTranslation();
  const activePhoto = photos[activePhotoIndex] || photos[0] || fallbackPhoto;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-3 sm:gap-4 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold italic">
            {listing.title}
          </p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-white/50">
            {t("services.photoCounter", {
              current: activePhotoIndex + 1,
              total: photos.length,
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onZoomOut}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--engine-surface)]/10 transition hover:bg-[var(--engine-surface)]/20"
            title={t("services.zoomOut")}
          >
            <ZoomOut size={18} />
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            className="hidden h-10 items-center justify-center rounded-full bg-[var(--engine-surface)]/10 px-4 text-[10px] font-black uppercase tracking-widest transition hover:bg-[var(--engine-surface)]/20 sm:flex"
            title={t("services.resetZoom")}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--engine-surface)]/10 transition hover:bg-[var(--engine-surface)]/20"
            title={t("services.zoomIn")}
          >
            <ZoomIn size={18} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--engine-accent)] transition hover:brightness-95"
            title={t("common.cancel")}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-4">
        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => onMove(-1)}
            className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--engine-surface)]/15 transition hover:bg-[var(--engine-accent)] sm:left-4 sm:h-12 sm:w-12"
            title={t("services.previousPhoto")}
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <img
          src={activePhoto}
          alt={listing.title}
          className="object-contain transition-[width,height] duration-200"
          style={{
            width: `${zoom * 100}%`,
            height: "auto",
            maxWidth: zoom === 1 ? "100%" : "none",
            maxHeight: zoom === 1 ? "100%" : "none",
          }}
        />
        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => onMove(1)}
            className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--engine-surface)]/15 transition hover:bg-[var(--engine-accent)] sm:right-4 sm:h-12 sm:w-12"
            title={t("services.nextPhoto")}
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>
  );
}

function InfoPill({ icon, label, value, tone }) {
  const Icon = icon;
  const tones = {
    red: "text-[var(--engine-accent)]",
    amber: "text-amber-500",
    sky: "text-sky-500",
    emerald: "text-emerald-500",
  };

  return (
    <div className="rounded-xl bg-[var(--engine-surface-2)] p-3">
      <Icon className={tones[tone]} size={18} />
      <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-[var(--engine-text)] dark:text-white">{value}</p>
    </div>
  );
}

function ContactButton({ href, icon, label, value, disabled, onActivate }) {
  const Icon = icon;
  const className = `flex min-h-14 items-center gap-3 rounded-xl px-4 transition ${
    disabled
      ? "cursor-not-allowed bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)]"
      : "bg-[var(--engine-accent)] text-white hover:brightness-95"
  }`;
  const content = (
    <>
      <Icon size={18} className="shrink-0" />
      <span className="min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-widest opacity-70">
          {label}
        </span>
        <span className="block truncate text-sm font-black">{value}</span>
      </span>
    </>
  );

  return disabled ? (
    <span className={className}>{content}</span>
  ) : (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      // Sem preventDefault: contabilizar não pode atrasar nem atrapalhar quem
      // está indo falar com o prestador.
      onClick={onActivate}
    >
      {content}
    </a>
  );
}

function ListingEditorModal({
  form,
  sellerProfile,
  saving,
  photoUploading,
  onSubmit,
  onChange,
  onPhotoUpload,
  onPhotoRemove,
  onCancel,
}) {
  const { t } = useTranslation();
  const needsAddress = ["place", "hybrid"].includes(form.serviceMode);
  const needsServiceArea = ["mobile", "hybrid"].includes(form.serviceMode);
  const formStates = getStates(form.country);
  const formCities = getCities(form.country, form.state);
  const cityListId = "listing-city-suggestions";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-0 backdrop-blur-sm sm:p-6">
      <form
        onSubmit={onSubmit}
        className="min-h-[100dvh] w-full max-w-5xl rounded-none border-0 border-[var(--engine-border)] bg-[var(--engine-surface)] shadow-2xl sm:my-4 sm:min-h-0 sm:rounded-2xl sm:border"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--engine-border)] bg-[var(--engine-surface)] p-4 sm:gap-4 sm:p-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--engine-accent)]">
              {form.id ? t("services.editListing") : t("services.createService")}
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white sm:text-xl">
              {t("services.myShowcase")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
              {t("services.editorCopy")}
            </p>
            <div className="mt-4 flex max-w-xl items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--engine-accent)] text-sm font-bold uppercase text-white">
                {sellerProfile?.avatar ? (
                  <img src={sellerProfile.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  getInitials(sellerProfile?.displayName)
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
                  {t("services.publishedAs")}
                </p>
                <p className="truncate text-sm font-bold italic text-[var(--engine-text)] dark:text-white">
                  {sellerProfile?.displayName || t("services.engineUser")}
                </p>
                <p className="truncate text-xs font-bold text-[var(--engine-text-muted)]">
                  {sellerProfile?.username || sellerProfile?.email || t("services.engineAccount")}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-accent)] hover:text-white"
            title={t("services.closeEditor")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-5 p-4 pb-28 sm:p-6 md:grid-cols-2">
          <Field label={t("services.fields.photos")} wide>
            <div className="grid gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
              {(form.photos || []).map((photo) => (
                <div key={photo} className="relative overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)]">
                  <img src={photo} alt="" className="h-36 w-full object-cover sm:h-32" />
                  <button
                    type="button"
                    onClick={() => onPhotoRemove(photo)}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-[var(--engine-accent)]"
                    title={t("services.removePhoto")}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              {(form.photos || []).length < MAX_PHOTOS && (
                <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4 text-center transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]">
                  {photoUploading ? (
                    <Wrench className="mb-2 animate-spin text-[var(--engine-accent)]" size={24} />
                  ) : (
                    <ImagePlus className="mb-2 text-[var(--engine-accent)]" size={24} />
                  )}
                  <span className="text-xs font-black uppercase tracking-widest">
                    {photoUploading ? t("services.uploadingPhoto") : t("services.addPhoto")}
                  </span>
                  <span className="mt-1 text-[11px] font-bold text-[var(--engine-text-subtle)]">
                    {t("services.maxImages", { value: MAX_PHOTOS })}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={photoUploading}
                    onChange={onPhotoUpload}
                  />
                </label>
              )}
            </div>
          </Field>

          <Field label={t("services.fields.title")} wide>
            <TextInput
              value={form.title}
              onChange={(event) => onChange("title", event.target.value)}
              id="svc-title"
              placeholder={t("services.placeholders.title")}
            />
          </Field>
          <Field label={t("services.fields.providerName")}>
            <TextInput
              value={form.providerName}
              onChange={(event) => onChange("providerName", event.target.value)}
              placeholder={t("services.placeholders.providerName")}
            />
          </Field>
          <Field label={t("services.fields.category")}>
            <Select
              value={normalizeServiceCategory(form.category)}
              onChange={(event) => onChange("category", event.target.value)}
            >
              {serviceCategories.map((item) => (
                <option key={item.value} value={item.value}>{t(item.labelKey)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("services.fields.description")} wide>
            <TextArea
              value={form.description}
              onChange={(event) => onChange("description", event.target.value)}
              id="svc-description"
              placeholder={t("services.placeholders.description")}
            />
          </Field>

          <Field label={t("services.fields.serviceMode")} wide>
            <div className="grid gap-2 min-[520px]:grid-cols-3">
              {["hybrid", "mobile", "place"].map((item) => {
                const Icon = modeIcons[item];
                const active = form.serviceMode === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onChange("serviceMode", item)}
                    className={`min-h-20 rounded-xl border p-3 text-left transition sm:min-h-24 ${
                      active
                        ? "border-[var(--engine-accent)] bg-[var(--engine-accent)] text-white"
                        : "border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                    }`}
                  >
                    <Icon size={18} />
                    <span className="mt-2 block text-xs font-black uppercase tracking-widest">
                      {t(modeLabelKeys[item])}
                    </span>
                    <span className="mt-1 block text-[11px] font-bold leading-4 opacity-75">
                      {t(modeCopyKeys[item])}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t("services.fields.country")}>
            <Select
              value={form.country || "BR"}
              onChange={(event) => {
                onChange("country", event.target.value);
                onChange("state", "");
                onChange("city", "");
              }}
            >
              {countries.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("services.fields.state")}>
            <Select
              value={form.state || ""}
              onChange={(event) => {
                onChange("state", event.target.value);
                onChange("city", "");
              }}
              disabled={!formStates.length}
            >
              <option value="">
                {formStates.length
                  ? t("services.placeholders.state")
                  : t("services.placeholders.stateUnavailable")}
              </option>
              {formStates.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("services.fields.city")}>
            <TextInput
              value={form.city}
              onChange={(event) => onChange("city", event.target.value)}
              placeholder={t("services.placeholders.city")}
              list={formCities.length ? cityListId : undefined}
            />
            {formCities.length > 0 && (
              <datalist id={cityListId}>
                {formCities.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            )}
          </Field>
          {needsAddress && (
            <Field label={t("services.fields.address")}>
              <TextInput
                value={form.address}
                onChange={(event) => onChange("address", event.target.value)}
                id="svc-address"
              placeholder={t("services.placeholders.address")}
              />
            </Field>
          )}
          {needsServiceArea && (
            <Field label={t("services.fields.serviceArea")} wide={!needsAddress}>
              <TextInput
                value={form.serviceArea}
                onChange={(event) => onChange("serviceArea", event.target.value)}
                id="svc-service-area"
              placeholder={t("services.placeholders.serviceArea")}
              />
            </Field>
          )}

          {needsAddress && hasMapAddress(form) && (
            <div className="md:col-span-2">
              <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
                {t("services.mapPreview")}
              </p>
              <MapPreview listing={form} />
            </div>
          )}

          <Field label={t("services.fields.whatsapp")}>
            <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
              <Select
                value={form.whatsappCountry || "+55"}
                onChange={(event) => {
                  onChange("whatsappCountry", event.target.value);
                  onChange("whatsapp", formatPhoneInput(form.whatsapp, event.target.value));
                }}
                aria-label={t("services.countryCode")}
              >
                {phoneCountries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.label} {country.code}
                  </option>
                ))}
              </Select>
              <TextInput
                value={form.whatsapp}
                onChange={(event) =>
                  onChange(
                    "whatsapp",
                    formatPhoneInput(event.target.value, form.whatsappCountry),
                  )
                }
                placeholder={form.whatsappCountry === "+1" ? "(555) 123-4567" : "(11) 99999-9999"}
                inputMode="tel"
              />
            </div>
          </Field>
          <Field label={t("common.email")}>
            <TextInput
              type="email"
              value={form.email}
              onChange={(event) => onChange("email", event.target.value)}
              placeholder="contato@email.com"
            />
          </Field>
          <Field label={t("services.fields.price")}>
            <TextInput
              value={form.price}
              onChange={(event) => onChange("price", formatCurrencyInput(event.target.value))}
              placeholder={t("services.placeholders.price")}
              inputMode="numeric"
            />
          </Field>
          <Field label={t("services.fields.availability")}>
            <TextInput
              value={form.availability}
              onChange={(event) => onChange("availability", event.target.value)}
              placeholder={t("services.placeholders.availability")}
            />
          </Field>
          <Field label={t("services.fields.experience")} wide>
            <TextInput
              value={form.experience}
              onChange={(event) => onChange("experience", event.target.value)}
              placeholder={t("services.placeholders.experience")}
            />
          </Field>

          {/* Portfólio: pra quem se divulga em rede social, o perfil é o site.
              O campo aceita colar a URL inteira e guarda só o @. */}
          <Field label={t("services.fields.instagram")}>
            <TextInput
              value={form.instagram}
              onChange={(event) => onChange("instagram", event.target.value)}
              placeholder={t("services.placeholders.instagram")}
            />
          </Field>
          <Field label={t("services.fields.tiktok")}>
            <TextInput
              value={form.tiktok}
              onChange={(event) => onChange("tiktok", event.target.value)}
              placeholder={t("services.placeholders.tiktok")}
            />
          </Field>
          <Field label={t("services.fields.videoUrl")} wide>
            <TextInput
              value={form.videoUrl}
              onChange={(event) => onChange("videoUrl", event.target.value)}
              placeholder={t("services.placeholders.videoUrl")}
            />
            <p className="mt-1.5 text-[11px] text-[var(--engine-text-muted)]">
              {t("services.hints.videoUrl")}
            </p>
          </Field>
          <Field label={t("services.fields.tags")} wide>
            <TextInput
              value={form.tags}
              onChange={(event) => onChange("tags", event.target.value)}
              placeholder={t("services.placeholders.tags")}
            />
          </Field>
        </div>

        <div className="engine-safe-bottom flex flex-col gap-3 border-t border-[var(--engine-border)] p-5 sm:flex-row sm:p-6">
          <button
            type="submit"
            disabled={saving || photoUploading}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-sm font-bold uppercase text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Wrench className="animate-spin" size={18} /> : <Plus size={18} />}
            {saving ? t("services.sending") : t("services.submitForApproval")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--engine-border)] px-5 text-sm font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
          >
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function SellerProfileModal({
  sellerProfile,
  listings,
  onClose,
  onEditProfile,
  onNewListing,
}) {
  const { t } = useTranslation();
  if (!sellerProfile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <section className="w-full max-w-lg rounded-t-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5 text-[var(--engine-text)] shadow-2xl dark:text-white sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--engine-accent)] text-lg font-bold uppercase text-white">
              {sellerProfile.avatar ? (
                <img src={sellerProfile.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                getInitials(sellerProfile.displayName)
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--engine-accent)]">
                {t("services.sellerAccount")}
              </p>
              <h2 className="mt-1 truncate text-lg font-extrabold tracking-tight">
                {t("services.sellerProfile")}
              </h2>
              <p className="mt-1 truncate text-xs font-bold text-[var(--engine-text-muted)]">
                {sellerProfile.displayName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-accent)] hover:text-white"
            title={t("common.cancel")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
              {t("services.account")}
            </span>
            <span className="min-w-0 truncate text-xs font-bold text-[var(--engine-text-muted)]">
              {sellerProfile.username || sellerProfile.email || "Engine"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
              {t("services.fields.city")}
            </span>
            <span className="min-w-0 truncate text-xs font-bold text-[var(--engine-text-muted)]">
              {sellerProfile.city || t("services.addInProfile")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
              {t("services.statusLabel")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
              <ShieldCheck size={12} />
              {listings.length ? t("services.activeSeller") : t("services.ready")}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onEditProfile}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-xs font-black uppercase tracking-widest text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] dark:text-white"
          >
            <UserRoundCheck size={16} />
            {t("services.editProfile")}
          </button>
          <button
            type="button"
            onClick={onNewListing}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-xs font-bold uppercase text-white transition hover:brightness-95"
          >
            <Plus size={16} />
            {t("services.newService")}
          </button>
        </div>
      </section>
    </div>
  );
}

function SellerListingsModal({ listings, onClose, onOpen, onEdit, onDelete, onNewListing }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const cleanSearch = search.trim().toLowerCase();
  const filtered = listings.filter((listing) =>
    [
      listing.title,
      getServiceCategoryLabel(listing.category, t),
      listing.providerName,
      listing.city,
      t(statusLabelKeys[listing.moderationStatus] || statusLabelKeys.pending),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(cleanSearch),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <section className="flex h-[88dvh] w-full max-w-2xl flex-col rounded-t-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text)] shadow-2xl dark:text-white sm:h-auto sm:max-h-[82vh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--engine-border)] p-5 sm:p-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--engine-accent)]">
              {t("services.sellerShowcase")}
            </p>
            <h2 className="mt-1 truncate text-lg font-extrabold tracking-tight">
              {t("services.myListings")}
            </h2>
            <p className="mt-2 text-sm font-medium text-[var(--engine-text-muted)]">
              {listings.length === 1
                ? t("services.oneListing")
                : listings.length
                  ? t("services.listingCount", { value: listings.length })
                  : t("services.noListingsRegistered")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-accent)] hover:text-white"
            title={t("common.cancel")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-[var(--engine-border)] p-4 sm:p-5">
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4">
            <Search size={17} className="text-[var(--engine-text-subtle)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("services.searchMyListings")}
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--engine-text)] outline-none placeholder:text-[var(--engine-text-subtle)] dark:text-white dark:placeholder:text-[var(--engine-text-muted)]"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {filtered.length ? (
            <div className="grid gap-3">
              {filtered.map((listing) => (
                <article
                  key={listing.id}
                  className="grid gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center"
                >
                  <img
                    src={listing.photos?.[0] || fallbackPhoto}
                    alt=""
                    className="h-24 w-full rounded-lg object-cover sm:h-16 sm:w-[72px]"
                    onError={(event) => {
                      event.currentTarget.src = fallbackPhoto;
                    }}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={listing.moderationStatus} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
                        {getServiceCategoryLabel(listing.category, t)}
                      </span>
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-sm font-bold italic">
                      {listing.title || t("services.untitledListing")}
                    </h3>
                    <p className="mt-1 truncate text-xs font-bold text-[var(--engine-text-muted)]">
                      {listing.price || t("services.priceFallback")} / {listing.city || t("services.locationFallback")}
                    </p>
                    {listing.moderationNote && (
                      <p className="mt-2 line-clamp-2 rounded-lg bg-[var(--engine-accent)]/10 px-3 py-2 text-xs font-bold leading-5 text-[var(--engine-accent)]">
                        {listing.moderationNote}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:w-36 sm:grid-cols-1">
                    {/* "Seu mês" e o link moram no detalhe do anúncio: abrir
                        é o caminho mais curto até os dois. */}
                    <button
                      type="button"
                      onClick={() => onOpen(listing)}
                      className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--engine-accent)] px-3 text-xs font-black uppercase tracking-widest text-white transition hover:brightness-95 sm:col-span-1"
                    >
                      <BarChart3 size={15} aria-hidden="true" />
                      {listing.moderationStatus === "approved"
                        ? t("services.month.openShort")
                        : t("services.share.viewListing")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(listing)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--engine-border)] px-3 text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                    >
                      <Edit3 size={15} />
                      {t("services.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(listing)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--engine-border)] px-3 text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                    >
                      <Trash2 className="shrink-0" size={17} />
                      {t("common.delete")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--engine-border)] p-6 text-center">
              <BriefcaseBusiness className="mb-3 text-[var(--engine-accent)]" size={34} />
              <h3 className="text-lg font-extrabold italic">
                {t("services.noListingsHere")}
              </h3>
              <p className="mt-2 max-w-xs text-sm font-medium text-[var(--engine-text-muted)]">
                {listings.length ? t("services.tryAnotherSearch") : t("services.createFirstListing")}
              </p>
            </div>
          )}
        </div>

        <div className="engine-safe-bottom border-t border-[var(--engine-border)] p-4 sm:p-5">
          <button
            type="button"
            onClick={onNewListing}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold uppercase text-white transition hover:brightness-95"
          >
            <Plus size={18} />
            {t("services.createService")}
          </button>
        </div>
      </section>
    </div>
  );
}

function ApprovalQueue({ listings, onApprove, onReturn, onReject, onEdit }) {
  const { t } = useTranslation();
  const pending = listings.filter((listing) => listing.moderationStatus === "pending");
  const reviewed = listings
    .filter((listing) =>
      ["approved", "changes_requested", "rejected"].includes(listing.moderationStatus),
    )
    .slice(0, 8);

  if (!pending.length && !reviewed.length) {
    return (
      <section className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--engine-text)] dark:text-white">
          <ShieldCheck size={18} className="text-emerald-500" />
          {t("services.approvalTitle")}
        </h2>
        <p className="mt-3 text-sm font-medium text-[var(--engine-text-muted)]">
          {t("services.noPendingApprovals")}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 dark:bg-amber-500/5 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--engine-text)] dark:text-white">
        <ShieldCheck size={18} className="text-amber-500" />
        {t("services.approvalTitle")}
      </h2>
      <div className="mt-4 grid gap-3">
        {pending.map((listing) => (
          <div
            key={listing.id}
            className="grid gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3 sm:p-4 md:grid-cols-[1fr_auto]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold italic text-[var(--engine-text)] dark:text-white">
                {listing.title}
              </p>
              <p className="mt-1 line-clamp-2 text-xs font-medium text-[var(--engine-text-subtle)] sm:truncate">
                {listing.providerName} · {getServiceCategoryLabel(listing.category, t)} · {listing.city || t("services.noCity")}
              </p>
              <p className="mt-2 line-clamp-2 text-sm font-medium text-[var(--engine-text-muted)]">
                {listing.description}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap md:justify-end">
              <button
                type="button"
                onClick={() => onEdit(listing)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] px-3 text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
              >
                <Edit3 size={15} />
                {t("services.review")}
              </button>
              <button
                type="button"
                onClick={() => onReturn(listing)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-sky-700"
              >
                <RotateCcw size={15} />
                {t("services.return")}
              </button>
              <button
                type="button"
                onClick={() => onReject(listing)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-3 text-xs font-black uppercase tracking-widest text-white transition hover:brightness-95"
              >
                <XCircle size={15} />
                {t("services.reject")}
              </button>
              <button
                type="button"
                onClick={() => onApprove(listing)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-emerald-700"
              >
                <CheckCircle2 size={15} />
                {t("services.approve")}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-amber-500/20 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--engine-text-muted)]">
            {t("services.approvalHistory")}
          </p>
          <span className="rounded-full bg-[var(--engine-accent)]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)] dark:bg-[var(--engine-surface)]/10">
            {t("services.recordCount", { count: reviewed.length })}
          </span>
        </div>
        {reviewed.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {reviewed.map((listing) => (
              <article
                key={listing.id}
                className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={listing.moderationStatus} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
                    {getServiceCategoryLabel(listing.category, t)}
                  </span>
                </div>
                <h3 className="mt-2 line-clamp-2 text-sm font-bold italic text-[var(--engine-text)] dark:text-white">
                  {listing.title || t("services.untitledListing")}
                </h3>
                <p className="mt-1 truncate text-xs font-medium text-[var(--engine-text-muted)]">
                  {listing.providerName} · {listing.city || t("services.noCity")}
                </p>
                {listing.moderationNote && (
                  <p className="mt-3 rounded-lg bg-[var(--engine-surface-2)] px-3 py-2 text-xs font-bold leading-5 text-[var(--engine-text-muted)]">
                    {listing.moderationNote}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4">
            <p className="text-sm font-bold text-[var(--engine-text-muted)]">
              {t("services.approvalHistoryEmpty")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function RejectionModal({ listing, note, action, onChangeNote, onCancel, onConfirm }) {
  const { t } = useTranslation();
  if (!listing) return null;
  const isReject = action === "rejected";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section className="max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5 pb-8 shadow-2xl sm:max-h-[92vh] sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--engine-accent)]">
              {t("services.feedbackTitle")}
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">
              {isReject ? t("services.rejectListing") : t("services.returnAdjustments")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-accent)] hover:text-white"
            title={t("common.cancel")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4">
          <p className="truncate text-sm font-bold text-[var(--engine-text)] dark:text-white">
            {listing.title}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
            {listing.providerName} / {getServiceCategoryLabel(listing.category, t)}
          </p>
        </div>

        <label className="mt-5 grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
            {t("services.feedbackReason")}
          </span>
          <textarea
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
            placeholder={t("services.feedbackPlaceholder")}
            className="min-h-36 w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3 text-sm font-bold leading-6 text-[var(--engine-text)] outline-none transition placeholder:text-[var(--engine-text-subtle)] focus:border-[var(--engine-accent)] focus:bg-[var(--engine-surface)] dark:text-white dark:[color-scheme:dark] dark:placeholder:text-[var(--engine-text-muted)] dark:focus:bg-[var(--engine-elevated)]"
          />
        </label>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold uppercase text-white transition ${
              isReject ? "bg-[var(--engine-accent)] hover:brightness-95" : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {isReject ? <XCircle size={18} /> : <RotateCcw size={18} />}
            {isReject ? t("services.rejectListing") : t("services.returnWithChanges")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--engine-border)] px-5 text-sm font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
          >
            {t("common.cancel")}
          </button>
        </div>
      </section>
    </div>
  );
}

export function Services({ user, settings }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [mode, setMode] = useState("all");
  // A região ativa (header) semeia o filtro de localização dos Serviços: ao
  // abrir, já vem pré-filtrado pela região do usuário. Depois ele pode mexer
  // livremente nos selects — a região só define o ponto de partida.
  const { region } = useRegion();
  const [countryFilter, setCountryFilter] = useState(() => region.country);
  const [stateFilter, setStateFilter] = useState(() => region.state);
  const [cityFilter, setCityFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [form, setForm] = useState(() => makeInitialForm(settings, user));
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [rejectionTarget, setRejectionTarget] = useState(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [moderationAction, setModerationAction] = useState("changes_requested");
  const [detailListing, setDetailListing] = useState(null);
  const [sellerProfileOpen, setSellerProfileOpen] = useState(false);
  const [sellerListingsOpen, setSellerListingsOpen] = useState(false);
  const isAdmin = SERVICE_ADMIN_EMAILS.includes(String(user?.email || "").toLowerCase());
  const sellerProfile = useMemo(
    () => getSellerProfile(settings, user),
    [settings, user],
  );

  useEffect(
    () => engineDB.subscribeServiceListings(setListings, { userId: user?.uid, isAdmin }),
    [isAdmin, user?.uid],
  );

  const myListings = useMemo(
    () => listings.filter((listing) => listing.ownerId === user?.uid),
    [listings, user?.uid],
  );
  // O link da bio fica à mão na vitrine: o anúncio aprovado mais recente.
  const myBioListing = useMemo(
    () => myListings.find((listing) => listing.moderationStatus === "approved") || null,
    [myListings],
  );
  const pendingApprovalsCount = useMemo(
    () => listings.filter((listing) => listing.moderationStatus === "pending").length,
    [listings],
  );

  const approvedListings = useMemo(
    () => listings.filter((listing) => listing.moderationStatus === "approved"),
    [listings],
  );

  // Opções de país presentes nos anúncios aprovados (rótulos via dataset).
  const countryOptions = useMemo(() => {
    const codes = new Set(
      approvedListings.map((listing) => listing.country?.trim()).filter(Boolean),
    );
    return Array.from(codes)
      .map((code) => ({ code, name: getCountryName(code) || code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [approvedListings]);

  // Estados presentes, respeitando o país selecionado.
  const stateOptions = useMemo(() => {
    const codes = new Set(
      approvedListings
        .filter(
          (listing) =>
            countryFilter === "all" ||
            !listing.country ||
            listing.country === countryFilter,
        )
        .map((listing) => listing.state?.trim())
        .filter(Boolean),
    );
    return Array.from(codes)
      .map((code) => ({
        code,
        name:
          getStateName(countryFilter === "all" ? "" : countryFilter, code) || code,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [approvedListings, countryFilter]);

  // Cidades presentes, respeitando país + estado selecionados.
  const cityOptions = useMemo(() => {
    const cities = new Set(
      approvedListings
        .filter(
          (listing) =>
            (countryFilter === "all" ||
              !listing.country ||
              listing.country === countryFilter) &&
            (stateFilter === "all" ||
              !listing.state ||
              listing.state === stateFilter),
        )
        .map((listing) => listing.city?.trim())
        .filter(Boolean),
    );
    return Array.from(cities).sort((a, b) => a.localeCompare(b));
  }, [approvedListings, countryFilter, stateFilter]);

  const stats = useMemo(() => {
    const mobileCount = approvedListings.filter((listing) =>
      ["mobile", "hybrid"].includes(listing.serviceMode),
    ).length;
    const cities = new Set(
      approvedListings.map((listing) => listing.city?.trim()).filter(Boolean),
    );
    return {
      total: approvedListings.length,
      mobileCount,
      cities: cities.size,
    };
  }, [approvedListings]);

  const filteredListings = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return approvedListings.filter((listing) => {
      const normalizedCategory = normalizeServiceCategory(listing.category);
      const matchesCategory = category === "all" || normalizedCategory === category;
      const matchesMode = mode === "all" || listing.serviceMode === mode;
      const matchesCountry =
        countryFilter === "all" ||
        !listing.country ||
        listing.country === countryFilter;
      const matchesState =
        stateFilter === "all" || !listing.state || listing.state === stateFilter;
      const matchesCity =
        cityFilter === "all" || (listing.city?.trim() || "") === cityFilter;
      const text = [
        listing.title,
        listing.providerName,
        getServiceCategoryLabel(listing.category, t),
        listing.description,
        listing.city,
        listing.serviceArea,
        ...(listing.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      return (
        matchesCategory &&
        matchesMode &&
        matchesCountry &&
        matchesState &&
        matchesCity &&
        (!cleanQuery || text.includes(cleanQuery))
      );
    });
  }, [approvedListings, category, mode, countryFilter, stateFilter, cityFilter, query, t]);

  const activeFilterCount =
    (category !== "all" ? 1 : 0) +
    (mode !== "all" ? 1 : 0) +
    (countryFilter !== "all" ? 1 : 0) +
    (stateFilter !== "all" ? 1 : 0) +
    (cityFilter !== "all" ? 1 : 0);

  const clearFilters = () => {
    setCategory("all");
    setMode("all");
    setCountryFilter("all");
    setStateFilter("all");
    setCityFilter("all");
    setQuery("");
  };

  const flash = (message) => toast(message);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(makeInitialForm(settings, user));
  };

  /**
   * Abrir o anúncio conta como interesse — o dono não conta pra si mesmo,
   * senão a métrica vira o próprio prestador conferindo o anúncio.
   */
  const openDetail = (listing) => {
    setDetailListing(listing);
    if (listing?.id && listing.ownerId !== user?.uid) {
      engineDB.trackServiceListingMetric(listing.id, "detail", "search");
    }
  };

  const openEditor = (listing = null) => {
    setDetailListing(null);
    if (listing) {
      setForm({
        ...emptyForm,
        ...listing,
        country: listing.country || sellerProfile.country || "BR",
        state: listing.state || sellerProfile.state || "",
        ...splitStoredPhone(listing.whatsapp, listing.whatsappCountry),
        tags: (listing.tags || []).join(", "),
        photos: listing.photos || [],
      });
    } else {
      resetForm();
    }
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    resetForm();
  };

  const uploadPhotos = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (!user?.uid) {
      flash(t("services.flash.signInAgain"));
      return;
    }

    const remainingSlots = MAX_PHOTOS - (form.photos || []).length;
    const selectedFiles = files.slice(0, remainingSlots);
    if (!selectedFiles.length) {
      flash(t("services.flash.photoLimit", { value: MAX_PHOTOS }));
      return;
    }

    setPhotoUploading(true);
    try {
      const uploads = await Promise.all(
        selectedFiles.map(async (file) => {
          if (!file.type.startsWith("image/")) {
            throw new Error(t("services.flash.invalidFile"));
          }
          if (file.size > 6 * 1024 * 1024) {
            throw new Error(t("services.flash.maxPhotoSize"));
          }
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
          const path = `users/${user.uid}/services/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
          try {
            const url = await withUploadTimeout(
              uploadToStorage(path, file, file.type),
              t("services.flash.photoUpload"),
            );
            return { url, fallback: false };
          } catch (error) {
            console.warn("Storage indisponível. Usando fallback comprimido.", error);
            return {
              url: await compressImageFile(file),
              fallback: true,
            };
          }
        }),
      );
      const urls = uploads.map((item) => item.url);
      setForm((current) => ({
        ...current,
        photos: [...(current.photos || []), ...urls].slice(0, MAX_PHOTOS),
      }));
      flash(
        uploads.some((item) => item.fallback)
          ? t("services.flash.compressedPhoto")
          : t("services.flash.photoAdded"),
      );
    } catch (error) {
      console.error(error);
      flash(error.message || t("services.flash.photoUploadError"));
    } finally {
      setPhotoUploading(false);
    }
  };

  const removePhoto = (photo) => {
    setForm((current) => ({
      ...current,
      photos: (current.photos || []).filter((item) => item !== photo),
    }));
  };

  const submitListing = async (event) => {
    event.preventDefault();
    // O aviso é um toast no topo, e o formulário é longo: no celular a pessoa
    // está lá embaixo, no botão. Além de avisar, leva até o campo que falta.
    const faltando = (id, mensagem) => {
      flash(mensagem);
      const campo = document.getElementById(id);
      campo?.scrollIntoView({ block: "center", behavior: "smooth" });
      campo?.focus({ preventScroll: true });
    };
    if (!form.title.trim() || !form.description.trim()) {
      faltando(form.title.trim() ? "svc-description" : "svc-title", t("services.flash.titleDescriptionRequired"));
      return;
    }
    if (["place", "hybrid"].includes(form.serviceMode) && !form.address.trim()) {
      faltando("svc-address", t("services.flash.addressRequired"));
      return;
    }
    if (["mobile", "hybrid"].includes(form.serviceMode) && !form.serviceArea.trim()) {
      faltando("svc-service-area", t("services.flash.areaRequired"));
      return;
    }
    if (form.city.trim() && !isCityInCountry(form.country, form.city)) {
      flash(t("services.flash.cityCountryMismatch"));
      return;
    }

    setSaving(true);
    try {
      await engineDB.saveServiceListing(
        { ...form, category: normalizeServiceCategory(form.category) },
        settings,
        user?.uid,
        { isAdmin },
      );
      flash(t("services.flash.sentForApproval"));
      closeEditor();
    } catch (error) {
      console.error(error);
      flash(error?.message || t("settings.status.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const deleteListing = async (listing) => {
    const ok = await confirm({
      title: t("services.flash.deleteTitle"),
      message: t("services.flash.deleteConfirm", { title: listing.title }),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await engineDB.deleteServiceListing(listing.id, user?.uid);
      flash(t("services.flash.removed"));
      if (detailListing?.id === listing.id) setDetailListing(null);
      if (form.id === listing.id) closeEditor();
    } catch (error) {
      console.error(error);
      flash(t("services.flash.removeError"));
    }
  };

  const confirmRejectListing = async () => {
    if (!rejectionTarget) return;
    if (!rejectionNote.trim()) {
      flash(t("services.flash.feedbackRequired"));
      return;
    }
    try {
      await engineDB.moderateServiceListing(
        rejectionTarget.id,
        moderationAction,
        rejectionNote,
        user?.uid,
      );
      flash(
        moderationAction === "changes_requested"
          ? t("services.flash.returned")
          : t("services.flash.rejected"),
      );
      setRejectionTarget(null);
      setRejectionNote("");
      setModerationAction("changes_requested");
    } catch (error) {
      console.error(error);
      flash(t("services.flash.rejectError"));
    }
  };

  return (
    <section className="space-y-5 pb-28 sm:space-y-8 sm:pb-10">

      <header className="-mx-4 overflow-hidden border-y border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text)] shadow-none sm:mx-0 sm:rounded-2xl sm:border sm:shadow-xl dark:text-white dark:shadow-none">
        <div className="grid gap-6 p-5 sm:gap-8 sm:p-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-10">
          <div className="flex flex-col justify-between gap-6 sm:gap-8">
            <div>
              <h1 className="max-w-4xl text-2xl font-extrabold uppercase italic leading-tight tracking-tight sm:text-3xl">
                {t("services.title")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
                {t("services.subtitle")}
              </p>
            </div>

            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
              <HeroStat icon={BriefcaseBusiness} label={t("services.stats.active")} value={stats.total} tone="red" />
              <HeroStat icon={Navigation} label={t("services.stats.mobile")} value={stats.mobileCount} tone="sky" />
              <HeroStat icon={MapPin} label={t("services.stats.cities")} value={stats.cities} tone="emerald" />
            </div>
          </div>

          <aside className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4 sm:p-5">
            <button
              type="button"
              onClick={() => setSellerProfileOpen(true)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--engine-accent)]/60 hover:shadow-lg dark:shadow-none"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--engine-accent)] text-lg font-bold uppercase text-white">
                {sellerProfile.avatar ? (
                  <img src={sellerProfile.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  getInitials(sellerProfile.displayName)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--engine-accent)]">
                  {t("services.sellerAccount")}
                </p>
                <h2 className="mt-1 truncate text-lg font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">
                  {t("settings.sections.profile")}
                </h2>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
                  <ShieldCheck size={12} />
                  {myListings.length ? t("services.activeSeller") : t("services.ready")}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openEditor()}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold uppercase text-white transition hover:brightness-95"
            >
              <Plus size={18} />
              {t("services.createService")}
            </button>
            <button
              type="button"
              onClick={() => setSellerListingsOpen(true)}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-4 text-sm font-black uppercase tracking-widest text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] dark:text-white"
            >
              <BriefcaseBusiness size={17} />
              {t("services.myListings")}
              <span className="rounded-full bg-[var(--engine-surface-2)] px-2 py-0.5 text-[10px] text-[var(--engine-text-muted)]">
                {myListings.length}
              </span>
            </button>
            {myBioListing && (
              <BioLinkCard listing={myBioListing} compact className="mt-3" />
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate("/services/approvals")}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 text-sm font-black uppercase tracking-widest text-amber-700 transition hover:border-amber-500 hover:bg-amber-500/15 dark:text-amber-300"
              >
                <ShieldCheck size={17} />
                {t("services.approvals")}
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px]">
                  {pendingApprovalsCount}
                </span>
              </button>
            )}
          </aside>
        </div>
      </header>

      <div className="engine-card p-4 sm:p-5">
        {/* Cabeçalho: alterna a exibição dos filtros avançados */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="-mx-1 flex min-h-11 items-center gap-2 rounded-lg px-1 py-1 text-sm font-bold text-[var(--engine-text)] transition-colors hover:text-[var(--engine-accent)] sm:min-h-0"
          >
            <SlidersHorizontal size={18} className="text-[var(--engine-accent)]" />
            {t("services.filtersTitle")}
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--engine-accent)] px-1.5 text-[11px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
            <ChevronRight
              size={16}
              className={`text-[var(--engine-text-subtle)] transition-transform duration-300 ${
                filtersOpen ? "rotate-90" : ""
              }`}
            />
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)] sm:min-h-0"
            >
              <RotateCcw size={14} />
              {t("services.clearFilters")}
            </button>
          )}
        </div>

        {/* Busca — sempre visível */}
        <label className="mt-4 flex h-12 items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 transition-colors focus-within:border-[var(--engine-accent)]">
          <Search size={18} className="shrink-0 text-[var(--engine-text-subtle)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("services.search")}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--engine-text)] outline-none placeholder:text-[var(--engine-text-subtle)]"
          />
        </label>

        {/* Filtros avançados — recolhíveis */}
        <div
          className={`grid transition-all duration-300 ease-out ${
            filtersOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-5 pt-5">
              <div>
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                  {t("services.location")}
                </p>
                {/* País → Estado → Cidade (condicional em cascata) */}
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="relative">
                    <Globe
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--engine-text-subtle)]"
                    />
                    <select
                      value={countryFilter}
                      onChange={(event) => {
                        setCountryFilter(event.target.value);
                        setStateFilter("all");
                        setCityFilter("all");
                      }}
                      className="h-12 w-full appearance-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] pl-11 pr-9 text-sm font-medium text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]"
                    >
                      <option value="all">{t("services.filters.allCountries")}</option>
                      {countryOptions.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <MapPin
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--engine-text-subtle)]"
                    />
                    <select
                      value={stateFilter}
                      onChange={(event) => {
                        setStateFilter(event.target.value);
                        setCityFilter("all");
                      }}
                      disabled={!stateOptions.length}
                      className="h-12 w-full appearance-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] pl-11 pr-9 text-sm font-medium text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)] disabled:opacity-50"
                    >
                      <option value="all">{t("services.filters.allStates")}</option>
                      {stateOptions.map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <Navigation
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--engine-text-subtle)]"
                    />
                    <select
                      value={cityFilter}
                      onChange={(event) => setCityFilter(event.target.value)}
                      disabled={!cityOptions.length}
                      className="h-12 w-full appearance-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] pl-11 pr-9 text-sm font-medium text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)] disabled:opacity-50"
                    >
                      <option value="all">{t("services.filters.allCities")}</option>
                      {cityOptions.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                  {t("services.fields.category")}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {[{ value: "all", labelKey: "services.filters.all" }, ...serviceCategories].map(
                    (item) => {
                      const active = category === item.value;
                      const Icon = categoryIcons[item.value] || Store;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setCategory(item.value)}
                          className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                            active
                              ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                              : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:border-[var(--engine-border-strong)] hover:text-[var(--engine-text)]"
                          }`}
                        >
                          <Icon size={18} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
                          <span className="truncate text-xs font-semibold">
                            {t(item.labelKey)}
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                  {t("services.serviceMode")}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {modeFilters.map((item) => {
                    const active = mode === item.value;
                    const Icon = modeFilterIcons[item.value] || BriefcaseBusiness;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setMode(item.value)}
                        className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                            : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:border-[var(--engine-border-strong)] hover:text-[var(--engine-text)]"
                        }`}
                      >
                        <Icon size={18} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
                        <span className="truncate text-xs font-semibold">
                          {t(item.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filteredListings.length ? (
          filteredListings.map((listing, index) => (
            <Fragment key={listing.id}>
              <ServiceCard
                listing={listing}
                isMine={listing.ownerId === user?.uid}
                onEdit={openEditor}
                onDelete={deleteListing}
                onOpen={openDetail}
              />
              {/* Card patrocinado no meio da grade (padrão Webmotors):
                  ocupa uma célula como um serviço, rotulado como anúncio. */}
              {index === 5 && (
                <AdSlot slot="services-grid" format="native" user={user} />
              )}
            </Fragment>
          ))
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--engine-border)] bg-[var(--engine-surface)] p-8 text-center sm:col-span-2 xl:col-span-3 2xl:col-span-4">
            <BriefcaseBusiness className="mb-4 text-[var(--engine-accent)]" size={42} />
            <h2 className="text-lg font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">
              {t("services.emptyTitle")}
            </h2>
            <p className="mt-3 max-w-sm text-sm font-medium text-[var(--engine-text-muted)]">
              {t("services.emptyCopy")}
            </p>
          </div>
        )}
      </div>

      {editorOpen && (
        <ListingEditorModal
          form={form}
          sellerProfile={sellerProfile}
          saving={saving}
          photoUploading={photoUploading}
          onSubmit={submitListing}
          onChange={updateForm}
          onPhotoUpload={uploadPhotos}
          onPhotoRemove={removePhoto}
          onCancel={closeEditor}
        />
      )}

      {sellerProfileOpen && (
        <SellerProfileModal
          sellerProfile={sellerProfile}
          listings={myListings}
          onClose={() => setSellerProfileOpen(false)}
          onEditProfile={() => {
            setSellerProfileOpen(false);
            navigate("/settings");
          }}
          onNewListing={() => {
            setSellerProfileOpen(false);
            openEditor();
          }}
        />
      )}

      {sellerListingsOpen && (
        <SellerListingsModal
          listings={myListings}
          onClose={() => setSellerListingsOpen(false)}
          onOpen={(listing) => {
            setSellerListingsOpen(false);
            openDetail(listing);
          }}
          onEdit={(listing) => {
            setSellerListingsOpen(false);
            openEditor(listing);
          }}
          onDelete={deleteListing}
          onNewListing={() => {
            setSellerListingsOpen(false);
            openEditor();
          }}
        />
      )}

      <ServiceDetailModal
        key={detailListing?.id || "nenhum"}
        listing={detailListing}
        isMine={detailListing?.ownerId === user?.uid}
        user={user}
        onClose={() => setDetailListing(null)}
        onEdit={openEditor}
        onDelete={deleteListing}
      />

      <RejectionModal
        listing={rejectionTarget}
        note={rejectionNote}
        action={moderationAction}
        onChangeNote={setRejectionNote}
        onCancel={() => {
          setRejectionTarget(null);
          setRejectionNote("");
          setModerationAction("changes_requested");
        }}
        onConfirm={confirmRejectListing}
      />
    </section>
  );
}

export function ServiceApprovals({ user }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [detailListing, setDetailListing] = useState(null);
  const [rejectionTarget, setRejectionTarget] = useState(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [moderationAction, setModerationAction] = useState("changes_requested");
  const isAdmin = SERVICE_ADMIN_EMAILS.includes(String(user?.email || "").toLowerCase());

  useEffect(() => {
    if (!isAdmin) return undefined;
    return engineDB.subscribeServiceListings(setListings, {
      userId: user?.uid,
      isAdmin: true,
    });
  }, [isAdmin, user?.uid]);

  const flash = (message) => toast(message);

  const approveListing = async (listing) => {
    try {
      await engineDB.moderateServiceListing(listing.id, "approved", "", user?.uid);
      flash(t("services.flash.approved"));
    } catch (error) {
      console.error(error);
      flash(t("services.flash.approveError"));
    }
  };

  const openReturnListing = (listing) => {
    setModerationAction("changes_requested");
    setRejectionTarget(listing);
    setRejectionNote(listing.moderationNote || "");
  };

  const openRejectListing = (listing) => {
    setModerationAction("rejected");
    setRejectionTarget(listing);
    setRejectionNote(listing.moderationNote || "");
  };

  const closeFeedback = () => {
    setRejectionTarget(null);
    setRejectionNote("");
    setModerationAction("changes_requested");
  };

  const confirmFeedback = async () => {
    if (!rejectionTarget) return;
    if (!rejectionNote.trim()) {
      flash(t("services.flash.feedbackRequired"));
      return;
    }

    try {
      await engineDB.moderateServiceListing(
        rejectionTarget.id,
        moderationAction,
        rejectionNote,
        user?.uid,
      );
      flash(
        moderationAction === "changes_requested"
          ? t("services.flash.returned")
          : t("services.flash.rejected"),
      );
      closeFeedback();
    } catch (error) {
      console.error(error);
      flash(t("services.flash.feedbackError"));
    }
  };

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--engine-accent)]">
          {t("services.restrictedAccess")}
        </p>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">
          {t("services.approvals")}
        </h1>
        <p className="mt-2 text-sm font-medium text-[var(--engine-text-muted)]">
          {t("services.adminOnly")}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5 pb-10">

      <header className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5 sm:p-6">
        <button
          type="button"
          onClick={() => navigate("/services")}
          className="mb-5 inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--engine-border)] px-4 text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
        >
          {t("services.backToServices")}
        </button>
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-500">
          {t("services.adminKicker")}
        </p>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white sm:text-2xl">
          {t("services.approvals")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
          {t("services.approvalsCopy")}
        </p>
      </header>

      <ApprovalQueue
        listings={listings}
        onApprove={approveListing}
        onReturn={openReturnListing}
        onReject={openRejectListing}
        onEdit={setDetailListing}
      />

      <ServiceDetailModal
        key={detailListing?.id || "nenhum"}
        listing={detailListing}
        isMine={false}
        onClose={() => setDetailListing(null)}
        onEdit={() => {}}
        onDelete={() => {}}
      />

      <RejectionModal
        listing={rejectionTarget}
        note={rejectionNote}
        action={moderationAction}
        onChangeNote={setRejectionNote}
        onCancel={closeFeedback}
        onConfirm={confirmFeedback}
      />
    </section>
  );
}

function HeroStat({ icon, value, label, tone }) {
  const Icon = icon;
  const tones = {
    red: "text-[var(--engine-accent)]",
    sky: "text-sky-500",
    emerald: "text-emerald-500",
  };

  return (
    <div className="min-w-[150px] rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4 sm:min-w-0 dark:border-white/10 dark:bg-[var(--engine-surface)]/5">
      <Icon className={tones[tone]} size={20} />
      <p className="mt-3 text-2xl font-black text-[var(--engine-text)] dark:text-white">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]">
        {label}
      </p>
    </div>
  );
}
