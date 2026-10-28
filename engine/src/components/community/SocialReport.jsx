import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, X } from "lucide-react";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { useToast } from "../ToastProvider";
import { engineDB } from "../../services/db";

/**
 * Denúncia de qualquer coisa do social: post, comentário, perfil, mensagem,
 * clube e evento. Vai para `reports`, que só a moderação lê (/moderacao).
 *
 * O banco carimba quem é o denunciado e guarda um retrato do conteúdo; daqui
 * só saem o alvo e o motivo. O motivo é um código (a moderação lê em qualquer
 * idioma) seguido do texto livre.
 *
 * "Parece ser menor de idade" está na lista por causa do ECA Digital
 * (Lei 15.211/2025, art. 24): é o indício que a moderação precisa receber.
 */
const SOCIAL_REPORT_REASONS = ["spam", "scam", "offensive", "harassment", "nudity", "minor", "other"];

export function SocialReportDialog({ target, onClose }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  useHistoryDismiss(true, onClose);

  const send = async (event) => {
    event.preventDefault();
    if (!reason || sending) return;
    setSending(true);
    try {
      await engineDB.reportContent({
        targetType: target.targetType,
        targetId: target.targetId,
        reportedUserId: target.reportedUserId || "",
        reason: `${reason}${details.trim() ? `: ${details.trim()}` : ""}`.slice(0, 280),
      });
      toast(t("socialReport.sent"));
      onClose();
    } catch (error) {
      console.error(error);
      toast(t("socialReport.error"), "error");
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="social-report-title"
        onSubmit={send}
        onClick={(event) => event.stopPropagation()}
        className="engine-safe-bottom max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5 text-[var(--engine-text)] shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="social-report-title" className="text-lg font-extrabold tracking-tight">
            {t(`socialReport.title.${target.targetType}`, { defaultValue: t("socialReport.title.post") })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
          {t("socialReport.copy")}
        </p>

        <fieldset className="mt-4 grid gap-2">
          <legend className="sr-only">{t("socialReport.reasonLabel")}</legend>
          {SOCIAL_REPORT_REASONS.map((value) => (
            <label
              key={value}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm font-semibold transition ${
                reason === value
                  ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-text)]"
                  : "border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-border-strong)]"
              }`}
            >
              <input
                type="radio"
                name="social-report-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="h-4 w-4 accent-[var(--engine-accent)]"
              />
              {t(`socialReport.reasons.${value}`)}
            </label>
          ))}
        </fieldset>

        <label className="mt-4 grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
            {t("socialReport.details")}
          </span>
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={240}
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3 text-base font-medium text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)] sm:text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={!reason || sending}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Flag size={16} aria-hidden="true" />
          {t("socialReport.send")}
        </button>
      </form>
    </div>
  );
}
