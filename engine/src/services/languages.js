/**
 * Idiomas que o Engine oferece.
 *
 * Desde 28/10/2026 só os três com tradução completa: pt-BR, en-US e es-ES.
 * Os outros doze (pt-PT, en-GB, es-MX, es-AR, de, fr, it, ja, zh, ko, hi, ar)
 * tinham meia dúzia de chaves traduzidas e caíam no inglês ou no português no
 * meio da tela. As traduções parciais continuam no i18n.js — só deixaram de
 * ser oferecidas e de valer como idioma ativo.
 *
 * pt-PT, en-GB, es-MX e es-AR já eram o mesmo texto de pt-BR, en-US e es-ES
 * (o i18n.js aponta um para o outro), então quem estava num deles não perde
 * nada: vira o idioma-base.
 */
export const languageOptions = [
  { value: "pt-BR", region: "BR", labelKey: "settings.options.portugueseBrazil" },
  { value: "en-US", region: "US", labelKey: "settings.options.englishUS" },
  { value: "es-ES", region: "ES", labelKey: "settings.options.spanishSpain" },
];

export const supportedLngs = languageOptions.map((option) => option.value);

// Idioma que não oferecemos (navegador em japonês, escolha antiga "de-DE"
// salva na conta) cai aqui: o inglês é o que mais gente lê fora do pt/es.
const DEFAULT_FOREIGN = "en-US";

const BASE_TO_SUPPORTED = { pt: "pt-BR", en: "en-US", es: "es-ES" };

/**
 * Leva qualquer código de idioma a um dos três oferecidos.
 * "pt-PT" → "pt-BR", "es-MX" → "es-ES", "ja-JP" → "en-US", "" → "".
 * Vazio continua vazio: quer dizer "seguir o navegador".
 */
export function normalizeLanguage(value) {
  const raw = String(value || "").trim().replace("_", "-");
  if (!raw) return "";
  if (supportedLngs.includes(raw)) return raw;
  const base = raw.split("-")[0].toLowerCase();
  return BASE_TO_SUPPORTED[base] || DEFAULT_FOREIGN;
}

/**
 * Primeiro idioma da lista (navigator.languages) que tem um dos três; se
 * nenhum tiver, inglês. Ao contrário de normalizar só o primeiro, quem tem o
 * navegador em ["ja-JP", "pt-BR"] fica em português, não em inglês.
 */
export function pickSupportedLanguage(list) {
  for (const value of list || []) {
    const raw = String(value || "").trim().replace("_", "-");
    if (!raw) continue;
    if (supportedLngs.includes(raw)) return raw;
    const base = BASE_TO_SUPPORTED[raw.split("-")[0].toLowerCase()];
    if (base) return base;
  }
  return DEFAULT_FOREIGN;
}
