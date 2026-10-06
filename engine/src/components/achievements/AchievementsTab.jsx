import { useTranslation } from "react-i18next";
import {
  ACHIEVEMENT_CATALOG,
  seriesTierId,
  visibleTiers,
} from "../../services/achievementTiers";
import { AchievementMilestone } from "./AchievementMilestone";
import { SERIES_ICON, formatTierLabel } from "./icons";

function formatNumber(value, language) {
  return new Intl.NumberFormat(language).format(Math.round(value) || 0);
}

/**
 * Uma série com degraus (Constância, Curtidas, Seguidores...). Mostra os
 * degraus batidos e só UM à frente — a regra de sempre, agora para toda série
 * (`visibleTiers`). O progresso numérico só aparece quando a tela sabe o valor
 * atual (`value`); quando não sabe, mostra só qual é o próximo degrau.
 */
function SeriesCard({ series, tiers, unlocked, value }) {
  const { t, i18n } = useTranslation();
  const Icon = SERIES_ICON[series];
  // Sem o valor, o "próximo" é o primeiro degrau ainda não conquistado.
  const known = typeof value === "number";
  const batidos = tiers.filter((tier) => unlocked.has(seriesTierId(series, tier)));
  const mostrar = known
    ? visibleTiers(tiers, value)
    : [...batidos, ...tiers.filter((tier) => !batidos.includes(tier)).slice(0, 1)];
  const proximo = mostrar.find((tier) => !unlocked.has(seriesTierId(series, tier)));
  const algum = batidos.length > 0;

  return (
    <div
      className={`rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3.5 ${
        algum ? "" : "opacity-80"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${
            algum
              ? "bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
              : "border border-dashed border-[var(--engine-border-strong)] bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)]"
          }`}
        >
          {Icon ? <Icon size={20} aria-hidden="true" /> : null}
        </div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-extrabold leading-tight text-[var(--engine-text)]">
            {t(`achievements.series.${series}.name`)}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[var(--engine-text-muted)]">
            {t(`achievements.series.${series}.desc`)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {mostrar.map((tier) => {
          const ok = unlocked.has(seriesTierId(series, tier));
          return (
            <span
              key={tier}
              className={`inline-flex min-h-[30px] items-center rounded-full border-[1.5px] px-3 text-[11.5px] font-black tabular-nums ${
                ok
                  ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                  : "border-dashed border-[var(--engine-border-strong)] text-[var(--engine-text-subtle)]"
              }`}
            >
              {formatTierLabel(tier)}
            </span>
          );
        })}
      </div>

      {proximo ? (
        known ? (
          <div className="mt-2.5">
            <span className="text-[11px] font-bold text-[var(--engine-text-muted)]">
              {t("achievements.seriesProgress", {
                atual: formatNumber(value, i18n.language),
                alvo: formatNumber(proximo, i18n.language),
              })}
            </span>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--engine-surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--engine-accent)] transition-[width] duration-500"
                style={{ width: `${Math.min((value / proximo) * 100, 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-2.5 text-[11px] font-bold text-[var(--engine-text-muted)]">
            {t("achievements.next", {
              label: t(`achievements.series.${series}.tier`, {
                alvo: formatNumber(proximo, i18n.language),
              }),
            })}
          </p>
        )
      ) : null}
    </div>
  );
}

/**
 * Aba Conquistas do perfil, por categoria (catálogo de 06/10/2026: Garagem e
 * metas, Diário de bordo, Comunidade, Clubes, Eventos, Simulador). Marco
 * travado aparece esmaecido, não some; série mostra os degraus batidos e só
 * um à frente.
 *
 * Visual provisório no estilo anterior: o redesenho da aba (Jesse) está em
 * aprovação. Componente puro: quem decide o que está desbloqueado é a camada
 * de dados, via `unlocked`. Os valores que a tela conhece (curtidas e
 * seguidores) vêm por props; as outras séries mostram só o próximo degrau.
 */
export function AchievementsTab({ unlocked = new Set(), likesReceived = 0, followersCount = 0 }) {
  const { t } = useTranslation();
  const values = { likes: likesReceived, followers: followersCount };

  return (
    <div className="space-y-8">
      {ACHIEVEMENT_CATALOG.map((category) => {
        const ids = category.items.flatMap((item) =>
          item.id ? [item.id] : item.tiers.map((tier) => seriesTierId(item.series, tier)),
        );
        const got = ids.filter((id) => unlocked.has(id)).length;
        return (
          <section key={category.key}>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-[var(--engine-text)]">
                {t(`achievements.categories.${category.key}`)}
              </h3>
              <span className="text-[11.5px] font-bold text-[var(--engine-text-muted)]">
                {t("achievements.categoryProgress", { atual: got, total: ids.length })}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {category.items.map((item) =>
                item.id ? (
                  <AchievementMilestone
                    key={item.id}
                    id={item.id}
                    state={unlocked.has(item.id) ? "unlocked" : "locked"}
                  />
                ) : (
                  <SeriesCard
                    key={item.series}
                    series={item.series}
                    tiers={item.tiers}
                    unlocked={unlocked}
                    value={values[item.series]}
                  />
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
