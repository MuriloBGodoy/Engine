import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

/**
 * Dica contextual para visitantes — explica o que se ganha ao entrar. Como o
 * Engine agora é aberto (dá pra explorar sem conta), esse empurrãozinho convida
 * a criar conta sem bloquear ninguém. Some ao ser fechado e não volta (lembrado
 * no localStorage).
 *
 * Duas formas, porque no celular a mesma peça não serve:
 *
 * - `top` / `bottom-right`: balão ancorado no botão "Entrar". Precisa estar
 *   dentro de um container `relative`. Só no desktop, onde sobra espaço ao lado
 *   do botão e o balão não cobre nada.
 *
 * - `dock`: barra presa acima da navegação inferior, desenhada num portal no
 *   `body`. O portal não é enfeite: o header do mobile usa `backdrop-blur`, e
 *   `backdrop-filter` cria bloco de contenção — um filho `position: fixed` passa
 *   a se posicionar pelo header em vez da tela. Medido em 21/08/2026: a barra
 *   ia parar em `top: -62px`, fora de vista. Se um dia ela voltar pra dentro do
 *   header sem o portal, some de novo.
 *
 *   No celular o balão de 240px
 *   pendurado no header cobria o título de todas as páginas públicas (medido em
 *   21/08/2026: tapava o H1 de Início, Serviços e Eventos, e como o header é
 *   `sticky` ele descia junto com a rolagem cobrindo o feed inteiro). Barra no
 *   rodapé é o padrão de convite a visitante em Reddit, X e Pinterest: fica na
 *   zona do polegar e não disputa espaço com o conteúdo.
 */
const STORAGE_KEY = "engine_guest_hint_dismissed";

export function GuestLoginHint({ placement = "top" }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (window.localStorage.getItem(STORAGE_KEY)) return undefined;
    // Pequeno atraso para o balão não "saltar" junto com o carregamento.
    const timer = window.setTimeout(() => setVisible(true), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // localStorage indisponível (modo privado): tudo bem, só não persiste.
    }
  };

  if (!visible) return null;

  if (placement === "dock") {
    if (typeof document === "undefined") return null;
    return createPortal(
      <div
        role="dialog"
        aria-label={t("guest.hint.title")}
        /* `bottom` acompanha a altura da barra inferior (~3.25rem) mais a área
           segura do aparelho, para a dica pousar logo acima dela. As laterais
           também: é `fixed`, então o padding do body não a afasta do notch em
           landscape. `engine-guest-dock` é o gancho do index.css que a recolhe
           enquanto o convite de instalação ocupa o mesmo trilho. */
        className="engine-guest-dock engine-rise fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-40 flex items-center gap-2 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] py-2 pl-3.5 pr-1 shadow-[var(--engine-shadow-md)] lg:hidden"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-tight text-[var(--engine-text)]">
            {t("guest.hint.title")}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[12px] leading-tight text-[var(--engine-text-muted)] max-[359px]:hidden">
            {t("guest.hint.desc")}
          </p>
        </div>
        <Link
          to="/register"
          onClick={dismiss}
          className="flex h-11 shrink-0 items-center rounded-full bg-[var(--engine-accent)] px-3.5 text-[13px] font-bold text-white transition active:scale-95"
        >
          {t("guest.hint.cta")}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("guest.hint.close")}
          /* 44x44: com w-9 o fechar media 36px de largura (HIG pede 44). */
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-subtle)] transition-colors active:bg-[var(--engine-surface-2)]"
        >
          <X size={16} />
        </button>
      </div>,
      document.body,
    );
  }

  const isTop = placement === "top";
  const boxPosition = isTop
    ? "bottom-full left-0 mb-2.5"
    : "top-full right-0 mt-2.5";
  const arrowPosition = isTop
    ? "bottom-[-5px] left-5 border-b border-r"
    : "top-[-5px] right-5 border-l border-t";

  return (
    <div
      role="dialog"
      className={`absolute z-50 w-60 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3.5 text-left shadow-[var(--engine-shadow-md)] engine-rise ${boxPosition}`}
    >
      <span
        aria-hidden="true"
        className={`absolute h-2.5 w-2.5 rotate-45 border-[var(--engine-border)] bg-[var(--engine-surface)] ${arrowPosition}`}
      />
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("guest.hint.close")}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg text-[var(--engine-text-subtle)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
      >
        <X size={14} />
      </button>
      <p className="pr-5 text-[13px] font-bold text-[var(--engine-text)]">
        {t("guest.hint.title")}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--engine-text-muted)]">
        {t("guest.hint.desc")}
      </p>
      <Link
        to="/register"
        onClick={dismiss}
        className="mt-2.5 inline-flex text-[12px] font-bold text-[var(--engine-accent)] hover:underline"
      >
        {t("guest.hint.cta")}
      </Link>
    </div>
  );
}
