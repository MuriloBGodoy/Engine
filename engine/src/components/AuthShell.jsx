import { useTranslation } from "react-i18next";
import { LogoMark } from "./Logo";

export function AuthShell({ children, kicker, title, subtitle, compact = false, wide = false }) {
  const { t } = useTranslation();

  const shellClass = ["auth-shell", compact && "auth-shell-compact", wide && "auth-shell-wide"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="auth-screen">
      <div className={shellClass}>
        {/* Lado esquerdo: marca do Engine sobre uma GT-R — o vermelho das
            lanternas conversa com o accent da aplicação.

            A palavra "Engine" ao lado do logo só aparece no computador. No
            celular o herói vira uma faixa de 196px em que o "ENGINE" escrito
            e o "ENGINE GARAGE" logo abaixo ficam a dois dedos um do outro: a
            mesma palavra, duas vezes, em dois tamanhos. O símbolo sozinho já
            diz de quem é a tela. */}
        <section className="auth-hero">
          <div className="auth-hero-top">
            <LogoMark size={34} />
            <span className="auth-hero-wordmark">Engine</span>
          </div>
          <div className="auth-hero-copy">
            <h1>
              Engine <span>Garage</span>
            </h1>
            <p>{t("auth.heroText")}</p>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-panel-header">
            <span>{kicker}</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
