import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smile } from "lucide-react";
import "../services/i18n-editing";

/**
 * O botão de emoji do compositor.
 *
 * Ele existia desde sempre, mas **só no computador** — a chamada no chat era
 * `{isDesktop && <EmojiPicker />}`. O raciocínio original se defende (o
 * teclado do celular tem a tecla de emoji), mas não é o que as pessoas
 * esperam: WhatsApp, Telegram e Instagram mostram o botão no celular mesmo
 * assim, e aqui o botão de GIF ao lado aparecia, então a barra parecia ter
 * perdido uma peça. Três coisas impediam de simplesmente ligar:
 *
 *  1. **A folha tinha largura fixa de 320px** presa à esquerda. Num aparelho
 *     de 360px, com o "+" antes dela, ela saía pela borda direita. Agora ela
 *     ocupa a largura disponível e para na borda.
 *  2. **Só fechava com `mousedown`.** No toque, tocar fora não fechava nada —
 *     a folha ficava aberta por cima da conversa. Agora é `pointerdown`, que
 *     é um evento só para mouse, dedo e caneta.
 *  3. **O `💯` estava repetido na lista** e a chave do React é o próprio
 *     emoji: dois irmãos com a mesma chave. Saiu o repetido.
 *
 * E a lista ganhou carro. Era estranho um app de carro oferecer 🎯 e 📱 e não
 * ter 🚗 nem 🔧 — os primeiros da fila agora são os do assunto da casa.
 */

const EMOJIS = [
  // A casa primeiro: é um app de carro.
  "🚗", "🏎️", "🏁", "🔧", "🛞", "⛽",
  "🔥", "💨", "🛠️", "🚨", "🏆", "⚙️",
  // O resto do dia a dia.
  "😀", "😂", "😍", "🥰", "😎", "🤔",
  "👍", "👌", "🙌", "👏", "🤝", "🙏",
  "💯", "✨", "🎉", "🚀", "💪", "😅",
  "😭", "😡", "🤷", "❤️", "💔", "💚",
  "✅", "❌", "💡", "⚡", "⏰", "🤌",
];

const RECENTES = "engine:emoji:recentes";

const lerRecentes = () => {
  try {
    const cru = JSON.parse(window.localStorage.getItem(RECENTES) || "[]");
    return Array.isArray(cru) ? cru.filter((e) => typeof e === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
};

export function EmojiPicker({ onEmojiSelect, className = "" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // Os recentes são lidos na hora de ABRIR, não num efeito depois de abrir:
  // guardar em estado e preencher no efeito renderizaria a folha uma vez sem
  // eles e outra com, e a grade saltaria no olho de quem acabou de tocar.
  const [recentes, setRecentes] = useState(lerRecentes);

  const alternar = () => {
    if (!open) setRecentes(lerRecentes());
    setOpen((atual) => !atual);
  };

  useEffect(() => {
    if (!open) return undefined;

    // `pointerdown` cobre dedo, mouse e caneta de uma vez. Com `mousedown` a
    // folha não fechava ao tocar fora no celular.
    const fora = (evento) => {
      if (ref.current && !ref.current.contains(evento.target)) setOpen(false);
    };
    const tecla = (evento) => {
      if (evento.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [open]);

  const escolher = (emoji) => {
    onEmojiSelect(emoji);
    setOpen(false);
    try {
      const nova = [emoji, ...lerRecentes().filter((item) => item !== emoji)].slice(0, 6);
      window.localStorage.setItem(RECENTES, JSON.stringify(nova));
    } catch {
      // Sem armazenamento não há "recentes". A folha funciona igual.
    }
  };

  const grade = (lista, chave) => (
    <div key={chave} className="grid grid-cols-6 gap-1">
      {lista.map((emoji, i) => (
        <button
          key={`${chave}-${emoji}-${i}`}
          type="button"
          onClick={() => escolher(emoji)}
          title={emoji}
          className="flex h-10 items-center justify-center rounded-lg text-xl transition hover:bg-[var(--engine-accent-soft)]"
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={alternar}
        title={t("emoji.title")}
        aria-label={t("emoji.title")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)] sm:h-11 sm:w-11"
      >
        <Smile size={18} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("emoji.title")}
          /* Presa à esquerda do botão e limitada pela largura da tela: era
             `w-80` fixo, que num celular de 360px saía pela borda direita.
             `max-w-[min(20rem,calc(100vw-2rem))]` deixa ela crescer até 320px
             onde couber e encolher onde não couber. */
          className="absolute bottom-14 left-0 z-50 w-[min(20rem,calc(100vw-2rem))] max-w-[20rem] space-y-2 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3 shadow-[var(--engine-shadow-md)]"
        >
          {recentes.length > 0 && (
            <>
              <p className="px-0.5 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
                {t("emoji.recent")}
              </p>
              {grade(recentes, "recentes")}
              <div className="h-px bg-[var(--engine-border)]" />
            </>
          )}
          <div className="max-h-56 overflow-y-auto">{grade(EMOJIS, "todos")}</div>
        </div>
      )}
    </div>
  );
}
