import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Maximize2, RefreshCw } from "lucide-react";
import { WhatsAppIcon } from "./ListingParts";
import {
  METRICS_TRACKING_SINCE,
  metricsWindowStart,
  summarizeListingMonth,
  todayInSaoPaulo,
} from "../../services/listingMonth";
import { getServiceListingMetricsDaily } from "../../services/serviceListingPublic";

/**
 * "Seu mês": o retorno do anúncio, mês a mês, só para o dono.
 *
 * Existe por um motivo comercial: no segundo mês o prestador pergunta
 * "quantos clientes vieram daí?". O número que importa é o de contatos; os
 * outros dois mostram o caminho até ele, e a origem mostra se o link da bio
 * está trazendo gente.
 *
 * Grátis para todos (decisão de 24/10/2026). O histórico longo e o relatório
 * um dia serão do Pro; este mês e o anterior, não.
 *
 * Honestidade antes de tudo: a contagem por dia começou em 24/10/2026. O
 * painel escreve isso em vez de mostrar zero ou comparar com um mês que não
 * foi contado.
 */

const METRIC_META = {
  view: { icon: Eye },
  detail: { icon: Maximize2 },
  whatsapp: { icon: WhatsAppIcon },
};
const METRIC_ORDER = ["view", "detail", "whatsapp"];

// Peso de cada origem na barra: quem abriu ou chamou vale mais que quem só
// viu o card passar na busca; sem nenhum dos dois, conta a aparição.
const sourceWeight = (item) => item.detail + item.whatsapp || item.view;

const formatDay = (day, lang, options) =>
  new Intl.DateTimeFormat(lang, { timeZone: "UTC", ...options }).format(new Date(`${day}T12:00:00Z`));

function useDailyMetrics(listingId, enabled) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: "", rows: [], error: null });
  const requestKey = `${listingId}:${attempt}`;

  useEffect(() => {
    if (!enabled || !listingId) return undefined;
    let alive = true;
    const today = todayInSaoPaulo();
    getServiceListingMetricsDaily(listingId, metricsWindowStart(today))
      .then((rows) => {
        if (alive) setResult({ key: `${listingId}:${attempt}`, rows, error: null });
      })
      .catch((error) => {
        if (alive) setResult({ key: `${listingId}:${attempt}`, rows: [], error });
      });
    return () => {
      alive = false;
    };
  }, [listingId, enabled, attempt]);

  return {
    loading: enabled && result.key !== requestKey,
    rows: result.key === requestKey ? result.rows : [],
    error: result.key === requestKey ? result.error : null,
    retry: () => setAttempt((value) => value + 1),
  };
}

function DailyBars({ daily, metric, lang, t }) {
  const max = Math.max(1, ...daily.map((day) => day[metric]));
  const width = daily.length * 10;
  const height = 64;
  const busiest = daily.reduce((best, day) => (day[metric] > (best?.[metric] || 0) ? day : best), null);
  const total = daily.reduce((sum, day) => sum + day[metric], 0);

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("services.month.chartLabel", {
          metric: t(`services.month.metrics.${metric}.short`),
          total,
          busiest: busiest ? formatDay(busiest.day, lang, { day: "numeric", month: "short" }) : "—",
        })}
        className="block h-16 w-full"
      >
        {daily.map((day, index) => {
          const x = index * 10 + 1.5;
          const value = day[metric];
          if (day.status === "untracked" || day.status === "future") {
            return (
              <rect
                key={day.day}
                x={x}
                y={height - 2}
                width={7}
                height={2}
                rx={1}
                className={day.status === "untracked" ? "fill-[var(--engine-border)]" : "fill-[var(--engine-surface-2)]"}
              >
                <title>
                  {formatDay(day.day, lang, { day: "numeric", month: "short" })}
                  {day.status === "untracked" ? ` — ${t("services.month.notCounted")}` : ""}
                </title>
              </rect>
            );
          }
          const barHeight = value ? Math.max(4, (value / max) * (height - 6)) : 2;
          return (
            <rect
              key={day.day}
              x={x}
              y={height - barHeight}
              width={7}
              height={barHeight}
              rx={1.5}
              className={
                value
                  ? day.status === "today"
                    ? "fill-[var(--engine-accent)]"
                    : "fill-[var(--engine-accent)] opacity-75"
                  : "fill-[var(--engine-border-strong)]"
              }
            >
              <title>{`${formatDay(day.day, lang, { day: "numeric", month: "short" })}: ${value}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 flex justify-between text-[11px] font-semibold text-[var(--engine-text-muted)]">
        <span>{formatDay(daily[0].day, lang, { day: "numeric", month: "short" })}</span>
        <span>{formatDay(daily[daily.length - 1].day, lang, { day: "numeric", month: "short" })}</span>
      </figcaption>
    </figure>
  );
}

export function ListingMonthPanel({ listing }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || "pt-BR";
  const approved = listing.moderationStatus === "approved";
  const { loading, rows, error, retry } = useDailyMetrics(listing.id, approved);
  const [metric, setMetric] = useState("detail");
  const summary = useMemo(() => summarizeListingMonth(rows), [rows]);
  const { thisMonth, lastMonth, deltas, sources } = summary;
  const monthName = formatDay(thisMonth.start, lang, { month: "long" });
  const lastMonthName = formatDay(lastMonth.start, lang, { month: "long" });
  const since = formatDay(METRICS_TRACKING_SINCE, lang, { day: "2-digit", month: "2-digit" });

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-widest text-[var(--engine-accent)]">
          {t("services.month.eyebrow")}
        </p>
        <h3 className="mt-1 font-display text-lg font-extrabold capitalize leading-6 text-[var(--engine-text)]">
          {monthName}
        </h3>
      </div>
      <span className="shrink-0 rounded-full border border-[var(--engine-border)] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
        {t("services.month.onlyYou")}
      </span>
    </div>
  );

  if (!approved) {
    return (
      <section className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4">
        {header}
        <p className="mt-3 text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
          {t("services.month.notApproved")}
        </p>
      </section>
    );
  }

  const comparison = (key) => {
    if (lastMonth.coverage === "none") return t("services.month.noLastMonth", { since });
    if (lastMonth.coverage === "partial") {
      return t("services.month.lastMonthPartial", {
        month: lastMonthName,
        value: lastMonth.totals[key],
        since,
      });
    }
    const delta = deltas[key];
    if (delta === null) return t("services.month.lastMonthValue", { month: lastMonthName, value: lastMonth.totals[key] });
    if (delta === 0) return t("services.month.sameAsLast");
    return t(delta > 0 ? "services.month.up" : "services.month.down", { value: Math.abs(delta) });
  };

  return (
    <section className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4" aria-busy={loading}>
      {header}

      {thisMonth.coverage === "partial" && (
        <p className="mt-2 text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
          {t("services.month.countingSince", { since })}
        </p>
      )}

      {error ? (
        <div className="mt-4 rounded-lg bg-[var(--engine-surface-2)] p-3">
          <p className="text-sm font-semibold text-[var(--engine-text)]">{t("services.month.loadError")}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-xs font-black uppercase tracking-widest text-[var(--engine-accent)]"
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t("services.month.retry")}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label={t("services.month.pickMetric")}>
            {METRIC_ORDER.map((key) => {
              const Icon = METRIC_META[key].icon;
              const active = metric === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMetric(key)}
                  className={`flex min-h-[104px] min-w-0 flex-col rounded-lg border p-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)] ${
                    active
                      ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)]"
                      : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] hover:border-[var(--engine-border-strong)]"
                  }`}
                >
                  <Icon size={15} className={active ? "text-[var(--engine-accent)]" : "text-[var(--engine-text-muted)]"} />
                  <span className="mt-1.5 font-display text-2xl font-extrabold leading-7 text-[var(--engine-text)]">
                    {loading ? <span className="inline-block h-6 w-8 animate-pulse rounded bg-[var(--engine-border)] motion-reduce:animate-none" /> : thisMonth.totals[key]}
                  </span>
                  <span className="mt-1 text-[11px] font-bold leading-4 text-[var(--engine-text-muted)]">
                    {t(`services.month.metrics.${key}.label`)}
                  </span>
                </button>
              );
            })}
          </div>

          {!loading && (
            <p className="mt-2 text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
              <span className="font-bold text-[var(--engine-text)]">{t(`services.month.metrics.${metric}.short`)}:</span>{" "}
              {comparison(metric)}
            </p>
          )}

          {!loading && summary.hasAnyThisMonth && (
            <DailyBars daily={summary.daily} metric={metric} lang={lang} t={t} />
          )}

          {!loading && !summary.hasAnyThisMonth && (
            <div className="mt-4 rounded-lg border border-dashed border-[var(--engine-border-strong)] p-3">
              <p className="text-sm font-bold text-[var(--engine-text)]">{t("services.month.emptyTitle")}</p>
              <p className="mt-1 text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
                {t("services.month.emptyCopy", { since })}
              </p>
            </div>
          )}

          {!loading && sources.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
                {t("services.month.sourcesTitle")}
              </p>
              <ul className="mt-2 grid gap-2.5">
                {sources.map((item) => {
                  const value = sourceWeight(item);
                  const peak = Math.max(1, ...sources.map(sourceWeight));
                  return (
                    <li key={item.source} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-bold text-[var(--engine-text)]">
                          {t(`services.month.sources.${item.source}`)}
                        </span>
                        <span className="shrink-0 font-semibold text-[var(--engine-text-muted)]">
                          {item.detail + item.whatsapp > 0
                            ? t("services.month.sourceLine", { opened: item.detail, contacts: item.whatsapp })
                            : t("services.month.sourceViews", { value: item.view })}
                        </span>
                      </div>
                      <svg
                        viewBox="0 0 100 6"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        className="mt-1 block h-1.5 w-full"
                      >
                        <rect width="100" height="6" rx="3" className="fill-[var(--engine-surface-2)]" />
                        <rect
                          width={Math.max(6, (value / peak) * 100)}
                          height="6"
                          rx="3"
                          className="fill-[var(--engine-accent)]"
                        />
                      </svg>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="mt-4 border-t border-[var(--engine-border)] pt-3 text-[11px] font-medium leading-5 text-[var(--engine-text-muted)]">
        {t("services.month.lifetime", {
          opened: listing.detailCount || 0,
          contacts: listing.whatsappCount || 0,
        })}
      </p>
    </section>
  );
}
