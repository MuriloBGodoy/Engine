import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Search } from "lucide-react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { BottomSheet } from "../BottomSheet";

/**
 * Select do Engine.
 *
 * O `<select>` nativo desenha a lista pelo SISTEMA OPERACIONAL, não pela
 * página: o campo fechado herdava os tokens do app, mas ao abrir vinha uma
 * caixa branca-cinza do Windows, com fonte do Windows, azul do Windows e uma
 * barra de rolagem do Windows — no meio de uma tela preta. Nenhum tema, nenhum
 * arredondamento e nenhuma cor do Engine chegam lá dentro. É o único controle
 * do app que o CSS não alcança.
 *
 * Então a lista passa a ser nossa:
 *
 *   - No computador, um balão ancorado no campo, que vira para cima quando não
 *     cabe embaixo e acompanha rolagem e redimensionamento.
 *   - No celular, a MESMA folha de baixo do resto do app (`BottomSheet`):
 *     fica debaixo do polegar e fecha arrastando.
 *   - Acima de 12 opções entra um campo de busca. Essa é a lista de marcas da
 *     FIPE: 80 e poucas marcas, em que achar "Volkswagen" era rolar até o V.
 *     O nativo tinha só a digitação por letra, que ninguém descobre.
 *
 * É uma TROCA DIRETA do `<select>`: aceita as mesmas `<option>` como filhos,
 * o mesmo `value`, e chama `onChange` com um evento de mesmo formato
 * (`event.target.value`). Trocar significa renomear a tag — nada mais. Por
 * isso ele lê os filhos em vez de pedir um array de opções: com array, as 49
 * chamadas do app teriam que ser reescritas uma a uma, e cada reescrita é uma
 * chance de errar.
 *
 * O `<select>` nativo continua existindo, escondido atrás do botão: é ele que
 * responde pelo `required` dentro de um `<form>` e pelo preenchimento
 * automático do navegador. O que sumiu foi só a lista feia.
 *
 * Teclado, igual ao nativo: setas andam, Home/End vão às pontas, letras
 * procuram, Enter escolhe, Esc fecha.
 */

/** Achata `<option>`, arrays e fragmentos num único array de opções. */
function lerOpcoes(children) {
  const saida = [];
  const andar = (node) => {
    Children.toArray(node).forEach((filho) => {
      if (!isValidElement(filho)) return;
      if (filho.type === "option") {
        saida.push({
          value: String(filho.props.value ?? ""),
          label: textoDe(filho.props.children),
          disabled: Boolean(filho.props.disabled),
        });
        return;
      }
      // Fragmento, array ou condicional: desce mais um nível.
      if (filho.props?.children) andar(filho.props.children);
    });
  };
  andar(children);
  return saida;
}

/** O rótulo de uma `<option>` pode vir partido em pedaços ({a} · {b}). */
function textoDe(node) {
  if (node === null || node === undefined || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textoDe).join("");
  if (isValidElement(node)) return textoDe(node.props.children);
  return "";
}

const semAcento = (texto) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function Select({
  value,
  onChange,
  children,
  className = "",
  disabled = false,
  required = false,
  name,
  id,
  title,
  placeholder = "",
  /** Busca automática acima deste tamanho; `false` desliga, número manda. */
  searchable = 12,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...resto
}) {
  const { t } = useTranslation();
  const opcoes = useMemo(() => lerOpcoes(children), [children]);
  const celular = useMediaQuery("(max-width: 639px)");
  const listaId = useId();

  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(-1);
  const [caixa, setCaixa] = useState(null);

  const botaoRef = useRef(null);
  const balaoRef = useRef(null);
  const listaRef = useRef(null);
  const buscaRef = useRef(null);
  const digitado = useRef({ texto: "", quando: 0 });

  const atual = String(value ?? "");
  const selecionada = opcoes.find((opcao) => opcao.value === atual);
  const comBusca =
    searchable !== false && opcoes.length > (typeof searchable === "number" ? searchable : 12);

  const visiveis = useMemo(() => {
    if (!busca.trim()) return opcoes;
    const alvo = semAcento(busca.trim());
    return opcoes.filter((opcao) => semAcento(opcao.label).includes(alvo));
  }, [opcoes, busca]);

  const fechar = useCallback(() => {
    setAberto(false);
    setBusca("");
    setCaixa(null);
  }, []);

  const escolher = useCallback(
    (opcao) => {
      if (!opcao || opcao.disabled) return;
      fechar();
      botaoRef.current?.focus();
      if (opcao.value === atual) return;
      // Mesmo formato do nativo: quem chama continua lendo event.target.value.
      onChange?.({ target: { value: opcao.value, name: name || "" } });
    },
    [atual, fechar, name, onChange],
  );

  const abrir = useCallback(() => {
    if (disabled || !opcoes.length) return;
    const indice = opcoes.findIndex((opcao) => opcao.value === atual);
    setAtivo(indice >= 0 ? indice : 0);
    setAberto(true);
  }, [atual, disabled, opcoes]);

  // --- balão do computador: posição, virada para cima e acompanhamento ---
  const medir = useCallback(() => {
    const botao = botaoRef.current;
    if (!botao) return;
    const r = botao.getBoundingClientRect();
    const abaixo = window.innerHeight - r.bottom - 12;
    const acima = r.top - 12;
    const paraCima = abaixo < 220 && acima > abaixo;
    setCaixa({
      left: r.left,
      width: r.width,
      top: paraCima ? undefined : r.bottom + 6,
      bottom: paraCima ? window.innerHeight - r.top + 6 : undefined,
      maxHeight: Math.max(160, Math.min(320, paraCima ? acima : abaixo)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!aberto || celular) return undefined;
    medir();
    const aoMover = () => medir();
    window.addEventListener("scroll", aoMover, true);
    window.addEventListener("resize", aoMover);
    return () => {
      window.removeEventListener("scroll", aoMover, true);
      window.removeEventListener("resize", aoMover);
    };
  }, [aberto, celular, medir]);

  // Clique fora fecha. No celular quem cuida disso é a própria folha.
  useEffect(() => {
    if (!aberto || celular) return undefined;
    const aoClicar = (evento) => {
      if (balaoRef.current?.contains(evento.target)) return;
      if (botaoRef.current?.contains(evento.target)) return;
      fechar();
    };
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, [aberto, celular, fechar]);

  // A opção ativa sempre visível — inclusive ao abrir numa lista de 80 marcas.
  useEffect(() => {
    if (!aberto || ativo < 0) return;
    const alvo = listaRef.current?.querySelector(`[data-indice="${ativo}"]`);
    alvo?.scrollIntoView({ block: "nearest" });
  }, [aberto, ativo, visiveis]);

  useEffect(() => {
    if (aberto && comBusca && !celular) buscaRef.current?.focus();
  }, [aberto, comBusca, celular]);

  const andar = (passo) => {
    if (!visiveis.length) return;
    const atualNaLista = visiveis.findIndex((opcao) => opcao === opcoes[ativo]);
    let proximo = atualNaLista;
    for (let i = 0; i < visiveis.length; i += 1) {
      proximo = (proximo + passo + visiveis.length) % visiveis.length;
      if (!visiveis[proximo].disabled) break;
    }
    setAtivo(opcoes.indexOf(visiveis[proximo]));
  };

  const nasPontas = (fim) => {
    const lista = fim ? [...visiveis].reverse() : visiveis;
    const alvo = lista.find((opcao) => !opcao.disabled);
    if (alvo) setAtivo(opcoes.indexOf(alvo));
  };

  const aoTeclar = (evento) => {
    if (disabled) return;

    if (!aberto) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(evento.key)) {
        evento.preventDefault();
        abrir();
      }
      return;
    }

    switch (evento.key) {
      case "Escape":
        evento.preventDefault();
        fechar();
        botaoRef.current?.focus();
        return;
      case "ArrowDown":
        evento.preventDefault();
        andar(1);
        return;
      case "ArrowUp":
        evento.preventDefault();
        andar(-1);
        return;
      case "Home":
        evento.preventDefault();
        nasPontas(false);
        return;
      case "End":
        evento.preventDefault();
        nasPontas(true);
        return;
      case "Enter":
        evento.preventDefault();
        escolher(opcoes[ativo]);
        return;
      case "Tab":
        fechar();
        return;
      default:
        break;
    }

    // Digitar letras procura, como no nativo — mas só quando não há campo de
    // busca, senão a letra seria roubada do campo.
    if (comBusca || evento.key.length !== 1 || evento.metaKey || evento.ctrlKey) return;
    const agora = Date.now();
    const texto =
      agora - digitado.current.quando < 700 ? digitado.current.texto + evento.key : evento.key;
    digitado.current = { texto, quando: agora };
    const achou = visiveis.find(
      (opcao) => !opcao.disabled && semAcento(opcao.label).startsWith(semAcento(texto)),
    );
    if (achou) setAtivo(opcoes.indexOf(achou));
  };

  const rotulo = selecionada?.label || placeholder || "";
  const vazio = !selecionada || !selecionada.value;

  const campoBusca = comBusca ? (
    <div className="sticky top-0 z-10 bg-[var(--engine-elevated)] p-2">
      <label className="engine-field flex h-10 items-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3">
        <Search size={15} className="shrink-0 text-[var(--engine-text-subtle)]" aria-hidden="true" />
        <input
          ref={buscaRef}
          value={busca}
          onChange={(evento) => {
            setBusca(evento.target.value);
            setAtivo(-1);
          }}
          onKeyDown={aoTeclar}
          placeholder={t("common.filter")}
          aria-label={t("common.filter")}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--engine-text)] outline-none"
        />
      </label>
    </div>
  ) : null;

  /**
   * A lista, montada pelos dois lados — e quem rola muda conforme o lado.
   *
   * No balão do computador a lista É o rolador: o balão tem altura máxima e
   * `overflow-hidden`, então a `<ul>` precisa de `flex-1 min-h-0` e da
   * própria barra. Na folha do celular, não: o `BottomSheet` já envolve o
   * conteúdo num `flex-1 min-h-0 overflow-y-auto`. Dar rolagem à lista ali
   * criava dois roladores aninhados, ambos com `overscroll-contain` — um
   * cancelava o gesto do outro e a lista de 80 marcas da FIPE não saía do A.
   */
  const lista = (rolagem = "") => (
    <ul
      ref={listaRef}
      id={listaId}
      role="listbox"
      aria-label={ariaLabel || title || t("common.options")}
      className={`p-1.5 ${rolagem}`}
    >
      {visiveis.map((opcao) => {
        const indice = opcoes.indexOf(opcao);
        const marcada = opcao.value === atual;
        return (
          <li key={`${opcao.value}-${indice}`}>
            <button
              type="button"
              role="option"
              aria-selected={marcada}
              data-indice={indice}
              disabled={opcao.disabled}
              onClick={() => escolher(opcao)}
              onMouseEnter={() => setAtivo(indice)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-40 sm:py-2 ${
                marcada
                  ? "font-bold text-[var(--engine-accent-text)]"
                  : "font-medium text-[var(--engine-text)]"
              } ${indice === ativo && !opcao.disabled ? "bg-[var(--engine-surface-2)]" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate">{opcao.label}</span>
              {marcada && (
                <Check size={15} className="shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
              )}
            </button>
          </li>
        );
      })}

      {!visiveis.length && (
        <li className="px-3 py-6 text-center text-sm font-medium text-[var(--engine-text-muted)]">
          {t("common.noMatch")}
        </li>
      )}
    </ul>
  );

  return (
    <span className={`relative inline-flex ${className.includes("w-full") ? "w-full" : ""}`}>
      {/* O nativo fica aqui por baixo, sem foco e sem leitor de tela: ele
          responde pelo `required` do formulário e pelo autopreenchimento.
          `sr-only` em vez de `hidden` de propósito — campo obrigatório com
          `display:none` faz o Chrome travar o envio num controle que ele não
          consegue focar. */}
      <select
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        id={id}
        required={required}
        disabled={disabled}
        value={atual}
        onChange={(evento) => onChange?.(evento)}
      >
        {opcoes.map((opcao, indice) => (
          <option key={`${opcao.value}-${indice}`} value={opcao.value}>
            {opcao.label}
          </option>
        ))}
      </select>

      <button
        ref={botaoRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? listaId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        title={title}
        disabled={disabled}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={aoTeclar}
        className={`${className} inline-flex items-center gap-2 text-left ${
          aberto ? "border-[var(--engine-accent)]" : ""
        }`}
        {...resto}
      >
        <span
          className={`min-w-0 flex-1 truncate ${vazio ? "text-[var(--engine-text-muted)]" : ""}`}
        >
          {rotulo}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-[var(--engine-text-muted)] transition-transform ${
            aberto ? "rotate-180" : ""
          }`}
        />
      </button>

      {aberto && celular && (
        <BottomSheet
          open
          onClose={fechar}
          title={ariaLabel || title || t("common.options")}
          className="max-h-[78vh]"
        >
          {campoBusca}
          {lista()}
        </BottomSheet>
      )}

      {aberto && !celular && caixa &&
        createPortal(
          <div
            ref={balaoRef}
            style={{
              position: "fixed",
              left: caixa.left,
              top: caixa.top,
              bottom: caixa.bottom,
              width: Math.max(caixa.width, 180),
              maxHeight: caixa.maxHeight,
              // Acima de TODAS as camadas do app. As do CSS vão a 999
              // (.region-pop, que por sinal tem cinco Selects dentro), e
              // passando por .engine-modal-overlay 100, .engine-drawer 121 e
              // .engine-sheet-scrim 130. Em 90 o balão abria atrás do modal
              // "Cadastrar carro": a seta girava e nada aparecia na tela.
              // Um balão sempre pertence ao topo — ele fecha ao clicar fora,
              // então não tem como ficar preso na frente de nada.
              zIndex: 1000,
            }}
            className="flex flex-col overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] shadow-[var(--engine-shadow-lg)]"
          >
            {campoBusca}
            {lista("engine-scroll-x min-h-0 flex-1 overflow-y-auto overscroll-contain")}
          </div>,
          document.body,
        )}
    </span>
  );
}
