import { CalendarDays, Shield, Store, UserRound } from "lucide-react";
import { clubImageUrl } from "../../services/clubs";

const ICONS = { person: UserRound, club: Shield, event: CalendarDays, page: Store };

/**
 * Foto da menção com o ícone do tipo no canto (pessoa, clube, loja/serviço,
 * evento). Sem foto, fica só o ícone. `logo` de clube é caminho do Storage.
 */
export function MentionKindIcon({ kind, avatar = "", logo = "", size = 28 }) {
  const Icon = ICONS[kind] || UserRound;
  const src = logo ? clubImageUrl(logo) : /^(https?:|data:image\/)/.test(avatar || "") ? avatar : "";
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt=""
          className={`h-full w-full object-cover ${kind === "person" ? "rounded-full" : "rounded-md"}`}
        />
      ) : (
        <span
          className={`grid h-full w-full place-items-center bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] ${
            kind === "person" ? "rounded-full" : "rounded-md"
          }`}
        >
          <Icon size={Math.round(size * 0.5)} aria-hidden="true" />
        </span>
      )}
      {src ? (
        <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full border border-[var(--engine-surface)] bg-[var(--engine-elevated)] text-[var(--engine-text-muted)]">
          <Icon size={8} aria-hidden="true" />
        </span>
      ) : null}
    </span>
  );
}
