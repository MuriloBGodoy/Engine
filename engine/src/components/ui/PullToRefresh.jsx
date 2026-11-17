import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "../../services/i18n-editing";

/**
 * Puxar para baixo no topo e soltar para atualizar.
 *
 * O gesto que toda rede tem e que o Engine não tinha: quem chega no topo da
 * lista e puxa espera conteúdo novo, e sem isso a única saída é recarregar a
 * página inteira — que no app instalado nem botão tem.
 *
 * As decisões que fazem ele não atrapalhar:
 *
 *  - **Só começa com a página no topo.** `scrollY > 0` significa que a pessoa
 *    está lendo, e puxar ali é rolagem normal.
 *  - **Só com um dedo e só na vertical.** Dois dedos é zoom; arrasto mais
 *    horizontal que vertical é a tira de cartões que rola de lado. Qualquer
 *    um dos dois cancela o gesto em vez de disputá-lo.
 *  - **Resistência depois do limite.** Passando dos 72px o dedo continua
 *    andando e o conteúdo anda pela metade, que é o que dá a sensação de
 *    elástico — sem isso a tela desliza junto e parece quebrada.
 *  - **O navegador não pode fazer o mesmo ao mesmo tempo.** O Chrome do
 *    Android tem o próprio "puxar para atualizar"; os dois juntos recarregam
 *    o app inteiro no meio do gesto. Quem desliga é o
 *    `overscroll-behavior-y: contain` no `html` (ver index.css), e é por isso
 *    que ele está lá.
 *  - **Nada de arrastar enquanto atualiza.** Soltou, o indicador fica preso
 *    no lugar até a leitura terminar — puxar de novo no meio dispararia duas
 *    leituras pelo mesmo motivo.
 */

const LIMITE = 72;
const TETO = 128;

export function PullToRefresh({ onRefresh, children, disabled = false, className = "" }) {
  const { t } = useTranslation();
  const [puxada, setPuxada] = useState(0);
  const [atualizando, setAtualizando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const caixa = useRef(null);
  const toque = useRef(null);
  // Os ouvintes são registrados uma vez só; é daqui que eles leem a distância
  // atual, em vez de uma cópia velha presa no fecho.
  const puxadaRef = useRef(0);
  puxadaRef.current = puxada;
  // O estado lido de dentro dos ouvintes, que são registrados uma vez só.
  const estado = useRef({ atualizando: false, disabled: false, onRefresh: null });
  estado.current = { atualizando, disabled, onRefresh };

  const parado =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return undefined;

    const noTopo = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const comecar = (evento) => {
      if (estado.current.disabled || estado.current.atualizando) return;
      if (evento.touches.length !== 1 || !noTopo()) return;
      toque.current = { x: evento.touches[0].clientX, y: evento.touches[0].clientY, valendo: null };
      setArrastando(true);
    };

    const mover = (evento) => {
      const inicio = toque.current;
      if (!inicio || evento.touches.length !== 1) return;
      const dy = evento.touches[0].clientY - inicio.y;
      const dx = evento.touches[0].clientX - inicio.x;

      // A primeira dezena de pixels decide de quem é o gesto. Depois de
      // decidido não se volta atrás: trocar de dono no meio faz a tela
      // tremer entre rolar e puxar.
      if (inicio.valendo === null) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        inicio.valendo = dy > 0 && Math.abs(dy) > Math.abs(dx);
        if (!inicio.valendo) {
          toque.current = null;
          setArrastando(false);
          return;
        }
      }

      // Saiu do topo no meio do caminho (rolagem por inércia, âncora): desiste.
      if (!noTopo()) {
        toque.current = null;
        setArrastando(false);
        setPuxada(0);
        return;
      }

      const bruto = Math.max(0, dy);
      const distancia = bruto <= LIMITE ? bruto : LIMITE + (bruto - LIMITE) / 2.6;
      setPuxada(Math.min(TETO, distancia));
    };

    const terminar = async () => {
      const inicio = toque.current;
      toque.current = null;
      setArrastando(false);
      if (!inicio?.valendo) return;

      if (puxadaRef.current < LIMITE) {
        setPuxada(0);
        return;
      }

      setAtualizando(true);
      setPuxada(LIMITE);
      try {
        await estado.current.onRefresh?.();
      } catch (erro) {
        console.warn("[puxar] a atualização falhou.", erro);
      } finally {
        setAtualizando(false);
        setPuxada(0);
      }
    };

    // `passive: true` porque o gesto não cancela nada: quem impede o
    // "puxar para atualizar" do navegador é o CSS, não o JavaScript. Ouvinte
    // não passivo em `touchmove` custa quadro em toda rolagem da página.
    const opcoes = { passive: true };
    alvo.addEventListener("touchstart", comecar, opcoes);
    alvo.addEventListener("touchmove", mover, opcoes);
    alvo.addEventListener("touchend", terminar, opcoes);
    alvo.addEventListener("touchcancel", terminar, opcoes);
    return () => {
      alvo.removeEventListener("touchstart", comecar);
      alvo.removeEventListener("touchmove", mover);
      alvo.removeEventListener("touchend", terminar);
      alvo.removeEventListener("touchcancel", terminar);
    };
  }, []);

  const progresso = Math.min(1, puxada / LIMITE);
  const pronto = puxada >= LIMITE;

  return (
    <div ref={caixa} className={className}>
      {/* O indicador vive numa faixa de altura zero e aparece DENTRO do
          espaço que a puxada abriu — assim nada da página se mexe quando
          ninguém está puxando. */}
      <div
        aria-hidden={puxada === 0}
        className="pointer-events-none relative z-10 flex items-center justify-center overflow-hidden"
        style={{
          height: `${puxada}px`,
          // Segue o dedo sem suavizar; ao soltar, recolhe com animação.
          transition: arrastando ? "none" : "height .28s cubic-bezier(.22,.8,.3,1)",
        }}
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface)] shadow-[var(--engine-shadow-sm)]"
          style={{ opacity: Math.min(1, progresso * 1.4), transform: `scale(${0.7 + progresso * 0.3})` }}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-[18px] w-[18px] ${atualizando && !parado ? "motion-safe:animate-spin" : ""}`}
            style={atualizando ? undefined : { transform: `rotate(${progresso * 270}deg)` }}
          >
            {/* O arco cresce com a puxada: antes do limite ele é um pedaço,
                no limite fecha. Dá para ver que falta pouco sem ler nada. */}
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="var(--engine-border-strong)" strokeWidth="2.2" />
            <circle
              cx="12"
              cy="12"
              r="8.5"
              fill="none"
              stroke="var(--engine-accent)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray={`${(atualizando ? 0.25 : progresso) * 53.4} 53.4`}
              transform="rotate(-90 12 12)"
            />
          </svg>
        </span>
        <span className="sr-only" role="status">
          {atualizando
            ? t("pullToRefresh.loading")
            : pronto
              ? t("pullToRefresh.release")
              : t("pullToRefresh.pull")}
        </span>
      </div>

      {children}
    </div>
  );
}
