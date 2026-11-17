import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { buscarCidades, nomeOficial, sameCity } from "../../services/places";

/**
 * Campo de cidade com busca, do jeito que País e Estado já eram.
 *
 * Antes disto, toda tela do app pedia a cidade numa caixa de texto vazia,
 * logo abaixo de dois seletores. Três problemas de uma vez:
 *
 *   - cada pessoa escrevia de um jeito, e filtrar por cidade virava loteria;
 *   - o dataset antigo tinha ~5 cidades por estado, então quem não mora em
 *     capital nunca via sugestão nenhuma;
 *   - ao lado de dois menus, uma caixa de texto solta parece campo quebrado.
 *
 * Agora a lista é a tabela do IBGE inteira (5.571 municípios), filtrada pela
 * UF já escolhida, e o que vai para o banco é sempre a grafia oficial.
 *
 * CONTINUA ACEITANDO TEXTO LIVRE. Fora do Brasil não existe tabela
 * equivalente, e mesmo no Brasil tem gente em distrito que não é município.
 * Quem escreve algo que não está na lista tem o próprio texto gravado — o
 * campo sugere, não obriga.
 *
 * A caixa de sugestões é posicionada por `absolute` dentro de um `relative`:
 * em modal com rolagem própria, portal daria nó com o `overflow`.
 */
// A mesma aparência do campo de texto padrão do app. Fica aqui para quem só
// quer "um campo de cidade" não ter que copiar a classe (e errar uma letra).
export const CAMPO_PADRAO =
  "min-h-12 w-full min-w-0 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 text-sm font-bold text-[var(--engine-text)] outline-none transition placeholder:text-[var(--engine-text-subtle)] focus:border-[var(--engine-accent)] focus:bg-[var(--engine-surface)] dark:text-white dark:[color-scheme:dark] dark:placeholder:text-[var(--engine-text-muted)] dark:focus:bg-[var(--engine-elevated)]";

export function CityField({
  value = "",
  onChange,
  country = "BR",
  state = "",
  className = CAMPO_PADRAO,
  id,
  placeholder,
  disabled = false,
  maxLength = 80,
  ...rest
}) {
  const reactId = useId();
  const inputId = id || reactId;
  const [opcoes, setOpcoes] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [marcado, setMarcado] = useState(-1);
  const caixaRef = useRef(null);

  // Sem cópia local do texto: o campo mostra `value` e cada tecla avisa o pai.
  // A primeira versão guardava o texto aqui dentro e espelhava a prop num
  // efeito — duas fontes da mesma verdade, que desincronizavam justamente
  // quando o pai limpa a cidade ao trocar de UF.
  const texto = value || "";

  useEffect(() => {
    if (!aberto) return undefined;
    let vivo = true;
    buscarCidades(country, state, texto).then((lista) => {
      if (vivo) setOpcoes(lista);
    });
    return () => {
      vivo = false;
    };
  }, [aberto, texto, country, state]);

  // Clique fora fecha. `mousedown` e não `click`: o clique numa sugestão
  // dispara blur antes, e com `click` a lista já teria sumido.
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (evento) => {
      if (!caixaRef.current?.contains(evento.target)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const escolher = (nome) => {
    setAberto(false);
    setMarcado(-1);
    onChange?.(nome);
  };

  const aoSair = async () => {
    const atual = texto.trim();
    if (!atual) {
      if (value) onChange?.("");
      return;
    }
    // Troca "araraquara" pela grafia oficial sem avisar: é o mesmo lugar, e
    // é isso que faz o filtro de cidade casar entre duas pessoas.
    const oficial = await nomeOficial(country, state, atual);
    if (oficial !== value) onChange?.(oficial);
  };

  const aoTeclar = (evento) => {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      if (!aberto) {
        setAberto(true);
        return;
      }
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      setMarcado((atual) => {
        const proximo = atual + passo;
        if (proximo < 0) return opcoes.length - 1;
        if (proximo >= opcoes.length) return 0;
        return proximo;
      });
      return;
    }
    if (evento.key === "Enter" && aberto && marcado >= 0 && opcoes[marcado]) {
      evento.preventDefault();
      escolher(opcoes[marcado]);
      return;
    }
    if (evento.key === "Escape" && aberto) {
      evento.stopPropagation();
      setAberto(false);
    }
  };

  const listaId = `${inputId}-cidades`;

  return (
    <div ref={caixaRef} className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        value={texto}
        onChange={(evento) => {
          setMarcado(-1);
          setAberto(true);
          onChange?.(evento.target.value);
        }}
        onFocus={() => setAberto(true)}
        onBlur={aoSair}
        onKeyDown={aoTeclar}
        className={className}
        {...rest}
      />

      {aberto && opcoes.length > 0 && (
        <ul
          id={listaId}
          role="listbox"
          className="engine-pop absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] py-1 shadow-[var(--engine-shadow-lg)]"
        >
          {opcoes.map((nome, indice) => {
            const atual = sameCity(nome, texto);
            return (
              <li key={nome}>
                <button
                  type="button"
                  role="option"
                  aria-selected={atual}
                  // `mousedown` em vez de `click`: o blur do input acontece
                  // antes do click e fecharia a lista debaixo do dedo.
                  onMouseDown={(evento) => {
                    evento.preventDefault();
                    escolher(nome);
                  }}
                  onMouseEnter={() => setMarcado(indice)}
                  className={`flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm transition-colors ${
                    indice === marcado
                      ? "bg-[var(--engine-surface-2)] text-[var(--engine-text)]"
                      : "text-[var(--engine-text-muted)]"
                  } ${atual ? "font-bold text-[var(--engine-accent)]" : ""}`}
                >
                  <MapPin size={14} className="shrink-0 opacity-60" aria-hidden="true" />
                  <span className="truncate">{nome}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
