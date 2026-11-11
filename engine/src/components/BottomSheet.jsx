import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

/**
 * Folha de baixo — a camada de escolha do celular.
 *
 * Até aqui toda escolha do app abria um modal centralizado, que no celular
 * pede mira: o alvo fica no meio da tela, longe do polegar, e para fechar é
 * preciso achar o X. A folha sobe de baixo, fica debaixo da mão, fecha
 * arrastando e deixa uma faixa da página aparecendo em cima — quem abriu sem
 * querer vê que não saiu de lugar nenhum.
 *
 * Serve anexar no chat, filtrar serviço, ordenar, criar e compartilhar. É um
 * componente só porque são cinco telas com o mesmo gesto; se cada tela fizer
 * o seu, elas divergem no primeiro ajuste.
 *
 * No computador a mesma folha vira caixa centralizada (ver `.engine-sheet` no
 * index.css): lá não existe polegar nem borda de baixo, e o conteúdo é o
 * mesmo.
 *
 * Arrastar para fechar: o gesto só vale puxando PARA BAIXO e só a partir da
 * alça ou do cabeçalho — se valesse no corpo inteiro, rolar uma lista de
 * categorias fecharia a folha sem querer. Passou de 96px (ou saiu rápido),
 * fecha; não passou, volta sozinho para o lugar.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  /** Nome da folha para quem usa leitor de tela, quando não há título visível. */
  ariaLabel,
  /** Rodapé fixo, que não rola com o conteúdo (ex.: "Ver 23 resultados"). */
  footer = null,
  /** Ação discreta no canto do cabeçalho (ex.: "limpar"). */
  headerAction = null,
  /** Sem cabeçalho visível: a folha é só uma grade de ações. */
  bare = false,
  className = "",
  children,
}) {
  const { t } = useTranslation();
  const panelRef = useRef(null);
  const voltarFocoPara = useRef(null);
  const arrasto = useRef(null);
  const [puxado, setPuxado] = useState(0);

  const fechar = useCallback(() => {
    setPuxado(0);
    onClose?.();
  }, [onClose]);

  // Tecla Esc e trava de rolagem do fundo. A trava usa `overflow` no body
  // porque `position: fixed` no body faz a página saltar para o topo quando
  // a folha fecha — e no chat isso tira a pessoa da última mensagem.
  useEffect(() => {
    if (!open) return undefined;
    voltarFocoPara.current = document.activeElement;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const aoTeclar = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        fechar();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    const foco = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", aoTeclar);
      cancelAnimationFrame(foco);
      const volta = voltarFocoPara.current;
      if (volta && typeof volta.focus === "function") volta.focus();
    };
  }, [open, fechar]);

  // Zera o arrasto quando a folha abre ou fecha. Ajuste durante a renderização
  // (o padrão do React para estado derivado de prop) e não num efeito: o
  // efeito renderizaria uma vez com a folha ainda deslocada do arrasto
  // anterior, e o eslint do projeto barra setState dentro de efeito.
  const [abertoAntes, setAbertoAntes] = useState(open);
  if (abertoAntes !== open) {
    setAbertoAntes(open);
    if (puxado) setPuxado(0);
  }

  const comecarArrasto = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    arrasto.current = { y: event.clientY, quando: Date.now() };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const arrastando = (event) => {
    if (!arrasto.current) return;
    const delta = event.clientY - arrasto.current.y;
    // Só para baixo: puxar para cima não estica a folha.
    setPuxado(delta > 0 ? delta : 0);
  };

  const soltar = (event) => {
    if (!arrasto.current) return;
    const delta = event.clientY - arrasto.current.y;
    const tempo = Date.now() - arrasto.current.quando;
    arrasto.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const rapido = tempo < 260 && delta > 36;
    if (delta > 96 || rapido) fechar();
    else setPuxado(0);
  };

  if (!open) return null;

  const rotulo = title || ariaLabel || t("common.options");

  return createPortal(
    <div
      className="engine-sheet-scrim"
      onClick={fechar}
      data-testid="bottom-sheet-scrim"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={puxado ? { transform: `translateY(${puxado}px)`, transition: "none" } : undefined}
        className={`engine-sheet outline-none ${className}`}
      >
        <div
          onPointerDown={comecarArrasto}
          onPointerMove={arrastando}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
        >
          <div className="flex justify-center pb-1 pt-2.5">
            <span className="h-1 w-10 rounded-full bg-[var(--engine-border-strong)]" />
          </div>
          {!bare && (
            <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-1">
              <h2 className="min-w-0 truncate text-[15px] font-extrabold tracking-tight text-[var(--engine-text)]">
                {rotulo}
              </h2>
              {headerAction}
            </header>
          )}
        </div>

        <div className="engine-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
          {children}
        </div>

        {footer && (
          <div className="engine-safe-bottom shrink-0 border-t border-[var(--engine-border)] px-4 pt-3">
            {footer}
          </div>
        )}
        {!footer && <div className="engine-safe-bottom shrink-0" />}
      </div>
    </div>,
    document.body,
  );
}
