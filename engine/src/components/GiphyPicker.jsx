import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader, Search, X } from "lucide-react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { BottomSheet } from "./BottomSheet";
import "../services/i18n-gif";

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || "";

/**
 * O seletor de GIF — no desenho que todo mundo já conhece.
 *
 * Até 25/11/2026 ele era um modal centralizado, com um campo vazio e a
 * frase "digite algo pra buscar GIFs". Três coisas erradas de uma vez:
 *
 *  - **Nascia no meio da tela.** Sem ligação nenhuma com o botão que o
 *    abriu, lá embaixo no compositor. Nenhuma rede social faz isso: o
 *    painel de GIF sai de cima do campo de escrever, onde a conversa está.
 *
 *  - **Abria vazio.** Ninguém chega no GIF com uma palavra na cabeça —
 *    chega querendo ver o que tem. WhatsApp, Telegram e X abrem nos GIFs
 *    EM ALTA, e a busca é para quem já sabe o que quer. Tela vazia com uma
 *    instrução é trabalho empurrado para quem só queria mandar uma risada.
 *
 *  - **Cortava os GIFs num quadrado.** GIF é desenho, não foto de perfil:
 *    cortado no meio ninguém reconhece a piada. Aqui eles entram em duas
 *    colunas na proporção de verdade, como na Giphy.
 *
 * A proporção vem da API (`fixed_width`) e é escrita no `<img>`: sem isso a
 * grade salta a cada GIF que termina de baixar, e a pessoa toca no que não
 * queria.
 *
 * O crédito "via GIPHY" fica no rodapé porque os termos de uso da API
 * pedem — e porque é honesto dizer de onde vem o acervo.
 */
export function GiphyPicker({ onSelect, onClose }) {
  const { t } = useTranslation();
  const celular = useMediaQuery("(max-width: 639px)");
  const [termo, setTermo] = useState("");
  const [estado, setEstado] = useState({ carregando: Boolean(GIPHY_API_KEY), gifs: [], erro: "" });
  const [tentativa, setTentativa] = useState(0);
  const painelRef = useRef(null);

  const busca = termo.trim();

  /*
   * Em alta quando não há busca; resultado quando há.
   *
   * Tudo passa pelo relógio, inclusive a primeira carga: `setState` solto no
   * corpo do efeito dispara renderização em cascata (e o lint reclama com
   * razão). 400ms é a pausa de quem parou de digitar; 0 é "já".
   */
  useEffect(() => {
    if (!GIPHY_API_KEY) return undefined;
    const controle = new AbortController();
    const relogio = window.setTimeout(async () => {
      setEstado((atual) => ({ ...atual, carregando: true, erro: "" }));
      const endereco = busca
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(busca)}&limit=24&rating=g&lang=pt`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`;
      try {
        const resposta = await fetch(endereco, { signal: controle.signal });
        if (!resposta.ok) throw new Error(`giphy ${resposta.status}`);
        const dados = await resposta.json();
        setEstado({ carregando: false, gifs: dados.data || [], erro: "" });
      } catch (erro) {
        // Busca cancelada (a pessoa continuou digitando) não é falha.
        if (erro.name === "AbortError") return;
        console.warn("[gif] não deu para buscar.", erro);
        setEstado({ carregando: false, gifs: [], erro: "falhou" });
      }
    }, busca ? 400 : 0);

    return () => {
      controle.abort();
      window.clearTimeout(relogio);
    };
  }, [busca, tentativa]);

  // Fechar no Esc e ao tocar fora — o mesmo par do EmojiPicker ao lado. No
  // celular quem fecha é a folha, com o escurecido dela.
  useEffect(() => {
    if (celular) return undefined;
    const fora = (evento) => {
      if (painelRef.current && !painelRef.current.contains(evento.target)) onClose?.();
    };
    const tecla = (evento) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [celular, onClose]);

  const escolher = (gif) => {
    onSelect?.({
      gifUrl: gif.images?.original?.url || "",
      gifId: gif.id,
    });
  };

  const campo = (
    <div className="relative">
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--engine-text-subtle)]"
      />
      <input
        type="search"
        value={termo}
        onChange={(evento) => setTermo(evento.target.value)}
        placeholder={t("gifPicker.search")}
        aria-label={t("gifPicker.search")}
        autoComplete="off"
        className="h-10 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] pl-9 pr-3 text-sm font-semibold text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
      />
    </div>
  );

  const aviso = (texto, acao = null) => (
    <div className="flex min-h-[8rem] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-[13px] font-semibold text-[var(--engine-text-muted)]">{texto}</p>
      {acao}
    </div>
  );

  const grade = () => {
    if (!GIPHY_API_KEY) return aviso(t("gifPicker.unavailable"));
    if (estado.erro) {
      return aviso(
        t("gifPicker.error"),
        <button
          type="button"
          onClick={() => setTentativa((n) => n + 1)}
          className="min-h-10 rounded-xl border border-[var(--engine-border-strong)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]"
        >
          {t("gifPicker.retry")}
        </button>,
      );
    }
    if (estado.carregando && !estado.gifs.length) {
      return (
        <div className="flex min-h-[8rem] items-center justify-center">
          <Loader size={20} className="animate-spin text-[var(--engine-accent)]" aria-hidden="true" />
        </div>
      );
    }
    if (!estado.gifs.length) return aviso(t("gifPicker.empty", { term: busca }));

    return (
      <div className="columns-2 gap-2 [column-fill:_balance]">
        {estado.gifs.map((gif) => {
          const arte = gif.images?.fixed_width_downsampled || gif.images?.fixed_width;
          return (
            <button
              key={gif.id}
              type="button"
              onClick={() => escolher(gif)}
              title={gif.title || t("gifPicker.title")}
              className="mb-2 block w-full overflow-hidden rounded-xl border border-transparent transition hover:border-[var(--engine-accent)] focus-visible:border-[var(--engine-accent)]"
            >
              <img
                src={arte?.url}
                alt={gif.title || ""}
                width={Number(arte?.width) || 200}
                height={Number(arte?.height) || 200}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full bg-[var(--engine-surface-2)]"
              />
            </button>
          );
        })}
      </div>
    );
  };

  const credito = (
    <p className="pt-1 text-center text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
      {t("gifPicker.credit")}
    </p>
  );

  // No celular, a folha de baixo: fica na zona do polegar, fecha arrastando
  // e fecha no voltar do Android — tudo o que o modal centralizado não fazia.
  if (celular) {
    return (
      <BottomSheet open onClose={onClose} title={t("gifPicker.title")}>
        <div className="space-y-3 pb-2">
          {campo}
          <p className="-mb-1 px-0.5 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
            {busca ? t("gifPicker.results") : t("gifPicker.trending")}
          </p>
          <div className="engine-scroll max-h-[50vh] overflow-y-auto">{grade()}</div>
          {credito}
        </div>
      </BottomSheet>
    );
  }

  // No computador, painel ancorado: quem o renderiza é o compositor, dentro
  // de um container `relative` — ele nasce colado no botão que o abriu.
  return (
    <div
      ref={painelRef}
      role="dialog"
      aria-label={t("gifPicker.title")}
      className="engine-pop absolute bottom-14 left-0 z-50 w-[min(23rem,calc(100vw-2rem))] rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3 shadow-[var(--engine-shadow-md)]"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{campo}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
        >
          <X size={18} />
        </button>
      </div>

      <p className="mb-1.5 mt-2.5 px-0.5 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
        {busca ? t("gifPicker.results") : t("gifPicker.trending")}
      </p>

      <div className="engine-scroll max-h-[22rem] overflow-y-auto">{grade()}</div>
      {credito}
    </div>
  );
}
