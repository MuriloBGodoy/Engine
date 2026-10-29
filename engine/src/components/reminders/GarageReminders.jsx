import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, CalendarClock, ChevronRight, FileCheck2, Shield, Wrench } from "lucide-react";
import { garageUpcoming, carReminders, hasAnyReminderSetting, localISODate } from "../../services/reminders";
import {
  formatDueDate,
  reminderStateText,
  reminderStatusText,
  reminderTitle,
  reminderTone,
} from "../../services/reminderLabels";
import { formatCarBrand } from "../../services/carDisplay";

const KIND_ICON = { ipva: FileCheck2, licensing: FileCheck2, revision: Wrench, insurance: Shield };
const COLLAPSED = 4;

const carLabel = (car) => `${formatCarBrand(car.brand)} ${String(car.model || "").split(" ").slice(0, 2).join(" ")}`.trim();

/**
 * "Próximos vencimentos" da Garagem: tudo que tem data, de todos os carros
 * que a pessoa TEM, do mais urgente ao mais distante — e um convite por carro
 * que ainda não tem nada configurado. Tocar numa linha abre os lembretes
 * daquele carro.
 */
export function GarageReminders({ cars = [], onOpenCar }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const today = localISODate();

  const owned = useMemo(() => cars.filter((car) => car.type === "owned"), [cars]);
  const items = useMemo(() => garageUpcoming(owned, today), [owned, today]);
  // Carro sem NADA com data e sem nada configurado: convite. Carro configurado
  // mas sem data (calendário 2027 pendente) já aparece dentro dos lembretes.
  const unconfigured = owned.filter(
    (car) => !hasAnyReminderSetting(car) && !carReminders(car, today).some((item) => item.dueDate),
  );

  // IPVA/licenciamento sem data por falta de calendário (2027 não publicado,
  // UF não coberta): aparece dito, no fim da lista — sumir calado faria a
  // pessoa achar que está tudo em dia.
  const waiting = owned.flatMap((car) =>
    hasAnyReminderSetting(car)
      ? carReminders(car, today)
          .filter((item) => item.state === "calendarPending" || item.state === "notCovered")
          .map((item) => ({ ...item, carId: car.id, car }))
      : [],
  );

  if (!owned.length) return null;

  const rows = [...items, ...waiting];
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);
  const soonCount = items.filter((item) => ["overdue", "today", "soon"].includes(item.status)).length;

  return (
    <section
      aria-labelledby="engine-reminders-title"
      className="engine-card mb-6 overflow-hidden"
    >
      <header className="flex items-start gap-3 border-b border-[var(--engine-border)] px-4 py-3.5 sm:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
          <CalendarClock size={20} />
        </span>
        <div className="min-w-0">
          <h2 id="engine-reminders-title" className="text-base font-black text-[var(--engine-text)]">
            {t("reminders.title")}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--engine-text-muted)]">{t("reminders.subtitle")}</p>
        </div>
      </header>

      <ul className="divide-y divide-[var(--engine-border)]">
        {visible.map((item) => {
          const Icon = KIND_ICON[item.kind] || BellRing;
          const detail =
            item.kind === "revision" && item.km?.kmLeft > 0
              ? t("reminders.kmLeft", { km: item.km.kmLeft.toLocaleString(i18n.language) })
              : null;
          const waitingRow = !item.status;
          return (
            <li key={`${item.carId}-${item.kind}`}>
              <button
                type="button"
                onClick={() => onOpenCar?.(item.car)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--engine-surface-2)] sm:px-5"
              >
                <Icon size={18} className="shrink-0 text-[var(--engine-text-subtle)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--engine-text)]">
                    {reminderTitle(t, item)}
                  </span>
                  <span className="block text-xs text-[var(--engine-text-muted)]">
                    {carLabel(item.car)}
                    {item.dueDate ? ` · ${formatDueDate(item.dueDate, i18n.language, today)}` : ""}
                    {item.estimated ? ` (${t("reminders.estimate").toLowerCase()})` : ""}
                    {detail ? ` · ${detail}` : ""}
                    {waitingRow ? ` · ${reminderStateText(t, item)}` : ""}
                  </span>
                </span>
                {!waitingRow && (
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black tabular-nums ${reminderTone(item)}`}
                  >
                    {reminderStatusText(t, item)}
                  </span>
                )}
              </button>
            </li>
          );
        })}

        {unconfigured.map((car) => (
          <li key={`setup-${car.id}`}>
            <button
              type="button"
              onClick={() => onOpenCar?.(car)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--engine-surface-2)] sm:px-5"
            >
              <BellRing size={18} className="shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--engine-text)]">
                {t("reminders.setupPrompt", { car: carLabel(car) })}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-black uppercase tracking-wider text-[var(--engine-accent)]">
                {t("reminders.configure")}
                <ChevronRight size={14} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {items.length > 0 && soonCount === 0 && !expanded && (
        <p className="border-t border-[var(--engine-border)] px-4 py-2 text-xs text-[var(--engine-text-muted)] sm:px-5">
          {t("reminders.nothingSoon")}
        </p>
      )}

      {rows.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-11 w-full items-center justify-center border-t border-[var(--engine-border)] text-xs font-black uppercase tracking-wider text-[var(--engine-accent)] transition-colors hover:bg-[var(--engine-surface-2)]"
        >
          {expanded ? t("reminders.showLess") : t("reminders.showAll", { count: rows.length })}
        </button>
      )}
    </section>
  );
}
