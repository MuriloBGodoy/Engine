import { Link, useLocation } from "react-router-dom";
import { LogIn, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authPath } from "../services/authRedirect";

/**
 * Portão de rota para áreas que só fazem sentido logado (garagem, dashboard,
 * mensagens, ajustes). Em vez de redirecionar o visitante para uma parede de
 * login, mostra um convite amigável — visitar o resto da plataforma segue
 * livre. Quando há usuário, apenas renderiza a página normalmente.
 */
export function RequireAuth({ user, children }) {
  const { t } = useTranslation();
  const location = useLocation();

  if (user) return children;

  // Entra e volta para a página que pediu a conta, não para a Home.
  const here = `${location.pathname}${location.search}${location.hash}`;

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <div className="engine-card flex w-full max-w-md flex-col items-center gap-5 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
          <Lock size={26} />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-[var(--engine-text)]">
            {t("guest.requireTitle")}
          </h2>
          <p className="text-sm text-[var(--engine-text-muted)]">
            {t("guest.requireDesc")}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2.5">
          <Link
            to={authPath("/login", here)}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] text-sm font-semibold text-white transition hover:brightness-95"
          >
            <LogIn size={18} />
            {t("guest.loginButton")}
          </Link>
          <Link
            to="/"
            className="flex h-10 items-center justify-center rounded-xl text-sm font-medium text-[var(--engine-text-muted)] transition hover:text-[var(--engine-text)]"
          >
            {t("guest.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
