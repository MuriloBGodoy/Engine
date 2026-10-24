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
 * Valores na menor unidade da moeda (centavos), que é o que o Stripe pede.
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
    amount: { BRL: 2500, USD: 600, EUR: 600 },
    founderAmount: { BRL: 1500, USD: 400, EUR: 400 },
    trialDays: PRO_TRIAL_DAYS,
  },
  premium_yearly: {
    plan: "premium",
    kind: "subscription",
    interval: "year",
    name: "Engine Premium (anual)",
    description: "Para o dono do carro: alertas de FIPE, manutenção programada, custo total e sem anúncios.",
    amount: { BRL: 7990, USD: 1990, EUR: 1990 },
  },
  premium_pass_1m: {
    plan: "premium",
    kind: "pass",
    months: 1,
    name: "Engine Premium — passe de 1 mês",
    description: "Pagamento único, sem renovação automática.",
    amount: { BRL: 1490, USD: 399, EUR: 399 },
  },
  premium_pass_3m: {
    plan: "premium",
    kind: "pass",
    months: 3,
    name: "Engine Premium — passe de 3 meses",
    description: "Pagamento único, sem renovação automática.",
    amount: { BRL: 3490, USD: 899, EUR: 899 },
  },
};

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
