import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Undo2 } from "lucide-react";
import { dentro, pixelarRegioes, regiaoEntre, regiaoVale } from "../services/pixelar";
import "../services/i18n-editing";

/**
 * "Esconder a placa" — a superfície onde a pessoa arrasta por cima do que não
 * quer mostrar.
 *
 * Três decisões:
 *
 *  - **O que aparece na tela é o resultado de verdade.** Cada mudança redesenha
 *    a foto inteira e pixela as regiões no canvas de preview, com a mesma
 *    conta do arquivo final. Mostrar uma tarja cinza "que vira mosaico depois"
 *    seria pedir fé num lugar onde a pessoa está decidindo o que o mundo vai
 *    ver do documento do carro dela.
 *  - **Arrastar cria, tocar apaga.** Sem alças de redimensionar, sem modo de
 *    seleção: dois gestos, e refazer custa um segundo. Alça de 8 px num dedo
 *    de 1 cm não funciona.
 *  - **Nada é obrigatório.** Quem não arrastar nada sai com a foto intacta.
 *
 * As regiões saem daqui em coordenadas normalizadas (0..1) e é quem salva que
 * aplica no canvas em tamanho cheio — ver `services/pixelar.js`.
 */
export function PlateHider({ src, regioes, onChange }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const baseRef = useRef(null);
  const [pronto, setPronto] = useState(false);
  // O retângulo que está sendo arrastado agora (ou null).
  const [rascunho, setRascunho] = useState(null);
  const inicio = useRef(null);
  const arrastou = useRef(false);

  // A foto entra uma vez; o preview é redesenhado a partir dela.
  useEffect(() => {
    if (!src) return;
    let vivo = true;
    const img = new Image();
    img.onload = () => {
      if (!vivo) return;
      baseRef.current = img;
      setPronto(true);
    };
    img.src = src;
    return () => {
      vivo = false;
    };
  }, [src]);

  // Redesenha: foto + regiões salvas + a que está sendo arrastada.
  useEffect(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!pronto || !canvas || !base) return;
    // Preview com teto de 1200 px no lado maior: o arquivo final sai do
    // canvas cheio, aqui só se olha.
    const escala = Math.min(1, 1200 / Math.max(base.naturalWidth, base.naturalHeight));
    canvas.width = Math.max(1, Math.round(base.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(base.naturalHeight * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    const todas = rascunho && regiaoVale(rascunho) ? [...regioes, rascunho] : regioes;
    pixelarRegioes(canvas, todas);
  }, [pronto, regioes, rascunho]);

  /** Onde o dedo está, em 0..1 sobre a foto. */
  const ponto = (evento) => {
    const caixa = canvasRef.current?.getBoundingClientRect();
    if (!caixa || !caixa.width || !caixa.height) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (evento.clientX - caixa.left) / caixa.width)),
      y: Math.max(0, Math.min(1, (evento.clientY - caixa.top) / caixa.height)),
    };
  };

  const comecar = (evento) => {
    // Só o toque principal: dois dedos na tela é gesto de zoom do navegador.
    if (evento.button != null && evento.button !== 0) return;
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
    inicio.current = ponto(evento);
    arrastou.current = false;
    setRascunho(null);
  };

  const mover = (evento) => {
    if (!inicio.current) return;
    const agora = ponto(evento);
    const caixa = regiaoEntre(inicio.current, agora);
    if (caixa.w > 0.01 || caixa.h > 0.01) arrastou.current = true;
    setRascunho(caixa);
  };

  const terminar = (evento) => {
    const partida = inicio.current;
    inicio.current = null;
    const atual = rascunho;
    setRascunho(null);
    if (!partida) return;

    // Arrastou: nova região, se tiver tamanho.
    if (arrastou.current) {
      if (atual && regiaoVale(atual)) onChange([...regioes, atual]);
      return;
    }

    // Só tocou: apaga a região mais recente sob o dedo (a de cima na pilha).
    const alvo = ponto(evento);
    for (let i = regioes.length - 1; i >= 0; i -= 1) {
      if (dentro(regioes[i], alvo)) {
        onChange(regioes.filter((_, indice) => indice !== i));
        return;
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-[var(--engine-border)] bg-black">
        <canvas
          ref={canvasRef}
          onPointerDown={comecar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={() => {
            inicio.current = null;
            setRascunho(null);
          }}
          // `touch-none`: sem isto, arrastar na foto rola a página no celular
          // e nenhum retângulo é desenhado.
          className="block w-full touch-none select-none"
        />
      </div>

      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] leading-4 text-[var(--engine-text-muted)]">
          {regioes.length === 0 ? t("plateHider.hint") : t("plateHider.hintTap")}
        </p>
        {regioes.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(regioes.slice(0, -1))}
            className="flex min-h-11 shrink-0 items-center gap-1.5 text-[12.5px] font-bold text-[var(--engine-accent-text)]"
          >
            <Undo2 size={14} />
            {t("plateHider.undo")}
          </button>
        )}
      </div>
    </div>
  );
}
