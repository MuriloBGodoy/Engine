import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Loader2, Sparkles } from "lucide-react";
import { parseFipeVersion } from "../../services/fipeVersion";
import { SPEC_STATUS } from "../../services/vehicleSpecs";
import {
  ISSUE_SEVERITY,
  MOD_CHIPS,
  POWER_BASIS,
  SPEC_FIELDS,
  SPEC_LAYER,
  SPEC_LIMITS,
  SPEC_METHOD,
  STAGES,
  VERSION_FIELDS,
  normalizeSpecSheet,
  validateRawEntry,
  validateSpecSheet,
} from "../../services/carSpecSheet";
import { fieldLabel, issueLabel, modLabel, stageLabel } from "./labels";
import { Select } from "../ui/Select";

/**
 * Aspiracao ganha botao e o resto ganha lista, e isso nao e inconsistencia.
 *
 * A aspiracao e o campo que DESTRAVA: o parser se abste nela em 317 versoes e
 * retem a ficha inteira, entao responder "o meu e aspirado" faz potencia,
 * torque e desempenho aparecerem de uma vez. Um controle que se ve inteiro sem
 * abrir e o que transforma isso numa resposta de um toque. Os outros cinco
 * campos corrigem um campo so e cabem numa lista.
 */
const CHIP_VERSION_FIELDS = new Set(["aspiration"]);

const GROUP_ORDER = ["engine", "drivetrain", "chassis", "cosmetic", "use"];

/** Vira ponto o que a pessoa digitou com virgula. Ninguem digita 17.5 no Brasil. */
const toNumber = (raw) => {
  const clean = String(raw ?? "").trim().replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
};

const emptyEntry = () => ({
  value: "",
  unit: "",
  origin: SPEC_LAYER.DECLARED,
  method: SPEC_METHOD.OWNER,
  basis: POWER_BASIS.CRANK,
  shop: "",
  date: "",
});

const initialForm = (car) => {
  const sheet = normalizeSpecSheet(car?.specs);
  const performance = {};
  for (const field of SPEC_FIELDS) {
    const saved = sheet?.performance?.[field.id];
    performance[field.id] = saved
      ? {
          value: String(saved.value).replace(".", ","),
          unit: saved.unit || (field.units ? field.units[0] : field.unit || ""),
          origin: saved.origin,
          method: saved.method,
          basis: saved.basis || POWER_BASIS.CRANK,
          shop: saved.shop || "",
          date: saved.date || "",
        }
      : { ...emptyEntry(), unit: field.units ? field.units[0] : field.unit || "" };
  }

  return {
    version: { ...(sheet?.version || {}) },
    performance,
    mods: sheet?.mods || [],
    stage: sheet?.stage || "",
    notes: sheet?.notes || "",
  };
};

/** Monta o objeto cru que `normalizeSpecSheet` sabe ler. */
const toRawSheet = (form) => {
  const performance = {};
  for (const field of SPEC_FIELDS) {
    const entry = form.performance[field.id];
    const value = toNumber(entry.value);
    if (value === null) continue;
    performance[field.id] = {
      value,
      unit: entry.unit || field.unit,
      origin: entry.origin,
      method: entry.method,
      basis: field.hasBasis ? entry.basis : null,
      shop: entry.shop,
      date: entry.date,
    };
  }

  return {
    version: form.version,
    performance,
    mods: form.mods,
    stage: form.stage || null,
    notes: form.notes,
  };
};

function Segmented({ label, value, options, onChange, name }) {
  return (
    <div>
      <p className="text-[9.5px] font-black uppercase tracking-[0.12em] text-[var(--engine-text-muted)]">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-1.5 inline-flex flex-wrap gap-1 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-1"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            name={name}
            onClick={() => onChange(option.value)}
            className={`min-h-[36px] rounded-lg px-3 text-[11px] font-black uppercase tracking-wide transition ${
              value === option.value
                ? "bg-[var(--engine-elevated)] text-[var(--engine-text)] shadow-[var(--engine-shadow-sm)]"
                : "text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Um numero declarado, com as perguntas que dao sentido a ele.
 *
 * As qualificacoes so aparecem depois que ha numero. Perguntar "de fabrica ou
 * modificado?" num campo vazio e pedir que a pessoa classifique o nada.
 */
function NumberField({ field, entry, factoryCell, issues, onChange }) {
  const { t } = useTranslation();
  const id = `spec-${field.id}`;
  const filled = String(entry.value).trim().length > 0;
  const isDyno = entry.method === SPEC_METHOD.DYNO;
  const factoryText =
    factoryCell?.status === SPEC_STATUS.VALUE
      ? factoryCell.pair
        ? `${factoryCell.pair.ethanol} / ${factoryCell.pair.gasoline} ${factoryCell.unit || ""}`
        : `${factoryCell.value} ${factoryCell.unit || ""}`
      : null;

  return (
    <div className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3.5">
      <label
        htmlFor={id}
        className="text-[9.5px] font-black uppercase tracking-[0.12em] text-[var(--engine-text-muted)]"
      >
        {fieldLabel(t, field.id)}
      </label>

      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={entry.value}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={factoryText || t("specSheet.editor.valuePlaceholder")}
          /* 16px no campo: abaixo disso o iOS da zoom ao focar e a pessoa
             perde o resto do formulario de vista. */
          className="min-h-[44px] w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] px-3 text-[16px] font-bold tabular-nums text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
        />
        {field.units ? (
          <Select
            aria-label={t("specSheet.editor.unit")}
            value={entry.unit}
            onChange={(event) => onChange({ unit: event.target.value })}
            className="min-h-[44px] shrink-0 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] px-2 text-[14px] font-bold text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)]"
          >
            {field.units.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        ) : (
          <span className="shrink-0 text-[13px] font-black text-[var(--engine-text-muted)]">
            {field.unit}
          </span>
        )}
      </div>

      {factoryText ? (
        <p className="mt-1.5 text-[11px] font-semibold text-[var(--engine-text-muted)]">
          {t("specSheet.editor.factoryIs", { value: factoryText.trim() })}
        </p>
      ) : null}

      {filled ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <Segmented
            name={`${id}-origin`}
            label={t("specSheet.editor.originLabel")}
            value={entry.origin}
            onChange={(value) => onChange({ origin: value })}
            options={[
              { value: SPEC_LAYER.DECLARED, label: t("specSheet.origin.declarado") },
              { value: SPEC_LAYER.MODIFIED, label: t("specSheet.origin.modificado") },
            ]}
          />
          <Segmented
            name={`${id}-method`}
            label={t("specSheet.editor.methodLabel")}
            value={entry.method}
            onChange={(value) => onChange({ method: value })}
            options={[
              { value: SPEC_METHOD.OWNER, label: t("specSheet.editor.methodOwner") },
              { value: SPEC_METHOD.DYNO, label: t("specSheet.editor.methodDyno") },
            ]}
          />
          {field.hasBasis ? (
            <Segmented
              name={`${id}-basis`}
              label={t("specSheet.editor.basisLabel")}
              value={entry.basis}
              onChange={(value) => onChange({ basis: value })}
              options={[
                { value: POWER_BASIS.CRANK, label: t("specSheet.basis.crank") },
                { value: POWER_BASIS.WHEEL, label: t("specSheet.basis.wheel") },
              ]}
            />
          ) : null}
        </div>
      ) : null}

      {filled && isDyno ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={entry.shop}
            maxLength={SPEC_LIMITS.shop}
            onChange={(event) => onChange({ shop: event.target.value })}
            placeholder={t("specSheet.editor.shopPlaceholder")}
            className="min-h-[44px] rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] px-3 text-[16px] text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)]"
            aria-label={t("specSheet.editor.shopPlaceholder")}
          />
          <input
            type="date"
            value={entry.date}
            onChange={(event) => onChange({ date: event.target.value })}
            className="min-h-[44px] rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] px-3 text-[16px] text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)]"
            aria-label={t("specSheet.editor.dynoDate")}
          />
          <p className="text-[11px] leading-relaxed text-[var(--engine-text-muted)] sm:col-span-2">
            {t("specSheet.editor.dynoHint")}
          </p>
        </div>
      ) : null}

      {issues.map((issue, index) => (
        <p
          key={`${issue.code}-${index}`}
          className={`mt-2 flex gap-1.5 text-[11.5px] leading-relaxed ${
            issue.severity === ISSUE_SEVERITY.BLOCK
              ? "text-[var(--engine-accent)]"
              : "text-[var(--engine-text-muted)]"
          }`}
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {issueLabel(t, issue)}
        </p>
      ))}
    </div>
  );
}

/**
 * O editor da ficha do EXEMPLAR.
 *
 * Ele nunca escreve na camada de fabrica: o que a pessoa preenche aqui vira
 * camada 2 (declarado, complementa) ou camada 3 (modificado, substitui e vira
 * a seta na leitura). Quem decide qual e ela, no proprio campo.
 */
export function SpecSheetEditor({ car, resolved, focusVersion = false, saving, error, onCancel, onSave }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => initialForm(car));

  const rawParsed = useMemo(() => parseFipeVersion(car || {}), [car]);

  const { issuesByField, generalIssues, blocked } = useMemo(() => {
    const raw = toRawSheet(form);
    const sheet = normalizeSpecSheet(raw);
    const list = validateSpecSheet(sheet, {
      factory: resolved.factory,
      rawParsed,
      carType: car?.type,
    });

    // O bloqueio nasce do valor CRU: `normalizeSpecSheet` descarta o
    // fisicamente impossivel em silencio, entao sem isto a pessoa apertaria
    // salvar e veria o numero dela sumir sem explicacao.
    for (const field of SPEC_FIELDS) {
      const value = toNumber(form.performance[field.id].value);
      if (value === null) continue;
      list.push(
        ...validateRawEntry(field.id, {
          value,
          unit: form.performance[field.id].unit || field.unit,
        }),
      );
    }

    const byField = {};
    const general = [];
    for (const issue of list) {
      if (issue.field) (byField[issue.field] = byField[issue.field] || []).push(issue);
      else general.push(issue);
    }
    return {
      issuesByField: byField,
      generalIssues: general,
      blocked: list.some((issue) => issue.severity === ISSUE_SEVERITY.BLOCK),
    };
  }, [form, resolved.factory, rawParsed, car?.type]);

  const setEntry = (id) => (patch) =>
    setForm((current) => ({
      ...current,
      performance: {
        ...current.performance,
        [id]: { ...current.performance[id], ...patch },
      },
    }));

  const setVersion = (id, value) =>
    setForm((current) => {
      const next = { ...current.version };
      if (value === "") delete next[id];
      else next[id] = id === "doors" || id === "valves" ? Number(value) : value;
      return { ...current, version: next };
    });

  const toggleMod = (id) =>
    setForm((current) => ({
      ...current,
      mods: current.mods.includes(id)
        ? current.mods.filter((item) => item !== id)
        : [...current.mods, id],
    }));

  const heldIds = new Set(resolved.held.map((cell) => cell.id));
  const groups = GROUP_ORDER.map((group) => ({
    group,
    chips: MOD_CHIPS.filter((chip) => chip.group === group),
  })).filter((entry) => entry.chips.length > 0);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked) return;
        onSave(toRawSheet(form));
      }}
      className="space-y-5"
    >
      {/* A correcao de versao vem primeiro quando ha campo retido: e a acao de
          maior retorno da tela inteira — um toque destrava potencia, torque e
          desempenho de uma vez. */}
      <section
        className={`rounded-2xl border p-4 ${
          focusVersion || heldIds.size
            ? "border-[var(--engine-accent)]/40 bg-[var(--engine-accent-soft)]"
            : "border-[var(--engine-border)] bg-[var(--engine-surface)]"
        }`}
      >
        <h3 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--engine-text)]">
          <Sparkles size={13} className="text-[var(--engine-accent)]" aria-hidden="true" />
          {t("specSheet.editor.versionTitle")}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--engine-text-muted)]">
          {heldIds.size
            ? t("specSheet.editor.versionUnlockHint")
            : t("specSheet.editor.versionHint")}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {VERSION_FIELDS.map((field) => {
            const current = form.version[field.id] ?? "";
            const options = field.values || [];
            const isHeld = heldIds.has(field.id);

            if (CHIP_VERSION_FIELDS.has(field.id)) {
              return (
                <div key={field.id} className="sm:col-span-2">
                  <p className="text-[9.5px] font-black uppercase tracking-[0.12em] text-[var(--engine-text-muted)]">
                    {fieldLabel(t, field.id)}
                    {isHeld ? ` · ${t("specSheet.editor.unlocks")}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {options.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={current === value}
                        onClick={() => setVersion(field.id, current === value ? "" : value)}
                        className={`min-h-[40px] rounded-xl border px-3 text-[12px] font-bold transition ${
                          current === value
                            ? "border-[var(--engine-accent)] bg-[var(--engine-accent)] text-white"
                            : "border-[var(--engine-border-strong)] bg-[var(--engine-elevated)] text-[var(--engine-text)] hover:border-[var(--engine-accent)]"
                        }`}
                      >
                        {t(`specSheet.value.${field.id}.${value}`)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div key={field.id}>
                <label
                  htmlFor={`version-${field.id}`}
                  className="text-[9.5px] font-black uppercase tracking-[0.12em] text-[var(--engine-text-muted)]"
                >
                  {fieldLabel(t, field.id)}
                </label>
                <Select
                  id={`version-${field.id}`}
                  value={current}
                  onChange={(event) => setVersion(field.id, event.target.value)}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] px-3 text-[16px] font-semibold text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)]"
                >
                  <option value="">{t("specSheet.editor.keepAsIs")}</option>
                  {(options.length
                    ? options
                    : Array.from(
                        { length: field.max - field.min + 1 },
                        (unused, index) => field.min + index,
                      )
                  ).map((value) => (
                    <option key={value} value={value}>
                      {field.values
                        ? t(`specSheet.value.${field.id}.${value}`, { defaultValue: String(value) })
                        : field.id === "doors"
                          ? t("specSheet.doorsCount", { count: value })
                          : `${value}V`}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-black uppercase tracking-wider text-[var(--engine-text)]">
          {t("specSheet.editor.numbersTitle")}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--engine-text-muted)]">
          {t("specSheet.editor.numbersHint")}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SPEC_FIELDS.map((field) => (
            <NumberField
              key={field.id}
              field={field}
              entry={form.performance[field.id]}
              factoryCell={resolved.factory.fields[field.id]}
              issues={issuesByField[field.id] || []}
              onChange={setEntry(field.id)}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-black uppercase tracking-wider text-[var(--engine-text)]">
          {t("specSheet.editor.modsTitle")}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--engine-text-muted)]">
          {t("specSheet.editor.modsHint")}
        </p>
        <div className="mt-3 space-y-3">
          {groups.map(({ group, chips }) => (
            <div key={group}>
              <p className="text-[9.5px] font-black uppercase tracking-[0.12em] text-[var(--engine-text-muted)]">
                {t(`specSheet.modGroup.${group}`)}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {chips.map((chip) => {
                  const active = form.mods.includes(chip.id);
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleMod(chip.id)}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-[12px] font-bold transition ${
                        active
                          ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                          : "border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-text)]"
                      }`}
                    >
                      {active ? <Check size={13} aria-hidden="true" /> : null}
                      {modLabel(t, chip.id)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <p className="text-[9.5px] font-black uppercase tracking-[0.12em] text-[var(--engine-text-muted)]">
            {t("specSheet.editor.stageLabel")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {STAGES.map((stage) => (
              <button
                key={stage}
                type="button"
                aria-pressed={form.stage === stage}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    stage: current.stage === stage ? "" : stage,
                  }))
                }
                className={`min-h-[40px] rounded-xl border px-3 text-[12px] font-bold transition ${
                  form.stage === stage
                    ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                    : "border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)]"
                }`}
              >
                {stageLabel(t, stage)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--engine-text-muted)]">
            {t("specSheet.editor.stageHint")}
          </p>
        </div>
      </section>

      <section>
        <label
          htmlFor="spec-notes"
          className="text-[11px] font-black uppercase tracking-wider text-[var(--engine-text)]"
        >
          {t("specSheet.editor.notesTitle")}
        </label>
        <textarea
          id="spec-notes"
          rows={4}
          maxLength={SPEC_LIMITS.notes}
          value={form.notes}
          onChange={(event) =>
            setForm((current) => ({ ...current, notes: event.target.value }))
          }
          placeholder={t("specSheet.editor.notesPlaceholder")}
          className="mt-2 w-full resize-y rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] p-3 text-[16px] leading-relaxed text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
        />
        <p className="mt-1 text-right text-[11px] font-semibold tabular-nums text-[var(--engine-text-muted)]">
          {form.notes.length}/{SPEC_LIMITS.notes}
        </p>
      </section>

      {generalIssues.length > 0 && (
        <ul className="space-y-1.5">
          {generalIssues.map((issue, index) => (
            <li
              key={`${issue.code}-${index}`}
              className="flex gap-1.5 text-[11.5px] leading-relaxed text-[var(--engine-text-muted)]"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              {issueLabel(t, issue)}
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="rounded-xl border border-[var(--engine-accent)]/40 bg-[var(--engine-accent-soft)] px-3 py-2 text-[12px] font-semibold text-[var(--engine-accent)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="submit"
          disabled={saving || blocked}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-[12px] font-black uppercase tracking-wider text-white transition hover:brightness-95 disabled:opacity-55"
        >
          {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
          {t("specSheet.editor.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] rounded-xl border border-[var(--engine-border-strong)] px-4 text-[12px] font-black uppercase tracking-wider text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:flex-1"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
