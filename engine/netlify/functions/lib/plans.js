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
 *   GB 0,677 · MX 10,33 · CL 453,2 · CO 1.532,7
 *   Zona do euro: o Banco Mundial não publica o agregado; os países vão de
 *   PT 0,534 e ES 0,571 a IT 0,610, FR 0,678 e DE 0,710. O euro NÃO sai da
 *   paridade: ver a nota EUR em OFFERS (30/10/2026).
 *   (BR 2,554 — o preço em reais fica ACIMA da paridade do preço em dólar,
 *   decisão do dono; não foi derivado.)
 *
 * Argentina (refeito em 30/10/2026): o fator de 2025 (567,3) envelheceu com a
 * inflação. Ele foi trazido para ago/2026 pela inflação relativa:
 *   567,3 × (IPC INDEC ago/2026 ÷ média 2025 = 1,369)
 *         ÷ (CPI-U EUA ago/2026 ÷ média 2025 = 1,038) ≈ 748 ARS por $ internacional.
 *   IPC: INDEC, série 148.3_INIVELNAL_DICI_M_26 (apis.datos.gob.ar);
 *   CPI: BLS CPIAUCSL via FRED. Para comparar: câmbio oficial BCRA
 *   (Com. A 3500, variável 5) em 29/10/2026 = 1.539,6 ARS/USD, ou seja, o
 *   preço argentino fica em ~49% do americano em dólar, como manda a PPP.
 *   Refazer a cada trimestre enquanto a inflação de lá estiver nesse ritmo.
 *
 * Mínimo do Stripe: ver STRIPE_MIN_CHARGE e scripts/check-plans.mjs.
 */
export const FOUNDER_SLOTS = 30;
export const PRO_TRIAL_DAYS = 30;

// GBP segue a mesma lógica do EUR (IVA de 20% embutido + ~6% do Stripe): £4,99 deixa ~£3,90 líquidos, acima do R$ 25 do Brasil; £3,99 deixava ~£3,10.
// EUR = mesmos números do USD (€5,99 / €19,99), não PPP×$ (€3,99): preço ao consumidor na UE já inclui ~21% de IVA e o Stripe come ~6% (3,99% + 2% internacional), então €3,99 deixava ~€3,00 líquidos, menos que o R$ 25 do Brasil; €5,99 deixa ~€4,50 e fica na faixa de €4,99–€9,99/mês dos apps de consumo da zona do euro.
export const OFFERS = {
  pro_monthly: {
    plan: "pro",
    kind: "subscription",
    interval: "month",
    name: "Engine Pro",
    description: "Para quem presta serviço: métricas mês a mês, pedidos de orçamento e tudo do Premium.",
    amount: { BRL: 2500, USD: 600, EUR: 599, GBP: 499, MXN: 5900, CLP: 2690, COP: 890000, ARS: 449000 },
    founderAmount: { BRL: 1500, USD: 400, EUR: 399, GBP: 349, MXN: 3900, CLP: 1790, COP: 590000, ARS: 299000 },
    trialDays: PRO_TRIAL_DAYS,
  },
  premium_yearly: {
    plan: "premium",
    kind: "subscription",
    interval: "year",
    name: "Engine Premium (anual)",
    description: "Para o dono do carro: alertas de FIPE, manutenção programada, custo total e sem anúncios.",
    amount: { BRL: 7990, USD: 1990, EUR: 1999, GBP: 1699, MXN: 19900, CLP: 8990, COP: 2990000, ARS: 1499000 },
  },
  premium_pass_1m: {
    plan: "premium",
    kind: "pass",
    months: 1,
    name: "Engine Premium — passe de 1 mês",
    description: "Pagamento único, sem renovação automática.",
    amount: { BRL: 1490, USD: 399, EUR: 399, GBP: 349, MXN: 3900, CLP: 1790, COP: 590000, ARS: 299000 },
  },
  premium_pass_3m: {
    plan: "premium",
    kind: "pass",
    months: 3,
    name: "Engine Premium — passe de 3 meses",
    description: "Pagamento único, sem renovação automática.",
    amount: { BRL: 3490, USD: 899, EUR: 899, GBP: 749, MXN: 8900, CLP: 3990, COP: 1390000, ARS: 679000 },
  },
};

/**
 * Moedas que o Stripe trata sem casas decimais: o valor vai na própria
 * unidade (CLP 2690 = $2.690), não em centavos. Lista completa em
 * https://docs.stripe.com/currencies#zero-decimal — aqui só as que usamos.
 * COP e ARS NÃO estão nela: no Stripe são de duas casas.
 */
export const ZERO_DECIMAL_CURRENCIES = ["CLP"];

/**
 * Menor cobrança que o Stripe aceita, na menor unidade de cada moeda
 * (https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts,
 * consultado em 30/10/2026). A regra do Stripe é dupla: o valor tem de passar
 * o mínimo da moeda E, convertido para a moeda de liquidação da conta (BRL,
 * mínimo R$ 0,50), o mínimo dela. ARS e COP têm mínimo nominal de 0,50 e o CLP
 * nem aparece na tabela — para esses três usamos o equivalente a US$ 0,50, que
 * cobre com folga os R$ 0,50 de liquidação. scripts/check-plans.mjs confere
 * cada preço contra esta tabela.
 */
export const STRIPE_MIN_CHARGE = {
  BRL: 50,
  USD: 50,
  EUR: 50,
  GBP: 30,
  MXN: 1000,
  CLP: 500,
  COP: 200000,
  ARS: 100000,
};

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
