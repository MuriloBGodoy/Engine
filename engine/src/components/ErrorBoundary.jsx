import { Component } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { withTranslation } from "react-i18next";
import { captureError } from "../services/observability";

/**
 * Rede de segurança de tela. Sem ela, qualquer exceção ao desenhar desmontava
 * o React inteiro e deixava a tela preta, sem texto e sem saída (auditoria
 * geral, 25/10/2026). O Sentry ver o erro não ajuda quem está olhando a tela.
 *
 * Fica no topo (main.jsx), fora do roteador: por isso o "Início" é um <a>
 * comum, que recarrega, e não um <Link>.
 */
class ErrorBoundaryBase extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    captureError(error, { action: "ErrorBoundary", componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { t } = this.props;

    return (
      <div
        role="alert"
        className="flex min-h-[100dvh] items-center justify-center bg-[var(--engine-bg)] px-4 py-10 text-[var(--engine-text)]"
      >
        <div className="engine-card flex w-full max-w-md flex-col items-center gap-5 p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
            <AlertTriangle size={26} aria-hidden="true" />
          </span>
          <div className="space-y-2">
            <h1 className="text-lg font-bold">{t("errorBoundary.title")}</h1>
            <p className="text-sm leading-relaxed text-[var(--engine-text-muted)]">
              {t("errorBoundary.body")}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2.5">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] text-sm font-semibold text-white transition hover:brightness-95"
            >
              <RotateCw size={17} aria-hidden="true" />
              {t("errorBoundary.reload")}
            </button>
            <a
              href="/"
              className="flex h-11 items-center justify-center rounded-xl text-sm font-medium text-[var(--engine-text-muted)] transition hover:text-[var(--engine-text)]"
            >
              {t("errorBoundary.home")}
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryBase);
