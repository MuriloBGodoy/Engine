// Gasto real do carro que a pessoa JÁ TEM.
//
// O `ownership.js` estima quanto CUSTARIA um carro — é projeção, usada uma vez
// para decidir a compra. Aqui é o oposto: o que saiu do bolso de verdade, no
// carro que está na garagem hoje. Um é sonho, o outro é extrato.
//
// Nada aqui inventa número: tudo sai do que a pessoa lançou. Quando não há
// histórico suficiente para uma conta ser honesta, a função devolve `null` e a
// tela mostra menos, em vez de mostrar errado.

import { localISODate } from "./garageInput.js";

/** Categorias de gasto, na ordem em que aparecem na tela. */
export const EXPENSE_CATEGORIES = [
  "fuel",
  "maintenance",
  "tires",
  "insurance",
  "tax",
  "cleaning",
  "parking",
  "fine",
  "other",
];

/**
 * Categorias que entram no custo recorrente de rodar.
 *
 * Multa fica de fora do "custo por km": é evento, não custo de posse, e
 * incluir contamina a média de quem tomou uma multa cara num mês.
 */
const RECURRING_CATEGORIES = EXPENSE_CATEGORIES.filter((key) => key !== "fine");

/**
 * Combustíveis do abastecimento. GNV é medido em m³, não em litros: entra no
 * histórico, mas nunca na média de km/l.
 */
export const FUEL_TYPES = ["gasoline", "ethanol", "diesel", "gnv"];

/** Teto de lançamentos guardados no documento do carro. */
export const MAX_EXPENSES = 300;

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Fuso do aparelho, não UTC: `toISOString()` datava de amanhã o que era
// lançado no Brasil depois das 21h.
const todayISO = () => localISODate();

/** Data de um lançamento como Date local, sem escorregar de fuso. */
const entryDate = (entry) => new Date(`${entry.date}T12:00:00`);

const DAY_MS = 86400000;

export const normalizeExpense = (raw = {}) => ({
  id: String(raw.id || crypto.randomUUID()),
  category: EXPENSE_CATEGORIES.includes(raw.category) ? raw.category : "other",
  amount: Math.max(num(raw.amount), 0),
  date: String(raw.date || todayISO()).slice(0, 10),
  // 0 significa "não informado" — não zero. Odômetro alimenta consumo real e
  // km rodado por mês; sem ele o lançamento ainda vale como despesa.
  odometer: Math.max(Math.round(num(raw.odometer)), 0),
  liters: Math.max(num(raw.liters), 0),
  note: String(raw.note || "").trim().slice(0, 120),
  createdAt: raw.createdAt || new Date().toISOString(),
  // Só no abastecimento, e só quando a pessoa disse. `null` = não informado
  // (todo lançamento anterior a 25/10/2026): a conta assume tanque cheio, como
  // sempre assumiu, mas o resultado sai marcado como aproximado.
  ...(raw.category === "fuel"
    ? {
        fullTank: typeof raw.fullTank === "boolean" ? raw.fullTank : null,
        fuel: FUEL_TYPES.includes(raw.fuel) ? raw.fuel : null,
      }
    : {}),
});

export const normalizeExpenses = (list) =>
  Array.isArray(list)
    ? list
        .map(normalizeExpense)
        .filter((entry) => entry.amount > 0 && entry.date)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, MAX_EXPENSES)
    : [];

/**
 * Consumo, pelo método tanque cheio a tanque cheio.
 *
 * A distância entre dois abastecimentos de tanque cheio, dividida por TODOS os
 * litros postos depois do primeiro — inclusive os parciais do meio ("põe
 * R$ 50"). Os litros que você põe agora repõem o que gastou desde a última vez
 * em que o tanque estava cheio.
 *
 * Três jeitos de o número sair errado com cara de certo, e o que se faz com
 * cada um:
 *   - último abastecimento parcial: não fecha trecho; o trecho só conta quando
 *     o tanque enche de novo;
 *   - abastecimento com odômetro mas sem litros no meio: o trecho é descartado
 *     (antes, a distância dos dois era somada com os litros de um só, e o km/l
 *     inflava);
 *   - etanol e gasolina no mesmo trecho: o número não é de nenhum dos dois.
 *
 * Um trecho é MEDIDO quando as duas pontas e tudo no meio dizem "tanque cheio"
 * ou "parcial" explicitamente e são do mesmo combustível. Havendo trecho
 * medido, a média usa só os medidos do combustível com mais quilômetros, e
 * `approximate` é false. Sem nenhum, a média usa todos os trechos (como era
 * antes) e sai `approximate: true` — a tela não pode chamar isso de "real".
 *
 * Devolve `null` sem pelo menos um trecho fechado.
 */
export const realConsumption = (expenses = []) => {
  const fills = expenses
    .filter((entry) => entry.category === "fuel" && Number(entry.odometer) > 0)
    .map((entry) => ({
      odometer: Number(entry.odometer),
      liters: Math.max(Number(entry.liters) || 0, 0),
      date: String(entry.date || ""),
      createdAt: String(entry.createdAt || ""),
      // Legado (sem o campo) conta como cheio, como sempre contou.
      full: entry.fullTank !== false,
      declared: typeof entry.fullTank === "boolean",
      fuel: FUEL_TYPES.includes(entry.fuel) ? entry.fuel : null,
    }))
    .sort(
      (a, b) =>
        a.odometer - b.odometer ||
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt),
    );

  const segments = [];
  let anchor = null;
  let liters = 0;
  let broken = false;
  let members = [];

  for (const fill of fills) {
    if (!anchor) {
      if (fill.full) anchor = fill;
      continue;
    }
    // GNV no meio: o carro rodou num combustível que não está em litros.
    if (fill.liters <= 0 || fill.fuel === "gnv") broken = true;
    else liters += fill.liters;
    members.push(fill);

    if (!fill.full) continue;

    const distance = fill.odometer - anchor.odometer;
    // Odômetro que não avançou é digitação errada; salto absurdo também.
    if (!broken && distance > 0 && distance <= 5000 && liters > 0) {
      const all = [anchor, ...members];
      const fuel = anchor.fuel;
      const pure =
        all.every((item) => item.declared) &&
        fuel !== null &&
        all.every((item) => item.fuel === fuel);
      segments.push({ distance, liters, pure, fuel: pure ? fuel : null, fills: members.length });
    }
    anchor = fill;
    liters = 0;
    broken = false;
    members = [];
  }

  if (!segments.length) return null;

  const pure = segments.filter((segment) => segment.pure);
  let used = segments;
  let fuel = null;
  if (pure.length) {
    const byFuel = new Map();
    for (const segment of pure) {
      byFuel.set(segment.fuel, (byFuel.get(segment.fuel) || 0) + segment.distance);
    }
    fuel = [...byFuel.entries()].sort((a, b) => b[1] - a[1])[0][0];
    used = pure.filter((segment) => segment.fuel === fuel);
  }

  const distance = used.reduce((sum, segment) => sum + segment.distance, 0);
  const totalLiters = used.reduce((sum, segment) => sum + segment.liters, 0);
  if (distance <= 0 || totalLiters <= 0) return null;

  return {
    kmPerLiter: distance / totalLiters,
    distance,
    liters: totalLiters,
    // Abastecimentos que fecharam ou estão dentro dos trechos usados.
    fills: used.reduce((sum, segment) => sum + segment.fills, 0),
    segments: used.length,
    approximate: !pure.length,
    fuel,
  };
};

/** Km rodado por mês, medido pelo odômetro — não estimado. */
export const realKmPerMonth = (expenses = []) => {
  const marks = expenses
    .filter((entry) => entry.odometer > 0)
    .sort((a, b) => a.odometer - b.odometer);

  if (marks.length < 2) return null;

  const first = marks[0];
  const last = marks[marks.length - 1];
  const km = last.odometer - first.odometer;
  const days = (entryDate(last) - entryDate(first)) / DAY_MS;

  // Menos de duas semanas entre a primeira e a última marca não dá média
  // mensal: multiplicar por 30 uma semana atípica gera número que engana.
  if (km <= 0 || days < 14) return null;
  return (km / days) * 30;
};

/**
 * Resumo do que foi gasto: total, por categoria e por mês.
 *
 * `monthlyAverage` só existe com pelo menos 30 dias de histórico, porque antes
 * disso "média mensal" é só o total com outro nome.
 */
export const summarizeExpenses = (expenses = []) => {
  if (!expenses.length) {
    return { total: 0, byCategory: [], byMonth: [], monthlyAverage: null, daysCovered: 0 };
  }

  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const daysCovered = Math.max((entryDate(last) - entryDate(first)) / DAY_MS, 0);

  const totals = new Map();
  const months = new Map();
  let total = 0;
  let recurring = 0;

  for (const entry of expenses) {
    total += entry.amount;
    if (RECURRING_CATEGORIES.includes(entry.category)) recurring += entry.amount;
    totals.set(entry.category, (totals.get(entry.category) || 0) + entry.amount);
    const month = entry.date.slice(0, 7);
    months.set(month, (months.get(month) || 0) + entry.amount);
  }

  const byCategory = [...totals.entries()]
    .map(([category, amount]) => ({ category, amount, share: amount / total }))
    .sort((a, b) => b.amount - a.amount);

  const byMonth = [...months.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const monthlyAverage =
    daysCovered >= 30 ? recurring / (daysCovered / 30) : null;

  return { total, byCategory, byMonth, monthlyAverage, daysCovered };
};

/**
 * Tudo o que a tela precisa saber sobre o gasto de um carro.
 *
 * Junta resumo, consumo real e custo por km numa chamada só — as três contas
 * dependem da mesma lista, e separar obrigaria cada tela a repetir a leitura.
 */
export const expenseInsights = (car = {}) => {
  const expenses = normalizeExpenses(car.expenses);
  const summary = summarizeExpenses(expenses);
  const consumption = realConsumption(expenses);
  const kmPerMonth = realKmPerMonth(expenses);

  const costPerKm =
    summary.monthlyAverage && kmPerMonth ? summary.monthlyAverage / kmPerMonth : null;

  return { expenses, ...summary, consumption, kmPerMonth, costPerKm };
};

/**
 * Escolhe o carro que serve de referência real para uma simulação.
 *
 * Simular o Golf sozinho responde "quanto custaria". Comparar com o Jetta que
 * já está na garagem responde "quanto a mais que hoje" — que é a pergunta que
 * a pessoa realmente tem.
 *
 * Prefere o próprio carro quando ele já tem histórico: aí a comparação é entre
 * a estimativa e o extrato do mesmo veículo, e vale como aferição do modelo.
 */
export const pickReferenceCar = (cars = [], currentCarId = null) => {
  const withData = cars
    .map((car) => ({ car, insights: expenseInsights(car) }))
    .filter((item) => item.insights.monthlyAverage);

  if (!withData.length) return null;

  const self = withData.find((item) => String(item.car.id) === String(currentCarId));
  if (self) return { ...self, isSelf: true };

  // Sem o próprio carro, vale o mais documentado: mais lançamentos significa
  // média menos sujeita a um mês fora da curva.
  const best = withData.sort(
    (a, b) => b.insights.expenses.length - a.insights.expenses.length,
  )[0];
  return { ...best, isSelf: false };
};
