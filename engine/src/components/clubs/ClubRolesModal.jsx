import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { useClubAdmin, clubErrorMessage } from "./clubsDataSource";
import { useToast } from "../ToastProvider";
import { useConfirm } from "../ConfirmProvider";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { useIsDark } from "../../hooks/useIsDark";
import { CLUB_PALETTE } from "../../services/clubStyles";
import {
  CLUB_PERMISSIONS,
  CLUB_ROLE_NAME_MAX,
  roleColorVars,
  roleLabel,
  sortRoles,
} from "../../services/clubRoles";
import { Select } from "../ui/Select";

/**
 * Cargos do clube (só o Fundador): nome, cor da paleta, permissões, ordem
 * da hierarquia e o cargo com que quem entra começa.
 *
 * Tudo vai junto no "Salvar": cada cargo mexido é um `club_save_role`, a
 * ordem é um `club_reorder_roles`. Fundador e Membro só trocam nome e cor —
 * o banco trava as permissões dos dois.
 */
export function ClubRolesModal({ club, isOpen, onClose, onSaved }) {
  if (!isOpen || !club) return null;
  return createPortal(<RolesContent club={club} onClose={onClose} onSaved={onSaved} />, document.body);
}

const LOCKED_PERMS = new Set(["founder", "member"]);

function RolesContent({ club, onClose, onSaved }) {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const showToast = useToast();
  const confirm = useConfirm();
  const { saveRole, deleteRole, reorderRoles, setEntryRole } = useClubAdmin(club.id);
  useHistoryDismiss(true, onClose);

  const original = useMemo(() => sortRoles(club.roles || []), [club.roles]);
  const [roles, setRoles] = useState(original);
  const [entryRole, setEntry] = useState(club.entryRoleId || "");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const patch = (id, change) => setRoles((prev) => prev.map((role) => (role.id === id ? { ...role, ...change } : role)));
  const move = (index, delta) =>
    setRoles((prev) => {
      const next = [...prev];
      const target = index + delta;
      // O Fundador fica sempre no topo.
      if (target < 1 || target >= next.length || index < 1) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const togglePerm = (role, perm) =>
    patch(role.id, {
      permissions: role.permissions.includes(perm)
        ? role.permissions.filter((p) => p !== perm)
        : [...role.permissions, perm],
    });

  const entryOptions = roles.filter((role) => role.id !== "founder" && role.id !== "member" && !role.permissions.length);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await saveRole({ name, color: "", permissions: [] });
      setNewName("");
      showToast(t("clubRoles.created"), "success");
      onSaved?.();
      onClose();
    } catch (error) {
      showToast(clubErrorMessage(error, t), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role) => {
    const ok = await confirm({
      title: t("clubRoles.deleteTitle", { name: roleLabel(t, role) }),
      message: t("clubRoles.deleteMessage"),
      confirmLabel: t("clubRoles.delete"),
      tone: "danger",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteRole(role.id);
      showToast(t("clubRoles.deleted"), "success");
      onSaved?.();
      onClose();
    } catch (error) {
      showToast(clubErrorMessage(error, t), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const before = new Map(original.map((role) => [role.id, role]));
      for (const role of roles) {
        const old = before.get(role.id);
        const changed =
          !old ||
          old.name !== role.name.trim() ||
          old.color !== role.color ||
          [...old.permissions].sort().join() !== [...role.permissions].sort().join();
        if (changed) await saveRole({ ...role, name: role.name.trim() });
      }
      const orderBefore = original.map((role) => role.id).join();
      const orderNow = roles.map((role) => role.id).join();
      if (orderBefore !== orderNow) await reorderRoles(roles.map((role) => role.id));
      if ((club.entryRoleId || "") !== entryRole) await setEntryRole(entryRole);
      showToast(t("clubRoles.saved"), "success");
      onSaved?.();
      onClose();
    } catch (error) {
      showToast(clubErrorMessage(error, t), "error");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "min-h-10 w-full rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-[13.5px] text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)]";

  return (
    <div className="engine-modal-overlay">
      <div role="dialog" aria-modal="true" aria-labelledby="club-roles-title" className="engine-modal-panel engine-pop sm:max-w-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:pb-4 sm:pt-5">
          <div className="min-w-0">
            <h2 id="club-roles-title" className="font-display text-[17px] font-extrabold tracking-tight text-[var(--engine-text)] sm:text-xl">
              {t("clubRoles.title")}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--engine-text-muted)]">{t("clubRoles.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="engine-modal-body engine-scroll grid content-start gap-3 px-4 py-4 sm:px-6 sm:py-5">
          {roles.map((role, index) => {
            const locked = LOCKED_PERMS.has(role.id);
            return (
              <section
                key={role.id}
                style={roleColorVars(role.color, isDark)}
                className="rounded-2xl border border-[color-mix(in_srgb,var(--role,var(--engine-border-strong))_40%,var(--engine-border))] bg-[var(--engine-surface)] p-3"
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-[var(--role,var(--engine-border-strong))]" />
                  <label className="sr-only" htmlFor={`role-name-${role.id}`}>{t("clubRoles.name")}</label>
                  <input
                    id={`role-name-${role.id}`}
                    value={role.name}
                    maxLength={CLUB_ROLE_NAME_MAX}
                    placeholder={role.preset ? t(`clubRoles.presets.${role.preset}`) : t("clubRoles.name")}
                    onChange={(event) => patch(role.id, { name: event.target.value })}
                    className={fieldClass}
                  />
                  {index > 0 ? (
                    <div className="flex shrink-0">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index <= 1}
                        aria-label={t("clubRoles.moveUp")}
                        className="grid h-10 w-9 place-items-center rounded-lg text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] disabled:opacity-30"
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index >= roles.length - 1}
                        aria-label={t("clubRoles.moveDown")}
                        className="grid h-10 w-9 place-items-center rounded-lg text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] disabled:opacity-30"
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  ) : null}
                  {!locked ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(role)}
                      disabled={saving}
                      aria-label={t("clubRoles.delete")}
                      className="grid h-10 w-9 shrink-0 place-items-center rounded-lg text-[var(--engine-accent)] hover:bg-[var(--engine-surface-2)]"
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("clubRoles.color")}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={role.color === ""}
                    onClick={() => patch(role.id, { color: "" })}
                    title={t("clubRoles.clubColor")}
                    className={`grid h-7 min-w-7 place-items-center rounded-full border px-2 text-[10px] font-bold text-[var(--engine-text-muted)] ${
                      role.color === "" ? "border-[var(--engine-text)]" : "border-[var(--engine-border)]"
                    }`}
                  >
                    {t("clubRoles.clubColorShort")}
                  </button>
                  {CLUB_PALETTE.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      role="radio"
                      aria-checked={role.color === color.id}
                      aria-label={t(`clubs.colors.${color.id}`, { defaultValue: color.id })}
                      onClick={() => patch(role.id, { color: color.id })}
                      style={{ background: color.hex }}
                      className={`grid h-7 w-7 place-items-center rounded-full ring-offset-2 ring-offset-[var(--engine-surface)] ${
                        role.color === color.id ? "ring-2 ring-[var(--engine-text)]" : ""
                      }`}
                    >
                      {role.color === color.id ? <Check size={13} className={color.light ? "text-black" : "text-white"} /> : null}
                    </button>
                  ))}
                </div>

                {locked ? (
                  <p className="mt-2 text-[11.5px] text-[var(--engine-text-muted)]">
                    {role.id === "founder" ? t("clubRoles.founderLocked") : t("clubRoles.memberLocked")}
                  </p>
                ) : (
                  <fieldset className="mt-2.5">
                    <legend className="sr-only">{t("clubRoles.permissions")}</legend>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {CLUB_PERMISSIONS.map((perm) => (
                        <label key={perm} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-1 text-[12.5px] text-[var(--engine-text)]">
                          <input
                            type="checkbox"
                            checked={role.permissions.includes(perm)}
                            onChange={() => togglePerm(role, perm)}
                            className="engine-checkbox"
                          />
                          {t(`clubRoles.perms.${perm}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </section>
            );
          })}

          <div className="flex gap-2">
            <label className="sr-only" htmlFor="club-role-new">{t("clubRoles.newName")}</label>
            <input
              id="club-role-new"
              value={newName}
              maxLength={CLUB_ROLE_NAME_MAX}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t("clubRoles.newPlaceholder")}
              className={fieldClass}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !newName.trim() || roles.length >= 20}
              className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--engine-border-strong)] px-3 text-[13px] font-bold text-[var(--engine-text)] disabled:opacity-50"
            >
              <Plus size={15} />
              {t("clubRoles.add")}
            </button>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="club-entry-role" className="text-[12px] font-bold text-[var(--engine-text)]">
              {t("clubRoles.entryRole")}
            </label>
            <Select
              id="club-entry-role"
              value={entryRole}
              onChange={(event) => setEntry(event.target.value)}
              className={fieldClass}
            >
              <option value="">{roleLabel(t, roles.find((role) => role.id === "member"))}</option>
              {entryOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {roleLabel(t, role)}
                </option>
              ))}
            </Select>
            <p className="text-[11.5px] text-[var(--engine-text-muted)]">{t("clubRoles.entryRoleHint")}</p>
          </div>
        </div>

        <div className="engine-safe-bottom shrink-0 border-t border-[var(--engine-border)] bg-[var(--engine-elevated)] px-4 pt-3 sm:px-6">
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 flex-1 rounded-xl border border-[var(--engine-border-strong)] px-4 text-[14.5px] font-bold text-[var(--engine-text)] sm:flex-none"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-[14.5px] font-bold text-white transition disabled:opacity-60 sm:flex-none sm:min-w-[160px]"
            >
              {saving ? <Loader2 size={17} className="animate-spin" /> : null}
              {t("clubs.custom.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
