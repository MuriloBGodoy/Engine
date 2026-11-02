import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, GitBranch, Loader2, Network } from "lucide-react";
import { ClubRoleBadge } from "./ClubRoleBadge";
import { getClubTree } from "./clubsDataSource";
import { roleColorVars, roleLabel } from "../../services/clubRoles";
import { useIsDark } from "../../hooks/useIsDark";

/**
 * A "árvore" do clube, em dois modos:
 *
 *   - Organograma: os níveis da hierarquia, do Fundador para baixo, cada
 *     cargo com a sua gente. Nível grande (Membro, Prospect) começa fechado.
 *   - Linhagem: quem trouxe quem — o padrinho do motoclube. O padrinho é
 *     gravado pelo banco na entrada (convite ou aprovação); quem entrou
 *     antes disso aparece na raiz, sem padrinho.
 *
 * Os dois são lista que dobra, não um desenho com zoom: no celular é o que
 * cabe numa mão, e no desktop continua legível com 500 pessoas.
 */

const Face = ({ member, size = 30 }) => {
  const initials = String(member.displayName || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return member.avatar ? (
    <img src={member.avatar} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="grid shrink-0 place-items-center rounded-full bg-[var(--engine-border-strong)] font-extrabold text-white"
    >
      {initials}
    </span>
  );
};

const profilePath = (member) => {
  const handle = String(member.username || "").replace(/^@/, "");
  return handle ? `/community/@${handle}` : "";
};

function MemberChip({ member }) {
  const navigate = useNavigate();
  const path = profilePath(member);
  return (
    <button
      type="button"
      disabled={!path}
      onClick={() => path && navigate(path)}
      className="flex min-h-10 max-w-full items-center gap-2 rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface)] py-1 pl-1 pr-3 text-left transition hover:border-[var(--engine-border-strong)] disabled:cursor-default"
    >
      <Face member={member} size={28} />
      <span className="truncate text-[12.5px] font-semibold text-[var(--engine-text)]">{member.displayName}</span>
    </button>
  );
}

function OrgChart({ members, roles }) {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const levels = useMemo(
    () =>
      roles
        .map((role) => ({ role, people: members.filter((member) => member.roleId === role.id) }))
        .filter((level) => level.people.length),
    [members, roles],
  );
  const [closed, setClosed] = useState(() =>
    Object.fromEntries(levels.filter((level) => level.people.length > 12).map((level) => [level.role.id, true])),
  );

  return (
    <ol className="space-y-0">
      {levels.map((level, index) => {
        const isClosed = Boolean(closed[level.role.id]);
        return (
          <li key={level.role.id} className="relative">
            {index > 0 ? (
              <span aria-hidden="true" className="mx-auto block h-4 w-px bg-[var(--engine-border-strong)]" />
            ) : null}
            <section
              style={roleColorVars(level.role.color, isDark)}
              className="rounded-2xl border border-[color-mix(in_srgb,var(--role,var(--club))_36%,var(--engine-border))] bg-[color-mix(in_srgb,var(--role,var(--club))_6%,var(--engine-surface))] p-3"
            >
              <button
                type="button"
                onClick={() => setClosed((prev) => ({ ...prev, [level.role.id]: !isClosed }))}
                aria-expanded={!isClosed}
                className="flex min-h-9 w-full items-center gap-2 text-left"
              >
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--role,var(--club))]" />
                <span className="flex-1 text-[13px] font-extrabold text-[var(--engine-text)]">
                  {roleLabel(t, level.role)}
                </span>
                <span className="text-[11.5px] font-semibold text-[var(--engine-text-muted)]">
                  {t("clubTree.count", { count: level.people.length })}
                </span>
                {isClosed ? <ChevronRight size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
              </button>
              {!isClosed ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {level.people.map((member) => (
                    <MemberChip key={member.uid} member={member} />
                  ))}
                </div>
              ) : null}
            </section>
          </li>
        );
      })}
    </ol>
  );
}

function LineageNode({ member, childrenOf, depth, seen }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const kids = (childrenOf.get(member.uid) || []).filter((kid) => !seen.has(kid.uid));
  const [open, setOpen] = useState(depth < 2);
  const nextSeen = useMemo(() => new Set([...seen, member.uid]), [seen, member.uid]);
  const path = profilePath(member);

  return (
    <li>
      <div className="flex min-h-11 items-center gap-2 py-1">
        {kids.length ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? t("clubTree.collapse") : t("clubTree.expand")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)]"
          >
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : (
          <span aria-hidden="true" className="w-8 shrink-0" />
        )}
        <button
          type="button"
          disabled={!path}
          onClick={() => path && navigate(path)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
        >
          <Face member={member} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-[var(--engine-text)]">
              <span className="truncate">{member.displayName}</span>
              <ClubRoleBadge role={member.roleInfo} />
            </span>
            {kids.length ? (
              <span className="block text-[11px] text-[var(--engine-text-muted)]">
                {t("clubTree.brought", { count: kids.length })}
              </span>
            ) : null}
          </span>
        </button>
      </div>
      {open && kids.length ? (
        <ul className="ml-4 border-l border-[var(--engine-border-strong)] pl-2">
          {kids.map((kid) => (
            <LineageNode key={kid.uid} member={kid} childrenOf={childrenOf} depth={depth + 1} seen={nextSeen} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Lineage({ members }) {
  const { t } = useTranslation();
  const { roots, childrenOf, withSponsor } = useMemo(() => {
    const byUid = new Map(members.map((member) => [member.uid, member]));
    const children = new Map();
    const top = [];
    let count = 0;
    for (const member of members) {
      const sponsor = member.sponsorId && member.sponsorId !== member.uid ? byUid.get(member.sponsorId) : null;
      if (sponsor) {
        count += 1;
        if (!children.has(sponsor.uid)) children.set(sponsor.uid, []);
        children.get(sponsor.uid).push(member);
      } else {
        top.push(member);
      }
    }
    // Ciclo (A trouxe B, B saiu e voltou trazido por A...) não pode sumir
    // com ninguém: quem não é alcançável a partir da raiz vira raiz.
    const reach = new Set();
    const walk = (uid) => {
      if (reach.has(uid)) return;
      reach.add(uid);
      (children.get(uid) || []).forEach((kid) => walk(kid.uid));
    };
    top.forEach((member) => walk(member.uid));
    members.forEach((member) => {
      if (!reach.has(member.uid)) {
        top.push(member);
        walk(member.uid);
      }
    });
    return { roots: top, childrenOf: children, withSponsor: count };
  }, [members]);
  const rootSeen = useMemo(() => new Set(), []);

  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-relaxed text-[var(--engine-text-muted)]">
        {withSponsor ? t("clubTree.lineageHint") : t("clubTree.lineageEmpty")}
      </p>
      <ul className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-2 py-1.5">
        {roots.map((member) => (
          <LineageNode key={member.uid} member={member} childrenOf={childrenOf} depth={0} seen={rootSeen} />
        ))}
      </ul>
    </div>
  );
}

export function ClubTree({ clubId, reloadKey = 0 }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("org");
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getClubTree(clubId)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [clubId, reloadKey]);

  const modes = [
    { id: "org", label: t("clubTree.org"), icon: Network },
    { id: "lineage", label: t("clubTree.lineage"), icon: GitBranch },
  ];

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={t("clubTree.title")} className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--engine-surface-2)] p-1">
        {modes.map((modeItem) => {
          const { id, label } = modeItem;
          const ModeIcon = modeItem.icon;
          return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-bold transition ${
              mode === id
                ? "bg-[var(--engine-surface)] text-[var(--engine-text)] shadow-sm"
                : "text-[var(--engine-text-muted)]"
            }`}
          >
            <ModeIcon size={14} aria-hidden="true" />
            {label}
          </button>
          );
        })}
      </div>

      {failed ? (
        <p className="py-6 text-center text-[13px] text-[var(--engine-text-muted)]">{t("clubs.errors.generic")}</p>
      ) : !data ? (
        <div className="flex justify-center py-10 text-[var(--engine-text-muted)]">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : !data.members.length ? (
        <p className="py-6 text-center text-[13px] text-[var(--engine-text-muted)]">{t("clubTree.hidden")}</p>
      ) : mode === "org" ? (
        <OrgChart members={data.members} roles={data.roles} />
      ) : (
        <Lineage members={data.members} />
      )}
    </div>
  );
}
