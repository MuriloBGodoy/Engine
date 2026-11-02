import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronUp, X } from "lucide-react";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import "../../services/i18n-shop";

/**
 * Casca do fluxo Anunciar: uma pergunta por tela (Airbnb), barra de progresso
 * em segmentos, "Voltar" em texto e "Continuar" sólido embaixo, e a prévia ao
 * vivo — no celular uma barrinha acima dos botões que abre a prévia inteira;
 * no desktop uma coluna fixa à direita.
 *
 * Quem decide os passos, guarda o rascunho e publica é a tela (Han). Aqui:
 *
 *   step        { title, sub?, content }        a pergunta da vez
 *   index/total posição (o contador e a barra)
 *   canNext     libera o Continuar
 *   isLast      troca "Continuar" por "Publicar"
 *   busy        publicando (botão travado)
 *   onBack/onNext/onExit/onSaveExit
 *   preview     o que vai na coluna/folha de prévia (null = sem prévia neste passo)
 *   previewMini { thumb, title, sub } da barrinha do celular (null = sem barra)
 *   previewLabel "Como vai aparecer" | "Sua página"
 *   previewNote  "No seu perfil e em Lojas"
 *
 * Ocupa a tela inteira (sem a navegação do app), como o Airbnb e o
 * Marketplace: é uma tarefa com começo e fim.
 */
export function ListingFlow({
  step,
  index,
  total,
  canNext,
  isLast = false,
  busy = false,
  onBack,
  onNext,
  onExit,
  onSaveExit,
  preview,
  previewMini,
  previewLabel,
  previewNote,
}) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = () => setSheetOpen(false);
  useHistoryDismiss(sheetOpen, closeSheet);

  const previewBlock = preview ? (
    <>
      <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em] text-[var(--engine-text-muted)]">
        <span className="h-[7px] w-[7px] rounded-full bg-[var(--engine-accent)]" aria-hidden="true" />
        {previewLabel || t("shop.flow.previewTitle")}
      </p>
      {preview}
      {previewNote && (
        <p className="mt-2.5 text-center text-xs font-semibold text-[var(--engine-text-muted)]">{previewNote}</p>
      )}
    </>
  ) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--engine-bg)]">
      <header className="sticky top-0 z-20 bg-[var(--engine-bg)] px-2 pb-2.5 pt-[calc(0.375rem+env(safe-area-inset-top))] lg:px-6 lg:pb-3.5 lg:pt-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onExit}
            aria-label={t("shop.flow.exit")}
            className="grid h-11 w-11 place-items-center rounded-xl text-[var(--engine-text)] hover:bg-[var(--engine-surface-2)]"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <span className="flex-1 text-center text-[13px] font-bold text-[var(--engine-text-muted)]" aria-live="polite">
            {index === 0 ? t("shop.flow.start") : t("shop.flow.stepOf", { current: index + 1, total })}
          </span>
          {onSaveExit ? (
            <button
              type="button"
              onClick={onSaveExit}
              className="min-h-11 px-1.5 text-[13px] font-bold text-[var(--engine-text)] underline underline-offset-[3px]"
            >
              {t("shop.flow.saveExit")}
            </button>
          ) : (
            <span className="w-11" />
          )}
        </div>
        <div
          className="mx-3 mt-1 flex gap-1"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
        >
          {Array.from({ length: total }, (_, i) => (
            <i
              key={i}
              className={`h-1 flex-1 rounded-sm transition-colors duration-300 ${
                i <= index ? "bg-[var(--engine-text)]" : "bg-[var(--engine-border-strong)]"
              }`}
            />
          ))}
        </div>
      </header>

      <div className="flex flex-1 justify-center gap-10 px-5 pb-6 pt-3 lg:px-12 lg:pb-10 lg:pt-7">
        <section className="min-w-0 max-w-[560px] flex-1">
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-[var(--engine-text)] lg:text-[30px]">
            {step.title}
          </h1>
          {step.sub && <p className="mt-2 text-[15px] text-[var(--engine-text-muted)]">{step.sub}</p>}
          <div className="mt-6 flex flex-col gap-4">{step.content}</div>
        </section>
        <aside className="hidden w-[320px] shrink-0 lg:block" aria-label={t("shop.flow.preview")}>
          <div className="sticky top-24">{previewBlock}</div>
        </aside>
      </div>

      <footer className="sticky bottom-0 z-20 border-t border-[var(--engine-border)] bg-[var(--engine-bg)]/90 px-4 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-xl lg:px-12 lg:py-3.5">
        {previewMini && preview && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="mb-2.5 flex w-full items-center gap-2.5 rounded-[14px] border border-[var(--engine-border)] bg-[var(--engine-surface)] p-1.5 text-left lg:hidden"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[var(--engine-surface-2)]">
              {previewMini.thumb}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] text-[var(--engine-text)]">{previewMini.title}</b>
              <span className="block truncate text-xs font-semibold text-[var(--engine-text-muted)]">{previewMini.sub}</span>
            </span>
            <span className="flex items-center gap-0.5 px-2 text-xs font-bold text-[var(--engine-text)]">
              {t("shop.flow.preview")}
              <ChevronUp size={16} aria-hidden="true" />
            </span>
          </button>
        )}
        <div className="mx-auto flex max-w-[940px] items-center justify-between gap-3">
          {index > 0 ? (
            <button
              type="button"
              onClick={onBack}
              className="min-h-12 px-1.5 font-bold text-[var(--engine-text)] underline underline-offset-[3px]"
            >
              {t("shop.flow.back")}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext || busy}
            className="inline-flex min-h-12 min-w-[150px] items-center justify-center gap-2 rounded-[14px] bg-[var(--engine-accent)] px-5 text-[15px] font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t("shop.flow.publishing") : isLast ? t("shop.flow.publish") : t("shop.flow.next")}
          </button>
        </div>
      </footer>

      {sheetOpen && previewBlock && (
        <>
          <div className="engine-drawer-scrim lg:hidden" onClick={closeSheet} aria-hidden="true" />
          <div className="engine-drawer p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden" role="dialog" aria-modal="true" aria-label={t("shop.flow.preview")}>
            <div className="mx-auto mb-3.5 h-[5px] w-10 rounded-full bg-[var(--engine-border-strong)]" aria-hidden="true" />
            <div className="overflow-y-auto">{previewBlock}</div>
            <button
              type="button"
              onClick={closeSheet}
              className="mt-4 min-h-12 w-full rounded-[14px] border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] font-bold text-[var(--engine-text)]"
            >
              {t("shop.flow.close")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Tela final: "Publicado." (ou "Enviado." quando vai pra revisão). */
export function ListingFlowDone({ pending = false, body, card, onSeeShowcase, onAnother, onExit }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--engine-bg)]">
      <div className="px-2 pt-[calc(0.375rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onExit}
          aria-label={t("shop.flow.close")}
          className="grid h-11 w-11 place-items-center rounded-xl text-[var(--engine-text)] hover:bg-[var(--engine-surface-2)]"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--engine-text)] text-[var(--engine-bg)]">
          <Check size={30} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <h1 className="font-display text-[26px] font-bold text-[var(--engine-text)]">
          {pending ? t("shop.done.pendingTitle") : t("shop.done.title")}
        </h1>
        <p className="max-w-xs text-[var(--engine-text-muted)]">{pending ? t("shop.done.bodyPending") : body}</p>
        {card && <div className="my-2 w-[200px]">{card}</div>}
        <div className="flex flex-wrap justify-center gap-2.5">
          {onSeeShowcase && (
            <button
              type="button"
              onClick={onSeeShowcase}
              className="inline-flex min-h-12 items-center rounded-[14px] bg-[var(--engine-accent)] px-5 font-bold text-white"
            >
              {t("shop.done.seeShowcase")}
            </button>
          )}
          {onAnother && (
            <button
              type="button"
              onClick={onAnother}
              className="inline-flex min-h-12 items-center rounded-[14px] border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] px-5 font-bold text-[var(--engine-text)]"
            >
              {t("shop.done.another")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Linha do "Tudo certo?" com o Editar que pula pro passo. */
export function ReviewRow({ label, children, onEdit }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 border-b border-[var(--engine-border)] py-3.5 last:border-b-0">
      <span className="w-[92px] shrink-0 text-[13px] font-semibold text-[var(--engine-text-muted)]">{label}</span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--engine-text)]">{children}</span>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="min-h-11 px-1 text-[13px] font-bold text-[var(--engine-text)] underline underline-offset-[3px]"
        >
          {t("shop.review.edit")}
        </button>
      )}
    </div>
  );
}

/** Caixa que agrupa as ReviewRow. */
export function ReviewList({ children }) {
  return <div className="engine-card px-3.5">{children}</div>;
}
