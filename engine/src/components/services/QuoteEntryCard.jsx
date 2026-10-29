import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, Inbox } from "lucide-react";
import { authPath } from "../../services/authRedirect";

const QUOTES_PATH = "/services/orcamentos";

/**
 * Porta do pedido de orçamento na vitrine de Serviços. Visitante vai para o
 * login e volta direto para o formulário (?next=). Quem tem anúncio aprovado
 * ganha o atalho para a caixa "Pedidos na sua região".
 */
export function QuoteEntryCard({ user, isProvider = false }) {
  const { t } = useTranslation();
  const newPath = `${QUOTES_PATH}?new=1`;
  const askTo = user ? newPath : authPath("/login", newPath);

  return (
    <section className="engine-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
          <ClipboardList size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--engine-accent)]">
            {t("quotes.entry.eyebrow")}
          </p>
          <h2 className="text-base font-extrabold leading-6 text-[var(--engine-text)]">{t("quotes.entry.title")}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--engine-text-muted)]">{t("quotes.entry.copy")}</p>
        </div>
      </div>
      <div className="grid shrink-0 gap-2 sm:w-56">
        <Link
          to={askTo}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95"
        >
          <ClipboardList size={16} />
          {t("quotes.entry.cta")}
        </Link>
        {user && (
          <Link
            to={isProvider ? `${QUOTES_PATH}?tab=inbox` : QUOTES_PATH}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
          >
            {isProvider ? <Inbox size={16} /> : null}
            {isProvider ? t("quotes.entry.inbox") : t("quotes.entry.mine")}
          </Link>
        )}
      </div>
    </section>
  );
}
