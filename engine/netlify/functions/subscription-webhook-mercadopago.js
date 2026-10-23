/**
 * Webhook do Mercado Pago: ativa ou corta o plano.
 *
 * POST /.netlify/functions/subscription-webhook-mercadopago
 *
 * Duas defesas, porque o endpoint é público:
 *  1. A assinatura HMAC do header `x-signature` é conferida com
 *     MERCADOPAGO_WEBHOOK_SECRET.
 *  2. Mesmo com assinatura válida, o status nunca é lido do corpo — a gente
 *     volta na API do Mercado Pago e pergunta como está a assinatura. O corpo
 *     diz o que mudou, não o que vale.
 */
import crypto from "node:crypto";
import MercadoPagoConfig, { PreApproval } from "mercadopago";
import { json, setUserPlan } from "./lib/supabase.js";
import { MERCADO_PAGO } from "./lib/providers.js";

/**
 * O manifest é montado num formato fixo do Mercado Pago:
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 */
const isValidSignature = (request, dataId) => {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return false;

  const signature = request.headers.get("x-signature") || "";
  const parts = Object.fromEntries(
    signature.split(",").map((part) => part.split("=").map((piece) => piece.trim())),
  );
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;

  const requestId = request.headers.get("x-request-id") || "";
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(hash);
  // Comparação em tempo constante: `===` vaza informação pelo tempo de resposta.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Método não suportado." }, 405);

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return json({ error: "Mercado Pago não configurado." }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  const dataId = String(body?.data?.id || "");
  if (!dataId) return json({ received: true });

  if (!isValidSignature(request, dataId)) {
    console.error("mercadopago webhook: assinatura inválida");
    return json({ error: "Assinatura inválida." }, 401);
  }

  // Só assinatura interessa aqui; pagamento avulso chega em outro tipo.
  const type = body.type || body.topic;
  if (type !== "subscription_preapproval") return json({ received: true });

  try {
    const client = new MercadoPagoConfig({ accessToken: token });
    const preapproval = await new PreApproval(client).get({ id: dataId });

    const userId = preapproval.external_reference;
    if (!userId) {
      console.error("mercadopago webhook: preapproval sem external_reference", dataId);
      return json({ received: true });
    }

    // `authorized` é o único estado que vale como assinatura em dia; `paused`
    // e `cancelled` derrubam pra gratuito.
    const active = preapproval.status === "authorized";

    await setUserPlan(userId, {
      plan: active ? "premium" : "free",
      provider: MERCADO_PAGO,
      providerRef: dataId,
      currentPeriodEnd: preapproval.next_payment_date || null,
    });

    return json({ received: true });
  } catch (error) {
    console.error("mercadopago webhook", error);
    // 500 faz o Mercado Pago reenviar; melhor repetir do que perder ativação.
    return json({ error: "Falha ao processar evento." }, 500);
  }
};
