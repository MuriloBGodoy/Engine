import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Check, Fuel, Gauge, Loader2, Receipt, Sparkles, Trash2, X } from "lucide-react";
import { engineDB } from "../services/db";
import { EXPENSE_CATEGORIES, FUEL_TYPES, expenseInsights } from "../services/expenses";
import { localISODate, validateExpense } from "../services/garageInput";
import { useConfirm } from "./ConfirmProvider";
import { trackEvent } from "../services/observability";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { formatCarName } from "../services/carDisplay";

// Fuso do aparelho. Era `toISOString()` (UTC): no Brasil, depois das 21h o
// gasto nascia com a data de amanha.
const today = () => localISODate();

/** Categorias em que faz sentido oferecer um prestador logo depois do lançamento. */
const SERVICE_CATEGORIES = ["cleaning", "maintenance", "tires"];

const emptyForm = () => ({
  category: "fuel",
  amount: "",
  date: today(),
  odometer: "",
  liters: "",
  note: "",
  // Combustivel e tanque cheio: sem eles o km/l nao e medicao. Ficam entre um
  // lancamento e outro (como a categoria), porque quem abastece costuma
  // repetir o mesmo.
  fuel: "",
  fullTank: false,
});

/**
 * Registro de gasto do carro que a pessoa já tem.
 *
 * O simulador de posse responde "quanto custaria"; isto responde "quanto está
 * custando". Por isso mora no carro `owned` e não na meta: só faz sentido
 * lançar abastecimento de um carro que existe na garagem.
 *
 * O resumo vem antes do formulário de propósito. Quem abre pela segunda vez
 * quer ver o número, não digitar — e ver o número é o que faz voltar.
 */
export function ExpensesModal({ car, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastCategory, setLastCategory] = useState("");
  const confirm = useConfirm();

  const insights = useMemo(() => expenseInsights(car || {}), [car]);

  // Voltar no Android fecha o modal em vez de sair da garagem.
  const close = useCallback(() => onClose?.(), [onClose]);
  useHistoryDismiss(Boolean(car), close);

  if (!car) return null;

  const money = (value, digits = 0) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: digits,
    }).format(value || 0);

  // Valor de um lancamento: centavos so quando existem ("R$ 230,50", nunca
  // "R$ 231").
  const exact = (value) => money(value, Number(value) % 1 ? 2 : 0);

  const decimal = (value, digits = 1) =>
    new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value || 0);

  const setField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const km = (value) => `${new Intl.NumberFormat(i18n.language).format(value || 0)} km`;

  // Parametros das mensagens de plausibilidade, cada um na sua unidade.
  const inputParams = (key, params = {}) => {
    if (key.includes("odometer")) {
      return { value: km(params.value), previous: km(params.previous), max: km(params.max) };
    }
    if (key.includes("liters")) {
      return {
        value: decimal(params.value),
        max: new Intl.NumberFormat(i18n.language).format(params.max || 0),
      };
    }
    if (key.includes("pricePerLiter")) return { value: money(params.value, 2) };
    return { value: exact(params.value), max: money(params.max) };
  };

  const submit = async (event) => {
    event.preventDefault();
    // Virgula ou ponto: "38.5" e "38,5" sao 38,5 L. O parse antigo tirava todo
    // ponto e gravava 385 L.
    const previousOdometer = insights.expenses.reduce(
      (max, entry) => Math.max(max, entry.odometer || 0),
      0,
    );
    const check = validateExpense(form, { previousOdometer });
    if (check.error) {
      setError(t(check.error, inputParams(check.error, check.errorParams)));
      return;
    }
    if (check.warnings.length) {
      const ok = await confirm({
        title: t("garageInput.confirmTitle"),
        message: check.warnings
          .map((warning) => t(warning.key, inputParams(warning.key, warning.params)))
          .join(" "),
        confirmLabel: t("garageInput.confirmSave"),
        cancelLabel: t("garageInput.reviewValue"),
        tone: "neutral",
      });
      if (!ok) return;
    }

    setSaving(true);
    setError("");
    try {
      const updated = await engineDB.addCarExpense(car.id, {
        category: form.category,
        amount: check.value.amount,
        date: form.date,
        odometer: check.value.odometer,
        liters: check.value.liters,
        note: form.note,
        ...(form.category === "fuel"
          ? { fuel: form.fuel || null, fullTank: Boolean(form.fullTank) }
          : {}),
      });
      trackEvent("gasto_registrado", { categoria: form.category, carId: car.id });
      setLastCategory(form.category);
      onSaved?.(updated);
      setForm((current) => ({
        ...emptyForm(),
        category: current.category,
        fuel: current.fuel,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Apagar pede confirmacao (a lixeira fica colada ao valor), e a recusa do
  // servidor aparece em vez de virar rejeicao nao tratada.
  const remove = async (entry) => {
    const ok = await confirm({
      title: t("garageInput.deleteExpenseTitle"),
      message: t("garageInput.deleteExpenseBody", {
        value: exact(entry.amount),
        date: new Date(`${entry.date}T12:00:00`).toLocaleDateString(i18n.language),
      }),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;

    setSaving(true);
    setError("");
    try {
      const updated = await engineDB.removeCarExpense(car.id, entry.id);
      if (updated) onSaved?.(updated);
    } catch (err) {
      setError(err?.message || t("garageInput.deleteError"));
    } finally {
      setSaving(false);
    }
  };

  // Consumo: so e "medido" com tanque cheio nas pontas e um combustivel so.
  // O resto e aproximado e diz isso na propria tela -- nunca "real".
  const consumption = insights.consumption;
  const consumptionLabel = !consumption
    ? t("garageFixes.consumption.label")
    : consumption.approximate
      ? t("garageFixes.consumption.approximate")
      : t("garageFixes.consumption.measured");
  const consumptionHint = !consumption
    ? t("garageFixes.consumption.needFullFills")
    : consumption.approximate
      ? t("garageFixes.consumption.approximateHint")
      : t("garageFixes.consumption.fuelHint", {
          fuel: t(`garageFixes.fuel.${consumption.fuel}`).toLowerCase(),
        });

  const isFuel = form.category === "fuel";
  const showServiceHint = SERVICE_CATEGORIES.includes(lastCategory);

  return (
    <div className="engine-modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("expenses.title")}
        className="engine-modal-panel engine-pop sm:max-w-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--engine-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
              <Receipt size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black text-[var(--engine-text)]">
                {t("expenses.title")}
              </h2>
              <p className="truncate text-xs text-[var(--engine-text-muted)]">
                {formatCarName(car)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            /* 44x44 (Material pede 48, HIG 44): media 36x36. A margem
               negativa mantém o X no mesmo lugar visual. */
            className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={18} />
          </button>
        </header>

        {/* O corpo ocupa o que sobra do painel. Era `max-h-[72vh]`: no celular
            o painel tem 100dvh, então o rolável parava a 72% e deixava ~200px
            vazios embaixo (medido em 13/09/2026, 360x740), com o formulário
            escondido dentro da faixa rolável. */}
        <div className="engine-modal-body engine-scroll engine-safe-bottom space-y-5 px-5 py-5">
          {/* Resumo: só aparece o que os dados sustentam. Média mensal exige 30
              dias de histórico; consumo real exige dois abastecimentos com
              odômetro. Antes disso, mostrar o campo vazio seria pior que não
              mostrar. */}
          {insights.expenses.length > 0 && (
            <div className="grid gap-2 min-[420px]:grid-cols-3">
              <SummaryTile
                label={
                  insights.monthlyAverage
                    ? t("expenses.monthlyAverage")
                    : t("expenses.totalSpent")
                }
                value={money(insights.monthlyAverage ?? insights.total)}
                hint={
                  insights.monthlyAverage
                    ? null
                    : t("expenses.needMoreHistory")
                }
              />
              <SummaryTile
                icon={Fuel}
                label={consumptionLabel}
                value={
                  consumption
                    ? `${consumption.approximate ? "~" : ""}${t("expenses.kmPerLiter", {
                        value: decimal(consumption.kmPerLiter),
                      })}`
                    : "—"
                }
                hint={consumptionHint}
              />
              <SummaryTile
                icon={Gauge}
                label={t("expenses.costPerKm")}
                value={insights.costPerKm ? money(insights.costPerKm, 2) : "—"}
                hint={insights.costPerKm ? null : t("expenses.needOdometer")}
              />
            </div>
          )}

          {insights.byCategory.length > 1 && (
            <div className="space-y-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
                {t("expenses.whereItGoes")}
              </p>
              {insights.byCategory.slice(0, 4).map((row) => (
                <div key={row.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--engine-text)]">
                      {t(`expenses.category.${row.category}`)}
                    </span>
                    <span className="tabular-nums text-[var(--engine-text-muted)]">
                      {money(row.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--engine-surface)]">
                    <div
                      className="h-full rounded-full bg-[var(--engine-accent)]"
                      style={{ width: `${Math.round(row.share * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, category }))}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                    form.category === category
                      ? "bg-[var(--engine-accent)] text-white"
                      : "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                  }`}
                >
                  {t(`expenses.category.${category}`)}
                </button>
              ))}
            </div>

            <div className="grid gap-3 min-[420px]:grid-cols-2">
              <Field label={t("expenses.amount")}>
                <input
                  value={form.amount}
                  onChange={setField("amount")}
                  inputMode="decimal"
                  placeholder="250"
                  className={inputClass}
                />
              </Field>
              <Field label={t("expenses.date")}>
                <input
                  type="date"
                  value={form.date}
                  max={today()}
                  onChange={setField("date")}
                  className={inputClass}
                />
              </Field>
              <Field
                label={t("expenses.odometer")}
                hint={t("expenses.odometerHint")}
              >
                <input
                  value={form.odometer}
                  onChange={setField("odometer")}
                  inputMode="numeric"
                  placeholder="87500"
                  className={inputClass}
                />
              </Field>
              {isFuel && (
                <Field label={t("expenses.liters")}>
                  <input
                    value={form.liters}
                    onChange={setField("liters")}
                    inputMode="decimal"
                    placeholder="38,5"
                    className={inputClass}
                  />
                </Field>
              )}
            </div>

            {isFuel && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]">
                  {t("garageFixes.fuel.label")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {FUEL_TYPES.map((fuel) => {
                    const active = form.fuel === fuel;
                    return (
                      <button
                        key={fuel}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setForm((current) => ({ ...current, fuel: active ? "" : fuel }))
                        }
                        className={`min-h-11 rounded-full px-4 text-[11px] font-bold uppercase tracking-wide transition ${
                          active
                            ? "bg-[var(--engine-accent)] text-white"
                            : "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                        }`}
                      >
                        {t(`garageFixes.fuel.${fuel}`)}
                      </button>
                    );
                  })}
                </div>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[var(--engine-border)] px-3.5 py-2">
                  <input
                    type="checkbox"
                    checked={form.fullTank}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, fullTank: event.target.checked }))
                    }
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--engine-ring)] ${
                      form.fullTank
                        ? "border-[var(--engine-accent)] bg-[var(--engine-accent)] text-white"
                        : "border-[var(--engine-border-strong)]"
                    }`}
                  >
                    {form.fullTank && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-[var(--engine-text)]">
                      {t("garageFixes.fuel.fullTank")}
                    </span>
                    <span className="block text-[10px] leading-tight text-[var(--engine-text-subtle)]">
                      {t("garageFixes.fuel.fullTankHint")}
                    </span>
                  </span>
                </label>
              </div>
            )}

            <Field label={t("expenses.note")}>
              <input
                value={form.note}
                onChange={setField("note")}
                placeholder={t("expenses.notePlaceholder")}
                className={inputClass}
              />
            </Field>

            {error && (
              <p className="text-xs font-semibold text-[var(--engine-accent)]">{error}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-xs font-black uppercase tracking-widest text-white transition hover:brightness-95 disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {t("expenses.save")}
            </button>
          </form>

          {/* Quem acabou de lançar uma lavagem ou uma revisão é exatamente quem
              procura prestador. É o encontro entre a frequência de uso e a
              receita — e por isso o convite aparece aqui, e não numa aba. */}
          {showServiceHint && (
            <Link
              to="/services"
              onClick={onClose}
              className="flex items-center gap-2 rounded-xl border border-[var(--engine-accent)]/30 bg-[var(--engine-accent-soft)] px-3.5 py-2.5 text-xs font-bold text-[var(--engine-accent)] transition hover:border-[var(--engine-accent)]"
            >
              <Sparkles size={14} className="shrink-0" />
              {t("expenses.serviceHint")}
            </Link>
          )}

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
              {t("expenses.historyTitle")}
            </p>

            {insights.expenses.length ? (
              <ul className="space-y-1.5">
                {insights.expenses.slice(0, 30).map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--engine-border)] px-3.5 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-[var(--engine-text)]">
                        {t(`expenses.category.${entry.category}`)}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </span>
                      <span className="block text-[11px] text-[var(--engine-text-muted)]">
                        {new Date(`${entry.date}T12:00:00`).toLocaleDateString(i18n.language)}
                        {entry.odometer
                          ? ` · ${new Intl.NumberFormat(i18n.language).format(entry.odometer)} km`
                          : ""}
                        {entry.liters ? ` · ${decimal(entry.liters)} L` : ""}
                        {entry.fuel ? ` · ${t(`garageFixes.fuel.${entry.fuel}`)}` : ""}
                        {entry.fullTank === false ? ` · ${t("garageFixes.fuel.partial")}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-black tabular-nums text-[var(--engine-text)]">
                        {exact(entry.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(entry)}
                        disabled={saving}
                        aria-label={t("common.delete")}
                        /* O alvo era o ícone nu, 15x15; 44x44 com margem
                           negativa para a linha não crescer. */
                        className="-m-3 flex h-11 w-11 items-center justify-center rounded-lg text-[var(--engine-text-subtle)] transition hover:text-[var(--engine-accent)] disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--engine-text-muted)]">
                {t("expenses.historyEmpty")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-2.5 text-sm text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]";

function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]">
        {label}
        {hint && (
          <span className="ml-1 font-medium normal-case tracking-normal text-[var(--engine-text-subtle)]">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function SummaryTile({ icon, label, value, hint }) {
  const Icon = icon;
  return (
    <div className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
        {Icon && <Icon size={12} className="text-[var(--engine-accent)]" />}
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-extrabold tabular-nums text-[var(--engine-text)]">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[10px] leading-tight text-[var(--engine-text-subtle)]">
          {hint}
        </p>
      )}
    </div>
  );
}
