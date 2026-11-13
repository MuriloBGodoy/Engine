/**
 * Horário de post, comentário e mensagem no idioma de quem LÊ, sem chave de
 * tradução: o `Intl` do navegador já sabe dizer "há 5 minutos", "5 minutes
 * ago" e "hace 5 minutos".
 */

const UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

const toTime = (value) => {
  if (!value) return NaN;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? NaN : time;
};

/** "há 5 minutos" / "5 min ago" (`short`). Menos de 1 min: "agora". */
export const formatRelativeTime = (value, language = "pt-BR", { short = false } = {}) => {
  const time = toTime(value);
  if (Number.isNaN(time)) return "";
  // Relógio do aparelho atrasado não vira "daqui a 2 minutos".
  const diffSeconds = Math.min(0, Math.round((time - Date.now()) / 1000));
  const absSeconds = Math.abs(diffSeconds);
  try {
    const rtf = new Intl.RelativeTimeFormat(language, {
      // `auto` troca número por palavra: 7 dias viram "sem. passada" em
      // português e "last wk." em inglês. Num carimbo de feed isso é pior
      // de duas maneiras — ocupa mais espaço e informa menos, porque
      // "semana passada" cobre de 7 a 13 dias. Na forma curta, que é a do
      // feed, o número fica: "1 sem.". Na longa `auto` continua, porque
      // ali "ontem" realmente lê melhor que "há 1 dia".
      numeric: short ? "always" : "auto",
      style: short ? "short" : "long",
    });
    for (const [unit, size] of UNITS) {
      if (absSeconds >= size) return rtf.format(Math.round(diffSeconds / size), unit);
    }
    return rtf.format(0, "second");
  } catch {
    return "";
  }
};

/** "2 de novembro de 2026, 14:05" no idioma de quem lê. */
export const formatAbsoluteTime = (value, language = "pt-BR") => {
  const time = toTime(value);
  if (Number.isNaN(time)) return "";
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: "long", timeStyle: "short" }).format(time);
  } catch {
    return new Date(time).toLocaleString();
  }
};
