import { auth } from "./supabase";

/**
 * Início da assinatura do Premium.
 *
 * O cliente não fala com gateway nenhum: pede o checkout a uma Netlify
 * Function, que guarda a chave secreta e decide o provedor pela região. A
 * confirmação do pagamento nunca passa por aqui — chega por webhook e vira
 * `user_plans.plan`, que o cliente só lê.
 */
export async function startSubscription({ country } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Entre na sua conta para assinar.");

  const token = await user.getIdToken();
  const response = await fetch("/.netlify/functions/subscription-create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ country }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    throw new Error(data.error || "Não foi possível iniciar a assinatura.");
  }

  return data.url;
}
