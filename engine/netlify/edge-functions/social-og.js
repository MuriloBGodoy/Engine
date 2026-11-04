// Edge Function do Netlify: pré-visualização de link (WhatsApp, Instagram,
// Facebook, X, Telegram, Google) do que se compartilha da Comunidade:
//
//   /post/<id>             publicação
//   /community/@<usuário>  perfil
//   /community/tag/<tag>   hashtag
//   /p/<@>                 página profissional
//   /clubs/<id>            clube
//   /carro/<endereço>      carro da vitrine
//   /events/<id>           evento
//
// Mesmo desenho do service-og.js: a SPA entrega o mesmo index.html para toda
// rota, e robô de pré-visualização não roda JavaScript. Só quando quem pede É
// um robô a função consulta o Supabase (REST, chave PÚBLICA) e injeta
// title/description/og:/twitter:. Gente de verdade passa direto.
//
// Privacidade: a consulta roda como VISITANTE (anon). O que a RLS esconde de
// quem não tem conta — conta suspensa, post removido, página suspensa, clube
// arquivado (filtrado aqui) — não vira cartão: o robô recebe o index normal,
// com o título genérico. Nada de dinheiro: o post público já não tem valores
// (20261025163000). Qualquer falha devolve o index normal.

const PREVIEW_BOTS =
  /bot|crawler|spider|crawling|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegram|slack|discord|linkedin|pinterest|embedly|quora|vkshare|skype|preview|google-inspectiontool|applebot|iframely|redditbot|mastodon|snapchat|twitterbot/i;
const TIMEOUT_MS = 1500;
const ID = /^[A-Za-z0-9._-]{1,160}$/;
const USERNAME = /^[a-z0-9._]{1,24}$/;
const HANDLE = /^[a-z0-9._-]{1,40}$/;
const TAG = /^[0-9a-z_À-ɏ]{1,50}$/;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clip = (text, max) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

const readMeta = (html, name) => {
  const match = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, "i"));
  return match ? match[1] : "";
};

const envGet = (name) => {
  try {
    return globalThis.Netlify?.env?.get(name) || "";
  } catch {
    return "";
  }
};

const supabaseConfig = (html) => {
  const url = envGet("VITE_SUPABASE_URL") || envGet("SUPABASE_URL") || readMeta(html, "engine:supabase-url");
  const key = envGet("VITE_SUPABASE_PUBLISHABLE_KEY") || readMeta(html, "engine:supabase-key");
  if (!/^https:\/\//.test(url) || !key || key.includes("%")) return null;
  return { url: url.replace(/\/$/, ""), key };
};

const one = async ({ url, key }, table, query) => {
  const response = await fetch(`${url}/rest/v1/${table}?${query}&limit=1`, {
    headers: { apikey: key, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`supabase ${response.status}`);
  const rows = await response.json();
  return rows[0] || null;
};

const httpsImage = (value) => (/^https:\/\//.test(String(value || "")) ? String(value) : "");
// Caminho de objeto público no bucket (capa de vídeo do post, logo/capa do
// clube); só as pastas conhecidas, nada de caminho arbitrário.
const storageImage = ({ url }, bucket, path) =>
  /^(users\/[0-9a-f-]{36}|clubs\/[A-Za-z0-9_-]+)\/[A-Za-z0-9._/-]+$/.test(String(path || "")) && !String(path).includes("..")
    ? `${url}/storage/v1/object/public/${bucket}/${path}`
    : "";
const anyImage = (config, value) => httpsImage(value) || storageImage(config, "photos", value);

const stripMarkers = (text) => String(text || "").replace(/@\[(person|club|event|page):[^\]]+\]/g, "");

// Cada rota → { title, description, image, canonical } ou null (sem cartão).
const resolvers = {
  async post(config, [id], origin) {
    if (!ID.test(id)) return null;
    const row = await one(config, "community_goals", `select=id,kind,data&id=eq.${encodeURIComponent(id)}`);
    if (!row) return null;
    const data = row.data || {};
    const who = data.author || data.username || "Engine";
    const car = [data.brand, data.model].filter(Boolean).join(" ") || data.title || "";
    const title = clip(car ? `${who} · ${car}` : `${who} no Engine`, 90);
    const description =
      clip(data.note, 180) ||
      (row.kind === "goal" && Number.isFinite(Number(data.progress))
        ? `Meta: ${Math.round(Number(data.progress))}% do caminho até o ${car || "carro"}.`
        : "Publicação na comunidade do Engine.");
    const images = Array.isArray(data.images) ? data.images : [];
    const image =
      httpsImage(images.find((item) => httpsImage(item))) ||
      httpsImage(data.image) ||
      storageImage(config, "photos", data.video?.posterPath);
    return { title, description, image, canonical: `${origin}/post/${encodeURIComponent(row.id)}` };
  },

  async community(config, [segment, extra], origin) {
    if (segment === "tag") {
      const tag = String(extra || "").toLowerCase();
      if (!TAG.test(tag)) return null;
      return {
        title: `#${tag} no Engine`,
        description: `Publicações com #${tag} na comunidade automotiva do Engine.`,
        image: "",
        canonical: `${origin}/community/tag/${encodeURIComponent(tag)}`,
      };
    }
    const username = String(segment || "").replace(/^@+/, "").toLowerCase();
    if (!segment?.startsWith("@") || !USERNAME.test(username)) return null;
    const row = await one(config, "public_profiles", `select=username,author,data&username=eq.${encodeURIComponent(`@${username}`)}`);
    if (!row) return null;
    const data = row.data || {};
    return {
      title: clip(`${row.author || row.username} (${row.username}) · Engine`, 90),
      description: clip(stripMarkers(data.note || data.bio), 180) || "Perfil na comunidade automotiva do Engine.",
      image: httpsImage(data.avatar) || httpsImage(data.banner),
      canonical: `${origin}/community/@${username}`,
    };
  },

  async p(config, [handle], origin) {
    const clean = String(handle || "").replace(/^@+/, "").toLowerCase();
    if (!HANDLE.test(clean)) return null;
    const row = await one(config, "pro_profiles", `select=handle,name,kind,suspended,data&handle=eq.${encodeURIComponent(clean)}&kind=eq.page`);
    if (!row || row.suspended) return null;
    const data = row.data || {};
    return {
      title: clip(`${row.name || `@${row.handle}`} · Engine`, 90),
      description: clip(stripMarkers(data.bio || data.description), 180) || "Página profissional no Engine.",
      image: httpsImage(data.cover) || httpsImage(data.logo),
      canonical: `${origin}/p/${row.handle}`,
    };
  },

  async clubs(config, [id], origin) {
    if (!ID.test(id)) return null;
    const row = await one(config, "clubs", `select=id,tag,archived,member_count,data&id=eq.${encodeURIComponent(id)}`);
    if (!row || row.archived) return null;
    const data = row.data || {};
    const name = data.name || row.tag || "Clube";
    return {
      title: clip(`${name}${row.tag ? ` [${row.tag}]` : ""} · Engine`, 90),
      description:
        clip(stripMarkers(data.description), 180) ||
        `Clube automotivo no Engine${row.member_count ? ` · ${row.member_count} membros` : ""}.`,
      image: anyImage(config, data.cover) || anyImage(config, data.logo),
      canonical: `${origin}/clubs/${encodeURIComponent(row.id)}`,
    };
  },

  // Carro da vitrine (/carro/<endereço>). O endereço é o `slug`, não o id.
  async carro(config, [slug], origin) {
    if (!/^[a-z0-9-]{1,80}$/.test(String(slug || ""))) return null;
    const row = await one(
      config,
      "car_showcase",
      `select=slug,brand,model,model_year,stage,city,state,hidden,like_count,data&slug=eq.${encodeURIComponent(slug)}`,
    );
    if (!row || row.hidden) return null;
    const data = row.data || {};
    const nome = [row.brand, row.model].filter(Boolean).join(" ") || "Carro";
    const lugar = [row.city, row.state].filter(Boolean).join(" - ");
    return {
      title: clip([nome, row.model_year].filter(Boolean).join(" · ") + " · Engine", 90),
      description:
        clip(stripMarkers(data.specs?.notes), 180) ||
        clip(["Na garagem do Engine", lugar].filter(Boolean).join(" · "), 180),
      image: anyImage(config, data.image),
      canonical: `${origin}/carro/${encodeURIComponent(row.slug)}`,
    };
  },

  async events(config, [id], origin) {
    if (!ID.test(id)) return null;
    const row = await one(config, "events", `select=id,event_date,data&id=eq.${encodeURIComponent(id)}`);
    if (!row) return null;
    const data = row.data || {};
    const day = String(row.event_date || "").slice(0, 10).split("-").reverse().join("/");
    const place = [data.city, data.state].filter(Boolean).join(" - ");
    return {
      title: clip([data.title || "Evento", day].filter(Boolean).join(" · "), 90),
      description: clip(data.description, 180) || clip(["Evento automotivo no Engine", place].filter(Boolean).join(" · "), 180),
      image: httpsImage(data.image),
      canonical: `${origin}/events/${encodeURIComponent(row.id)}`,
    };
  },
};

const injectTags = (html, { title, description, image, url }) => {
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Engine" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  ].join("\n    ");

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta\s+name="description"[\s\S]*?\/>/i, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<\/head>/i, `    ${tags}\n  </head>`);
};

export default async (request, context) => {
  const response = await context.next();

  const userAgent = request.headers.get("user-agent") || "";
  if (!PREVIEW_BOTS.test(userAgent)) return response;
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;

  let requestUrl;
  let parts = [];
  try {
    requestUrl = new URL(request.url);
    parts = requestUrl.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return response;
  }
  const resolve = resolvers[parts[0]];
  if (!resolve || parts.length < 2) return response;

  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  const reply = (body) => new Response(body, { status: response.status, headers });

  try {
    const config = supabaseConfig(html);
    if (!config) return reply(html);
    const card = await resolve(config, parts.slice(1), requestUrl.origin);
    if (!card) return reply(html);
    headers.set("cache-control", "public, max-age=0, must-revalidate");
    return reply(
      injectTags(html, {
        title: card.title || "Engine",
        description: card.description || "Engine",
        image: card.image || `${requestUrl.origin}/icons/icon-512.png`,
        url: card.canonical,
      }),
    );
  } catch {
    return reply(html);
  }
};
