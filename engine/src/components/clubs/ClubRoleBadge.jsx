import { useTranslation } from "react-i18next";
import { Crown } from "lucide-react";
import { roleColorVars, roleLabel } from "../../services/clubRoles";
import { useIsDark } from "../../hooks/useIsDark";

/**
 * Selo do cargo. A cor é a do cargo (paleta do clube); sem cor própria, usa
 * a do clube (`--club`). Membro comum não ganha selo — selo em todo mundo é
 * o mesmo que selo em ninguém.
 */
export function ClubRoleBadge({ role, showMember = false, className = "" }) {
  const { t } = useTranslation();
  const isDark = useIsDark();
  if (!role) return null;
  if (role.id === "member" && !showMember) return null;
  const founder = role.id === "founder";
  return (
    <span
      style={roleColorVars(role.color, isDark)}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide ${
        founder
          ? "bg-[var(--role,var(--club))] text-[var(--role-on,var(--club-on))]"
          : "border border-[color-mix(in_srgb,var(--role,var(--club))_45%,transparent)] bg-[color-mix(in_srgb,var(--role,var(--club))_16%,transparent)] text-[var(--role-ink,var(--club-ink))]"
      } ${className}`}
    >
      {founder ? <Crown size={10} aria-hidden="true" /> : null}
      {roleLabel(t, role)}
    </span>
  );
}
