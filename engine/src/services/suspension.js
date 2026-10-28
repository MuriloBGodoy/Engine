import { must, supabase } from "./supabase";

/**
 * Suspensão de conta (migration 20261028120000_account_suspensions.sql).
 *
 * Quem decide é o banco: a conta suspensa não escreve nada e some para os
 * outros mesmo que este arquivo não exista. Aqui é só o que o app precisa
 * para MOSTRAR — a tela de conta suspensa e os controles da /moderacao.
 */

// O app pode chegar antes da migration: sem a função, ninguém é tratado como
// suspenso (o mesmo cuidado de services/onboarding.js com o aceite).
const MISSING_CODES = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);
const isMissingBackend = (error) =>
  MISSING_CODES.has(error?.code) || /does not exist|could not find/i.test(error?.message || "");

export const SUSPENSION_REASONS = ["minor", "spam", "scam", "offensive", "harassment", "nudity", "other"];

/**
 * A suspensão em vigor de quem está logado.
 *
 * - `{ status: "suspended", reason, since }`
 * - `{ status: "active" }`
 * - `{ status: "unknown" }`: não deu para saber (rede). Quem chama não
 *   bloqueia — o banco recusa as escritas de qualquer jeito.
 */
export async function getMySuspension() {
  const { data, error } = await supabase.rpc("my_suspension");
  if (error) {
    if (isMissingBackend(error)) return { status: "active" };
    return { status: "unknown" };
  }
  if (data && data.reason) return { status: "suspended", reason: data.reason, since: data.since };
  return { status: "active" };
}

/** Suspensões em vigor, com nome e @ da conta. Só a moderação. */
export async function listSuspensions() {
  const rows = must(await supabase.rpc("moderation_list_suspensions")) || [];
  return rows.map((row) => ({
    userId: row.user_id,
    username: row.username || "",
    author: row.author || "",
    avatar: row.avatar || "",
    reason: row.reason,
    note: row.note || "",
    createdAt: row.created_at,
  }));
}

export async function suspendAccount({ userId, reason, note = "", reportId = null }) {
  must(
    await supabase.rpc("moderation_suspend", {
      p_user: userId,
      p_reason: reason,
      p_note: String(note || "").slice(0, 500),
      p_report_id: reportId,
    }),
  );
}

export async function liftSuspension(userId, note = "") {
  must(await supabase.rpc("moderation_lift_suspension", { p_user: userId, p_note: String(note || "").slice(0, 500) }));
}

/** @nome → id da conta, pela tabela pública de nomes. null se não existir. */
export async function findUserIdByUsername(username) {
  // Mesma normalização do cadastro (db.js): a chave é sem o "@".
  const handle = String(username || "").trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._]/g, "");
  if (!handle) return null;
  const row = must(await supabase.from("usernames").select("user_id").eq("username", handle).maybeSingle());
  return row?.user_id || null;
}
