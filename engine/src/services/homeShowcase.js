import { must, supabase } from "./supabase";
import { goalFromRow, normalizeCommunityGoal, serviceListingFromRow } from "./db";
import { upcomingCutoffIso } from "./eventTime";

/**
 * O que a Home do visitante mostra de conteúdo real: metas e publicações
 * recentes, anúncios de serviço aprovados, clubes e os próximos encontros.
 *
 * São leituras únicas, sem Realtime: a Home é uma vitrine, não um feed
 * vivo, e assinar três tabelas para quem só está olhando a porta de entrada
 * seria custo sem retorno. Cada leitura falha sozinha — se uma cair, a seção
 * dela mostra o vazio e as outras seguem.
 *
 * Eventos são lidos aqui direto em vez de passar por `services/events.js`:
 * aquele módulo traz junto o de conquistas, e a Home está no pacote inicial.
 */

const POSTS_TO_READ = 16;
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
  return [...withImage, ...withoutImage];
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

const CLUBS_TO_READ = 12;

// Só as colunas do card: o `data` do clube traz regras, links e cores que a
// vitrine não usa.
const fetchClubs = async () => {
  const rows = must(
    await supabase
      .from("clubs")
      .select("id, tag, member_count, country, state, name:data->>name, motto:data->>motto, city:data->>city")
      .eq("archived", false)
      .order("member_count", { ascending: false })
      .limit(CLUBS_TO_READ),
  );
  return rows.map((row) => ({
    id: row.id,
    tag: row.tag || "",
    name: row.name || "",
    motto: row.motto || "",
    city: row.city || "",
    state: row.state || "",
    country: row.country || "",
    memberCount: Number(row.member_count) || 0,
  }));
};

const settle = (result) =>
  result.status === "fulfilled"
    ? { items: result.value, failed: false }
    : { items: [], failed: true };

/** Todas as vitrines de uma vez. Nunca rejeita: cada seção diz se falhou. */
export async function fetchHomeShowcase() {
  const [posts, listings, events, clubs] = await Promise.allSettled([
    fetchRecentPosts(),
    fetchApprovedListings(),
    fetchUpcomingEvents(),
    fetchClubs(),
  ]);
  return {
    posts: settle(posts),
    listings: settle(listings),
    events: settle(events),
    clubs: settle(clubs),
  };
}
