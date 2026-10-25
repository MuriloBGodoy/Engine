/**
 * "Entre e volte para onde estava": o `?next=` do login e do cadastro.
 *
 * Só aceita caminho INTERNO do app. Sem isto, `?next=https://golpe.com` (ou
 * `//golpe.com`, que o navegador lê como outro site) faria o login do Engine
 * mandar a pessoa, já logada e confiante, para uma página de phishing — o
 * redirecionamento aberto clássico.
 */

const BASE = "https://engine.invalid";
// Voltar para o próprio login/cadastro só criaria um laço.
const AUTH_PAGES = new Set(["/login", "/register", "/reset-password"]);

/** O caminho, se for interno e seguro; "" se não for. */
export function safeNextPath(raw) {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "";
  // Caractere de controle (quebra de linha, tab) é truque para o navegador
  // "consertar" o endereço em outro host.
  if ([...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return "";
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return "";
    if (AUTH_PAGES.has(url.pathname)) return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

/** Lê o `next` de um `location.search`. */
export const readNextPath = (search) => {
  try {
    return safeNextPath(new URLSearchParams(search || "").get("next"));
  } catch {
    return "";
  }
};

/** `/login?next=<caminho>` (ou `/register?...`); sem caminho válido, só a página. */
export const authPath = (page, next) => {
  const safe = safeNextPath(next);
  return safe ? `${page}?next=${encodeURIComponent(safe)}` : page;
};
