import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BadgeDollarSign, Car, ChevronDown, Clock, ExternalLink, FileText, Store } from "lucide-react";
import { fetchServiceContext } from "../../services/chat";
import { formatQuotePrice } from "../../services/quotes";
import { getServiceCategoryLabel, getWhatsAppHref } from "../../services/serviceListingDisplay";
import { serviceListingPath } from "../../services/serviceListingPublic";
import { WhatsAppIcon } from "../services/ListingParts";
import { formatProductPrice, productCategoryLabel, productPath } from "../../services/shops";

/**
 * Peças do fio cliente ↔ prestador em Mensagens (migration 20261030120000).
 *
 *   ServiceContextCard — cartão fixado no topo do fio: o anúncio, o carro do
 *     cliente, o pedido de orçamento e a resposta com preço. Lido ao vivo do
 *     banco (`service_conversation_context`), que só responde aos dois.
 *     Fechado mostra uma linha; "Detalhes" abre o resto. É o cartão do
 *     anúncio fixado do OLX e o resumo da reserva do Airbnb.
 *   ServiceStatusPill — novo · respondido · fechado (lado do prestador).
 *   QuoteBubbleBody — a resposta de orçamento dentro do balão.
 */

const STATUS_TONE = {
  new: "border-[var(--engine-accent)]/40 bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]",
  replied: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  closed: "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)]",
};

export function ServiceStatusPill({ status, className = "" }) {
  const { t } = useTranslation();
  if (!status) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
        STATUS_TONE[status] || STATUS_TONE.closed
      } ${className}`}
    >
      {t(`serviceChat.status.${status}`)}
    </span>
  );
}

export function QuoteBubbleBody({ quote, mine, locale }) {
  const { t } = useTranslation();
  if (!quote) return null;
  return (
    <div
      className={`mb-2 rounded-xl px-3 py-2 ${mine ? "bg-black/15" : "bg-[var(--engine-surface)]"}`}
    >
      <p
        className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] ${
          mine ? "text-white/80" : "text-[var(--engine-accent)]"
        }`}
      >
        <BadgeDollarSign size={13} aria-hidden="true" />
        {t("serviceChat.quoteBubble")}
      </p>
      <p className="mt-1 font-display text-lg font-extrabold leading-tight">{formatQuotePrice(quote, locale)}</p>
      {quote.estimatedTime && (
        <p className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${mine ? "text-white/80" : "text-[var(--engine-text-muted)]"}`}>
          <Clock size={12} aria-hidden="true" /> {quote.estimatedTime}
        </p>
      )}
    </div>
  );
}

export function ServiceContextCard({ conversation, locale }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ id: "", context: null });
  const [expanded, setExpanded] = useState(false);
  const conversationId = conversation?.id || "";
  // Relê quando a conversa anda (uma resposta de orçamento muda o cartão).
  const stamp = conversation?.updatedAt || "";

  useEffect(() => {
    if (!conversationId) return undefined;
    let alive = true;
    fetchServiceContext(conversationId)
      .then((context) => alive && setState({ id: conversationId, context }))
      .catch((error) => {
        console.warn("[serviceChat] context", error);
        if (alive) setState({ id: conversationId, context: null });
      });
    return () => {
      alive = false;
    };
  }, [conversationId, stamp]);

  // Enquanto o cartão ao vivo não chega, o retrato da própria linha.
  const context = state.id === conversationId ? state.context : null;
  const snapshot = conversation?.context || {};
  const listing = context?.listing || null;
  const quote = context?.quote || null;
  const reply = quote?.reply || null;
  const role = context?.role || (conversation?.providerId ? "customer" : "");
  const title = listing?.title || snapshot.listingTitle || t("serviceChat.card.service");
  const photo = listing?.photo || snapshot.listingPhoto || "";
  const category = listing?.category || snapshot.category || "";
  // Produto de Lojas (20261101130000): rótulo, preço e "vendido" do produto.
  const isProduct = (listing?.kind || snapshot.listingKind) === "product";
  const categoryLabel = category ? (isProduct ? productCategoryLabel(category, t) : getServiceCategoryLabel(category, t)) : "";
  const productPrice = isProduct && listing ? formatProductPrice(listing, t, locale) : "";
  const sold = isProduct && listing?.saleStatus === "sold";
  const listingLink = listing ? (isProduct ? productPath(listing) : serviceListingPath(listing)) : "";
  const car = context?.car || snapshot.car || "";
  const removed = Boolean(context) && !listing;
  const whatsappHref = listing?.whatsapp ? getWhatsAppHref(listing, t) : undefined;
  const quotePath = quote
    ? role === "provider"
      ? `/services/orcamentos?tab=inbox&req=${quote.id}`
      : `/services/orcamentos?req=${quote.id}`
    : "";

  let quoteOutcome = "";
  if (quote?.status === "chosen" && reply) {
    quoteOutcome = reply.chosen
      ? t(role === "provider" ? "serviceChat.card.chosenYou" : "serviceChat.card.chosenThis")
      : t("serviceChat.card.notChosen");
  }

  return (
    <section className="shrink-0 border-b border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-3">
        {photo ? (
          <img src={photo} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--engine-surface)] text-[var(--engine-text-subtle)]">
            <Store size={18} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {category && (
            <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-[var(--engine-accent)]">
              {categoryLabel}
              {context?.page?.author ? ` · ${context.page.author}` : ""}
            </p>
          )}
          <p className="truncate text-sm font-bold text-[var(--engine-text)]">{title}</p>
          {isProduct && listing && (
            <p className="truncate text-xs font-bold text-[var(--engine-text)]">
              {productPrice}
              {sold && (
                <span className="ml-2 rounded-full bg-[var(--engine-surface)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--engine-text-subtle)]">
                  {t("shops.status.sold")}
                </span>
              )}
            </p>
          )}
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-[var(--engine-text-muted)]">
            {car && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Car size={12} aria-hidden="true" />
                <span className="truncate">{car}</span>
              </span>
            )}
            {reply && (
              <span className="inline-flex items-center gap-1 text-[var(--engine-text)]">
                <BadgeDollarSign size={12} aria-hidden="true" />
                {formatQuotePrice(reply, locale)}
              </span>
            )}
            {quote && !reply && (
              <span className="inline-flex items-center gap-1">
                <FileText size={12} aria-hidden="true" />
                {t(`serviceChat.card.quoteStatus.${quote.status}`, { defaultValue: quote.status })}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface)] hover:text-[var(--engine-text)]"
        >
          {expanded ? t("serviceChat.card.collapse") : t("serviceChat.card.expand")}
          <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[var(--engine-border)] pt-3 text-sm">
          {removed && (
            <p className="text-xs font-medium text-[var(--engine-text-muted)]">{t("serviceChat.card.removed")}</p>
          )}

          {quote && (
            <div className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--engine-text-subtle)]">
                  {t("serviceChat.card.quote")}
                </p>
                <span className="text-[11px] font-bold text-[var(--engine-text-muted)]">
                  {t(`serviceChat.card.quoteStatus.${quote.status}`, { defaultValue: quote.status })}
                  {quoteOutcome ? ` · ${quoteOutcome}` : ""}
                </span>
              </div>
              {quote.description && (
                <p className="mt-2 line-clamp-4 whitespace-pre-line break-words text-[13px] font-medium leading-5 text-[var(--engine-text)]">
                  {quote.description}
                </p>
              )}
              {reply ? (
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-wider text-[var(--engine-text-subtle)]">
                      {t("serviceChat.card.price")}
                    </dt>
                    <dd className="font-display text-base font-extrabold text-[var(--engine-text)]">
                      {formatQuotePrice(reply, locale)}
                    </dd>
                  </div>
                  {reply.estimatedTime && (
                    <div>
                      <dt className="text-[10px] font-black uppercase tracking-wider text-[var(--engine-text-subtle)]">
                        {t("serviceChat.card.time")}
                      </dt>
                      <dd className="text-sm font-bold text-[var(--engine-text)]">{reply.estimatedTime}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mt-2 text-xs font-medium text-[var(--engine-text-muted)]">{t("serviceChat.card.noReply")}</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {listing?.approved && (
              <Link
                to={listingLink}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--engine-border)] px-3 text-xs font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
              >
                <ExternalLink size={14} aria-hidden="true" />
                {t("serviceChat.card.seeListing")}
              </Link>
            )}
            {quotePath && (
              <Link
                to={quotePath}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--engine-border)] px-3 text-xs font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
              >
                <FileText size={14} aria-hidden="true" />
                {t("serviceChat.card.seeQuote")}
              </Link>
            )}
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--engine-border)] px-3 text-xs font-bold text-[var(--engine-text)] transition hover:border-emerald-600 hover:text-emerald-600"
              >
                <WhatsAppIcon size={14} />
                {t("serviceChat.card.whatsapp")}
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
