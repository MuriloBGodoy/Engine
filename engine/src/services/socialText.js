/**
 * Texto de post e comentário: #hashtags, @menções e links, no mesmo critério
 * do banco (`extract_hashtags` / `extract_mentions`, migration
 * 20261102150000). Se a regra mudar lá, muda aqui — senão a tela desenha como
 * tag algo que a página da tag nunca vai achar.
 *
 * - Tag: letras ASCII e latinas com acento (pt, es, fr, de, pl...), número e
 *   `_`; até 50; só número não vale (#2024). Normalizada em minúsculas, acento
 *   preservado (#Manutenção e #manutenção são a mesma; #manutencao é outra,
 *   como no Instagram).
 * - Menção: `@usuario` como o @ do perfil (a-z, 0-9, ponto e `_`, até 24).
 *   E-mail não conta: a arroba precisa vir depois de espaço ou pontuação.
 */

export const MAX_HASHTAGS = 30;
export const MAX_TAG_LENGTH = 50;

const TAG_CHARS = "0-9A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F";
const LETTER = /[A-Za-zÀ-ÖØ-öø-ɏ]/;

const HASHTAG = new RegExp(`(^|[^${TAG_CHARS}&#/])#([${TAG_CHARS}]+)`, "g");
const MENTION = /(^|[^0-9A-Za-z_.@/])@([A-Za-z0-9._]{1,30})/g;
const URL = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/** `#Manutenção` → `manutenção`; inválida → "". */
export const normalizeTag = (value = "") => {
  const tag = String(value || "")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase();
  if (!tag || tag.length > MAX_TAG_LENGTH) return "";
  if (!new RegExp(`^[${TAG_CHARS}]+$`).test(tag) || !LETTER.test(tag)) return "";
  return tag;
};

/** Tags únicas, na ordem em que aparecem. */
export const extractHashtags = (text = "") => {
  const seen = new Set();
  for (const match of String(text || "").matchAll(HASHTAG)) {
    const tag = normalizeTag(match[2]);
    if (tag) seen.add(tag);
  }
  return [...seen];
};

const cleanMention = (raw = "") => String(raw).toLowerCase().replace(/\.+$/, "");

export const extractMentions = (text = "") => {
  const seen = new Set();
  for (const match of String(text || "").matchAll(MENTION)) {
    const name = cleanMention(match[2]);
    if (name && name.length <= 24) seen.add(name);
  }
  return [...seen];
};

/**
 * Partes do texto, na ordem: `{type: "text"|"hashtag"|"mention"|"url", value,
 * tag?, username?}`. O `value` é o trecho original (com # ou @), para a tela
 * mostrar exatamente o que a pessoa escreveu.
 */
export function parseSocialText(text = "") {
  const source = String(text || "");
  const marks = [];

  for (const match of source.matchAll(URL)) {
    marks.push({ start: match.index, end: match.index + match[0].length, type: "url", value: match[0] });
  }
  const insideUrl = (index) => marks.some((mark) => mark.type === "url" && index >= mark.start && index < mark.end);

  for (const match of source.matchAll(HASHTAG)) {
    const start = match.index + match[1].length;
    const tag = normalizeTag(match[2]);
    if (!tag || insideUrl(start)) continue;
    marks.push({ start, end: start + 1 + match[2].length, type: "hashtag", value: `#${match[2]}`, tag });
  }
  for (const match of source.matchAll(MENTION)) {
    const start = match.index + match[1].length;
    // O ponto no fim é da frase ("valeu @ana."), não do @.
    const raw = match[2].replace(/\.+$/, "");
    const username = cleanMention(raw);
    if (!username || username.length > 24 || insideUrl(start)) continue;
    marks.push({ start, end: start + 1 + raw.length, type: "mention", value: `@${raw}`, username });
  }

  marks.sort((a, b) => a.start - b.start);
  const parts = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) parts.push({ type: "text", value: source.slice(cursor, mark.start) });
    parts.push(mark);
    cursor = mark.end;
  }
  if (cursor < source.length) parts.push({ type: "text", value: source.slice(cursor) });
  return parts;
}

/** Erro de legenda que a tela sabe explicar (`socialPosts.errors.*`), ou "". */
export const captionProblem = (text = "") =>
  extractHashtags(text).length > MAX_HASHTAGS ? "tooManyHashtags" : "";

export const tagPath = (tag) => `/community/tag/${encodeURIComponent(normalizeTag(tag))}`;
export const mentionPath = (username) => `/community/@${encodeURIComponent(cleanMention(username))}`;
