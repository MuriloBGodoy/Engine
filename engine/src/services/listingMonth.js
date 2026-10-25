/**
 * "Seu mês" do prestador: o que as métricas por dia dizem sobre este mês e o
 * anterior. Cálculo puro, sem banco e sem React — a tela só desenha.
 *
 * Regra que manda em tudo aqui: nunca inventar número. A contagem por dia
 * começou em 24/10/2026 (migration listing_metrics_daily). Antes disso não há
 * dado, e "0" antes dessa data seria mentira — então cada período sabe se foi
 * contado inteiro, em parte ou nada, e a tela escreve isso em vez de comparar
 * um mês cheio com um mês que não existiu.
 */

export const METRICS_TRACKING_SINCE = "2026-10-24";
export const METRICS_TIMEZONE = "America/Sao_Paulo";
export const LISTING_METRICS = ["view", "detail", "whatsapp"];
export const LISTING_SOURCES = ["search", "link", "profile", "community", "direct"];

const pad = (value) => String(value).padStart(2, "0");
const toDay = (year, monthIndex, day) => `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
const parseDay = (day) => {
  const [year, month, date] = String(day).split("-").map(Number);
  return { year, monthIndex: month - 1, date };
};
const daysInMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
const emptyTotals = () => ({ view: 0, detail: 0, whatsapp: 0 });

/**
 * O "hoje" do prestador (AAAA-MM-DD). É o dia de São Paulo, o mesmo que o
 * banco usa para gravar a contagem — senão às 22h o painel já virava o dia.
 */
export const todayInSaoPaulo = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: METRICS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

/** Primeiro dia do mês passado: é dali que o painel precisa ler. */
export const metricsWindowStart = (today) => {
  const { year, monthIndex } = parseDay(today);
  const last = monthIndex === 0 ? { year: year - 1, monthIndex: 11 } : { year, monthIndex: monthIndex - 1 };
  return toDay(last.year, last.monthIndex, 1);
};

/**
 * Quanto de um período foi contado: "none" (acabou antes de 24/10), "partial"
 * (começou antes e terminou depois) ou "full".
 */
const trackingCoverage = (start, end) => {
  if (end < METRICS_TRACKING_SINCE) return "none";
  if (start < METRICS_TRACKING_SINCE) return "partial";
  return "full";
};

const periodOf = (year, monthIndex, uptoDay) => {
  const start = toDay(year, monthIndex, 1);
  const end = uptoDay || toDay(year, monthIndex, daysInMonth(year, monthIndex));
  const coverage = trackingCoverage(start, end);
  return {
    key: `${year}-${pad(monthIndex + 1)}`,
    year,
    monthIndex,
    start,
    end,
    coverage,
    countedFrom: coverage === "partial" ? METRICS_TRACKING_SINCE : start,
    totals: emptyTotals(),
  };
};

/**
 * Variação deste mês contra o passado, só quando a comparação é justa: o mês
 * passado contado inteiro e com algum movimento. Sem isso, `null` — e a tela
 * mostra o número do mês passado com a ressalva, sem porcentagem.
 *
 * O mês corrente está pela metade, então a comparação é contra o MESMO
 * trecho do mês passado (dia 1 até o dia de hoje), não contra o mês inteiro.
 */
const fairDelta = (current, previousSameSpan, coverage) => {
  if (coverage !== "full" || previousSameSpan <= 0) return null;
  return Math.round(((current - previousSameSpan) / previousSameSpan) * 100);
};

/**
 * @param {Array<{day: string, metric: string, source: string, count: number}>} rows
 * @param {string} today AAAA-MM-DD, no fuso de São Paulo
 */
export function summarizeListingMonth(rows = [], today = todayInSaoPaulo()) {
  const now = parseDay(today);
  const thisMonth = periodOf(now.year, now.monthIndex, today);
  thisMonth.daysInMonth = daysInMonth(now.year, now.monthIndex);

  const lastRef = now.monthIndex === 0
    ? { year: now.year - 1, monthIndex: 11 }
    : { year: now.year, monthIndex: now.monthIndex - 1 };
  const lastMonth = periodOf(lastRef.year, lastRef.monthIndex);
  // Mesmo trecho do mês passado (1 até o dia de hoje, ou o fim do mês se ele
  // for mais curto), para a variação comparar coisas do mesmo tamanho.
  const sameSpanEnd = toDay(
    lastRef.year,
    lastRef.monthIndex,
    Math.min(now.date, daysInMonth(lastRef.year, lastRef.monthIndex)),
  );
  const lastSameSpan = emptyTotals();

  const byDay = {};
  const bySource = {};

  for (const row of rows) {
    if (!LISTING_METRICS.includes(row.metric)) continue;
    const count = Number(row.count) || 0;
    if (row.day >= thisMonth.start && row.day <= thisMonth.end) {
      thisMonth.totals[row.metric] += count;
      byDay[row.day] = byDay[row.day] || emptyTotals();
      byDay[row.day][row.metric] += count;
      const source = LISTING_SOURCES.includes(row.source) ? row.source : "direct";
      bySource[source] = bySource[source] || emptyTotals();
      bySource[source][row.metric] += count;
    } else if (row.day >= lastMonth.start && row.day <= lastMonth.end) {
      lastMonth.totals[row.metric] += count;
      if (row.day <= sameSpanEnd) lastSameSpan[row.metric] += count;
    }
  }

  const daily = [];
  for (let date = 1; date <= thisMonth.daysInMonth; date += 1) {
    const day = toDay(now.year, now.monthIndex, date);
    const status =
      day < METRICS_TRACKING_SINCE ? "untracked" : day > today ? "future" : day === today ? "today" : "past";
    daily.push({ day, date, status, ...(byDay[day] || emptyTotals()) });
  }

  const sources = LISTING_SOURCES.map((source) => ({ source, ...(bySource[source] || emptyTotals()) }))
    .filter((item) => item.view + item.detail + item.whatsapp > 0)
    .sort((a, b) => b.detail + b.whatsapp - (a.detail + a.whatsapp) || b.view - a.view);

  const deltas = Object.fromEntries(
    LISTING_METRICS.map((metric) => [
      metric,
      fairDelta(thisMonth.totals[metric], lastSameSpan[metric], lastMonth.coverage),
    ]),
  );

  return {
    today,
    thisMonth,
    lastMonth,
    lastSameSpan,
    deltas,
    daily,
    sources,
    hasAnyThisMonth: LISTING_METRICS.some((metric) => thisMonth.totals[metric] > 0),
  };
}
