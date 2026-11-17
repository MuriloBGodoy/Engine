import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { ClubDetail } from "./ClubDetail";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { DragHandle } from "../DragHandle";

/**
 * O clube aberto de dentro da Comunidade, sem sair da aba.
 *
 * O conteúdo é o MESMO `ClubDetail` da rota `/clubs/:id` — o modal só põe a
 * moldura e o gesto de voltar. Quando isto era uma cópia do desenho da
 * página, as duas divergiam a cada mudança.
 */
export function ClubDetailModal({ clubId, onClose }) {
  const { t } = useTranslation();
  useHistoryDismiss(Boolean(clubId), onClose);

  if (!clubId) return null;

  return (
    <div className="engine-modal-overlay">
      <div className="engine-modal-panel engine-pop sm:max-w-4xl">
        <DragHandle onClose={onClose} />
        <div className="flex shrink-0 items-center justify-end border-b border-[var(--engine-border)] px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="engine-modal-body engine-scroll px-4 py-4 sm:px-6">
          <ClubDetail clubId={clubId} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
