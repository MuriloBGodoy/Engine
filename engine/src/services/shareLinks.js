/**
 * Links públicos do Engine para compartilhar fora do app.
 *
 * Todo endereço daqui abre para quem NÃO tem conta (post, perfil, página,
 * anúncio, produto, clube, evento, hashtag) — é o que torna o link útil num
 * grupo de WhatsApp. O cartão de pré-visualização desses endereços sai da
 * edge function `social-og` / `service-og` (só robô consulta o banco).
 *
 * `?ref=share` marca a origem para análise depois. Não leva nada da pessoa
 * (nem id, nem @): é igual para todo mundo que compartilha.
 */

export const SHARE_REF = "share";

const origin = () => (typeof window !== "undefined" ? window.location.origin : "https://enginegarage.com.br");

/** Acrescenta `ref=share` sem apagar parâmetros que já existam (convite do clube). */
export const withShareRef = (url) => {
  try {
    const parsed = new URL(url, origin());
    if (!parsed.searchParams.has("ref")) parsed.searchParams.set("ref", SHARE_REF);
    return parsed.toString();
  } catch {
    return url;
  }
};

const clean = (value) => encodeURIComponent(String(value || "").trim());

export const shareUrls = {
  post: (postId) => `${origin()}/post/${clean(postId)}`,
  profile: (username) => `${origin()}/community/@${clean(String(username || "").replace(/^@+/, ""))}`,
  page: (handle) => `${origin()}/p/${clean(String(handle || "").replace(/^@+/, ""))}`,
  club: (clubId) => `${origin()}/clubs/${clean(clubId)}`,
  event: (eventId) => `${origin()}/events/${clean(eventId)}`,
  hashtag: (tag) => `${origin()}/community/tag/${clean(tag)}`,
};

/**
 * Para onde cada botão leva. Instagram não tem "compartilhar link" pela web
 * (Stories e Direct só pelo app, com SDK) — ali o caminho é copiar o link.
 */
export const shareTargets = ({ url, text = "", title = "" }) => {
  const message = [text || title, url].filter(Boolean).join(" ");
  const u = encodeURIComponent(url);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    telegram: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text || title)}`,
    x: `https://x.com/intent/post?url=${u}&text=${encodeURIComponent(text || title)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    email: `mailto:?subject=${encodeURIComponent(title || "Engine")}&body=${encodeURIComponent(message)}`,
  };
};

export const canNativeShare = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

// ---------------------------------------------------------------------------
// Abrir a folha de qualquer lugar
// ---------------------------------------------------------------------------
//
// Uma folha só no app (`ShareSheetHost`, montada no App): quem quer
// compartilhar chama `openShareSheet({...})` sem precisar passar usuário,
// configurações e estado de modal por cinco níveis de props.
//
// payload: { url, title, text?, kind?, goal? }
//   - `goal`: post do feed — "Enviar no Engine" manda como anexo de post;
//     sem ele, a DM leva o link em texto.

const listeners = new Set();

export const subscribeShareSheet = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const openShareSheet = (payload) => {
  if (!payload?.url) return;
  listeners.forEach((fn) => fn(payload));
};
