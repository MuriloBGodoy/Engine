import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CalendarClock,
  Car,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  ExternalLink,
  Flag,
  ImagePlus,
  Inbox,
  Loader2,
  MapPin,
  MessageCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { useSocialReport } from "../hooks/useSocialReport";
import { useRegion } from "../hooks/RegionProvider";
import { serviceConversationId, startServiceConversation } from "../services/chat";
import { CAR_TYPE_OWNED } from "../services/db";
import { formatCarName, formatFipeYear } from "../services/carDisplay";
import { getCities, getStates } from "../services/locations";
import { isImageFile } from "../services/photos";
import {
  categoryIcons,
  getServiceCategoryLabel,
  getWhatsAppHref,
  serviceCategories,
} from "../services/serviceListingDisplay";
import { serviceListingPath } from "../services/serviceListingPublic";
import {
  QUOTE_CAR_MAX,
  QUOTE_DEFAULT_LIMITS,
  QUOTE_DESCRIPTION_MAX,
  QUOTE_DESCRIPTION_MIN,
  QUOTE_REPLY_MESSAGE_MAX,
  QUOTE_REPLY_TIME_MAX,
  QUOTE_URGENCIES,
  QUOTE_CONTACTS,
  closeQuoteRequest,
  createQuoteRequest,
  daysLeft,
  fetchMyQuoteRequests,
  fetchQuoteInbox,
  fetchQuoteLimits,
  formatQuotePrice,
  parsePrice,
  prepareQuotePhoto,
  quoteErrorKey,
  replyToQuoteRequest,
} from "../services/quotes";

/**
 * Pedido de orçamento — /services/orcamentos.
 *
 *   ?new=1            abre o formulário (o "Pedir orçamento" de Serviços)
 *   ?tab=inbox        caixa do prestador ("Pedidos na sua região")
 *   ?req=<id>         abre o pedido (o link dos avisos do sino)
 *
 * Regras (limites, quem vê, quem responde) são do banco — ver
 * supabase/migrations/20261029120000_quote_requests.sql. Hoje tudo é grátis;
 * um limite do Pro entra por `quote_limits()` sem mexer aqui.
 */

const fieldClass =
  "w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 text-base font-medium text-[var(--engine-text)] outline-none transition-colors placeholder:text-[var(--engine-text-subtle)] focus:border-[var(--engine-accent)] sm:text-sm";
const labelClass = "text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]";

const statusTone = {
  open: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  chosen: "bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]",
  gave_up: "bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]",
  expired: "bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]",
};

const errorText = (t, error, limits = QUOTE_DEFAULT_LIMITS) =>
  t(quoteErrorKey(error), {
    open: limits.maxOpenPerCustomer,
    day: limits.maxPerDayPerCustomer,
    photos: limits.maxPhotos,
    min: QUOTE_DESCRIPTION_MIN,
  });

function StatusPill({ status }) {
  const { t } = useTranslation();
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${statusTone[status] || statusTone.gave_up}`}>
      {t(`quotes.status.${status}`, { defaultValue: status })}
    </span>
  );
}

function CategoryBadge({ category }) {
  const { t } = useTranslation();
  const Icon = categoryIcons[category] || ClipboardList;
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-[var(--engine-text)]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
        <Icon size={17} />
      </span>
      <span className="truncate">{getServiceCategoryLabel(category, t)}</span>
    </span>
  );
}

/** Folha: tela cheia no celular, cartão a partir de sm. Fecha pelo voltar. */
function Sheet({ title, eyebrow, onClose, children, footer = null, wide = false, labelId }) {
  const { t } = useTranslation();
  useHistoryDismiss(true, onClose);
  return createPortal(
    <div className="engine-modal-overlay sm:items-center sm:p-5" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={`engine-modal-panel engine-pop ${wide ? "sm:max-w-4xl" : "sm:max-w-xl"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--engine-border)] px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-2">
          <span className="w-2" />
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--engine-accent)]">{eyebrow}</p>
            )}
            <h2 id={labelId} className="truncate text-base font-bold text-[var(--engine-text)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={20} />
          </button>
        </header>
        <div className="engine-modal-body engine-scroll px-4 py-4 sm:px-5">{children}</div>
        {footer && (
          <footer className="engine-safe-bottom shrink-0 border-t border-[var(--engine-border)] px-4 pt-3 sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

function RequestSummary({ request }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--engine-text-muted)]">
        {request.carLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--engine-surface-2)] px-3 py-1.5">
            <Car size={13} /> {request.carLabel}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--engine-surface-2)] px-3 py-1.5">
          <MapPin size={13} /> {request.city}/{request.state}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--engine-surface-2)] px-3 py-1.5">
          <CalendarClock size={13} /> {t(`quotes.urgencyShort.${request.urgency}`)}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--engine-text)]">{request.description}</p>
      {request.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {request.photos.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0">
              <img src={src} alt="" loading="lazy" className="h-24 w-24 rounded-xl object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpiryLine({ request }) {
  const { t } = useTranslation();
  if (request.status !== "open") return null;
  const left = daysLeft(request.expiresAt);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--engine-text-subtle)]">
      <Clock size={12} />
      {left > 0 ? t("quotes.list.expiresIn", { count: left }) : t("quotes.list.expiresToday")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formulário do pedido
// ---------------------------------------------------------------------------

function RequestForm({ user, cars, limits, onClose, onCreated, prefill = null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { region } = useRegion();
  const garageCars = useMemo(() => {
    const owned = (cars || []).filter((car) => car.type === CAR_TYPE_OWNED);
    return (owned.length ? owned : cars || []).slice(0, 8);
  }, [cars]);
  const carLabelOf = useCallback(
    (car) => [formatCarName(car), formatFipeYear(car.year, t("car.zeroKm"))].filter(Boolean).join(" ").slice(0, QUOTE_CAR_MAX),
    [t],
  );
  const country = region.country && region.country !== "all" ? region.country : "BR";
  const states = getStates(country);
  // `prefill` vem do "Orçamento" do detalhe de um anúncio: categoria e
  // cidade do prestador. O pedido segue indo para a região (o banco não tem
  // pedido endereçado a um anúncio), mas já nasce com o que a pessoa viu.
  const [form, setForm] = useState(() => ({
    category: serviceCategories.some((category) => category.value === prefill?.category) ? prefill.category : "",
    carId: garageCars[0]?.id || "other",
    carText: "",
    description: "",
    state: prefill?.state || (region.state && region.state !== "all" ? region.state : ""),
    city: prefill?.city || "",
    urgency: "week",
    contact: "message",
  }));
  const [photos, setPhotos] = useState([]);
  const [sending, setSending] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const cities = getCities(country, form.state);
  const descriptionLength = form.description.trim().length;
  const maxPhotos = limits.maxPhotos || QUOTE_DEFAULT_LIMITS.maxPhotos;

  useEffect(() => () => photos.forEach((photo) => URL.revokeObjectURL(photo.url)), [photos]);

  const addPhotos = async (event) => {
    const files = Array.from(event.target.files || []).filter(isImageFile).slice(0, maxPhotos - photos.length);
    event.target.value = "";
    if (!files.length) return;
    setPreparing(true);
    const next = [];
    for (const file of files) {
      try {
        // Redesenhada no canvas: sai sem EXIF/GPS (services/cleanImage.js).
        const blob = await prepareQuotePhoto(file);
        next.push({ blob, url: URL.createObjectURL(blob) });
      } catch (error) {
        console.warn("[quotes] foto recusada", error);
        toast(t("quotes.form.photoError"), "error");
      }
    }
    setPhotos((current) => [...current, ...next].slice(0, maxPhotos));
    setPreparing(false);
  };

  const removePhoto = (url) => {
    URL.revokeObjectURL(url);
    setPhotos((current) => current.filter((photo) => photo.url !== url));
  };

  const carLabel =
    form.carId === "other"
      ? form.carText.trim()
      : carLabelOf(garageCars.find((car) => car.id === form.carId) || {});
  const canSend =
    form.category && form.state && form.city.trim() && descriptionLength >= QUOTE_DESCRIPTION_MIN && !sending && !preparing;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      const id = await createQuoteRequest(
        user.uid,
        { ...form, carLabel, country },
        photos.map((photo) => photo.blob),
      );
      toast(t("quotes.toast.created"));
      onCreated(id);
    } catch (error) {
      console.error(error);
      toast(errorText(t, error, limits), "error");
      setSending(false);
    }
  };

  return (
    <Sheet
      labelId="quote-form-title"
      title={t("quotes.form.title")}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="quote-form"
          disabled={!canSend}
          className="mb-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
          {sending ? t("quotes.form.sending") : t("quotes.form.submit")}
        </button>
      }
    >
      <form id="quote-form" onSubmit={submit} className="grid gap-5">
        <label className="grid gap-2">
          <span className={labelClass}>{t("quotes.form.category")}</span>
          <select value={form.category} onChange={set("category")} required className={`${fieldClass} h-12`}>
            <option value="">{t("quotes.form.choose")}</option>
            {serviceCategories.map((category) => (
              <option key={category.value} value={category.value}>
                {t(category.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="grid gap-2">
          <legend className={`${labelClass} mb-2`}>{t("quotes.form.car")}</legend>
          <div className="flex flex-wrap gap-2">
            {garageCars.map((car) => (
              <button
                key={car.id}
                type="button"
                onClick={() => setForm((current) => ({ ...current, carId: car.id }))}
                aria-pressed={form.carId === car.id}
                className={`min-h-11 max-w-full truncate rounded-xl border px-3 text-sm font-semibold transition ${
                  form.carId === car.id
                    ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-text)]"
                    : "border-[var(--engine-border)] text-[var(--engine-text-muted)]"
                }`}
              >
                {carLabelOf(car)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, carId: "other" }))}
              aria-pressed={form.carId === "other"}
              className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${
                form.carId === "other"
                  ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-text)]"
                  : "border-[var(--engine-border)] text-[var(--engine-text-muted)]"
              }`}
            >
              {t("quotes.form.carOther")}
            </button>
          </div>
          {form.carId === "other" && (
            <input
              value={form.carText}
              onChange={set("carText")}
              maxLength={QUOTE_CAR_MAX}
              placeholder={t("quotes.form.carPlaceholder")}
              className={`${fieldClass} h-12`}
            />
          )}
        </fieldset>

        <label className="grid gap-2">
          <span className="flex items-baseline justify-between gap-2">
            <span className={labelClass}>{t("quotes.form.description")}</span>
            <span className="text-[11px] font-semibold text-[var(--engine-text-subtle)]">
              {t("quotes.form.descriptionCount", { count: form.description.length, max: QUOTE_DESCRIPTION_MAX })}
            </span>
          </span>
          <textarea
            value={form.description}
            onChange={set("description")}
            maxLength={QUOTE_DESCRIPTION_MAX}
            rows={5}
            required
            placeholder={t("quotes.form.descriptionPlaceholder")}
            className={`${fieldClass} resize-none py-3`}
          />
          {descriptionLength > 0 && descriptionLength < QUOTE_DESCRIPTION_MIN && (
            <span className="text-xs font-semibold text-[var(--engine-text-muted)]">
              {t("quotes.form.descriptionMin", { min: QUOTE_DESCRIPTION_MIN })}
            </span>
          )}
        </label>

        <div className="grid gap-2">
          <span className={labelClass}>{t("quotes.form.photos")}</span>
          <div className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <div key={photo.url} className="relative">
                <img src={photo.url} alt="" className="h-20 w-20 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.url)}
                  aria-label={t("quotes.form.removePhoto")}
                  className="absolute -right-2 -top-2 flex h-11 w-11 items-center justify-center"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white">
                    <X size={14} />
                  </span>
                </button>
              </div>
            ))}
            {photos.length < maxPhotos && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={preparing}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--engine-border-strong)] text-[10px] font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-50"
              >
                {preparing ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                {t("quotes.form.addPhoto")}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={addPhotos} />
          <span className="text-xs leading-5 text-[var(--engine-text-subtle)]">
            {t("quotes.form.photosHint", { max: maxPhotos })}
          </span>
        </div>

        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
          <label className="grid gap-2">
            <span className={labelClass}>{t("quotes.form.state")}</span>
            <select
              value={form.state}
              onChange={(event) => setForm((current) => ({ ...current, state: event.target.value, city: "" }))}
              required
              className={`${fieldClass} h-12`}
            >
              <option value="">{t("quotes.form.choose")}</option>
              {states.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.code}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className={labelClass}>{t("quotes.form.city")}</span>
            <input
              value={form.city}
              onChange={set("city")}
              list="quote-cities"
              maxLength={80}
              required
              placeholder={t("quotes.form.cityPlaceholder")}
              className={`${fieldClass} h-12`}
            />
            <datalist id="quote-cities">
              {cities.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </label>
        </div>

        <fieldset className="grid gap-2">
          <legend className={`${labelClass} mb-2`}>{t("quotes.form.urgency")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {QUOTE_URGENCIES.map((value) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold transition ${
                  form.urgency === value
                    ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-text)]"
                    : "border-[var(--engine-border)] text-[var(--engine-text-muted)]"
                }`}
              >
                <input type="radio" name="quote-urgency" value={value} checked={form.urgency === value} onChange={set("urgency")} className="sr-only" />
                {t(`quotes.form.urgencies.${value}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className={`${labelClass} mb-2`}>{t("quotes.form.contact")}</legend>
          {QUOTE_CONTACTS.map((value) => (
            <label
              key={value}
              className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                form.contact === value
                  ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)]"
                  : "border-[var(--engine-border)]"
              }`}
            >
              <input
                type="radio"
                name="quote-contact"
                value={value}
                checked={form.contact === value}
                onChange={set("contact")}
                className="mt-1 h-4 w-4 accent-[var(--engine-accent)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--engine-text)]">{t(`quotes.form.contacts.${value}`)}</span>
                <span className="block text-xs leading-5 text-[var(--engine-text-muted)]">{t(`quotes.form.contactHints.${value}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <p className="flex items-start gap-2 rounded-xl bg-[var(--engine-surface-2)] p-3 text-xs leading-5 text-[var(--engine-text-muted)]">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
          <span>
            {t("quotes.form.privacy")} {t("quotes.form.limits", { open: limits.maxOpenPerCustomer, days: limits.ttlDays })}
          </span>
        </p>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Cliente: o pedido e as respostas lado a lado
// ---------------------------------------------------------------------------

const replyListing = (reply) => {
  const listing = reply.listing || {};
  const raw = String(listing.whatsapp || "").trim();
  return {
    ...listing,
    whatsapp: raw && !raw.startsWith("+") ? `${listing.whatsappCountry || "+55"} ${raw}` : raw,
  };
};

function ReplyCard({ reply, request, chosen, busy, onChat, onChoose, onReport }) {
  const { t, i18n } = useTranslation();
  const listing = replyListing(reply);
  const name = listing.title || listing.providerName || reply.provider?.author || "";
  const whatsappHref = request.contact === "whatsapp" ? getWhatsAppHref(listing, t) : undefined;
  return (
    <article
      className={`flex w-[85%] shrink-0 snap-start flex-col rounded-2xl border p-4 sm:w-auto ${
        chosen ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)]" : "border-[var(--engine-border)] bg-[var(--engine-surface)]"
      }`}
    >
      <div className="flex items-start gap-3">
        {listing.photo ? (
          <img src={listing.photo} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-sm font-black text-[var(--engine-text-muted)]">
            {name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-[var(--engine-text)]">{name}</p>
          <p className="flex items-center gap-1 truncate text-xs font-semibold text-[var(--engine-text-muted)]">
            {listing.ratingCount > 0 && (
              <>
                <Star size={12} className="fill-amber-400 text-amber-400" />
                {Number(listing.ratingAvg).toFixed(1)} ({listing.ratingCount}) ·
              </>
            )}{" "}
            {listing.city}
          </p>
        </div>
        <button
          type="button"
          onClick={onReport}
          aria-label={t("quotes.detail.report")}
          title={t("quotes.detail.report")}
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-subtle)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
        >
          <Flag size={15} />
        </button>
      </div>

      <p className="mt-4 text-2xl font-black tracking-tight text-[var(--engine-text)]">
        {formatQuotePrice(reply, i18n.language)}
      </p>
      {reply.estimatedTime && (
        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--engine-text-muted)]">
          <Clock size={13} /> {t("quotes.detail.estimatedTime")}: {reply.estimatedTime}
        </p>
      )}
      <p className="mt-3 flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--engine-text)]">{reply.message}</p>

      <div className="mt-4 grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white transition hover:brightness-95"
            >
              <MessageCircle size={15} /> {t("quotes.detail.whatsapp")}
            </a>
          ) : (
            <button
              type="button"
              onClick={onChat}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--engine-accent)] px-3 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              <MessageCircle size={15} /> {t("quotes.detail.chat")}
            </button>
          )}
          {listing.slug ? (
            <Link
              to={serviceListingPath(listing)}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[var(--engine-border)] px-2 text-sm font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)]"
            >
              <ExternalLink size={14} /> {t("quotes.detail.viewListing")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onChat}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--engine-border)] px-3 text-sm font-bold text-[var(--engine-text)] disabled:opacity-50"
            >
              <MessageCircle size={14} /> {t("quotes.detail.chat")}
            </button>
          )}
        </div>
        {chosen ? (
          <p className="flex min-h-11 items-center justify-center gap-1.5 text-sm font-bold text-[var(--engine-accent)]">
            <CheckCircle2 size={16} /> {t("quotes.detail.chosen")}
          </p>
        ) : (
          request.status === "open" && (
            <button
              type="button"
              onClick={onChoose}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--engine-accent)] px-3 text-sm font-bold text-[var(--engine-accent)] transition hover:bg-[var(--engine-accent-soft)] disabled:opacity-50"
            >
              <CheckCircle2 size={15} /> {t("quotes.detail.choose")}
            </button>
          )
        )}
      </div>
    </article>
  );
}

function MyRequestSheet({ request, user, onClose, onChanged, openReport }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // A resposta já abriu o fio do anúncio comigo (migration 20261030120000):
  // conversar é ir para ele. `start_service_conversation` só garante que ele
  // existe e amarra este pedido; se o anúncio saiu do ar, o fio continua lá.
  const chat = async (reply) => {
    setBusy(true);
    const fallback = serviceConversationId(reply.listingId, user?.uid || "");
    try {
      const id = await startServiceConversation(reply.listingId, {
        car: request.carLabel || "",
        quoteRequestId: request.id,
      });
      navigate(`/messages/${id}`);
    } catch (error) {
      console.warn("[quotes] chat", error);
      navigate(`/messages/${fallback}`);
    }
  };

  const close = async (outcome, reply = null) => {
    const name = reply ? reply.listing?.title || reply.provider?.author || "" : "";
    const ok = await confirm(
      outcome === "chosen"
        ? { title: t("quotes.detail.chooseTitle", { name }), message: t("quotes.detail.chooseMessage"), confirmLabel: t("quotes.detail.confirmChoose"), tone: "neutral" }
        : { title: t("quotes.detail.giveUpTitle"), message: t("quotes.detail.giveUpMessage"), confirmLabel: t("quotes.detail.confirmGiveUp") },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await closeQuoteRequest(request.id, outcome, reply?.id || null);
      toast(t(outcome === "chosen" ? "quotes.toast.closedChosen" : "quotes.toast.closedGaveUp"));
      await onChanged();
    } catch (error) {
      console.error(error);
      toast(errorText(t, error), "error");
    } finally {
      setBusy(false);
    }
  };

  const closedNote =
    request.status === "chosen"
      ? t("quotes.detail.closedChosen")
      : request.status === "gave_up"
        ? t("quotes.detail.closedGaveUp")
        : request.status === "expired"
          ? t("quotes.detail.expired")
          : "";

  return (
    <Sheet
      wide
      labelId="quote-detail-title"
      eyebrow={t(`quotes.status.${request.status}`)}
      title={getServiceCategoryLabel(request.category, t)}
      onClose={onClose}
      footer={
        request.status === "open" ? (
          <button
            type="button"
            onClick={() => close("gave_up")}
            disabled={busy}
            className="mb-1 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] disabled:opacity-50"
          >
            {t("quotes.detail.giveUp")}
          </button>
        ) : null
      }
    >
      <RequestSummary request={request} />
      <div className="mt-2">
        <ExpiryLine request={request} />
      </div>
      {closedNote && (
        <p className="mt-4 rounded-xl bg-[var(--engine-surface-2)] p-3 text-sm font-semibold text-[var(--engine-text-muted)]">{closedNote}</p>
      )}

      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-extrabold text-[var(--engine-text)]">
          {t("quotes.detail.repliesTitle")} <span className="text-[var(--engine-text-subtle)]">({request.replies.length})</span>
        </h3>
        {request.contact === "whatsapp" && (
          <span className="text-[11px] font-semibold text-[var(--engine-text-subtle)]">{t("quotes.detail.contactWhatsapp")}</span>
        )}
      </div>
      {request.replies.length ? (
        <>
          {request.replies.length > 1 && (
            <p className="mt-1 text-xs text-[var(--engine-text-muted)]">{t("quotes.detail.repliesHint")}</p>
          )}
          {/* Lado a lado: no celular, carrossel com encaixe; na tela larga, grade. */}
          <div className="-mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {request.replies.map((reply) => (
              <ReplyCard
                key={reply.id}
                reply={reply}
                request={request}
                chosen={request.chosenReplyId === reply.id}
                busy={busy}
                onChat={() => chat(reply)}
                onChoose={() => close("chosen", reply)}
                onReport={() => openReport({ targetType: "quote_reply", targetId: reply.id, reportedUserId: reply.providerId })}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--engine-border)] p-4 text-sm text-[var(--engine-text-muted)]">
          {request.status === "open" ? t("quotes.detail.waiting") : t("quotes.list.noReplies")}
        </p>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Prestador: o pedido e a resposta
// ---------------------------------------------------------------------------

function InboxSheet({ request, onClose, onReplied, openReport }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ priceMin: "", priceMax: "", estimatedTime: "", message: "" });
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const canReply = !request.myReply && request.status === "open";

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const priceMin = parsePrice(form.priceMin);
    const priceMax = parsePrice(form.priceMax);
    if (priceMin == null) return toast(t("quotes.errors.priceRequired"), "error");
    if (!form.message.trim()) return toast(t("quotes.errors.messageRequired"), "error");
    setBusy(true);
    try {
      await replyToQuoteRequest(request.id, { ...form, priceMin, priceMax });
      toast(t("quotes.toast.replied"));
      await onReplied();
    } catch (error) {
      console.error(error);
      toast(errorText(t, error), "error");
    } finally {
      setBusy(false);
    }
  };

  // O fio com o cliente nasceu quando eu respondi (mesmo id que o banco monta).
  const chat = () => {
    const listingId = request.myReply?.listingId || request.listingId;
    if (!request.customerId || !listingId) return;
    navigate(`/messages/${serviceConversationId(listingId, request.customerId)}`);
  };

  const outcome = request.myReply
    ? request.chosenMe
      ? t("quotes.inbox.chosenYou")
      : request.status === "chosen"
        ? t("quotes.inbox.notChosen")
        : request.status !== "open"
          ? t("quotes.inbox.closed")
          : ""
    : "";

  return (
    <Sheet
      labelId="quote-inbox-title"
      eyebrow={request.myReply ? t("quotes.inbox.replied") : t(request.reach === "city" ? "quotes.inbox.reachCity" : "quotes.inbox.reachState")}
      title={getServiceCategoryLabel(request.category, t)}
      onClose={onClose}
      footer={
        canReply ? (
          <button
            type="submit"
            form="quote-reply-form"
            disabled={busy}
            className="mb-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? t("quotes.reply.sending") : t("quotes.reply.send")}
          </button>
        ) : request.customerId ? (
          <button
            type="button"
            onClick={chat}
            disabled={busy}
            className="mb-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            <MessageCircle size={16} /> {t("quotes.inbox.chatCustomer")}
          </button>
        ) : null
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-bold text-[var(--engine-text)]">
          {request.customer?.author || t("quotes.inbox.anonymous")}
          {!request.customerId && (
            <span className="block text-xs font-medium text-[var(--engine-text-subtle)]">{t("quotes.inbox.anonymousHint")}</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => openReport({ targetType: "quote_request", targetId: request.id, reportedUserId: "" })}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-[var(--engine-text-subtle)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
        >
          <Flag size={14} /> {t("quotes.inbox.report")}
        </button>
      </div>
      <div className="mt-3">
        <RequestSummary request={request} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <ExpiryLine request={request} />
        <span className="text-[11px] font-semibold text-[var(--engine-text-subtle)]">
          {t("quotes.inbox.repliesCount", { count: request.replyCount })}
        </span>
      </div>

      {request.myReply ? (
        <section className="mt-6 rounded-2xl border border-[var(--engine-border)] p-4">
          <h3 className={labelClass}>{t("quotes.inbox.yourReply")}</h3>
          <p className="mt-2 text-xl font-black text-[var(--engine-text)]">{formatQuotePrice(request.myReply, i18n.language)}</p>
          {request.myReply.estimatedTime && (
            <p className="mt-1 text-xs font-semibold text-[var(--engine-text-muted)]">
              {t("quotes.detail.estimatedTime")}: {request.myReply.estimatedTime}
            </p>
          )}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--engine-text)]">{request.myReply.message}</p>
          {outcome && (
            <p className={`mt-3 text-sm font-bold ${request.chosenMe ? "text-[var(--engine-accent)]" : "text-[var(--engine-text-muted)]"}`}>
              {outcome}
            </p>
          )}
        </section>
      ) : canReply ? (
        <form id="quote-reply-form" onSubmit={submit} className="mt-6 grid gap-4">
          <h3 className="text-base font-extrabold text-[var(--engine-text)]">{t("quotes.reply.title")}</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-2">
              <span className={labelClass}>{t("quotes.reply.priceMin")}</span>
              <input value={form.priceMin} onChange={set("priceMin")} inputMode="decimal" required className={`${fieldClass} h-12`} />
            </label>
            <label className="grid gap-2">
              <span className={labelClass}>{t("quotes.reply.priceMax")}</span>
              <input value={form.priceMax} onChange={set("priceMax")} inputMode="decimal" className={`${fieldClass} h-12`} />
            </label>
          </div>
          <p className="-mt-2 text-xs leading-5 text-[var(--engine-text-subtle)]">{t("quotes.reply.priceHint")}</p>
          <label className="grid gap-2">
            <span className={labelClass}>{t("quotes.reply.estimatedTime")}</span>
            <input
              value={form.estimatedTime}
              onChange={set("estimatedTime")}
              maxLength={QUOTE_REPLY_TIME_MAX}
              placeholder={t("quotes.reply.estimatedTimePlaceholder")}
              className={`${fieldClass} h-12`}
            />
          </label>
          <label className="grid gap-2">
            <span className={labelClass}>{t("quotes.reply.message")}</span>
            <textarea
              value={form.message}
              onChange={set("message")}
              maxLength={QUOTE_REPLY_MESSAGE_MAX}
              rows={4}
              required
              placeholder={t("quotes.reply.messagePlaceholder")}
              className={`${fieldClass} resize-none py-3`}
            />
          </label>
          <p className="text-xs leading-5 text-[var(--engine-text-subtle)]">{t("quotes.reply.onceHint")}</p>
        </form>
      ) : (
        <p className="mt-6 rounded-xl bg-[var(--engine-surface-2)] p-3 text-sm font-semibold text-[var(--engine-text-muted)]">
          {t("quotes.errors.request-closed")}
        </p>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

function RequestRow({ request, onOpen, inbox = false }) {
  const { t } = useTranslation();
  const count = inbox ? request.replyCount : request.replies.length;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="engine-card flex w-full items-start gap-3 p-4 text-left transition hover:border-[var(--engine-border-strong)]"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <CategoryBadge category={request.category} />
            {inbox && request.myReply ? (
              <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${request.chosenMe ? statusTone.chosen : statusTone.gave_up}`}>
                {request.chosenMe ? t("quotes.status.chosen") : t("quotes.inbox.replied")}
              </span>
            ) : (
              <StatusPill status={request.status} />
            )}
          </div>
          <p className="line-clamp-2 text-sm leading-6 text-[var(--engine-text-muted)]">{request.description}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[var(--engine-text-subtle)]">
            {request.carLabel && (
              <span className="inline-flex items-center gap-1">
                <Car size={12} /> {request.carLabel}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} /> {request.city}/{request.state}
            </span>
            {inbox && !request.myReply && (
              <span>{t(request.reach === "city" ? "quotes.inbox.reachCity" : "quotes.inbox.reachState")}</span>
            )}
            <span className={!inbox && count > 0 ? "font-bold text-[var(--engine-accent)]" : ""}>
              {count > 0 ? t("quotes.list.replies", { count }) : !inbox && request.status === "open" ? t("quotes.list.noReplies") : ""}
            </span>
            <ExpiryLine request={request} />
          </div>
        </div>
        <ChevronRight size={18} className="mt-2 shrink-0 text-[var(--engine-text-subtle)]" />
      </button>
    </li>
  );
}

function EmptyState({ icon, title, copy, action }) {
  const Icon = icon;
  return (
    <div className="engine-card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
        <Icon size={22} />
      </span>
      <p className="text-base font-extrabold text-[var(--engine-text)]">{title}</p>
      <p className="max-w-sm text-sm leading-6 text-[var(--engine-text-muted)]">{copy}</p>
      {action}
    </div>
  );
}

export function Quotes({ user, cars = [] }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "inbox" ? "inbox" : "mine";
  const openId = searchParams.get("req") || "";
  const [formOpen, setFormOpen] = useState(() => searchParams.get("new") === "1");
  // Lido uma vez na chegada (os parâmetros saem da barra logo abaixo).
  const [prefill] = useState(() =>
    searchParams.get("new") === "1"
      ? { category: searchParams.get("cat") || "", state: searchParams.get("uf") || "", city: searchParams.get("cidade") || "" }
      : null,
  );
  const [limits, setLimits] = useState(QUOTE_DEFAULT_LIMITS);
  const [mine, setMine] = useState(null);
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState(false);
  const { openReport, reportDialog } = useSocialReport();

  const load = useCallback(async () => {
    setError(false);
    try {
      if (tab === "inbox") setInbox(await fetchQuoteInbox());
      else setMine(await fetchMyQuoteRequests());
    } catch (loadError) {
      console.error(loadError);
      setError(true);
    }
  }, [tab]);

  useEffect(() => {
    let alive = true;
    fetchQuoteLimits().then((value) => alive && setLimits(value));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // Carga inicial e a cada troca de aba; o setState acontece depois do await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // `new=1` já foi lido na montagem; sai da barra para recarregar não reabrir.
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        ["new", "cat", "uf", "cidade"].forEach((key) => next.delete(key));
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const setParam = (changes, replace = false) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace },
    );

  const list = tab === "inbox" ? inbox : mine;
  const opened = openId && list ? list.find((item) => item.id === openId) : null;
  const closeOpened = () => setParam({ req: "" }, true);

  const tabButton = (value, icon) => {
    const Icon = icon;
    return (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setParam({ tab: value === "inbox" ? "inbox" : "", req: "" }, true)}
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition ${
        tab === value
          ? "bg-[var(--engine-surface)] text-[var(--engine-text)] shadow-sm"
          : "text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
      }`}
    >
      <Icon size={16} className="shrink-0" />
      <span className="truncate">{t(`quotes.tabs.${value}`)}</span>
    </button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-10">
      <header className="space-y-3">
        <Link
          to="/services"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--engine-text-muted)] transition hover:text-[var(--engine-text)]"
        >
          <ArrowLeft size={16} /> {t("quotes.page.back")}
        </Link>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-[var(--engine-text)] sm:text-3xl">{t("quotes.page.title")}</h1>
            <p className="mt-1 text-sm leading-6 text-[var(--engine-text-muted)]">{t("quotes.page.subtitle")}</p>
          </div>
          {tab === "mine" && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="hidden min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 sm:inline-flex"
            >
              <Plus size={16} /> {t("quotes.page.newRequest")}
            </button>
          )}
        </div>
        <div role="tablist" className="flex gap-1 rounded-xl bg-[var(--engine-surface-2)] p-1">
          {tabButton("mine", ClipboardList)}
          {tabButton("inbox", Inbox)}
        </div>
      </header>

      {tab === "mine" && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 sm:hidden"
        >
          <Plus size={16} /> {t("quotes.page.newRequest")}
        </button>
      )}

      {tab === "inbox" && (
        <p className="text-xs leading-5 text-[var(--engine-text-muted)]">{t("quotes.inbox.intro")}</p>
      )}

      {error ? (
        <div className="engine-card flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm font-semibold text-[var(--engine-text-muted)]">{t("quotes.list.loadError")}</p>
          <button
            type="button"
            onClick={load}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)]"
          >
            <RotateCcw size={15} /> {t("quotes.list.retry")}
          </button>
        </div>
      ) : list === null ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 size={22} className="animate-spin text-[var(--engine-text-muted)]" />
        </div>
      ) : list.length === 0 ? (
        tab === "inbox" ? (
          <EmptyState
            icon={Inbox}
            title={t("quotes.inbox.empty")}
            copy={`${t("quotes.inbox.emptyCopy")} ${t("quotes.inbox.noListing")}`}
            action={
              <Link
                to="/services"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)]"
              >
                {t("quotes.inbox.noListingCta")}
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title={t("quotes.list.empty")}
            copy={t("quotes.list.emptyCopy")}
            action={
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95"
              >
                <Plus size={16} /> {t("quotes.entry.cta")}
              </button>
            }
          />
        )
      ) : (
        <ul className="space-y-3">
          {list.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              inbox={tab === "inbox"}
              onOpen={() => setParam({ req: request.id })}
            />
          ))}
        </ul>
      )}

      {formOpen && (
        <RequestForm
          user={user}
          cars={cars}
          limits={limits}
          prefill={prefill}
          onClose={() => setFormOpen(false)}
          onCreated={async () => {
            setFormOpen(false);
            await load();
          }}
        />
      )}

      {opened && tab === "mine" && (
        <MyRequestSheet
          request={opened}
          user={user}
          onClose={closeOpened}
          onChanged={load}
          openReport={openReport}
        />
      )}
      {opened && tab === "inbox" && (
        <InboxSheet
          request={opened}
          user={user}
          onClose={closeOpened}
          onReplied={load}
          openReport={openReport}
        />
      )}
      {/* A denúncia abre por cima da folha (z-100); sozinha ela fica em z-70. */}
      {reportDialog && createPortal(<div className="relative z-[150]">{reportDialog}</div>, document.body)}
    </div>
  );
}
