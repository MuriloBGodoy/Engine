import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import { WhatsAppIcon } from "../services/ListingParts";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { whatsAppLink } from "../../services/shopFormat";
import "../../services/i18n-shop";

/**
 * Folha de contato com a mensagem pronta e editável. Dois modos:
 *
 *   channel="engine"    "Mensagem pra @handle" → onSend(texto). Quem abre a
 *                       conversa (start_service_conversation) é a tela.
 *   channel="whatsapp"  "Abrir no WhatsApp" → link wa.me com o texto; o
 *                       número aparece escrito embaixo, porque nem todo
 *                       aparelho abre o link.
 *
 * Monte com `key` diferente a cada abertura para a mensagem voltar ao padrão.
 */
export function ContactSheet({ open, channel = "engine", handle, initialMessage, phone, phoneLabel, onSend, onWhatsApp, onClose, busy = false }) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState(initialMessage || "");
  useHistoryDismiss(open, onClose);
  if (!open) return null;

  const whatsapp = channel === "whatsapp";
  const href = whatsapp ? whatsAppLink(phone, text) : undefined;

  return (
    <>
      <div className="engine-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div className="engine-drawer p-[18px] pb-[calc(1.25rem+env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <div className="mx-auto mb-3.5 h-[5px] w-10 rounded-full bg-[var(--engine-border-strong)] sm:hidden" aria-hidden="true" />
        <h2 id={`${id}-t`} className="font-display text-lg font-bold text-[var(--engine-text)]">
          {whatsapp ? t("shop.contact.sheetWhatsapp") : t("shop.contact.sheetEngine", { handle })}
        </h2>
        <p className="mt-1 text-[13px] text-[var(--engine-text-muted)]">{t("shop.contact.sheetSub")}</p>
        <textarea
          aria-label={t("shop.contact.messageLabel")}
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, 1000))}
          rows={4}
          className="engine-field mt-3.5 w-full resize-none rounded-[14px] border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-3 text-base leading-relaxed text-[var(--engine-text)] outline-none"
        />
        {whatsapp ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              onWhatsApp?.(text);
              onClose?.();
            }}
            aria-disabled={!href}
            className={`mt-3.5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--engine-accent)] font-bold text-white ${
              href ? "" : "pointer-events-none opacity-40"
            }`}
          >
            <WhatsAppIcon size={18} />
            {t("shop.contact.openWhatsapp")}
          </a>
        ) : (
          <button
            type="button"
            disabled={!text.trim() || busy}
            onClick={() => onSend?.(text.trim())}
            className="mt-3.5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--engine-accent)] font-bold text-white disabled:opacity-40"
          >
            <Send size={18} aria-hidden="true" />
            {t("shop.contact.send")}
          </button>
        )}
        {whatsapp && phoneLabel && (
          <p className="mt-2.5 text-center text-xs text-[var(--engine-text-muted)]">{phoneLabel}</p>
        )}
      </div>
    </>
  );
}
