import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileText, Loader2, LogOut, Mail, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { downloadMyData } from "../services/dataExport";
import { SUPPORT_EMAIL } from "../services/billing";
import { useSignOut } from "../hooks/useSignOut";
import { useToast } from "../components/ToastProvider";
import { LogoMark } from "../components/Logo";

const rowClass =
  "flex min-h-12 w-full items-center gap-3 rounded-xl border border-[var(--engine-border)] px-4 text-left text-sm font-semibold text-[var(--engine-text)] transition-colors hover:bg-[var(--engine-surface-2)] disabled:opacity-60";

/**
 * Tela de conta suspensa. Quem está suspenso e entra no app cai aqui, e só
 * aqui: o resto do app nem é montado (ver App.jsx). Daqui a pessoa lê o
 * motivo, sabe como pedir revisão, abre Termos e Privacidade, baixa os
 * próprios dados (portabilidade, LGPD art. 18, V) e sai.
 *
 * O bloqueio de verdade é do banco (migration 20261028120000): esta tela só
 * explica o que já está valendo.
 */
export function AccountSuspended({ user, suspension }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const signOut = useSignOut();
  const [exporting, setExporting] = useState(false);

  const reason = suspension?.reason || "other";
  const since = suspension?.since
    ? new Intl.DateTimeFormat(i18n.language || "pt-BR", { dateStyle: "long" }).format(new Date(suspension.since))
    : "";

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadMyData(user);
      toast(t("settings.account.exportDone"));
    } catch {
      toast(t("settings.account.exportError"), "error");
    } finally {
      setExporting(false);
    }
  };

  const subject = encodeURIComponent(t("suspension.appealSubject"));

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-[var(--engine-bg)] px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[calc(1.5rem+env(safe-area-inset-top))] text-[var(--engine-text)] sm:justify-center sm:py-10">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="font-display text-lg font-extrabold italic uppercase tracking-tight">Engine</span>
        </div>

        <main className="engine-card p-5 sm:p-8">
          <header className="mb-5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--engine-accent)]">
              <ShieldAlert size={14} aria-hidden="true" />
              {t("suspension.kicker")}
            </p>
            <h1 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">
              {t("suspension.title")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--engine-text-muted)]">
              {since ? t("suspension.since", { date: since }) : t("suspension.sinceUnknown")}
            </p>
          </header>

          <div className="rounded-xl bg-[var(--engine-surface-2)] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--engine-text-muted)]">
              {t("suspension.reasonLabel")}
            </p>
            <p className="mt-1 text-sm font-bold">
              {t(`suspension.reasons.${reason}`, { defaultValue: t("suspension.reasons.other") })}
            </p>
            {reason === "minor" && (
              <p className="mt-2 text-sm leading-relaxed text-[var(--engine-text-muted)]">{t("suspension.minorExplain")}</p>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-[var(--engine-text-muted)]">{t("suspension.effects")}</p>

          <section className="mt-5">
            <h2 className="text-sm font-extrabold">{t("suspension.appealTitle")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--engine-text-muted)]">
              {t("suspension.appealCopy", { email: SUPPORT_EMAIL })}
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-[15px] font-bold text-white transition hover:brightness-95"
            >
              <Mail size={16} aria-hidden="true" />
              {t("suspension.appealAction")}
            </a>
          </section>

          <nav className="mt-5 space-y-2" aria-label={t("suspension.optionsLabel")}>
            <button type="button" onClick={handleExport} disabled={exporting} className={rowClass}>
              {exporting ? (
                <Loader2 size={18} className="shrink-0 animate-spin text-[var(--engine-text-muted)]" />
              ) : (
                <Download size={18} className="shrink-0 text-[var(--engine-text-muted)]" />
              )}
              {t("settings.account.exportData")}
            </button>
            <Link to="/termos" className={rowClass}>
              <FileText size={18} className="shrink-0 text-[var(--engine-text-muted)]" />
              {t("suspension.terms")}
            </Link>
            <Link to="/privacidade" className={rowClass}>
              <FileText size={18} className="shrink-0 text-[var(--engine-text-muted)]" />
              {t("suspension.privacy")}
            </Link>
            <button type="button" onClick={signOut} className={rowClass}>
              <LogOut size={18} className="shrink-0 text-[var(--engine-text-muted)]" />
              {t("nav.logout")}
            </button>
          </nav>
        </main>
      </div>
    </div>
  );
}
