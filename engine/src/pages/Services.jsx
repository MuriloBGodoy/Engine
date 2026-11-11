import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  EyeOff,
  Flag,
  Gauge,
  Globe,
  ImagePlus,
  Info,
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
import { engineDB, normalizeServiceListing } from "../services/db";
import { compressPhotoForUpload, isImageFile, uploadToStorage } from "../services/photos";
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
import {
  ListingPhoto,
  ListingPhotoPlaceholder,
  MapPreview,
  PortfolioLinks,
  WhatsAppIcon,
} from "../components/services/ListingParts";
import { PublishSignInGate } from "../components/services/PublishSignInGate";
import { InviteProviderCard } from "../components/services/InviteProvider";
import { ReportListingButton } from "../components/services/ReportListing";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useServiceAdmin } from "../hooks/useServiceAdmin";
import {
  APPROVAL_SLA_HOURS,
  PRICE_MAX_LENGTH,
  changedReviewKeys,
  freeTextHasLink,
  listingEditNeedsReview,
} from "../services/serviceListingRules";
import {
  clearListingDraft,
  readListingDraft,
  writeListingDraft,
} from "../services/serviceListingDraft";
import { authPath } from "../services/authRedirect";
import { BioLinkCard, ShareListingButton } from "../components/services/ShareListing";
import { ListingMonthPanel } from "../components/services/ListingMonthPanel";
import { QuoteEntryCard } from "../components/services/QuoteEntryCard";
import { MessageProviderButton } from "../components/services/MessageProvider";
import { ProAccountHub } from "../components/pro/ProAccountHub";
import { ShopsTab } from "../components/shops/ShopsTab";
import { ShopSegment } from "../components/shop/ShopBrowse";
import { ProductEditor } from "../components/shops/ProductEditor";
import { MediaPickerButton } from "../components/MediaPickerButton";
import { useMyPro } from "../hooks/useMyPro";

// Publicar serviço é grátis para sempre (decisão de 24/10/2026). O plano Pro
// vende as ferramentas em volta do anúncio, nunca o anúncio em si.
const MAX_PHOTOS = 6;
const PHOTO_UPLOAD_TIMEOUT_MS = 20000;
// Arquivo cru aceito antes de comprimir: foto de celular novo chega a 12 MB.
// O que sobe é sempre a versão comprimida (~150–300 KB).
const MAX_RAW_PHOTO_BYTES = 20 * 1024 * 1024;
// Para onde o login devolve quem tocou em "Cadastrar" sem conta.
const PUBLISH_PATH = "/services?publish=1";

const emptyForm = {
  id: "",
  title: "",
  providerName: "",
  // Sem categoria escolhida: é obrigatória, e um padrão pré-marcado vira
  // anúncio na categoria errada.
  category: "",
  description: "",
  price: "",
  // "Vou até você" é o caso mais comum de quem chega pelo Instagram
  // (detailer, lavador, martelinho) e não exige publicar endereço.
  serviceMode: "mobile",
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
  suspended: "services.status.suspended",
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

const stripPhoneCountry = (value = "", countryCode = "+55") => {
  const cleanCountry = countryCode.replace(/\D/g,"");
  const digits = String(value).replace(/\D/g,"");
  return digits.startsWith(cleanCountry) ? digits.slice(cleanCountry.length) : digits;
};

const formatPhoneInput = (value = "", countryCode = "+55") => {
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

const splitStoredPhone = (value = "", fallbackCountry = "+55") => {
  const cleanValue = String(value || "").trim();
  const countryCode = cleanValue.startsWith("+")
    ? inferPhoneCountry(cleanValue)
    : fallbackCountry;
  return {
    whatsappCountry: countryCode,
    whatsapp: formatPhoneInput(stripPhoneCountry(value, countryCode), countryCode),
  };
};

const withUploadTimeout = (promise, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), PHOTO_UPLOAD_TIMEOUT_MS);
    }),
  ]);

// Minúsculas e sem acento, para a busca não depender de como foi digitado.
const foldText = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Dígitos do número sem o código do país: Brasil pede DDD + 8 ou 9 dígitos.
const isWhatsAppComplete = (value = "", countryCode = "+55") => {
  const digits = stripPhoneCountry(value, countryCode);
  if (countryCode === "+55") return digits.length >= 10;
  if (countryCode === "+1") return digits.length === 10;
  return digits.length >= 6;
};

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
    // E-mail público começa vazio: o de login é pessoal e não vira contato
    // do anúncio sem a pessoa digitar.
    email: "",
  };
};

function Field({ label, children, wide = false, required = false, optional = false, hint = "", as = "label" }) {
  const { t } = useTranslation();
  // Grupo de botões (fotos, tipo de atendimento) não pode morar dentro de
  // <label>: o toque no rótulo dispararia o primeiro botão do grupo.
  const Wrapper = as;
  return (
    <Wrapper className={`grid min-w-0 content-start gap-2 ${wide ? "md:col-span-2" : ""}`}>
      <span className="text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
        {label}
        {required && (
          <span className="ml-1 text-[var(--engine-accent)]" aria-hidden="true">*</span>
        )}
        {optional && (
          <span className="ml-1.5 font-bold normal-case tracking-normal text-[var(--engine-text-subtle)]">
            ({t("services.form.optional")})
          </span>
        )}
      </span>
      {children}
      {hint && (
        <span className="text-xs font-medium leading-5 text-[var(--engine-text-muted)]">{hint}</span>
      )}
    </Wrapper>
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
    suspended: "border-[var(--engine-accent)]/25 bg-[var(--engine-accent)]/10 text-[var(--engine-accent)]",
  };
  const Icon =
    status === "approved"
      ? CheckCircle2
      : status === "rejected" || status === "suspended"
        ? XCircle
        : Clock;

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

function ServiceCard({ listing, isMine, user, onEdit, onDelete, onOpen }) {
  const { t } = useTranslation();
  const ModeIcon = modeIcons[listing.serviceMode] || BriefcaseBusiness;
  const phone = normalizeWhatsApp(listing.whatsapp);
  const photos = listing.photos || [];
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
      className="@container group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] transition hover:-translate-y-0.5 hover:border-[var(--engine-accent)]/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:shadow-none"
    >
      {/* `shrink-0`: sem ele a faixa de 160px media 120px num card e 96px no
          outro, conforme o texto de cada anuncio. Foto de tamanho diferente em
          cada card e o que fazia a grade parecer torta. */}
      <div className="relative h-[132px] shrink-0 overflow-hidden bg-[var(--engine-surface-2)] sm:h-[180px]">
        <ListingPhoto
          key={activePhoto || "sem-foto"}
          src={activePhoto}
          listing={listing}
          alt={listing.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {photos.length > 0 && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        )}
        {/* `max-w` + `truncate`: num cartão de 174px, "Polimento, vitrificação
            e detailing" quebrava em três linhas e vazava para fora da foto. */}
        <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-[var(--engine-accent)] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white sm:left-3 sm:top-3 sm:px-3 sm:text-[10px] sm:tracking-widest">
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
            /* Fora do celular: num cartão de 174px ele cobre a foto e disputa
               o toque com o próprio cartão. Compartilhar continua no detalhe. */
            className="absolute bottom-2 right-2 z-10 max-sm:hidden"
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

      {/* No celular a grade é de duas colunas, e aí o cartão tem ~175px de
          largura: cabem foto, título, prestador, cidade e preço, nada mais.
          Modo, horário, descrição, tags e os botões continuam existindo —
          aparecem a partir de 640px e no detalhe, que é onde quem está
          decidindo vai parar. Nove informações num cartão de 175px não são
          nove informações: são nenhuma. */}
      <div className="flex flex-1 flex-col justify-between gap-2 p-2.5 sm:gap-3 sm:p-4">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-[13.5px] font-extrabold italic leading-[1.25] tracking-tight text-[var(--engine-text)] sm:text-lg sm:leading-6 dark:text-white">
                {listing.title}
              </h2>
              <p className="mt-1 truncate text-xs font-semibold text-[var(--engine-text-subtle)]">
                {listing.providerName || t("services.engineProfessional")}
              </p>
              <ServiceRatingBadge listing={listing} />
            </div>
          </div>

          <p className="mt-2 hidden line-clamp-2 text-xs font-medium leading-4 text-[var(--engine-text-muted)] sm:block">
            {listing.description}
          </p>
        </div>

        {/* A cidade é o único dos três que fica no celular: é o que decide se
            a pessoa consegue chegar lá. */}
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[var(--engine-text-muted)] sm:hidden">
          <MapPin className="shrink-0 text-emerald-500" size={13} />
          <span className="truncate">
            {listing.city || listing.serviceArea || t("services.locationFallback")}
          </span>
        </div>

        <div className="hidden gap-2 text-xs font-semibold text-[var(--engine-text-muted)] sm:grid">
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

        <div className="space-y-2.5 border-t border-[var(--engine-border)] pt-2 sm:pt-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="hidden text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-subtle)] sm:block">
              {t("services.priceLabel")}
            </span>
            {/* No celular o preço é a âncora do cartão, então ele é o que
                cresce quando o resto encolhe. */}
            <p className="text-[15px] font-black italic leading-tight text-[var(--engine-accent)] sm:text-sm">
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

          <div className="hidden flex-wrap gap-1.5 sm:flex">
            {(listing.tags || []).slice(0, 2).map((tag) => (
              <span
                key={`${listing.id}-${tag}`}
                className="rounded-full border border-[var(--engine-border)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Dono: no lugar de WhatsApp/Mensagem (que seriam para ele mesmo)
              entram as ações dele. Rótulo some quando o card fica estreito
              (container query), nunca corta no meio. */}
          {isMine ? (
            <div className="hidden grid-cols-2 gap-2 pt-1 sm:grid">
              <button
                type="button"
                onClick={(event) => {
                  stopAction(event);
                  onEdit(listing);
                }}
                className="flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--engine-border-strong)] px-2 text-xs font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-text-muted)]"
              >
                <Edit3 className="shrink-0" size={15} aria-hidden="true" />
                <span className="truncate">{t("services.editListing")}</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  stopAction(event);
                  onDelete(listing);
                }}
                className="flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--engine-border-strong)] px-2 text-xs font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
              >
                <Trash2 className="shrink-0" size={15} aria-hidden="true" />
                <span className="truncate">{t("services.deleteListing")}</span>
              </button>
            </div>
          ) : (
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-1.5 pt-1 @[20rem]:gap-2 sm:grid">
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
                className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-bold transition ${
                  phone
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "pointer-events-none bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)]"
                }`}
                title={t("services.whatsapp")}
              >
                <WhatsAppIcon className="shrink-0" size={16} />
                <span className="truncate">{t("services.cardActions.chat")}</span>
              </a>
              {/* Mensagem pelo Engine no lugar do e-mail: a conversa fica em
                  Mensagens › Serviços, amarrada ao anúncio. O e-mail continua
                  no detalhe e na página pública. */}
              <MessageProviderButton listing={listing} user={user} variant="card" />
              <a
                href={showMap ? getDirectionsUrl(listing) : undefined}
                onClick={stopAction}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!showMap}
                aria-label={t("services.viewRoute")}
                className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-bold transition ${
                  showMap
                    ? "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                    : "pointer-events-none bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)]"
                }`}
                title={t("services.viewRouteShort")}
              >
                <Map className="shrink-0" size={16} />
              </a>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ServiceDetailModal({ listing, isMine, user, moderation = null, onClose, onEdit, onDelete }) {
  const { t } = useTranslation();
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [section, setSection] = useState("about");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Voltar do celular fecha o detalhe (antes saía da página de Serviços).
  useHistoryDismiss(Boolean(listing), onClose);

  // Zerar foto, lightbox, zoom e aba ao trocar de anúncio é feito remontando:
  // quem abre este modal passa `key` com o id do anúncio.

  if (!listing) return null;

  const ModeIcon = modeIcons[listing.serviceMode] || BriefcaseBusiness;
  const phone = normalizeWhatsApp(listing.whatsapp);
  const photos = listing.photos || [];
  const activePhoto = photos[activePhotoIndex] || photos[0];
  const showMap = hasMapAddress(listing);
  const approved = listing.moderationStatus === "approved";
  const place = mapQuery(listing) || listing.serviceArea || t("services.remoteFallback");
  const trackWhatsApp = isMine ? undefined : () => engineDB.trackServiceListingMetric(listing.id, "whatsapp", "search");
  const movePhoto = (direction) => {
    setActivePhotoIndex((current) => (current + direction + photos.length) % photos.length);
    setZoom(1);
  };

  // Detalhes numa lista só (antes eram 4 cartões grandes). Status só para
  // quem pode agir sobre ele: o dono e a moderação.
  const facts = [
    { icon: ModeIcon, label: t("services.serviceMode"), value: t(modeLabelKeys[listing.serviceMode] || modeLabelKeys.hybrid) },
    { icon: Clock, label: t("services.schedule"), value: listing.availability || t("services.toArrange") },
    listing.experience ? { icon: Gauge, label: t("services.experience"), value: listing.experience } : null,
    { icon: MapPin, label: t("services.location"), value: listing.city || listing.serviceArea || t("services.online") },
    isMine || moderation
      ? { icon: ShieldCheck, label: t("services.statusLabel"), value: t(statusLabelKeys[listing.moderationStatus] || statusLabelKeys.pending) }
      : null,
  ].filter(Boolean);

  const sections = [
    { id: "about", label: t("listingDetail.about") },
    { id: "reviews", label: t("listingDetail.reviews"), count: approved ? listing.ratingCount || 0 : null, hidden: !approved },
    { id: "place", label: t("listingDetail.place") },
  ].filter((item) => !item.hidden);

  const whatsappLink = (className, compact = false) =>
    phone ? (
      <a
        href={getWhatsAppHref(listing, t)}
        target="_blank"
        rel="noreferrer"
        onClick={trackWhatsApp}
        className={className}
      >
        <WhatsAppIcon size={18} className="shrink-0" />
        <span className="truncate">{compact ? "WhatsApp" : t("services.whatsapp")}</span>
      </a>
    ) : null;

  const actionBase =
    "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`detail-${listing.id}`}
        onClick={(event) => event.stopPropagation()}
        className="relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none border-0 border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text)] shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:border"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--engine-border)] bg-[var(--engine-surface)] px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-accent)]">
              {getServiceCategoryLabel(listing.category, t)}
            </p>
            <h2 id={`detail-${listing.id}`} className="mt-1 line-clamp-2 text-lg font-extrabold italic leading-tight tracking-tight sm:text-2xl">
              {listing.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {approved && <ShareListingButton listing={listing} variant="icon" asOwner={isMine} source="detalhe" />}
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
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid gap-5 p-3 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <div className="min-w-0 space-y-4">
              {!photos.length && (
                <ListingPhotoPlaceholder listing={listing} size="lg" className="aspect-[16/10] w-full rounded-xl" />
              )}
              {photos.length > 0 && (
                <div className="relative overflow-hidden rounded-xl bg-[var(--engine-surface-2)]">
                  {/* Celular: desliza entre as fotos (snap); desktop: setas. */}
                  <div
                    className="engine-chip-scroll flex snap-x snap-mandatory overflow-x-auto lg:overflow-hidden"
                    onScroll={(event) => {
                      const node = event.currentTarget;
                      const index = Math.round(node.scrollLeft / Math.max(1, node.clientWidth));
                      if (index !== activePhotoIndex) setActivePhotoIndex(index);
                    }}
                  >
                    {(isDesktop ? [activePhoto] : photos).map((photo, index) => (
                      <button
                        key={`${photo}-${index}`}
                        type="button"
                        onClick={() => setLightboxOpen(true)}
                        className="block w-full shrink-0 snap-center cursor-zoom-in"
                        title={t("services.enlargePhoto")}
                      >
                        <ListingPhoto
                          src={photo}
                          listing={listing}
                          alt={index === 0 ? listing.title : ""}
                          placeholderSize="lg"
                          className="aspect-[16/10] max-h-[360px] w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-[var(--engine-accent)] sm:h-10 sm:w-10"
                    title={t("services.openPreview")}
                    aria-label={t("services.openPreview")}
                  >
                    <Maximize2 size={18} />
                  </button>
                  {photos.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => movePhoto(-1)}
                        className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-[var(--engine-accent)] lg:flex"
                        title={t("services.previousPhoto")}
                        aria-label={t("services.previousPhoto")}
                      >
                        <ChevronLeft size={22} />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePhoto(1)}
                        className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-[var(--engine-accent)] lg:flex"
                        title={t("services.nextPhoto")}
                        aria-label={t("services.nextPhoto")}
                      >
                        <ChevronRight size={22} />
                      </button>
                      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-black text-white backdrop-blur">
                        {activePhotoIndex + 1}/{photos.length}
                      </div>
                    </>
                  )}
                </div>
              )}

              {photos.length > 1 && (
                <div className="engine-chip-scroll hidden gap-2 overflow-x-auto pb-1 lg:flex">
                  {photos.map((photo, index) => (
                    <button
                      key={`${listing.id}-detail-photo-${photo}-${index}`}
                      type="button"
                      onClick={() => {
                        setActivePhotoIndex(index);
                        setZoom(1);
                      }}
                      className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border transition ${
                        index === activePhotoIndex
                          ? "border-[var(--engine-accent)] ring-2 ring-[var(--engine-ring)]"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                      title={t("services.viewPhoto", { value: index + 1 })}
                    >
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Celular: quem faz e quanto custa logo abaixo das fotos. */}
              <div className="flex items-center gap-3 lg:hidden">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] text-sm font-black italic text-white">
                  {getInitials(listing.providerName || listing.title)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{listing.providerName || t("services.engineProfessional")}</p>
                  <p className="truncate text-xs font-medium text-[var(--engine-text-muted)]">{listing.city || t("services.online")}</p>
                </div>
                <p className="shrink-0 text-xl font-black italic text-[var(--engine-accent)]">{listing.price || t("services.quoteFallback")}</p>
              </div>

              <div
                role="tablist"
                aria-label={listing.title}
                className="sticky top-0 z-10 -mx-3 flex border-b border-[var(--engine-border)] bg-[var(--engine-surface)] px-3 sm:mx-0 sm:px-0"
              >
                {sections.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={section === item.id}
                    onClick={() => setSection(item.id)}
                    className={`-mb-px min-h-12 flex-1 whitespace-nowrap border-b-2 px-2 text-sm font-bold transition sm:flex-none sm:px-5 ${
                      section === item.id
                        ? "border-[var(--engine-text)] text-[var(--engine-text)]"
                        : "border-transparent text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                    }`}
                  >
                    {item.label}
                    {item.count != null && <span className="ml-1 font-semibold text-[var(--engine-text-muted)]">{item.count}</span>}
                  </button>
                ))}
              </div>

              {section === "about" && (
                <div className="space-y-4">
                  {listing.description && (
                    <p className="whitespace-pre-line text-sm leading-7 text-[var(--engine-text)]">{listing.description}</p>
                  )}
                  {(listing.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {listing.tags.map((tag) => (
                        <span
                          key={`${listing.id}-detail-${tag}`}
                          className="rounded-full border border-[var(--engine-border)] px-3 py-1 text-[11px] font-bold text-[var(--engine-text-muted)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <dl className="grid gap-x-6 rounded-xl border border-[var(--engine-border)] px-4 sm:grid-cols-2">
                    {facts.map((fact) => {
                      const Icon = fact.icon;
                      return (
                        <div key={fact.label} className="flex items-start gap-3 border-b border-[var(--engine-border)] py-3 last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                          <Icon size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--engine-text-muted)]" />
                          <div className="min-w-0">
                            <dt className="text-xs font-semibold text-[var(--engine-text-muted)]">{fact.label}</dt>
                            <dd className="break-words text-sm font-bold text-[var(--engine-text)]">{fact.value}</dd>
                          </div>
                        </div>
                      );
                    })}
                  </dl>
                  {(listing.email || listing.instagram || listing.tiktok || listing.website || listing.videoUrl) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {listing.email && (
                        <a
                          href={`mailto:${listing.email}?subject=${encodeURIComponent(t("services.emailSubject", { title: listing.title }))}`}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-3 text-sm font-semibold text-[var(--engine-text)] hover:border-[var(--engine-border-strong)]"
                        >
                          <Mail size={16} aria-hidden="true" />
                          <span className="max-w-[14rem] truncate">{listing.email}</span>
                        </a>
                      )}
                      <PortfolioLinks listing={listing} t={t} />
                    </div>
                  )}
                </div>
              )}

              {section === "reviews" && approved && <ServiceReviews listing={listing} user={user} hideTitle />}

              {section === "place" && (
                <div className="space-y-3">
                  <p className="flex items-start gap-2 text-sm font-bold text-[var(--engine-text)]">
                    <MapPin className="mt-0.5 shrink-0 text-[var(--engine-accent)]" size={17} aria-hidden="true" />
                    <span>{place}</span>
                  </p>
                  {showMap ? (
                    <MapPreview listing={listing} ratio />
                  ) : (
                    <p className="text-sm text-[var(--engine-text-muted)]">{t("services.noAddress")}</p>
                  )}
                </div>
              )}

              {!isMine && approved && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--engine-border)] pt-3 text-xs">
                  <a
                    href={serviceListingPath(listing)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                    {t("listingDetail.openPage")}
                  </a>
                  <ReportListingButton listing={listing} user={user} />
                </div>
              )}
            </div>

            <aside className={`min-w-0 space-y-3 lg:sticky lg:top-0 ${isMine || moderation ? "" : "hidden lg:block"}`}>
              <div className="hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4 lg:block">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] font-black italic text-white">
                    {getInitials(listing.providerName || listing.title)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{listing.providerName || t("services.engineProfessional")}</p>
                    <p className="truncate text-xs font-medium text-[var(--engine-text-muted)]">{listing.city || t("services.online")}</p>
                  </div>
                  {isMine && (
                    <span className="shrink-0 rounded-full bg-[var(--engine-surface)] px-2 py-1 text-[11px] font-bold text-[var(--engine-text-muted)]">
                      {t("listingDetail.owner")}
                    </span>
                  )}
                </div>
                <p className="mt-4 text-2xl font-black italic text-[var(--engine-accent)]">
                  {listing.price || t("services.quoteFallback")}
                </p>

                {/* Ações: abaixo de lg ficam na barra fixa de baixo. */}
                {isMine ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => onEdit(listing)} className={`${actionBase} border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text)]`}>
                      <Edit3 size={16} aria-hidden="true" />
                      {t("services.edit")}
                    </button>
                    <button type="button" onClick={() => onDelete(listing)} className={`${actionBase} border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)]`}>
                      <Trash2 size={16} aria-hidden="true" />
                      {t("common.delete")}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2">
                    <MessageProviderButton listing={listing} user={user} variant="block" />
                    <div className={`grid gap-2 ${phone ? "grid-cols-2" : "grid-cols-1"}`}>
                      {whatsappLink(`${actionBase} bg-emerald-600 text-white hover:bg-emerald-700`, true)}
                      <Link
                        to={`/services/orcamentos?${new URLSearchParams({
                          new: "1",
                          cat: normalizeServiceCategory(listing.category) || "",
                          uf: listing.state || "",
                          cidade: listing.city || "",
                        })}`}
                        className={`${actionBase} border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text)]`}
                      >
                        <ClipboardList size={16} aria-hidden="true" />
                        {t("listingDetail.quote")}
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {moderation && <ModerationPanel listing={listing} actions={moderation} />}
              {isMine && (
                <>
                  <BioLinkCard listing={listing} />
                  <ListingMonthPanel listing={listing} />
                </>
              )}
            </aside>
          </div>
        </div>

        {/* Barra fixa do celular: o que se faz neste anúncio, sempre à mão. */}
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--engine-border)] bg-[var(--engine-surface)] px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 sm:px-6 lg:hidden">
          {isMine ? (
            <>
              <button type="button" onClick={() => onEdit(listing)} className={`${actionBase} border border-[var(--engine-border-strong)] text-[var(--engine-text)]`}>
                <Edit3 size={16} aria-hidden="true" />
                {t("services.edit")}
              </button>
              <button type="button" onClick={() => onDelete(listing)} className={`${actionBase} border border-[var(--engine-border-strong)] text-[var(--engine-text-muted)]`}>
                <Trash2 size={16} aria-hidden="true" />
                {t("common.delete")}
              </button>
            </>
          ) : (
            <>
              <div className={phone ? "" : "col-span-2"}>
                <MessageProviderButton listing={listing} user={user} variant="block" short />
              </div>
              {whatsappLink(`${actionBase} bg-emerald-600 text-white`, true)}
            </>
          )}
        </div>
      </section>

      {lightboxOpen && photos.length > 0 && (
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
  const activePhoto = photos[activePhotoIndex] || photos[0];

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

function FormSection({ title, copy, children }) {
  return (
    <div className="grid gap-5 md:col-span-2 md:grid-cols-2">
      <div className="md:col-span-2">
        <h3 className="text-sm font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">{title}</h3>
        {copy && (
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--engine-text-muted)]">{copy}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Depois de salvar. São três desfechos desde 11/11/2026, quando o anúncio
 * passou a ir ao ar na hora: publicado (`live`), novo na fila porque o filtro
 * apontou algo, ou edição enviada. Só os dois últimos falam de prazo — prometer
 * revisão em 24h para quem já está no ar é confundir quem não precisa esperar.
 */
function SubmittedPanel({ isNew, live, onOpenMyListings, onClose }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center px-5 py-10 text-center sm:px-10 sm:py-14">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
        <CheckCircle2 size={32} aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-xl font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">
        {live
          ? t("services.submitted.titleLive")
          : isNew
            ? t("services.submitted.title")
            : t("services.submitted.titleEdit")}
      </h2>
      {live ? (
        <p className="mt-2 max-w-md text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
          {t("services.submitted.liveCopy")}
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-[var(--engine-text)]">
            {t("services.submitted.sla", { hours: APPROVAL_SLA_HOURS })}
          </p>
          <p className="mt-2 max-w-md text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
            {t("services.submitted.copy")}
          </p>
        </>
      )}
      <div className="mt-7 grid w-full max-w-sm gap-2.5">
        <button
          type="button"
          onClick={onOpenMyListings}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95"
        >
          <BriefcaseBusiness size={17} aria-hidden="true" />
          {t("services.submitted.myListings")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] dark:text-white"
        >
          {t("services.submitted.done")}
        </button>
      </div>
    </div>
  );
}

function ListingEditorModal({
  form,
  sellerProfile,
  proOptions = [],
  saving,
  photoUploading,
  draftRestored,
  editingLive,
  submitted,
  onSubmit,
  onChange,
  onPhotoUpload,
  onPhotoRemove,
  onDiscardDraft,
  onOpenMyListings,
  onCancel,
}) {
  const { t } = useTranslation();
  const addressRequired = form.serviceMode === "place";
  const showAddress = ["place", "hybrid"].includes(form.serviceMode);
  const showServiceArea = ["mobile", "hybrid"].includes(form.serviceMode);
  const formStates = getStates(form.country);
  const formCities = getCities(form.country, form.state);
  const cityListId = "listing-city-suggestions";
  const photos = form.photos || [];
  // "Publicado como": a página escolhida (logo, nome, @) ou a própria pessoa.
  // Até 02/11/2026 o seletor mudava e o cartão continuava mostrando a pessoa.
  const pageOptions = proOptions.filter((entry) => entry.profile.kind === "page");
  const chosenPage = pageOptions.find((entry) => entry.profile.id === form.profileId)?.profile || null;
  const publishName = chosenPage ? chosenPage.name : sellerProfile?.displayName;
  const publishHandle = chosenPage ? `@${chosenPage.handle}` : sellerProfile?.username;
  const publishAvatar = chosenPage ? chosenPage.data?.logo : sellerProfile?.avatar;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-0 backdrop-blur-sm sm:p-6">
      <form
        onSubmit={onSubmit}
        noValidate
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
            {!submitted && (
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
                {t("services.editorCopy")}
              </p>
            )}
            {!submitted && (
              <div className="mt-4 flex max-w-xl items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--engine-accent)] text-sm font-bold uppercase text-white">
                  {publishAvatar ? (
                    <img src={publishAvatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    getInitials(publishName)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
                    {t("services.publishedAs")}
                  </p>
                  {/* Anunciar como você ou como uma página em que estou na
                      equipe. Perfil não muda depois de publicado. */}
                  {pageOptions.length > 0 && !form.id && (
                    <select
                      aria-label={t("pro.publishAs")}
                      value={form.profileId || ""}
                      onChange={(event) => onChange("profileId", event.target.value)}
                      className="mt-1 min-h-10 w-full rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface)] px-2 text-xs font-bold text-[var(--engine-text)]"
                    >
                      <option value="">{t("pro.personal")}</option>
                      {pageOptions.map((entry) => (
                          <option key={entry.profile.id} value={entry.profile.id}>
                            {entry.profile.name} (@{entry.profile.handle})
                          </option>
                        ))}
                    </select>
                  )}
                  <p className="truncate text-sm font-bold italic text-[var(--engine-text)] dark:text-white">
                    {publishName || t("services.engineUser")}
                  </p>
                  <p className="truncate text-xs font-bold text-[var(--engine-text-muted)]">
                    {publishHandle || t("services.engineAccount")}
                  </p>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-accent)] hover:text-white"
            title={t("services.closeEditor")}
            aria-label={t("services.closeEditor")}
          >
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <SubmittedPanel
            isNew={submitted.isNew}
            live={submitted.live}
            onOpenMyListings={onOpenMyListings}
            onClose={onCancel}
          />
        ) : (
          <>
            <div className="grid gap-8 p-4 pb-28 sm:p-6 md:grid-cols-2">
              {draftRestored && (
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3 text-sm font-semibold text-[var(--engine-text)] sm:flex-row sm:items-center sm:justify-between md:col-span-2 dark:text-white">
                  <span className="flex items-start gap-2">
                    <RotateCcw size={16} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
                    {t("services.form.draftRestored")}
                  </span>
                  <button
                    type="button"
                    onClick={onDiscardDraft}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3 text-xs font-bold text-[var(--engine-text-muted)] underline-offset-2 transition hover:text-[var(--engine-accent)] hover:underline"
                  >
                    {t("services.form.discardDraft")}
                  </button>
                </div>
              )}
              {editingLive && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold leading-6 text-[var(--engine-text)] md:col-span-2 dark:text-white">
                  <Info size={16} className="mt-1 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
                  {t("services.form.editLiveHint", { hours: APPROVAL_SLA_HOURS })}
                </div>
              )}

              <FormSection title={t("services.form.essentials")} copy={t("services.form.requiredHint")}>
                <Field as="div" label={t("services.fields.photos")} wide required hint={t("services.form.photoHint")}>
                  <div id="svc-photos" tabIndex={-1} className="grid gap-3 outline-none min-[420px]:grid-cols-2 sm:grid-cols-3">
                    {photos.map((photo, index) => (
                      <div key={photo} className="relative overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)]">
                        <img src={photo} alt="" className="h-36 w-full object-cover sm:h-32" />
                        {index === 0 && (
                          <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                            {t("services.form.cover")}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onPhotoRemove(photo)}
                          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-[var(--engine-accent)]"
                          title={t("services.removePhoto")}
                          aria-label={t("services.removePhoto")}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    {photos.length < MAX_PHOTOS && (
                      <MediaPickerButton
                        accept="image/*"
                        multiple
                        onFiles={onPhotoUpload}
                        disabled={photoUploading}
                        title={t("services.addPhoto")}
                        className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4 text-center text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-60 dark:text-white"
                      >
                        {photoUploading ? (
                          <Wrench className="mb-2 animate-spin text-[var(--engine-accent)]" size={24} />
                        ) : (
                          <ImagePlus className="mb-2 text-[var(--engine-accent)]" size={24} />
                        )}
                        <span className="text-xs font-black uppercase tracking-widest">
                          {photoUploading ? t("services.uploadingPhoto") : t("services.addPhoto")}
                        </span>
                        <span className="mt-1 text-[11px] font-bold text-[var(--engine-text-muted)]">
                          {t("services.maxImages", { value: MAX_PHOTOS })}
                        </span>
                      </MediaPickerButton>
                    )}
                  </div>
                </Field>

                <Field label={t("services.fields.title")} wide required>
                  <TextInput
                    value={form.title}
                    onChange={(event) => onChange("title", event.target.value)}
                    id="svc-title"
                    maxLength={90}
                    aria-required="true"
                    placeholder={t("services.placeholders.title")}
                  />
                </Field>
                <Field label={t("services.fields.category")} required>
                  <Select
                    id="svc-category"
                    value={form.category ? normalizeServiceCategory(form.category) : ""}
                    onChange={(event) => onChange("category", event.target.value)}
                    aria-required="true"
                  >
                    <option value="" disabled>
                      {t("services.form.categoryPlaceholder")}
                    </option>
                    {serviceCategories.map((item) => (
                      <option key={item.value} value={item.value}>{t(item.labelKey)}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("services.fields.whatsapp")} required>
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
                      id="svc-whatsapp"
                      value={form.whatsapp}
                      onChange={(event) =>
                        onChange("whatsapp", formatPhoneInput(event.target.value, form.whatsappCountry))
                      }
                      placeholder={form.whatsappCountry === "+1" ? "(555) 123-4567" : "(11) 99999-9999"}
                      inputMode="tel"
                      autoComplete="tel-national"
                      aria-required="true"
                    />
                  </div>
                </Field>

                <Field as="div" label={t("services.fields.serviceMode")} wide required>
                  <div className="grid gap-2 min-[520px]:grid-cols-3">
                    {["mobile", "place", "hybrid"].map((item) => {
                      const Icon = modeIcons[item];
                      const active = form.serviceMode === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={active}
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
                          <span className="mt-1 block text-[11px] font-bold leading-4 opacity-80">
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
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("services.fields.state")} required={formStates.length > 0}>
                  <Select
                    id="svc-state"
                    value={form.state || ""}
                    onChange={(event) => {
                      onChange("state", event.target.value);
                      onChange("city", "");
                    }}
                    disabled={!formStates.length}
                    aria-required={formStates.length > 0}
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
                <Field label={t("services.fields.city")} required>
                  <TextInput
                    id="svc-city"
                    value={form.city}
                    onChange={(event) => onChange("city", event.target.value)}
                    placeholder={t("services.placeholders.city")}
                    list={formCities.length ? cityListId : undefined}
                    autoComplete="address-level2"
                    aria-required="true"
                  />
                  {formCities.length > 0 && (
                    <datalist id={cityListId}>
                      {formCities.map((city) => (
                        <option key={city} value={city} />
                      ))}
                    </datalist>
                  )}
                </Field>
                {showAddress && (
                  <Field
                    label={t("services.fields.address")}
                    required={addressRequired}
                    optional={!addressRequired}
                    hint={addressRequired ? "" : t("services.form.addressHybridHint")}
                  >
                    <TextInput
                      value={form.address}
                      onChange={(event) => onChange("address", event.target.value)}
                      id="svc-address"
                      autoComplete="street-address"
                      aria-required={addressRequired}
                      placeholder={t("services.placeholders.address")}
                    />
                  </Field>
                )}
                {showAddress && hasMapAddress(form) && (
                  <div className="md:col-span-2">
                    <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
                      {t("services.mapPreview")}
                    </p>
                    <MapPreview listing={form} />
                  </div>
                )}
              </FormSection>

              <FormSection title={t("services.form.optionalTitle")} copy={t("services.form.optionalCopy")}>
                <Field label={t("services.fields.description")} wide optional>
                  <TextArea
                    value={form.description}
                    onChange={(event) => onChange("description", event.target.value)}
                    id="svc-description"
                    maxLength={900}
                    placeholder={t("services.placeholders.description")}
                  />
                </Field>
                <Field label={t("services.fields.price")} optional hint={t("services.form.priceHint")}>
                  <TextInput
                    value={form.price}
                    onChange={(event) => onChange("price", event.target.value.slice(0, PRICE_MAX_LENGTH))}
                    maxLength={PRICE_MAX_LENGTH}
                    placeholder={t("services.placeholders.price")}
                  />
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-bold text-[var(--engine-text-muted)]">
                    <input
                      type="checkbox"
                      checked={Boolean(form.priceFrom)}
                      onChange={(event) => onChange("priceFrom", event.target.checked)}
                      className="h-4 w-4 accent-[var(--engine-accent)]"
                    />
                    {t("pro.priceFromToggle")}
                  </label>
                </Field>
                <Field label={t("services.fields.availability")} optional>
                  <TextInput
                    value={form.availability}
                    onChange={(event) => onChange("availability", event.target.value)}
                    maxLength={180}
                    placeholder={t("services.placeholders.availability")}
                  />
                </Field>
                {showServiceArea && (
                  <Field label={t("services.fields.serviceArea")} wide optional>
                    <TextInput
                      value={form.serviceArea}
                      onChange={(event) => onChange("serviceArea", event.target.value)}
                      id="svc-service-area"
                      maxLength={160}
                      placeholder={t("services.placeholders.serviceArea")}
                    />
                  </Field>
                )}
              </FormSection>

              <details className="group md:col-span-2" open={Boolean(form.id) || undefined}>
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 text-sm font-extrabold text-[var(--engine-text)] transition hover:border-[var(--engine-border-strong)] dark:text-white [&::-webkit-details-marker]:hidden">
                  {t("services.form.moreTitle")}
                  <ChevronDown size={18} className="shrink-0 text-[var(--engine-text-muted)] transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <Field label={t("services.fields.providerName")} optional>
                    <TextInput
                      value={form.providerName}
                      onChange={(event) => onChange("providerName", event.target.value)}
                      maxLength={80}
                      placeholder={t("services.placeholders.providerName")}
                    />
                  </Field>
                  <Field label={t("common.email")} optional hint={t("services.form.emailHint")}>
                    <TextInput
                      type="email"
                      value={form.email}
                      onChange={(event) => onChange("email", event.target.value)}
                      autoComplete="off"
                      placeholder={t("services.form.emailPlaceholder")}
                    />
                  </Field>
                  <Field label={t("services.fields.instagram")} optional>
                    <TextInput
                      value={form.instagram}
                      onChange={(event) => onChange("instagram", event.target.value)}
                      autoCapitalize="none"
                      placeholder={t("services.placeholders.instagram")}
                    />
                  </Field>
                  <Field label={t("services.fields.tiktok")} optional>
                    <TextInput
                      value={form.tiktok}
                      onChange={(event) => onChange("tiktok", event.target.value)}
                      autoCapitalize="none"
                      placeholder={t("services.placeholders.tiktok")}
                    />
                  </Field>
                  <Field label={t("services.fields.experience")} wide optional>
                    <TextInput
                      value={form.experience}
                      onChange={(event) => onChange("experience", event.target.value)}
                      maxLength={180}
                      placeholder={t("services.placeholders.experience")}
                    />
                  </Field>
                  <Field label={t("services.fields.videoUrl")} wide optional hint={t("services.hints.videoUrl")}>
                    <TextInput
                      value={form.videoUrl}
                      onChange={(event) => onChange("videoUrl", event.target.value)}
                      inputMode="url"
                      autoCapitalize="none"
                      placeholder={t("services.placeholders.videoUrl")}
                    />
                  </Field>
                  <Field label={t("services.fields.tags")} wide optional>
                    <TextInput
                      value={form.tags}
                      onChange={(event) => onChange("tags", event.target.value)}
                      placeholder={t("services.placeholders.tags")}
                    />
                  </Field>
                </div>
              </details>
            </div>

            <div className="engine-safe-bottom flex flex-col gap-3 border-t border-[var(--engine-border)] p-5 sm:flex-row sm:p-6">
              <button
                type="submit"
                disabled={saving || photoUploading}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-sm font-bold uppercase text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Wrench className="animate-spin" size={18} /> : <Plus size={18} />}
                {saving
                  ? t("services.sending")
                  : editingLive
                    ? t("services.form.saveChanges")
                    : t("services.submitForApproval")}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--engine-border)] px-5 text-sm font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
              >
                {t("common.cancel")}
              </button>
            </div>
          </>
        )}
      </form>
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
                  <ListingPhoto
                    src={listing.photos?.[0]}
                    listing={listing}
                    placeholderSize="sm"
                    className="h-24 w-full rounded-lg object-cover sm:h-16 sm:w-[72px]"
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
                    {/* O status em palavras, não só a etiqueta: o que está
                        acontecendo e o que a pessoa pode fazer. */}
                    <p className="mt-2 text-xs font-semibold leading-5 text-[var(--engine-text)] dark:text-white">
                      {t(`services.statusHint.${listing.moderationStatus || "pending"}`, {
                        hours: APPROVAL_SLA_HOURS,
                      })}
                    </p>
                    {listing.moderationNote && listing.moderationStatus !== "approved" && (
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

// Há quanto tempo o anúncio espera ("há 3 horas"), no idioma da tela.
const timeOf = (listing) => {
  const value = new Date(listing?.submittedAt || listing?.createdAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
};

const waitingInfo = (listing, language) => {
  const sent = timeOf(listing);
  if (!sent) return { label: "", overdue: false };
  const ms = Math.max(0, Date.now() - sent);
  const hours = ms / 3_600_000;
  let label;
  try {
    const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    if (hours < 1) label = rtf.format(-Math.max(1, Math.round(ms / 60_000)), "minute");
    else if (hours < 48) label = rtf.format(-Math.round(hours), "hour");
    else label = rtf.format(-Math.round(hours / 24), "day");
  } catch {
    label = "";
  }
  return { label, overdue: hours > APPROVAL_SLA_HOURS };
};

function QueueButton({ tone, icon, children, onClick }) {
  const Icon = icon;
  const tones = {
    neutral:
      "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]",
    sky: "bg-sky-700 text-white hover:bg-sky-800",
    red: "bg-[var(--engine-accent)] text-white hover:brightness-95",
    green: "bg-emerald-700 text-white hover:bg-emerald-800",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-widest transition ${tones[tone]}`}
    >
      <Icon size={15} aria-hidden="true" />
      {children}
    </button>
  );
}

/**
 * Ações da moderação para um anúncio, conforme o status: na fila decide;
 * no ar tira do ar; fora do ar (recusado, ajustes, tirado) pode reaprovar.
 */
function ModerationActions({ listing, actions, compact = false }) {
  const { t } = useTranslation();
  const status = listing.moderationStatus;
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-2 sm:flex sm:flex-wrap sm:justify-end" : "grid-cols-2"}`}>
      {status === "pending" && (
        <>
          <QueueButton tone="green" icon={CheckCircle2} onClick={() => actions.approve(listing)}>
            {t("services.approve")}
          </QueueButton>
          <QueueButton tone="sky" icon={RotateCcw} onClick={() => actions.open(listing, "changes_requested")}>
            {t("services.return")}
          </QueueButton>
          <QueueButton tone="red" icon={XCircle} onClick={() => actions.open(listing, "rejected")}>
            {t("services.reject")}
          </QueueButton>
        </>
      )}
      {status === "approved" && (
        <QueueButton tone="red" icon={EyeOff} onClick={() => actions.open(listing, "suspended")}>
          {t("services.moderation.takedown")}
        </QueueButton>
      )}
      {["changes_requested", "rejected", "suspended"].includes(status) && (
        <QueueButton tone="green" icon={CheckCircle2} onClick={() => actions.approve(listing)}>
          {status === "suspended" ? t("services.moderation.restore") : t("services.approve")}
        </QueueButton>
      )}
    </div>
  );
}

/** O bloco de moderação dentro do detalhe do anúncio. */
function ModerationPanel({ listing, actions }) {
  const { t, i18n } = useTranslation();
  const waiting = listing.moderationStatus === "pending" ? waitingInfo(listing, i18n.language) : null;
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-300">
          {t("services.moderation.panelTitle")}
        </p>
        <StatusBadge status={listing.moderationStatus} />
        {waiting?.label && (
          <span
            className={`text-xs font-bold ${waiting.overdue ? "text-[var(--engine-accent)]" : "text-[var(--engine-text-muted)]"}`}
          >
            {t("services.moderation.sent", { value: waiting.label })}
          </span>
        )}
      </div>
      {listing.moderationNote && (
        <p className="mt-3 rounded-lg bg-[var(--engine-surface)] px-3 py-2 text-xs font-semibold leading-5 text-[var(--engine-text)]">
          {listing.moderationNote}
        </p>
      )}
      <div className="mt-2">
        <ModerationActions listing={listing} actions={actions} />
      </div>
    </div>
  );
}

function QueueRow({ listing, actions, onOpen, extra = null }) {
  const { t, i18n } = useTranslation();
  const waiting = listing.moderationStatus === "pending" ? waitingInfo(listing, i18n.language) : null;
  return (
    <article className="grid gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3 sm:grid-cols-[88px_minmax(0,1fr)] sm:p-4 lg:grid-cols-[88px_minmax(0,1fr)_auto] lg:items-center">
      <button
        type="button"
        onClick={() => onOpen(listing)}
        className="overflow-hidden rounded-lg"
        aria-label={t("services.review")}
      >
        <ListingPhoto
          src={listing.photos?.[0]}
          listing={listing}
          placeholderSize="sm"
          className="h-28 w-full object-cover sm:h-[66px] sm:w-[88px]"
        />
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={listing.moderationStatus} />
          {waiting?.label && (
            <span
              className={`text-xs font-bold ${waiting.overdue ? "text-[var(--engine-accent)]" : "text-[var(--engine-text-muted)]"}`}
            >
              {t("services.moderation.sent", { value: waiting.label })}
              {waiting.overdue && ` · ${t("services.moderation.overdue", { hours: APPROVAL_SLA_HOURS })}`}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpen(listing)}
          className="mt-2 block max-w-full text-left text-sm font-bold italic text-[var(--engine-text)] hover:text-[var(--engine-accent)] dark:text-white"
        >
          <span className="line-clamp-2">{listing.title || t("services.untitledListing")}</span>
        </button>
        <p className="mt-1 text-xs font-semibold text-[var(--engine-text-muted)]">
          {[listing.providerName, getServiceCategoryLabel(listing.category, t), listing.city || t("services.noCity")]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-1 text-xs font-semibold text-[var(--engine-text-muted)]">
          {[listing.whatsapp, listing.instagram && `@${listing.instagram}`].filter(Boolean).join(" · ") ||
            t("services.noPhone")}
        </p>
        {listing.moderationNote && listing.moderationStatus !== "pending" && (
          <p className="mt-2 line-clamp-2 rounded-lg bg-[var(--engine-surface-2)] px-3 py-2 text-xs font-semibold leading-5 text-[var(--engine-text-muted)]">
            {listing.moderationNote}
          </p>
        )}
        {extra}
      </div>
      <div className="sm:col-span-2 lg:col-span-1">
        <ModerationActions listing={listing} actions={actions} compact />
      </div>
    </article>
  );
}

function ApprovalQueue({ listings, reports, actions, onOpen, onDismissReports }) {
  const { t } = useTranslation();
  // Do mais antigo para o mais novo: quem espera há mais tempo vem primeiro.
  const pending = listings
    .filter((listing) => listing.moderationStatus === "pending")
    .sort((a, b) => timeOf(a) - timeOf(b));
  const byId = Object.fromEntries(listings.map((listing) => [listing.id, listing]));
  const reportGroups = Object.values(
    reports.reduce((groups, report) => {
      const group = groups[report.listingId] || { listingId: report.listingId, items: [] };
      group.items.push(report);
      return { ...groups, [report.listingId]: group };
    }, {}),
  )
    .map((group) => ({ ...group, listing: byId[group.listingId] }))
    .filter((group) => group.listing);
  const reviewed = listings
    .filter((listing) =>
      ["approved", "changes_requested", "rejected", "suspended"].includes(listing.moderationStatus),
    )
    .sort((a, b) =>
      String(b.reviewedAt || b.updatedAt || "").localeCompare(String(a.reviewedAt || a.updatedAt || "")),
    )
    .slice(0, 12);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 dark:bg-amber-500/5 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--engine-text)] dark:text-white">
            <ShieldCheck size={18} className="text-amber-500" />
            {t("services.approvalTitle")}
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px]">{pending.length}</span>
          </h2>
          {pending.length > 1 && (
            <p className="text-xs font-semibold text-[var(--engine-text-muted)]">
              {t("services.moderation.oldestFirst")}
            </p>
          )}
        </div>
        {pending.length ? (
          <div className="mt-4 grid gap-3">
            {pending.map((listing) => (
              <QueueRow key={listing.id} listing={listing} actions={actions} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm font-medium text-[var(--engine-text-muted)]">
            {t("services.noPendingApprovals")}
          </p>
        )}
      </section>

      {reportGroups.length > 0 && (
        <section className="rounded-2xl border border-[var(--engine-accent)]/30 bg-[var(--engine-accent-soft)] p-3 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--engine-text)] dark:text-white">
            <Flag size={17} className="text-[var(--engine-accent)]" />
            {t("services.moderation.reportsTitle")}
            <span className="rounded-full bg-[var(--engine-accent)]/15 px-2 py-0.5 text-[11px]">
              {reportGroups.length}
            </span>
          </h2>
          <div className="mt-4 grid gap-3">
            {reportGroups.map((group) => (
              <QueueRow
                key={group.listingId}
                listing={group.listing}
                actions={actions}
                onOpen={onOpen}
                extra={
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs font-black uppercase tracking-widest text-[var(--engine-accent)]">
                      {t("services.moderation.reportCount", { count: group.items.length })}
                    </p>
                    <ul className="space-y-1">
                      {group.items.slice(0, 3).map((report) => {
                        const [code, ...rest] = String(report.reason || "").split(":");
                        const known = ["scam", "fake", "offensive", "wrong", "other"].includes(code);
                        return (
                          <li key={report.id} className="text-xs font-semibold leading-5 text-[var(--engine-text)] dark:text-white">
                            {known ? t(`services.report.reasons.${code}`) : report.reason}
                            {known && rest.join(":").trim() && (
                              <span className="text-[var(--engine-text-muted)]">: {rest.join(":").trim()}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      onClick={() => onDismissReports(group.listingId)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-xs font-bold text-[var(--engine-text-muted)] underline-offset-2 transition hover:text-[var(--engine-text)] hover:underline"
                    >
                      {t("services.moderation.dismissReports")}
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--engine-text)] dark:text-white">
            {t("services.approvalHistory")}
          </h2>
          <p className="text-xs font-semibold text-[var(--engine-text-muted)]">
            {t("services.moderation.historyHint")}
          </p>
        </div>
        {reviewed.length ? (
          <div className="grid gap-3">
            {reviewed.map((listing) => (
              <QueueRow key={listing.id} listing={listing} actions={actions} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <p className="text-sm font-bold text-[var(--engine-text-muted)]">
            {t("services.approvalHistoryEmpty")}
          </p>
        )}
      </section>
    </div>
  );
}

function RejectionModal({ listing, note, action, onChangeNote, onCancel, onConfirm }) {
  const { t } = useTranslation();
  useHistoryDismiss(Boolean(listing), onCancel);
  if (!listing) return null;
  const copy = {
    rejected: {
      title: t("services.rejectListing"),
      confirm: t("services.rejectListing"),
      icon: XCircle,
      tone: "bg-[var(--engine-accent)] hover:brightness-95",
    },
    suspended: {
      title: t("services.moderation.takedownTitle"),
      confirm: t("services.moderation.takedown"),
      icon: EyeOff,
      tone: "bg-[var(--engine-accent)] hover:brightness-95",
    },
    changes_requested: {
      title: t("services.returnAdjustments"),
      confirm: t("services.returnWithChanges"),
      icon: RotateCcw,
      tone: "bg-sky-700 hover:bg-sky-800",
    },
  }[action] || {};
  const ConfirmIcon = copy.icon || RotateCcw;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        className="engine-safe-bottom max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5 shadow-2xl sm:max-h-[92vh] sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--engine-accent)]">
              {t("services.feedbackTitle")}
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">
              {copy.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-accent)] hover:text-white"
            title={t("common.cancel")}
            aria-label={t("common.cancel")}
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

        {action === "suspended" && (
          <p className="mt-4 text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
            {t("services.moderation.takedownCopy")}
          </p>
        )}

        <label className="mt-5 grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
            {t("services.feedbackReason")}
          </span>
          <textarea
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
            placeholder={
              action === "suspended"
                ? t("services.moderation.takedownPlaceholder")
                : t("services.feedbackPlaceholder")
            }
            className="min-h-36 w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3 text-sm font-bold leading-6 text-[var(--engine-text)] outline-none transition placeholder:text-[var(--engine-text-subtle)] focus:border-[var(--engine-accent)] focus:bg-[var(--engine-surface)] dark:text-white dark:[color-scheme:dark] dark:placeholder:text-[var(--engine-text-muted)] dark:focus:bg-[var(--engine-elevated)]"
          />
        </label>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold uppercase text-white transition ${copy.tone}`}
          >
            <ConfirmIcon size={18} />
            {copy.confirm}
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

/**
 * Decidir sobre um anúncio (aprovar, devolver, recusar, tirar do ar), igual
 * na fila de /services/approvals e no detalhe aberto da vitrine.
 */
function useListingModeration(user, { onDecided } = {}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [target, setTarget] = useState(null);
  const [note, setNote] = useState("");
  const [action, setAction] = useState("changes_requested");

  const done = {
    approved: "services.flash.approved",
    changes_requested: "services.flash.returned",
    rejected: "services.flash.rejected",
    suspended: "services.moderation.takedownDone",
  };

  const approve = async (listing) => {
    try {
      await engineDB.moderateServiceListing(listing.id, "approved", "", user?.uid);
      toast(t(done.approved));
      onDecided?.(listing, "approved");
    } catch (error) {
      console.error(error);
      toast(t("services.flash.approveError"), "error");
    }
  };

  const open = (listing, nextAction) => {
    setAction(nextAction);
    setTarget(listing);
    // Tirar do ar pede um motivo novo; devolver/recusar parte do anterior.
    setNote(nextAction === "suspended" ? "" : listing.moderationNote || "");
  };

  const close = () => {
    setTarget(null);
    setNote("");
    setAction("changes_requested");
  };

  const confirmDecision = async () => {
    if (!target) return;
    if (!note.trim()) {
      toast(t("services.flash.feedbackRequired"));
      return;
    }
    try {
      await engineDB.moderateServiceListing(target.id, action, note, user?.uid);
      toast(t(done[action]));
      onDecided?.(target, action);
      close();
    } catch (error) {
      console.error(error);
      toast(t("services.flash.feedbackError"), "error");
    }
  };

  const modal = (
    <RejectionModal
      listing={target}
      note={note}
      action={action}
      onChangeNote={setNote}
      onCancel={close}
      onConfirm={confirmDecision}
    />
  );

  return { approve, open, modal };
}

export function Services({ user, settings }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [query, setQuery] = useState("");
  // `?cat=` deixa um link já chegar filtrado — é por aí que a grade de
  // categorias da Busca manda a pessoa para cá. Valor desconhecido vira
  // "all", para link velho ou torto não mostrar tela vazia.
  const [category, setCategory] = useState(() => {
    // Lido da URL direto, e não do `useSearchParams`: este estado nasce antes
    // daquele gancho na ordem do componente, e só precisa do valor inicial.
    const pedida = new URLSearchParams(window.location.search).get("cat") || "";
    const valida = pedida ? normalizeServiceCategory(pedida) : "";
    return valida && valida !== "other" ? valida : pedida === "other" ? "other" : "all";
  });
  const [mode, setMode] = useState("all");
  // A região ativa (header) semeia o filtro de localização dos Serviços: ao
  // abrir, já vem pré-filtrado pela região do usuário. Depois ele pode mexer
  // livremente nos selects — a região só define o ponto de partida.
  const { region } = useRegion();
  const [countryFilter, setCountryFilter] = useState(() => region.country);
  const [stateFilter, setStateFilter] = useState(() => region.state);
  const [cityFilter, setCityFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // `?publish=1`: quem tocou em "Cadastrar" sem conta e acabou de entrar
  // volta direto para o formulário, com o rascunho que tiver.
  const [searchParams, setSearchParams] = useSearchParams();
  const wantsPublish = searchParams.get("publish") === "1";
  const [initialDraft] = useState(() =>
    wantsPublish && user?.uid ? readListingDraft(user.uid) : null,
  );
  const [form, setForm] = useState(() =>
    initialDraft
      ? { ...makeInitialForm(settings, user), ...initialDraft, id: "" }
      : makeInitialForm(settings, user),
  );
  const [editorOpen, setEditorOpen] = useState(() => wantsPublish && Boolean(user?.uid));
  const [gateOpen, setGateOpen] = useState(() => wantsPublish && !user?.uid);
  const [draftRestored, setDraftRestored] = useState(() => Boolean(initialDraft));
  // O anúncio como estava ao abrir o editor (null = anúncio novo).
  const [editingOriginal, setEditingOriginal] = useState(null);
  // Depois de enviar para a fila, o editor mostra o "recebido" com o prazo.
  const [submitted, setSubmitted] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [detailListing, setDetailListing] = useState(null);
  // Conta profissional (substitui o antigo "Perfil de vendedor"): abre pelo
  // botão do hero ou pelo aviso de convite (?pro=1).
  const [sellerProfileOpen, setSellerProfileOpen] = useState(() => searchParams.get("pro") === "1" && Boolean(user?.uid));
  const pro = useMyPro(user?.uid);
  // Serviços | Lojas (?aba=lojas).
  const [tab, setTab] = useState(() => (searchParams.get("aba") === "lojas" ? "shops" : "services"));
  const [productEditor, setProductEditor] = useState(null); // { profileId }
  const [sellerListingsOpen, setSellerListingsOpen] = useState(false);
  const { isAdmin } = useServiceAdmin(user);
  // A moderação também age do detalhe aberto na vitrine (ex.: tirar do ar
  // um anúncio aprovado que alguém denunciou).
  const moderation = useListingModeration(user, {
    onDecided: () => setDetailListing(null),
  });
  const sellerProfile = useMemo(
    () => getSellerProfile(settings, user),
    [settings, user],
  );

  // Produto (Lojas) mora na mesma tabela; a vitrine de serviços só serviço.
  useEffect(
    () =>
      engineDB.subscribeServiceListings(
        (all) => setListings(all.filter((listing) => listing.kind !== "product")),
        { userId: user?.uid, isAdmin },
      ),
    [isAdmin, user?.uid],
  );

  // O `publish=1` já foi lido na montagem; sai da barra de endereço para um
  // recarregar não reabrir o formulário.
  useEffect(() => {
    if (!wantsPublish && !searchParams.get("pro")) return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("publish");
        next.delete("pro");
        return next;
      },
      { replace: true },
    );
    // Só na chegada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsPublish, setSearchParams]);

  const switchTab = (next) => {
    setTab(next);
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === "shops") params.set("aba", "lojas");
        else params.delete("aba");
        return params;
      },
      { replace: true },
    );
  };

  // Anunciar produto: sem perfil profissional, primeiro a conta profissional.
  const openProductEditor = (profileId = "") => {
    if (!user?.uid) {
      setGateOpen(true);
      return;
    }
    if (!pro.publishable.length) {
      setSellerProfileOpen(true);
      return;
    }
    setProductEditor({ profileId: profileId || pro.publishable[0].profile.id });
  };

  // Rascunho do anúncio NOVO enquanto o editor está aberto. Editar um
  // anúncio que já existe não gera rascunho: o original está no banco.
  useEffect(() => {
    if (editorOpen && !form.id && !submitted && user?.uid) {
      writeListingDraft(user.uid, form);
    }
  }, [editorOpen, form, submitted, user?.uid]);

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
  // O país escolhido entra mesmo sem anúncio: o select nunca pode mostrar
  // "Todos" enquanto filtra por outra coisa (era o que acontecia com a
  // região do header numa cidade ainda vazia).
  const countryOptions = useMemo(() => {
    const codes = new Set(
      approvedListings.map((listing) => listing.country?.trim()).filter(Boolean),
    );
    if (countryFilter !== "all") codes.add(countryFilter);
    return Array.from(codes)
      .map((code) => ({ code, name: getCountryName(code) || code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [approvedListings, countryFilter]);

  // Estados presentes, respeitando o país selecionado (+ o escolhido).
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
    if (stateFilter !== "all") codes.add(stateFilter);
    return Array.from(codes)
      .map((code) => ({
        code,
        name:
          getStateName(countryFilter === "all" ? "" : countryFilter, code) || code,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [approvedListings, countryFilter, stateFilter]);

  // Cidades presentes, respeitando país + estado selecionados (+ a escolhida).
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
    if (cityFilter !== "all") cities.add(cityFilter);
    return Array.from(cities).sort((a, b) => a.localeCompare(b));
  }, [approvedListings, countryFilter, stateFilter, cityFilter]);

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

  // Nome legível de um recorte de lugar ("Araraquara", "São Paulo", "Brasil").
  const scopeLabel = (scope) => {
    if (scope.city !== "all") return scope.city;
    if (scope.state !== "all") {
      return getStateName(scope.country === "all" ? "" : scope.country, scope.state) || scope.state;
    }
    if (scope.country !== "all") return getCountryName(scope.country) || scope.country;
    return "";
  };

  /**
   * Busca + categoria + modo filtram sempre. O lugar é honesto e alarga
   * sozinho: cidade sem serviço -> mostra o estado; estado vazio -> o país;
   * país vazio -> tudo. A tela diz que alargou e de onde para onde, em vez
   * de uma grade vazia com "ajuste os filtros".
   */
  const regionResult = useMemo(() => {
    const cleanQuery = foldText(query.trim());
    const base = approvedListings.filter((listing) => {
      const normalizedCategory = normalizeServiceCategory(listing.category);
      const matchesCategory = category === "all" || normalizedCategory === category;
      const matchesMode = mode === "all" || listing.serviceMode === mode;
      if (!matchesCategory || !matchesMode) return false;
      if (!cleanQuery) return true;
      // Sem acento dos dois lados: "estetica" acha "Estética".
      const text = foldText(
        [
          listing.title,
          listing.providerName,
          getServiceCategoryLabel(listing.category, t),
          listing.description,
          listing.city,
          listing.serviceArea,
          ...(listing.tags || []),
        ].join(" "),
      );
      return text.includes(cleanQuery);
    });

    const inScope = (listing, scope) =>
      (scope.country === "all" || !listing.country || listing.country === scope.country) &&
      (scope.state === "all" || !listing.state || listing.state === scope.state) &&
      (scope.city === "all" || (listing.city?.trim() || "") === scope.city);

    const requested = { country: countryFilter, state: stateFilter, city: cityFilter };
    const scopes = [requested];
    if (requested.city !== "all") scopes.push({ ...requested, city: "all" });
    if (requested.state !== "all") scopes.push({ country: requested.country, state: "all", city: "all" });
    if (requested.country !== "all") scopes.push({ country: "all", state: "all", city: "all" });

    for (const scope of scopes) {
      const items = base.filter((listing) => inScope(listing, scope));
      if (items.length) {
        return {
          items,
          widened: scope !== requested,
          requestedLabel: scopeLabel(requested),
          shownLabel: scopeLabel(scope),
        };
      }
    }
    return { items: [], widened: false, requestedLabel: scopeLabel(requested), shownLabel: "" };
  }, [approvedListings, category, mode, countryFilter, stateFilter, cityFilter, query, t]);
  const filteredListings = regionResult.items;

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

  const openEditor = (listing = null, profileId = "") => {
    // Sem conta, a conta vem ANTES do formulário (e o login devolve para cá).
    if (!user?.uid) {
      setGateOpen(true);
      return;
    }
    setDetailListing(null);
    setSubmitted(null);
    if (listing) {
      setEditingOriginal(listing);
      setDraftRestored(false);
      setForm({
        ...emptyForm,
        ...listing,
        category: listing.category ? normalizeServiceCategory(listing.category) : "",
        country: listing.country || sellerProfile.country || "BR",
        state: listing.state || sellerProfile.state || "",
        ...splitStoredPhone(listing.whatsapp, listing.whatsappCountry),
        tags: (listing.tags || []).join(", "),
        photos: listing.photos || [],
      });
    } else {
      const draft = readListingDraft(user.uid);
      setEditingOriginal(null);
      setDraftRestored(Boolean(draft));
      setForm({
        ...(draft ? { ...makeInitialForm(settings, user), ...draft, id: "" } : makeInitialForm(settings, user)),
        profileId: profileId || draft?.profileId || "",
      });
    }
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setSubmitted(null);
    setEditingOriginal(null);
    setDraftRestored(false);
    resetForm();
  };

  const discardDraft = () => {
    clearListingDraft();
    setDraftRestored(false);
    resetForm();
  };

  const uploadPhotos = async (files) => {
    if (!files.length) return;
    if (!user?.uid) {
      // Só chega aqui quem entrou e teve a sessão encerrada no meio: o
      // rascunho fica salvo e o login devolve ao formulário.
      flash(t("services.flash.sessionEnded"));
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
      const urls = await Promise.all(
        selectedFiles.map(async (file) => {
          if (!isImageFile(file)) {
            throw new Error(t("services.flash.invalidFile"));
          }
          if (file.size > MAX_RAW_PHOTO_BYTES) {
            throw new Error(t("services.flash.maxPhotoSize"));
          }
          // Sempre comprimida no aparelho antes de subir: 1600px, JPEG.
          // Sem a cópia em base64 dentro do anúncio que existia antes — ela
          // pesava para todo visitante da vitrine.
          let blob;
          try {
            blob = await compressPhotoForUpload(file);
          } catch {
            throw new Error(t("services.flash.photoUnreadable"));
          }
          const path = `users/${user.uid}/services/${Date.now()}-${crypto.randomUUID()}.jpg`;
          return withUploadTimeout(
            uploadToStorage(path, blob, "image/jpeg"),
            t("services.flash.photoTimeout"),
          );
        }),
      );
      setForm((current) => ({
        ...current,
        photos: [...(current.photos || []), ...urls].slice(0, MAX_PHOTOS),
      }));
      flash(t("services.flash.photoAdded"));
    } catch (error) {
      console.error(error);
      flash(error?.message || t("services.flash.photoUploadError"));
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

  // Nome legível dos campos que mandam a edição de volta para a fila.
  const fieldLabel = (key) =>
    ({
      photos: t("services.fields.photos"),
      title: t("services.fields.title"),
      category: t("services.fields.category"),
      description: t("services.fields.description"),
      providerName: t("services.fields.providerName"),
      serviceMode: t("services.fields.serviceMode"),
      country: t("services.fields.country"),
      state: t("services.fields.state"),
      city: t("services.fields.city"),
      address: t("services.fields.address"),
      experience: t("services.fields.experience"),
      tags: t("services.form.tagsShort"),
      website: t("services.fields.website"),
      videoUrl: t("services.fields.videoUrl"),
    })[key] || key;

  const submitListing = async (event) => {
    event.preventDefault();
    if (!user?.uid) {
      // Sessão caiu com o formulário aberto: o rascunho já está salvo.
      navigate(authPath("/login", PUBLISH_PATH));
      return;
    }
    // O aviso é um toast no topo, e o formulário é longo: no celular a pessoa
    // está lá embaixo, no botão. Além de avisar, leva até o campo que falta.
    const faltando = (id, mensagem) => {
      toast(mensagem, "error");
      const campo = document.getElementById(id);
      campo?.scrollIntoView({ block: "center", behavior: "smooth" });
      campo?.focus({ preventScroll: true });
    };
    const hasStates = getStates(form.country).length > 0;
    if (!(form.photos || []).length) {
      faltando("svc-photos", t("services.flash.photoRequired"));
      return;
    }
    if (!form.title.trim()) {
      faltando("svc-title", t("services.flash.titleRequired"));
      return;
    }
    if (!form.category) {
      faltando("svc-category", t("services.flash.categoryRequired"));
      return;
    }
    if (!isWhatsAppComplete(form.whatsapp, form.whatsappCountry)) {
      faltando("svc-whatsapp", t("services.flash.whatsappRequired"));
      return;
    }
    if (hasStates && !form.state) {
      faltando("svc-state", t("services.flash.stateRequired"));
      return;
    }
    if (!form.city.trim()) {
      faltando("svc-city", t("services.flash.cityRequired"));
      return;
    }
    if (form.serviceMode === "place" && !form.address.trim()) {
      faltando("svc-address", t("services.flash.addressRequired"));
      return;
    }
    if (!isCityInCountry(form.country, form.city)) {
      faltando("svc-city", t("services.flash.cityCountryMismatch"));
      return;
    }

    // Link solto no texto manda o anúncio para a fila (filtro do banco). Dá
    // para avisar antes e poupar a espera — o campo Site existe para isso.
    if (freeTextHasLink(form)) {
      const ok = await confirm({
        title: t("services.linkWarning.title"),
        message: t("services.linkWarning.message"),
        confirmLabel: t("services.linkWarning.confirm"),
        cancelLabel: t("services.linkWarning.cancel"),
        tone: "neutral",
      });
      if (!ok) {
        faltando("svc-description", t("services.linkWarning.title"));
        return;
      }
    }

    // Publicado como página: o nome do anúncio é o da página.
    const asPage = pro.pages.find((entry) => entry.profile.id === form.profileId)?.profile || null;
    const candidate = {
      ...form,
      category: normalizeServiceCategory(form.category),
      ...(asPage ? { providerName: asPage.name } : {}),
    };
    const original = editingOriginal;

    // Anúncio no ar: avisa ANTES se a edição tira ele do ar até a revisão.
    if (original?.moderationStatus === "approved" && !isAdmin) {
      const before = normalizeServiceListing(original);
      const after = normalizeServiceListing({ ...original, ...candidate });
      if (listingEditNeedsReview(before, after)) {
        const fields = changedReviewKeys(before, after).map(fieldLabel).join(", ");
        const ok = await confirm({
          title: t("services.editWarning.title"),
          message: t("services.editWarning.message", { fields, hours: APPROVAL_SLA_HOURS }),
          confirmLabel: t("services.editWarning.confirm"),
          tone: "neutral",
        });
        if (!ok) return;
      }
    }

    setSaving(true);
    try {
      const { queued } = await engineDB.saveServiceListing(candidate, settings, user.uid, {
        isAdmin,
        original,
      });
      if (!form.id) clearListingDraft();
      if (queued) {
        setSubmitted({ isNew: !form.id });
      } else if (!form.id) {
        // Anúncio novo que passou pelo filtro: já está na vitrine.
        setSubmitted({ isNew: true, live: true });
      } else {
        flash(t("services.flash.liveUpdated"));
        closeEditor();
      }
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

  return (
    /* No celular a ordem da tela é outra, e por isso o `flex` com `order` em
       vez do `space-y` de antes (margem entre irmãos não sobrevive a troca de
       ordem). Medido em 11/11/2026 num aparelho de 390px: antes do primeiro
       serviço vinham a faixa de números, o painel do anunciante, o segmento
       Serviços/Lojas e o cartão de orçamento — a primeira tela de um
       marketplace não mostrava nenhum anúncio. Agora busca, categorias e
       resultados vêm primeiro; o painel de quem anuncia e o convite de
       orçamento descem para depois da lista, e continuam a um gesto de
       distância. De 640px para cima a ordem volta a ser a do código. */
    <section className="flex flex-col gap-5 pb-28 sm:gap-8 sm:pb-10">

      <header className="order-6 -mx-4 overflow-hidden border-y border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text)] shadow-none sm:order-none sm:mx-0 sm:rounded-2xl sm:border sm:shadow-xl dark:text-white dark:shadow-none">
        {/* No celular o título em caixa alta mais o subtítulo tomavam a tela
            inteira antes de qualquer anúncio aparecer. Lá o cabeçalho é uma
            linha; a explicação fica para o desktop, onde sobra espaço. */}
        <div
          className={`grid gap-4 p-4 sm:gap-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-8 ${
            user?.uid && stats.total === 0 ? "max-sm:hidden" : ""
          }`}
        >
          {/* Quem já entrou não precisa do anúncio da seção: no celular o
              título em caixa alta era a primeira coisa da tela, toda vez. */}
          <div className={user?.uid ? "hidden sm:block" : ""}>
            <h1 className="max-w-4xl text-lg font-extrabold uppercase italic leading-tight tracking-tight sm:text-3xl">
              {t("services.title")}
            </h1>
            <p className="mt-3 hidden max-w-2xl text-sm font-medium leading-6 text-[var(--engine-text-muted)] sm:block">
              {t("services.subtitle")}
            </p>
          </div>

          {/* Contador zerado não aparece: "0 serviços ativos" no primeiro
              dia é prova social contra. */}
          {stats.total > 0 && (
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:w-[460px]">
              <HeroStat icon={BriefcaseBusiness} label={t("services.stats.active")} value={stats.total} tone="red" />
              {stats.mobileCount > 0 && (
                <HeroStat icon={Navigation} label={t("services.stats.mobile")} value={stats.mobileCount} tone="sky" />
              )}
              {stats.cities > 0 && (
                <HeroStat icon={MapPin} label={t("services.stats.cities")} value={stats.cities} tone="emerald" />
              )}
            </div>
          )}
        </div>

        <SellerBar
          sellerProfile={sellerProfile}
          listingCount={myListings.length}
          bioListing={myBioListing}
          isAdmin={isAdmin}
          pendingApprovalsCount={pendingApprovalsCount}
          storageKey={`engine:services:sellerPanel:${user?.uid || "anon"}`}
          guest={!user?.uid}
          onOpenProfile={() => (user?.uid ? setSellerProfileOpen(true) : setGateOpen(true))}
          onOpenListings={() => setSellerListingsOpen(true)}
          onCreate={() => openEditor()}
          onOpenApprovals={() => navigate("/services/approvals")}
        />
      </header>

      {/* Serviços | Lojas no segmento do protótipo aprovado (01/11/2026). */}
      <div className="order-1 sm:order-none">
        <ShopSegment value={tab === "shops" ? "shops" : "services"} onChange={switchTab} />
      </div>

      {tab === "shops" && <ShopsTab user={user} region={region} onNewProduct={() => openProductEditor()} />}

      {tab === "services" && (
      <>
      <div className="order-5 sm:order-none">
        <QuoteEntryCard user={user} isProvider={Boolean(myBioListing)} />
      </div>

      <div className="engine-card order-2 flex flex-col p-4 sm:order-none sm:p-5">
        {/* Cabeçalho: alterna a exibição dos filtros avançados. No celular ele
            desce para baixo da busca — quem chega quer digitar ou tocar numa
            categoria, não configurar filtro. */}
        <div className="order-2 mt-3 flex items-center justify-between gap-3 sm:order-none sm:mt-0">
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
        <label className="order-1 flex h-12 items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 transition-colors focus-within:border-[var(--engine-accent)] sm:order-none sm:mt-4">
          <Search size={18} className="shrink-0 text-[var(--engine-text-subtle)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("services.search")}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--engine-text)] outline-none placeholder:text-[var(--engine-text-subtle)]"
          />
        </label>

        {/* Atalho de categoria na própria tela. As 21 categorias com ícone já
            existiam, mas só dentro do painel de filtros, que começa fechado —
            e quem chega sem saber o nome do que procura ("funileiro" ou
            "martelinho"?) precisa justamente desse atalho antes de tudo. As 8
            primeiras ficam à mão; "ver todas" abre o painel com a lista
            inteira. É o que OLX e Marketplace põem no topo da primeira tela. */}
        <div className="engine-scroll order-3 -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:order-none">
          {serviceCategories.slice(0, 8).map((item) => {
            const active = category === item.value;
            const Icon = categoryIcons[item.value] || Store;
            return (
              <button
                key={`atalho-${item.value}`}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(active ? "all" : item.value)}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition ${
                  active
                    ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                    : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:border-[var(--engine-border-strong)] hover:text-[var(--engine-text)]"
                }`}
              >
                <Icon size={15} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
                <span className="whitespace-nowrap">{t(item.labelKey)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-[var(--engine-border-strong)] px-3 text-xs font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
          >
            <span className="whitespace-nowrap">{t("services.allCategories")}</span>
            <ChevronRight size={14} className="shrink-0" />
          </button>
        </div>

        {/* Filtros avançados — recolhíveis */}
        <div
          className={`order-4 grid transition-all duration-300 ease-out sm:order-none ${
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

      {regionResult.widened && (
        <div
          role="status"
          className="order-3 flex items-start gap-3 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4 text-sm font-semibold leading-6 text-[var(--engine-text)] sm:order-none"
        >
          <MapPin size={18} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
          <span>
            {regionResult.shownLabel
              ? t("services.region.widened", {
                  place: regionResult.requestedLabel,
                  wider: regionResult.shownLabel,
                })
              : t("services.region.widenedAll", { place: regionResult.requestedLabel })}
          </span>
        </div>
      )}

      {/* Duas colunas no celular. Até aqui a grade era `minmax(280px, 1fr)`,
          que num aparelho de 390px resolve para UMA coluna — e uma coluna de
          cartão alto mostra um serviço e meio por tela. Com duas, a foto
          continua grande e a pessoa compara quatro de uma vez, que é como
          OLX e Marketplace mostram. De 640px para cima nada muda. */}
      <div className="order-4 grid grid-cols-2 gap-2.5 sm:order-none sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
        {filteredListings.length ? (
          filteredListings.map((listing, index) => (
            <Fragment key={listing.id}>
              <ServiceCard
                listing={listing}
                isMine={listing.ownerId === user?.uid}
                user={user}
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
          <div className="col-span-2 flex min-h-[280px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--engine-border)] bg-[var(--engine-surface)] p-6 text-center sm:p-8 xl:col-span-3 2xl:col-span-4">
            <BriefcaseBusiness className="mb-4 text-[var(--engine-accent)]" size={42} />
            <h2 className="text-lg font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">
              {approvedListings.length ? t("services.emptyTitle") : t("services.region.emptyAllTitle")}
            </h2>
            <p className="mt-3 max-w-sm text-sm font-medium text-[var(--engine-text-muted)]">
              {approvedListings.length ? t("services.region.emptyFiltered") : t("services.region.emptyAllCopy")}
            </p>
            {activeFilterCount > 0 && approvedListings.length > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] dark:text-white"
              >
                <RotateCcw size={15} aria-hidden="true" />
                {t("services.clearFilters")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cidade vazia, alargou, ou ainda é pouca gente: convite para indicar
          o Engine a um prestador que a pessoa já conhece. */}
      {(regionResult.widened || filteredListings.length < 3) && (
        <InviteProviderCard place={regionResult.requestedLabel} />
      )}
      </>
      )}

      {editorOpen && (
        <ListingEditorModal
          form={form}
          sellerProfile={sellerProfile}
          proOptions={pro.publishable}
          saving={saving}
          photoUploading={photoUploading}
          draftRestored={draftRestored}
          editingLive={editingOriginal?.moderationStatus === "approved"}
          submitted={submitted}
          onSubmit={submitListing}
          onChange={updateForm}
          onPhotoUpload={uploadPhotos}
          onPhotoRemove={removePhoto}
          onDiscardDraft={discardDraft}
          onOpenMyListings={() => {
            closeEditor();
            setSellerListingsOpen(true);
          }}
          onCancel={closeEditor}
        />
      )}

      <PublishSignInGate open={gateOpen} onClose={() => setGateOpen(false)} next={PUBLISH_PATH} />

      {sellerProfileOpen && user?.uid && (
        <ProAccountHub
          user={user}
          pro={pro}
          username={sellerProfile.username}
          seed={{
            name: sellerProfile.displayName,
            avatar: sellerProfile.avatar,
            data: {
              city: sellerProfile.city,
              state: sellerProfile.state,
              country: sellerProfile.country,
              ...splitStoredPhone(sellerProfile.phone),
            },
          }}
          onClose={() => setSellerProfileOpen(false)}
          onNewService={(profile) => {
            setSellerProfileOpen(false);
            switchTab("services");
            openEditor(null, profile.id);
          }}
          onNewProduct={(profile) => {
            setSellerProfileOpen(false);
            switchTab("shops");
            setProductEditor({ profileId: profile.id });
          }}
        />
      )}

      {productEditor && (
        <ProductEditor
          user={user}
          profiles={pro.publishable}
          profileId={productEditor.profileId}
          onClose={() => setProductEditor(null)}
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
        moderation={isAdmin && detailListing?.ownerId !== user?.uid ? moderation : null}
        onClose={() => setDetailListing(null)}
        onEdit={openEditor}
        onDelete={deleteListing}
      />

      {moderation.modal}
    </section>
  );
}

export function ServiceApprovals({ user }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportsVersion, setReportsVersion] = useState(0);
  const [detailListing, setDetailListing] = useState(null);
  const { isAdmin, checked } = useServiceAdmin(user);

  useEffect(() => {
    if (!isAdmin) return undefined;
    return engineDB.subscribeServiceListings(setListings, {
      userId: user?.uid,
      isAdmin: true,
    });
  }, [isAdmin, user?.uid]);

  // Denúncias abertas de anúncio. Relê depois de cada decisão.
  useEffect(() => {
    if (!isAdmin) return undefined;
    let alive = true;
    engineDB.fetchServiceListingReports().then((rows) => {
      if (alive) setReports(rows);
    });
    return () => {
      alive = false;
    };
  }, [isAdmin, reportsVersion]);

  const closeReports = async (listingId, status) => {
    try {
      await engineDB.resolveServiceListingReports(listingId, status);
    } catch (error) {
      console.error(error);
      toast(t("services.moderation.reportsError"), "error");
    }
    setReportsVersion((value) => value + 1);
  };

  const moderation = useListingModeration(user, {
    onDecided: (listing, action) => {
      setDetailListing(null);
      // Tirou do ar: as denúncias daquele anúncio foram atendidas.
      if (action === "suspended") closeReports(listing.id, "resolved");
    },
  });

  if (!checked) {
    return <div className="min-h-[40vh]" aria-busy="true" />;
  }

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
          className="mb-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--engine-border)] px-4 text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
        >
          {t("services.backToServices")}
        </button>
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-700 dark:text-amber-400">
          {t("services.adminKicker")}
        </p>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white sm:text-2xl">
          {t("services.approvals")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
          {t("services.moderation.pageCopy", { hours: APPROVAL_SLA_HOURS })}
        </p>
      </header>

      <ApprovalQueue
        listings={listings}
        reports={reports}
        actions={moderation}
        onOpen={setDetailListing}
        onDismissReports={(listingId) => closeReports(listingId, "dismissed")}
      />

      <ServiceDetailModal
        key={detailListing?.id || "nenhum"}
        listing={detailListing}
        isMine={false}
        user={user}
        moderation={moderation}
        onClose={() => setDetailListing(null)}
        onEdit={() => {}}
        onDelete={() => {}}
      />

      {moderation.modal}
    </section>
  );
}

function readSellerPanelOpen(key) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Barra do vendedor no rodapé do hero. Por padrão é uma faixa só: quem é,
 * o status, "Meus anúncios" e "Novo serviço". O link da bio e as aprovações
 * (admin) ficam no "Painel do vendedor", que lembra se ficou aberto.
 */
function SellerBar({
  sellerProfile,
  listingCount,
  bioListing,
  isAdmin,
  pendingApprovalsCount,
  storageKey,
  onOpenProfile,
  onOpenListings,
  onCreate,
  onOpenApprovals,
  guest = false,
}) {
  const { t } = useTranslation();
  const [panelOpen, setPanelOpen] = useState(() => readSellerPanelOpen(storageKey));
  const hasPanel = Boolean(bioListing) || isAdmin;
  const showPending = isAdmin && pendingApprovalsCount > 0;
  const expanded = hasPanel && panelOpen;

  const togglePanel = () => {
    const next = !panelOpen;
    setPanelOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // Sem localStorage (aba privada): só não lembra.
    }
  };

  const toggleClass =
    "min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-3 text-xs font-bold text-[var(--engine-text)] transition-colors hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)] dark:text-white";

  const toggleInner = (labelClass) => (
    <>
      <span className={labelClass}>{t("services.sellerPanel")}</span>
      {showPending && (
        <span
          className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-300"
          title={t("services.approvals")}
        >
          {pendingApprovalsCount}
        </span>
      )}
      <ChevronDown
        size={16}
        aria-hidden="true"
        className={`transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
      />
    </>
  );

  return (
    <div className="border-t border-[var(--engine-border)] bg-[var(--engine-surface-2)]">
      {/* Visitante: tudo numa linha só. Empilhado, o convite virava um bloco
          alto com um botão vermelho de ponta a ponta antes de qualquer
          anúncio — peso de dono numa tela de quem só está olhando. */}
      <div
        className={`flex gap-3 p-4 sm:flex-row sm:items-center sm:px-8 ${
          guest ? "flex-row items-center" : "flex-col"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onOpenProfile}
            title={t("services.editProfile")}
            className="group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--engine-accent)] text-sm font-bold uppercase text-white">
              {/* Visitante não tem nome: as iniciais saíam "UE", de "Usuario
                  Engine", com cara de defeito. */}
              {guest ? (
                <BriefcaseBusiness size={18} aria-hidden="true" />
              ) : sellerProfile.avatar ? (
                <img src={sellerProfile.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                getInitials(sellerProfile.displayName)
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold text-[var(--engine-text)] transition-colors group-hover:text-[var(--engine-accent)] dark:text-white">
                {/* Visitante não é "Usuario Engine · pronto": é um convite. */}
                {guest ? t("pro.guestSeller") : sellerProfile.displayName || t("services.sellerProfile")}
              </span>
              {guest ? (
                /* Numa linha só com o botão ao lado, a frase cortava no meio
                   ("Serviço ou produto, de …"). Fica para o desktop. */
                <span className="mt-0.5 hidden truncate text-xs font-medium text-[var(--engine-text-muted)] sm:block">
                  {t("pro.guestSellerHint")}
                </span>
              ) : (
                <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
                  <ShieldCheck size={12} aria-hidden="true" />
                  {listingCount ? t("services.activeSeller") : t("services.ready")}
                </span>
              )}
            </span>
          </button>

          {/* No celular o painel abre do lado do nome (só o ícone, para o nome
              caber); no desktop, ao fim da barra. */}
          {hasPanel && (
            <button
              type="button"
              onClick={togglePanel}
              aria-expanded={expanded}
              aria-controls="seller-panel"
              aria-label={t("services.sellerPanel")}
              title={t("services.sellerPanel")}
              className={`inline-flex sm:hidden ${toggleClass}`}
            >
              {toggleInner("sr-only")}
            </button>
          )}
        </div>

        <div
          className={`gap-2 sm:flex sm:shrink-0 sm:items-center ${
            guest
              ? "flex shrink-0 items-center"
              : "grid grid-cols-1 min-[360px]:grid-cols-[minmax(0,1fr)_auto]"
          }`}
        >
          {!guest && (
          <button
            type="button"
            onClick={onOpenListings}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-3 text-xs font-black uppercase tracking-normal text-[var(--engine-text)] sm:gap-2 sm:tracking-wider transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] dark:text-white sm:px-4"
          >
            <BriefcaseBusiness size={16} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{t("services.myListings")}</span>
            <span className="rounded-full bg-[var(--engine-surface-2)] px-2 py-0.5 text-[10px] text-[var(--engine-text-muted)]">
              {listingCount}
            </span>
          </button>
          )}
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-3 text-xs font-bold uppercase tracking-wide text-white transition hover:brightness-95 sm:px-4"
          >
            <Plus size={16} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{t("services.newService")}</span>
          </button>
          {hasPanel && (
            <button
              type="button"
              onClick={togglePanel}
              aria-expanded={expanded}
              aria-controls="seller-panel"
              aria-label={t("services.sellerPanel")}
              title={t("services.sellerPanel")}
              className={`hidden sm:inline-flex ${toggleClass}`}
            >
              {toggleInner("hidden lg:inline")}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div
          id="seller-panel"
          className={`grid gap-3 border-t border-[var(--engine-border)] p-4 sm:px-8 sm:pb-6 ${
            bioListing && isAdmin ? "md:grid-cols-[minmax(0,1fr)_280px] md:items-start" : ""
          }`}
        >
          {bioListing && <BioLinkCard listing={bioListing} compact />}
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenApprovals}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 text-sm font-black uppercase tracking-widest text-amber-700 transition hover:border-amber-500 hover:bg-amber-500/15 dark:text-amber-300"
            >
              <ShieldCheck size={17} aria-hidden="true" />
              {t("services.approvals")}
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px]">
                {pendingApprovalsCount}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
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

