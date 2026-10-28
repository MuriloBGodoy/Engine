import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Ban, ExternalLink, Flag, ShieldAlert, Trash2, Undo2, XCircle } from "lucide-react";
import { engineDB } from "../services/db";
import {
  SUSPENSION_REASONS,
  findUserIdByUsername,
  liftSuspension,
  listSuspensions,
  suspendAccount,
} from "../services/suspension";
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
 *
 * Suspender conta (28/10/2026): pelo cartão da denúncia ou pelo @, com motivo
 * (inclui "menor de idade", ECA Digital). Quem barra é o banco
 * (moderation_suspend): a conta para de escrever e some para os outros, e as
 * denúncias abertas contra ela são fechadas. A lista "Contas suspensas"
 * levanta a suspensão.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inputClass =
  "w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-sm text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]";
const quietButton =
  "inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-xs font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-50";
const dangerButton =
  "inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-50";

/** Motivo + anotação interna. A pessoa suspensa vê o motivo, nunca a anotação. */
function SuspendForm({ defaultReason = "other", busy, onSubmit, onCancel }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState(SUSPENSION_REASONS.includes(defaultReason) ? defaultReason : "other");
  const [note, setNote] = useState("");
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-[var(--engine-border)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ reason, note });
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[var(--engine-text)]">{t("moderation.suspend.reason")}</span>
        <select value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} h-11`}>
          {SUSPENSION_REASONS.map((code) => (
            <option key={code} value={code}>
              {t(`suspension.reasons.${code}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[var(--engine-text)]">{t("moderation.suspend.note")}</span>
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("moderation.suspend.notePlaceholder")}
          className={`${inputClass} py-2`}
        />
      </label>
      <p className="text-xs leading-relaxed text-[var(--engine-text-muted)]">{t("moderation.suspend.effects")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={dangerButton}>
          <Ban size={14} aria-hidden="true" />
          {t("moderation.suspend.confirm")}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={quietButton}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

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
  const [suspendingKey, setSuspendingKey] = useState("");
  const [suspensions, setSuspensions] = useState([]);
  const [handle, setHandle] = useState("");
  const [handleTarget, setHandleTarget] = useState(null);

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

  useEffect(() => {
    if (!isAdmin) return undefined;
    let alive = true;
    listSuspensions()
      .then((rows) => {
        if (alive) setSuspensions(rows);
      })
      .catch((error) => {
        // Migration ainda não aplicada, ou rede: a fila de denúncias segue.
        console.warn("[moderation] suspensões indisponíveis", error);
      });
    return () => {
      alive = false;
    };
  }, [isAdmin, version]);

  const suspend = async (key, { userId, reason, note, reportId = null }) => {
    if (busy) return;
    setBusy(key);
    try {
      await suspendAccount({ userId, reason, note, reportId });
      toast(t("moderation.suspend.done"));
      setSuspendingKey("");
      setHandle("");
      setHandleTarget(null);
      setVersion((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast(
        error?.message === "already-suspended" ? t("moderation.suspend.already") : t("moderation.actionError"),
        "error",
      );
    } finally {
      setBusy("");
    }
  };

  const lift = async (item) => {
    if (busy) return;
    const ok = await confirm({
      title: t("moderation.suspend.liftTitle"),
      message: t("moderation.suspend.liftMessage", { name: item.author || item.username || item.userId }),
      confirmLabel: t("moderation.suspend.lift"),
    });
    if (!ok) return;
    setBusy(`lift:${item.userId}`);
    try {
      await liftSuspension(item.userId);
      toast(t("moderation.suspend.lifted"));
      setVersion((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast(t("moderation.actionError"), "error");
    } finally {
      setBusy("");
    }
  };

  const findHandle = async (event) => {
    event.preventDefault();
    if (busy || !handle.trim()) return;
    setBusy("handle");
    try {
      const userId = await findUserIdByUsername(handle);
      if (!userId) {
        toast(t("moderation.suspend.notFound"), "error");
        setHandleTarget(null);
      } else {
        setHandleTarget({ userId, handle: `@${handle.trim().replace(/^@+/, "")}` });
      }
    } catch (error) {
      console.error(error);
      toast(t("moderation.actionError"), "error");
    } finally {
      setBusy("");
    }
  };

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
                  {UUID.test(group.reportedUserId || "") && group.reportedUserId !== user?.uid && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => setSuspendingKey(suspendingKey === group.key ? "" : group.key)}
                      aria-expanded={suspendingKey === group.key}
                      className={quietButton}
                    >
                      <Ban size={14} aria-hidden="true" />
                      {t("moderation.suspend.action")}
                    </button>
                  )}
                </div>
                {suspendingKey === group.key && (
                  <SuspendForm
                    defaultReason={minor ? "minor" : reasonCode(group.reports[0].reason)}
                    busy={Boolean(busy)}
                    onCancel={() => setSuspendingKey("")}
                    onSubmit={(values) =>
                      suspend(group.key, { userId: group.reportedUserId, reportId: group.reports[0].id, ...values })
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section
        aria-labelledby="moderation-suspensions"
        className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4 sm:p-5"
      >
        <h2 id="moderation-suspensions" className="flex items-center gap-2 text-base font-extrabold text-[var(--engine-text)]">
          <Ban size={18} className="text-[var(--engine-accent)]" aria-hidden="true" />
          {t("moderation.suspend.listTitle")}
        </h2>
        <p className="mt-1 text-sm text-[var(--engine-text-muted)]">{t("moderation.suspend.listCopy")}</p>

        <form onSubmit={findHandle} className="mt-4 flex flex-wrap gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t("moderation.suspend.byHandle")}</span>
            <input
              value={handle}
              onChange={(event) => {
                setHandle(event.target.value);
                setHandleTarget(null);
              }}
              placeholder={t("moderation.suspend.byHandle")}
              autoCapitalize="none"
              autoCorrect="off"
              className={`${inputClass} h-11`}
            />
          </label>
          <button type="submit" disabled={Boolean(busy) || !handle.trim()} className={quietButton}>
            {t("moderation.suspend.find")}
          </button>
        </form>
        {handleTarget && (
          <div className="mt-2">
            <p className="text-sm font-bold text-[var(--engine-text)]">{handleTarget.handle}</p>
            {handleTarget.userId === user?.uid ? (
              <p className="mt-1 text-xs text-[var(--engine-text-muted)]">{t("moderation.suspend.self")}</p>
            ) : (
              <SuspendForm
                busy={Boolean(busy)}
                onCancel={() => setHandleTarget(null)}
                onSubmit={(values) => suspend("handle", { userId: handleTarget.userId, ...values })}
              />
            )}
          </div>
        )}

        {suspensions.length === 0 ? (
          <p className="mt-4 text-sm italic text-[var(--engine-text-subtle)]">{t("moderation.suspend.none")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--engine-border)]">
            {suspensions.map((item) => (
              <li key={item.userId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--engine-text)]">
                    {item.author || t("moderation.suspend.noName")}{" "}
                    <span className="font-semibold text-[var(--engine-text-subtle)]">{item.username}</span>
                  </p>
                  <p className="text-xs text-[var(--engine-text-muted)]">
                    {t(`suspension.reasons.${item.reason}`, { defaultValue: item.reason })} ·{" "}
                    {dateFormat.format(new Date(item.createdAt))}
                    {item.note ? ` — ${item.note}` : ""}
                  </p>
                </div>
                <button type="button" disabled={Boolean(busy)} onClick={() => lift(item)} className={quietButton}>
                  <Undo2 size={14} aria-hidden="true" />
                  {t("moderation.suspend.lift")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
