import { must, supabase } from "./supabase";
import { serviceListingFromRow } from "./db";

/**
 * A página pública de cada anúncio (/servicos/<slug>) e o que gira em volta
 * dela: o endereço, o compartilhar e as métricas por dia que o dono lê.
 *
 * Mora fora do db.js de propósito: aquele arquivo é editado por várias
 * frentes ao mesmo tempo, e isto aqui é só da vitrine pública.
 */

export const SERVICE_PUBLIC_BASE_PATH = "/servicos";

const HANDLE_PATTERN = /^[a-z0-9-]{1,120}$/;

/** Caminho público do anúncio. Sem slug (antes da migração), vai pelo id. */
export const serviceListingPath = (listing) =>
  `${SERVICE_PUBLIC_BASE_PATH}/${encodeURIComponent(listing?.slug || listing?.id || "")}`;

/** Endereço completo, para copiar e colar na bio. */
export const serviceListingUrl = (listing) => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${serviceListingPath(listing)}`;
};

/** O mesmo endereço sem "https://", que é como ele aparece escrito numa bio. */
export const serviceListingDisplayUrl = (listing) =>
  serviceListingUrl(listing).replace(/^https?:\/\//, "");

/**
 * Um anúncio pelo endereço público. Aceita o slug ou o id (link antigo, ou
 * banco ainda sem a coluna `slug`). A RLS decide o que volta: aprovado para
 * qualquer um e o próprio anúncio, mesmo pendente, para o dono.
 *
 * `null` = não existe, foi removido, ou esta pessoa não pode ver.
 */
export async function getServiceListingByHandle(handle) {
  const clean = String(handle || "").trim().toLowerCase();
  if (!HANDLE_PATTERN.test(clean)) return null;

  const bySlugOrId = await supabase
    .from("service_listings")
    .select("*")
    .or(`slug.eq.${clean},id.eq.${clean}`)
    .limit(1);
  // Erro aqui é quase sempre a coluna `slug` que ainda não existe: tenta só
  // pelo id. Se for outra coisa, o `must` da segunda tentativa estoura.
  const rows = bySlugOrId.error
    ? must(await supabase.from("service_listings").select("*").eq("id", clean).limit(1))
    : bySlugOrId.data || [];

  if (!rows[0]) return null;
  const listing = serviceListingFromRow(rows[0]);
  return listing.active ? listing : null;
}

/**
 * Métricas por dia de um anúncio desde `sinceDay` (AAAA-MM-DD). Só o dono e a
 * moderação leem; para os outros a RLS devolve vazio.
 */
export async function getServiceListingMetricsDaily(listingId, sinceDay) {
  if (!listingId) return [];
  const rows = must(
    await supabase
      .from("service_listing_metrics_daily")
      .select("day, metric, source, count")
      .eq("listing_id", String(listingId))
      .gte("day", sinceDay)
      .order("day", { ascending: true })
      .limit(2000),
  );
  return rows.map((row) => ({
    day: String(row.day).slice(0, 10),
    metric: row.metric,
    source: row.source,
    count: Number(row.count) || 0,
  }));
}

/**
 * Compartilha pelo menu nativo do celular quando existe, e copia o link
 * quando não existe (computador, navegador embutido do Instagram).
 *
 * Devolve "shared", "copied", "cancelled" ou "failed" — a tela escolhe o aviso.
 * Cancelar o menu nativo não é erro e não deve virar toast vermelho.
 */
export async function shareOrCopyLink({ url, title = "", text = "" }) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url, title, text });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // Outro erro (permissão, contexto sem gesto): cai para copiar.
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}

/** Copia texto. `true` se deu certo. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sem a API moderna (http, webview antigo): o caminho velho ainda funciona.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.className = "pointer-events-none fixed left-0 top-0 opacity-0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
