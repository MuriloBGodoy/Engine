import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, Check, Loader2, X } from "lucide-react";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { getStates } from "../../services/locations";
import { CALENDARS } from "../../services/reminderCalendars";
import {
  carReminders,
  emptyReminderSettings,
  localISODate,
  markInsuranceRenewed,
  markIpvaPaid,
  markIpvaYearPaid,
  markLicensingPaid,
  markRevisionDone,
  normalizeReminderSettings,
} from "../../services/reminders";
import {
  formatDueDate,
  reminderStateText,
  reminderStatusText,
  reminderTitle,
  reminderTone,
} from "../../services/reminderLabels";
import { Select } from "../ui/Select";

const fieldClass =
  "w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-2.5 text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]";
const labelClass = "ml-1 block text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]";
const actionClass =
  "flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--engine-border)] px-3 text-xs font-bold text-[var(--engine-text)] transition-colors hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]";

const numberOrEmpty = (value) => (value === null || value === undefined ? "" : String(value));
const toNumberOrNull = (value) => {
  const digits = String(value).replace(/\D/g, "");
  return digits ? Number(digits) : null;
};

/** Linha "Próximo: …" com o status, a fonte e o que falta. */
function NextLine({ item, t, locale, today }) {
  if (!item) return null;
  if (!item.status) {
    return <p className="text-xs text-[var(--engine-text-muted)]">{reminderStateText(t, item)}</p>;
  }
  const date = item.dueDate ? formatDueDate(item.dueDate, locale, today) : "";
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-[var(--engine-text)]">
          {reminderTitle(t, item)}
          {date ? ` · ${date}` : ""}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${reminderTone(item)}`}>
          {reminderStatusText(t, item)}
        </span>
      </div>
      {item.origin === "manual" && <p className="text-[11px] text-[var(--engine-text-muted)]">{t("reminders.manual")}</p>}
      {item.origin === "calendar" && (
        <p className="text-[11px] leading-snug text-[var(--engine-text-muted)]">
          <span className="font-bold">{t(`reminders.level.${item.level}`)}</span>
          {" · "}
          {item.source}
        </p>
      )}
      {item.estimated && <p className="text-[11px] text-[var(--engine-text-muted)]">{t("reminders.estimate")}</p>}
    </div>
  );
}

function Block({ title, children }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-[var(--engine-border)] p-3.5 sm:p-4">
      <legend className="px-1 text-xs font-black uppercase tracking-widest text-[var(--engine-accent)]">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Lembretes de UM carro: UF + final da placa, datas manuais, intervalo de
 * revisão, renovação do seguro e os atalhos "paguei / fiz / renovei".
 * Grava em `car.reminders` pelo mesmo `saveCar` do resto do carro.
 */
export function ReminderSettingsModal({ car, onClose, onSave }) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState(() => normalizeReminderSettings(car?.reminders) || emptyReminderSettings());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const today = localISODate();
  const states = useMemo(() => getStates("BR"), []);

  const close = useCallback(() => onClose?.(), [onClose]);
  useHistoryDismiss(Boolean(car), close);

  const preview = useMemo(
    () => (car ? carReminders({ ...car, reminders: draft }, today) : []),
    [car, draft, today],
  );
  if (!car) return null;

  const byKind = Object.fromEntries(preview.map((item) => [item.kind, item]));
  const patch = (path, value) =>
    setDraft((current) => {
      const next = structuredClone(current);
      const keys = path.split(".");
      let target = next;
      keys.slice(0, -1).forEach((key) => {
        target = target[key];
      });
      target[keys.at(-1)] = value;
      // Cru de propósito: normalizar a cada tecla apagaria "5" a caminho de
      // "5000" (abaixo do mínimo). A prévia e o salvar normalizam.
      return next;
    });

  const coveredYears = draft.uf && CALENDARS[draft.uf] ? Object.keys(CALENDARS[draft.uf]).join(", ") : "";
  const year = Number(today.slice(0, 4));
  const ipvaYear = byKind.ipva?.year || year;
  const licensingYear = byKind.licensing?.year || year;

  const save = async () => {
    setSaving(true);
    setError("");
    const result = await onSave?.(car, normalizeReminderSettings(draft));
    setSaving(false);
    if (result === true) {
      onClose?.();
      return;
    }
    setError(result?.message || t("reminders.settings.saveError"));
  };

  const carName = `${car.brand} ${car.model}`;

  return (
    <div className="engine-modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("reminders.configureCar", { car: carName })}
        className="engine-modal-panel engine-pop sm:max-w-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--engine-border)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
              <BellRing size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black text-[var(--engine-text)]">{t("reminders.settings.title")}</h2>
              <p className="truncate text-xs text-[var(--engine-text-muted)]">{carName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="engine-modal-body engine-scroll engine-safe-bottom space-y-4 px-5 py-5">
          <Block title={t("reminders.settings.plate")}>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <label className="space-y-1">
                <span className={labelClass}>{t("reminders.settings.uf")}</span>
                <Select value={draft.uf} onChange={(e) => patch("uf", e.target.value)} className={fieldClass}>
                  <option value="">{t("reminders.settings.ufNone")}</option>
                  {states.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.code} · {state.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className={labelClass}>{t("reminders.settings.plateDigit")}</span>
                <Select
                  value={draft.plateDigit}
                  onChange={(e) => patch("plateDigit", e.target.value)}
                  className={`${fieldClass} w-24`}
                >
                  <option value="">{t("reminders.settings.plateDigitNone")}</option>
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
                    <option key={digit} value={digit}>
                      {digit}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <p className="text-[11px] text-[var(--engine-text-muted)]">{t("reminders.settings.plateHint")}</p>
            {draft.uf && (
              <p className="text-[11px] font-semibold text-[var(--engine-text-muted)]">
                {coveredYears
                  ? t("reminders.settings.covered", { uf: draft.uf, years: coveredYears })
                  : t("reminders.settings.notCovered", { uf: draft.uf })}
              </p>
            )}
          </Block>

          <Block title={t("reminders.kinds.ipva")}>
            <NextLine item={byKind.ipva} t={t} locale={i18n.language} today={today} />
            <label className="block space-y-1">
              <span className={labelClass}>{t("reminders.settings.manualDate")}</span>
              <input
                type="date"
                value={draft.ipva.manualDate || ""}
                onChange={(e) => patch("ipva.manualDate", e.target.value || null)}
                className={fieldClass}
              />
              <span className="ml-1 block text-[11px] text-[var(--engine-text-muted)]">{t("reminders.settings.manualHint")}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {byKind.ipva?.dueDate && (
                <button type="button" className={actionClass} onClick={() => setDraft(markIpvaPaid(draft, byKind.ipva))}>
                  <Check size={14} />
                  {t("reminders.settings.paidInstallment")}
                </button>
              )}
              {byKind.ipva?.dueDate && (
                <button type="button" className={actionClass} onClick={() => setDraft(markIpvaYearPaid(draft, ipvaYear))}>
                  <Check size={14} />
                  {t("reminders.settings.paidIpvaYear", { year: ipvaYear })}
                </button>
              )}
            </div>
          </Block>

          <Block title={t("reminders.kinds.licensing")}>
            <NextLine item={byKind.licensing} t={t} locale={i18n.language} today={today} />
            <label className="block space-y-1">
              <span className={labelClass}>{t("reminders.settings.manualDate")}</span>
              <input
                type="date"
                value={draft.licensing.manualDate || ""}
                onChange={(e) => patch("licensing.manualDate", e.target.value || null)}
                className={fieldClass}
              />
            </label>
            {byKind.licensing?.dueDate && (
              <button type="button" className={actionClass} onClick={() => setDraft(markLicensingPaid(draft, licensingYear))}>
                <Check size={14} />
                {t("reminders.settings.licensed", { year: licensingYear })}
              </button>
            )}
          </Block>

          <Block title={t("reminders.kinds.revision")}>
            <NextLine item={byKind.revision} t={t} locale={i18n.language} today={today} />
            {byKind.revision?.km && byKind.revision.km.kmLeft === null && (
              <p className="text-[11px] text-[var(--engine-text-muted)]">{t("reminders.kmNoOdometer")}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className={labelClass}>{t("reminders.settings.intervalMonths")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={numberOrEmpty(draft.revision.intervalMonths)}
                  onChange={(e) => patch("revision.intervalMonths", toNumberOrNull(e.target.value))}
                  placeholder="12"
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>{t("reminders.settings.intervalKm")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={numberOrEmpty(draft.revision.intervalKm)}
                  onChange={(e) => patch("revision.intervalKm", toNumberOrNull(e.target.value))}
                  placeholder="10000"
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>{t("reminders.settings.lastDate")}</span>
                <input
                  type="date"
                  value={draft.revision.lastDate || ""}
                  max={today}
                  onChange={(e) => patch("revision.lastDate", e.target.value || null)}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>{t("reminders.settings.lastKm")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={numberOrEmpty(draft.revision.lastKm)}
                  onChange={(e) => patch("revision.lastKm", toNumberOrNull(e.target.value))}
                  className={fieldClass}
                />
              </label>
            </div>
            {(Number(draft.revision.intervalMonths) > 0 || Number(draft.revision.intervalKm) > 0) && (
              <button type="button" className={actionClass} onClick={() => setDraft(markRevisionDone(draft, car, today))}>
                <Check size={14} />
                {t("reminders.settings.revisionDone")}
              </button>
            )}
          </Block>

          <Block title={t("reminders.kinds.insurance")}>
            <NextLine item={byKind.insurance} t={t} locale={i18n.language} today={today} />
            <label className="block space-y-1">
              <span className={labelClass}>{t("reminders.settings.renewalDate")}</span>
              <input
                type="date"
                value={draft.insurance.renewalDate || ""}
                onChange={(e) => patch("insurance.renewalDate", e.target.value || null)}
                className={fieldClass}
              />
            </label>
            {draft.insurance.renewalDate && (
              <button type="button" className={actionClass} onClick={() => setDraft(markInsuranceRenewed(draft))}>
                <Check size={14} />
                {t("reminders.settings.renewed")}
              </button>
            )}
          </Block>

          <p className="text-center text-[11px] text-[var(--engine-text-muted)]">{t("reminders.settings.privacy")}</p>

          {error && <p className="text-center text-sm font-semibold text-[var(--engine-accent)]">{error}</p>}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] py-3 font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {t("reminders.settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
