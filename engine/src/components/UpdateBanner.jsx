import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { usePwaUpdate } from "../hooks/usePwaUpdate";

/**
 * Aviso de versão nova. App instalado abre do cache, então sem isto a pessoa
 * pode ficar semanas numa versão antiga — inclusive sem correção de bug.
 * Fica no topo e não bloqueia: só atualiza quando a pessoa mandar.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const { updateReady, applyUpdate } = usePwaUpdate();

  if (!updateReady) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[220] flex justify-center px-3 pt-3">
      <button
        type="button"
        onClick={applyUpdate}
        className="engine-pop flex items-center gap-2 rounded-full border border-[var(--engine-border)] bg-[var(--engine-elevated)] px-4 py-2 text-xs font-bold text-[var(--engine-text)] shadow-lg transition hover:border-[var(--engine-accent)]"
      >
        <RefreshCw size={14} className="text-[var(--engine-accent)]" />
        {t("pwa.updateReady")}
        <span className="font-black uppercase tracking-wide text-[var(--engine-accent)]">
          {t("pwa.updateAction")}
        </span>
      </button>
    </div>
  );
}
