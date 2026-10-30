import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, Loader2, Star } from "lucide-react";
import { ClubEmblem } from "./ClubEmblem";
import { GhostCar } from "./GhostCar";
import { useClubMembership, clubErrorMessage } from "./clubsDataSource";
import { useToast } from "../ToastProvider";
import { useIsDark } from "../../hooks/useIsDark";
import {
  clubColorVars,
  clubFocusChips,
  clubPlaceLabel,
} from "../../services/clubStyles";

/**
 * O card do clube na descoberta e em "meus clubes".
 *
 * O card antigo tinha um retângulo cinza de 160px esperando uma foto que
 * ninguém subia, um selo de categoria de uma lista fixa de quatro em inglês e
 * duas contagens. Três clubes diferentes saíam idênticos — era esse o "nem
 * parece personalizável".
 *
 * Aqui cada linha é identidade: faixa na cor do clube com a silhueta (ou a
 * capa que a direção subiu), logo ou emblema gerado, a sigla que o membro carrega, cidade e ano, dois chips de foco, e o
 * PRÓXIMO ENCONTRO, que é o único dado que prova que o clube está vivo.
 */
export function ClubCard({ club, onOpen, onJoined, showRole = false }) {
  // A paleta tem uma tinta por tema; sem passar isDark o componente
  // usava sempre a do tema claro, e cor escura sumia no fundo escuro.
  const isDark = useIsDark();
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  // O hook de entrada é POR CARD de propósito: com um hook só no pai, o
  // clubId chegava defasado um render (o `setState` do id e a chamada de
  // `join()` acontecem no mesmo tique) e a pessoa entrava no clube errado.
  const { join, loading: joining } = useClubMembership(club?.id);
  const [pending, setPending] = useState(false);
  if (!club) return null;

  const place = clubPlaceLabel(club, t);
  const focus = clubFocusChips(club, t);
  const isMember = Boolean(club.myRole);
  const meetupDate = club.nextMeetup?.eventDate
    ? new Date(club.nextMeetup.eventDate).toLocaleDateString(i18n.language || "pt-BR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : "";

  const requested = pending || club.myRequestPending;
  const joinLabel = requested
    ? t("clubs.join.pending")
    : club.joinPolicy === "approval"
      ? t("clubs.join.approval")
      : t("clubs.join.open");

  const handleJoin = async () => {
    try {
      await join();
      const approval = club.joinPolicy === "approval";
      if (approval) setPending(true);
      showToast(approval ? t("clubs.join.requested") : t("clubs.join.joined"), "success");
      onJoined?.(club);
    } catch (error) {
      showToast(clubErrorMessage(error, t), "error");
    }
  };

  return (
    <div
      style={clubColorVars(club, isDark)}
      className="flex flex-col overflow-hidden rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] shadow-[var(--engine-shadow-sm)]"
    >
      <button
        type="button"
        onClick={() => onOpen?.(club.id)}
        className="flex-1 text-left"
      >
        <div className="relative h-20 overflow-hidden bg-[linear-gradient(120deg,var(--club)_0%,var(--club-2)_100%)]">
          {club.coverUrl ? (
            // Capa própria por cima do gradiente: se a foto falhar, a faixa
            // na cor do clube continua ali embaixo.
            <img
              src={club.coverUrl}
              alt=""
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              <GhostCar className="absolute -bottom-1.5 -right-2 w-[150px] opacity-30" />
              <span className="absolute inset-0 bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.10)_0_2px,transparent_2px_26px)]" />
            </>
          )}
          {club.official ? (
            <span className="absolute left-2.5 top-2 inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
              <Star size={10} className="fill-current" />
              {t("clubs.official")}
            </span>
          ) : null}
        </div>

        <div className="px-3.5 pb-3.5">
          {/* Só o emblema sobe para dentro da faixa. Subindo o bloco de texto
              junto, a linha da sigla ficava POR CIMA da faixa colorida — texto
              na cor do clube sobre a cor do clube, ou seja, invisível. */}
          <div className="relative flex items-start gap-3 pt-2">
            <ClubEmblem club={club} size={64} className="-mt-8" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-[color-mix(in_srgb,var(--club)_42%,transparent)] bg-[color-mix(in_srgb,var(--club)_18%,transparent)] px-1.5 py-0.5 font-mono text-[11px] font-extrabold tracking-wide text-[var(--club-ink)]">
                  [{club.tag}]
                </span>
                {showRole && club.myRole ? (
                  <span className="rounded bg-[var(--engine-surface-2)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--engine-text-muted)]">
                    {t(`clubs.roles.${club.myRole}`)}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-0.5 text-[16px] font-extrabold leading-tight tracking-tight text-[var(--engine-text)]">
                {club.name}
              </h3>
              <p className="mt-0.5 text-[12.5px] text-[var(--engine-text-muted)]">
                {place}
                {club.foundedYear ? ` · ${t("clubs.since", { year: club.foundedYear })}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {focus.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-[var(--engine-surface-2)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--engine-text-muted)]"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[var(--engine-border)] pt-2.5 text-[12.5px] text-[var(--engine-text-muted)]">
            {/* A contagem inteira vem do i18n (plural incluso): quebrar em
                número + rótulo para pôr o negrito daria uma frase montada
                que nenhum tradutor consegue reordenar. */}
            <span className="font-semibold text-[var(--engine-text)]">
              {t("clubs.stats.members", { count: club.memberCount || 0 })}
            </span>
            {meetupDate ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--club)_14%,transparent)] px-2 py-1 font-bold text-[var(--club-ink)]">
                <Calendar size={13} />
                {meetupDate}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      <div className="px-3.5 pb-3.5">
        {isMember ? (
          <button
            type="button"
            onClick={() => onOpen?.(club.id)}
            className="flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--engine-border-strong)] px-4 text-[14px] font-bold text-[var(--engine-text)] transition-colors hover:border-[var(--club)]"
          >
            {t("clubs.join.member")}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleJoin}
            disabled={joining || requested}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--club)] px-4 text-[14px] font-bold text-[var(--club-on)] transition disabled:opacity-60"
          >
            {joining ? <Loader2 size={16} className="animate-spin" /> : null}
            {joinLabel}
          </button>
        )}
      </div>
    </div>
  );
}
