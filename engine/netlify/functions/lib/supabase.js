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
export async function setUserPlan(
  userId,
  { plan, provider, providerRef, currentPeriodEnd, offer, kind, founder, trialEnd, cancelAtPeriodEnd },
) {
  const { error } = await db()
    .from("user_plans")
    .upsert({
      user_id: String(userId),
      plan,
      subscription: {
        provider,
        providerRef: providerRef || null,
        currentPeriodEnd: currentPeriodEnd || null,
        // Qual oferta (lib/plans.js), se é assinatura ou passe, se pegou o
        // preço de fundador e quando acaba o teste grátis.
        offer: offer || null,
        kind: kind || null,
        founder: Boolean(founder),
        trialEnd: trialEnd || null,
        cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
        updatedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;

  await espelharApoiador(userId, plan);
}

/**
 * Marca (ou desmarca) o selo de Apoiador no perfil PÚBLICO.
 *
 * O plano mora em `user_plans`, que só o servidor lê — ninguém consegue ver o
 * plano de outra pessoa, e é assim que tem de ser. Mas um selo que só o dono
 * enxerga não é selo: metade do que a pessoa compra quando assina cedo é que
 * os outros vejam que ela chegou primeiro.
 *
 * Então o que vai para o perfil público é um booleano e nada mais: `supporter`
 * dentro do `data` que já existe. Não vaza plano, nem valor, nem vencimento —
 * só "esta pessoa apoia". Por ser uma chave dentro de um JSONB que já está lá,
 * não precisou de migração nenhuma.
 *
 * Perfil que ainda não existe (cadastro pela metade) é ignorado de propósito:
 * criar meia linha de perfil aqui faria aparecer um fantasma na busca.
 */
async function espelharApoiador(userId, plan) {
  const apoia = plan !== "free";
  const client = db();
  const { data, error } = await client
    .from("public_profiles")
    .select("data")
    .eq("user_id", String(userId))
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const atual = data.data || {};
  if (Boolean(atual.supporter) === apoia) return;

  const { error: falha } = await client
    .from("public_profiles")
    .update({ data: { ...atual, supporter: apoia } })
    .eq("user_id", String(userId));
  if (falha) throw falha;
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Plano gravado de alguém (ou null). Só o servidor lê o de outra pessoa. */
export async function readUserPlan(userId) {
  const { data, error } = await db()
    .from("user_plans")
    .select("plan, subscription")
    .eq("user_id", String(userId))
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Quantos já pegaram o preço de fundador do Pro (ativos ou não: a vaga é de quem chegou primeiro). */
export async function countFounders() {
  const { count, error } = await db()
    .from("user_plans")
    .select("user_id", { count: "exact", head: true })
    .eq("subscription->>founder", "true");
  if (error) throw error;
  return count || 0;
}
