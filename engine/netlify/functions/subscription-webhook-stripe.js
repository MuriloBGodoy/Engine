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
import { json, setUserPlan } from "./lib/supabase.js";
import { STRIPE } from "./lib/providers.js";

// Estados em que a Stripe considera a assinatura valendo.
const ACTIVE = ["active", "trialing"];

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

    if (event.type === "checkout.session.completed") {
      const userId = object.client_reference_id || object.metadata?.userId;
      if (userId) {
        await setUserPlan(userId, {
          plan: "premium",
          provider: STRIPE,
          providerRef: object.subscription || object.id,
        });
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const userId = object.metadata?.userId;
      if (userId) {
        const active = ACTIVE.includes(object.status) && !object.cancel_at_period_end;
        await setUserPlan(userId, {
          // Cancelou? Volta pra gratuito — mas só no fim do período pago, que
          // é o que `current_period_end` guarda.
          plan: active ? "premium" : "free",
          provider: STRIPE,
          providerRef: object.id,
          currentPeriodEnd: object.current_period_end
            ? new Date(object.current_period_end * 1000).toISOString()
            : null,
        });
      }
    }

    return json({ received: true });
  } catch (error) {
    console.error("stripe webhook", error);
    // 500 faz a Stripe reenviar; melhor repetir do que perder um pagamento.
    return json({ error: "Falha ao processar evento." }, 500);
  }
};
