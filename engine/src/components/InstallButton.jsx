import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MonitorDown } from "lucide-react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { InstallCard } from "./InstallPrompt";

const OPEN_DELAY = 150;  // passar o mouse por cima a caminho de outro lugar não abre
const CLOSE_DELAY = 250; // dá tempo de levar o mouse do botão até o balão
const GAP = 8;
const CARD_WIDTH = 320;

/**
 * Botão "Instalar app": sempre à mão, ao contrário do convite automático (que
 * só aparece na 2ª visita e some por 30 dias quando fechado). Passar o mouse
 * abre, ao lado do botão, o mesmo cartão do convite; no toque, abre no clique.
 * Só existe quando o navegador permite instalar, e some depois de instalado.
 *
 * - `topnav`: ícone redondo no header; o balão abre embaixo, alinhado à direita.
 * - `sidebar`: linha no estilo dos itens do menu; o balão abre à direita da
 *   barra, alinhado pela base.
 *
 * O balão vai para um portal no `body`: a sidebar tem `overflow` e cortaria o
 * cartão, e o header usa `backdrop-filter`, que muda a referência do
 * `position: fixed` (mesma armadilha documentada no GuestLoginHint).
 */
export function InstallButton({ variant = "topnav", collapsed = false }) {
  const { t } = useTranslation();
  const { canInstall } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const timer = useRef(null);

  const schedule = (next, delay) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), delay);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return undefined;
    const place = () => {
      const rect = buttonRef.current.getBoundingClientRect();
      const left =
        variant === "sidebar"
          ? rect.right + GAP
          : Math.max(GAP, rect.right - CARD_WIDTH);
      setPosition(
        variant === "sidebar"
          ? { left, bottom: window.innerHeight - rect.bottom }
          : { left, top: rect.bottom + GAP },
      );
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, variant]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!canInstall) return null;

  const hoverProps = {
    onMouseEnter: () => schedule(true, OPEN_DELAY),
    onMouseLeave: () => schedule(false, CLOSE_DELAY),
  };

  const label = t("pwa.installButton");
  const button =
    variant === "sidebar" ? (
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={label}
        className={`flex h-11 w-full items-center rounded-xl text-[14px] font-medium transition-colors ${
          collapsed ? "mx-auto w-11 justify-center" : "gap-3 px-3"
        } ${
          open
            ? "bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
            : "text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
        }`}
        {...hoverProps}
      >
        <MonitorDown size={20} className="shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
    ) : (
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={label}
        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
          open
            ? "bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
            : "text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
        }`}
        {...hoverProps}
      >
        <MonitorDown size={20} />
      </button>
    );

  return (
    <>
      {button}
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-label={t("pwa.installTitle")}
            className="fixed z-[210]"
            style={{ ...position, width: CARD_WIDTH, maxWidth: `calc(100vw - ${GAP * 2}px)` }}
            {...hoverProps}
          >
            <InstallCard
              source={variant}
              onClose={() => setOpen(false)}
              onInstalled={() => setOpen(false)}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
