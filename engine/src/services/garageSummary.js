// Resumo da Garagem: o que a tela mostra no topo e no card, a partir do que
// já existe. Nenhuma conta nova de custo mora aqui — gasto real vem do
// `expenses.js`, vencimento do `reminders.js`, meta dos campos do carro. É só
// somar e escolher, para a tela não repetir a mesma varredura em três lugares.

import { expenseInsights } from "./expenses.js";
import { currentOdometer, garageUpcoming, hasAnyReminderSetting, localISODate } from "./reminders.js";

// Literal, e não CAR_TYPE_OWNED do db.js: este arquivo fica puro (roda no
// Node, nos scripts de checagem) e o db.js puxa o cliente do Supabase.
const isOwned = (car) => car?.type === "owned";

/**
 * Os três números do topo da Garagem.
 *
 * `realMonthly` soma SÓ a média de quem tem histórico suficiente
 * (`monthlyAverage` não nulo). Carro sem histórico entra em `ownedWithoutHistory`
 * para a tela dizer que ficou de fora, em vez de somar zero calado.
 */
export function garageSummary(cars = [], today = localISODate()) {
  const owned = cars.filter(isOwned);
  const goals = cars.filter((car) => !isOwned(car));

  let realMonthly = 0;
  const withHistory = [];
  const withoutHistory = [];
  for (const car of owned) {
    const average = expenseInsights(car).monthlyAverage;
    if (average) {
      realMonthly += average;
      withHistory.push(car);
    } else {
      withoutHistory.push(car);
    }
  }

  const upcoming = garageUpcoming(owned, today).filter((item) => item.dueDate);

  return {
    ownedCount: owned.length,
    goalCount: goals.length,
    realMonthly: withHistory.length ? realMonthly : null,
    ownedWithHistory: withHistory,
    ownedWithoutHistory: withoutHistory,
    nextDue: upcoming[0] || null,
    afterNext: upcoming[1] || null,
    savedTotal: goals.reduce((sum, car) => sum + (Number(car.savedValue) || 0), 0),
    targetTotal: goals.reduce((sum, car) => sum + (Number(car.targetValue) || 0), 0),
  };
}

/** `YYYY-MM` do mês `offset` meses antes de `today`. */
const monthKey = (today, offset) => {
  const [year, month] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 - offset, 1));
  return date.toISOString().slice(0, 7);
};

/**
 * Os últimos `count` meses, do mais antigo ao atual, com a soma de `amount`
 * dos lançamentos de cada um (aporte ou gasto: os dois têm `date` e
 * `amount`). Mês sem lançamento entra com zero — a grade não pula buracos.
 */
export function monthlyTotals(entries = [], today = localISODate(), count = 12) {
  const totals = new Map();
  for (const entry of entries || []) {
    const key = String(entry?.date || "").slice(0, 7);
    if (key) totals.set(key, (totals.get(key) || 0) + (Number(entry.amount) || 0));
  }
  return Array.from({ length: count }, (_, index) => {
    const month = monthKey(today, count - 1 - index);
    return { month, amount: totals.get(month) || 0 };
  });
}

/**
 * Meses seguidos com aporte, terminando no mês passado — ou no atual, se ele
 * já teve aporte. O mês corrente sem aporte ainda não quebra a sequência: ele
 * não acabou.
 */
/** A grade de 12 meses do card da meta. */
export const contributionMonths = (contributions = [], today = localISODate(), count = 12) =>
  monthlyTotals(contributions, today, count);

export function contributionStreak(contributions = [], today = localISODate()) {
  const months = contributionMonths(contributions, today, 120);
  let index = months.length - 1;
  if (!months[index].amount) index -= 1;
  let streak = 0;
  while (index >= 0 && months[index].amount > 0) {
    streak += 1;
    index -= 1;
  }
  return streak;
}

/**
 * O que falta num carro próprio para o card dele ter o que mostrar. Cada item
 * é verdadeiro quando JÁ está feito.
 */
export function ownedChecklist(car) {
  const insights = expenseInsights(car);
  return {
    consumption: Boolean(insights.consumption),
    reminders: hasAnyReminderSetting(car),
    photo: Boolean(car?.image),
  };
}

/** Km do painel no último lançamento com odômetro, ou null. */
export const lastOdometer = (car) => currentOdometer(car);

/** Rota da página do carro. Uma função só, para card, resumo e página concordarem. */
export const carPath = (car, tab) =>
  `/garagem/${encodeURIComponent(car.id)}${tab ? `?tab=${tab}` : ""}`;
