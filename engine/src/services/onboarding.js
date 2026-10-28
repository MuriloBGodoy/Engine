import { supabase } from "./supabase";
import { captureError } from "./observability";

/**
 * Primeiro uso: 18+ e aceite dos Termos/Privacidade, gravados no servidor
 * (tabela `user_consents`, migration 20261025170000).
 *
 * TERMS_VERSION é a data da versão em vigor dos Termos e da Privacidade
 * (a mesma do "Atualizado em" das páginas). Ao mudar a política de forma
 * relevante, sobe este valor: quem aceitou a versão anterior vê a tela de
 * novo antes de seguir — é o "pedimos o aceite de novo" da Privacidade.
 */
export const TERMS_VERSION = "2026-10-24";

// O app pode chegar à produção antes da migration. Sem a tabela ou a função,
// ninguém pode ficar preso numa tela que nunca grava: o aceite fica neste
// aparelho e a tela libera. Assim que a migration entra, a leitura passa a
// vir do banco e a tela aparece de novo para quem só aceitou localmente
// (uma vez), agora gravando a data no servidor.
const MISSING_CODES = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);
const isMissingBackend = (error) =>
  MISSING_CODES.has(error?.code) || /does not exist|could not find/i.test(error?.message || "");

const localKey = (userId) => `engine.consent:${userId}`;

const readLocal = (userId) => {
  try {
    return window.localStorage.getItem(localKey(userId)) || "";
  } catch {
    return "";
  }
};

const writeLocal = (userId, version) => {
  try {
    window.localStorage.setItem(localKey(userId), version);
  } catch {
    // armazenamento bloqueado: vale só nesta visita
  }
};

/**
 * Situação do aceite de quem está logado.
 *
 * - `{ status: "accepted" }`: aceitou a versão em vigor.
 * - `{ status: "missing" }`: nunca aceitou (ou o aceite é de outra conta).
 * - `{ status: "outdated" }`: aceitou uma versão anterior.
 * - `{ status: "unknown" }`: não deu para saber (sem rede). Quem chama não
 *   bloqueia: travar o app inteiro por uma leitura que falhou seria pior.
 */
export async function getConsentStatus(userId) {
  if (!userId) return { status: "unknown" };
  const { data, error } = await supabase
    .from("user_consents")
    .select("terms_version, terms_accepted_at, adult_confirmed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingBackend(error)) {
      return { status: readLocal(userId) === TERMS_VERSION ? "accepted" : "missing", local: true };
    }
    captureError(error, { action: "getConsentStatus" });
    return { status: "unknown" };
  }
  if (!data) return { status: "missing" };
  return {
    status: data.terms_version === TERMS_VERSION ? "accepted" : "outdated",
    acceptedAt: data.terms_accepted_at,
  };
}

/** Grava o aceite. A data é do relógio do banco (ver accept_terms). */
export async function acceptTerms(userId) {
  const { error } = await supabase.rpc("accept_terms", { p_terms_version: TERMS_VERSION });
  if (error) {
    if (isMissingBackend(error)) {
      captureError(error, { action: "acceptTerms", fallback: "local" });
      writeLocal(userId, TERMS_VERSION);
      return { local: true };
    }
    throw error;
  }
  writeLocal(userId, TERMS_VERSION);
  return { local: false };
}
