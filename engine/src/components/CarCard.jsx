import { BellRing, Calculator, Check, ChevronRight, FileText, Pencil, PiggyBank, Receipt, Trash2, Trophy, CarFront } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { resolveVehicleSpecSheet } from "../services/carSpecSheet";
import { summaryTokens } from "./specsheet/labels";
import { simulateCar, isSimulatorAvailable } from "../services/ownership";
import { forecastCompletion } from "../services/forecast";
import { expenseInsights } from "../services/expenses";
import { CAR_TYPE_OWNED } from "../services/db";
import { formatCarBrand, formatFipeYear } from "../services/carDisplay";
import { localISODate, mostUrgent } from "../services/reminders";
import { reminderStatusText, reminderTone } from "../services/reminderLabels";
import { contributionMonths, contributionStreak, lastOdometer, ownedChecklist } from "../services/garageSummary";
import { CarMenu, MonthStrip, ProgressRing, Stat } from "./garage/GaragePieces";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1598209279122-8541213a0387?q=80&w=600";

/**
 * Card de carro da Garagem 2.0 (aprovada em 01/11/2026, "mas não deixa ficar
 * tão grande"). Mais denso que o anterior: foto 16:9 mais baixa, identidade
 * dentro dela, uma linha de números e duas ações.
 *
 * - Carro próprio: os números que ele JÁ gera (km do painel, consumo real,
 *   gasto real por mês) saíram do modal de gastos para a vitrine. Sem
 *   histórico, uma lista curta do que falta para ele ter esses números.
 * - Meta: anel de progresso, faixa de 12 meses de aporte e previsão.
 *
 * Todo número vem das funções que já existiam (expenses, forecast, ownership).
 * O do simulador sai sempre com "estimado" e o do extrato com "real": até
 * aqui os dois apareciam lado a lado sem dizer qual era qual.
 *
 * O card inteiro abre a página do carro (`onOpen`). Editar, ficha e excluir
 * ficam no menu "...".
 */
export function CarCard({
  car,
  onOpen,
  onEdit,
  onDelete,
  onOpenOwnership,
  onAddContribution,
  onAddExpense,
  onMarkAchieved,
  onOpenSpecs,
  onOpenReminders,
  hideValues = false,
}) {
  const { i18n, t } = useTranslation();
  const locale = i18n.language;
  const today = localISODate();
  const isOwned = car.type === CAR_TYPE_OWNED;

  const money = (value, cents = false) =>
    hideValues
      ? "R$ --"
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: cents ? 2 : 0,
          minimumFractionDigits: cents ? 2 : 0,
        }).format(value);

  // Mesma regra de antes: só com simulação salva e país coberto há número.
  const estimatedMonthly =
    car.ownership && isSimulatorAvailable(car.ownership.country)
      ? simulateCar(car).headline.monthly
      : null;

  const specs = useMemo(() => {
    try {
      return summaryTokens(t, locale, resolveVehicleSpecSheet(car));
    } catch {
      // Carro antigo com marca/modelo fora do padrão não derruba a garagem.
      return [];
    }
  }, [car, t, locale]);

  const open = () => onOpen?.(car);
  const menuItems = [
    onEdit && { label: t("garageV2.card.edit"), Icon: Pencil, run: () => onEdit(car) },
    onOpenSpecs && { label: t("specSheet.title"), Icon: FileText, run: () => onOpenSpecs(car) },
    onDelete && { label: t("common.delete"), Icon: Trash2, danger: true, run: () => onDelete(car) },
  ];

  const urgent = isOwned ? mostUrgent(car, today) : null;

  return (
    <article className="engine-card engine-card-hover group relative flex h-full flex-col overflow-hidden">
      {/* Sem foto o fundo é sempre escuro, nos dois temas: a identidade é
          branca e, no tema claro, ficava branco sobre cinza claro. */}
      {/* Sem foto a faixa fica baixa: um ícone não precisa de 16:9. */}
      <div
        className={`relative w-full overflow-hidden bg-linear-to-br from-zinc-700 via-zinc-800 to-zinc-950 ${
          car.image ? "aspect-[16/9] md:aspect-[2/1]" : "h-32"
        }`}
      >
        {car.image ? (
          <img
            src={car.image}
            alt=""
            loading="lazy"
            onError={(event) => {
              event.target.onerror = null;
              event.target.src = FALLBACK_IMAGE;
              event.target.classList.add("opacity-60");
            }}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex h-full w-full items-start justify-end p-3 pr-14" aria-hidden="true">
            <CarFront size={30} strokeWidth={1.25} className="text-white/30" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent" />

        <button
          type="button"
          onClick={open}
          aria-label={t("garageV2.card.open", { car: `${formatCarBrand(car.brand)} ${car.model}` })}
          className="absolute inset-0 flex items-end gap-2 p-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/80">
              {formatCarBrand(car.brand)} · {formatFipeYear(car.year, t("car.zeroKm"))}
            </span>
            <span className="mt-0.5 line-clamp-2 block font-display text-[17px] font-extrabold italic leading-tight tracking-tight text-white">
              {car.model}
            </span>
            {specs.length > 0 && (
              <span className="mt-0.5 block truncate text-[11px] font-semibold text-white/75">
                {specs.join(" · ")}
              </span>
            )}
          </span>
          <ChevronRight size={18} aria-hidden="true" className="mb-0.5 shrink-0 text-white/75 transition group-hover:translate-x-0.5" />
        </button>

        <CarMenu items={menuItems} label={t("garageV2.card.menu")} className="absolute right-1 top-1" />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        {isOwned ? (
          <OwnedBody car={car} t={t} locale={locale} money={money} urgent={urgent} onOpenReminders={onOpenReminders} />
        ) : (
          <GoalBody car={car} t={t} locale={locale} money={money} today={today} />
        )}

        <div className="mt-auto flex gap-2">
          {renderActions({
            car,
            t,
            isOwned,
            money,
            estimatedMonthly,
            onAddContribution,
            onAddExpense,
            onOpenOwnership,
            onMarkAchieved,
          })}
        </div>
      </div>
    </article>
  );
}

function OwnedBody({ car, t, locale, money, urgent, onOpenReminders }) {
  const insights = expenseInsights(car);
  const odometer = lastOdometer(car);
  const hasNumbers = Boolean(insights.monthlyAverage || insights.consumption || odometer);
  const checklist = ownedChecklist(car);
  const done = Object.values(checklist).filter(Boolean).length;
  const number = (value, digits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

  return (
    <>
      {hasNumbers ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat value={odometer ? number(odometer) : "—"} unit="km" label={t("garageV2.card.odometer")} />
          <Stat
            value={insights.consumption ? `${insights.consumption.approximate ? "~" : ""}${number(insights.consumption.kmPerLiter, 1)}` : "—"}
            unit="km/l"
            label={t("garageV2.card.consumption")}
          />
          <Stat
            value={insights.monthlyAverage ? money(insights.monthlyAverage) : "—"}
            label={t("garageV2.card.monthlyReal")}
          />
        </div>
      ) : (
        <div>
          <p className="text-[12px] font-bold text-[var(--engine-text)]">
            {t("garageV2.card.checklistTitle", { done })}
          </p>
          <ul className="mt-1.5 space-y-1">
            {[
              ["consumption", t("garageV2.card.checkConsumption")],
              ["reminders", t("garageV2.card.checkReminders")],
              ["photo", t("garageV2.card.checkPhoto")],
            ].map(([key, label]) => (
              <li key={key} className="flex items-start gap-2 text-[12px] leading-snug text-[var(--engine-text-muted)]">
                <span
                  aria-hidden="true"
                  className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    checklist[key]
                      ? "border-transparent bg-[var(--engine-accent)] text-white"
                      : "border-[var(--engine-border-strong)]"
                  }`}
                >
                  {checklist[key] ? <Check size={10} strokeWidth={3} /> : null}
                </span>
                <span className={checklist[key] ? "line-through" : ""}>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {urgent && (
        <button
          type="button"
          onClick={() => onOpenReminders?.(car)}
          className="-my-1 flex min-h-11 items-center gap-2 text-left"
        >
          <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${reminderTone(urgent)}`}>
            <BellRing size={11} className="shrink-0" />
            <span className="truncate">
              {t("reminders.cardChip", {
                item: t(`reminders.kinds.${urgent.kind}`),
                status: reminderStatusText(t, urgent),
              })}
            </span>
          </span>
        </button>
      )}
    </>
  );
}

function GoalBody({ car, t, locale, money, today }) {
  const target = Number(car.targetValue) || 0;
  const saved = Number(car.savedValue) || 0;
  const fraction = target ? Math.min(saved / target, 1) : 0;
  const forecast = forecastCompletion(car);
  const months = contributionMonths(car.contributions, today);
  const streak = contributionStreak(car.contributions, today);
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(fraction * 100);

  return (
    <>
      <div className="flex items-center gap-3">
        <ProgressRing value={fraction} label={`${percent}%`} />
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold tabular-nums leading-tight text-[var(--engine-text)]">
            {money(saved)}
          </p>
          <p className="truncate text-[11.5px] font-semibold text-[var(--engine-text-muted)]">
            {t("garageV2.card.savedOf", { target: money(target) })}
          </p>
        </div>
      </div>
      <div>
        <MonthStrip months={months} locale={locale} />
        <p className="mt-1.5 truncate text-[11.5px] font-semibold text-[var(--engine-text-muted)]">
          {forecast
            ? t("garageV2.card.forecast", {
                date: forecast.date.toLocaleDateString(locale, { month: "short", year: "numeric" }),
              })
            : streak > 0
              ? t("garageV2.card.streak", { count: streak })
              : t("garageV2.card.noContributions")}
        </p>
      </div>
    </>
  );
}

/**
 * As duas ações do rodapé: a do dia a dia (gasto ou aporte) e o simulador,
 * com o número dele marcado como estimado. Meta batida vira uma ação só.
 */
function renderActions({ car, t, isOwned, money, estimatedMonthly, onAddContribution, onAddExpense, onOpenOwnership, onMarkAchieved }) {
  const reachedGoal = !isOwned && car.targetValue > 0 && car.savedValue >= car.targetValue;
  if (reachedGoal && onMarkAchieved) {
    return (
      <button
        type="button"
        onClick={() => onMarkAchieved(car)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-3 text-[12px] font-black uppercase tracking-wider text-white transition hover:brightness-95"
      >
        <Trophy size={14} />
        {t("car.markAchieved")}
      </button>
    );
  }

  const primary = isOwned
    ? onAddExpense && { run: () => onAddExpense(car), Icon: Receipt, label: t("garageV2.card.logExpense") }
    : onAddContribution && { run: () => onAddContribution(car), Icon: PiggyBank, label: t("garageV2.card.save") };

  return (
    <>
      {primary && (
        <button
          type="button"
          onClick={primary.run}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--engine-accent)] px-3 text-[12.5px] font-bold text-white transition hover:brightness-95"
        >
          <primary.Icon size={15} className="shrink-0" />
          <span className="truncate">{primary.label}</span>
        </button>
      )}
      {onOpenOwnership && (
        <button
          type="button"
          onClick={() => onOpenOwnership(car)}
          className="flex min-h-11 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-left transition-colors hover:border-[var(--engine-accent)]"
        >
          <Calculator size={15} className="shrink-0 text-[var(--engine-text-muted)]" />
          <span className="min-w-0">
            {estimatedMonthly === null ? (
              <span className="block truncate text-[12.5px] font-bold text-[var(--engine-text)]">
                {t("garageV2.card.simulate")}
              </span>
            ) : (
              <>
                <span className="block truncate text-[12.5px] font-extrabold tabular-nums leading-tight text-[var(--engine-text)]">
                  {money(estimatedMonthly)}
                </span>
                <span className="block truncate text-[10.5px] font-semibold text-[var(--engine-text-muted)]">
                  {t("garageV2.card.estimatedMonthly")}
                </span>
              </>
            )}
          </span>
        </button>
      )}
    </>
  );
}
