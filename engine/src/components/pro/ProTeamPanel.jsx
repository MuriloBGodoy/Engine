import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, UserPlus } from "lucide-react";
import {
  PRO_ROLES,
  fetchTeam,
  inviteMember,
  proErrorKey,
  removeMember,
  setMemberRole,
} from "../../services/proProfiles";
import { useConfirm } from "../ConfirmProvider";
import { useToast } from "../ToastProvider";
import { PrimaryButton, ProAvatar, SelectField, Sheet, TextField } from "./ProUi";

/**
 * Equipe da página. owner mexe em tudo; admin convida e tira editor; editor
 * só vê. Toda regra é do banco — aqui os botões só somem para quem não pode.
 */
export function ProTeamPanel({ profile, myRole, user, onClose, onLeft }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [team, setTeam] = useState(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const isOwner = myRole === "owner";
  const canInvite = myRole === "owner" || myRole === "admin";

  const load = useCallback(() => {
    fetchTeam(profile.id)
      .then(setTeam)
      .catch((error) => {
        console.error(error);
        setTeam([]);
      });
  }, [profile.id]);
  useEffect(load, [load]);

  const run = async (action, okKey) => {
    setBusy(true);
    try {
      await action();
      if (okKey) toast(t(okKey));
      load();
      return true;
    } catch (error) {
      console.error(error);
      toast(t(proErrorKey(error)), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const invite = async (event) => {
    event.preventDefault();
    if (!username.trim()) return;
    if (await run(() => inviteMember(profile.id, username, role), "pro.team.invited")) setUsername("");
  };

  const remove = async (member) => {
    const self = member.userId === user?.uid;
    const ok = await confirm({
      title: t(self ? "pro.team.leaveTitle" : "pro.team.removeTitle"),
      message: t(self ? "pro.team.leaveConfirm" : "pro.team.removeConfirm", { name: member.author, page: profile.name }),
      confirmLabel: t(self ? "pro.team.leave" : "pro.team.remove"),
    });
    if (!ok) return;
    if ((await run(() => removeMember(profile.id, member.userId), self ? "pro.team.left" : "pro.team.removed")) && self) onLeft?.();
  };

  const roleOptions = (isOwner ? PRO_ROLES : ["editor"]).map((value) => ({ value, label: t(`pro.roles.${value}`) }));

  return (
    <Sheet onClose={onClose} eyebrow={`@${profile.handle}`} title={t("pro.team.title")}>
      <p className="text-xs font-medium leading-5 text-[var(--engine-text-muted)]">{t("pro.team.rolesHint")}</p>

      {team === null ? (
        <Loader2 className="mx-auto animate-spin text-[var(--engine-text-subtle)]" aria-hidden="true" />
      ) : (
        <ul className="divide-y divide-[var(--engine-border)] rounded-xl border border-[var(--engine-border)]">
          {team.map((member) => {
            const self = member.userId === user?.uid;
            const canRemove = self || isOwner || (myRole === "admin" && member.role === "editor");
            return (
              <li key={member.userId} className="flex flex-wrap items-center gap-3 p-3">
                <ProAvatar src={member.avatar} name={member.author} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--engine-text)]">
                    {member.author}
                    {self && <span className="ml-1 font-medium text-[var(--engine-text-subtle)]">({t("pro.team.you")})</span>}
                  </p>
                  <p className="truncate text-xs font-medium text-[var(--engine-text-muted)]">
                    {member.username}
                    {member.status === "invited" ? ` · ${t("pro.team.pending")}` : ""}
                  </p>
                </div>
                {isOwner && !self ? (
                  <select
                    aria-label={t("pro.team.role")}
                    value={member.role}
                    disabled={busy}
                    onChange={(event) => run(() => setMemberRole(profile.id, member.userId, event.target.value), "pro.team.roleChanged")}
                    className="min-h-10 rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-2 text-xs font-bold text-[var(--engine-text)]"
                  >
                    {PRO_ROLES.map((value) => (
                      <option key={value} value={value}>
                        {t(`pro.roles.${value}`)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded-full bg-[var(--engine-surface-2)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--engine-text-muted)]">
                    {t(`pro.roles.${member.role}`)}
                  </span>
                )}
                {canRemove && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(member)}
                    className="min-h-10 rounded-lg px-2 text-xs font-bold text-[var(--engine-text-muted)] transition hover:text-red-500"
                  >
                    {t(self ? "pro.team.leave" : "pro.team.remove")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canInvite && (
        <form onSubmit={invite} className="space-y-3 rounded-xl border border-[var(--engine-border)] p-3">
          <p className="text-sm font-bold text-[var(--engine-text)]">{t("pro.team.inviteTitle")}</p>
          <TextField
            id="pro-invite-user"
            label={t("pro.team.username")}
            value={username}
            onChange={setUsername}
            maxLength={25}
            placeholder="@"
            autoCapitalize="none"
            hint={t("pro.team.inviteHint")}
          />
          <SelectField id="pro-invite-role" label={t("pro.team.role")} value={role} onChange={setRole} options={roleOptions} />
          <PrimaryButton type="submit" busy={busy} className="w-full">
            <UserPlus size={16} aria-hidden="true" />
            {t("pro.team.invite")}
          </PrimaryButton>
        </form>
      )}
    </Sheet>
  );
}
