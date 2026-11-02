import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Crown, Loader2, LogOut, Search, UserPlus, X } from "lucide-react";
import { engineDB } from "../../services/db";
import { engineEvents } from "../../services/events";
import { useToast } from "../ToastProvider";

/**
 * Equipe do evento: Organizador, co-organizadores, staff e convidados, com
 * selo. Quem organiza põe e tira qualquer um; co-organizador mexe só em
 * staff e convidado. Regras no banco (`event_team_set` / `_remove`).
 *
 * Só aparece para quem tem conta: a lista é como a de presença.
 */
const EVENT_TEAM_ROLES = ["co_organizer", "staff", "guest"];

const badgeClass = {
  organizer: "bg-[var(--engine-accent)] text-white",
  co_organizer:
    "border border-[color-mix(in_srgb,var(--engine-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--engine-accent)_14%,transparent)] text-[var(--engine-accent)]",
  staff: "border border-[var(--engine-border-strong)] bg-[var(--engine-surface-2)] text-[var(--engine-text)]",
  guest: "border border-[var(--engine-border)] text-[var(--engine-text-muted)]",
};

export function EventTeamBadge({ role }) {
  const { t } = useTranslation();
  if (!role) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide ${badgeClass[role] || badgeClass.guest}`}>
      {role === "organizer" ? <Crown size={10} aria-hidden="true" /> : null}
      {t(`eventTeam.roles.${role}`)}
    </span>
  );
}

const errorKey = (code) =>
  ({
    "not-allowed": "eventTeam.errors.notAllowed",
    "not-found": "eventTeam.errors.notFound",
    "team-full": "eventTeam.errors.full",
    "account-suspended": "eventTeam.errors.notAllowed",
  })[code] || "eventTeam.errors.generic";

export function EventTeamPanel({ event, team, myUid, onChanged }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showToast = useToast();
  const [profiles, setProfiles] = useState({});
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [newRole, setNewRole] = useState("staff");
  const [busy, setBusy] = useState("");

  const isOrganizer = myUid && myUid === event.createdBy;
  const myRole = team.find((member) => member.uid === myUid)?.role || "";
  const canManage = isOrganizer || myRole === "co_organizer";
  const roleChoices = isOrganizer ? EVENT_TEAM_ROLES : ["staff", "guest"];

  useEffect(() => {
    const ids = [event.createdBy, ...team.map((member) => member.uid)].filter(Boolean);
    engineDB.getPublicProfilesByIds(ids).then(setProfiles).catch(() => {});
  }, [event.createdBy, team]);

  useEffect(() => {
    if (!canManage || term.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      engineDB
        .searchPublicProfiles(term, { max: 6 })
        .then((people) => {
          if (!alive) return;
          const inTeam = new Set([event.createdBy, ...team.map((member) => member.uid)]);
          setResults(people.filter((person) => !inTeam.has(person.userId || person.id)));
        })
        .catch(() => alive && setResults([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term, canManage, team, event.createdBy]);

  const act = async (key, action, okMessage) => {
    setBusy(key);
    try {
      await action();
      if (okMessage) showToast(okMessage, "success");
      onChanged?.();
    } catch (error) {
      showToast(t(errorKey(error.code)), "error");
    } finally {
      setBusy("");
    }
  };

  const add = (person) =>
    act(`add-${person.userId || person.id}`, async () => {
      await engineEvents.setEventTeamRole(event.id, person.userId || person.id, newRole);
      setTerm("");
      setResults([]);
    }, t("eventTeam.added"));

  const rows = [{ uid: event.createdBy, role: "organizer" }, ...team];

  return (
    <div className="engine-card space-y-3 p-6">
      <h2 className="font-bold text-[var(--engine-text)]">{t("eventTeam.title")}</h2>
      <ul className="space-y-1.5">
        {rows.map((member) => {
          const person = profiles[member.uid] || {};
          const handle = String(person.username || "").replace(/^@/, "");
          const canRemove =
            member.role !== "organizer" &&
            (member.uid === myUid || isOrganizer || (myRole === "co_organizer" && member.role !== "co_organizer"));
          const canChange = member.role !== "organizer" && member.uid !== myUid &&
            (isOrganizer || (myRole === "co_organizer" && member.role !== "co_organizer"));
          return (
            <li key={member.uid} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!handle}
                onClick={() => handle && navigate(`/community/@${handle}`)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
              >
                {person.avatar ? (
                  <img src={person.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--engine-surface-2)] text-[11px] font-bold text-[var(--engine-text-muted)]">
                    {person.avatarInitials || "EN"}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-[var(--engine-text)]">
                    {person.author || t("eventTeam.someone")}
                  </span>
                  <EventTeamBadge role={member.role} />
                </span>
              </button>
              {canChange ? (
                <select
                  aria-label={t("eventTeam.changeRole")}
                  value={member.role}
                  disabled={Boolean(busy)}
                  onChange={(e) => act(`role-${member.uid}`, () => engineEvents.setEventTeamRole(event.id, member.uid, e.target.value))}
                  className="min-h-9 rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-2 text-[12px] font-semibold text-[var(--engine-text)]"
                >
                  {roleChoices.map((role) => (
                    <option key={role} value={role}>{t(`eventTeam.roles.${role}`)}</option>
                  ))}
                </select>
              ) : null}
              {canRemove ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => act(`rm-${member.uid}`, () => engineEvents.removeFromEventTeam(event.id, member.uid))}
                  aria-label={member.uid === myUid ? t("eventTeam.leave") : t("eventTeam.remove")}
                  title={member.uid === myUid ? t("eventTeam.leave") : t("eventTeam.remove")}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
                >
                  {member.uid === myUid ? <LogOut size={15} /> : <X size={15} />}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canManage ? (
        <div className="space-y-2 border-t border-[var(--engine-border)] pt-3">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--engine-text)]">
            <UserPlus size={14} aria-hidden="true" />
            {t("eventTeam.addTitle")}
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--engine-text-subtle)]" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={t("eventTeam.searchPlaceholder")}
                aria-label={t("eventTeam.searchPlaceholder")}
                className="min-h-10 w-full rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] pl-8 pr-3 text-[13px] text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)]"
              />
            </div>
            <select
              aria-label={t("eventTeam.changeRole")}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="min-h-10 rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-2 text-[12.5px] font-semibold text-[var(--engine-text)]"
            >
              {roleChoices.map((role) => (
                <option key={role} value={role}>{t(`eventTeam.roles.${role}`)}</option>
              ))}
            </select>
          </div>
          {results.length ? (
            <ul className="space-y-1">
              {results.map((person) => {
                const id = person.userId || person.id;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => add(person)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--engine-surface-2)]"
                    >
                      {busy === `add-${id}` ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} aria-hidden="true" />}
                      <span className="truncate text-[13px] font-semibold text-[var(--engine-text)]">{person.author}</span>
                      <span className="truncate text-[12px] text-[var(--engine-text-muted)]">{person.username}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="text-[11.5px] text-[var(--engine-text-muted)]">{t("eventTeam.hint")}</p>
        </div>
      ) : null}
    </div>
  );
}
