import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogIn, UserPlus, X } from "lucide-react";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { authPath } from "../../services/authRedirect";

/**
 * "Entre para publicar" — ANTES do formulário, não depois.
 *
 * Quem chega pelo link da bio do Instagram costuma estar sem conta. Antes ele
 * preenchia o formulário inteiro e só no envio descobria que precisava
 * entrar (e a foto já falhava com "Entre novamente", falso para quem nunca
 * entrou). Agora a conta vem primeiro, e o login devolve a pessoa direto ao
 * formulário (`?next=/services?publish=1`).
 */
export function PublishSignInGate({ open, onClose, next = "/services?publish=1" }) {
  const { t } = useTranslation();
  useHistoryDismiss(open, onClose);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-gate-title"
        onClick={(event) => event.stopPropagation()}
        className="engine-safe-bottom w-full max-w-md rounded-t-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5 text-[var(--engine-text)] shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="publish-gate-title" className="text-lg font-extrabold tracking-tight">
            {t("services.signInGate.title")}
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
        <p className="mt-2 text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
          {t("services.signInGate.copy")}
        </p>
        <div className="mt-5 grid gap-2.5">
          <Link
            to={authPath("/register", next)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95"
          >
            <UserPlus size={18} aria-hidden="true" />
            {t("services.signInGate.register")}
          </Link>
          <Link
            to={authPath("/login", next)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
          >
            <LogIn size={18} aria-hidden="true" />
            {t("services.signInGate.login")}
          </Link>
        </div>
      </section>
    </div>
  );
}
