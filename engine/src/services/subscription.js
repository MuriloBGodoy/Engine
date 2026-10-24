import { auth } from "./supabase";

/**
 * Início da assinatura do Premium.
 *
 * O cliente não fala com gateway nenhum: pede o checkout a uma Netlify
 * Function, que guarda a chave secreta e decide o provedor pela região. A
 * confirmação do pagamento nunca passa por aqui — chega por webhook e vira
 * `user_plans.plan`, que o cliente só lê.
 */
async function callFunction(name, body = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Entre na sua conta para continuar.");

  const token = await user.getIdToken();
  const response = await fetch(`/.netlify/functions/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Algo deu errado. Tente de novo.");
  return data;
}

/**
 * Abre a compra de uma oferta (ids em netlify/functions/lib/plans.js).
 *
 * Devolve `{ provider: "stripe", clientSecret }` para o checkout embutido no
 * app, ou `{ provider: "mercadopago", url }` para mandar a pessoa à página do
 * Mercado Pago.
 */
export async function startCheckout(offer, { country } = {}) {
  const data = await callFunction("subscription-create", { offer, country });
  if (!data.clientSecret && !data.url) throw new Error("Não foi possível iniciar a assinatura.");
  return data;
}

/** Link do portal do Stripe: cancelar, trocar cartão, ver faturas. */
export async function openBillingPortal() {
  const { url } = await callFunction("subscription-portal");
  return url;
}
