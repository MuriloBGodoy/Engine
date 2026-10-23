// Supabase do lado servidor.
//
// A chave service_role ignora a RLS — é justamente por isso que ela mora aqui
// e não no navegador. `user_plans.plan` só pode ser escrito por este caminho:
// o banco não tem política de escrita nessa tabela, senão bastava abrir o
// console do navegador pra virar premium de graça.
//
// As credenciais vêm das envs SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, no
// painel do Netlify. Nunca versionar a chave.
import { createClient } from "@supabase/supabase-js";

let client = null;

export const db = () => {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente nas variáveis do Netlify.");
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
};

/**
 * Descobre quem está chamando pelo token de sessão do Supabase.
 *
 * O userId nunca pode vir no corpo do request: qualquer um mandaria o id de
 * outra pessoa e assinaria no nome dela (ou pior, ativaria o próprio plano
 * usando o pagamento de terceiro).
 */
export async function requireUser(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    throw Object.assign(new Error("Não autenticado."), { status: 401 });
  }

  const { data, error } = await db().auth.getUser(token);
  if (error || !data?.user) {
    throw Object.assign(new Error("Sessão inválida."), { status: 401 });
  }
  return { uid: data.user.id, email: data.user.email || "" };
}

/** As configurações salvas da pessoa (o país do perfil decide o gateway). */
export async function readSettings(userId) {
  const { data, error } = await db()
    .from("user_private")
    .select("data")
    .eq("user_id", String(userId))
    .eq("doc_id", "settings")
    .maybeSingle();
  if (error) throw error;
  return data?.data || {};
}

/** Grava o plano do usuário. Único lugar do sistema que faz isso. */
export async function setUserPlan(userId, { plan, provider, providerRef, currentPeriodEnd }) {
  const { error } = await db()
    .from("user_plans")
    .upsert({
      user_id: String(userId),
      plan,
      subscription: {
        provider,
        providerRef: providerRef || null,
        currentPeriodEnd: currentPeriodEnd || null,
        updatedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
