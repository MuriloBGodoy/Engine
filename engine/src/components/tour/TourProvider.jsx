import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CircleHelp, X } from "lucide-react";
import {
  buildJourney,
  clearJourneyProgress,
  journeyProgress,
  markTourSeen,
  nextChapterIndex,
  saveJourneyProgress,
  sectionById,
  sectionForPath,
  tourSeen,
} from "../../services/tour";
import { TOUR_ICONS } from "./tourIcons";
import "../../services/i18n-tour";

/**
 * O tour: um holofote que anda pela tela explicando o que fazer.
 *
 * São dois guias com o mesmo cartão:
 *
 *  - **O guia completo (jornada).** A volta pela plataforma inteira, em
 *    ordem, NAVEGANDO de tela em tela — é ele que aparece na primeira
 *    visita. Tem capítulo, barra de progresso, "pular este capítulo" e
 *    memória de onde a pessoa parou.
 *
 *  - **O tour de uma tela.** Os três ou quatro passos daquela seção, que o
 *    botão de ajuda abre. Não navega: a pessoa já está onde queria.
 *
 * Decisões que não são enfeite:
 *
 *  - **O escuro é UM elemento, não quatro.** O recorte sai de um
 *    `box-shadow` gigante em volta do retângulo do alvo. Quatro divs
 *    (acima, abaixo, esquerda, direita) desalinham um pixel em tela com
 *    zoom, e o risco branco atravessa a tela inteira.
 *
 *  - **Tocar fora fecha o tour de tela, mas NÃO o guia completo.** No tour
 *    curto, sair pelo escuro é atalho; num guia de vinte passos que acabou
 *    de trocar de tela, um toque errado jogaria tudo no lixo. No guia, sair
 *    tem três portas explícitas (X, "Sair do guia" e Esc) — e nenhuma delas
 *    perde o progresso.
 *
 *  - **Nada é obrigatório.** Nenhum passo espera o clique no alvo. Onde a
 *    ação é o ponto, o cartão oferece um atalho ("fazer agora"), guarda o
 *    lugar e sai da frente.
 *
 *  - **Passo com alvo fora da tela vira cartão no meio.** No celular o menu
 *    é a barra de baixo; no computador, a lateral. Nenhum dos dois existe
 *    nas duas larguras, e o guia não pode quebrar por causa disso.
 */

const TourContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useTour() {
  return useContext(TourContext) || {};
}

const MARGEM = 8; // respiro entre o recorte e o alvo
const CARTAO = 340; // largura do cartão no computador
const TENTATIVAS = 30; // ~3,6s esperando o alvo da tela nova aparecer

/**
 * O primeiro alvo VISÍVEL do seletor.
 *
 * `querySelector` sozinho não serve: o mesmo `data-tour` existe duas vezes
 * no app de propósito — "Garagem" é um item da barra de baixo no celular e
 * da lateral no computador, e as duas ficam no DOM o tempo todo (uma delas
 * com `display:none`). A primeira do documento é a escondida, e o holofote
 * acabaria apontando para um retângulo de tamanho zero.
 */
const alvoVisivel = (seletor) => {
  if (!seletor) return null;
  const candidatos = document.querySelectorAll(seletor);
  for (const elemento of candidatos) {
    const r = elemento.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return elemento;
  }
  return null;
};

/**
 * O ancestral que ROLA de verdade.
 *
 * `window.scrollBy` não serve sozinho: no computador quem rola é o `<main>`
 * (a janela fica travada para a lateral não sair da tela), e no celular é a
 * janela. Quem quiser mover a tela precisa saber qual dos dois está no
 * caminho do alvo — e um feed dentro de um painel que rola sozinho é o
 * terceiro caso.
 */
const caixaDeRolagem = (no) => {
  for (let pai = no?.parentElement; pai && pai !== document.body; pai = pai.parentElement) {
    const estilo = window.getComputedStyle(pai);
    if (/(auto|scroll|overlay)/.test(estilo.overflowY) && pai.scrollHeight > pai.clientHeight + 4) {
      return pai;
    }
  }
  return null;
};

/** Elemento que não anda com a rolagem (cabeçalho, barra de baixo, lateral). */
const naoRola = (no) => {
  for (let atual = no; atual && atual !== document.body; atual = atual.parentElement) {
    const posicao = window.getComputedStyle(atual).position;
    if (posicao === "fixed" || posicao === "sticky") return true;
  }
  return false;
};

/**
 * Ajusta a VISÃO antes de falar: o alvo vai para a faixa livre da tela.
 *
 * A faixa é o que sobra entre o cabeçalho fixo e a barra de baixo do
 * celular. Centralizar na janela inteira (o que o `scrollIntoView` faz)
 * deixava o recorte meio escondido atrás de um dos dois — e o guia apontava
 * para uma coisa cortada. Alvo mais alto que a faixa (o feed, a lista de
 * carros) é alinhado pelo topo: o começo dele é o que interessa.
 *
 * O que é fixo ou grudado não se move com rolagem nenhuma; mandar a página
 * rolar por causa deles só embaralharia a tela debaixo do holofote.
 */
const trazerParaAVista = (elemento) => {
  if (!elemento || naoRola(elemento)) return;
  const estreito = window.innerWidth < 1024;
  const faixaTopo = 76;
  const faixaBase = window.innerHeight - (estreito ? 96 : 24);
  const faixaAltura = faixaBase - faixaTopo;
  if (faixaAltura <= 0) return;

  const r = elemento.getBoundingClientRect();
  const desvio =
    r.height >= faixaAltura
      ? r.top - faixaTopo
      : r.top + r.height / 2 - (faixaTopo + faixaAltura / 2);

  // Já está no lugar: mexer a tela à toa é pior que não mexer.
  if (Math.abs(desvio) < 12) return;
  const rolante = caixaDeRolagem(elemento);
  (rolante || window).scrollBy({ top: desvio, behavior: "smooth" });
};

/** Onde o cartão cabe: embaixo do alvo, em cima, ou no meio da tela. */
function posicaoDoCartao(alvo, janela) {
  if (!alvo) return { centro: true };
  const espacoAbaixo = janela.altura - alvo.bottom;
  const espacoAcima = alvo.top;
  const estreito = janela.largura < 640;

  // No celular o cartão ocupa a largura toda e vai para o lado com mais
  // espaço: ficar colado no alvo em tela pequena esconde o próprio alvo.
  if (estreito) {
    // Alvo que ocupa a tela toda (o feed, a lista de carros) não deixa
    // espaço de nenhum lado — e o cartão, empurrado para a beirada, saía
    // pela base com o "Pular este capítulo" cortado. Aí ele vai para o meio.
    if (espacoAbaixo < 230 && espacoAcima < 230) return { centro: true };
    return espacoAbaixo >= espacoAcima
      ? { top: Math.min(alvo.bottom + MARGEM + 6, janela.altura - 240), left: 12, largura: janela.largura - 24 }
      : { bottom: Math.max(janela.altura - alvo.top + MARGEM + 6, 12), left: 12, largura: janela.largura - 24 };
  }

  const left = Math.max(
    12,
    Math.min(alvo.left + alvo.width / 2 - CARTAO / 2, janela.largura - CARTAO - 12),
  );
  if (espacoAbaixo >= 260) return { top: alvo.bottom + MARGEM + 6, left, largura: CARTAO };
  if (espacoAcima >= 260) return { bottom: janela.altura - alvo.top + MARGEM + 6, left, largura: CARTAO };
  return { centro: true };
}

function Holofote({
  passos,
  indice,
  jornada = false,
  onAvancar,
  onVoltar,
  onSair,
  onPularCapitulo,
  onAtalho,
  t,
}) {
  const passo = passos[indice];
  const [caixa, setCaixa] = useState(null);
  const cartaoRef = useRef(null);
  const camadaRef = useRef(null);

  /*
   * Mede o alvo — e insiste até ele existir.
   *
   * No guia completo o passo troca de TELA antes de falar, e no instante em
   * que o índice muda o alvo ainda não está no DOM: a tela nova monta
   * depois. Medir uma vez só fazia o primeiro passo de cada capítulo cair
   * como cartão no meio, sem holofote. Então tenta, espera 120ms, tenta de
   * novo, por uns três segundos e meio — e só então aceita que aquele alvo
   * não existe nesta largura.
   *
   * Remede também quando a tela rola, gira ou muda de tamanho: sem isso o
   * recorte fica num lugar e o cartão em outro assim que o teclado do
   * celular abre ou a barra de endereço recolhe.
   */
  useEffect(() => {
    let vivo = true;
    let relogio = 0;
    let tentativas = 0;
    let rolou = false;

    const medir = (podeRolar) => {
      if (!vivo) return;
      const elemento = alvoVisivel(passo?.target);
      if (!elemento) {
        setCaixa(null);
        if (passo?.target && tentativas < TENTATIVAS) {
          tentativas += 1;
          relogio = window.setTimeout(() => medir(true), 120);
        }
        return;
      }
      // Ajusta a visão uma vez por passo. A medição não espera a rolagem
      // terminar: o ouvinte de `scroll` logo abaixo remede a cada quadro, e
      // o recorte acompanha a tela enquanto ela desliza.
      if (podeRolar && !rolou) {
        rolou = true;
        trazerParaAVista(elemento);
      }
      /*
       * O recorte não passa da janela.
       *
       * Alguns alvos são a COLUNA inteira (o feed, a lista de carros): o
       * retângulo deles tem dois mil pixels de altura, o buraco engole a
       * tela e o escuro some — a pessoa vê o cartão flutuando numa tela
       * normal, como se o guia tivesse bugado. Cortado na janela, o buraco
       * mostra a parte visível da coluna e o resto (a lateral, o trilho da
       * direita) continua escuro, que é o que diz "olhe para cá".
       */
      const r = elemento.getBoundingClientRect();
      const topo = Math.max(r.top, MARGEM + 4);
      const base = Math.min(r.bottom, window.innerHeight - MARGEM - 4);
      const esquerda = Math.max(r.left, MARGEM + 4);
      const direita = Math.min(r.right, window.innerWidth - MARGEM - 4);
      // Alvo que saiu inteiro da tela não vira um risco de altura zero com
      // o escuro fechado em cima dele (era o que parecia o guia quebrando):
      // vira cartão no meio, como qualquer passo sem alvo visível.
      if (direita - esquerda < 8 || base - topo < 8) {
        setCaixa(null);
        return;
      }
      setCaixa({
        top: topo,
        left: esquerda,
        width: direita - esquerda,
        height: base - topo,
        bottom: base,
      });
    };

    medir(true);

    const remedir = () => medir(false);
    window.addEventListener("resize", remedir);
    window.addEventListener("scroll", remedir, true);
    return () => {
      vivo = false;
      window.clearTimeout(relogio);
      window.removeEventListener("resize", remedir);
      window.removeEventListener("scroll", remedir, true);
    };
  }, [passo?.target, indice]);

  /*
   * Enquanto o guia está aberto, quem rola é ele.
   *
   * Rolar com o guia aberto desmanchava tudo: o alvo saía da tela, o recorte
   * virava um risco, o cartão pulava para o meio e o passo seguinte abria
   * numa tela que a pessoa já tinha mexido. O guia é uma leitura de dez
   * segundos por passo; ele leva a pessoa até o lugar certo e segura a tela
   * ali. Não é trava de página (`overflow: hidden` no corpo tira a barra de
   * rolagem e o conteúdo inteiro salta de lado): é o gesto que para na
   * camada escura — o cartão, esse, continua rolável se um dia precisar.
   */
  useEffect(() => {
    const camada = camadaRef.current;
    if (!camada) return undefined;
    const segurar = (evento) => {
      if (cartaoRef.current?.contains(evento.target)) return;
      evento.preventDefault();
    };
    camada.addEventListener("wheel", segurar, { passive: false });
    camada.addEventListener("touchmove", segurar, { passive: false });
    return () => {
      camada.removeEventListener("wheel", segurar);
      camada.removeEventListener("touchmove", segurar);
    };
  }, []);

  // Esc sai; setas andam. O tour é uma leitura, e teclado é como se lê.
  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        onSair();
      }
      if (evento.key === "ArrowRight") onAvancar();
      if (evento.key === "ArrowLeft") onVoltar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onAvancar, onVoltar, onSair]);

  useEffect(() => {
    cartaoRef.current?.focus();
  }, [indice]);

  const janela = {
    largura: typeof window === "undefined" ? 1024 : window.innerWidth,
    altura: typeof window === "undefined" ? 768 : window.innerHeight,
  };
  const lugar = posicaoDoCartao(caixa, janela);
  const ultimo = indice >= passos.length - 1;
  const IconeDoCapitulo = jornada ? TOUR_ICONS[passo.chapterIcon] || CircleHelp : null;
  const temProximoCapitulo = jornada && nextChapterIndex(passos, indice) >= 0;
  const rotuloDoAtalho = passo.cta ? t(`tour.steps.${passo.key}.cta`, { defaultValue: "" }) : "";

  const estiloDoCartao = lugar.centro
    ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: `min(${CARTAO}px, calc(100vw - 24px))` }
    : {
        left: `${lugar.left}px`,
        width: `${lugar.largura}px`,
        ...(lugar.top != null ? { top: `${lugar.top}px` } : { bottom: `${lugar.bottom}px` }),
      };

  return createPortal(
    <div ref={camadaRef} className="fixed inset-0 z-[150] overscroll-contain">
      {/* O escuro. No tour de uma tela, clicar nele sai — como em qualquer
          camada do app. No guia completo ele é só escuro: ver a decisão no
          cabeçalho deste arquivo. */}
      {jornada ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 h-full w-full bg-black/55"
          style={caixa ? { background: "transparent" } : undefined}
        />
      ) : (
        <button
          type="button"
          aria-label={t("tour.skip")}
          onClick={onSair}
          className="absolute inset-0 h-full w-full cursor-default bg-black/55"
          style={caixa ? { background: "transparent" } : undefined}
        />
      )}

      {/* O recorte: um retângulo transparente com uma sombra enorme em volta.
          `pointer-events-none` deixa o alvo clicável por baixo. */}
      {caixa && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl ring-2 ring-[var(--engine-accent)] transition-all duration-200"
          style={{
            top: caixa.top - MARGEM,
            left: caixa.left - MARGEM,
            width: caixa.width + MARGEM * 2,
            height: caixa.height + MARGEM * 2,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
          }}
        />
      )}

      {/* O diálogo é o CARTÃO, não a camada inteira: é ele que recebe o foco
          e é ele que o leitor de tela anuncia. (E é assim que o reset de
          foco do index.css sabe não desenhar um anel vermelho em volta.) */}
      <div
        ref={cartaoRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(jornada ? "tour.help.fullGuide" : "tour.help.title")}
        tabIndex={-1}
        className="engine-pop absolute rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] p-4 shadow-[var(--engine-shadow-lg)] outline-none"
        style={estiloDoCartao}
      >
        {/* Onde a pessoa está no guia. Sem isto, vinte passos viram um
            corredor sem fim — e "quanto falta?" sem resposta é o que faz
            desistir antes do fim. */}
        {jornada && (
          <div className="mb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--engine-accent-soft)] px-2 py-1 text-[11px] font-black uppercase tracking-wide text-[var(--engine-accent)]">
                {IconeDoCapitulo && <IconeDoCapitulo size={13} aria-hidden="true" />}
                {t(`tour.chapters.${passo.chapter}.title`)}
              </span>
              <span className="text-[11px] font-bold text-[var(--engine-text-subtle)]">
                {t("tour.chapter", { current: passo.chapterNumber, total: passo.chapterCount })}
              </span>
            </div>
            <div
              className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--engine-surface-2)]"
              role="progressbar"
              aria-valuenow={indice + 1}
              aria-valuemin={1}
              aria-valuemax={passos.length}
            >
              <span
                className="block h-full rounded-full bg-[var(--engine-accent)] transition-[width] duration-300"
                style={{ width: `${((indice + 1) / passos.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 font-display text-base font-bold leading-tight text-[var(--engine-text)]">
            {t(`tour.steps.${passo.key}.title`)}
          </p>
          <button
            type="button"
            onClick={onSair}
            aria-label={t("tour.close")}
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-1.5 text-[13px] font-medium leading-5 text-[var(--engine-text-muted)]">
          {t(`tour.steps.${passo.key}.body`)}
        </p>

        {/* Lugar do print ou GIF daquele passo, quando existir. */}
        {passo.media && (
          <img
            src={passo.media}
            alt=""
            loading="lazy"
            className="mt-3 w-full rounded-xl border border-[var(--engine-border)]"
          />
        )}

        {/* O atalho. Convite, nunca pedágio: o "Próximo" continua ali do
            lado e o guia anda igual se ninguém tocar aqui. */}
        {rotuloDoAtalho && (
          <button
            type="button"
            onClick={onAtalho}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--engine-accent)] px-3 text-[13px] font-bold text-[var(--engine-accent)] transition hover:bg-[var(--engine-accent-soft)]"
          >
            {rotuloDoAtalho}
          </button>
        )}

        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--engine-text-subtle)]">
            {t("tour.step", { current: indice + 1, total: passos.length })}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {indice > 0 && (
              <button
                type="button"
                onClick={onVoltar}
                className="min-h-10 rounded-xl px-3 text-[13px] font-bold text-[var(--engine-text-muted)] transition hover:text-[var(--engine-text)]"
              >
                {t("tour.back")}
              </button>
            )}
            {!jornada && !ultimo && (
              <button
                type="button"
                onClick={onSair}
                className="min-h-10 rounded-xl px-3 text-[13px] font-bold text-[var(--engine-text-muted)] transition hover:text-[var(--engine-text)]"
              >
                {t("tour.skip")}
              </button>
            )}
            <button
              type="button"
              onClick={onAvancar}
              className="min-h-10 rounded-xl bg-[var(--engine-accent)] px-4 text-[13px] font-bold text-white transition hover:opacity-90"
            >
              {t(ultimo ? "tour.finish" : "tour.next")}
            </button>
          </div>
        </div>

        {/* Duas saídas, e a de cima é a que o guia quer oferecer: pular o
            CAPÍTULO. "Não quero saber de serviços agora" não deveria custar
            os eventos também. */}
        {jornada && (
          <div className="-mb-1 mt-2 flex items-center justify-between gap-2 border-t border-[var(--engine-border)] pt-2">
            {temProximoCapitulo ? (
              <button
                type="button"
                onClick={onPularCapitulo}
                className="min-h-9 rounded-lg px-1 text-[12px] font-bold text-[var(--engine-text-muted)] transition hover:text-[var(--engine-text)]"
              >
                {t("tour.skipChapter")}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onSair}
              className="min-h-9 rounded-lg px-1 text-[12px] font-semibold text-[var(--engine-text-subtle)] transition hover:text-[var(--engine-text)]"
            >
              {t("tour.exit")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function TourProvider({ userId = "", profilePath = "", children }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [tour, setTour] = useState(null); // { passos, indice, jornada }
  const comecou = useRef(false);

  const secaoAtual = useMemo(() => sectionForPath(location.pathname), [location.pathname]);

  // A jornada desta pessoa: visitante não recebe os capítulos que pedem
  // conta, e o capítulo do perfil só existe quando sabemos o @ dela.
  const jornada = useMemo(
    () => buildJourney({ logado: Boolean(userId), profilePath }),
    [userId, profilePath],
  );

  /*
   * Onde ela parou, se parou.
   *
   * Leitura no render, de propósito: é o localStorage que sabe, e espelhar
   * isso num `useState` obrigaria a um `setState` dentro de efeito para uma
   * informação que não é estado desta tela. Assim ela se atualiza sozinha
   * quando o guia abre e fecha — que é quando ela muda. Só vale o passo que
   * ainda existe no catálogo desta pessoa.
   */
  const chaveGravada = journeyProgress(userId);
  const retomar = jornada.some((passo) => passo.key === chaveGravada) ? chaveGravada : "";

  /**
   * Começa o guia completo. Com `stepKey`, retoma dali; sem, do começo.
   * A lista é fotografada agora de propósito: entrar na conta no meio do
   * guia não deve renumerar os capítulos debaixo do cartão.
   */
  const startJourney = useCallback(
    (stepKey = "") => {
      if (!jornada.length) return;
      const achado = jornada.findIndex((passo) => passo.key === stepKey);
      setTour({ passos: jornada, indice: achado < 0 ? 0 : achado, jornada: true });
    },
    [jornada],
  );

  const startSection = useCallback((id) => {
    const secao = sectionById(id) || secaoAtual;
    if (!secao?.steps?.length) return;
    setTour({ passos: secao.steps, indice: 0, jornada: false, origem: secao.id });
  }, [secaoAtual]);

  /*
   * Sair guarda o lugar em vez de perdê-lo: no guia completo, fechar é
   * pausar. Quem fecha no capítulo 5 e volta amanhã continua no 5 — e é
   * isso que faz o atalho "fazer agora" ser seguro de oferecer no meio.
   */
  const sair = useCallback(() => {
    setTour((atual) => {
      if (atual?.jornada) saveJourneyProgress(userId, atual.passos[atual.indice]?.key || "");
      return null;
    });
    markTourSeen(userId);
  }, [userId]);

  const avancar = useCallback(() => {
    setTour((atual) => {
      if (!atual) return atual;
      if (atual.indice >= atual.passos.length - 1) {
        markTourSeen(userId);
        if (atual.jornada) clearJourneyProgress(userId);
        return null;
      }
      return { ...atual, indice: atual.indice + 1 };
    });
  }, [userId]);

  const voltar = useCallback(() => {
    setTour((atual) => (atual && atual.indice > 0 ? { ...atual, indice: atual.indice - 1 } : atual));
  }, []);

  const pularCapitulo = useCallback(() => {
    setTour((atual) => {
      if (!atual) return atual;
      const proximo = nextChapterIndex(atual.passos, atual.indice);
      if (proximo < 0) {
        markTourSeen(userId);
        clearJourneyProgress(userId);
        return null;
      }
      return { ...atual, indice: proximo };
    });
  }, [userId]);

  /*
   * O atalho do passo: faz a coisa de verdade e sai da frente.
   *
   * Clica no próprio alvo (o botão que o holofote está mostrando) em vez de
   * navegar para um endereço paralelo: é o mesmo caminho que a pessoa vai
   * percorrer sozinha depois, e atalho que leva a outro lugar ensina o lugar
   * errado. O guia fica guardado no passo SEGUINTE — ela termina o que
   * começou e o botão de ajuda devolve o guia dali.
   */
  const atalho = useCallback(() => {
    setTour((atual) => {
      if (!atual) return atual;
      const passo = atual.passos[atual.indice];
      const proximo = atual.passos[atual.indice + 1]?.key || passo?.key || "";
      if (atual.jornada) saveJourneyProgress(userId, proximo);
      markTourSeen(userId);
      const elemento = alvoVisivel(passo?.target);
      // O clique vai depois do fechamento, senão ele cai debaixo do escuro.
      if (elemento) window.setTimeout(() => elemento.click(), 60);
      return null;
    });
  }, [userId]);

  /*
   * A navegação do guia: é o que o separa de um balãozinho por tela.
   *
   * Compara só o CAMINHO: a tela pode ter `?tab=` ou `?aba=` que o guia não
   * tem motivo para apagar (o passo das crews, por exemplo, troca a aba da
   * Comunidade sem sair dela).
   */
  useEffect(() => {
    if (!tour?.jornada) return;
    const destino = tour.passos[tour.indice]?.path;
    if (!destino || destino === location.pathname) return;
    navigate(destino);
  }, [tour, location.pathname, navigate]);

  /*
   * O voltar do aparelho pausa o guia.
   *
   * Sem isto o botão de voltar ficava morto enquanto o guia estivesse
   * aberto: a pessoa voltava, o efeito acima via a tela "errada" e a
   * empurrava de volta para o passo. Voltar é o gesto mais usado do Android
   * e o deslizar da borda no iPhone — ignorar isso é a reclamação número um
   * de web app que "parece quebrado". Aqui ele fecha o guia, com o lugar
   * guardado: o botão de ajuda devolve de onde parou.
   *
   * `popstate` só dispara no voltar/avançar de verdade; a navegação do
   * próprio guia (um push do router) não passa por aqui.
   */
  useEffect(() => {
    if (!tour?.jornada) return undefined;
    const aoVoltar = () => sair();
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, [tour?.jornada, sair]);

  /*
   * A chegada: quem nunca viu o guia vê uma vez.
   *
   * Espera um pouco de propósito. No primeiro segundo o app ainda está
   * montando a tela, e o tour precisa medir elementos que já existam. E não
   * entra por cima de outra camada aberta (aceite dos termos, escolha de
   * país, folha de compartilhar): duas camadas ao mesmo tempo é o jeito mais
   * rápido de a pessoa fechar as duas sem ler nenhuma.
   */
  useEffect(() => {
    if (comecou.current || tourSeen(userId)) return undefined;
    /*
     * Só na porta da frente.
     *
     * Quem chega por QR code num encontro ou por link de amigo cai NA
     * COISA: um evento, um carro, o anúncio de uma oficina. Abrir o guia
     * por cima disso — e, pior, levar a pessoa para o Início no primeiro
     * passo — é tirá-la do que ela veio ver três segundos depois de
     * chegar. Nessas telas o guia fica calado e espera o "?" do topo.
     */
    if (location.pathname !== "/") return undefined;
    const id = window.setTimeout(() => {
      if (comecou.current) return;
      const outraCamada = document.querySelector(
        ".engine-modal-overlay, .engine-sheet-scrim, [data-engine-blocking]",
      );
      // Alguém chegou na frente: o guia espera o próximo carregamento.
      if (outraCamada) return;
      comecou.current = true;
      startJourney();
    }, 1400);
    // A marca de "já comecei" fica DENTRO do relógio, não aqui fora: em
    // desenvolvimento o React monta, desmonta e monta de novo (StrictMode).
    // Marcando antes, a primeira montagem gastava a única chance, a limpeza
    // cancelava o relógio e o guia nunca aparecia.
    return () => window.clearTimeout(id);
  }, [userId, startJourney, location.pathname]);

  const valor = useMemo(
    () => ({
      section: secaoAtual,
      running: Boolean(tour),
      resumeKey: retomar,
      startJourney,
      // Nome antigo, mesma porta: o guia de chegada virou o guia completo.
      startWelcome: startJourney,
      startSection,
      stop: sair,
    }),
    [secaoAtual, tour, retomar, startJourney, startSection, sair],
  );

  return (
    <TourContext.Provider value={valor}>
      {children}
      {tour && (
        <Holofote
          passos={tour.passos}
          indice={tour.indice}
          jornada={tour.jornada}
          onAvancar={avancar}
          onVoltar={voltar}
          onSair={sair}
          onPularCapitulo={pularCapitulo}
          onAtalho={atalho}
          t={t}
        />
      )}
    </TourContext.Provider>
  );
}
