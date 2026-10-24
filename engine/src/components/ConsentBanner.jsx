import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Cookie } from "lucide-react";
import { ADSENSE_ENABLED, setAdsConsent, useAdsConsent } from "../services/consent";

/**
 * Pergunta sobre cookies de anúncio, uma vez, no rodapé da tela.
 *
 * Só aparece quando existe AdSense configurado: sem ele o Engine não usa
 * cookie nenhum que precise de consentimento, e perguntar seria ruído.
 * "Aceitar" e "Rejeitar" têm o mesmo tamanho e o mesmo peso, como pede o guia
 * de cookies da ANPD. Não bloqueia o app: dá para usar tudo sem responder, e
 * enquanto ninguém responde nenhum anúncio do Google carrega.
 */
export function ConsentBanner() {
  const { t } = useTranslation();
  const consent = useAdsConsent();

  if (!ADSENSE_ENABLED || consent) return null;

  const button =
    "min-h-11 flex-1 rounded-xl border border-[var(--engine-border-strong)] px-4 text-sm font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]";

  return (
    <div
      role="region"
      aria-label={t("ads.consent.title")}
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-[210] mx-auto max-w-lg sm:bottom-6"
    >
      <div className="engine-pop rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <Cookie size={20} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
          <div className="min-w-0">
            <p className="text-sm font-black text-[var(--engine-text)]">{t("ads.consent.title")}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--engine-text-muted)]">
              {t("ads.consent.body")}{" "}
              <Link to="/privacidade" className="font-semibold text-[var(--engine-accent)]">
                {t("ads.consent.more")}
              </Link>
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className={button} onClick={() => setAdsConsent("denied")}>
            {t("ads.consent.reject")}
          </button>
          <button type="button" className={button} onClick={() => setAdsConsent("granted")}>
            {t("ads.consent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
