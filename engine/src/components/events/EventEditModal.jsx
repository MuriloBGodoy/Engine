import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { engineEvents } from "../../services/events";
import { useToast } from "../ToastProvider";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";

/**
 * Editar o evento (organizador e co-organizadores; o banco confere). Só o
 * que muda sem refazer o evento: texto, horários, lotação e grupos. Data,
 * lugar e clube continuam do jeito que nasceram — mudar isso é outro evento
 * para quem já confirmou.
 */
export function EventEditModal({ event, isOpen, onClose, onSaved }) {
  if (!isOpen || !event) return null;
  return createPortal(<EditContent event={event} onClose={onClose} onSaved={onSaved} />, document.body);
}

const HTTPS = /^https:\/\/\S+$/i;

function EditContent({ event, onClose, onSaved }) {
  const { t } = useTranslation();
  const showToast = useToast();
  useHistoryDismiss(true, onClose);
  const [form, setForm] = useState({
    title: event.title || "",
    description: event.description || "",
    startTime: event.startTime || "",
    endTime: event.endTime || "",
    maxParticipants: event.maxParticipants ? String(event.maxParticipants) : "",
    whatsappGroup: event.communityLinks?.whatsappGroup || "",
    facebookGroup: event.communityLinks?.facebookGroup || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) {
      showToast(t("events.toast.titleRequired"), "error");
      return;
    }
    for (const link of [form.whatsappGroup, form.facebookGroup]) {
      if (link && !HTTPS.test(link.trim())) {
        showToast(t("eventTeam.edit.invalidLink"), "error");
        return;
      }
    }
    setSaving(true);
    try {
      await engineEvents.updateEvent(event.id, {
        title: form.title.trim(),
        description: form.description,
        startTime: form.startTime,
        endTime: form.endTime,
        maxParticipants: form.maxParticipants ? Math.max(0, Number(form.maxParticipants) || 0) : 0,
        communityLinks: { whatsappGroup: form.whatsappGroup.trim(), facebookGroup: form.facebookGroup.trim() },
      });
      showToast(t("eventTeam.edit.saved"), "success");
      onSaved?.();
      onClose();
    } catch {
      showToast(t("eventTeam.errors.notAllowed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "min-h-11 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-[14px] text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)]";
  const label = "text-[11px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]";

  return (
    <div className="engine-modal-overlay">
      <div role="dialog" aria-modal="true" aria-labelledby="event-edit-title" className="engine-modal-panel engine-pop sm:max-w-lg">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:pt-5">
          <h2 id="event-edit-title" className="font-display text-[17px] font-extrabold text-[var(--engine-text)]">
            {t("eventTeam.edit.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="-mr-2 -mt-1 flex h-11 w-11 items-center justify-center rounded-lg text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="engine-modal-body engine-scroll grid content-start gap-3.5 px-4 py-4 sm:px-6">
          <label className="grid gap-1.5">
            <span className={label}>{t("eventTeam.edit.name")}</span>
            <input value={form.title} maxLength={120} onChange={set("title")} className={field} />
          </label>
          <label className="grid gap-1.5">
            <span className={label}>{t("eventTeam.edit.description")}</span>
            <textarea value={form.description} maxLength={1000} onChange={set("description")} className={`${field} min-h-28 py-2.5`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className={label}>{t("eventTeam.edit.start")}</span>
              <input type="time" value={form.startTime} onChange={set("startTime")} className={field} />
            </label>
            <label className="grid gap-1.5">
              <span className={label}>{t("eventTeam.edit.end")}</span>
              <input type="time" value={form.endTime} onChange={set("endTime")} className={field} />
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className={label}>{t("eventTeam.edit.capacity")}</span>
            <input type="number" min="0" inputMode="numeric" value={form.maxParticipants} onChange={set("maxParticipants")} className={field} />
          </label>
          <label className="grid gap-1.5">
            <span className={label}>WhatsApp</span>
            <input type="url" inputMode="url" placeholder="https://" value={form.whatsappGroup} onChange={set("whatsappGroup")} className={field} />
          </label>
          <label className="grid gap-1.5">
            <span className={label}>Facebook</span>
            <input type="url" inputMode="url" placeholder="https://" value={form.facebookGroup} onChange={set("facebookGroup")} className={field} />
          </label>
        </div>
        <div className="engine-safe-bottom shrink-0 border-t border-[var(--engine-border)] bg-[var(--engine-elevated)] px-4 pt-3 sm:px-6">
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-[var(--engine-border-strong)] px-4 text-[14.5px] font-bold text-[var(--engine-text)]">
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-[14.5px] font-bold text-white disabled:opacity-60"
            >
              {saving ? <Loader2 size={17} className="animate-spin" /> : null}
              {t("eventTeam.edit.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
