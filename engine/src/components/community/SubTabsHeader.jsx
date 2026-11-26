import { Plus } from "lucide-react";

/**
 * A linha que abre cada área da Comunidade que tem "meus / descobrir":
 * sub-abas à esquerda, botão compacto de criar à direita.
 *
 * Nasceu em 19/09/2026 porque Clubes e Eventos tinham cada um a sua cópia
 * desse desenho, e as cópias divergiam no detalhe — "Meus Clubes" contra
 * "Meus eventos", altura da linha, tamanho do botão. Duas abas vizinhas com
 * o mesmo desenho têm que sair do mesmo lugar; quem precisar de um terceiro
 * "meus / descobrir" usa isto em vez de copiar.
 *
 * O botão mostra só o ícone no celular e o rótulo a partir de `sm`; o
 * `aria-label` leva sempre o rótulo completo. Alvos com 44px de altura
 * (regra do mobile) nas abas e no botão.
 */
export function SubTabsHeader({ tabs, active, onChange, createLabel, onCreate, createShortLabel, tourId = "" }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-1 gap-1 border-b border-[var(--engine-border)]">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`min-h-11 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition ${
              active === id
                ? "border-[var(--engine-accent)] text-[var(--engine-accent)]"
                : "border-transparent text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          data-tour={tourId || undefined}
          aria-label={createLabel}
          className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--engine-accent)] px-4 py-2 font-semibold text-white transition hover:opacity-90"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">{createShortLabel || createLabel}</span>
        </button>
      )}
    </div>
  );
}
