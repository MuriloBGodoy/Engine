import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, EyeOff } from "lucide-react";
import { clubColorVars } from "../../services/clubStyles";
import { roleFromRow } from "../../services/clubRoles";
import { useIsDark } from "../../hooks/useIsDark";
import { ClubRoleBadge } from "../clubs/ClubRoleBadge";
import { EventTeamBadge } from "../events/EventTeamPanel";
import { MentionKindIcon } from "./MentionKindIcon";

/**
 * "No Engine": o que a pessoa é dentro do app, montado sozinho — clubes de
 * que é membro (com o cargo), páginas que administra e próximos eventos.
 *
 * Privacidade fica no banco (`profile_engine_presence`): clube só-membros só
 * aparece para quem é do clube, presença em evento só para quem tem conta,
 * bloqueio esconde tudo, e a pessoa pode esconder o bloco em Configurações.
 *
 * `bare` tira a moldura e o título: dentro de uma aba do perfil o cartão
 * dentro do cartão só empilhava borda.
 */
export function EngineBlock({ data, isOwn = false, bare = false }) {
  const { t, i18n } = useTranslation();
  const isDark = useIsDark();

  if (!data || data.hidden) return null;
  const clubs = data.clubs || [];
  const pages = data.pages || [];
  const events = data.events || [];
  if (!clubs.length && !pages.length && !events.length) return null;

  const chip =
    "flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-2.5 py-1.5 transition hover:border-[var(--engine-border-strong)]";
  const heading = "text-[10.5px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]";

  return (
    <section
      aria-labelledby={bare ? undefined : "engine-block-title"}
      aria-label={bare ? t("engineBlock.title") : undefined}
      className={
        bare
          ? "space-y-4"
          : "mb-4 space-y-2.5 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        {bare ? null : (
          <h3 id="engine-block-title" className="text-[13px] font-extrabold text-[var(--engine-text)]">
            {t("engineBlock.title")}
          </h3>
        )}
        {isOwn && data.hiddenForOthers ? (
          <Link to="/settings?section=privacy" className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--engine-text-muted)]">
            <EyeOff size={12} aria-hidden="true" />
            {t("engineBlock.onlyYou")}
          </Link>
        ) : null}
      </div>

      {clubs.length ? (
        <div className="space-y-1.5">
          <p className={heading}>{t("engineBlock.clubs")}</p>
          <div className="flex flex-wrap gap-1.5">
            {clubs.map((club) => (
              <Link key={club.id} to={`/clubs/${club.id}`} style={clubColorVars(club, isDark)} className={chip}>
                <MentionKindIcon kind="club" logo={club.logo} size={26} />
                <span className="min-w-0">
                  <span className="block max-w-[11rem] truncate text-[12.5px] font-bold text-[var(--engine-text)]">{club.name}</span>
                  <ClubRoleBadge role={roleFromRow(club.role || {})} showMember />
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {pages.length ? (
        <div className="space-y-1.5">
          <p className={heading}>{t("engineBlock.pages")}</p>
          <div className="flex flex-wrap gap-1.5">
            {pages.map((page) => (
              <Link key={page.id} to={page.path || `/p/${page.handle}`} className={chip}>
                <MentionKindIcon kind="page" avatar={page.logo} size={26} />
                <span className="min-w-0">
                  <span className="block max-w-[11rem] truncate text-[12.5px] font-bold text-[var(--engine-text)]">{page.name}</span>
                  <span className="block text-[11px] text-[var(--engine-text-muted)]">{t(`engineBlock.pageRoles.${page.role}`)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {events.length ? (
        <div className="space-y-1.5">
          <p className={heading}>{t("engineBlock.events")}</p>
          <ul className="space-y-1.5">
            {events.map((event) => (
              <li key={event.id}>
                <Link to={`/events/${event.id}`} className={chip}>
                  <CalendarDays size={16} aria-hidden="true" className="shrink-0 text-[var(--engine-accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[12.5px] font-bold leading-snug text-[var(--engine-text)]">{event.title}</span>
                    <span className="block whitespace-nowrap text-[11px] text-[var(--engine-text-muted)]">
                      {event.date
                        ? new Date(event.date).toLocaleDateString(i18n.language || "pt-BR", { day: "numeric", month: "short" })
                        : ""}
                    </span>
                  </span>
                  {event.role === "going" ? (
                    <span className="shrink-0 whitespace-nowrap text-[10.5px] font-bold text-[var(--engine-text-muted)]">{t("engineBlock.going")}</span>
                  ) : (
                    <span className="shrink-0">
                      <EventTeamBadge role={event.role} />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
