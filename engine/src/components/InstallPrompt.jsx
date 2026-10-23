import { useTranslation } from "react-i18next";
import { Download, Share, X } from "lucide-react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { trackEvent } from "../services/observability";

/**
 * O cartão "Deixe o Engine na tela de início": ícone, título, explicação e o
 * botão Instalar (ou, no iPhone, o caminho pelo menu de compartilhar). Usado
 * pelo convite automático do rodapé e pelo balão do botão "Instalar app", para
 * os dois serem a mesma peça. `source` vai para a métrica, para saber qual
 * caminho instala mais.
 */
export function InstallCard({ source, onClose, onInstalled }) {
  const { t } = useTranslation();
  const { needsIOSInstructions, install } = usePwaInstall();

  const handleInstall = async () => {
    const accepted = await install();
    trackEvent("pwa_install_prompt", { accepted, source });
    onInstalled?.(accepted);
  };

  return (
    <div className="engine-pop flex items-start gap-3 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] p-4 shadow-lg">
      <img
        src="/icons/icon-192.png"
        alt=""
        className="h-11 w-11 shrink-0 rounded-xl"
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-[var(--engine-text)]">
          {t("pwa.installTitle")}
        </p>

        {needsIOSInstructions ? (
          // No iPhone não existe prompt: sem ensinar o caminho, ninguém acha.
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-[var(--engine-text-muted)]">
            {t("pwa.iosStep1")}
            <Share size={13} className="inline shrink-0" />
            {t("pwa.iosStep2")}
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs leading-relaxed text-[var(--engine-text-muted)]">
              {t("pwa.installBody")}
            </p>
            <button
              type="button"
              onClick={handleInstall}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--engine-accent)] px-3.5 py-2 text-xs font-black uppercase tracking-wide text-white transition hover:brightness-95"
            >
              <Download size={14} />
              {t("pwa.installAction")}
            </button>
          </>
        )}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.cancel")}
          /* 44x44 (HIG); media 32x32. As margens negativas mantêm o X no canto. */
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/**
 * Convite para instalar o Engine na tela de início.
 *
 * Aparece rente ao rodapé e sem bloquear a tela: quem está no meio de algo
 * ignora e segue. Fecha por 30 dias quando dispensado.
 *
 * Posição (13/09/2026, WebKit num iPhone 13): com `bottom: 12px` fixo ele
 * cobria 52px da barra de abas e metade da dica de visitante, e no PWA ainda
 * ficava debaixo da barra de gestos. Aqui ele respeita a área segura; a
 * classe `engine-install-prompt` deixa o index.css subi-lo acima da barra de
 * abas quando ela existe e recolher a dica enquanto ele está na tela.
 */
export function InstallPrompt() {
  const { visible, dismiss } = usePwaInstall();

  if (!visible) return null;

  const handleDismiss = () => {
    trackEvent("pwa_install_prompt", { accepted: false, dismissed: true, source: "auto" });
    dismiss();
  };

  return (
    <div className="engine-install-prompt fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-[200] mx-auto max-w-md sm:bottom-6 sm:left-auto sm:right-6">
      <InstallCard source="auto" onClose={handleDismiss} />
    </div>
  );
}
