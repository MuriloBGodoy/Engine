import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink, Flag, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { engineDB } from "../services/db";
import { useServiceAdmin } from "../hooks/useServiceAdmin";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";

/**
 * Fila de moderação do social (/moderacao): denúncias de post, comentário,
 * perfil, mensagem, clube e evento. Mesmo desenho da fila de anúncios de
 * /services/approvals — só a moderação (public.is_service_admin) vê.
 *
 * Denúncias do mesmo alvo viram um cartão só, com todos os motivos. As duas
 * decisões fecham todas elas:
 *   - "Remover": tira o conteúdo do ar (função moderation_remove do banco —
 *     apaga post, comentário, mensagem ou evento; arquiva clube; limpa bio,
 *     retrato e capa do perfil);
 *   - "Dispensar": nada a fazer.
 *
 * O que aparece no cartão é o retrato que o BANCO guardou na hora da
 * denúncia (reports.context) — o autor pode ter apagado depois.
 */

const targetLink = (group) => {
  const { targetType, targetId, context } = group;
  if (targetType === "goal" || targetType === "post") return `/post/${encodeURIComponent(targetId)}`;
  if (targetType === "comment" && context.postId) return `/post/${encodeURIComponent(context.postId)}`;
  if (targetType === "club") return `/clubs/${encodeURIComponent(targetId)}`;
  if (targetType === "event") return `/events/${encodeURIComponent(targetId)}`;
  if (targetType === "profile" && context.username) {
    return `/community/@${String(context.username).replace(/^@/, "")}`;
  }
  return "";
};

const reasonCode = (reason) => String(reason || "").split(":")[0].trim();
const reasonText = (reason) => String(reason || "").split(":").slice(1).join(":").trim();

export function Moderation({ user }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdmin, checked } = useServiceAdmin(user);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!isAdmin) return undefined;
    let alive = true;
    engineDB
      .fetchSocialReports()
      .then((rows) => {
        if (alive) setReports(rows);
      })
      .catch((error) => {
        console.error(error);
        if (alive) toast(t("moderation.loadError"), "error");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isAdmin, version, t, toast]);

  // Um cartão por alvo, mais denunciado primeiro; empate, o mais antigo.
  const groups = useMemo(() => {
    const map = new Map();
    for (const report of reports) {
      const key = `${report.targetType}:${report.targetId}`;
      const group = map.get(key) || { ...report, key, reports: [] };
      group.reports.push(report);
      map.set(key, group);
    }
    return [...map.values()].sort(
      (a, b) => b.reports.length - a.reports.length || String(a.createdAt).localeCompare(String(b.createdAt)),
    );
  }, [reports]);

  const act = async (group, action) => {
    if (busy) return;
    if (action === "remove") {
      const ok = await confirm({
        title: t("moderation.removeTitle"),
        message: t(`moderation.removeMessage.${group.targetType}`, {
          defaultValue: t("moderation.removeMessage.goal"),
        }),
        confirmLabel: t("moderation.remove"),
      });
      if (!ok) return;
    }
    setBusy(group.key);
    try {
      if (action === "remove") {
        await engineDB.removeReportedContent(group.reports[0].id);
        toast(t("moderation.removed"));
      } else {
        await engineDB.dismissSocialReports(group.targetType, group.targetId);
        toast(t("moderation.dismissed"));
      }
      setVersion((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast(t("moderation.actionError"), "error");
    } finally {
      setBusy("");
    }
  };

  if (!checked) return <div className="min-h-[40vh]" aria-busy="true" />;

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--engine-accent)]">
          {t("services.restrictedAccess")}
        </p>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight text-[var(--engine-text)]">
          {t("moderation.title")}
        </h1>
        <p className="mt-2 text-sm font-medium text-[var(--engine-text-muted)]">
          {t("services.adminOnly")}
        </p>
      </section>
    );
  }

  const dateFormat = new Intl.DateTimeFormat(i18n.language || "pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="space-y-5 pb-10">
      <header className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-700 dark:text-amber-400">
          {t("services.adminKicker")}
        </p>
        <h1 className="mt-2 flex items-center gap-2 text-xl font-extrabold tracking-tight text-[var(--engine-text)] sm:text-2xl">
          <ShieldAlert size={22} className="text-[var(--engine-accent)]" aria-hidden="true" />
          {t("moderation.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
          {t("moderation.copy")}
        </p>
        <Link
          to="/services/approvals"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[var(--engine-border)] px-4 text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
        >
          {t("moderation.listingsQueue")}
        </Link>
      </header>

      {loading ? (
        <div className="min-h-[20vh]" aria-busy="true" />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--engine-border)] p-10 text-center">
          <Flag className="mx-auto mb-3 text-[var(--engine-text-subtle)]" size={28} aria-hidden="true" />
          <p className="text-sm font-bold text-[var(--engine-text)]">{t("moderation.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => {
            const link = targetLink(group);
            const minor = group.reports.some((report) => reasonCode(report.reason) === "minor");
            return (
              <li
                key={group.key}
                className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--engine-surface-2)] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
                    {t(`moderation.types.${group.targetType}`, { defaultValue: group.targetType })}
                  </span>
                  <span className="rounded-full bg-[var(--engine-accent-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--engine-accent)]">
                    {t("moderation.count", { count: group.reports.length })}
                  </span>
                  {minor && (
                    <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                      {t("socialReport.reasons.minor")}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] font-semibold text-[var(--engine-text-subtle)]">
                    {dateFormat.format(new Date(group.createdAt))}
                  </span>
                </div>

                <div className="mt-3 rounded-xl bg-[var(--engine-surface-2)] p-3">
                  {(group.context.author || group.context.username) && (
                    <p className="text-xs font-bold text-[var(--engine-text)]">
                      {group.context.author} <span className="text-[var(--engine-text-subtle)]">{group.context.username}</span>
                    </p>
                  )}
                  {(group.context.title || group.context.tag) && (
                    <p className="mt-1 text-sm font-extrabold text-[var(--engine-text)]">
                      {group.context.tag ? `[${group.context.tag}] ` : ""}
                      {group.context.title}
                    </p>
                  )}
                  {group.context.text ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--engine-text-muted)]">
                      {group.context.text}
                    </p>
                  ) : (
                    !group.context.title && (
                      <p className="mt-1 text-sm italic text-[var(--engine-text-subtle)]">{t("moderation.noSnapshot")}</p>
                    )
                  )}
                  {group.context.image && (
                    <img
                      src={group.context.image}
                      alt=""
                      className="mt-2 max-h-40 rounded-lg object-cover"
                      loading="lazy"
                    />
                  )}
                </div>

                <ul className="mt-3 space-y-1">
                  {group.reports.map((report) => (
                    <li key={report.id} className="text-xs text-[var(--engine-text-muted)]">
                      <span className="font-bold text-[var(--engine-text)]">
                        {t(`socialReport.reasons.${reasonCode(report.reason) || "other"}`, {
                          defaultValue: reasonCode(report.reason) || t("socialReport.reasons.other"),
                        })}
                      </span>
                      {reasonText(report.reason) ? ` — ${reasonText(report.reason)}` : ""}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap gap-2">
                  {link && (
                    <Link
                      to={link}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-xs font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                      {t("moderation.open")}
                    </Link>
                  )}
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => act(group, "remove")}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-50"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {t(`moderation.removeAction.${group.targetType}`, { defaultValue: t("moderation.remove") })}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => act(group, "dismiss")}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-xs font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-50"
                  >
                    <XCircle size={14} aria-hidden="true" />
                    {t("moderation.dismiss")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
