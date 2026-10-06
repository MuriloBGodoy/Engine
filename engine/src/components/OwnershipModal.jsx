import { useMemo, useRef, useState } from "react";
import { X, Save, Loader2, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InfoTip } from "./InfoTip";
import {
  affordabilityLevers,
  estimateOwnership,
  estimateOwnershipRange,
  assessAffordability,
  normalizeOwnershipInputs,
  defaultOwnershipInputs,
  DEFAULT_CONSUMPTION,
  FUEL_TYPES,
  AGE_BANDS,
  COVERAGE_TYPES,
  USAGE_TYPES,
  LIFE_SITUATIONS,
  LIFE_SITUATION_TYPES,
} from "../services/ownership";
import { pickReferenceCar } from "../services/expenses";
import { engineDB } from "../services/db";
import {
  countries,
  getStates,
  getStateName,
  getCountryName,
  DEFAULT_COUNTRY,
} from "../services/locations";
import { consumptionFor } from "../services/consumption";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { formatCarName, formatFipeYear } from "../services/carDisplay";
import { useToast } from "./ToastProvider";

/*
 * Redesenho de 16/09/2026 (sessão `ui designs/2026-09-13-simulador`).
 *
 * O Murilo aprovou o veredito "cabe?" e reprovou o resto por confuso. A tela
 * foi reorganizada em quatro camadas, na ordem em que uma pessoa pergunta:
 *
 *   1. Cabe?            — o slab, enxuto: veredito, uma frase e a conta em
 *                          ledger (renda − contas − carro = sobra).
 *   2. Baseado em quê?  — chips com as premissas da conta; tracejado = a
 *                          gente estimou. Tocar abre o ajuste daquela premissa.
 *   3. O que faria caber? — as alavancas.
 *   4. Detalhes         — sanfonas fechadas; as linhas sem fonte têm etiqueta.
 *
 * No celular o modal tem ABAS (Resultado / Ajustar / Avançado): antes o formulário
 * começava a ~2.000px de rolagem e a pessoa recebia "não cabe" calculado em
 * premissas que nunca tinha visto. No desktop as abas somem e viram as duas
 * colunas de sempre. O antigo modo Avançado é a TERCEIRA aba (19/09/2026):
 * como sanfona no fim do Ajustar, exigia rolar tudo para chegar nele.
 */

// `min-h-11` são os 44px de alvo de toque. Abaixo de 640px e em tela de toque
// o index.css força 16px nos inputs (evita o zoom do iOS), então o `text-sm`
// só vale no desktop.
const fieldClass =
  "w-full min-h-11 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-2.5 text-sm text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)] disabled:opacity-40";

/** Alvos de chip que moram na aba Avançado (o resto fica no Ajustar). */
const ADVANCED_TARGETS = new Set([
  "engine-own-advanced",
  "engine-own-driver",
  "engine-own-location",
]);

/**
 * Campos cuja ausência alarga a faixa. Tudo que a pessoa não tocou é
 * suposição do modelo, e é isso que a faixa mede.
 */
const UNCERTAIN_FIELDS = [
  "driverAgeBand",
  "hasGarage",
  "usage",
  "monthlyRatePct",
  "userConsumption",
  "kmPerMonth",
];

/**
 * Faixas de rodagem. O 1.000 entrou em 16/09/2026 porque é o padrão do motor
 * (`defaultOwnershipInputs`), e sem ele a primeira visita não tinha nenhum
 * chip marcado — a pessoa não sabia qual km estava valendo.
 */
const KM_BANDS = [
  { key: "little", value: 600 },
  { key: "some", value: 1000 },
  { key: "normal", value: 1200 },
  { key: "much", value: 2500 },
  { key: "work", value: 4000 },
];

const FINANCE_MONTHS = [24, 36, 48, 60, 72];

const labelClass =
  "ml-0.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]";
const questionClass = "text-[13.5px] font-bold text-[var(--engine-text)]";
const optionClass = (active) =>
  `flex min-h-11 flex-col justify-center rounded-xl border px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
    active
      ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-text)]"
      : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:border-[var(--engine-border-strong)]"
  }`;

function Field({ label, children, hint, id }) {
  return (
    <div id={id} className="scroll-mt-4 space-y-1.5">
      <label className={labelClass}>{label}</label>
      {children}
      {hint ? (
        <p className="ml-0.5 text-[11px] leading-relaxed text-[var(--engine-text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Uma linha do ledger do slab: rótulo (com procedência opcional) e valor. */
function LedgerRow({ label, hint, value, sum = false, danger = false }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2 ${
        sum ? "pt-2.5" : "border-b border-[var(--engine-slab-line)]"
      }`}
    >
      <span
        className={`min-w-0 flex-1 text-[13px] ${
          sum ? "font-bold text-[var(--engine-slab-fg)]" : "text-[var(--engine-slab-fg-muted)]"
        }`}
      >
        {label}
        {hint ? <small className="block text-[11px] leading-snug opacity-85">{hint}</small> : null}
      </span>
      <span
        className={`shrink-0 font-display font-bold tabular-nums ${
          sum ? "text-lg" : "text-[13.5px]"
        } ${danger ? "text-[var(--engine-slab-accent)]" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

/** Premissa da conta. Tracejado = valor que ninguém informou; o modelo supôs. */
function Chip({ label, estimated = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border bg-[var(--engine-surface)] px-3 text-[13px] font-semibold transition-colors hover:border-[var(--engine-text)] ${
        estimated
          ? "border-dashed border-[var(--engine-border-strong)] text-[var(--engine-text)]"
          : "border-[var(--engine-border-strong)] text-[var(--engine-text)]"
      }`}
    >
      {label}
      <ChevronDown size={13} className="-rotate-90 opacity-60" />
    </button>
  );
}

/** A faixa de incerteza inteira, com o cenário central marcado nela. */
function RangeBar({ low, high, center, lowLabel, highLabel }) {
  const span = high - low;
  const dot = span > 0 ? Math.min(Math.max((center - low) / span, 0), 1) * 100 : 50;
  return (
    <div className="mt-4">
      <div className="relative h-3 rounded-full bg-[var(--engine-slab-line)]">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[var(--engine-slab-line)] to-[var(--engine-slab-fg)] opacity-70" />
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--engine-slab-fg)] shadow-[0_0_0_4px_var(--engine-slab-cell)]"
          style={{ left: `${dot}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[12px] text-[var(--engine-slab-fg-muted)]">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

/**
 * Renda e contas. Vive em dois lugares com a mesma lógica: dentro do slab na
 * primeira visita (tom "slab") e no bloco "Seu orçamento" da aba Ajustar (tom
 * "surface"). Guarda rascunho próprio de propósito: escrevendo direto no
 * `budget`, o veredito apareceria no meio da digitação. Só o botão publica —
 * e publica uma vez, porque a cota do Firestore é contada em escritas.
 */
function Invite({
  t,
  income,
  expenses,
  onSubmit,
  onSkip,
  tone = "slab",
  title,
  body,
  cta,
}) {
  const [draftIncome, setDraftIncome] = useState(income ? String(income) : "");
  const [draftExpenses, setDraftExpenses] = useState(expenses ? String(expenses) : "");
  const ready = Number(draftIncome) > 0 && Number(draftExpenses) > 0;
  const slab = tone === "slab";

  const inputClass = slab
    ? "h-12 w-full rounded-xl border border-[var(--engine-slab-line)] bg-[var(--engine-slab-cell)] px-3 text-base font-semibold text-[var(--engine-slab-fg)] outline-none placeholder:font-normal placeholder:text-[var(--engine-slab-fg-muted)] focus-visible:border-[var(--engine-slab-fg)]"
    : "h-12 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-base font-semibold text-[var(--engine-text)] outline-none placeholder:font-normal placeholder:text-[var(--engine-text-muted)] focus:border-[var(--engine-accent)]";
  const labelSlab = `mb-1.5 block text-[10.5px] font-extrabold uppercase tracking-wider ${
    slab ? "text-[var(--engine-slab-fg-muted)]" : "text-[var(--engine-text-muted)]"
  }`;

  return (
    <form
      className={
        slab
          ? "mt-5 rounded-2xl border border-[var(--engine-slab-line)] bg-[var(--engine-slab-raise)] p-4"
          : ""
      }
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSubmit({
          monthlyIncome: Number(draftIncome) || 0,
          monthlyExpenses: Number(draftExpenses) || 0,
        });
      }}
    >
      <h4
        className={`text-[15px] font-bold ${
          slab ? "text-[17px] text-[var(--engine-slab-fg)]" : "text-[var(--engine-text)]"
        }`}
      >
        {title || t("ownership.invite.title")}
      </h4>
      {body || slab ? (
        <p
          className={`mt-1 max-w-[54ch] text-[12.5px] leading-relaxed ${
            slab ? "text-[13px] text-[var(--engine-slab-fg-muted)]" : "text-[var(--engine-text-muted)]"
          }`}
        >
          {body || t("ownership.invite.body")}
        </p>
      ) : null}
      <div
        className={`mt-3.5 grid grid-cols-1 items-end gap-2.5 @[360px]:grid-cols-2 ${
          slab ? "@[560px]:grid-cols-[1fr_1fr_auto]" : ""
        }`}
      >
        <div>
          <label className={labelSlab} htmlFor={`engine-invite-income-${tone}`}>
            {t("ownership.invite.income")}
          </label>
          <input
            id={`engine-invite-income-${tone}`}
            type="number"
            min="0"
            step="100"
            inputMode="numeric"
            value={draftIncome}
            onChange={(event) => setDraftIncome(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelSlab} htmlFor={`engine-invite-expenses-${tone}`}>
            {t("ownership.invite.expenses")}
          </label>
          <input
            id={`engine-invite-expenses-${tone}`}
            type="number"
            min="0"
            step="100"
            inputMode="numeric"
            value={draftExpenses}
            onChange={(event) => setDraftExpenses(event.target.value)}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={!ready}
          className={`h-12 rounded-xl px-5 text-[15px] font-bold transition disabled:opacity-45 @[360px]:col-span-2 ${
            slab ? "@[560px]:col-span-1" : ""
          } ${
            slab
              ? "bg-[var(--engine-slab-fg)] text-[var(--engine-slab-ink)]"
              : "bg-[var(--engine-accent)] text-white hover:brightness-95"
          }`}
        >
          {cta || t("ownership.invite.cta")}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="min-h-11 text-[12.5px] font-semibold text-[var(--engine-slab-fg)] underline underline-offset-4"
          >
            {t("ownership.invite.skip")}
          </button>
        ) : null}
        <p
          className={`text-[12px] leading-snug ${
            slab ? "text-[var(--engine-slab-fg-muted)]" : "text-[var(--engine-text-muted)]"
          }`}
        >
          {t("ownership.invite.privacy")}
        </p>
      </div>
    </form>
  );
}

/**
 * Alavanca: uma mudança e o que ela tira da conta do mês. O botão APLICA o
 * patch de verdade. `tradeoff` marca o prazo maior, que alivia o mês e
 * encarece o total — vender isso com o mesmo peso seria mentir por omissão.
 */
function Lever({ label, note, delta, tradeoff, tradeoffTag, onApply }) {
  return (
    <button
      type="button"
      onClick={onApply}
      className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] px-3.5 py-3 text-left transition-colors hover:border-[var(--engine-border-strong)]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-snug text-[var(--engine-text)]">
          {label}
        </span>
        {note ? (
          <span className="mt-0.5 block text-[12px] leading-snug text-[var(--engine-text-muted)]">
            {note}
          </span>
        ) : null}
        {tradeoff ? (
          <span className="mt-1.5 inline-block rounded-md border border-[var(--engine-border-strong)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--engine-text-muted)]">
            {tradeoffTag}
          </span>
        ) : null}
      </span>
      <span
        className={`shrink-0 rounded-lg px-3 py-2 font-display text-[14.5px] font-bold tabular-nums ${
          tradeoff
            ? "border border-[var(--engine-border-strong)] text-[var(--engine-text)]"
            : "bg-[var(--engine-text)] text-[var(--engine-bg)]"
        }`}
      >
        {delta}
      </span>
    </button>
  );
}

/** Etiqueta de procedência: "estimativa", "média geral". */
function Tag({ children }) {
  return (
    <span className="inline-block rounded-md border border-dashed border-[var(--engine-border-strong)] px-1.5 py-px text-[10px] font-bold normal-case tracking-normal text-[var(--engine-text-muted)]">
      {children}
    </span>
  );
}

/**
 * Linha do detalhe: rótulo, valor e barra proporcional à MAIOR linha (ninguém
 * soma barras de cabeça, e assim nada some por ser pequeno). Nas estimativas
 * a barra é tracejada — o número existe, a certeza não.
 */
function DetailRow({ label, tag, value, ratio, note, estimate = false }) {
  return (
    <div className="border-t border-[var(--engine-border)] py-2.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-[var(--engine-text)]">
          {label}
          {tag ? <Tag>{tag}</Tag> : null}
        </span>
        <span className="shrink-0 font-display text-[14.5px] font-bold tabular-nums text-[var(--engine-text)]">
          {value}
        </span>
      </div>
      {note ? (
        <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--engine-text-muted)]">{note}</p>
      ) : null}
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface-2)]">
        <span
          className={`block h-full ${
            estimate
              ? "bg-[repeating-linear-gradient(90deg,var(--engine-text-muted)_0_6px,transparent_6px_10px)]"
              : "bg-[var(--engine-text)]"
          }`}
          style={{ width: `${Math.min(Math.max(ratio * 100, 1.5), 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Bloco comum. */
function Bloco({ title, sub, children, className = "", id }) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4 ${className}`}
    >
      {title ? (
        <h4 className="text-[14px] font-bold text-[var(--engine-text)]">{title}</h4>
      ) : null}
      {sub ? (
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--engine-text-muted)]">
          {sub}
        </p>
      ) : null}
      <div className={title || sub ? "mt-3" : ""}>{children}</div>
    </div>
  );
}

/** Sanfona: o detalhe é consulta, e consulta começa fechada. */
function Accordion({ title, aux, children, open = false }) {
  return (
    <details
      open={open}
      className="group rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-4"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3">
        <h4 className="flex-1 text-[14px] font-bold text-[var(--engine-text)]">{title}</h4>
        {aux ? (
          <span className="text-[12.5px] text-[var(--engine-text-muted)]">{aux}</span>
        ) : null}
        <ChevronDown
          size={15}
          className="shrink-0 text-[var(--engine-text-muted)] transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pb-4 pt-1">{children}</div>
    </details>
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

function OwnershipDialog({ car, cars, settings, onClose, onSave, onSettingsUpdate }) {
  const showToast = useToast();
  const { i18n, t } = useTranslation();
  const [inputs, setInputs] = useState(() =>
    car.ownership
      ? normalizeOwnershipInputs(car.ownership)
      : defaultOwnershipInputs(),
  );
  const [country, setCountry] = useState(
    () => car.ownership?.country || settings?.profile?.country || DEFAULT_COUNTRY,
  );
  const [state, setState] = useState(
    () => car.ownership?.state || settings?.profile?.state || "",
  );
  const [saving, setSaving] = useState(false);
  // O convite pode ser dispensado ("prefiro não informar agora") e reaberto.
  const [inviteDismissed, setInviteDismissed] = useState(false);
  // Aba ativa no celular. No desktop as duas colunas estão à vista e o valor
  // só decide para onde o `goTo` rola.
  const [tab, setTab] = useState("result");
  const answerRef = useRef(null);
  const bodyRef = useRef(null);
  // Campos que a pessoa informou de verdade. Tudo que não está aqui é
  // suposição do modelo, e é o que alarga a faixa do resultado.
  const [touched, setTouched] = useState(
    () => new Set(car.ownership?.touched || []),
  );
  // O gesto de voltar (Android, e o deslizar da borda no iOS) fecha o modal
  // em vez de sair da Garagem. O diálogo só existe montado, então `open` é
  // sempre verdadeiro aqui; o desmontar desfaz a entrada de histórico.
  useHistoryDismiss(true, onClose);

  const states = useMemo(() => getStates(country), [country]);

  // Consumo do PBE Veicular (INMETRO) para esta versão — síncrono, então é
  // valor derivado e não estado. Passa o carro inteiro porque marca, motor e
  // ano fazem parte da chave.
  const modelConsumption = useMemo(() => consumptionFor(car), [car]);

  // Renda e despesa são da pessoa e vivem em `settings`; a migração aceita o
  // valor antigo que ficou preso em `car.ownership.monthlyIncome`.
  const [budget, setBudget] = useState(() => ({
    ...(settings?.budget || {}),
    monthlyIncome:
      settings?.budget?.monthlyIncome || Number(car.ownership?.monthlyIncome) || 0,
  }));

  // Grava uma vez, no botão — a cota do plano gratuito é contada em escritas.
  const commitBudget = (patch) => {
    const next = { ...budget, ...patch };
    setBudget(next);
    engineDB
      .saveSettings({ ...settings, budget: { ...next, updatedAt: new Date().toISOString() } })
      .then((saved) => onSettingsUpdate?.(saved))
      // O cálculo segue com a renda digitada (está no estado); o que falhou
      // foi guardar para as próximas simulações, e a pessoa precisa saber.
      .catch((error) => showToast(error?.message || t("ownership.budget.saveError"), "error"));
  };

  // A renda mora em `settings.budget`, mas o motor continua recebendo pelos
  // inputs. `consumption` é o degrau do meio da hierarquia do motor (usuário >
  // modelo > padrão do combustível) e recebe o número do INMETRO.
  const effectiveInputs = useMemo(
    () => ({
      ...inputs,
      monthlyIncome: Number(budget.monthlyIncome) || 0,
      consumption:
        Number(inputs.consumption) > 0
          ? Number(inputs.consumption)
          : Number(modelConsumption?.[inputs.fuelType]) || 0,
    }),
    [inputs, budget.monthlyIncome, modelConsumption],
  );

  const result = useMemo(
    () => estimateOwnership(car, effectiveInputs, { country, state }),
    [car, effectiveInputs, country, state],
  );

  // Tudo que não foi tocado é suposição — e é isso que a faixa mede. Antes o
  // modo Avançado zerava esta lista ("viu todos os campos, aceitou"); com
  // "Mais ajustes" fechado por padrão isso não se sustenta mais, então a
  // faixa só estreita com o que a pessoa de fato informou.
  const unknownFields = useMemo(
    () => UNCERTAIN_FIELDS.filter((field) => !touched.has(field)),
    [touched],
  );

  const range = useMemo(
    () => estimateOwnershipRange(car, effectiveInputs, { country, state }, unknownFields),
    [car, effectiveInputs, country, state, unknownFields],
  );

  // O número que vai para a conta de renda é o TETO. Subestimar coloca alguém
  // num contrato que não paga; superestimar custa um carro que caberia.
  const headlineCost = range.high;

  // A mesma conta com a outra forma de compra — financiar costuma mais que
  // dobrar a renda necessária, e isso não pode depender de simular duas vezes.
  const altPurchase = inputs.purchaseMode === "finance" ? "cash" : "finance";
  const altRange = useMemo(
    () =>
      estimateOwnershipRange(
        car,
        { ...effectiveInputs, purchaseMode: altPurchase },
        { country, state },
        unknownFields,
      ),
    [car, effectiveInputs, altPurchase, country, state, unknownFields],
  );

  const sharePct = inputs.incomeSharePct || 20;
  const requiredIncome = headlineCost / (sharePct / 100);
  const altRequiredIncome = altRange.high / (sharePct / 100);

  // Carro da garagem com gasto lançado: serve de régua real contra a projeção.
  const reference = useMemo(() => pickReferenceCar(cars, car.id), [cars, car.id]);
  const measured = reference?.insights;
  const canApplyMeasured =
    measured &&
    ((measured.kmPerMonth && Math.round(measured.kmPerMonth) !== Math.round(inputs.kmPerMonth)) ||
      (measured.consumption &&
        measured.consumption.kmPerLiter.toFixed(1) !==
          Number(inputs.userConsumption || 0).toFixed(1)));

  const measuredPatch = useMemo(() => {
    if (!measured) return null;
    const patch = {};
    if (measured.kmPerMonth) patch.kmPerMonth = Math.round(measured.kmPerMonth);
    if (measured.consumption) {
      patch.userConsumption = Number(measured.consumption.kmPerLiter.toFixed(1));
    }
    return Object.keys(patch).length ? patch : null;
  }, [measured]);

  const applyMeasured = () => {
    if (!measuredPatch) return;
    setInputs((prev) => ({ ...prev, ...measuredPatch }));
    setTouched((prev) => {
      const next = new Set(prev);
      Object.keys(measuredPatch).forEach((field) => next.add(field));
      return next;
    });
  };

  const money = (value) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(value || 0);

  const set = (key, value) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  const handleSave = async () => {
    setSaving(true);
    const saved = await onSave(car, {
      ...inputs,
      country,
      state,
      touched: [...touched],
    });
    setSaving(false);
    if (saved) onClose();
  };

  // ------------------------------- a resposta -------------------------------
  const income = Number(budget.monthlyIncome) || 0;
  const declaredExpenses = Number(budget.monthlyExpenses) || 0;
  const currentCarCost = reference?.insights?.monthlyAverage || 0;
  const replacingCurrentCar =
    Boolean(reference) && budget?.replacedCarId === String(reference.car.id);

  const verdict = assessAffordability({
    monthlyCost: headlineCost,
    monthlyIncome: income,
    monthlyExpenses: declaredExpenses,
    currentCarCost,
    replacingCurrentCar,
    lifeSituation: inputs.lifeSituation,
  });

  // O veredito pode ser "aperta" com dinheiro sobrando: a folga aprova, e o
  // teto de fatia da renda tira o "com folga". Sem dizer o porquê, a pessoa
  // lê "aperta" com R$ 4.438 no bolso e conclui que a conta está errada.
  const cappedByShare = Boolean(verdict?.cappedByIncomeShare);
  // A tela mostra o `warning` (fatia saudável, que se pode dizer em voz
  // alta), não o corte real (warning + zona morta de 10%).
  const healthyCapPct = Math.round(
    (LIFE_SITUATIONS[inputs.lifeSituation]?.warning ?? LIFE_SITUATIONS.shared.warning) *
      100,
  );
  const sharePctShown = verdict ? Math.round(verdict.committedPct * 100) : 0;

  const rangeIsWide = range.high - range.low >= 1;
  // O mesmo veredito no PISO da faixa: responde se o "não cabe" depende de a
  // estimativa ter sido azarada.
  const leftoverAtLow = verdict ? verdict.disposable - range.low : 0;

  const levers = useMemo(
    () => affordabilityLevers(car, effectiveInputs, { country, state }),
    [car, effectiveInputs, country, state],
  );

  const applyLever = (lever) => {
    setInputs((prev) => ({ ...prev, ...lever.patch }));
    setTouched((prev) => {
      const next = new Set(prev);
      Object.keys(lever.patch).forEach((field) => next.add(field));
      return next;
    });
  };

  // Quanto a faixa encolhe se a pessoa aceitar os km medidos.
  const measuredRange = useMemo(() => {
    if (!measuredPatch || !unknownFields.length) return null;
    const applied = Object.keys(measuredPatch);
    const remaining = unknownFields.filter((field) => !applied.includes(field));
    if (remaining.length === unknownFields.length) return null;
    return estimateOwnershipRange(
      car,
      { ...effectiveInputs, ...measuredPatch },
      { country, state },
      remaining,
    );
  }, [car, effectiveInputs, measuredPatch, unknownFields, country, state]);

  /**
   * Leva a pessoa ao ajuste de uma premissa: troca para a aba certa (Ajustar
   * ou Avançado) e rola até o campo. O id é resolvido no DOM porque os alvos
   * são seções do formulário, não refs.
   */
  const goTo = (id) => {
    setTab(ADVANCED_TARGETS.has(id) ? "advanced" : "adjust");
    window.requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };
  const goToAnswer = () => {
    setTab("result");
    setInviteDismissed(false);
    window.requestAnimationFrame(() => {
      answerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };
  const switchTab = (next) => {
    setTab(next);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };

  const decimal = (value, digits = 2) =>
    value.toFixed(digits).replace(".", i18n.language.startsWith("en") ? "." : ",");

  const financing = result.financing;
  const rec = result.recommendations;
  const savingsTarget =
    inputs.purchaseMode === "finance"
      ? rec.downPaymentGap
      : Math.max(result.value - (Number(car.savedValue) || 0), 0);
  const isFinance = inputs.purchaseMode === "finance";
  const defaultConsumption = DEFAULT_CONSUMPTION[inputs.fuelType];
  const carName = formatCarName(car);
  const carYear = formatFipeYear(String(car.year || "").split(" ")[0], t("car.zeroKm"));

  // De onde vem o km/l que está valendo. Três coisas diferentes que não podem
  // parecer a mesma: o que a pessoa mediu, o que o INMETRO mediu nesta versão
  // e o que é média geral.
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
  const shownConsumption = (
    inputs.userConsumption ||
    modelKmPerLiter ||
    defaultConsumption
  ).toFixed(1);
  const kmShown = Number(inputs.kmPerMonth || 0).toLocaleString(i18n.language);

  // As linhas do detalhe em dois grupos: o que é contrato ou lei e o que é
  // estimativa. A barra é proporcional à MAIOR linha de todas.
  const lawRows = [
    isFinance && result.monthly.financing > 0
      ? {
          key: "installment",
          label: t("ownership.results.installment"),
          value: result.monthly.financing,
          note: financing
            ? t("ownership.detail.installmentBasis", {
                months: financing.months,
                principal: money(financing.principal),
                rate: decimal(financing.monthlyRate * 100),
              })
            : "",
        }
      : null,
    {
      key: "tax",
      label:
        result.country === "BR" ? t("ownership.results.taxBR") : t("ownership.results.tax"),
      value: result.monthly.tax,
      note:
        result.tax?.basis === "age_exempt"
          ? t("ownership.results.taxAgeExempt", { age: result.tax.exemptAge })
          : result.tax?.basis === "sp_hybrid"
            ? result.tax.rate === 0
              ? t("ownership.results.taxSpHybridExempt")
              : t("ownership.results.taxSpHybridReduced", { rate: decimal(result.tax.rate * 100) })
            : "",
    },
    { key: "licensing", label: t("ownership.results.licensing"), value: result.monthly.licensing },
    result.monthly.parking > 0
      ? { key: "parking", label: t("ownership.results.parking"), value: result.monthly.parking }
      : null,
    result.monthly.tolls > 0
      ? { key: "tolls", label: t("ownership.results.tolls"), value: result.monthly.tolls }
      : null,
  ].filter(Boolean);
  const estimateRows = [
    {
      key: "insurance",
      label: t("ownership.results.insurance"),
      tag: t("ownership.groups.tagEstimate"),
      value: result.monthly.insurance,
      note:
        result.insurance?.basis === "thirdparty_forced"
          ? t("ownership.results.fullCoverageUnavailable", {
              age: result.insurance.fullCoverageMaxAge,
            })
          : t("ownership.groups.insuranceNote"),
    },
    {
      key: "fuel",
      label: t("ownership.results.fuel"),
      tag:
        consumptionSource === "Default"
          ? t("ownership.groups.tagAverage")
          : consumptionSource === "User"
            ? null
            : "INMETRO",
      value: result.monthly.fuel,
      note: `${t("ownership.groups.fuelNote", { km: kmShown, value: shownConsumption })} ${t(
        `ownership.fields.consumption${consumptionSource}Hint`,
        { value: shownConsumption, year: modelConsumption?.tableYear },
      )}`,
    },
    {
      key: "maintenance",
      label: t("ownership.results.maintenance"),
      tag: t("ownership.groups.tagEstimate"),
      value: result.monthly.maintenance,
      note: t("ownership.groups.maintenanceNote"),
    },
  ];
  const biggestLine = [...lawRows, ...estimateRows].reduce(
    (max, row) => Math.max(max, row.value),
    0,
  );

  // As premissas da conta, na ordem em que pesam. `estimated` marca o que
  // ninguém informou: o chip fica tracejado.
  const locationLabel = state
    ? `${getStateName(country, state) || state} · ${state}`
    : getCountryName(country) || country;
  const premises = [
    {
      key: "purchase",
      target: "engine-own-purchase",
      label: isFinance
        ? t("ownership.premises.finance", { months: inputs.financeMonths })
        : t("ownership.premises.cash"),
    },
    isFinance && financing
      ? {
          key: "down",
          target: "engine-own-purchase",
          label: t("ownership.premises.down", { value: money(financing.downPayment) }),
        }
      : null,
    {
      key: "km",
      target: "engine-own-km",
      label: t("ownership.premises.km", { km: kmShown }),
      estimated: !touched.has("kmPerMonth"),
    },
    {
      key: "coverage",
      target: "engine-own-coverage",
      label: t(`ownership.premises.coverage.${inputs.coverage}`),
    },
    {
      key: "driver",
      target: "engine-own-driver",
      label: t("ownership.premises.driver", {
        band: t(`ownership.ageBands.${inputs.driverAgeBand}`),
      }),
      estimated: !touched.has("driverAgeBand"),
    },
    { key: "location", target: "engine-own-location", label: locationLabel },
    verdict && currentCarCost > 0
      ? {
          key: "replace",
          target: "engine-own-budget",
          label: replacingCurrentCar
            ? t("ownership.budget.replace")
            : t("ownership.budget.keepBoth"),
        }
      : null,
  ].filter(Boolean);

  // No desktop as abas somem, mas a coluna de ajuste continua tendo os dois
  // painéis — e mostra o básico sempre que a aba ativa não for o avançado.
  const advancedView = tab === "advanced";

  const tabClass = (active) =>
    `flex-1 rounded-lg px-3 py-2 text-[13px] font-bold transition ${
      active
        ? "bg-[var(--engine-elevated)] text-[var(--engine-text)] shadow-[0_1px_2px_rgba(0,0,0,0.14)]"
        : "text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
    }`;

  return (
    <div className="engine-modal-overlay">
      <div className="engine-modal-panel engine-pop sm:max-w-4xl">
        {/* Cabeçalho. No celular a folha é tela cheia, então o recuo da
            status bar é dele (o padding do body não alcança o overlay). */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-7 sm:pb-4 sm:pt-5">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--engine-text-muted)]">
              {t("ownership.kicker")}
            </p>
            <h2 className="mt-0.5 text-[15px] font-extrabold leading-tight tracking-tight text-[var(--engine-text)] sm:text-lg">
              {carName}
              <span className="mt-0.5 block text-[12px] font-medium text-[var(--engine-text-muted)] sm:ml-2 sm:inline sm:text-[13px]">
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

        {/* Abas — só no celular. */}
        <div
          role="tablist"
          className="mx-4 mt-3 flex shrink-0 gap-1 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-1 lg:hidden"
        >
          {["result", "adjust", "advanced"].map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={tab === option}
              onClick={() => switchTab(option)}
              className={tabClass(tab === option)}
            >
              {t(`ownership.tabs.${option}`)}
            </button>
          ))}
        </div>

        {/* Rolagem única. No desktop a coluna de ajuste é sticky dentro dela. */}
        <div
          ref={bodyRef}
          className="engine-modal-body engine-scroll @container grid content-start gap-4 px-4 py-4 sm:px-7 sm:py-5 lg:grid-cols-[1.25fr_1fr] lg:items-start lg:gap-x-7"
        >
          {/* ========================= RESULTADO ========================= */}
          <section
            className={`@container grid content-start gap-3.5 ${
              tab === "result" ? "" : "hidden lg:grid"
            }`}
          >
            {/* ---- 1. Cabe? ---- */}
            <div ref={answerRef} className="engine-slab scroll-mt-4 px-5 py-5 sm:px-6">
              {verdict ? (
                <>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--engine-slab-fg-muted)]">
                    {t("ownership.answer.kicker")}
                  </p>
                  <h3
                    className={`engine-slab-verdict mt-2 ${
                      verdict.level === "no_fit" ? "text-[var(--engine-slab-accent)]" : ""
                    }`}
                  >
                    {t(`ownership.answer.verdict.${verdict.level}`)}
                  </h3>
                  <p className="mt-2 max-w-[46ch] text-[15px] font-medium leading-snug">
                    {verdict.level === "no_fit"
                      ? t("ownership.answer.gap", {
                          value: money(Math.abs(verdict.leftover)),
                        })
                      : t(
                          cappedByShare
                            ? "ownership.answer.leftCapped"
                            : "ownership.answer.left",
                          { value: money(verdict.leftover) },
                        )}
                  </p>

                  {/* A linha do porquê: só quando o teto de fatia rebaixou o
                      veredito. O ramo do empate é o guarda da constante da zona
                      morta — inalcançável hoje, volta no dia em que ela cair. */}
                  {cappedByShare ? (
                    <p className="mt-3 rounded-xl border border-[var(--engine-slab-line)] bg-[var(--engine-slab-raise)] px-3 py-2.5 text-[12.5px] leading-relaxed">
                      {sharePctShown === healthyCapPct
                        ? t("ownership.answer.capReasonAtLimit", { cap: healthyCapPct })
                        : t("ownership.answer.capReason", {
                            pct: sharePctShown,
                            cap: healthyCapPct,
                          })}
                    </p>
                  ) : null}

                  {/* A conta, em linhas — substitui a frase por extenso, as
                      três células e a régua: o veredito já é a zona. */}
                  <div className="mt-3.5 border-t border-[var(--engine-slab-line)]">
                    <LedgerRow label={t("ownership.ledger.income")} value={money(income)} />
                    <LedgerRow
                      label={t("ownership.ledger.expenses")}
                      value={`− ${money(verdict.ongoingExpenses)}`}
                    />
                    <LedgerRow
                      label={t("ownership.ledger.car")}
                      hint={
                        rangeIsWide
                          ? t("ownership.ledger.carHint", {
                              low: money(range.low),
                              high: money(range.high),
                            })
                          : t("ownership.ledger.carExactHint")
                      }
                      value={`− ${money(headlineCost)}`}
                    />
                    <LedgerRow
                      sum
                      danger={verdict.level === "no_fit"}
                      label={
                        verdict.level === "no_fit"
                          ? t("ownership.ledger.missing")
                          : t("ownership.ledger.left")
                      }
                      value={
                        verdict.level === "no_fit"
                          ? `− ${money(Math.abs(verdict.leftover))}`
                          : money(verdict.leftover)
                      }
                    />
                  </div>

                  {verdict.level === "no_fit" && rangeIsWide && leftoverAtLow < 0 ? (
                    <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-[var(--engine-slab-fg-muted)]">
                      {t("ownership.answer.robust", {
                        low: money(range.low),
                        gap: money(Math.abs(leftoverAtLow)),
                      })}
                    </p>
                  ) : null}

                  {verdict.suspectIncompleteBudget ? (
                    <p className="mt-3 max-w-[62ch] rounded-xl border border-[var(--engine-slab-line)] bg-[var(--engine-slab-cell)] px-3 py-2 text-[12px] leading-relaxed text-[var(--engine-slab-fg)]">
                      {cappedByShare
                        ? t("ownership.budget.checkBudgetShort")
                        : t("ownership.budget.checkBudget", {
                            pct: sharePctShown,
                            typical: verdict.typicalSharePct,
                          })}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => goTo("engine-own-budget")}
                    className="mt-2 min-h-11 text-[12.5px] font-semibold text-[var(--engine-slab-fg)] underline underline-offset-4"
                  >
                    {t("ownership.invite.change")}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--engine-slab-fg-muted)]">
                    {t("ownership.answer.costKicker")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="engine-slab-number">{money(result.totals.monthlyTotal)}</span>
                    <span className="text-[15px] font-semibold text-[var(--engine-slab-fg-muted)]">
                      {t("ownership.results.perMonth")}
                    </span>
                  </div>
                  {rangeIsWide ? (
                    <RangeBar
                      low={range.low}
                      high={range.high}
                      center={result.totals.monthlyTotal}
                      lowLabel={t("ownership.answer.low", { value: money(range.low) })}
                      highLabel={t("ownership.answer.high", { value: money(range.high) })}
                    />
                  ) : null}
                  <p className="mt-3 max-w-[62ch] text-[12.5px] leading-relaxed text-[var(--engine-slab-fg-muted)]">
                    {rangeIsWide
                      ? t("ownership.answer.unknownWhy", { count: unknownFields.length })
                      : t("ownership.answer.exact")}
                  </p>
                  {inviteDismissed ? (
                    <button
                      type="button"
                      onClick={() => setInviteDismissed(false)}
                      className="mt-4 min-h-11 text-[13px] font-bold text-[var(--engine-slab-fg)] underline underline-offset-4"
                    >
                      {t("ownership.invite.reopen")}
                    </button>
                  ) : (
                    <Invite
                      t={t}
                      income={income}
                      expenses={declaredExpenses}
                      onSubmit={commitBudget}
                      onSkip={() => setInviteDismissed(true)}
                    />
                  )}
                </>
              )}
            </div>

            {/* ---- 2. Baseado em quê? ---- */}
            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h4 className="text-[13.5px] font-bold text-[var(--engine-text)]">
                  {t("ownership.premises.title")}
                </h4>
                <p className="text-[11.5px] text-[var(--engine-text-muted)]">
                  {t("ownership.premises.hint")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {premises.map((premise) => (
                  <Chip
                    key={premise.key}
                    label={premise.label}
                    estimated={premise.estimated}
                    onClick={() => goTo(premise.target)}
                  />
                ))}
              </div>
            </div>

            {/* ---- 3. O que faria caber? ----
                Só com veredito: sem renda não há "caber" para perseguir, e a
                primeira visita já tem o convite como ação principal. */}
            {verdict && levers.length > 0 ? (
              <Bloco
                title={t(
                  verdict.level !== "no_fit"
                    ? "ownership.levers.titleCheaper"
                    : "ownership.levers.title",
                )}
                sub={t("ownership.levers.sub")}
              >
                <div className="grid gap-2">
                  {levers.map((lever) => (
                    <Lever
                      key={lever.key}
                      label={
                        lever.key === "down"
                          ? t("ownership.levers.down", { value: money(lever.params.target) })
                          : lever.key === "months"
                            ? t("ownership.levers.months", {
                                months: lever.params.months,
                                from: lever.params.from,
                              })
                            : t(`ownership.levers.${lever.key}`)
                      }
                      note={
                        lever.key === "cash"
                          ? t("ownership.levers.cashNote", { value: money(lever.params.value) })
                          : lever.key === "thirdparty"
                            ? t("ownership.levers.thirdpartyNote")
                            : lever.key === "down"
                              ? t("ownership.levers.downNote", {
                                  have: money(lever.params.have),
                                  gap: money(lever.params.gap),
                                })
                              : t("ownership.levers.monthsNote", {
                                  value: money(lever.params.extraInterest),
                                })
                      }
                      delta={`−${money(lever.delta)}${t("ownership.levers.perMonth")}`}
                      tradeoff={lever.tradeoff}
                      tradeoffTag={t("ownership.levers.tradeoff")}
                      onApply={() => applyLever(lever)}
                    />
                  ))}
                </div>
              </Bloco>
            ) : null}

            {/* ---- 4. Detalhes ---- */}
            <Accordion
              title={t("ownership.results.breakdown")}
              aux={money(result.totals.monthlyTotal)}
            >
              <p className="mb-1 mt-1 text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--engine-text-muted)]">
                {t("ownership.groups.law")}
              </p>
              {lawRows.map((row) => (
                <DetailRow
                  key={row.key}
                  label={row.label}
                  value={money(row.value)}
                  ratio={biggestLine > 0 ? row.value / biggestLine : 0}
                  note={row.note}
                />
              ))}
              <p className="mb-1 mt-3 flex items-center gap-2 text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--engine-text-muted)]">
                {t("ownership.groups.estimate")}
                <Tag>{t("ownership.groups.estimateTag")}</Tag>
              </p>
              {estimateRows.map((row) => (
                <DetailRow
                  key={row.key}
                  estimate
                  label={row.label}
                  tag={row.tag}
                  value={money(row.value)}
                  ratio={biggestLine > 0 ? row.value / biggestLine : 0}
                  note={row.note}
                />
              ))}
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t-2 border-[var(--engine-border-strong)] pt-3">
                <span className="text-[13px] font-bold text-[var(--engine-text)]">
                  {t("ownership.detail.total")}
                </span>
                <span className="font-display text-lg font-bold tabular-nums tracking-tight text-[var(--engine-text)]">
                  {money(result.totals.monthlyTotal)}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-[var(--engine-border)] pt-2 text-[12.5px] text-[var(--engine-text-muted)]">
                <span>{t("ownership.groups.maintainOnly")}</span>
                <span className="font-display font-bold tabular-nums text-[var(--engine-text)]">
                  {money(result.totals.monthlyMaintain)}
                </span>
              </div>
              <div className="mt-3 rounded-xl border border-dashed border-[var(--engine-border-strong)] bg-[var(--engine-surface-2)] px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-[var(--engine-text)]">
                    {t("ownership.results.depreciation")}
                  </span>
                  <span className="shrink-0 font-display text-[14px] font-bold tabular-nums text-[var(--engine-text)]">
                    {money(result.monthly.depreciation)}
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--engine-text-muted)]">
                  <span className="mr-1.5 inline-block rounded-md border border-[var(--engine-border-strong)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                    {t("ownership.detail.outside")}
                  </span>
                  {t("ownership.results.depreciationNote")}
                </p>
              </div>
            </Accordion>

            {isFinance && financing && financing.principal > 0 ? (
              <Accordion title={t("ownership.results.financingTitle")}>
                <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[13px]">
                  <span className="text-[var(--engine-text-muted)]">{t("ownership.results.downPayment")}</span>
                  <span className="text-right font-semibold tabular-nums text-[var(--engine-text)]">
                    {money(financing.downPayment)} ({(financing.downPaymentPct * 100).toFixed(0)}%)
                  </span>
                  <span className="text-[var(--engine-text-muted)]">{t("ownership.results.financedAmount")}</span>
                  <span className="text-right font-semibold tabular-nums text-[var(--engine-text)]">
                    {money(financing.principal)} · {financing.months}x
                  </span>
                  <span className="text-[var(--engine-text-muted)]">{t("ownership.results.totalInterest")}</span>
                  <span className="text-right font-semibold tabular-nums text-[var(--engine-accent)]">
                    {money(financing.totalInterest)}
                  </span>
                  <span className="text-[var(--engine-text-muted)]">{t("ownership.results.totalPaid")}</span>
                  <span className="text-right font-semibold tabular-nums text-[var(--engine-text)]">
                    {money(financing.totalPaid)}
                  </span>
                </div>
              </Accordion>
            ) : null}

            {measured ? (
              <Accordion
                title={t("ownership.results.realTitle")}
                aux={
                  Math.abs(result.totals.monthlyMaintain - measured.monthlyAverage) < 1
                    ? t("ownership.real.same")
                    : t(
                        result.totals.monthlyMaintain > measured.monthlyAverage
                          ? "ownership.real.more"
                          : "ownership.real.less",
                        {
                          value: money(
                            Math.abs(result.totals.monthlyMaintain - measured.monthlyAverage),
                          ),
                        },
                      )
                }
              >
                <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--engine-text-muted)]">
                  {t("ownership.real.sub")}
                </p>
                <div className="grid grid-cols-1 items-stretch gap-2.5 @[560px]:grid-cols-[1fr_auto_1fr]">
                  <div className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--engine-text-muted)]">
                      {reference.isSelf
                        ? t("ownership.real.selfToday")
                        : t("ownership.real.today", {
                            car: formatCarName(reference.car),
                          })}
                    </p>
                    <p className="mt-1 font-display text-xl font-bold tabular-nums tracking-tight text-[var(--engine-text)]">
                      {money(measured.monthlyAverage)}
                    </p>
                    <p className="mt-1 text-[11.5px] leading-snug text-[var(--engine-text-muted)]">
                      {reference.isSelf
                        ? t("ownership.real.selfHint")
                        : t("ownership.real.todayHint", { count: measured.expenses.length })}
                    </p>
                  </div>
                  <p className="flex items-center font-display text-[14px] font-bold text-[var(--engine-accent)] @[560px]:justify-center">
                    {Math.abs(result.totals.monthlyMaintain - measured.monthlyAverage) < 1
                      ? t("ownership.real.same")
                      : t(
                          result.totals.monthlyMaintain > measured.monthlyAverage
                            ? "ownership.real.more"
                            : "ownership.real.less",
                          {
                            value: money(
                              Math.abs(result.totals.monthlyMaintain - measured.monthlyAverage),
                            ),
                          },
                        )}
                  </p>
                  <div className="rounded-xl border border-[color-mix(in_srgb,var(--engine-accent)_34%,transparent)] bg-[var(--engine-accent-soft)] px-3.5 py-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--engine-text-muted)]">
                      {reference.isSelf
                        ? t("ownership.real.selfTarget")
                        : t("ownership.real.target", { car: carName })}
                    </p>
                    <p className="mt-1 font-display text-xl font-bold tabular-nums tracking-tight text-[var(--engine-text)]">
                      {money(result.totals.monthlyMaintain)}
                    </p>
                    <p className="mt-1 text-[11.5px] leading-snug text-[var(--engine-text-muted)]">
                      {t("ownership.real.targetHint")}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-[var(--engine-text-muted)]">
                  {t("ownership.real.basis")}
                </p>
              </Accordion>
            ) : null}

            <Accordion title={t("ownership.results.recTitle")}>
              <div className="space-y-2 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[var(--engine-text-muted)]">
                    {t("ownership.results.idealDown")}
                    <InfoTip text={t("ownership.tips.idealDown")} />
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--engine-text)]">
                    {money(rec.recommendedDownPayment)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--engine-text-muted)]">
                    {rec.downPaymentGap > 0
                      ? t("ownership.results.downGap")
                      : t("ownership.results.downReady")}
                  </span>
                  {rec.downPaymentGap > 0 ? (
                    <span className="font-semibold tabular-nums text-[var(--engine-accent)]">
                      {money(rec.downPaymentGap)}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[var(--engine-text-muted)]">
                    {t("ownership.results.emergencyFund")}
                    <InfoTip text={t("ownership.tips.emergencyFund")} />
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--engine-text)]">
                    {money(rec.emergencyFund)}
                  </span>
                </div>
              </div>
              {savingsTarget > 0 ? (
                <div className="mt-3 border-t border-[var(--engine-border)] pt-3">
                  <p className="text-[12.5px] font-semibold text-[var(--engine-text)]">
                    {t("ownership.results.savePlanTitle", { amount: money(savingsTarget) })}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[6, 12, 24].map((months) => (
                      <div
                        key={months}
                        className="rounded-xl bg-[var(--engine-surface-2)] px-2 py-2 text-center"
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
                          {t("ownership.results.savePlanMonths", { months })}
                        </p>
                        <p className="mt-0.5 font-display text-sm font-bold tabular-nums text-[var(--engine-text)]">
                          {money(savingsTarget / months)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Accordion>

            <Accordion title={t("ownership.answer.incomeTitle")}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[13px] text-[var(--engine-text-muted)]">
                  {t("ownership.results.requiredIncome")}
                  <InfoTip text={t("ownership.tips.requiredIncome")} align="right" />
                </span>
                <span className="font-display text-lg font-bold tabular-nums tracking-tight text-[var(--engine-text)]">
                  {money(requiredIncome)}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-[var(--engine-text-muted)]">
                {t("ownership.results.requiredIncomeHint", { pct: sharePct })}
              </p>
              <div className="mt-3 border-t border-[var(--engine-border)] pt-3">
                <p className="text-[11px] font-semibold text-[var(--engine-text-muted)]">
                  {t("ownership.results.shareLabel")}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    inputMode="numeric"
                    value={sharePct}
                    onChange={(e) => set("incomeSharePct", e.target.value)}
                    className="h-11 w-16 rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-2 text-center text-base font-bold tabular-nums text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]"
                  />
                  <span className="text-sm font-bold text-[var(--engine-text-muted)]">%</span>
                  {[15, 20, 25, 30, 35].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => set("incomeSharePct", pct)}
                      className={`h-11 min-w-11 rounded-lg border px-2.5 text-[12px] font-bold tabular-nums transition-colors ${
                        sharePct === pct
                          ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                          : "border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)]"
                      }`}
                    >
                      {pct}
                    </button>
                  ))}
                </div>
                {sharePct > (LIFE_SITUATIONS[inputs.lifeSituation]?.warning || 0.3) * 100 ? (
                  <p className="mt-2 text-[11.5px] leading-relaxed text-amber-600 dark:text-amber-400">
                    {t("ownership.results.shareWarning", {
                      pct: sharePct,
                      limit: Math.round(
                        (LIFE_SITUATIONS[inputs.lifeSituation]?.warning || 0.3) * 100,
                      ),
                    })}
                  </p>
                ) : null}
              </div>
              {result.value > 0 ? (
                <div className="mt-3 border-t border-[var(--engine-border)] pt-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--engine-text-muted)]">
                    {t("ownership.results.compareTitle")}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--engine-accent)]">
                        {t(`ownership.purchaseOptions.${inputs.purchaseMode}`)}
                      </p>
                      <p className="font-display text-base font-bold tabular-nums text-[var(--engine-text)]">
                        {money(requiredIncome)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--engine-text-muted)]">
                        {t(`ownership.purchaseOptions.${altPurchase}`)}
                      </p>
                      <p className="font-display text-base font-bold tabular-nums text-[var(--engine-text-muted)]">
                        {money(altRequiredIncome)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--engine-text-muted)]">
                    {t("ownership.results.compareHint", {
                      times: decimal(
                        Math.max(requiredIncome, altRequiredIncome) /
                          Math.max(Math.min(requiredIncome, altRequiredIncome), 1),
                        1,
                      ),
                    })}
                  </p>
                </div>
              ) : null}
            </Accordion>

            <p className="text-[11px] leading-relaxed text-[var(--engine-text-muted)]">
              {t("ownership.disclaimer")}
            </p>
          </section>

          {/* ========================== AJUSTAR ========================== */}
          <aside
            className={`@container grid content-start gap-4 lg:sticky lg:top-0 ${
              tab === "result" ? "hidden lg:grid" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-extrabold tracking-tight text-[var(--engine-text)]">
                  {t("ownership.adjust.title")}
                </h3>
                <p className="mt-0.5 text-[12.5px] text-[var(--engine-text-muted)]">
                  {advancedView ? t("ownership.adjust.advancedSub") : t("ownership.adjust.sub")}
                </p>
              </div>
              {/* No desktop o mesmo seletor das abas, em miniatura: os dois
                  painéis são os mesmos do celular, só muda quem os chama. */}
              <div className="hidden shrink-0 gap-0.5 rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-0.5 lg:flex">
                {[
                  { key: "adjust", label: t("ownership.adjust.basic") },
                  { key: "advanced", label: t("ownership.tabs.advanced") },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setTab(option.key)}
                    className={`min-h-9 rounded-md px-3 text-[12px] font-bold transition ${
                      (option.key === "advanced") === advancedView
                        ? "bg-[var(--engine-elevated)] text-[var(--engine-text)] shadow-[0_1px_2px_rgba(0,0,0,0.14)]"
                        : "text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`grid content-start gap-4 ${advancedView ? "hidden" : ""}`}>

            {/* Seu orçamento. Aparece aqui só depois do convite (sem renda, o
                convite dentro do slab é o caminho — não vale ter dois). */}
            {verdict ? (
              <div
                id="engine-own-budget"
                className="scroll-mt-4 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4"
              >
                <Invite
                  key={`${income}-${declaredExpenses}`}
                  t={t}
                  tone="surface"
                  income={income}
                  expenses={declaredExpenses}
                  title={t("ownership.adjust.budgetTitle")}
                  cta={t("ownership.adjust.budgetApply")}
                  onSubmit={commitBudget}
                />
                {currentCarCost > 0 ? (
                  <div className="mt-3 border-t border-[var(--engine-border)] pt-3">
                    <p className="text-[12px] leading-relaxed text-[var(--engine-text-muted)]">
                      {t("ownership.budget.currentCarNotice", {
                        total: money(declaredExpenses),
                        amount: money(currentCarCost),
                        car: formatCarName(reference.car),
                      })}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[
                        { key: "replace", active: replacingCurrentCar },
                        { key: "keepBoth", active: !replacingCurrentCar },
                      ].map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() =>
                            commitBudget({
                              replacedCarId:
                                option.key === "replace" ? String(reference.car.id) : "",
                            })
                          }
                          className={`${optionClass(option.active)} items-center text-center`}
                        >
                          {t(`ownership.budget.${option.key}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Como você vai comprar? */}
            <section id="engine-own-purchase" className="scroll-mt-4 space-y-3">
              <h5 className={questionClass}>{t("ownership.adjust.qPurchase")}</h5>
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
                <>
                  <div className="grid grid-cols-1 gap-3 @[420px]:grid-cols-[1fr_1.4fr]">
                    <Field
                      label={t("ownership.fields.downPayment")}
                      hint={t("ownership.fields.downPaymentHint")}
                    >
                      <input
                        type="number"
                        min="0"
                        step="500"
                        inputMode="numeric"
                        placeholder={String(Math.round(car.savedValue || 0))}
                        value={inputs.downPaymentValue || ""}
                        onChange={(e) => set("downPaymentValue", e.target.value)}
                        className={fieldClass}
                      />
                    </Field>
                    <Field label={t("ownership.fields.months")}>
                      <div className="grid grid-cols-5 gap-1.5">
                        {FINANCE_MONTHS.map((months) => (
                          <button
                            key={months}
                            type="button"
                            onClick={() => set("financeMonths", months)}
                            className={`${optionClass(
                              Number(inputs.financeMonths) === months,
                            )} items-center px-1 text-center tabular-nums`}
                          >
                            {months}x
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                  {!touched.has("monthlyRatePct") ? (
                    <p className="rounded-xl border border-dashed border-[var(--engine-border)] px-3 py-2 text-[11px] leading-relaxed text-[var(--engine-text-muted)]">
                      {t("ownership.fields.rateAssumed", {
                        rate: decimal((financing?.monthlyRate || 0.0199) * 100),
                      })}
                    </p>
                  ) : null}
                </>
              ) : null}
            </section>

            {/* Quanto você roda? */}
            <section id="engine-own-km" className="scroll-mt-4 space-y-3">
              <h5 className={questionClass}>
                {t("ownership.adjust.qKm")}
                <span className="mt-0.5 block text-[11.5px] font-medium text-[var(--engine-text-muted)]">
                  {t("ownership.adjust.qKmHint")}
                </span>
              </h5>
              <div className="grid grid-cols-2 gap-2 @[480px]:grid-cols-3">
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
              {canApplyMeasured && measuredPatch?.kmPerMonth ? (
                <button
                  type="button"
                  onClick={applyMeasured}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[var(--engine-border-strong)] px-3 text-left text-[12.5px] font-semibold text-[var(--engine-text)] transition-colors hover:border-[var(--engine-text)]"
                >
                  <span className="min-w-0">
                    {t("ownership.adjust.measuredKm", {
                      km: measuredPatch.kmPerMonth.toLocaleString(i18n.language),
                    })}
                    <span className="block text-[11px] font-medium text-[var(--engine-text-muted)]">
                      {measuredRange && range.high - range.low > measuredRange.high - measuredRange.low
                        ? t("ownership.precision.kmNote", {
                            from: money(range.high - range.low),
                            to: money(measuredRange.high - measuredRange.low),
                          })
                        : t("ownership.precision.kmNoteSimple")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md bg-[var(--engine-text)] px-2 py-1 text-[11px] font-bold text-[var(--engine-bg)]">
                    {t("ownership.precision.apply")}
                  </span>
                </button>
              ) : null}
            </section>

            {/* Que seguro? */}
            <section id="engine-own-coverage" className="scroll-mt-4 space-y-3">
              <h5 className={questionClass}>{t("ownership.adjust.qCoverage")}</h5>
              <div className="grid grid-cols-3 gap-2">
                {COVERAGE_TYPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => set("coverage", option)}
                    className={`${optionClass(inputs.coverage === option)} items-center px-2 text-center text-[12px] leading-tight`}
                  >
                    {t(`ownership.coverageOptions.${option}`)}
                  </button>
                ))}
              </div>
            </section>

            </div>

            {/* Avançado: o antigo modo Avançado, agora uma aba própria — o
                Murilo não queria rolar até o fim do Ajustar para chegar aqui. */}
            <section
              id="engine-own-advanced"
              className={`scroll-mt-4 ${advancedView ? "" : "hidden"}`}
            >
              <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 @[420px]:grid-cols-2">
                <Field id="engine-own-location" label={t("ownership.fields.country")}>
                  <select
                    value={country}
                    onChange={(e) => {
                      setCountry(e.target.value);
                      setState("");
                    }}
                    className={fieldClass}
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("ownership.fields.state")}>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className={fieldClass}
                    disabled={!states.length}
                  >
                    <option value="">—</option>
                    {states.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="engine-own-driver" label={t("ownership.fields.driverAge")}>
                  <select
                    value={inputs.driverAgeBand}
                    onChange={(e) => set("driverAgeBand", e.target.value)}
                    className={fieldClass}
                  >
                    {AGE_BANDS.map((band) => (
                      <option key={band} value={band}>
                        {t(`ownership.ageBands.${band}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("ownership.fields.usage")}>
                  <select
                    value={inputs.usage}
                    onChange={(e) => set("usage", e.target.value)}
                    className={fieldClass}
                  >
                    {USAGE_TYPES.map((u) => (
                      <option key={u} value={u}>
                        {t(`ownership.usageOptions.${u}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("ownership.fields.fuelType")}>
                  <select
                    value={inputs.fuelType}
                    onChange={(e) => set("fuelType", e.target.value)}
                    className={fieldClass}
                  >
                    {FUEL_TYPES.map((f) => (
                      <option key={f} value={f}>
                        {t(`ownership.fuel.${f}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={
                    <span className="flex items-center gap-1.5">
                      {t("ownership.fields.consumption")}
                      <InfoTip
                        text={t(`ownership.fields.consumption${consumptionSource}`, {
                          year: modelConsumption?.tableYear,
                        })}
                      />
                    </span>
                  }
                  hint={t(`ownership.fields.consumption${consumptionSource}Hint`, {
                    value: shownConsumption,
                    year: modelConsumption?.tableYear,
                  })}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    placeholder={t("ownership.fields.consumptionPlaceholder", {
                      value: shownConsumption,
                    })}
                    value={inputs.userConsumption || ""}
                    onChange={(e) => set("userConsumption", e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                {isFinance ? (
                  <Field
                    label={
                      <span className="flex items-center gap-1.5">
                        {t("ownership.fields.monthlyRate")}
                        <InfoTip
                          text={t("ownership.tips.monthlyRate", {
                            defaultValue: (financing?.monthlyRate * 100 || 1.99).toFixed(2),
                          })}
                        />
                      </span>
                    }
                    hint={t("ownership.fields.monthlyRateHint", {
                      value: (financing?.monthlyRate * 100 || 1.99).toFixed(2),
                    })}
                  >
                    <input
                      type="number"
                      min="0"
                      step="0.05"
                      inputMode="decimal"
                      placeholder={((financing?.monthlyRate || 0.0199) * 100).toFixed(2)}
                      value={inputs.monthlyRatePct || ""}
                      onChange={(e) => set("monthlyRatePct", e.target.value)}
                      className={fieldClass}
                    />
                  </Field>
                ) : null}
                <Field
                  label={
                    <span className="flex items-center gap-1.5">
                      {t("ownership.fields.lifeSituation")}
                      <InfoTip text={t("ownership.tips.lifeSituation")} />
                    </span>
                  }
                >
                  <select
                    value={inputs.lifeSituation}
                    onChange={(e) =>
                      // Trocar a situação também sugere a % de renda adequada.
                      setInputs((prev) => ({
                        ...prev,
                        lifeSituation: e.target.value,
                        incomeSharePct: LIFE_SITUATIONS[e.target.value].suggestedShare,
                      }))
                    }
                    className={fieldClass}
                  >
                    {LIFE_SITUATION_TYPES.map((situation) => (
                      <option key={situation} value={situation}>
                        {t(`ownership.lifeOptions.${situation}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={t("ownership.fields.incomeShare")}
                  hint={t("ownership.fields.incomeShareHint", {
                    pct: LIFE_SITUATIONS[inputs.lifeSituation].suggestedShare,
                  })}
                >
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    inputMode="numeric"
                    value={inputs.incomeSharePct}
                    onChange={(e) => set("incomeSharePct", e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field label={t("ownership.fields.parking")}>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    inputMode="numeric"
                    value={inputs.parkingMonthly || ""}
                    onChange={(e) => set("parkingMonthly", e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field label={t("ownership.fields.tolls")}>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    inputMode="numeric"
                    value={inputs.tollsMonthly || ""}
                    onChange={(e) => set("tollsMonthly", e.target.value)}
                    className={fieldClass}
                  />
                </Field>
              </div>
              <label className="mt-3.5 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-2.5">
                <input
                  type="checkbox"
                  checked={inputs.hasGarage}
                  onChange={(e) => set("hasGarage", e.target.checked)}
                  className="h-4 w-4 accent-[var(--engine-accent)]"
                />
                <span className="text-sm text-[var(--engine-text)]">
                  {t("ownership.fields.hasGarage")}
                </span>
              </label>
            </section>
          </aside>
        </div>

        {/* ========================= A BARRA FIXA =========================
            Eco comprimido da resposta — é o que fica à vista enquanto a
            pessoa mexe na aba Ajustar — e A ação certa para o estado: salvar
            só vira primário depois de um veredito que aprova; sem renda, a
            ação é informar a renda. */}
        <div className="engine-safe-bottom shrink-0 border-t border-[var(--engine-border)] bg-[var(--engine-elevated)] px-4 pt-2.5 sm:px-6 sm:pt-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
              {verdict ? (
                <>
                  <p className="text-[13.5px] font-bold leading-tight text-[var(--engine-text)]">
                    {t(`ownership.answer.verdict.${verdict.level}`)}
                  </p>
                  <p className="text-[12px] leading-tight text-[var(--engine-text-muted)]">
                    {verdict.level === "no_fit"
                      ? t("ownership.answer.footGap", {
                          value: money(Math.abs(verdict.leftover)),
                        })
                      : cappedByShare
                        ? t("ownership.answer.footCapped", {
                            value: money(verdict.leftover),
                            pct: sharePctShown,
                          })
                        : t("ownership.answer.footLeft", {
                            value: money(verdict.leftover),
                          })}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-[17px] font-bold leading-tight tabular-nums text-[var(--engine-text)]">
                    {money(result.totals.monthlyTotal)}
                  </p>
                  <p className="text-[12px] leading-tight text-[var(--engine-text-muted)]">
                    {rangeIsWide
                      ? t("ownership.answer.footRange", {
                          low: money(range.low),
                          high: money(range.high),
                        })
                      : t("ownership.results.perMonth")}
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-[14.5px] font-bold tracking-tight transition-colors disabled:opacity-50 sm:flex-none ${
                verdict && verdict.level === "comfortable"
                  ? "bg-[var(--engine-accent)] text-white hover:brightness-95"
                  : "border border-[var(--engine-border-strong)] text-[var(--engine-text)] hover:border-[var(--engine-accent)]"
              }`}
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              <span className="sm:hidden">{t("common.save")}</span>
              <span className="hidden sm:inline">{t("ownership.save")}</span>
            </button>

            {!verdict ? (
              <button
                type="button"
                onClick={goToAnswer}
                className="min-h-12 flex-1 rounded-xl bg-[var(--engine-accent)] px-4 text-[14.5px] font-bold tracking-tight text-white transition-colors hover:brightness-95 sm:flex-none"
              >
                {t("ownership.invite.cta")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
