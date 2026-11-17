import { useRef, useState } from "react";

/**
 * A alça de arrastar para fechar, para os modais de tela cheia do celular.
 *
 * O `BottomSheet` já fecha arrastando desde que nasceu; os ~20 modais que
 * usam `.engine-modal-overlay` não — neles o único jeito de sair era achar o
 * X no canto. No celular isso é o contrário do gesto que a pessoa já tem no
 * dedo: em qualquer app, folha que subiu desce puxando.
 *
 * Cada modal ganha isto com UMA linha, como primeiro filho do painel:
 *
 *     <div className="engine-modal-panel">
 *       <DragHandle onClose={onClose} />
 *       …
 *
 * Por que a alça mexe no painel pelo DOM em vez de devolver um `style` para
 * o modal aplicar: do outro jeito cada um dos vinte teria que ganhar estado,
 * `style` no painel e handlers na casca — vinte chances de errar, e um
 * `transform` fora de hora no modal errado é tela em branco. Assim o
 * componente é autocontido: ele acha o próprio painel (`closest`), mexe só
 * no `transform` enquanto o dedo está na tela e devolve tudo como estava ao
 * soltar. Nenhum modal precisa saber que ele existe.
 *
 * Só no celular. A partir de 640px o painel vira caixa centralizada, onde
 * não há borda de baixo para puxar e o X está logo ali.
 */
export function DragHandle({ onClose, enabled = true, className = "" }) {
  const ref = useRef(null);
  const arrasto = useRef(null);
  const [puxando, setPuxando] = useState(false);

  const painel = () => ref.current?.closest(".engine-modal-panel") || null;

  const soltarPainel = (alvo, comTransicao) => {
    if (!alvo) return;
    alvo.style.transition = comTransicao ? "transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)" : "";
    alvo.style.transform = "";
    if (comTransicao) {
      window.setTimeout(() => {
        if (alvo.style.transform === "") alvo.style.transition = "";
      }, 240);
    }
  };

  const comecar = (evento) => {
    if (!enabled) return;
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    const alvo = painel();
    if (!alvo) return;
    arrasto.current = { y: evento.clientY, quando: Date.now(), alvo };
    alvo.style.transition = "none";
    setPuxando(true);
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
  };

  const mover = (evento) => {
    const atual = arrasto.current;
    if (!atual) return;
    // Só para baixo: puxar para cima não estica o painel.
    const delta = Math.max(0, evento.clientY - atual.y);
    atual.alvo.style.transform = delta ? `translateY(${delta}px)` : "";
  };

  const soltar = (evento) => {
    const atual = arrasto.current;
    if (!atual) return;
    arrasto.current = null;
    setPuxando(false);
    evento.currentTarget.releasePointerCapture?.(evento.pointerId);
    const delta = evento.clientY - atual.y;
    const tempo = Date.now() - atual.quando;
    // Os mesmos números do BottomSheet, para o gesto ser um só no app todo:
    // passou de 96px fecha, ou foi um peteleco curto e rápido.
    const peteleco = tempo < 260 && delta > 36;
    if (delta > 96 || peteleco) {
      soltarPainel(atual.alvo, false);
      onClose?.();
      return;
    }
    soltarPainel(atual.alvo, true);
  };

  return (
    <div
      ref={ref}
      onPointerDown={comecar}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      aria-hidden="true"
      className={`shrink-0 touch-none pb-1 pt-2.5 sm:hidden ${
        puxando ? "cursor-grabbing" : "cursor-grab"
      } ${className}`}
    >
      <span className="mx-auto block h-1 w-10 rounded-full bg-[var(--engine-border-strong)]" />
    </div>
  );
}
