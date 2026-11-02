import { must, supabase } from "./supabase";
import { goalFromRow, normalizeCommunityGoal } from "./db";
import { normalizeTag } from "./socialText";

/**
 * Leituras do feed que não são "o feed": página de uma #tag, tags em alta e
 * a aba de Vídeos (Reels). As regras de quem vê o quê são as mesmas do feed
 * (RLS de `community_goals`, inclusive a da suspensão) — as funções do banco
 * são `security invoker` de propósito.
 */

const PAGE_SIZE = 20;
const toGoals = (rows = []) => rows.map((row) => normalizeCommunityGoal(goalFromRow(row)));
const cursorOf = (rows, fallback) => {
  const last = rows[rows.length - 1];
  return last ? { createdAt: last.created_at, id: last.id } : fallback;
};

/** Posts de uma tag, mais novos primeiro. `cursor` vem da página anterior. */
export async function fetchHashtagPage(tag, cursor = null) {
  const clean = normalizeTag(tag);
  if (!clean) return { goals: [], cursor: null, hasMore: false };
  const rows = must(
    await supabase.rpc("hashtag_feed", {
      p_tag: clean,
      p_before: cursor?.createdAt || null,
      p_before_id: cursor?.id || null,
      p_limit: PAGE_SIZE,
    }),
  ) || [];
  return { goals: toGoals(rows), cursor: cursorOf(rows, cursor), hasMore: rows.length === PAGE_SIZE };
}

export async function fetchHashtagCount(tag) {
  const clean = normalizeTag(tag);
  if (!clean) return 0;
  const { data, error } = await supabase.rpc("hashtag_count", { p_tag: clean });
  if (error) return 0;
  return Number(data) || 0;
}

// Em alta muda devagar: uma leitura a cada poucos minutos basta para a sessão.
let trendingCache = { at: 0, days: 0, items: [] };
const TRENDING_TTL_MS = 5 * 60 * 1000;

/** `[{tag, posts, authors}]` dos últimos `days` dias. Falha → lista vazia. */
export async function fetchTrendingHashtags({ days = 7, limit = 12 } = {}) {
  if (trendingCache.days === days && Date.now() - trendingCache.at < TRENDING_TTL_MS) {
    return trendingCache.items.slice(0, limit);
  }
  const { data, error } = await supabase.rpc("trending_hashtags", { p_days: days, p_limit: Math.max(limit, 12) });
  if (error) {
    console.warn("[tags] em alta não veio.", error.message);
    return [];
  }
  const items = (data || []).map((row) => ({
    tag: row.tag,
    posts: Number(row.posts) || 0,
    authors: Number(row.authors) || 0,
  }));
  trendingCache = { at: Date.now(), days, items };
  return items.slice(0, limit);
}

/** Reels: só posts com vídeo enviado (índice parcial `community_goals_videos`). */
export async function fetchVideoPage(cursor = null) {
  let request = supabase
    .from("community_goals")
    .select("*")
    .not("data->video", "is", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);
  if (cursor) {
    request = request.or(
      `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt."${cursor.id}")`,
    );
  }
  const rows = must(await request) || [];
  return {
    goals: toGoals(rows).filter((goal) => goal.video),
    cursor: cursorOf(rows, cursor),
    hasMore: rows.length === PAGE_SIZE,
  };
}
