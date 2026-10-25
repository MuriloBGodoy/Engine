import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Flag, X } from "lucide-react";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { useToast } from "../ToastProvider";
import { engineDB } from "../../services/db";
import { authPath } from "../../services/authRedirect";

/**
 * "Denunciar anúncio": o canal público de notificação. Vai para a tabela
 * `reports` (target_type 'service_listing'), que só a moderação lê — quem
 * denuncia não relê, e o prestador não fica sabendo quem foi.
 *
 * Denunciar não tira nada do ar sozinho: um concorrente derrubaria qualquer
 * anúncio assim. A moderação vê a denúncia na fila e decide ("Tirar do ar").
 *
 * Visitante sem conta: o botão leva ao login e volta para esta página.
 */

const REASONS = ["scam", "fake", "offensive", "wrong", "other"];

export function ReportListingButton({ listing, user, className = "" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const linkClass = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold text-[var(--engine-text-muted)] transition hover:text-[var(--engine-accent)] ${className}`;

  if (!user?.uid) {
    const here = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/services";
    return (
      <Link to={authPath("/login", here)} className={linkClass}>
        <Flag size={14} aria-hidden="true" />
        {t("services.report.action")}
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        <Flag size={14} aria-hidden="true" />
        {t("services.report.action")}
      </button>
      {open && <ReportListingDialog listing={listing} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportListingDialog({ listing, onClose }) {
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
        targetType: "service_listing",
        targetId: listing.id,
        reportedUserId: listing.ownerId,
        // O motivo vai como código (a moderação lê em qualquer idioma) e o
        // texto livre logo depois. A coluna aceita 280 caracteres.
        reason: `${reason}${details.trim() ? `: ${details.trim()}` : ""}`.slice(0, 280),
      });
      toast(t("services.report.sent"));
      onClose();
    } catch (error) {
      console.error(error);
      toast(t("services.report.error"), "error");
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-listing-title"
        onSubmit={send}
        onClick={(event) => event.stopPropagation()}
        className="engine-safe-bottom max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5 text-[var(--engine-text)] shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="report-listing-title" className="text-lg font-extrabold tracking-tight">
            {t("services.report.title")}
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
          {t("services.report.copy")}
        </p>

        <fieldset className="mt-4 grid gap-2">
          <legend className="sr-only">{t("services.report.reasonLabel")}</legend>
          {REASONS.map((value) => (
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
                name="report-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="h-4 w-4 accent-[var(--engine-accent)]"
              />
              {t(`services.report.reasons.${value}`)}
            </label>
          ))}
        </fieldset>

        <label className="mt-4 grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
            {t("services.report.details")}
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
          {t("services.report.send")}
        </button>
      </form>
    </div>
  );
}
