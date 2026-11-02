/**
 * @menções na bio (e, depois, na bio de página) — camada de dados.
 *
 * Formato no texto: `@[tipo:id]`, com tipo em MENTION_KINDS. O id, não o
 * nome: renomear o clube ou trocar o @ não quebra a bio. O marcador sozinho
 * não vale nada — a tela só desenha o chip se o banco devolver a menção
 * ATIVA em `profile_mentions_for` (quem grava é `set_bio_mentions`, que
 * limita a 10, recusa bloqueio e quem se tirou da bio, e avisa uma vez).
 *
 * No editor o marcador vira `@Rótulo` legível; `serializeBio` faz a volta
 * usando a lista de menções escolhidas no autocompletar.
 *
 * Fontes de busca são um registro (`registerMentionSource`): pessoa, clube e
 * evento moram aqui; página profissional também, lendo `pro_profiles` — se a
 * tabela ainda não existir no banco, a busca de página volta vazia em
 * silêncio. Outra frente pode trocar a fonte de página registrando outra com
 * o mesmo tipo.
 */
import { auth, must, supabase } from "./supabase";
import { engineDB } from "./db";

export const MENTION_KINDS = ["person", "club", "event", "page"];
export const MENTION_LIMIT = 10;
/** Tamanho da bio como a pessoa LÊ (o marcador conta como o rótulo). */
export const BIO_DISPLAY_MAX = 160;

const TOKEN = /@\[(person|club|event|page):([A-Za-z0-9._-]{1,64})\]/g;

// O termo entra num filtro `or=(...)` do PostgREST: vírgula, parêntese e
// aspas quebrariam o filtro; % e _ são curinga do LIKE.
const escapeLike = (value) =>
  String(value)
    .replace(/[,()"*:]/g, "")
    .replace(/[\\%_]/g, (c) => `\\${c}`);

/** Partes da bio: texto e menções, na ordem. */
export function parseBio(text = "") {
  const parts = [];
  let last = 0;
  const source = String(text || "");
  for (const match of source.matchAll(TOKEN)) {
    if (match.index > last) parts.push({ type: "text", value: source.slice(last, match.index) });
    parts.push({ type: "mention", kind: match[1], id: match[2] });
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ type: "text", value: source.slice(last) });
  return parts;
}

/** Referências únicas na ordem em que aparecem. */
export function mentionRefs(text = "") {
  const seen = new Set();
  const refs = [];
  for (const part of parseBio(text)) {
    if (part.type !== "mention") continue;
    const key = `${part.kind}:${part.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ kind: part.kind, id: part.id });
  }
  return refs;
}

export const mentionKey = (ref) => `${ref.kind}:${ref.id}`;

/** O rótulo que aparece no editor depois do @. */
export const editorLabel = (card = {}) =>
  String(card.label || card.name || "").replace(/^@/, "").replace(/[[\]]/g, "").trim() || "?";

/**
 * Marcadores → texto do editor. Devolve o texto e as menções que ele
 * contém (`{kind, id, label}`), para o `serializeBio` desfazer.
 */
export function bioToEditor(text = "", cards = {}) {
  const mentions = [];
  const value = parseBio(text)
    .map((part) => {
      if (part.type === "text") return part.value;
      const card = cards[mentionKey(part)];
      if (!card) return "";
      const label = editorLabel(card);
      if (!mentions.some((m) => mentionKey(m) === mentionKey(part))) {
        mentions.push({ kind: part.kind, id: part.id, label });
      }
      return `@${label}`;
    })
    .join("");
  return { value, mentions };
}

/**
 * Texto do editor → bio gravada. Cada `@Rótulo` de uma menção escolhida vira
 * marcador (a primeira ocorrência, a mais longa primeiro, para "@Ana" não
 * comer o "@Ana Paula"). Menção cujo `@Rótulo` sumiu do texto cai fora.
 */
export function serializeBio(value = "", mentions = []) {
  let out = String(value || "");
  const kept = [];
  const ordered = [...mentions].sort((a, b) => b.label.length - a.label.length);
  for (const mention of ordered) {
    const needle = `@${mention.label}`;
    const at = out.indexOf(needle);
    if (at < 0) continue;
    out = `${out.slice(0, at)}@[${mention.kind}:${mention.id}]${out.slice(at + needle.length)}`;
    kept.push(mention);
  }
  return { bio: out, mentions: kept };
}

// ---------------------------------------------------------------------------
// Busca do autocompletar
// ---------------------------------------------------------------------------

const sources = new Map();

/** `search(term) => Promise<[{kind, id, label, name, avatar, sub}]>` */
export function registerMentionSource(kind, search) {
  sources.set(kind, search);
}

registerMentionSource("person", async (term) => {
  const me = auth.currentUser?.uid;
  const people = await engineDB.searchPublicProfiles(term, { max: 5 });
  return people
    .filter((p) => (p.userId || p.id) && (p.userId || p.id) !== me)
    .map((p) => ({
      kind: "person",
      id: String(p.userId || p.id),
      label: String(p.username || "").replace(/^@/, "") || p.author,
      name: p.author || "",
      avatar: p.avatar || "",
      initials: p.avatarInitials || "",
      sub: p.username || "",
    }));
});

registerMentionSource("club", async (term) => {
  const raw = String(term || "").trim();
  let request = supabase.from("clubs").select("id, tag, data, member_count").eq("archived", false).limit(5);
  if (raw) {
    const like = escapeLike(raw.toLowerCase());
    request = request.or(`name_lower.ilike.${like}%,tag.ilike.${escapeLike(raw.toUpperCase())}%`);
  } else {
    request = request.order("member_count", { ascending: false });
  }
  const rows = must(await request);
  return rows.map((row) => ({
    kind: "club",
    id: row.id,
    label: row.data?.name || row.tag,
    name: row.data?.name || row.tag,
    logo: row.data?.logo || "",
    tag: row.tag,
    color: row.data?.colors?.primary || "",
    sub: `[${row.tag}]`,
  }));
});

registerMentionSource("event", async (term) => {
  const raw = String(term || "").trim();
  const today = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  let request = supabase
    .from("events")
    .select("id, data, event_date")
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(5);
  if (raw) request = request.ilike("data->>title", `%${escapeLike(raw)}%`);
  const rows = must(await request);
  return rows.map((row) => ({
    kind: "event",
    id: row.id,
    label: row.data?.title || "",
    name: row.data?.title || "",
    avatar: row.data?.image || "",
    date: row.event_date,
    sub: String(row.event_date || "").slice(0, 10),
  }));
});

// Páginas profissionais (outra frente, 20261101130000). Sem a tabela, vazio.
registerMentionSource("page", async (term) => {
  const raw = String(term || "").trim().replace(/^@/, "").toLowerCase();
  let request = supabase.from("pro_profiles").select("id, handle, name, data").eq("kind", "page").limit(5);
  if (raw) request = request.or(`handle.ilike.${escapeLike(raw)}%,name.ilike.${escapeLike(raw)}%`);
  const { data, error } = await request;
  if (error) return [];
  return (data || [])
    .filter((row) => row.handle)
    .map((row) => ({
      kind: "page",
      id: row.id,
      label: row.handle,
      name: row.name || `@${row.handle}`,
      avatar: row.data?.logo || "",
      sub: `@${row.handle}`,
    }));
});

/** Todas as fontes em paralelo; fonte que falha não derruba as outras. */
export async function searchMentionTargets(term, { kinds = MENTION_KINDS } = {}) {
  const results = await Promise.all(
    kinds
      .filter((kind) => sources.has(kind))
      .map((kind) => sources.get(kind)(term).catch(() => [])),
  );
  return results.flat();
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

const mentionError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

/** Grava as menções da MINHA bio (depois de salvar o texto). */
export async function syncBioMentions(bio = "") {
  const refs = mentionRefs(bio);
  if (refs.length > MENTION_LIMIT) throw mentionError("too-many-mentions");
  const { data, error } = await supabase.rpc("set_bio_mentions", { p_refs: refs });
  if (error) throw mentionError(error.message || "generic");
  return data || { accepted: [], skipped: [] };
}

/** Cartões vivos das menções ativas da bio de `userId`, por chave. */
export async function fetchMentionCards(userId) {
  if (!userId) return {};
  const { data, error } = await supabase.rpc("profile_mentions_for", { p_user: userId });
  if (error) {
    console.warn("[menções] cartões não vieram.", error.message);
    return {};
  }
  return Object.fromEntries((data || []).map((card) => [mentionKey(card), card]));
}

/** Bloco "No Engine": clubes, páginas e próximos eventos. */
export async function fetchEnginePresence(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.rpc("profile_engine_presence", { p_user: userId });
  if (error) {
    console.warn("[no engine] bloco não veio.", error.message);
    return null;
  }
  return data || null;
}

/** Tirar uma menção: a minha de uma bio alheia, ou uma da minha bio. */
export async function removeMention(ownerId, kind, targetId) {
  const { error } = await supabase.rpc("remove_mention", {
    p_owner: ownerId,
    p_kind: kind,
    p_target: String(targetId),
  });
  if (error) throw mentionError(error.message || "generic");
}
