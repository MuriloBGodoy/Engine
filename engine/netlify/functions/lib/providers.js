/**
 * Qual gateway atende cada região.
 *
 * Desde 28/10/2026 TUDO vai pelo Stripe. Na conta de teste (Brasil, CPF,
 * liquida em BRL) o Checkout criou assinatura e pagamento único em usd, eur,
 * gbp, ars, mxn, clp e cop, então um gateway só cobre todos os países, com o
 * preço local de lib/plans.js.
 *
 * O Mercado Pago nunca chegou a ser configurado (sem MERCADOPAGO_ACCESS_TOKEN
 * em lugar nenhum). O caminho dele continua no código — createMercadoPago em
 * subscription-create.js e subscription-webhook-mercadopago.js — porque o Pix
 * do Stripe é só por convite; se ele não for liberado, o Pix do Mercado Pago
 * pode entrar como complemento no Brasil. Hoje ninguém é mandado para lá.
 */
export const MERCADO_PAGO = "mercadopago";
export const STRIPE = "stripe";

// A moeda de cada país mora no catálogo, que a tela de Planos também lê.
export { currencyForCountry } from "./plans.js";

export function providerForCountry() {
  return STRIPE;
}
