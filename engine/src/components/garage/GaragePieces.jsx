import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";

/**
 * Peças da Garagem 2.0 (aprovada pelo Murilo em 01/11/2026), divididas entre
 * o card e a página do carro. Protótipo e referências em
 * `ui designs/2026-11-01-garagem-upgrade/`.
 */

/**
 * Anel de progresso da meta. SVG em vez de `conic-gradient` com estilo
 * inline: o tamanho vem por classe e a fração por atributo.
 */
export function ProgressRing({ value, label, className = "h-12 w-12", textClassName = "text-[11px]" }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, Number(value) || 0));
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="5" className="stroke-[var(--engine-surface-2)]" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${fraction * circumference} ${circumference}`}
          className="stroke-[var(--engine-accent)] transition-[stroke-dasharray] duration-700 motion-reduce:transition-none"
        />
      </svg>
      <span className={`relative font-extrabold tabular-nums text-[var(--engine-text)] ${textClassName}`}>{label}</span>
    </span>
  );
}

/**
 * Faixa dos últimos 12 meses de aporte: cheio = entrou dinheiro naquele mês.
 * Constância visível, que é o que faz a pessoa voltar no mês seguinte.
 */
export function MonthStrip({ months, locale, showLabels = false, className = "" }) {
  const { t } = useTranslation();
  const short = (month) =>
    new Intl.DateTimeFormat(locale, { month: "narrow", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
  return (
    <div className={className}>
      <ol aria-label={t("garageV2.card.monthsLabel")} className="grid grid-cols-12 gap-1">
        {months.map((entry, index) => {
          const current = index === months.length - 1;
          return (
            <li
              key={entry.month}
              title={entry.month}
              className={`h-2 rounded-full ${
                entry.amount > 0
                  ? "bg-[var(--engine-accent)]"
                  : current
                    ? "border border-dashed border-[var(--engine-border-strong)]"
                    : "bg-[var(--engine-surface-2)]"
              }`}
            >
              <span className="sr-only">
                {entry.month}: {entry.amount > 0 ? t("garageV2.card.monthWith") : t("garageV2.card.monthWithout")}
              </span>
            </li>
          );
        })}
      </ol>
      {showLabels && (
        <div aria-hidden="true" className="mt-1 grid grid-cols-12 gap-1 text-center text-[10px] font-bold uppercase text-[var(--engine-text-muted)]">
          {months.map((entry) => (
            <span key={entry.month}>{short(entry.month)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Número pequeno com rótulo — célula das linhas de stats. */
export function Stat({ value, unit, label, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="truncate text-[15px] font-extrabold tabular-nums leading-tight text-[var(--engine-text)]">
        {value}
        {unit && value !== "—" ? (
          <span className="ml-0.5 text-[11px] font-bold text-[var(--engine-text-muted)]">{unit}</span>
        ) : null}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--engine-text-muted)]">{label}</p>
    </div>
  );
}

/**
 * Menu "..." do carro. A lixeira saiu de cima da foto: ação destrutiva não
 * merece mais destaque que abrir o carro. Fecha por Esc e por toque fora.
 *
 * Sem `useHistoryDismiss` de propósito: todo item do menu abre outra coisa
 * (modal com a própria entrada no histórico, ou outra rota). O `back()` de
 * limpeza do menu chegaria depois da entrada nova e deixaria uma entrada
 * fantasma — o "voltar que não faz nada" que o hook existe para evitar.
 */
export function CarMenu({ items, label, tone = "glass", className = "" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = items.filter(Boolean);
  if (!visible.length) return null;

  return (
    // `className` posiciona (absolute no card); o menu ancora no div de dentro.
    <div className={className} onClick={(event) => event.stopPropagation()}>
      <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center"
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
            tone === "glass"
              ? "bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
              : "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
          }`}
        >
          <MoreHorizontal size={16} />
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="engine-pop absolute right-1 top-11 z-30 min-w-44 overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] py-1 shadow-[var(--engine-shadow-lg)]"
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.run();
              }}
              className={`flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-semibold transition-colors hover:bg-[var(--engine-surface-2)] ${
                item.danger ? "text-[var(--engine-accent)]" : "text-[var(--engine-text)]"
              }`}
            >
              {item.Icon ? <item.Icon size={15} aria-hidden="true" /> : null}
              {item.label}
            </button>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
