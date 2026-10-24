/**
 * Webhook do Stripe: é aqui que o plano é ativado ou cortado.
 *
 * POST /.netlify/functions/subscription-webhook-stripe
 *
 * A assinatura do evento é verificada com STRIPE_WEBHOOK_SECRET. Sem isso,
 * qualquer um descobriria a URL e mandaria um "pagamento aprovado" falso pra
 * virar premium — o endpoint é público por natureza.
 */
import Stripe from "stripe";
import { json, readUserPlan, setUserPlan } from "./lib/supabase.js";
import { STRIPE } from "./lib/providers.js";
import { offerFor, passEnd } from "./lib/plans.js";

// Estados em que a Stripe considera a assinatura valendo.
const ACTIVE = ["active", "trialing"];

/**
 * Passe avulso: Premium até N meses a partir de hoje, ou a partir do fim do
 * passe atual se ainda estiver valendo (comprar dois seguidos soma). Quem já
 * tem assinatura ativa não perde nada: o plano não é rebaixado.
 */
async function activatePass(userId, offer, session) {
  const current = await readUserPlan(userId);
  const sub = current?.subscription || {};
  if (sub.kind === "subscription" && current.plan !== "free") return;
  await setUserPlan(userId, {
    plan: offer.plan,
    provider: STRIPE,
    providerRef: session.payment_intent || session.id,
    currentPeriodEnd: passEnd(offer.months, sub.kind === "pass" ? sub.currentPeriodEnd : null),
    offer: session.metadata.offer,
    kind: "pass",
    trialEnd: sub.trialEnd || null,
  });
}

/**
 * Grava o estado de uma assinatura do Stripe como está agora. Idempotente:
 * pode chegar o mesmo evento duas vezes, ou fora de ordem, sem estragar nada.
 */
async function syncSubscription(subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;
  const offer = offerFor(subscription.metadata?.offer);
  // Pediu para cancelar continua valendo até o fim do período pago; o status
  // só sai de active/trialing quando o período acaba de fato.
  const active = ACTIVE.includes(subscription.status);
  const periodEnd =
    subscription.items?.data?.[0]?.current_period_end || subscription.current_period_end;
  const toIso = (seconds) => (seconds ? new Date(seconds * 1000).toISOString() : null);
  await setUserPlan(userId, {
    plan: active ? offer?.plan || "premium" : "free",
    provider: STRIPE,
    providerRef: subscription.id,
    currentPeriodEnd: toIso(periodEnd),
    offer: subscription.metadata.offer,
    kind: "subscription",
    founder: subscription.metadata.founder === "true",
    trialEnd: toIso(subscription.trial_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
  });
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Método não suportado." }, 405);

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) return json({ error: "Stripe não configurado." }, 500);

  const stripe = new Stripe(key);
  let event;

  try {
    // Precisa ser o corpo cru: qualquer reserialização quebra a assinatura.
    const raw = await request.text();
    event = await stripe.webhooks.constructEventAsync(
      raw,
      request.headers.get("stripe-signature"),
      secret,
    );
  } catch (error) {
    console.error("stripe webhook: assinatura inválida", error.message);
    return json({ error: "Assinatura inválida." }, 400);
  }

  try {
    const object = event.data.object;

    // Fim do checkout: assinatura (com ou sem teste) ou passe pago.
    if (event.type === "checkout.session.completed") {
      const userId = object.client_reference_id || object.metadata?.userId;
      const offer = offerFor(object.metadata?.offer);
      if (userId && offer) {
        if (offer.kind === "pass") {
          // Passe só vale com o dinheiro na conta (cartão confirma na hora;
          // Pix assíncrono chega em `async_payment_succeeded`).
          if (object.payment_status === "paid") await activatePass(userId, offer, object);
        } else if (object.subscription) {
          // Relê a assinatura no Stripe em vez de montar pela metade: os
          // eventos chegam fora de ordem, e o `subscription.created` pode já
          // ter gravado o fim do teste.
          await syncSubscription(await stripe.subscriptions.retrieve(object.subscription));
        }
      }
    }

    if (event.type === "checkout.session.async_payment_succeeded") {
      const userId = object.client_reference_id || object.metadata?.userId;
      const offer = offerFor(object.metadata?.offer);
      if (userId && offer?.kind === "pass") await activatePass(userId, offer, object);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncSubscription(object);
    }

    return json({ received: true });
  } catch (error) {
    console.error("stripe webhook", error);
    // 500 faz a Stripe reenviar; melhor repetir do que perder um pagamento.
    return json({ error: "Falha ao processar evento." }, 500);
  }
};
