import { useMemo, useState } from "react";
import { X, Save, Loader2, Hammer } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  estimateOwnership,
  normalizeOwnershipInputs,
  defaultOwnershipInputs,
  DEFAULT_CONSUMPTION,
  FUEL_TYPES,
  isSimulatorAvailable,
} from "../services/ownership";
import { pickReferenceCar } from "../services/expenses";
import { engineDB } from "../services/db";
import { getStates, getStateName } from "../services/locations";
import { consumptionFor } from "../services/consumption";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { formatCarName, formatFipeYear } from "../services/carDisplay";
import { useToast } from "./ToastProvider";

/*
 * Simulador enxuto, 06/10/2026.
 *
 * O Murilo pediu "algo mais enxuto, que acerte de verdade e dê vontade de
 * usar". A versão anterior (redesenho de 16/09, três abas, ~15 campos, faixa
 * de incerteza, veredito por situação de vida) somava seguro e manutenção
 * ESTIMADOS — curvas sem fonte que diga quanto custa ESTE carro. Ela continua
 * no histórico do git (c7de41e e anteriores) para quem quiser voltar.
 *
 * A regra desta tela: o total só soma linha que tem lei, conta ou número da
 * própria pessoa por trás.
 *   - IPVA e licenciamento — lei do estado.
 *   - Parcela — tabela Price, com a taxa média do Banco Central se a pessoa
 *     não informar a dela (e a tela diz isso).
 *   - Combustível — km informado × consumo do INMETRO (ou o da pessoa) × preço
 *     da ANP na UF.
 *   - Seguro e manutenção — SÓ o valor que a pessoa digitar. Vazio fica fora
 *     do total, escrito como fora.
 * A renda é opcional e responde uma coisa só: quanto do salário o carro come.
 */

const fieldClass =
  "w-full min-h-12 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3 text-[15px] text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]";
const labelClass =
  "ml-0.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]";
const questionClass = "text-[16px] font-bold text-[var(--engine-text)]";
const optionClass = (active) =>
  `flex min-h-12 flex-col justify-center rounded-xl border px-3.5 py-2.5 text-left text-[14px] font-semibold transition-colors ${
    active
      ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-text)]"
      : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:border-[var(--engine-border-strong)]"
  }`;

const KM_BANDS = [
  { key: "little", value: 600 },
  { key: "some", value: 1000 },
  { key: "normal", value: 1200 },
  { key: "much", value: 2500 },
  { key: "work", value: 4000 },
];
const FINANCE_MONTHS = [24, 36, 48, 60, 72];

/** Campo numérico em reais: vazio quer dizer "não informado", não zero. */
function MoneyInput({ id, value, onChange, placeholder }) {
  return (
    <input
      id={id}
      type="number"
      min="0"
      step="10"
      inputMode="numeric"
      value={value > 0 ? value : ""}
      placeholder={placeholder}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className={fieldClass}
    />
  );
}

function Field({ label, htmlFor, hint, children }) {
  return (
    <div className="space-y-2">
      <label className={labelClass} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="ml-0.5 text-[12px] leading-relaxed text-[var(--engine-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Uma linha da conta. Título e valor dividem a primeira linha; a explicação de
 * onde o número vem fica embaixo, na largura inteira — dividindo a largura com
 * o valor ela virava uma coluna de quatro palavras no celular.
 */
function Line({ label, source, value, missing = false }) {
  return (
    <div className="border-b border-[var(--engine-slab-line)] py-3.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 text-[15px] font-semibold text-[var(--engine-slab-fg)]">{label}</span>
        <span
          className={`shrink-0 font-display text-[16px] font-bold tabular-nums ${
            missing ? "text-[var(--engine-slab-fg-muted)]" : "text-[var(--engine-slab-fg)]"
          }`}
        >
          {value}
        </span>
      </div>
      {source ? (
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--engine-slab-fg-muted)]">{source}</p>
      ) : null}
    </div>
  );
}

/** Rótulo de grupo dentro do slab ("Todo mês", "Uma vez por ano"). */
function GroupLabel({ children }) {
  return (
    <p className="mt-7 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--engine-slab-fg-muted)]">
      {children}
    </p>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="space-y-4 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5">
      <h4 className={questionClass}>
        {title}
        {hint ? (
          <span className="mt-1 block text-[13px] font-medium leading-relaxed text-[var(--engine-text-muted)]">
            {hint}
          </span>
        ) : null}
      </h4>
      {children}
    </section>
  );
}

export function OwnershipModal({
  isOpen,
  car,
  cars = [],
  settings,
  onClose,
  onSave,
  onSettingsUpdate,
}) {
  if (!isOpen || !car) return null;
  const country = car.ownership?.country || settings?.profile?.country;
  if (!isSimulatorAvailable(country)) {
    return <ComingSoon car={car} onClose={onClose} />;
  }
  // key={car.id} garante estado limpo do formulário a cada carro aberto.
  return (
    <OwnershipDialog
      key={car.id}
      car={car}
      cars={cars}
      settings={settings}
      onClose={onClose}
      onSave={onSave}
      onSettingsUpdate={onSettingsUpdate}
    />
  );
}

/**
 * Fora do Brasil. O valor do carro vem da FIPE, que é brasileira e em reais,
 * então qualquer conta aqui seria um carro brasileiro com imposto de outro
 * país. Melhor dizer que está sendo feito do que mostrar número inventado.
 */
function ComingSoon({ car, onClose }) {
  const { t } = useTranslation();
  useHistoryDismiss(true, onClose);
  return (
    <div className="engine-modal-overlay">
      <div className="engine-modal-panel engine-pop sm:max-w-md">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:pb-4 sm:pt-5">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--engine-text-muted)]">
              {t("ownership.kicker")}
            </p>
            <h2 className="mt-0.5 text-[15px] font-extrabold leading-tight tracking-tight text-[var(--engine-text)] sm:text-lg">
              {formatCarName(car)}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] sm:h-10 sm:w-10"
          >
            <X size={20} />
          </button>
        </div>
        <div className="engine-modal-body px-6 py-10 text-center sm:px-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
            <Hammer size={26} />
          </span>
          <h3 className="mt-5 text-[20px] font-extrabold tracking-tight text-[var(--engine-text)]">
            {t("ownership.lean.soonTitle")}
          </h3>
          <p className="mx-auto mt-3 max-w-[38ch] text-[14px] leading-relaxed text-[var(--engine-text-muted)]">
            {t("ownership.lean.soonBody")}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-7 min-h-12 rounded-xl bg-[var(--engine-accent)] px-6 text-[15px] font-bold text-white transition hover:brightness-95"
          >
            {t("ownership.lean.soonCta")}
          </button>
        </div>
      </div>
    </div>
  );
}

function OwnershipDialog({ car, cars, settings, onClose, onSave, onSettingsUpdate }) {
  const showToast = useToast();
  const { i18n, t } = useTranslation();
  const [inputs, setInputs] = useState(() =>
    car.ownership ? normalizeOwnershipInputs(car.ownership) : defaultOwnershipInputs(),
  );
  // Só o Brasil chega aqui (ver OwnershipModal).
  const country = "BR";
  const [state, setState] = useState(
    () => car.ownership?.state || settings?.profile?.state || "",
  );
  // Renda é da pessoa, não do carro: mora em `settings.budget`.
  const savedIncome = Number(settings?.budget?.monthlyIncome) || 0;
  const [income, setIncome] = useState(savedIncome);
  const [saving, setSaving] = useState(false);
  useHistoryDismiss(true, onClose);

  const states = useMemo(() => getStates(country), [country]);
  const modelConsumption = useMemo(() => consumptionFor(car), [car]);

  // `consumption` é o degrau do meio do motor (pessoa > INMETRO > padrão).
  const effectiveInputs = useMemo(
    () => ({
      ...inputs,
      consumption: Number(modelConsumption?.[inputs.fuelType]) || 0,
    }),
    [inputs, modelConsumption],
  );
  const result = useMemo(
    () => estimateOwnership(car, effectiveInputs, { country, state }),
    [car, effectiveInputs, country, state],
  );

  // Carro da garagem com gastos lançados: os km MEDIDOS valem mais que qualquer
  // faixa. O consumo medido só vale quando o carro simulado é o próprio — o
  // km/l de um Gol 1.6 não diz nada sobre um Pulse turbo, e a versão anterior
  // copiava um para o outro.
  const reference = useMemo(() => pickReferenceCar(cars, car.id), [cars, car.id]);
  const measured = reference?.insights;
  const sameCar = String(reference?.car?.id) === String(car.id);
  const measuredPatch = useMemo(() => {
    if (!measured) return null;
    const patch = {};
    if (measured.kmPerMonth) patch.kmPerMonth = Math.round(measured.kmPerMonth);
    if (sameCar && measured.consumption) {
      patch.userConsumption = Number(measured.consumption.kmPerLiter.toFixed(1));
    }
    return Object.keys(patch).length ? patch : null;
  }, [measured, sameCar]);
  const measuredApplied =
    measuredPatch &&
    Object.entries(measuredPatch).every(([key, value]) => Number(inputs[key]) === value);

  const set = (key, value) => setInputs((prev) => ({ ...prev, [key]: value }));

  const money = (value) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(value || 0);
  const decimal = (value, digits = 2) =>
    Number(value || 0)
      .toFixed(digits)
      .replace(".", i18n.language.startsWith("en") ? "." : ",");

  const handleSave = async () => {
    setSaving(true);
    if (income !== savedIncome) {
      engineDB
        .saveSettings({
          ...settings,
          budget: { ...(settings?.budget || {}), monthlyIncome: income, updatedAt: new Date().toISOString() },
        })
        .then((saved) => onSettingsUpdate?.(saved))
        .catch((error) => showToast(error?.message || t("ownership.budget.saveError"), "error"));
    }
    const saved = await onSave(car, { ...inputs, country, state });
    setSaving(false);
    if (saved) onClose();
  };

  // ------------------------------- a conta -------------------------------
  const isBR = result.country === "BR";
  const isFinance = inputs.purchaseMode === "finance";
  const financing = result.financing;
  const stateLabel = state ? getStateName(country, state) || state : "";
  const effectiveTaxRate = result.value > 0 ? (result.monthly.tax * 12) / result.value : 0;

  const taxSource = (() => {
    if (result.tax?.basis === "age_exempt") return t("ownership.results.taxAgeExempt", { age: result.tax.exemptAge });
    if (result.tax?.basis === "sp_hybrid") {
      return result.tax.rate === 0
        ? t("ownership.results.taxSpHybridExempt")
        : t("ownership.results.taxSpHybridReduced", { rate: decimal(result.tax.rate * 100, 0) });
    }
    if (!isBR) return t("ownership.lean.taxSourceCountry");
    return state
      ? t("ownership.lean.taxSource", { rate: decimal(effectiveTaxRate * 100, 1), state: stateLabel })
      : t("ownership.lean.taxSourceNoState");
  })();

  const modelKmPerLiter = modelConsumption?.[inputs.fuelType];
  const consumptionSource = inputs.userConsumption
    ? "User"
    : !modelKmPerLiter
      ? "Default"
      : modelConsumption.dated
        ? "InmetroDated"
        : modelConsumption.match === "model"
          ? "InmetroModel"
          : "Inmetro";
  const shownConsumption = Number(
    inputs.userConsumption || modelKmPerLiter || DEFAULT_CONSUMPTION[inputs.fuelType],
  ).toFixed(1);
  const kmShown = Number(inputs.kmPerMonth || 0).toLocaleString(i18n.language);

  // O que sai todo mês e o que é boleto anual, separados (ver o slab).
  const yearly = (result.monthly.tax + result.monthly.licensing) * 12;
  const monthlyOnly = result.totals.monthlyTotal - yearly / 12;
  // A fatia da renda usa o custo inteiro, com os boletos anuais diluídos.
  const total = result.totals.monthlyTotal;
  const sharePct = income > 0 ? Math.round((total / income) * 100) : null;

  const carName = formatCarName(car);
  const carYear = formatFipeYear(String(car.year || "").split(" ")[0], t("car.zeroKm"));

  return (
    <div className="engine-modal-overlay">
      <div className="engine-modal-panel engine-pop sm:max-w-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:pb-4 sm:pt-5">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--engine-text-muted)]">
              {t("ownership.kicker")}
            </p>
            <h2 className="mt-0.5 text-[15px] font-extrabold leading-tight tracking-tight text-[var(--engine-text)] sm:text-lg">
              {carName}
              <span className="mt-1 block whitespace-nowrap text-[12.5px] font-medium tracking-normal text-[var(--engine-text-muted)] sm:text-[13px]">
                {t("ownership.headerMeta", { year: carYear, value: money(result.value) })}
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] sm:h-10 sm:w-10"
          >
            <X size={20} />
          </button>
        </div>

        <div className="engine-modal-body engine-scroll grid content-start gap-5 px-4 py-5 sm:px-6 sm:py-6">
          {/* ============================ a resposta ============================ */}
          {/* Duas contas que NÃO se misturam, porque não se pagam do mesmo jeito.
              O que sai todo mês fica em cima; IPVA e licenciamento são boletos
              anuais e aparecem com o valor cheio e a forma de pagar. Dividir
              por 12 mostrava "R$ 15 de licenciamento por mês", uma cobrança
              que não existe — em SP a taxa nem pode ser parcelada. */}
          <div className="engine-slab px-5 py-6 sm:px-7 sm:py-7">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--engine-slab-fg-muted)]">
              {t("ownership.lean.kicker")}
            </p>
            <p className="mt-3 font-display text-[44px] font-extrabold leading-none tracking-tight tabular-nums text-[var(--engine-slab-fg)]">
              {money(monthlyOnly)}
              <span className="ml-1.5 text-[15px] font-semibold tracking-normal text-[var(--engine-slab-fg-muted)]">
                {t("ownership.lean.perMonth")}
              </span>
            </p>
            <p className="mt-3 text-[16px] font-semibold leading-snug text-[var(--engine-slab-fg)]">
              {t("ownership.lean.plusYearly", { value: money(yearly) })}
            </p>
            {sharePct !== null ? (
              <p className="mt-4 rounded-xl bg-[var(--engine-slab-raise)] px-3.5 py-3 text-[14px] leading-snug text-[var(--engine-slab-fg)]">
                {t("ownership.lean.share", { pct: sharePct, income: money(income) })}
              </p>
            ) : null}

            <GroupLabel>{t("ownership.lean.monthlyGroup")}</GroupLabel>
            <div className="mt-2 border-t border-[var(--engine-slab-line)]">
              {isFinance && financing ? (
                <Line
                  label={t("ownership.results.installment")}
                  source={`${t("ownership.detail.installmentBasis", {
                    months: financing.months,
                    principal: money(financing.principal),
                    rate: decimal(financing.monthlyRate * 100),
                  })}${inputs.monthlyRatePct > 0 ? "" : ` · ${t("ownership.lean.rateAverage")}`}`}
                  value={money(result.monthly.financing)}
                />
              ) : null}
              <Line
                label={t("ownership.results.fuel")}
                source={`${t("ownership.lean.fuelKm", { km: kmShown })} ${t(
                  `ownership.fields.consumption${consumptionSource}Hint`,
                  { value: shownConsumption, year: modelConsumption?.tableYear },
                )}`}
                value={money(result.monthly.fuel)}
              />
              <Line
                label={t("ownership.results.insurance")}
                source={inputs.insuranceMonthly > 0 ? t("ownership.lean.yourValue") : t("ownership.lean.insuranceMissing")}
                value={inputs.insuranceMonthly > 0 ? money(result.monthly.insurance) : t("ownership.lean.outside")}
                missing={!(inputs.insuranceMonthly > 0)}
              />
              <Line
                label={t("ownership.results.maintenance")}
                source={
                  inputs.maintenanceMonthly > 0 ? t("ownership.lean.yourValue") : t("ownership.lean.maintenanceMissing")
                }
                value={inputs.maintenanceMonthly > 0 ? money(result.monthly.maintenance) : t("ownership.lean.outside")}
                missing={!(inputs.maintenanceMonthly > 0)}
              />
              {/* Vindos da tela antiga: valores que a pessoa informou e que
                  continuam na conta — então continuam à vista. */}
              {result.monthly.parking > 0 ? (
                <Line
                  label={t("ownership.results.parking")}
                  source={t("ownership.lean.yourValue")}
                  value={money(result.monthly.parking)}
                />
              ) : null}
              {result.monthly.tolls > 0 ? (
                <Line
                  label={t("ownership.results.tolls")}
                  source={t("ownership.lean.yourValue")}
                  value={money(result.monthly.tolls)}
                />
              ) : null}
            </div>

            <GroupLabel>{t("ownership.lean.yearlyGroup")}</GroupLabel>
            <div className="mt-2 border-t border-[var(--engine-slab-line)]">
              <Line
                label={isBR ? t("ownership.lean.ipva") : t("ownership.lean.taxCountry")}
                source={[taxSource, isBR ? t(state === "SP" ? "ownership.lean.ipvaPaySP" : "ownership.lean.ipvaPay") : null]
                  .filter(Boolean)
                  .join(" · ")}
                value={`${money(result.monthly.tax * 12)}${t("ownership.lean.perYearShort")}`}
              />
              <Line
                label={t("ownership.results.licensing")}
                source={[
                  result.licensingVerified
                    ? t("ownership.lean.licensingSource", { state: stateLabel })
                    : isBR && state
                      ? t("ownership.lean.licensingApprox", { state: stateLabel })
                      : t("ownership.lean.licensingSourceGeneric"),
                  isBR ? t(state === "SP" ? "ownership.lean.licensingPaySP" : "ownership.lean.licensingPay") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                value={`${money(result.monthly.licensing * 12)}${t("ownership.lean.perYearShort")}`}
              />
            </div>
          </div>

          {/* ============================ o ajuste ============================ */}
          <Section title={t("ownership.adjust.qPurchase")}>
            <div className="grid grid-cols-2 gap-2">
              {["finance", "cash"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set("purchaseMode", mode)}
                  className={`${optionClass(inputs.purchaseMode === mode)} items-center text-center`}
                >
                  {t(`ownership.purchaseOptions.${mode}`)}
                </button>
              ))}
            </div>
            {isFinance ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("ownership.fields.downPayment")}
                  htmlFor="engine-own-down"
                  hint={t("ownership.fields.downPaymentHint")}
                >
                  <MoneyInput
                    id="engine-own-down"
                    value={inputs.downPaymentValue}
                    onChange={(value) => set("downPaymentValue", value)}
                    placeholder={money(Number(car.savedValue) || 0)}
                  />
                </Field>
                <Field
                  label={t("ownership.fields.monthlyRate")}
                  htmlFor="engine-own-rate"
                  hint={t("ownership.fields.monthlyRateHint", {
                    value: decimal((financing?.monthlyRate || 0) * 100),
                  })}
                >
                  <input
                    id="engine-own-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={inputs.monthlyRatePct > 0 ? inputs.monthlyRatePct : ""}
                    onChange={(event) => set("monthlyRatePct", Number(event.target.value) || 0)}
                    className={fieldClass}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <p className={`${labelClass} mb-1.5`}>{t("ownership.fields.months")}</p>
                  <div className="grid grid-cols-5 gap-2">
                    {FINANCE_MONTHS.map((months) => (
                      <button
                        key={months}
                        type="button"
                        onClick={() => set("financeMonths", months)}
                        className={`${optionClass(Number(inputs.financeMonths) === months)} items-center px-1 text-center tabular-nums`}
                      >
                        {months}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </Section>

          <Section title={t("ownership.adjust.qKm")} hint={t("ownership.adjust.qKmHint")}>
            {measuredPatch && !measuredApplied ? (
              <button
                type="button"
                onClick={() => setInputs((prev) => ({ ...prev, ...measuredPatch }))}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] px-3 text-left text-[13px] font-semibold text-[var(--engine-text)]"
              >
                <span className="min-w-0">
                  {t("ownership.lean.useMeasured", {
                    km: (measuredPatch.kmPerMonth || 0).toLocaleString(i18n.language),
                    car: formatCarName(reference.car),
                  })}
                </span>
                <span className="shrink-0 text-[12px] font-bold">{t("ownership.precision.apply")}</span>
              </button>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {KM_BANDS.map((band) => (
                <button
                  key={band.key}
                  type="button"
                  onClick={() => set("kmPerMonth", band.value)}
                  className={optionClass(Number(inputs.kmPerMonth) === band.value)}
                >
                  <span className="block">{t(`ownership.kmBands.${band.key}`)}</span>
                  <span className="block text-[11px] font-medium tabular-nums opacity-80">
                    ~{band.value.toLocaleString(i18n.language)} km
                  </span>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("ownership.fields.kmPerMonth")} htmlFor="engine-own-km">
                <input
                  id="engine-own-km"
                  type="number"
                  min="100"
                  step="100"
                  inputMode="numeric"
                  value={inputs.kmPerMonth || ""}
                  onChange={(event) => set("kmPerMonth", Number(event.target.value) || 0)}
                  className={fieldClass}
                />
              </Field>
              <Field label={t("ownership.fields.fuelType")} htmlFor="engine-own-fuel">
                <select
                  id="engine-own-fuel"
                  value={inputs.fuelType}
                  onChange={(event) => set("fuelType", event.target.value)}
                  className={fieldClass}
                >
                  {FUEL_TYPES.map((fuel) => (
                    <option key={fuel} value={fuel}>
                      {t(`ownership.fuel.${fuel}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("ownership.fields.consumption")} htmlFor="engine-own-consumption">
                <input
                  id="engine-own-consumption"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={inputs.userConsumption > 0 ? inputs.userConsumption : ""}
                  placeholder={t("ownership.fields.consumptionPlaceholder", { value: shownConsumption })}
                  onChange={(event) => set("userConsumption", Number(event.target.value) || 0)}
                  className={fieldClass}
                />
              </Field>
            </div>
          </Section>

          <Section title={t("ownership.lean.extrasTitle")} hint={t("ownership.lean.extrasHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("ownership.lean.insuranceField")} htmlFor="engine-own-insurance">
                <MoneyInput
                  id="engine-own-insurance"
                  value={inputs.insuranceMonthly}
                  onChange={(value) => set("insuranceMonthly", value)}
                />
              </Field>
              <Field label={t("ownership.lean.maintenanceField")} htmlFor="engine-own-maintenance">
                <MoneyInput
                  id="engine-own-maintenance"
                  value={inputs.maintenanceMonthly}
                  onChange={(value) => set("maintenanceMonthly", value)}
                />
              </Field>
            </div>
          </Section>

          <Section title={t("ownership.lean.lastTitle")} hint={t("ownership.lean.lastHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("ownership.fields.state")} htmlFor="engine-own-state">
                <select
                  id="engine-own-state"
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                  className={fieldClass}
                >
                  <option value="">—</option>
                  {states.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("ownership.fields.monthlyIncome")} htmlFor="engine-own-income">
                <MoneyInput id="engine-own-income" value={income} onChange={setIncome} />
              </Field>
            </div>
          </Section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--engine-border)] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
          <p className="min-w-0 text-[13px] leading-snug text-[var(--engine-text-muted)]">
            <span className="font-display text-[18px] font-bold tabular-nums text-[var(--engine-text)]">
              {money(monthlyOnly)}
            </span>{" "}
            {t("ownership.lean.perMonth")}
            <span className="block text-[12px]">{t("ownership.lean.plusYearly", { value: money(yearly) })}</span>
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-[15px] font-bold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span className="sm:hidden">{t("common.save")}</span>
            <span className="hidden sm:inline">{t("ownership.save")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
