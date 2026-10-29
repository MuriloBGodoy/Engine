import { must, supabase } from "./supabase";
import { goalFromRow, normalizeCommunityGoal, serviceListingFromRow } from "./db";
import { upcomingCutoffIso } from "./eventTime";

/**
 * O que a Home do visitante mostra de conteúdo real: publicações recentes,
 * anúncios de serviço aprovados e os próximos encontros.
 *
 * São três leituras únicas, sem Realtime: a Home é uma vitrine, não um feed
 * vivo, e assinar três tabelas para quem só está olhando a porta de entrada
 * seria custo sem retorno. Cada leitura falha sozinha — se uma cair, a seção
 * dela mostra o vazio e as outras seguem.
 *
 * Eventos são lidos aqui direto em vez de passar por `services/events.js`:
 * aquele módulo traz junto o de conquistas, e a Home está no pacote inicial.
 */

const POSTS_TO_READ = 12;
const POSTS_TO_SHOW = 6;
const LISTINGS_TO_READ = 24;
const EVENTS_TO_READ = 12;

const fetchRecentPosts = async () => {
  const rows = must(
    await supabase
      .from("community_goals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(POSTS_TO_READ),
  );
  const posts = rows.map((row) => normalizeCommunityGoal(goalFromRow(row)));
  // Na vitrine, foto vende mais que texto: primeiro os posts com imagem, na
  // ordem de chegada, e só depois os sem foto para completar.
  const withImage = posts.filter((post) => post.image || post.images?.length);
  const withoutImage = posts.filter((post) => !(post.image || post.images?.length));
  return [...withImage, ...withoutImage].slice(0, POSTS_TO_SHOW);
};

const fetchApprovedListings = async () => {
  const rows = must(
    await supabase
      .from("service_listings")
      .select("*")
      .eq("moderation_status", "approved")
      .order("updated_at", { ascending: false })
      .limit(LISTINGS_TO_READ),
  );
  return rows.map(serviceListingFromRow).filter((listing) => listing.active);
};

const eventFromRow = (row) => ({
  ...(row.data || {}),
  id: row.id,
  eventDate: row.event_date,
  type: row.type,
  state: row.state || row.data?.state || "",
  country: row.data?.country || "BR",
});

const fetchUpcomingEvents = async () => {
  const rows = must(
    await supabase
      .from("events")
      .select("*")
      .gte("event_date", upcomingCutoffIso())
      .order("event_date", { ascending: true })
      .limit(EVENTS_TO_READ),
  );
  const events = rows.map(eventFromRow);
  if (!events.length) return events;

  // Total de confirmados: enfeite. Se a contagem falhar, o card sai sem ele.
  try {
    const counts = must(
      await supabase.rpc("event_participant_counts", { p_event_ids: events.map((e) => String(e.id)) }),
    );
    const byId = new Map(counts.map((row) => [String(row.event_id), Number(row.total) || 0]));
    return events.map((event) => ({ ...event, participantCount: byId.get(String(event.id)) || 0 }));
  } catch {
    return events;
  }
};

const settle = (result) =>
  result.status === "fulfilled"
    ? { items: result.value, failed: false }
    : { items: [], failed: true };

/** As três vitrines de uma vez. Nunca rejeita: cada seção diz se falhou. */
export async function fetchHomeShowcase() {
  const [posts, listings, events] = await Promise.allSettled([
    fetchRecentPosts(),
    fetchApprovedListings(),
    fetchUpcomingEvents(),
  ]);
  return { posts: settle(posts), listings: settle(listings), events: settle(events) };
}
