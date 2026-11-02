import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, Store, X } from "lucide-react";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";

/**
 * Peças de tela da conta profissional e de Lojas. Versão funcional, nos
 * tokens --engine-*: o Jesse redesenha por cima. Cada passo dos formulários
 * é um componente próprio (components/pro/steps, components/shops/steps) e
 * recebe só `value` + `onChange` — dá para trocar o visual sem tocar na
 * lógica de salvar.
 */

export function Sheet({ title, eyebrow = "", onClose, children, footer = null, wide = false, labelId = "pro-sheet-title" }) {
  const { t } = useTranslation();
  useHistoryDismiss(true, onClose);
  return createPortal(
    <div className="engine-modal-overlay sm:items-center sm:p-5" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(event) => event.stopPropagation()}
        className={`engine-modal-panel engine-pop ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--engine-border)] px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-2">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--engine-accent)]">{eyebrow}</p>
            )}
            <h2 id={labelId} className="truncate text-base font-bold text-[var(--engine-text)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={20} />
          </button>
        </header>
        <div className="engine-modal-body engine-scroll space-y-5 px-4 py-4 sm:px-5">{children}</div>
        {footer && (
          <footer className="engine-safe-bottom flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--engine-border)] px-4 pb-3 pt-3 sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function FieldLabel({ htmlFor, label, hint = "", optional = false, children }) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-xs font-bold text-[var(--engine-text)]">
        {label}
        {optional && <span className="font-medium text-[var(--engine-text-subtle)]">{t("pro.optional")}</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] font-medium leading-4 text-[var(--engine-text-subtle)]">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2.5 text-sm font-medium text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]";

export function TextField({ id, label, value, onChange, hint, optional, maxLength = 120, ...rest }) {
  return (
    <FieldLabel htmlFor={id} label={label} hint={hint} optional={optional}>
      <input
        id={id}
        value={value ?? ""}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} min-h-11`}
        {...rest}
      />
    </FieldLabel>
  );
}

export function TextAreaField({ id, label, value, onChange, hint, optional, maxLength = 500, rows = 4, ...rest }) {
  return (
    <FieldLabel htmlFor={id} label={label} hint={hint} optional={optional}>
      <textarea
        id={id}
        value={value ?? ""}
        maxLength={maxLength}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} resize-none leading-6`}
        {...rest}
      />
    </FieldLabel>
  );
}

export function SelectField({ id, label, value, onChange, options, hint, optional }) {
  return (
    <FieldLabel htmlFor={id} label={label} hint={hint} optional={optional}>
      <select id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value)} className={`${inputClass} min-h-11`}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldLabel>
  );
}

export function Toggle({ id, label, hint = "", checked, onChange }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3">
      <input
        id={id}
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--engine-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[var(--engine-text)]">{label}</span>
        {hint && <span className="mt-0.5 block text-xs font-medium text-[var(--engine-text-muted)]">{hint}</span>}
      </span>
    </label>
  );
}

export function ChoiceChips({ options, value, onChange, label = "" }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition ${
              active
                ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                : "border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)]"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Passo 2 de 4" + barrinha. */
export function StepHeader({ index, total, title }) {
  const { t } = useTranslation();
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--engine-text-subtle)]">
        {t("pro.step", { current: index + 1, total })}
      </p>
      <h3 className="mt-1 text-lg font-extrabold text-[var(--engine-text)]">{title}</h3>
      <div className="mt-3 flex gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, step) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full ${step <= index ? "bg-[var(--engine-accent)]" : "bg-[var(--engine-surface-2)]"}`}
          />
        ))}
      </div>
    </div>
  );
}

export function PrimaryButton({ children, busy = false, className = "", ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50 ${className}`}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function GhostButton({ children, className = "", ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Logo/foto redonda com iniciais quando não há imagem. */
export function ProAvatar({ src = "", name = "", size = 48, square = false }) {
  const initials = String(name || "")
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-[var(--engine-accent)] text-sm font-bold text-white ${
        square ? "rounded-xl" : "rounded-full"
      }`}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials || <Store size={size / 2.5} aria-hidden="true" />}
    </span>
  );
}

/** Botão de escolher foto (o upload e a limpeza de EXIF são de quem chama). */
export function PhotoPickButton({ id, label, busy = false, onFiles, multiple = false }) {
  return (
    <label
      htmlFor={id}
      className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--engine-border)] px-4 text-xs font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
    >
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
      {label}
      <input
        id={id}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}
