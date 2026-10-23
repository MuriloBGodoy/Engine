/**
 * Inicia a assinatura do plano Premium e devolve o link do checkout.
 *
 * POST /.netlify/functions/subscription-create
 * Header: Authorization: Bearer <token de sessão do Supabase>
 * Body:   { country: "BR" }  (opcional; sem isso cai no país do perfil)
 *
 * Premium libera duas coisas: navegar sem anúncio e publicar serviço.
 */
import MercadoPagoConfig, { PreApproval } from "mercadopago";
import Stripe from "stripe";
import { json, readSettings, requireUser } from "./lib/supabase.js";
import {
  MERCADO_PAGO,
  PLAN_PRICES,
  currencyForCountry,
  providerForCountry,
} from "./lib/providers.js";

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

async function createMercadoPago({ user, country, email }) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN ausente.");

  const client = new MercadoPagoConfig({ accessToken: token });
  const preapproval = await new PreApproval(client).create({
    body: {
      reason: "Engine Premium",
      // Volta pro app já sabendo de quem é a assinatura.
      external_reference: user.uid,
      payer_email: email,
      back_url: `${siteUrl()}/settings?assinatura=ok`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: PLAN_PRICES[currencyForCountry(country)],
        currency_id: currencyForCountry(country),
      },
      status: "pending",
    },
  });

  return preapproval.init_point;
}

async function createStripe({ user, country, email }) {
  const key = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_ID;
  if (!key) throw new Error("STRIPE_SECRET_KEY ausente.");
  if (!price) throw new Error("STRIPE_PRICE_ID ausente.");

  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer_email: email,
    // O webhook precisa saber de quem é o pagamento; o uid viaja nos dois
    // lugares porque a sessão e a assinatura chegam em eventos diferentes.
    client_reference_id: user.uid,
    subscription_data: { metadata: { userId: user.uid, country } },
    metadata: { userId: user.uid },
    success_url: `${siteUrl()}/settings?assinatura=ok`,
    cancel_url: `${siteUrl()}/settings?assinatura=cancelada`,
  });

  return session.url;
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Método não suportado." }, 405);

  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => ({}));

    // País vem do perfil salvo; o corpo só serve de fallback pra quem ainda
    // não preencheu o cadastro. Nunca confiar só no que o cliente manda.
    const settings = await readSettings(user.uid);
    const country =
      settings?.profile?.country || String(body.country || "BR").toUpperCase();

    const provider = providerForCountry(country);
    const email = user.email || body.email || undefined;

    const url =
      provider === MERCADO_PAGO
        ? await createMercadoPago({ user, country, email })
        : await createStripe({ user, country, email });

    if (!url) return json({ error: "Checkout não retornou link." }, 502);

    return json({ url, provider, country });
  } catch (error) {
    const status = error.status || 500;
    // A mensagem crua pode conter detalhe do gateway; loga inteiro e devolve
    // só o essencial pro cliente.
    console.error("subscription-create", error);
    return json({ error: status === 401 ? error.message : "Falha ao iniciar assinatura." }, status);
  }
};
