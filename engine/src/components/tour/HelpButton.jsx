import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CircleHelp, LifeBuoy, Mail, PlayCircle, Rocket, Sparkles } from "lucide-react";
import { BottomSheet } from "../BottomSheet";
import { SUPPORT_MAILTO } from "../../services/contact";
import { useTour } from "./TourProvider";
import { TOUR_ICONS } from "./tourIcons";
import "../../services/i18n-tour";

/**
 * O ponto de interrogação do topo — "o que eu faço nesta tela?".
 *
 * Ele é CONTEXTUAL de propósito. Um botão de ajuda que abre sempre o mesmo
 * índice obriga a pessoa a procurar duas vezes: primeiro na tela, depois no
 * índice. Este abre direto a tela em que ela está, com o que dá para fazer
 * ali, e oferece o passo a passo da mesma tela.
 *
 * A Central de Ajuda (/ajuda) continua existindo e fica no rodapé desta
 * folha: ela responde "como faço X", e esta folha responde "onde estou".
 */

function HelpSheet({ open, onClose, section, onStartTour, onStartGuide, resumeKey = "", t }) {
  if (!section) return null;
  const Icone = TOUR_ICONS[section.icon] || CircleHelp;
  const itens = Array.from({ length: section.bullets || 0 }, (_, i) => `b${i + 1}`);
  const temTour = Boolean(section.steps?.length);

  return (
    <BottomSheet open={open} onClose={onClose} title={t("tour.help.title")}>
      <div className="space-y-4 pb-2">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
            <Icone size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--engine-text-subtle)]">
              {t("tour.help.here")}
            </p>
            <h3 className="font-display text-lg font-bold leading-tight text-[var(--engine-text)]">
              {t(`tour.sections.${section.id}.title`)}
            </h3>
          </div>
        </div>

        <p className="text-[13px] font-medium leading-5 text-[var(--engine-text-muted)]">
          {t(`tour.sections.${section.id}.summary`)}
        </p>

        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
            {t("tour.help.whatToDo")}
          </p>
          <ul className="space-y-2">
            {itens.map((item, indice) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--engine-surface-2)] text-[11px] font-black text-[var(--engine-text-muted)]">
                  {indice + 1}
                </span>
                <span className="text-[13px] font-medium leading-5 text-[var(--engine-text)]">
                  {t(`tour.sections.${section.id}.${item}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {temTour ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onStartTour(section.id);
            }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:opacity-90"
          >
            <PlayCircle size={18} aria-hidden="true" />
            {t("tour.help.startTour")}
          </button>
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--engine-border-strong)] p-3 text-xs font-semibold text-[var(--engine-text-muted)]">
            {t("tour.help.noSteps")}
          </p>
        )}

        <div className="space-y-1 border-t border-[var(--engine-border)] pt-3">
          {/* Retomar vem ANTES de recomeçar, e só existe quando há onde
              voltar: quem saiu no capítulo 5 não quer ouvir as boas-vindas
              de novo para chegar onde já estava. */}
          {resumeKey && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartGuide(resumeKey);
              }}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-[var(--engine-accent-soft)] px-2 text-sm font-bold text-[var(--engine-accent)] transition hover:opacity-90"
            >
              <Rocket size={17} aria-hidden="true" />
              {t("tour.help.continueGuide")}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              onStartGuide("");
            }}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-sm font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]"
          >
            <Sparkles size={17} className="text-[var(--engine-accent)]" aria-hidden="true" />
            {t(resumeKey ? "tour.help.restartGuide" : "tour.help.fullGuide")}
          </button>
          <Link
            to="/ajuda"
            onClick={onClose}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-sm font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]"
          >
            <LifeBuoy size={17} className="text-[var(--engine-accent)]" aria-hidden="true" />
            {t("tour.help.center")}
          </Link>
          <a
            href={SUPPORT_MAILTO}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-sm font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]"
          >
            <Mail size={17} className="text-[var(--engine-accent)]" aria-hidden="true" />
            {t("tour.help.contact")}
          </a>
        </div>
      </div>
    </BottomSheet>
  );
}

export function HelpButton({ className = "" }) {
  const { t } = useTranslation();
  const { section, startSection, startJourney, resumeKey = "" } = useTour();
  const [aberta, setAberta] = useState(false);

  // Sem provider (uma tela fora do shell) o botão não tem o que explicar.
  if (!section) return null;

  return (
    <>
      <button
        type="button"
        data-tour="help-button"
        onClick={() => setAberta(true)}
        title={t("tour.help.button")}
        aria-label={t("tour.help.button")}
        className={`engine-help-button relative flex h-10 w-10 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] ${className}`}
      >
        <CircleHelp size={21} />
      </button>

      <HelpSheet
        open={aberta}
        onClose={() => setAberta(false)}
        section={section}
        onStartTour={startSection}
        onStartGuide={startJourney}
        resumeKey={resumeKey}
        t={t}
      />
    </>
  );
}
