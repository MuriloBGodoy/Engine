import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

/**
 * O menu "..." — o mesmo em todo lugar.
 *
 * Nasceu no cartão do post, para tirar da barra de ícones as ações raras
 * (copiar link, arquivar, remover) que a deixavam pesada. Saiu de
 * `Community.jsx` em 06/11/2026 porque o perfil passou a precisar do mesmo
 * gesto: nas redes, o "..." do canto é onde mora o que é seu e não é vitrine
 * — arquivadas, salvos, curtidas.
 *
 * `items`: `[{ label, icon, onClick, danger? }]`. Sem item nenhum, não
 * desenha botão: menu vazio é pior que menu ausente.
 */
export function PostMenu({ items, label, align = "right", triggerClass = "" }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClass || "-m-1.5 flex h-11 w-11 items-center justify-center rounded-full text-[var(--engine-text-subtle)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] sm:m-0 sm:h-8 sm:w-8"}
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <>
          {/* Camada de saída: um clique em qualquer lugar fecha o menu. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div
            role="menu"
            className={`engine-pop absolute top-full z-40 mt-1.5 w-52 overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] shadow-[var(--engine-shadow-lg)] ${
              align === "left" ? "left-0" : "right-0"
            }`}
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px] font-semibold transition-colors hover:bg-[var(--engine-surface-2)] ${
                    item.danger ? "text-[var(--engine-accent)]" : "text-[var(--engine-text)]"
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
