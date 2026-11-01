import { useTranslation } from "react-i18next";
import { BellRing, PiggyBank, Receipt } from "lucide-react";
import { garageSummary } from "../../services/garageSummary";
import { localISODate } from "../../services/reminders";
import { formatDueDate, reminderStatusText, reminderTitle } from "../../services/reminderLabels";
import { formatCarBrand } from "../../services/carDisplay";

// Classe inteira por contagem: o Tailwind só gera o que aparece escrito.
const COLS = { 1: "sm:grid-cols-1 sm:max-w-sm", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

const shortName = (car) =>
  `${formatCarBrand(car.brand)} ${String(car.model || "").split(" ").slice(0, 2).join(" ")}`.trim();

/**
 * "Como está minha garagem" em três números: gasto real por mês, próximo
 * vencimento e quanto já foi guardado para as metas. No celular é uma faixa
 * que rola de lado (o terceiro aparece pela metade, convidando); a partir de
 * sm as três cabem lado a lado.
 *
 * Só aparece o que existe: sem carro próprio somem os dois primeiros, sem
 * meta some o terceiro.
 */
export function GarageSummary({ cars, hideValues = false, onOpenCar }) {
  const { t, i18n } = useTranslation();
  const today = localISODate();
  const summary = garageSummary(cars, today);
  const money = (value) =>
    hideValues
      ? "R$ --"
      : new Intl.NumberFormat(i18n.language, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

  const tiles = [];

  if (summary.ownedCount) {
    const firstWithHistory = summary.ownedWithHistory[0];
    tiles.push({
      key: "real",
      Icon: Receipt,
      label: t("garageV2.summary.realMonthly"),
      value: summary.realMonthly === null ? "—" : money(summary.realMonthly),
      hint:
        summary.realMonthly === null
          ? t("garageV2.summary.realMonthlyEmpty")
          : summary.ownedWithoutHistory.length
            ? t("garageV2.summary.realMonthlyMissing", {
                cars: summary.ownedWithoutHistory.map(shortName).join(", "),
              })
            : t("garageV2.summary.realMonthlyAll"),
      run: () => onOpenCar(firstWithHistory || cars.find((car) => car.type === "owned"), "expenses"),
    });

    const next = summary.nextDue;
    tiles.push({
      key: "due",
      Icon: BellRing,
      label: t("garageV2.summary.nextDue"),
      value: next ? reminderStatusText(t, next) : t("garageV2.summary.nextDueNone"),
      hint: next
        ? `${reminderTitle(t, next)} · ${shortName(next.car)} · ${formatDueDate(next.dueDate, i18n.language, today)}`
        : t("garageV2.summary.nextDueNoneHint"),
      run: () => onOpenCar(next ? next.car : cars.find((car) => car.type === "owned"), "reminders"),
    });
  }

  if (summary.goalCount) {
    const firstGoal = cars.find((car) => car.type !== "owned");
    tiles.push({
      key: "saved",
      Icon: PiggyBank,
      label: t("garageV2.summary.saved"),
      value: money(summary.savedTotal),
      hint: t("garageV2.summary.savedOf", { target: money(summary.targetTotal), count: summary.goalCount }),
      run: () => onOpenCar(firstGoal),
    });
  }

  if (!tiles.length) return null;

  return (
    <div
      className={`-mx-4 mb-6 flex [scrollbar-width:none] snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 ${COLS[tiles.length]}`}
      aria-label={t("garageV2.summary.label")}
    >
      {tiles.map((tile) => (
        <button
          key={tile.key}
          type="button"
          onClick={tile.run}
          className="engine-card flex w-[72%] shrink-0 snap-start flex-col gap-1 px-3.5 py-3 text-left transition-colors hover:border-[var(--engine-border-strong)] sm:w-auto"
        >
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--engine-text-muted)]">
            <tile.Icon size={12} aria-hidden="true" />
            {tile.label}
          </span>
          <span className="truncate text-lg font-extrabold tabular-nums leading-tight text-[var(--engine-text)]">
            {tile.value}
          </span>
          <span className="line-clamp-2 text-[11.5px] leading-snug text-[var(--engine-text-muted)]">{tile.hint}</span>
        </button>
      ))}
    </div>
  );
}
