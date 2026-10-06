import { Share2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { likeTierId } from "../../services/achievementTiers";
import { AchievementIcon, achievementName } from "./icons";

/**
 * Celebração em tela cheia — só na 1ª conquista de cada categoria (Marcos ou
 * Curtidas); todas as próximas usam o toast compacto do `ToastProvider`
 * (decisão 3 da sessão de 22/08/2026). Tem ação de compartilhar porque uma
 * conquista de curtidas é conteúdo social de graça para o Engine.
 *
 * Componente puro: quem decide que É a primeira vez da categoria, e o que
 * `onShare` faz, é a camada de dados/tela que a renderiza.
 *
 * Props:
 *   open          — controla a exibição
 *   achievementId — qualquer id do catálogo (marco ou degrau de série)
 *   kind/milestoneId/tier — forma antiga, ainda aceita: "likes" + tier, ou
 *                   "milestone" + milestoneId
 *   onClose       — fecha a celebração
 *   onShare       — opcional; quando ausente, o botão "Compartilhar" some
 */
export function AchievementCelebration({
  open,
  achievementId,
  kind,
  milestoneId,
  tier,
  onClose,
  onShare,
}) {
  const { t, i18n } = useTranslation();
  if (!open) return null;

  const id = achievementId || (kind === "likes" ? likeTierId(tier) : milestoneId);
  const title = achievementName(t, i18n.language, id);

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="engine-pop relative w-full max-w-sm rounded-[26px] border border-[var(--engine-border)] bg-[var(--engine-elevated)] px-7 pb-7 pt-9 text-center shadow-[var(--engine-shadow-lg)]">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("achievements.celebration.close")}
          className="absolute right-2.5 top-2.5 flex h-11 w-11 items-center justify-center rounded-xl text-[var(--engine-text-subtle)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
        >
          <X size={18} />
        </button>

        <div
          className="mx-auto mb-5 flex h-[120px] w-[120px] items-center justify-center rounded-full text-white"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--engine-accent) 55%, #fff 8%), var(--engine-accent) 65%)",
            boxShadow: "0 0 0 6px var(--engine-ring), 0 20px 40px -12px var(--engine-accent)",
          }}
        >
          <AchievementIcon id={id} size={52} aria-hidden="true" />
        </div>

        <p className="mb-2.5 text-[11px] font-black uppercase tracking-widest text-[var(--engine-accent)]">
          {t("achievements.toast.unlocked")}
        </p>
        <h3 className="mb-6 font-display text-2xl font-extrabold tracking-tight text-[var(--engine-text)]">
          {title}
        </h3>

        <div className="flex flex-col gap-2.5">
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-[12.5px] font-black uppercase tracking-wide text-white transition hover:brightness-95"
            >
              <Share2 size={16} aria-hidden="true" />
              {t("achievements.celebration.share")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[46px] w-full items-center justify-center rounded-xl border border-[var(--engine-border)] bg-transparent px-5 text-[12.5px] font-black uppercase tracking-wide text-[var(--engine-text-muted)] transition hover:border-[var(--engine-border-strong)] hover:text-[var(--engine-text)]"
          >
            {t("achievements.celebration.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
