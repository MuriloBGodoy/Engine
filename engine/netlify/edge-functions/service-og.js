// Edge Function do Netlify: pré-visualização de link da página pública do
// anúncio (/servicos/<slug>).
//
// O app é uma SPA: o index.html é o mesmo para toda rota, com <title>Engine</title>.
// Quem gera o cartão do link no WhatsApp, Instagram, Facebook e Google não
// roda JavaScript — lê só o HTML. Sem isto, o prestador cola o link na bio e
// o cartão sai genérico, sem a foto do trabalho dele.
//
// O que faz: deixa a requisição seguir (o _redirects entrega o index.html),
// e, quando quem pede é um robô de pré-visualização, busca o anúncio APROVADO
// pela REST do Supabase com a chave PÚBLICA e injeta title, description e as
// tags og:/twitter: no HTML. Gente de verdade passa direto, sem esperar a
// consulta: o app desenha a página sozinho.
//
// Sem segredo aqui. A chave publishable já vai no bundle do navegador; a RLS
// do banco só entrega anúncio aprovado para quem não é dono. Endereço e chave
// vêm das variáveis do Netlify, se existirem, ou das <meta> que o Vite grava
// no index.html no build (ver index.html). Qualquer falha devolve o index
// normal — pré-visualização nunca pode derrubar a página.

const PREVIEW_BOTS =
  /bot|crawler|spider|crawling|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegram|slack|discord|linkedin|pinterest|embedly|quora|vkshare|skype|preview|google-inspectiontool|applebot|iframely|redditbot|mastodon|snapchat/i;
const HANDLE = /^[a-z0-9-]{1,120}$/;
const TIMEOUT_MS = 1500;

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
  // Variável ausente no build deixa o marcador cru (%VITE_...%): não serve.
  if (!/^https:\/\//.test(url) || !key || key.includes("%")) return null;
  return { url: url.replace(/\/$/, ""), key };
};

const queryListing = async ({ url, key }, filter) => {
  const response = await fetch(
    `${url}/rest/v1/service_listings?select=*&moderation_status=eq.approved&${filter}&limit=1`,
    { headers: { apikey: key, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!response.ok) throw new Error(`supabase ${response.status}`);
  const rows = await response.json();
  return rows[0] || null;
};

const findListing = async (config, handle) => {
  try {
    return await queryListing(config, `or=(slug.eq.${handle},id.eq.${handle})`);
  } catch {
    // Banco ainda sem a coluna `slug`: tenta só pelo id.
    return queryListing(config, `id=eq.${handle}`);
  }
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
    .replace(
      /<meta\s+name="description"[\s\S]*?\/>/i,
      `<meta name="description" content="${escapeHtml(description)}" />`,
    )
    .replace(/<\/head>/i, `    ${tags}\n  </head>`);
};

export default async (request, context) => {
  const response = await context.next();

  const userAgent = request.headers.get("user-agent") || "";
  if (!PREVIEW_BOTS.test(userAgent)) return response;
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;

  let requestUrl;
  let handle = "";
  try {
    requestUrl = new URL(request.url);
    handle = decodeURIComponent(requestUrl.pathname.split("/")[2] || "").toLowerCase();
  } catch {
    return response;
  }
  if (!HANDLE.test(handle)) return response;

  // Daqui em diante o corpo já foi lido: toda saída monta uma resposta nova.
  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  const reply = (body) => new Response(body, { status: response.status, headers });

  try {
    const config = supabaseConfig(html);
    if (!config) return reply(html);

    const row = await findListing(config, handle);
    const data = row?.data || {};
    if (!row || data.active === false) return reply(html);

    const city = [data.city, data.state].filter(Boolean).join(" - ");
    const title = clip(city ? `${data.title} · ${city}` : data.title, 90) || "Engine";
    const description =
      clip(data.description, 180) || clip(`${data.providerName || ""} ${city}`.trim(), 180) || "Serviço no Engine";
    const photo = (Array.isArray(data.photos) ? data.photos : []).find((item) => /^https:\/\//.test(String(item)));
    const image = photo || `${requestUrl.origin}/icons/icon-512.png`;
    const canonical = `${requestUrl.origin}/servicos/${row.slug || row.id}`;

    // O cartão muda quando o anúncio muda; a CDN não guarda a versão do robô.
    headers.set("cache-control", "public, max-age=0, must-revalidate");
    return reply(injectTags(html, { title, description, image, url: canonical }));
  } catch {
    return reply(html);
  }
};
