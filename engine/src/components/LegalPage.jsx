import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Moldura das páginas legais (termos e privacidade).
 *
 * Texto corrido, sem depender de login: precisa abrir para visitante, para o
 * Google e para a revisão das lojas de aplicativo.
 */
export function LegalPage({ title, updatedAt, children }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Engine`;
    // Sem isto a aba seguia "Termos de Uso · Engine" depois de voltar.
    return () => {
      document.title = previous;
    };
  }, [title]);

  // Aberta em aba nova (o cadastro abre assim), não há para onde voltar:
  // `navigate(-1)` não fazia nada. O React Router guarda a posição na pilha
  // em `history.state.idx`; na primeira entrada, o Voltar leva ao início.
  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[var(--engine-bg)]">
      <div className="sticky top-0 z-40 border-b border-[var(--engine-border)] bg-[var(--engine-bg)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={goBack}
            aria-label={t("legal.back")}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-black text-[var(--engine-text)]">{title}</h1>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
          {t("legal.updatedAt", { date: updatedAt })}
        </p>

        <div className="legal-body mt-6 space-y-6 text-sm leading-7 text-[var(--engine-text-muted)]">
          {children}
        </div>
      </article>
    </div>
  );
}

/** Seção com título, para o documento ter âncoras visuais claras. */
export function LegalSection({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-black text-[var(--engine-text)]">{title}</h2>
      {children}
    </section>
  );
}
