/**
 * Cargos do clube — vocabulário e regras que a TELA usa para decidir o que
 * mostrar. Quem decide de verdade é o banco
 * (20261101150000_club_roles_and_event_team.sql); isto aqui só evita botão
 * que aparece e não funciona.
 *
 * Regra da hierarquia (Discord + Telegram): quem tem manage_members só mexe
 * em quem está abaixo, só atribui cargo abaixo do seu e só cargo cujas
 * permissões ele mesmo tem. O Fundador pode tudo e não é atribuível.
 */
import { CLUB_PALETTE } from "./clubStyles";

export const CLUB_PERMISSIONS = [
  "manage_members",
  "edit_club",
  "post_announcements",
  "manage_events",
  "approve_requests",
];

export const CLUB_ROLE_PRESETS = ["founder", "president", "vice", "director", "moderator", "member", "prospect"];
export const CLUB_ROLE_NAME_MAX = 24;

/** Linha de `club_roles` → objeto da tela. */
export const roleFromRow = (row = {}) => ({
  id: String(row.id || ""),
  preset: String(row.preset || ""),
  name: String(row.name || ""),
  color: String(row.color || ""),
  position: Number.isFinite(Number(row.position)) ? Number(row.position) : 85,
  permissions: Array.isArray(row.permissions) ? row.permissions.filter((p) => CLUB_PERMISSIONS.includes(p)) : [],
});

/** Nome do cargo: o gravado, ou o do preset no idioma de quem lê. */
export const roleLabel = (t, role) => {
  if (!role) return "";
  if (role.name) return role.name;
  if (role.preset) return t(`clubRoles.presets.${role.preset}`);
  return t("clubRoles.presets.member");
};

/** Variáveis de cor do selo. Sem cor própria, o selo usa a cor do clube. */
export function roleColorVars(colorId, isDark = false) {
  const entry = CLUB_PALETTE.find((color) => color.id === colorId);
  if (!entry) return {};
  return {
    "--role": entry.hex,
    "--role-ink": isDark ? entry.inkDark : entry.ink,
    "--role-on": entry.light ? "#18202c" : "#ffffff",
  };
}

export const hasPermission = (myRole, perm) =>
  Boolean(myRole) && (myRole.id === "founder" || myRole.permissions.includes(perm));

/** Cargos que EU posso atribuir a alguém (sem contar o Fundador). */
export function assignableRoles(roles = [], myRole) {
  if (!myRole) return [];
  const others = roles.filter((role) => role.id !== "founder");
  if (myRole.id === "founder") return others;
  if (!myRole.permissions.includes("manage_members")) return [];
  return others.filter(
    (role) =>
      role.position > myRole.position && role.permissions.every((perm) => myRole.permissions.includes(perm)),
  );
}

/** Posso mexer no cargo (ou remover) deste membro? */
export function canManageMember(myRole, myUid, member, memberRole) {
  if (!myRole || !member || member.uid === myUid) return false;
  if (member.roleId === "founder") return false;
  if (myRole.id === "founder") return true;
  if (!myRole.permissions.includes("manage_members")) return false;
  return myRole.position < (memberRole?.position ?? 1000);
}

export const sortRoles = (roles = []) => [...roles].sort((a, b) => a.position - b.position);
