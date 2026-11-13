import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, ClipboardList, Inbox } from "lucide-react";
import { authPath } from "../../services/authRedirect";

const QUOTES_PATH = "/services/orcamentos";

/**
 * Porta do pedido de orçamento na vitrine de Serviços. Visitante vai para o
 * login e volta direto para o formulário (?next=). Quem tem anúncio aprovado
 * ganha o atalho para a caixa "Pedidos na sua região".
 *
 * Uma LINHA, não um cartão. Até 11/11/2026 isto era um bloco com etiqueta
 * "NOVO", título de duas linhas, texto de três e dois botões de ponta a
 * ponta: no desktop virava uma faixa horizontal e funcionava, no celular
 * empilhava tudo e tomava uns 370px — uma tela e meia de anúncio para uma
 * porta que se abre com um toque.
 *
 * O convite grande continua existindo, mas só onde ele tem razão de ser:
 * dentro do bloco vazio da vitrine, quando não há nenhum serviço para
 * mostrar e a pergunta "e agora?" é de verdade.
 */
export function QuoteEntryCard({ user, isProvider = false }) {
  const { t } = useTranslation();
  const newPath = `${QUOTES_PATH}?new=1`;
  const askTo = user ? newPath : authPath("/login", newPath);

  return (
    <section className="engine-card flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
        <ClipboardList size={19} aria-hidden="true" />
      </span>

      <Link to={askTo} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-sm font-extrabold text-[var(--engine-text)]">
          {t("quotes.entry.cta")}
        </span>
        <span className="truncate text-xs font-medium text-[var(--engine-text-muted)]">
          {t("quotes.entry.short")}
        </span>
      </Link>

      {user ? (
        <Link
          to={isProvider ? `${QUOTES_PATH}?tab=inbox` : QUOTES_PATH}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--engine-border)] px-3 text-xs font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
        >
          {isProvider ? <Inbox size={15} aria-hidden="true" /> : null}
          <span className="truncate">
            {isProvider ? t("quotes.entry.inbox") : t("quotes.entry.mine")}
          </span>
        </Link>
      ) : (
        <ChevronRight size={18} className="shrink-0 text-[var(--engine-text-subtle)]" aria-hidden="true" />
      )}
    </section>
  );
}
