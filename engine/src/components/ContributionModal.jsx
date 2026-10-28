import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, PiggyBank, Trash2, TrendingUp, X } from "lucide-react";
import { engineDB } from "../services/db";
import { forecastCompletion } from "../services/forecast";
import { trackEvent } from "../services/observability";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { useConfirm } from "./ConfirmProvider";
import { localISODate, validateContribution } from "../services/garageInput";

// Fuso do aparelho. Era `toISOString()` (UTC): no Brasil, depois das 21h o
// aporte nascia com a data de amanhã.
const today = () => localISODate();

/**
 * Registro de aporte na meta.
 *
 * Antes disso só existia editar o campo "já guardei" no cadastro do carro —
 * manutenção de cadastro, sem data e sem histórico. Aqui o aporte vira evento:
 * é o que dá motivo pra pessoa voltar todo mês e o que alimenta a previsão.
 */
export function ContributionModal({ car, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const confirm = useConfirm();

  // Voltar no Android fecha o modal em vez de sair da garagem.
  const close = useCallback(() => onClose?.(), [onClose]);
  useHistoryDismiss(Boolean(car), close);

  if (!car) return null;

  // Centavos só quando existem: "R$ 500" e "R$ 500,50", nunca "R$ 501".
  const money = (value) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: Number(value) % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(value || 0);

  const forecast = forecastCompletion(car);
  const contributions = car.contributions || [];

  const submit = async (event) => {
    event.preventDefault();
    // Vírgula ou ponto: "1500.50" e "1.500,50" são R$ 1.500,50. O parse antigo
    // tirava todo ponto e transformava "1500.50" em R$ 150.050.
    const remaining = car.targetValue > 0 ? car.targetValue - (car.savedValue || 0) : null;
    const check = validateContribution(amount, { remaining });
    if (check.error) {
      setError(
        t(check.error, {
          max: money(check.errorParams?.max),
        }),
      );
      return;
    }
    const value = check.value;
    if (check.warnings.length) {
      const ok = await confirm({
        title: t("garageInput.confirmTitle"),
        message: check.warnings
          .map((warning) =>
            t(warning.key, {
              value: money(warning.params.value),
              remaining: money(warning.params.remaining),
            }),
          )
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
      const updated = await engineDB.addCarContribution(car.id, { amount: value, date });
      trackEvent("aporte_registrado", { carId: car.id });
      onSaved?.(updated);
      setAmount("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // A lixeira fica colada ao valor, numa lista feita para o polegar: apagar
  // pede confirmação, e a recusa do servidor aparece em vez de sumir numa
  // rejeição não tratada.
  const remove = async (entry) => {
    const ok = await confirm({
      title: t("garageInput.deleteContributionTitle"),
      message: t("garageInput.deleteContributionBody", {
        value: money(entry.amount),
        date: new Date(`${entry.date}T12:00:00`).toLocaleDateString(i18n.language),
      }),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;

    setSaving(true);
    setError("");
    try {
      const updated = await engineDB.removeCarContribution(car.id, entry.id);
      if (updated) onSaved?.(updated);
    } catch (err) {
      setError(err?.message || t("garageInput.deleteError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="engine-modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("contribution.title")}
        className="engine-modal-panel engine-pop sm:max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--engine-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
              <PiggyBank size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black text-[var(--engine-text)]">
                {t("contribution.title")}
              </h2>
              <p className="truncate text-xs text-[var(--engine-text-muted)]">
                {car.brand} {car.model}
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

        {/* `engine-modal-body` em vez de `max-h-[70vh]`: no celular o painel
            é a tela inteira e o rolável parava a 70% dela (13/09/2026). */}
        <div className="engine-modal-body engine-scroll engine-safe-bottom space-y-5 px-5 py-5">
          {forecast && (
            <div className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
                <TrendingUp size={13} className="text-[var(--engine-accent)]" />
                {t("contribution.forecastTitle")}
              </p>
              <p className="mt-2 text-sm font-bold text-[var(--engine-text)]">
                {t("contribution.forecastBody", {
                  date: forecast.date.toLocaleDateString(i18n.language, {
                    month: "long",
                    year: "numeric",
                  }),
                  pace: money(forecast.pace),
                })}
              </p>
            </div>
          )}

          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-3 min-[420px]:grid-cols-2 sm:col-span-2">
              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]">
                  {t("contribution.amount")}
                </span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="500"
                  className="w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-2.5 text-sm text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]">
                  {t("contribution.date")}
                </span>
                <input
                  type="date"
                  value={date}
                  max={today()}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-2.5 text-sm text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]"
                />
              </label>
            </div>

            {error && (
              <p className="text-xs font-semibold text-[var(--engine-accent)] sm:col-span-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-xs font-black uppercase tracking-widest text-white transition hover:brightness-95 disabled:opacity-60 sm:col-span-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {t("contribution.save")}
            </button>
          </form>

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
              {t("contribution.historyTitle")}
            </p>

            {contributions.length ? (
              <ul className="space-y-1.5">
                {contributions.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--engine-border)] px-3.5 py-2.5"
                  >
                    <span className="text-xs font-medium text-[var(--engine-text-muted)]">
                      {new Date(`${entry.date}T12:00:00`).toLocaleDateString(i18n.language)}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm font-black tabular-nums text-[var(--engine-text)]">
                        {money(entry.amount)}
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
                {t("contribution.historyEmpty")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
