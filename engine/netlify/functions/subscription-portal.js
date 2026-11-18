/**
 * Abre o portal do Stripe para a pessoa gerenciar a própria assinatura:
 * cancelar, trocar o cartão, ver e baixar as faturas.
 *
 * POST /.netlify/functions/subscription-portal
 * Header: Authorization: Bearer <token de sessão do Supabase>
 * Resposta: { url }
 *
 * Cancelar precisa ser tão fácil quanto assinar: um botão em Configurações ›
 * Seu plano leva direto para cá, sem formulário nem "fale com o suporte".
 */
import Stripe from "stripe";
import { json, readUserPlan, requireUser } from "./lib/supabase.js";
import { STRIPE } from "./lib/providers.js";

const siteUrl = () => (process.env.SITE_URL || process.env.URL || "").replace(/\/+$/, "");

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Método não suportado." }, 405);

  try {
    const user = await requireUser(request);
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY ausente.");

    const current = await readUserPlan(user.uid);
    const sub = current?.subscription || {};
    if (sub.provider !== STRIPE || sub.kind !== "subscription" || !sub.providerRef) {
      return json({ error: "Você não tem assinatura para gerenciar." }, 404);
    }

    const stripe = new Stripe(key);
    const subscription = await stripe.subscriptions.retrieve(sub.providerRef);
    const portal = await stripe.billingPortal.sessions.create({
      customer: String(subscription.customer),
      return_url: `${siteUrl()}/settings`,
    });

    return json({ url: portal.url });
  } catch (error) {
    /* `statusCode` ANTES de `status`: o SDK do Stripe grava o código HTTP em
       `error.statusCode`, e lendo só `status` todo erro dele virava 500 — ou
       seja, virava a frase genérica "Não foi possível abrir o gerenciamento.",
       que não diz o que houve nem o que fazer. Aconteceu em 17/11/2026 com uma
       assinatura gravada no banco que não existe nesta chave do Stripe. */
    const status = error.statusCode || error.status || 500;
    console.error("subscription-portal", error);

    /* Assinatura que o banco conhece e o Stripe não. Acontece quando a linha
       veio de um teste (chave de teste) e a chave em uso é a de produção, ou
       quando a assinatura foi apagada lá direto. Quem lê precisa entender que
       não é falha de rede e que tentar de novo não resolve. */
    if (error.code === "resource_missing") {
      return json(
        {
          error:
            "Esta assinatura não existe mais no provedor de pagamento. Fale com a gente para acertar o seu plano.",
        },
        409,
      );
    }

    return json(
      { error: status < 500 ? error.message : "Não foi possível abrir o gerenciamento." },
      status,
    );
  }
};
