import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smile } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { EMOJI_GRUPOS } from "../services/emojis";
import "../services/i18n-editing";

/**
 * O botão de emoji do compositor.
 *
 * Duas coisas estavam erradas e as duas vinham da mesma origem — a folha era
 * um painel preso ao botão, com uma lista escrita à mão:
 *
 *  1. **Saía torta no celular.** O painel nascia no canto esquerdo do botão e
 *     tinha largura própria. O botão fica no começo da barra do chat, depois
 *     do "+", então o painel começava a uns 50 px da borda e ia até passar da
 *     tela: o que sobrava ficava cortado no lado direito. Limitar a largura
 *     não resolve, porque o problema é ONDE ele começa, não quanto ele mede.
 *  2. **Tinha 42 emojis.** Era uma lista digitada na mão, com o que coube.
 *     Quem procurava um foguete, um cachorro ou um bolo não achava e ia para
 *     o teclado do sistema — e nesse caso o botão só atrapalha.
 *
 * Agora: no celular é a folha de baixo do app (`BottomSheet`), a mesma de
 * anexar e de filtrar, que ocupa a largura inteira e não tem canto para
 * estourar; no computador continua um painel preso ao botão, onde sobra tela
 * e uma folha no meio seria pesada demais para escolher uma carinha. É o
 * mesmo critério do `ui/Select`.
 *
 * A lista vem de `services/emojis.js`, gerada do arquivo oficial do Unicode
 * (1.588 emojis, em grupos e na ordem dos teclados). A Garagem vem primeiro
 * porque é um app de carro.
 */

const RECENTES = "engine:emoji:recentes";
const QUANTOS_RECENTES = 8;

const lerRecentes = () => {
  try {
    const cru = JSON.parse(window.localStorage.getItem(RECENTES) || "[]");
    return Array.isArray(cru)
      ? cru.filter((item) => typeof item === "string").slice(0, QUANTOS_RECENTES)
      : [];
  } catch {
    // Sem armazenamento não há "recentes" — o resto funciona igual.
    return [];
  }
};

function Grade({ emojis, aoEscolher }) {
  return (
    <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-9">
      {emojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => aoEscolher(emoji)}
          title={emoji}
          className="flex h-10 items-center justify-center rounded-lg text-[22px] leading-none transition hover:bg-[var(--engine-accent-soft)]"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function EmojiPicker({ onEmojiSelect, className = "" }) {
  const { t } = useTranslation();
  const celular = useMediaQuery("(max-width: 639px)");
  const [aberto, setAberto] = useState(false);
  const [grupo, setGrupo] = useState(EMOJI_GRUPOS[0].key);
  const ref = useRef(null);

  // Os recentes são lidos na hora de ABRIR, não num efeito depois de abrir:
  // preencher depois renderiza a grade uma vez sem eles e outra com, e ela
  // salta no olho de quem acabou de tocar.
  const [recentes, setRecentes] = useState(lerRecentes);

  const alternar = () => {
    if (!aberto) setRecentes(lerRecentes());
    setAberto((atual) => !atual);
  };

  const fechar = () => setAberto(false);

  // Fechar o painel do computador ao tocar fora ou apertar Esc. A folha do
  // celular já faz isso sozinha (o escurecido é dela).
  useEffect(() => {
    if (!aberto || celular) return undefined;

    const fora = (evento) => {
      if (ref.current && !ref.current.contains(evento.target)) fechar();
    };
    const tecla = (evento) => {
      if (evento.key === "Escape") fechar();
    };
    // `pointerdown` cobre dedo, mouse e caneta de uma vez.
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto, celular]);

  const escolher = (emoji) => {
    onEmojiSelect(emoji);
    setAberto(false);
    try {
      const nova = [emoji, ...lerRecentes().filter((item) => item !== emoji)].slice(
        0,
        QUANTOS_RECENTES,
      );
      window.localStorage.setItem(RECENTES, JSON.stringify(nova));
    } catch {
      // Idem: sem armazenamento, só não há histórico.
    }
  };

  const emojisDoGrupo = useMemo(
    () => EMOJI_GRUPOS.find((item) => item.key === grupo)?.emojis || [],
    [grupo],
  );

  const abas = (
    /* A tira de grupos rola sozinha: são nove, e nove não cabem em 360px sem
       virar letra de bula. `shrink-0` em cada uma para elas não se espremerem
       até caber — espremidas, todas ficam ilegíveis em vez de algumas ficarem
       fora da vista, que é o que a rolagem resolve. */
    <div className="engine-scroll-x -mx-1 flex gap-1 overflow-x-auto pb-2">
      {EMOJI_GRUPOS.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => setGrupo(item.key)}
          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
            item.key === grupo
              ? "bg-[var(--engine-accent-soft)] text-[var(--engine-accent-text)]"
              : "text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
          }`}
        >
          {t(`emoji.groups.${item.key}`)}
        </button>
      ))}
    </div>
  );

  const conteudo = (
    <>
      {recentes.length > 0 && (
        <>
          <p className="px-0.5 pb-1 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
            {t("emoji.recent")}
          </p>
          <Grade emojis={recentes} aoEscolher={escolher} />
          <div className="my-2 h-px bg-[var(--engine-border)]" />
        </>
      )}
      {abas}
      <div className="engine-scroll max-h-64 overflow-y-auto">
        <Grade emojis={emojisDoGrupo} aoEscolher={escolher} />
      </div>
    </>
  );

  const botao = (
    <button
      type="button"
      onClick={alternar}
      title={t("emoji.title")}
      aria-label={t("emoji.title")}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)] sm:h-11 sm:w-11"
    >
      <Smile size={18} aria-hidden="true" />
    </button>
  );

  if (celular) {
    return (
      <div className={className}>
        {botao}
        <BottomSheet open={aberto} onClose={fechar} title={t("emoji.title")}>
          <div className="px-4 pb-4">{conteudo}</div>
        </BottomSheet>
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      {botao}
      {aberto && (
        <div
          role="dialog"
          aria-label={t("emoji.title")}
          className="absolute bottom-14 left-0 z-50 w-[22rem] rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3 shadow-[var(--engine-shadow-md)]"
        >
          {conteudo}
        </div>
      )}
    </div>
  );
}
