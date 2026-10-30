import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Car, Loader2, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { engineDB, CAR_TYPE_OWNED } from "../../services/db";
import { formatCarName, formatFipeYear } from "../../services/carDisplay";
import {
  chatErrorKey,
  findConversation,
  sendMessage,
  serviceConversationId,
  startServiceConversation,
} from "../../services/chat";
import { QUOTE_DEFAULT_LIMITS, fetchQuoteLimits } from "../../services/quotes";
import { getWhatsAppHref } from "../../services/serviceListingDisplay";
import { serviceListingPath } from "../../services/serviceListingPublic";
import { authPath } from "../../services/authRedirect";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { useToast } from "../ToastProvider";
import { WhatsAppIcon } from "./ListingParts";

/**
 * "Mensagem" no anúncio: abre (ou reabre) o fio cliente ↔ prestador em
 * Mensagens, amarrado a este anúncio (migration 20261030120000).
 *
 * Como OLX/Airbnb: a primeira mensagem sai daqui, com o carro junto se a
 * pessoa quiser, e o resto da conversa acontece em Mensagens › Serviços.
 * Quem já conversou sobre este anúncio vai direto para o fio. Visitante vai
 * para o login e volta para a página do anúncio com a folha aberta
 * (`?mensagem=1`). O WhatsApp continua ali, como alternativa.
 *
 * Variantes: "card" (célula da grade do cartão da vitrine), "block" (botão
 * cheio do modal e da página pública) e "bar" (barra fixa do celular).
 */
export const MESSAGE_QUERY_FLAG = "mensagem";

const VARIANT_CLASS = {
  card: "flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg text-xs font-black transition sm:h-9",
  block: "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition",
  bar: "inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition",
};

export function MessageProviderButton({ listing, user, variant = "block", autoOpen = false, className = "" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const approved = listing?.moderationStatus === "approved";
  const isOwner = Boolean(user?.uid && listing?.ownerId === user.uid);
  const disabled = !approved || isOwner;

  const start = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (disabled || checking) return;
    if (!user?.uid) {
      navigate(authPath("/login", `${serviceListingPath(listing)}?${MESSAGE_QUERY_FLAG}=1`));
      return;
    }
    // Já conversamos sobre este anúncio: vai direto para o fio.
    setChecking(true);
    try {
      const existing = await findConversation(serviceConversationId(listing.id, user.uid));
      if (existing?.lastMessage) {
        navigate(`/messages/${existing.id}`);
        return;
      }
    } catch (error) {
      console.warn("[serviceChat] findConversation", error);
    } finally {
      setChecking(false);
    }
    setOpen(true);
  };

  // Volta do login com ?mensagem=1: abre a folha uma vez.
  useEffect(() => {
    if (!autoOpen || !user?.uid || disabled) return;
    start();
    // `start` muda a cada render; o gatilho é só a chegada com o sinal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, user?.uid, disabled]);

  if (!listing) return null;
  const label = variant === "card" ? t("serviceChat.contact.button") : t("serviceChat.contact.buttonLong");

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        aria-label={t("serviceChat.contact.buttonLong")}
        title={isOwner ? t("serviceChat.contact.own") : t("serviceChat.contact.buttonLong")}
        className={`${VARIANT_CLASS[variant] || VARIANT_CLASS.block} ${
          disabled
            ? "cursor-not-allowed bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)]"
            : "bg-[var(--engine-accent)] text-white hover:brightness-95"
        } ${className}`}
      >
        {checking ? (
          <Loader2 className="shrink-0 animate-spin" size={16} aria-hidden="true" />
        ) : (
          <MessageCircle className="shrink-0" size={variant === "card" ? 16 : 18} aria-hidden="true" />
        )}
        <span className={variant === "card" ? "hidden sm:inline" : "truncate"}>{label}</span>
      </button>
      {open && <ContactSheet listing={listing} user={user} onClose={() => setOpen(false)} />}
    </>
  );
}

function ContactSheet({ listing, user, onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  useHistoryDismiss(true, onClose);
  const [cars, setCars] = useState([]);
  const [carId, setCarId] = useState("none");
  const [text, setText] = useState(() => t("serviceChat.contact.defaultMessage", { title: listing.title || "" }));
  const [sending, setSending] = useState(false);
  const [limits, setLimits] = useState(QUOTE_DEFAULT_LIMITS);

  useEffect(() => {
    let alive = true;
    engineDB
      .getCars()
      .then((list) => {
        if (!alive) return;
        const owned = (list || []).filter((car) => car.type === CAR_TYPE_OWNED);
        const shown = (owned.length ? owned : list || []).slice(0, 6);
        setCars(shown);
        // Um carro só: já vem marcado (é o caso comum). Mais de um, a pessoa escolhe.
        if (shown.length === 1) setCarId(shown[0].id);
      })
      .catch(() => {});
    fetchQuoteLimits().then((value) => alive && setLimits(value));
    return () => {
      alive = false;
    };
  }, []);

  const carLabelOf = useMemo(
    () => (car) => [formatCarName(car), formatFipeYear(car.year, t("car.zeroKm"))].filter(Boolean).join(" ").slice(0, 120),
    [t],
  );
  const whatsappHref = getWhatsAppHref(listing, t);
  const name = listing.providerName || listing.title || "";

  const addQuick = (phrase) =>
    setText((current) => `${current.trimEnd()}${current.trim() ? " " : ""}${phrase}`);

  const submit = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const car = carId === "none" ? "" : carLabelOf(cars.find((item) => item.id === carId) || {});
      const id = await startServiceConversation(listing.id, { car });
      await sendMessage(id, { senderId: user.uid, text: body });
      // Navega com a folha aberta: o useHistoryDismiss vê que o topo do
      // histórico mudou e não faz o "voltar" de limpeza por cima da rota nova.
      navigate(`/messages/${id}`);
    } catch (error) {
      console.error(error);
      toast(t(chatErrorKey(error) || "messages.sendError"), "error");
      setSending(false);
    }
  };

  // O cartão da vitrine é clicável (abre o detalhe). Portal propaga clique
  // pela árvore do React, então nada daqui pode subir até ele.
  const stop = (event) => event.stopPropagation();

  return createPortal(
    <div
      className="engine-modal-overlay sm:items-center sm:p-5"
      onClick={(event) => {
        stop(event);
        onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-contact-title"
        onClick={stop}
        onSubmit={submit}
        className="engine-modal-panel engine-pop sm:max-w-lg"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--engine-border)] px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-2">
          <span className="w-2" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--engine-accent)]">
              {t("serviceChat.contact.eyebrow")}
            </p>
            <h2 id="service-contact-title" className="truncate text-base font-bold text-[var(--engine-text)]">
              {t("serviceChat.contact.title", { name })}
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

        <div className="engine-modal-body engine-scroll space-y-5 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-2.5">
            {listing.photos?.[0] ? (
              <img src={listing.photos[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--engine-accent)] text-white">
                <MessageCircle size={18} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--engine-text)]">{listing.title}</p>
              <p className="truncate text-xs font-medium text-[var(--engine-text-muted)]">
                {[listing.providerName, listing.city].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          {cars.length > 0 && (
            <fieldset>
              <legend className="text-xs font-bold text-[var(--engine-text)]">{t("serviceChat.contact.car")}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {cars.map((car) => (
                  <ChoiceChip key={car.id} active={carId === car.id} onClick={() => setCarId(car.id)}>
                    <Car size={14} aria-hidden="true" /> {carLabelOf(car)}
                  </ChoiceChip>
                ))}
                <ChoiceChip active={carId === "none"} onClick={() => setCarId("none")}>
                  {t("serviceChat.contact.carNone")}
                </ChoiceChip>
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-[var(--engine-text-subtle)]">
                {t("serviceChat.contact.carHint")}
              </p>
            </fieldset>
          )}

          <div>
            <label htmlFor="service-contact-text" className="text-xs font-bold text-[var(--engine-text)]">
              {t("serviceChat.contact.message")}
            </label>
            <textarea
              id="service-contact-text"
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 2000))}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2.5 text-sm font-medium leading-6 text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {["price", "schedule", ...(listing.serviceMode === "place" ? [] : ["mobile"])].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => addQuick(t(`serviceChat.contact.quick.${key}`))}
                  className="min-h-9 rounded-full border border-[var(--engine-border)] px-3 text-xs font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                >
                  {t(`serviceChat.contact.quick.${key}`)}
                </button>
              ))}
            </div>
          </div>

          <p className="flex items-start gap-2 text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
            <span>
              {t("serviceChat.contact.privacy")}{" "}
              {t("serviceChat.contact.limits", {
                pending: limits.maxPendingChatsPerCustomer ?? 3,
                day: limits.maxNewChatsPerDayPerCustomer ?? 5,
              })}
            </span>
          </p>
        </div>

        <footer className="engine-safe-bottom flex shrink-0 flex-col gap-2 border-t border-[var(--engine-border)] px-4 pb-3 pt-3 sm:px-5">
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {sending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
            {t("serviceChat.contact.send")}
          </button>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => engineDB.trackServiceListingMetric(listing.id, "whatsapp", "search")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold text-[var(--engine-text-muted)] transition hover:text-emerald-600"
            >
              <WhatsAppIcon size={16} />
              {t("serviceChat.contact.orWhatsApp")}
            </a>
          )}
        </footer>
      </form>
    </div>,
    document.body,
  );
}

function ChoiceChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-9 max-w-full items-center gap-1.5 truncate rounded-full border px-3 text-xs font-bold transition ${
        active
          ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
          : "border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
