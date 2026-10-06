import { Heart } from "lucide-react";
import { POST_BADGE_TIERS } from "../../services/achievementTiers";
import { formatTierLabel } from "./icons";

/**
 * Selo de curtidas — a mesma forma de pílula (`rounded-full`, uma cor só) já
 * usada em "meta batida" (Community.jsx) e "carro que já é seu" (CarCard.jsx).
 * O que muda entre os seis degraus é só o número e a intensidade visual —
 * nunca a cor, seguindo a referência da Nike Run Club levantada na pesquisa
 * desta sessão (ver README em `ui designs/2026-08-22-sistema-de-conquistas`).
 *
 * Usado sozinho no post (a faixa mais alta batida por ele, via
 * `postBadgeTier`) e em coleção na aba de Conquistas do perfil.
 */
const TIER_STYLES = [
  // 1K — contorno fino
  "bg-transparent border-[color-mix(in_srgb,var(--engine-accent)_50%,transparent)] text-[var(--engine-accent)]",
  // 10K
  "bg-[var(--engine-accent-soft)] border-[color-mix(in_srgb,var(--engine-accent)_60%,transparent)] text-[var(--engine-accent)]",
  // 50K
  "bg-[var(--engine-accent-soft)] border-[var(--engine-accent)] text-[var(--engine-accent)]",
  // 100K — leve glow interno
  "bg-[color-mix(in_srgb,var(--engine-accent)_22%,var(--engine-accent-soft))] border-[var(--engine-accent)] text-[var(--engine-accent)] shadow-[0_0_0_3px_var(--engine-ring)_inset]",
  // 500K — sólido
  "bg-[var(--engine-accent)] border-[var(--engine-accent)] text-white shadow-[0_0_18px_var(--engine-ring)]",
  // 1M — sólido com glow duplo
  "bg-[var(--engine-accent)] border-[var(--engine-accent)] text-white shadow-[0_0_0_4px_var(--engine-ring),0_0_26px_var(--engine-ring)]",
];

export function AchievementBadge({ tier, state = "unlocked" }) {
  // A intensidade segue a escada do POST (1K a 1M). Os degraus pequenos do
  // perfil (10 a 500) não chegam aqui como selo de post; se chegarem, ficam
  // no estilo mais leve.
  const rank = Math.max(POST_BADGE_TIERS.indexOf(tier), 0);
  const locked = state === "locked";

  return (
    <span
      className={`inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-black uppercase leading-none tracking-wide ${
        locked
          ? "border-dashed border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text-subtle)]"
          : (TIER_STYLES[rank] ?? TIER_STYLES[0])
      }`}
    >
      <Heart size={13} className="shrink-0" aria-hidden="true" />
      {formatTierLabel(tier)}
    </span>
  );
}
