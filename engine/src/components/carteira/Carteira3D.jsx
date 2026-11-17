import { useEffect, useRef, useState } from "react";

/**
 * O palco 3D da carteira: ela entra girando e você pode virar com o dedo.
 *
 * Três decisões que não são enfeite:
 *
 *  - **O giro mora AQUI, não no cartão.** O `transform` fica num invólucro,
 *    e o cartão lá dentro continua reto. É isso que faz o PNG salvo sair
 *    quadrado: quem fotografa aponta para o cartão, não para o palco. Se o
 *    giro estivesse no próprio cartão, a imagem salva sairia torta — e
 *    salvar é metade da graça da carteira.
 *  - **O brilho segue o giro.** Uma faixa de luz atravessa o cartão na
 *    direção contrária à inclinação, como acontece com plástico de verdade
 *    debaixo de uma lâmpada. Sem isso o 3D parece um papel dobrado: é o
 *    reflexo que conta que aquilo tem superfície.
 *  - **Quem pediu para não ter animação não tem.** Com `prefers-reduced-
 *    motion` a carteira aparece parada e de frente, e arrastar não gira. Não
 *    é um ajuste escondido: é o que o sistema da pessoa já respondeu.
 *
 * O giro é limitado a ±16° porque passando disso o cartão fica ilegível de
 * lado — e o ponto é olhar a carteira, não fazer cambalhota com ela.
 */

const LIMITE = 16;

export function Carteira3D({ children, ativo = true }) {
  const palco = useRef(null);
  const inicio = useRef(null);

  const parado =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [giro, setGiro] = useState({ x: 0, y: 0 });
  const [arrastando, setArrastando] = useState(false);
  // Já "entrou" quando não há animação a rodar — assim o efeito abaixo não
  // precisa corrigir o estado logo depois do primeiro desenho.
  const [entrou, setEntrou] = useState(() => !ativo || parado);

  // A entrada: um giro curto que mostra que o cartão tem lados, e para. Não
  // se repete quando a pessoa volta de "ajustar" para "ver" — a carteira
  // chega uma vez, e repetir a chegada a cada toque cansaria.
  useEffect(() => {
    if (!ativo || parado) return undefined;
    const id = window.setTimeout(() => setEntrou(true), 1100);
    return () => window.clearTimeout(id);
  }, [ativo, parado]);

  const mover = (evento) => {
    if (!inicio.current || parado) return;
    const caixa = palco.current?.getBoundingClientRect();
    if (!caixa?.width) return;
    // Arrastar a largura inteira do cartão gira o limite todo: o gesto tem
    // a escala do objeto, não um número mágico de pixels.
    const dx = (evento.clientX - inicio.current.x) / caixa.width;
    const dy = (evento.clientY - inicio.current.y) / caixa.height;
    setGiro({
      y: Math.max(-LIMITE, Math.min(LIMITE, inicio.current.gy + dx * LIMITE * 2.2)),
      x: Math.max(-LIMITE, Math.min(LIMITE, inicio.current.gx - dy * LIMITE * 2.2)),
    });
  };

  const comecar = (evento) => {
    // Desligado quando a pessoa está ajeitando a foto de fundo: ali o mesmo
    // arrasto move a foto, e os dois gestos não podem disputar o dedo.
    if (!ativo || parado || (evento.button != null && evento.button !== 0)) return;
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
    inicio.current = { x: evento.clientX, y: evento.clientY, gx: giro.x, gy: giro.y };
    setArrastando(true);
    setEntrou(true);
  };

  const terminar = () => {
    inicio.current = null;
    setArrastando(false);
  };

  // Enquanto a entrada roda, quem manda é a animação do CSS; depois dela o
  // transform em linha assume. Os dois no mesmo elemento brigariam.
  const estilo = entrou
    ? {
        transform: `rotateX(${giro.x}deg) rotateY(${giro.y}deg)`,
        transition: arrastando ? "none" : "transform .5s cubic-bezier(.22,.8,.3,1)",
      }
    : undefined;

  return (
    <div
      ref={palco}
      className="engine-carteira-palco"
      onPointerDown={comecar}
      onPointerMove={mover}
      onPointerUp={terminar}
      onPointerCancel={terminar}
      onDoubleClick={() => setGiro({ x: 0, y: 0 })}
    >
      <div
        className={`engine-carteira-3d${entrou ? "" : " engine-carteira-entrada"}`}
        style={estilo}
        // O brilho lê a inclinação daqui para saber para onde correr.
        data-giro-x={Math.round(giro.x)}
        data-giro-y={Math.round(giro.y)}
      >
        {children}
        <span
          aria-hidden="true"
          className="engine-carteira-brilho"
          style={{
            // Contrário ao giro: inclinou para a direita, a luz corre para a
            // esquerda, como num plástico debaixo de uma lâmpada parada.
            transform: `translateX(${-giro.y * 2.4}%) translateY(${giro.x * 1.6}%)`,
            opacity: Math.min(0.55, 0.12 + (Math.abs(giro.x) + Math.abs(giro.y)) / 44),
          }}
        />
      </div>
    </div>
  );
}
