/**
 * Qual gateway atende cada região.
 *
 * Desde 24/10/2026 o Brasil vai pelo Stripe (decisão do dono): checkout
 * embutido no app, assinatura, teste grátis e portal de cancelamento prontos,
 * e a conta será aberta já como MEI/CNPJ (o tipo da conta no Stripe Brasil não
 * muda depois de verificado). O Pix do Stripe é só por convite e só em
 * pagamento único; se ele não for liberado, o Pix do Mercado Pago entra como
 * complemento, por isso o caminho do Mercado Pago continua aqui.
 *
 * O Mercado Pago segue atendendo a LatAm de língua espanhola, onde é o checkout
 * que o vendedor reconhece. O resto vai pelo Stripe.
 */
export const MERCADO_PAGO = "mercadopago";
export const STRIPE = "stripe";

// Países onde o Mercado Pago opera e que o Engine suporta (locations.js).
const MERCADO_PAGO_COUNTRIES = ["AR", "MX", "CL", "CO"];

const COUNTRY_CURRENCY = {
  BR: "BRL",
  AR: "USD",
  MX: "USD",
  CL: "USD",
  CO: "USD",
  US: "USD",
  PT: "EUR",
  ES: "EUR",
  GB: "EUR",
  FR: "EUR",
  DE: "EUR",
  IT: "EUR",
};

export function providerForCountry(country) {
  const code = String(country || "").toUpperCase();
  return MERCADO_PAGO_COUNTRIES.includes(code) ? MERCADO_PAGO : STRIPE;
}

export function currencyForCountry(country) {
  return COUNTRY_CURRENCY[String(country || "").toUpperCase()] || "USD";
}
