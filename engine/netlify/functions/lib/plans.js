/**
 * O que o Engine vende. Decidido com o dono em 24/10/2026:
 *
 *  - Tudo o que já existe no app fica grátis para sempre (inclusive publicar
 *    serviço). Os planos só ACRESCENTAM.
 *  - Pro: para o prestador de serviço. Inclui tudo do Premium. Mensal, com
 *    30 dias de teste; os primeiros FOUNDER_SLOTS assinantes pagam o preço de
 *    fundador para sempre.
 *  - Premium: para o dono do carro. Anual, ou passe avulso de 1 ou 3 meses
 *    (pagamento único, sem renovação), porque decidir uma compra de carro é
 *    coisa de algumas semanas.
 *
 * Os preços vivem aqui, e não como "Price" criado no painel do Stripe: o
 * checkout manda `price_data` e o produto nasce sozinho. Mudar preço é mudar
 * este arquivo, sem caçar ID em painel.
 *
 * Valores na menor unidade que o Stripe pede para cada moeda: centavos nas
 * moedas de duas casas (BRL, USD, EUR, GBP, MXN, COP, ARS) e a própria unidade
 * no peso chileno, que o Stripe trata como moeda sem casas decimais (ver
 * ZERO_DECIMAL_CURRENCIES). R$ 25,00 é 2500; CLP 2.690 é 2690; COP 8.900 é
 * 890000.
 *
 * Este arquivo é lido pela função de checkout E pela tela de Planos
 * (src/services/billing.js): o preço que aparece é o mesmo que se cobra.
 *
 * --- Preço por país (28/10/2026) ---------------------------------------------
 *
 * BRL e USD foram decididos pelo dono. As outras moedas saem do dólar pela
 * paridade de poder de compra: valor local = preço em USD × fator PPP, depois
 * arredondado para um preço "de vitrine" local logo abaixo ou perto (…,99 /
 * …90 / …990 / …900).
 *
 * Fonte: Banco Mundial, indicador PA.NUS.PPP ("PPP conversion factor, GDP,
 * LCU per international $"), ano 2025, base atualizada em 08/10/2026,
 * consultada em 28/10/2026 em
 * https://api.worldbank.org/v2/country/<país>/indicator/PA.NUS.PPP
 *
 *   GB 0,677 · MX 10,33 · CL 453,2 · CO 1.532,7 · AR 567,3
 *   Zona do euro: o Banco Mundial não publica o agregado; os países vão de
 *   PT 0,534 e ES 0,571 a IT 0,610, FR 0,678 e DE 0,710. Usamos 0,65 para um
 *   preço único em euro.
 *   (BR 2,554 — o preço em reais fica ACIMA da paridade do preço em dólar,
 *   decisão do dono; não foi derivado.)
 *
 * Argentina: o fator de 2025 já envelheceu com a inflação de lá. Antes de
 * abrir a venda na Argentina, refazer a conta com o fator mais novo.
 */
export const FOUNDER_SLOTS = 30;
export const PRO_TRIAL_DAYS = 30;

export const OFFERS = {
  pro_monthly: {
    plan: "pro",
    kind: "subscription",
    interval: "month",
    name: "Engine Pro",
    description: "Para quem presta serviço: métricas mês a mês, pedidos de orçamento e tudo do Premium.",
    amount: { BRL: 2500, USD: 600, EUR: 399, GBP: 399, MXN: 5900, CLP: 2690, COP: 890000, ARS: 349000 },
    founderAmount: { BRL: 1500, USD: 400, EUR: 249, GBP: 249, MXN: 3900, CLP: 1790, COP: 590000, ARS: 229000 },
    trialDays: PRO_TRIAL_DAYS,
  },
  premium_yearly: {
    plan: "premium",
    kind: "subscription",
    interval: "year",
    name: "Engine Premium (anual)",
    description: "Para o dono do carro: alertas de FIPE, manutenção programada, custo total e sem anúncios.",
    amount: { BRL: 7990, USD: 1990, EUR: 1299, GBP: 1299, MXN: 19900, CLP: 8990, COP: 2990000, ARS: 1149000 },
  },
  premium_pass_1m: {
    plan: "premium",
    kind: "pass",
    months: 1,
    name: "Engine Premium — passe de 1 mês",
    description: "Pagamento único, sem renovação automática.",
    amount: { BRL: 1490, USD: 399, EUR: 249, GBP: 249, MXN: 3900, CLP: 1790, COP: 590000, ARS: 229000 },
  },
  premium_pass_3m: {
    plan: "premium",
    kind: "pass",
    months: 3,
    name: "Engine Premium — passe de 3 meses",
    description: "Pagamento único, sem renovação automática.",
    amount: { BRL: 3490, USD: 899, EUR: 599, GBP: 599, MXN: 8900, CLP: 3990, COP: 1390000, ARS: 499000 },
  },
};

/**
 * Moedas que o Stripe trata sem casas decimais: o valor vai na própria
 * unidade (CLP 2690 = $2.690), não em centavos. Lista completa em
 * https://docs.stripe.com/currencies#zero-decimal — aqui só as que usamos.
 * COP e ARS NÃO estão nela: no Stripe são de duas casas.
 */
export const ZERO_DECIMAL_CURRENCIES = ["CLP"];

/** Valor em unidades da moeda (25, 2690, 8900) a partir do que vai ao Stripe. */
export function toMajorUnits(amount, currency) {
  return ZERO_DECIMAL_CURRENCIES.includes(currency) ? amount : amount / 100;
}

export const CURRENCIES = ["BRL", "USD", "EUR", "GBP", "MXN", "CLP", "COP", "ARS"];

// Zona do euro inteira (os 20 que usam o euro em 2026).
const EUROZONE = [
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
];

const COUNTRY_CURRENCY = {
  BR: "BRL",
  US: "USD",
  AR: "ARS",
  MX: "MXN",
  CL: "CLP",
  CO: "COP",
  GB: "GBP",
  ...Object.fromEntries(EUROZONE.map((code) => [code, "EUR"])),
};

/** Moeda de cobrança de um país. Qualquer país fora da tabela paga em dólar. */
export function currencyForCountry(country) {
  return COUNTRY_CURRENCY[String(country || "").toUpperCase()] || "USD";
}

/**
 * Países onde a assinatura está à venda. Fora daqui o preço aparece só como
 * informação e o servidor recusa o checkout.
 *
 * Por que só dois (28/10/2026): vender serviço digital a consumidor na UE e
 * no Reino Unido obriga a recolher o IVA de lá (OSS/VAT), e México, Chile e
 * Colômbia têm imposto equivalente sobre serviço digital estrangeiro. Isso
 * espera o contador. A Argentina também, até ele confirmar.
 */
export const SELLABLE_COUNTRIES = ["BR", "US"];

export function isSellableCountry(country) {
  return SELLABLE_COUNTRIES.includes(String(country || "").toUpperCase());
}

/** Preço de uma oferta num país: { amount, founderAmount, currency }. */
export function priceFor(offer, country) {
  const currency = currencyForCountry(country);
  return {
    currency,
    amount: offer.amount[currency],
    founderAmount: offer.founderAmount ? offer.founderAmount[currency] : undefined,
  };
}

export function offerFor(id) {
  return Object.prototype.hasOwnProperty.call(OFFERS, id) ? OFFERS[id] : null;
}

/** Fim de um passe que começa agora — ou que estende um passe ainda valendo. */
export function passEnd(months, currentEnd) {
  const now = new Date();
  const base = currentEnd && new Date(currentEnd) > now ? new Date(currentEnd) : now;
  const end = new Date(base);
  end.setMonth(end.getMonth() + months);
  return end.toISOString();
}
