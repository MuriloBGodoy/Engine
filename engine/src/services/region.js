// Região ativa de navegação (país + estado) — a preferência que decide QUAL
// conteúdo é priorizado para o usuário (feed da Community, anúncios/serviços).
// É separada do IDIOMA (i18n) e do ENDEREÇO do perfil: o usuário pode morar em
// SP, ter o app em inglês e navegar conteúdo do Rio. São três eixos distintos.
//
// Como as grandes plataformas (Webmotors, OLX, Mercado Livre) fazem, a região
// é resolvida por uma CASCATA de fontes — a mais forte ganha:
//   1. escolha explícita salva      (localStorage)
//   2. chute pelo idioma do navegador (navigator.languages / Accept-Language)
//   3. default do app                (sem filtro — "todas as regiões")
// Geo-IP "de verdade" fica para depois (precisa de header do host tipo
// Cloudflare ou de uma API externa) — o chute por idioma já cobre a
// maioria dos casos sem backend nenhum.

import {
  countries,
  getCountry,
  getStates,
  getStateName,
  inferLocation,
} from "./locations";

export const REGION_STORAGE_KEY = "engine_region";

// "all" em qualquer eixo = sem filtro naquele nível.
export const ALL_REGION = { country: "all", state: "all" };

const KNOWN_COUNTRY_CODES = new Set(countries.map((country) => country.code));

// País -> idioma preferido. Serve só para SUGERIR o idioma ao trocar de país
// (nunca forçar) — idioma e região seguem independentes.
// Só os três idiomas oferecidos (services/languages.js).
export const COUNTRY_TO_LANGUAGE = {
  BR: "pt-BR",
  PT: "pt-BR",
  US: "en-US",
  GB: "en-US",
  ES: "es-ES",
  AR: "es-ES",
  MX: "es-ES",
  CL: "es-ES",
  CO: "es-ES",
  FR: "en-US",
  DE: "en-US",
  IT: "en-US",
};

// Palpite pelo idioma base quando o locale não traz país (pt -> BR, es -> ES).
const LANGUAGE_BASE_TO_COUNTRY = {
  pt: "BR",
  es: "ES",
  en: "US",
  fr: "FR",
  de: "DE",
  it: "IT",
};

// Descobre o país a partir de uma lista de locales (ex.: ["pt-BR","en"]).
// Primeiro tenta o sufixo de região do locale (pt-BR -> BR); se não houver,
// cai no idioma base (pt -> BR). Retorna o código ou null.
export function guessCountryFromLanguages(langs) {
  const list = Array.isArray(langs) ? langs : [langs].filter(Boolean);
  for (const raw of list) {
    if (!raw) continue;
    const parts = String(raw).replace("_", "-").split("-");
    const region = parts[1]?.toUpperCase();
    if (region && KNOWN_COUNTRY_CODES.has(region)) return region;
    const base = parts[0]?.toLowerCase();
    if (base && LANGUAGE_BASE_TO_COUNTRY[base]) return LANGUAGE_BASE_TO_COUNTRY[base];
  }
  return null;
}

function readNavigatorLanguages() {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

// Garante o formato { country, state } e a coerência: estado precisa existir no
// país (senão vira "all"); país desconhecido também cai para "all".
export function normalizeRegion(region) {
  const rawCountry = region?.country;
  const country =
    rawCountry === "all" || KNOWN_COUNTRY_CODES.has(rawCountry) ? rawCountry : "all";
  if (country === "all") return { country: "all", state: "all" };
  const rawState = region?.state;
  if (!rawState || rawState === "all") return { country, state: "all" };
  const exists = getStates(country).some((state) => state.code === rawState);
  return { country, state: exists ? rawState : "all" };
}

export function readStoredRegion() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(REGION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.country !== "string") return null;
    return normalizeRegion(parsed);
  } catch {
    return null;
  }
}

export function writeStoredRegion(region) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify(normalizeRegion(region)));
  } catch {
    // Modo privado / quota cheia: segue só em memória.
  }
}

// Palpite SÍNCRONO (sem rede): localStorage -> idioma -> default. É o valor
// inicial instantâneo; a geo-IP (assíncrona) refina depois, se disponível.
export function resolveInitialRegion() {
  const stored = readStoredRegion();
  if (stored) return stored;
  const guessed = guessCountryFromLanguages(readNavigatorLanguages());
  if (guessed) return { country: guessed, state: "all" };
  return { country: "all", state: "all" };
}

// Busca a geo-IP da Edge Function do Netlify (/api/geo). Em dev/local ou fora
// do Netlify o endpoint não existe: falha silenciosa e devolve null (aí vale o
// palpite por idioma). Retorna { country, state } normalizado, ou null.
export async function fetchGeoRegion(signal) {
  try {
    const res = await fetch("/api/geo", { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.country) return null;
    return normalizeRegion({ country: data.country, state: data.subdivision || "all" });
  } catch {
    return null;
  }
}

// Rótulo curto para a UI (nome do estado ou do país). "all" é tratado na tela
// (com i18n), por isso aqui devolve null. Sem dependência de i18n de propósito.
export function regionShortLabel(region) {
  if (!region || region.country === "all") return null;
  const country = getCountry(region.country);
  if (!country) return null;
  if (region.state && region.state !== "all") {
    return getStateName(region.country, region.state) || country.name;
  }
  return country.name;
}

// loc = { country?, state?, city? }. Regra LENIENTE: conteúdo sem localização
// conhecida NUNCA é escondido (senão o feed esvazia). Quando só há cidade,
// tenta inferir país/estado pelo dataset de locations.
export function matchesRegion(region, loc) {
  if (!region || region.country === "all") return true;
  const inferred = loc?.city ? inferLocation(loc.city) : null;
  const country = loc?.country || inferred?.country;
  if (!country) return true; // localização desconhecida -> não esconde
  if (country !== region.country) return false;
  if (!region.state || region.state === "all") return true;
  const state = loc?.state || inferred?.state;
  if (!state) return true; // país bate, estado desconhecido -> mantém
  return state === region.state;
}

// Filtra uma lista pela região com PROTEÇÃO ANTI-TELA-VAZIA: se o filtro
// zeraria (ou deixaria abaixo de `minVisible`) a lista, devolve TUDO e marca
// widened=true, para a UI avisar "mostrando de outras regiões". É o que evita
// a péssima primeira impressão quando ainda há pouco conteúdo local.
export function applyRegionFilter(items, region, getLoc, { minVisible = 1 } = {}) {
  if (!region || region.country === "all") {
    return { items, widened: false };
  }
  const matched = items.filter((item) => matchesRegion(region, getLoc(item)));
  if (matched.length < minVisible && items.length > matched.length) {
    return { items, widened: true };
  }
  return { items: matched, widened: false };
}
