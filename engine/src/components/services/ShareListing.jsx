import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ExternalLink, Link2, Share2 } from "lucide-react";
import { useToast } from "../ToastProvider";
import { trackEvent } from "../../services/observability";
import {
  copyText,
  serviceListingDisplayUrl,
  serviceListingPath,
  serviceListingUrl,
  shareOrCopyLink,
} from "../../services/serviceListingPublic";

/**
 * Compartilhar um anúncio: o menu nativo no celular, copiar o link no resto.
 *
 * `variant`:
 *   - "overlay": botão redondo sobre a foto do card
 *   - "outline": botão de linha, para o detalhe e a página pública
 *   - "solid":   botão cheio, para quando compartilhar é a ação principal
 */
export function ShareListingButton({
  listing,
  variant = "outline",
  asOwner = false,
  source = "detail",
  className = "",
  label,
}) {
  const { t } = useTranslation();
  const toast = useToast();

  const share = async (event) => {
    event?.stopPropagation?.();
    const url = serviceListingUrl(listing);
    const result = await shareOrCopyLink({
      url,
      title: listing.title,
      text: asOwner
        ? t("services.share.ownerText", { title: listing.title })
        : t("services.share.visitorText", { title: listing.title }),
    });
    trackEvent("servico_link_compartilhado", { result, asOwner, source });
    if (result === "copied") {
      toast(asOwner ? t("services.share.copiedOwner") : t("services.share.copied"));
    } else if (result === "failed") {
      toast(t("services.share.copyFailed", { url }), "error");
    }
  };

  const text = label || t("services.share.action");
  const iconOnly = ["overlay", "icon", "bar"].includes(variant);
  const styles = {
    overlay:
      "h-11 w-11 justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-[var(--engine-accent)]",
    icon:
      "h-11 w-11 justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:bg-[var(--engine-accent)] hover:text-white",
    bar:
      "h-12 w-12 justify-center rounded-xl border border-[var(--engine-border)] text-[var(--engine-text)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]",
    soft:
      "min-h-11 justify-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]",
    outline:
      "min-h-11 justify-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-xs font-black uppercase tracking-widest text-[var(--engine-text)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]",
    solid:
      "min-h-12 justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white hover:brightness-95",
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-label={text}
      title={text}
      className={`inline-flex shrink-0 items-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)] ${styles[variant] || styles.outline} ${className}`}
    >
      <Share2 size={iconOnly ? 18 : 16} className="shrink-0" aria-hidden="true" />
      {!iconOnly && <span className="truncate">{text}</span>}
    </button>
  );
}

/**
 * O "link da bio" do prestador: o endereço do anúncio à mostra, um botão de
 * copiar e uma linha ensinando onde colar. Só o dono vê.
 *
 * Anúncio ainda não aprovado tem o link, mas quem abrir não vê nada — então
 * o card avisa e não oferece compartilhar até a aprovação.
 */
export function BioLinkCard({ listing, compact = false, className = "" }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const approved = listing.moderationStatus === "approved";
  const displayUrl = serviceListingDisplayUrl(listing);

  const copy = async () => {
    const ok = await copyText(serviceListingUrl(listing));
    trackEvent("servico_link_copiado", { ok, source: compact ? "vitrine" : "detalhe" });
    if (ok) {
      setCopied(true);
      toast(t("services.share.copiedOwner"));
      window.setTimeout(() => setCopied(false), 2400);
    } else {
      toast(t("services.share.copyFailed", { url: serviceListingUrl(listing) }), "error");
    }
  };

  return (
    <div
      className={`rounded-xl border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] p-4 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
          <Link2 size={16} aria-hidden="true" />
        </span>
        <p className="min-w-0 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text)]">
          {t("services.share.bioTitle")}
        </p>
      </div>

      {/* O endereço é texto selecionável de propósito: se o copiar falhar
          (webview do Instagram às vezes nega), dá para segurar e copiar. */}
      <p className="mt-3 select-all break-all rounded-lg bg-[var(--engine-surface-2)] px-3 py-2.5 font-mono text-[13px] font-semibold leading-5 text-[var(--engine-text)]">
        {displayUrl}
      </p>

      {approved ? (
        <>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={copy}
              className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-3 text-sm font-bold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)]"
            >
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              <span className="truncate">
                {copied ? t("services.share.copiedShort") : t("services.share.copyMyLink")}
              </span>
            </button>
            <ShareListingButton listing={listing} variant="bar" asOwner source={compact ? "vitrine" : "detalhe"} />
          </div>
          <p className="mt-3 text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
            {t("services.share.bioHint")}
          </p>
          {!compact && (
            <a
              href={serviceListingPath(listing)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[var(--engine-accent)] hover:underline"
            >
              <ExternalLink size={14} aria-hidden="true" />
              {t("services.share.openMyPage")}
            </a>
          )}
        </>
      ) : (
        <p className="mt-3 text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
          {t("services.share.pendingHint")}
        </p>
      )}
    </div>
  );
}
