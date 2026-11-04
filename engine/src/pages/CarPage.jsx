import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, BellRing, Calculator, CarFront, Fuel, Pencil, PiggyBank, Receipt, Trash2, Trophy, Wrench } from "lucide-react";
import { CAR_TYPE_OWNED } from "../services/db";
import { formatCarBrand, formatCarName, formatFipeYear } from "../services/carDisplay";
import { resolveVehicleSpecSheet, canEditSpecSheet } from "../services/carSpecSheet";
import { summaryTokens } from "../components/specsheet/labels";
import { expenseInsights } from "../services/expenses";
import { forecastAtPace, forecastCompletion, monthlyPace } from "../services/forecast";
import { isSimulatorAvailable, simulateCar } from "../services/ownership";
import { localISODate } from "../services/reminders";
import { syncGarageReminders } from "../services/remindersSync";
import { contributionMonths, contributionStreak, lastOdometer, monthlyTotals } from "../services/garageSummary";
import { CarMenu, MonthStrip, ProgressRing, Stat } from "../components/garage/GaragePieces";
import { GarageReminders } from "../components/reminders/GarageReminders";
import { ReminderSettingsModal } from "../components/reminders/ReminderSettingsModal";
import { SpecSheetView } from "../components/specsheet/SpecSheetView";
import { myShowcasedCarIds, publishCar, unpublishCar } from "../services/carShowcase";
import { useToast } from "../components/ToastProvider";
import "../services/i18n-cars";

const OWNED_TABS = ["summary", "expenses", "reminders", "specs"];
const GOAL_TABS = ["summary", "contributions", "specs"];

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1598209279122-8541213a0387?q=80&w=600";

/**
 * Página do carro: /garagem/:carId (Garagem 2.0, 01/11/2026).
 *
 * Um endereço por carro no lugar de cinco modais soltos. As abas mostram o
 * que os modais já sabiam (gastos, lembretes, ficha, aportes); lançar e editar
 * continuam nos mesmos modais de antes, que são os que validam e salvam. A aba
 * vai no `?tab=` com `replace`: voltar sai da página, não percorre as abas.
 *
 * Como é rota, o voltar do Android/iOS funciona sem nada especial.
 */
export function CarPage({
  cars,
  hideValues = false,
  userId = "",
  onOpenModal,
  onOpenDelete,
  onOpenOwnership,
  onAddContribution,
  onAddExpense,
  onMarkAchieved,
  onOpenSpecs,
  onSaveReminders,
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const navigate = useNavigate();
  const { carId } = useParams();
  const [params, setParams] = useSearchParams();
  const [remindersOpen, setRemindersOpen] = useState(false);
  const car = cars.find((item) => String(item.id) === String(carId)) || null;

  // Mesmo envio dos lembretes que a Garagem faz: quem configura aqui e fecha
  // o app sem voltar para a lista também recebe o aviso no sino.
  useEffect(() => {
    if (userId && cars.length) syncGarageReminders(userId, cars);
  }, [userId, cars]);

  // Carro que existia e sumiu (excluído daqui mesmo): volta para a Garagem em
  // vez de deixar a pessoa numa página de "não encontrado".
  const seenRef = useRef(false);
  useEffect(() => {
    if (car) seenRef.current = true;
    else if (seenRef.current) navigate("/garagem", { replace: true });
  }, [car, navigate]);

  const goBack = () => {
    // Entrou pelo card: voltar é o voltar do navegador (mantém a rolagem da
    // lista). Entrou por link direto: não há para onde voltar, vai à Garagem.
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/garagem");
  };

  if (!car) {
    return (
      <section className="mx-auto max-w-md py-10 text-center">
        <CarFront size={36} className="mx-auto mb-3 text-[var(--engine-text-muted)]" aria-hidden="true" />
        <p className="font-bold text-[var(--engine-text)]">{t("garageV2.page.notFound")}</p>
        <p className="mt-1 text-sm text-[var(--engine-text-muted)]">{t("garageV2.page.notFoundHint")}</p>
        <Link
          to="/garagem"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--engine-accent)] px-4 text-[13px] font-bold text-white"
        >
          <ArrowLeft size={16} />
          {t("garageV2.page.back")}
        </Link>
      </section>
    );
  }

  const isOwned = car.type === CAR_TYPE_OWNED;
  const tabs = isOwned ? OWNED_TABS : GOAL_TABS;
  const requested = params.get("tab");
  const tab = tabs.includes(requested) ? requested : "summary";
  const selectTab = (next) => setParams(next === "summary" ? {} : { tab: next }, { replace: true });

  const money = (value, cents = false) =>
    hideValues
      ? "R$ --"
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: cents ? 2 : 0,
          minimumFractionDigits: cents ? 2 : 0,
        }).format(value);

  const simulation =
    car.ownership && isSimulatorAvailable(car.ownership.country) ? simulateCar(car) : null;
  const reachedGoal = !isOwned && car.targetValue > 0 && car.savedValue >= car.targetValue;

  return (
    <section className="mx-auto w-full max-w-5xl">
      <CarHero car={car} t={t} locale={locale} onBack={goBack}>
        <CarMenu
          label={t("garageV2.card.menu")}
          className="absolute right-1.5 top-1.5"
          items={[
            { label: t("garageV2.card.edit"), Icon: Pencil, run: () => onOpenModal(car) },
            { label: t("common.delete"), Icon: Trash2, danger: true, run: () => onOpenDelete(car) },
          ]}
        />
      </CarHero>

      <div className="mt-3 flex gap-2">
        {reachedGoal ? (
          <button
            type="button"
            onClick={() => onMarkAchieved(car)}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-[13px] font-bold text-white transition hover:brightness-95 sm:flex-none"
          >
            <Trophy size={15} />
            {t("car.markAchieved")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (isOwned ? onAddExpense(car) : onAddContribution(car))}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-[13px] font-bold text-white transition hover:brightness-95 sm:flex-none"
          >
            {isOwned ? <Receipt size={15} /> : <PiggyBank size={15} />}
            {isOwned ? t("garageV2.card.logExpense") : t("garageV2.page.addContribution")}
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenOwnership(car)}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] sm:flex-none"
        >
          <Calculator size={15} />
          {t("garageV2.page.simulator")}
        </button>
      </div>

      <div
        role="tablist"
        aria-label={t("garageV2.page.tabsLabel")}
        className="-mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-[var(--engine-border)] px-3 [scrollbar-width:none] sm:mx-0 sm:px-0"
      >
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => selectTab(key)}
            className={`min-h-11 shrink-0 border-b-2 px-3 text-[13px] font-bold transition-colors ${
              tab === key
                ? "border-[var(--engine-accent)] text-[var(--engine-text)]"
                : "border-transparent text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
            }`}
          >
            {t(`garageV2.page.tabs.${key}`)}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {tab === "summary" && isOwned && (
          <OwnedSummary car={car} t={t} locale={locale} money={money} simulation={simulation} onOpenReminders={() => selectTab("reminders")} />
        )}
        {tab === "summary" && !isOwned && (
          <GoalSummary car={car} t={t} locale={locale} money={money} simulation={simulation} onOpenOwnership={() => onOpenOwnership(car)} />
        )}
        {tab === "expenses" && <ExpensesTab car={car} t={t} locale={locale} money={money} onAddExpense={() => onAddExpense(car)} />}
        {tab === "reminders" && (
          <div>
            <GarageReminders cars={[car]} onOpenCar={() => setRemindersOpen(true)} />
            <button
              type="button"
              onClick={() => setRemindersOpen(true)}
              className="-mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--engine-border-strong)] px-3.5 text-[13px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)]"
            >
              <BellRing size={15} />
              {t("garageV2.page.configureReminders")}
            </button>
          </div>
        )}
        {tab === "contributions" && (
          <ContributionsTab car={car} t={t} locale={locale} money={money} onAdd={() => onAddContribution(car)} />
        )}
        {tab === "specs" && <SpecsTab car={car} t={t} onOpenSpecs={() => onOpenSpecs(car)} />}

        {/* Só carro que a pessoa TEM vai para a vitrine: meta é um carro que
            ainda não existe na garagem dela. */}
        {tab === "summary" && isOwned && <ShowcaseToggle car={car} />}
      </div>

      {remindersOpen && onSaveReminders && (
        <ReminderSettingsModal car={car} onClose={() => setRemindersOpen(false)} onSave={onSaveReminders} />
      )}
    </section>
  );
}

/** Foto com a identidade dentro, mais baixa que a vitrine: a página é do carro, não da foto. */
/**
 * "Mostrar na comunidade": o único caminho de um carro da garagem para a
 * vitrine pública. Fora daqui nada do carro é lido por outra pessoa.
 */
function ShowcaseToggle({ car }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [on, setOn] = useState(null);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    myShowcasedCarIds()
      .then((ids) => {
        if (alive) setOn(ids.includes(car.id));
      })
      .catch(() => {
        if (alive) setOn(false);
      });
    return () => {
      alive = false;
    };
  }, [car.id]);

  const flip = async () => {
    if (busy || on === null) return;
    setBusy(true);
    try {
      if (on) {
        await unpublishCar(car.id);
        setOn(false);
        setSlug("");
        showToast(t("cars.unpublished"), "success");
      } else {
        setSlug(await publishCar(car));
        setOn(true);
        showToast(t("cars.published"), "success");
      }
    } catch (error) {
      showToast(error?.message || t("community.genericError"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-extrabold text-[var(--engine-text)]">{t("cars.show")}</p>
          <p className="mt-0.5 text-[12.5px] leading-5 text-[var(--engine-text-muted)]">
            {t("cars.showHint")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(on)}
          aria-label={t("cars.show")}
          disabled={busy || on === null}
          onClick={flip}
          className={`mt-0.5 h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors disabled:opacity-60 ${
            on ? "bg-[var(--engine-accent)]" : "bg-[var(--engine-surface-2)]"
          }`}
        >
          <span
            className={`block h-6 w-6 rounded-full bg-white transition-transform ${
              on ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {on && slug && (
        <Link
          to={`/carro/${slug}`}
          className="mt-2 inline-block text-[13px] font-bold text-[var(--engine-accent-text)]"
        >
          {t("cars.viewPublic")}
        </Link>
      )}
    </div>
  );
}

function CarHero({ car, t, locale, onBack, children }) {
  const specs = useMemo(() => {
    try {
      return summaryTokens(t, locale, resolveVehicleSpecSheet(car));
    } catch {
      return [];
    }
  }, [car, t, locale]);

  return (
    <div className="relative -mx-4 h-48 overflow-hidden bg-linear-to-br from-zinc-700 via-zinc-800 to-zinc-950 sm:mx-0 sm:h-52 sm:rounded-2xl lg:h-56">
      {car.image ? (
        <img
          src={car.image}
          alt=""
          onError={(event) => {
            event.target.onerror = null;
            event.target.src = FALLBACK_IMAGE;
            event.target.classList.add("opacity-60");
          }}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center pb-12" aria-hidden="true">
          <CarFront size={52} strokeWidth={1.25} className="text-white/35" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-black/10" />
      <button
        type="button"
        onClick={onBack}
        aria-label={t("garageV2.page.back")}
        className="absolute left-1.5 top-1.5 flex h-11 w-11 items-center justify-center"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/45 text-white backdrop-blur-sm">
          <ArrowLeft size={17} />
        </span>
      </button>
      {children}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
          {formatCarBrand(car.brand)} · {formatFipeYear(car.year, t("car.zeroKm"))}
        </p>
        <h1 className="mt-0.5 line-clamp-2 font-display text-xl font-extrabold italic leading-tight text-white sm:text-2xl">
          {car.model}
        </h1>
        {specs.length > 0 && <p className="mt-0.5 truncate text-xs font-semibold text-white/75">{specs.join(" · ")}</p>}
      </div>
    </div>
  );
}

function Panel({ title, children, className = "" }) {
  return (
    <div className={`engine-card p-4 ${className}`}>
      {title && (
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--engine-text-muted)]">{title}</h2>
      )}
      {children}
    </div>
  );
}

function OwnedSummary({ car, t, locale, money, simulation, onOpenReminders }) {
  const insights = expenseInsights(car);
  const odometer = lastOdometer(car);
  const number = (value, digits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  const real = insights.monthlyAverage;
  const estimated = simulation ? simulation.headline.monthly : null;
  const diff = real && estimated ? Math.round((real / estimated - 1) * 100) : null;

  return (
    <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr] lg:items-start">
      <Panel>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
          <Stat value={odometer ? number(odometer) : "—"} unit="km" label={t("garageV2.page.statOdometer")} />
          <Stat
            value={insights.consumption ? `${insights.consumption.approximate ? "~" : ""}${number(insights.consumption.kmPerLiter, 1)}` : "—"}
            unit="km/l"
            label={t("garageV2.page.statConsumption")}
          />
          <Stat value={insights.costPerKm ? money(insights.costPerKm, true) : "—"} label={t("garageV2.page.statPerKm")} />
          <Stat value={insights.kmPerMonth ? `~${number(insights.kmPerMonth)}` : "—"} unit="km" label={t("garageV2.page.statKmMonth")} />
        </div>
        {!insights.consumption && (
          <p className="mt-3 text-xs text-[var(--engine-text-muted)]">{t("garageV2.card.checkConsumption")}</p>
        )}
      </Panel>

      <Panel title={t("garageV2.page.realVsEstimated")}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-lg font-extrabold tabular-nums text-[var(--engine-text)]">{real ? money(real) : "—"}</p>
            <p className="text-[11.5px] font-semibold text-[var(--engine-text-muted)]">{t("garageV2.page.realLabel")}</p>
          </div>
          <div>
            <p className="text-lg font-extrabold tabular-nums text-[var(--engine-text)]">{estimated !== null ? money(estimated) : "—"}</p>
            <p className="text-[11.5px] font-semibold text-[var(--engine-text-muted)]">{t("garageV2.page.estimatedLabel")}</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--engine-text-muted)]">
          {diff !== null
            ? diff === 0
              ? t("garageV2.page.diffSame")
              : t(diff > 0 ? "garageV2.page.diffAbove" : "garageV2.page.diffBelow", { pct: Math.abs(diff) })
            : !real
              ? t("garageV2.page.noReal")
              : t("garageV2.page.noEstimate")}
        </p>
      </Panel>

      <button
        type="button"
        onClick={onOpenReminders}
        className="engine-card flex min-h-12 items-center gap-3 px-4 py-3 text-left lg:col-span-2"
      >
        <BellRing size={17} className="shrink-0 text-[var(--engine-text-muted)]" aria-hidden="true" />
        <span className="flex-1 text-[13px] font-semibold text-[var(--engine-text)]">{t("garageV2.page.seeReminders")}</span>
      </button>
    </div>
  );
}

function GoalSummary({ car, t, locale, money, simulation, onOpenOwnership }) {
  const target = Number(car.targetValue) || 0;
  const saved = Number(car.savedValue) || 0;
  const remaining = Math.max(target - saved, 0);
  const fraction = target ? Math.min(saved / target, 1) : 0;
  const currentPace = monthlyPace(car.contributions);
  const current = forecastCompletion(car);

  const step = 50;
  const max = Math.max(1000, Math.ceil(Math.max(currentPace * 3, remaining / 24) / 500) * 500);
  const [pace, setPace] = useState(() =>
    Math.min(max, Math.max(step, Math.round((currentPace || Math.min(1000, max)) / step) * step)),
  );
  const whatIf = forecastAtPace(car, pace);
  const delta = whatIf && current ? current.months - whatIf.months : null;
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(fraction * 100);
  const monthYear = (date) => date.toLocaleDateString(locale, { month: "long", year: "numeric" });

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <Panel>
        <div className="flex items-center gap-3">
          <ProgressRing value={fraction} label={`${percent}%`} className="h-16 w-16" textClassName="text-[13px]" />
          <div className="min-w-0">
            <p className="text-xl font-extrabold tabular-nums leading-tight text-[var(--engine-text)]">{money(saved)}</p>
            <p className="text-xs font-semibold text-[var(--engine-text-muted)]">
              {t("garageV2.page.remaining", { value: money(remaining), target: money(target) })}
            </p>
          </div>
        </div>

        {remaining > 0 && (
          <div className="mt-4 border-t border-[var(--engine-border)] pt-4">
            <label htmlFor="engine-goal-pace" className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--engine-text-muted)]">
              {t("garageV2.page.whatIf")}
            </label>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums text-[var(--engine-text)]">{money(pace)}</p>
            <input
              id="engine-goal-pace"
              type="range"
              min={step}
              max={max}
              step={step}
              value={pace}
              onChange={(event) => setPace(Number(event.target.value))}
              className="h-11 w-full accent-[var(--engine-accent)]"
            />
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--engine-text-muted)]">
              {t("garageV2.page.reachIn")}
            </p>
            <p className="text-xl font-extrabold text-[var(--engine-text)] first-letter:uppercase">
              {whatIf ? monthYear(whatIf.date) : t("garageV2.page.tooFar")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--engine-text-muted)]">
              {current
                ? delta > 0
                  ? t("garageV2.page.earlier", { count: delta, pace: money(current.pace) })
                  : delta < 0
                    ? t("garageV2.page.later", { count: -delta, pace: money(current.pace) })
                    : t("garageV2.page.samePace", { pace: money(current.pace) })
                : t("garageV2.page.noPace")}
            </p>
          </div>
        )}
      </Panel>

      <Panel title={t("garageV2.page.whenYours")}>
        {simulation ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-lg font-extrabold tabular-nums text-[var(--engine-text)]">{money(simulation.headline.monthly)}</p>
                <p className="text-[11.5px] font-semibold text-[var(--engine-text-muted)]">{t("garageV2.page.perMonthEstimated")}</p>
              </div>
              <div>
                <p className="text-lg font-extrabold tabular-nums text-[var(--engine-text)]">
                  {money(simulation.recommendations.requiredIncomeTotal)}
                </p>
                <p className="text-[11.5px] font-semibold text-[var(--engine-text-muted)]">
                  {t("garageV2.page.income", { pct: simulation.inputs.incomeSharePct })}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--engine-text-muted)]">
              {simulation.headline.yearly > 0 && `${t("garageV2.page.yearly", { value: money(simulation.headline.yearly) })} `}
              {t("garageV2.page.simNote")}
            </p>
            <button
              type="button"
              onClick={onOpenOwnership}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--engine-border-strong)] px-3.5 text-[13px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)]"
            >
              <Calculator size={15} />
              {t("garageV2.page.adjust")}
            </button>
          </>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-[var(--engine-text-muted)]">{t("garageV2.page.noSimulation")}</p>
            <button
              type="button"
              onClick={onOpenOwnership}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--engine-accent)] px-3.5 text-[13px] font-bold text-white transition hover:brightness-95"
            >
              <Calculator size={15} />
              {t("garageV2.page.simulate")}
            </button>
          </>
        )}
      </Panel>
    </div>
  );
}

/** Barras dos últimos 6 meses em SVG: altura por atributo, sem estilo inline. */
function MonthBars({ months, locale, money }) {
  const max = Math.max(...months.map((entry) => entry.amount), 1);
  const label = (month) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
  return (
    <div className="grid grid-cols-6 gap-2">
      {months.map((entry, index) => {
        const height = entry.amount ? Math.max((entry.amount / max) * 80, 4) : 2;
        return (
          <div key={entry.month} className="flex min-w-0 flex-col items-center gap-1">
            <span className="w-full truncate text-center text-[10.5px] font-bold tabular-nums text-[var(--engine-text-muted)]">
              {entry.amount ? money(entry.amount) : "—"}
            </span>
            <svg viewBox="0 0 24 80" preserveAspectRatio="none" className="h-20 w-full max-w-10" aria-hidden="true">
              <rect
                x="0"
                y={80 - height}
                width="24"
                height={height}
                rx="3"
                className={index === months.length - 1 ? "fill-[var(--engine-accent)]" : "fill-[var(--engine-border-strong)]"}
              />
            </svg>
            <span className="text-[11px] font-semibold text-[var(--engine-text-muted)]">{label(entry.month)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ExpensesTab({ car, t, locale, money, onAddExpense }) {
  const insights = expenseInsights(car);
  const months = monthlyTotals(insights.expenses, localISODate(), 6);
  const dateLabel = (iso) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });

  if (!insights.expenses.length) {
    return (
      <Panel>
        <p className="text-[13px] text-[var(--engine-text-muted)]">{t("garageV2.page.noExpenses")}</p>
        <button
          type="button"
          onClick={onAddExpense}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--engine-accent)] px-3.5 text-[13px] font-bold text-white"
        >
          <Receipt size={15} />
          {t("garageV2.card.logExpense")}
        </button>
      </Panel>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <Panel title={t("garageV2.page.byMonth")}>
        <MonthBars months={months} locale={locale} money={money} />
        <p className="mt-3 text-xs text-[var(--engine-text-muted)]">
          {insights.monthlyAverage
            ? t("garageV2.page.monthlyAverage", { value: money(insights.monthlyAverage) })
            : t("expenses.needMoreHistory")}
        </p>
      </Panel>

      {insights.byCategory.length > 0 && (
        <Panel title={t("expenses.whereItGoes")}>
          <ul className="space-y-2.5">
            {insights.byCategory.slice(0, 5).map((row) => (
              <li key={row.category}>
                <div className="flex justify-between gap-3 text-[13px] font-semibold text-[var(--engine-text)]">
                  <span>{t(`expenses.category.${row.category}`)}</span>
                  <span className="tabular-nums">{money(row.amount)}</span>
                </div>
                <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="mt-1 h-1.5 w-full" aria-hidden="true">
                  <rect width="100" height="4" rx="2" className="fill-[var(--engine-surface-2)]" />
                  <rect width={Math.max(row.share * 100, 1)} height="4" rx="2" className="fill-[var(--engine-accent)]" />
                </svg>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="engine-card overflow-hidden lg:col-span-2">
        <ul className="divide-y divide-[var(--engine-border)]">
          {insights.expenses.slice(0, 8).map((entry) => {
            const Icon = entry.category === "fuel" ? Fuel : entry.category === "maintenance" ? Wrench : Receipt;
            const details = [
              dateLabel(entry.date),
              entry.liters ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(entry.liters)} L` : null,
              entry.odometer ? `${new Intl.NumberFormat(locale).format(entry.odometer)} km` : null,
              entry.note || null,
            ].filter(Boolean);
            return (
              <li key={entry.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                <Icon size={17} className="shrink-0 text-[var(--engine-text-muted)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold text-[var(--engine-text)]">
                    {t(`expenses.category.${entry.category}`)}
                  </span>
                  <span className="block truncate text-xs text-[var(--engine-text-muted)]">{details.join(" · ")}</span>
                </span>
                <span className="text-[13.5px] font-bold tabular-nums text-[var(--engine-text)]">{money(entry.amount)}</span>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onAddExpense}
          className="flex min-h-11 w-full items-center justify-center border-t border-[var(--engine-border)] text-[13px] font-bold text-[var(--engine-text)] transition-colors hover:bg-[var(--engine-surface-2)]"
        >
          {t("garageV2.page.allExpenses", { count: insights.expenses.length })}
        </button>
      </div>
    </div>
  );
}

function ContributionsTab({ car, t, locale, money, onAdd }) {
  const today = localISODate();
  const months = contributionMonths(car.contributions, today);
  const streak = contributionStreak(car.contributions, today);
  const list = car.contributions || [];
  const dateLabel = (iso) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <Panel title={t("garageV2.page.last12")}>
        <MonthStrip months={months} locale={locale} showLabels />
        <p className="mt-3 text-xs text-[var(--engine-text-muted)]">
          {streak > 0 ? t("garageV2.card.streak", { count: streak }) : t("garageV2.card.noContributions")}
        </p>
      </Panel>
      <div className="engine-card overflow-hidden">
        {list.length ? (
          <ul className="divide-y divide-[var(--engine-border)]">
            {list.slice(0, 10).map((entry, index) => (
              <li key={entry.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                <PiggyBank size={16} className="shrink-0 text-[var(--engine-text-muted)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold text-[var(--engine-text)]">{dateLabel(entry.date)}</span>
                  {index === list.length - 1 && (
                    <span className="block text-xs text-[var(--engine-text-muted)]">{t("garageV2.page.firstContribution")}</span>
                  )}
                </span>
                <span className="text-[13.5px] font-bold tabular-nums text-[var(--engine-text)]">{money(entry.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-[13px] text-[var(--engine-text-muted)]">{t("garageV2.card.noContributions")}</p>
        )}
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-11 w-full items-center justify-center border-t border-[var(--engine-border)] text-[13px] font-bold text-[var(--engine-text)] transition-colors hover:bg-[var(--engine-surface-2)]"
        >
          {t("garageV2.page.manageContributions")}
        </button>
      </div>
    </div>
  );
}

/**
 * A ficha inline, com o mesmo componente do modal. Editar continua no modal
 * (é ele que tem o editor, a validação e o destrave da potência).
 */
function SpecsTab({ car, t, onOpenSpecs }) {
  const resolved = useMemo(() => {
    try {
      return resolveVehicleSpecSheet(car);
    } catch {
      return null;
    }
  }, [car]);

  if (!resolved) return <Panel>{t("garageV2.page.specsUnavailable")}</Panel>;

  return (
    <div className="engine-card p-4">
      <SpecSheetView
        resolved={resolved}
        versionString={formatCarName(car)}
        canEdit={canEditSpecSheet(car)}
        onEdit={onOpenSpecs}
        onCorrectVersion={onOpenSpecs}
      />
    </div>
  );
}

