/**
 * Inicia a compra de um plano e devolve o que o app precisa para o checkout.
 *
 * POST /.netlify/functions/subscription-create
 * Header: Authorization: Bearer <token de sessão do Supabase>
 * Body:   { offer: "pro_monthly" | "premium_yearly" | "premium_pass_1m" | "premium_pass_3m",
 *           country?: "BR" }
 *
 * Resposta:
 *   Stripe        → { provider: "stripe", clientSecret }  (checkout embutido no app)
 *   Mercado Pago  → { provider: "mercadopago", url }      (página do Mercado Pago;
 *                   desligado desde 28/10/2026, ver lib/providers.js)
 *   País fora da venda → 403 { error, code: "country_not_sellable", country }
 *
 * O catálogo, os preços por moeda e os países à venda estão em lib/plans.js.
 * Quem ativa o plano é o webhook; esta função só abre o pagamento.
 */
import MercadoPagoConfig, { PreApproval } from "mercadopago";
import Stripe from "stripe";
import { countFounders, json, readSettings, readUserPlan, requireUser } from "./lib/supabase.js";
import { MERCADO_PAGO, currencyForCountry, providerForCountry } from "./lib/providers.js";
import { FOUNDER_SLOTS, isSellableCountry, offerFor, priceFor, toMajorUnits } from "./lib/plans.js";

/**
 * Endereço para onde o gateway devolve a pessoa no fim do checkout.
 *
 * Aqui havia uma reserva: `process.env.URL || "https://engine.netlify.app"`.
 * Esse domínio responde 404 — era um chute de quando se supôs que o site se
 * chamaria "engine". Em produção ela nunca disparava, porque `URL` é
 * justamente a variável de deploy que a Netlify entrega às funções em tempo de
 * execução. Disparava no `netlify dev`, mandando o checkout de teste para um
 * domínio morto em vez de avisar que faltava configuração.
 *
 * Reserva que esconde configuração ausente é pior que erro: troca uma falha
 * barulhenta por uma resposta errada e silenciosa, e quem descobre é o usuário.
 * Agora falha, igual às outras chaves ausentes deste mesmo arquivo.
 *
 * `SITE_URL` vem antes de propósito, e serve a dois casos:
 *   - `netlify dev`, onde `URL` não existe;
 *   - Deploy Preview, onde `URL` aponta para PRODUÇÃO e não para a preview (o
 *     endereço da preview é `DEPLOY_PRIME_URL`, que não chega às funções).
 *     Sem isso, testar assinatura numa preview devolve a pessoa no site real.
 */
const siteUrl = () => {
  const url = process.env.SITE_URL || process.env.URL;
  if (!url) {
    throw new Error(
      "URL do site ausente: defina SITE_URL para o endereço de retorno do checkout.",
    );
  }
  // Barra sobrando viraria `//settings` no retorno.
  return url.replace(/\/+$/, "");
};

// Sem uso desde 28/10/2026: providerForCountry devolve Stripe para todos e o
// Mercado Pago nunca foi configurado. Fica para o caso de o Pix do Stripe não
// ser liberado (ver lib/providers.js).
async function createMercadoPago({ user, country, email, offerId, offer }) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN ausente.");
  // Passe avulso é pagamento único; no Mercado Pago só montamos assinatura.
  if (offer.kind !== "subscription") {
    throw Object.assign(new Error("Esta opção não está disponível no seu país."), { status: 400 });
  }

  const currency = currencyForCountry(country);
  const client = new MercadoPagoConfig({ accessToken: token });
  const preapproval = await new PreApproval(client).create({
    body: {
      reason: offer.name,
      // O webhook lê daqui de quem é a assinatura e qual oferta foi.
      external_reference: `${user.uid}:${offerId}`,
      payer_email: email,
      back_url: `${siteUrl()}/settings?assinatura=ok`,
      auto_recurring: {
        frequency: offer.interval === "year" ? 12 : 1,
        frequency_type: "months",
        // Mercado Pago quer o valor em unidades, não em centavos.
        transaction_amount: toMajorUnits(offer.amount[currency], currency),
        currency_id: currency,
      },
      status: "pending",
    },
  });

  return { url: preapproval.init_point };
}

async function createStripe({ user, country, email, offerId, offer }) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY ausente.");

  const stripe = new Stripe(key);
  const { currency, amount, founderAmount } = priceFor(offer, country);

  // Preço de fundador: os primeiros do Pro pagam menos para sempre. A vaga é
  // conferida aqui e gravada pelo webhook; numa corrida de dois no último
  // lugar, os dois levam, e tudo bem.
  const founder =
    offerId === "pro_monthly" && founderAmount && (await countFounders()) < FOUNDER_SLOTS;
  const unitAmount = founder ? founderAmount : amount;

  // Quem já usou o teste grátis uma vez não ganha outro.
  const previous = await readUserPlan(user.uid);
  const trialDays = offer.trialDays && !previous?.subscription?.trialEnd ? offer.trialDays : 0;

  const metadata = { userId: user.uid, offer: offerId, founder: founder ? "true" : "false", country };
  const isSubscription = offer.kind === "subscription";

  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded_page",
    mode: isSubscription ? "subscription" : "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: unitAmount,
          product_data: { name: offer.name, description: offer.description },
          ...(isSubscription ? { recurring: { interval: offer.interval } } : {}),
        },
      },
    ],
    customer_email: email,
    // O webhook precisa saber de quem é o pagamento; o uid viaja na sessão e
    // na assinatura porque elas chegam em eventos diferentes.
    client_reference_id: user.uid,
    metadata,
    ...(isSubscription
      ? {
          subscription_data: {
            metadata,
            ...(trialDays
              ? {
                  trial_period_days: trialDays,
                  // Sem cartão válido no fim do teste, a assinatura cancela
                  // sozinha em vez de virar cobrança pendente.
                  trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
                }
              : {}),
          },
        }
      : { payment_intent_data: { metadata } }),
    // Texto que aparece junto do botão de pagar: o que a pessoa está aceitando.
    custom_text: {
      submit: {
        message: isSubscription
          ? trialDays
            ? `Grátis por ${trialDays} dias. Avisamos antes da primeira cobrança. Cancele quando quiser em Configurações › Seu plano.`
            : "Renova automaticamente. Cancele quando quiser em Configurações › Seu plano."
          : "Pagamento único. Não renova sozinho.",
      },
    },
    return_url: `${siteUrl()}/settings?assinatura=ok&session_id={CHECKOUT_SESSION_ID}`,
  });

  return { clientSecret: session.client_secret, founder, trialDays };
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Método não suportado." }, 405);

  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => ({}));

    const offerId = String(body.offer || "");
    const offer = offerFor(offerId);
    if (!offer) return json({ error: "Plano desconhecido." }, 400);

    // De onde vem o país (igual a antes de 28/10/2026, só normalizado):
    //   1. o país do perfil salvo (Configurações › Perfil);
    //   2. sem ele, o que o app manda — a região de navegação
    //      (services/region.js: escolha salva, geo-IP, idioma do navegador);
    //   3. sem nenhum dos dois, BR.
    // O 2 é palpite do cliente e dá para forjar; o pior caso é alguém sem
    // país no perfil comprar no preço de outro país à venda. A moeda e o
    // preço, esses, nunca vêm do cliente.
    const settings = await readSettings(user.uid);
    const country = String(settings?.profile?.country || body.country || "BR")
      .trim()
      .toUpperCase();

    if (!isSellableCountry(country)) {
      return json(
        {
          error: "As assinaturas ainda não estão disponíveis no seu país.",
          code: "country_not_sellable",
          country,
        },
        403,
      );
    }

    const provider = providerForCountry(country);
    const email = user.email || body.email || undefined;
    const args = { user, country, email, offerId, offer };

    const result =
      provider === MERCADO_PAGO ? await createMercadoPago(args) : await createStripe(args);

    if (!result.url && !result.clientSecret) {
      return json({ error: "Checkout não retornou nada." }, 502);
    }

    return json({ ...result, provider, country });
  } catch (error) {
    const status = error.status || 500;
    // A mensagem crua pode conter detalhe do gateway; loga inteiro e devolve
    // só o essencial pro cliente.
    console.error("subscription-create", error);
    return json(
      { error: status < 500 ? error.message : "Falha ao iniciar assinatura." },
      status,
    );
  }
};
