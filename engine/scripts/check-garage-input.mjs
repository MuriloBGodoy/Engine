#!/usr/bin/env node

/**
 * Entrada da Garagem: número com vírgula ou ponto, faixas de plausibilidade,
 * data local e consumo medido.
 *
 * Os casos que motivaram o arquivo (auditoria de 25/10/2026): "38.5" litros
 * virava 385 L e "1500.50" de aporte virava R$ 150.050. Cada um deles é uma
 * assertiva aqui.
 *
 * Uso: node scripts/check-garage-input.mjs
 */

import {
  localISODate,
  parseDecimal,
  validateContribution,
  validateExpense,
} from "../src/services/garageInput.js";
import { realConsumption } from "../src/services/expenses.js";

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(
      `FALHOU  ${label}\n        esperado ${JSON.stringify(expected)}\n        obtido   ${JSON.stringify(actual)}`,
    );
  }
};

// --- parseDecimal ----------------------------------------------------------
const cases = [
  ["38,5", 38.5],
  ["38.5", 38.5],
  ["38.50", 38.5],
  ["1.500,50", 1500.5],
  ["1500.50", 1500.5],
  ["1500,50", 1500.5],
  ["1,500.50", 1500.5],
  ["1.500", 1500],
  ["87.500", 87500],
  ["1.500.000", 1500000],
  ["1.500.000,00", 1500000],
  ["0.500", 0.5],
  ["R$ 250", 250],
  ["250", 250],
  [" 42 ", 42],
  [",5", 0.5],
  ["1,5", 1.5],
  ["", null],
  [null, null],
];
for (const [input, expected] of cases) check(`parseDecimal(${JSON.stringify(input)})`, parseDecimal(input), expected);
for (const input of ["abc", "1.50.000", "1,2,3", "1.500,50,1", "12a"]) {
  check(`parseDecimal(${JSON.stringify(input)}) é NaN`, Number.isNaN(parseDecimal(input)), true);
}

// --- aporte ----------------------------------------------------------------
check("aporte 1500.50", validateContribution("1500.50").value, 1500.5);
check("aporte 0 recusado", validateContribution("0").error, "garageInput.amountInvalid");
check("aporte vazio recusado", validateContribution("").error, "garageInput.amountInvalid");
check("aporte 50 mi recusado", validateContribution("50000000").error, "garageInput.amountTooHigh");
check(
  "aporte acima do que falta pede confirmação",
  validateContribution("150050", { remaining: 20000 }).warnings.map((w) => w.key),
  ["garageInput.contributionAboveRemaining"],
);
check("aporte dentro do que falta não pergunta", validateContribution("500", { remaining: 20000 }).warnings, []);

// --- gasto -----------------------------------------------------------------
const fuel = (amount, liters, odometer = "") =>
  validateExpense({ category: "fuel", amount, liters, odometer });
check("38.5 L vira 38,5 L", fuel("230", "38.5").value.liters, 38.5);
check("385 L recusado", fuel("230", "385").error, "garageInput.litersTooHigh");
check("120 L pergunta", fuel("700", "120").warnings.map((w) => w.key), ["garageInput.litersHigh"]);
check(
  "R$ 230 por 3,8 L pergunta o preço por litro",
  fuel("230", "3,8").warnings.map((w) => w.key),
  ["garageInput.pricePerLiterOdd"],
);
check("abastecimento normal não pergunta nada", fuel("230", "38,5").warnings, []);
check(
  "abastecimento de R$ 2.300 pergunta",
  fuel("2.300", "38").warnings.map((w) => w.key).includes("garageInput.fuelAmountHigh"),
  true,
);
check(
  "odômetro que volta pergunta",
  validateExpense(
    { category: "maintenance", amount: "300", odometer: "80.000" },
    { previousOdometer: 87500 },
  ).warnings.map((w) => w.key),
  ["garageInput.odometerBackwards"],
);
check(
  "odômetro 87.500 lido como 87500",
  validateExpense({ category: "other", amount: "10", odometer: "87.500" }).value.odometer,
  87500,
);
check(
  "odômetro de 5 milhões recusado",
  validateExpense({ category: "other", amount: "10", odometer: "5000000" }).error,
  "garageInput.odometerTooHigh",
);
check(
  "litros ignorados fora de combustível",
  validateExpense({ category: "tires", amount: "1200", liters: "999" }).value.liters,
  0,
);

// --- data local --------------------------------------------------------------
// 22h de 25/10 em qualquer fuso continua sendo 25/10 no aparelho.
check("data local às 22h", localISODate(new Date(2026, 9, 25, 22, 30)), "2026-10-25");
check("data local à 0h", localISODate(new Date(2026, 0, 1, 0, 5)), "2026-01-01");

// --- consumo -----------------------------------------------------------------
const fill = (odometer, liters, extra = {}) => ({
  category: "fuel",
  amount: liters * 6,
  date: "2026-10-01",
  odometer,
  liters,
  ...extra,
});

// Legado (sem tanque cheio nem combustível): continua calculando, como antes,
// mas marcado como aproximado.
const legacy = realConsumption([fill(10000, 40), fill(10500, 40)]);
check("legado calcula", legacy.kmPerLiter, 12.5);
check("legado é aproximado", legacy.approximate, true);

// Tanque cheio a tanque cheio, um combustível: medido.
const g = { fullTank: true, fuel: "gasoline" };
const measured = realConsumption([fill(10000, 40, g), fill(10500, 40, g), fill(11000, 50, g)]);
check("medido", measured.kmPerLiter, 1000 / 90);
check("medido não é aproximado", measured.approximate, false);
check("medido diz o combustível", measured.fuel, "gasoline");

// Parcial no meio: os litros do parcial entram no trecho seguinte, em vez de
// estourar o km/l. 10000 cheio -> 10200 parcial 10 L -> 10500 cheio 30 L:
// 500 km / 40 L.
const partial = realConsumption([
  fill(10000, 40, g),
  fill(10200, 10, { fullTank: false, fuel: "gasoline" }),
  fill(10500, 30, g),
]);
check("parcial soma no trecho", partial.kmPerLiter, 12.5);
check("parcial com cheio nas pontas é medido", partial.approximate, false);

// Último abastecimento parcial: não fecha trecho nenhum.
const openEnd = realConsumption([fill(10000, 40, g), fill(10500, 10, { fullTank: false, fuel: "gasoline" })]);
check("parcial no fim não fecha trecho", openEnd, null);

// Abastecimento sem litros no meio: o trecho é descartado em vez de somar a
// distância dos dois com os litros de um só.
const gap = realConsumption([
  fill(10000, 40, g),
  { category: "fuel", amount: 200, date: "2026-10-02", odometer: 10500, liters: 0, fullTank: true, fuel: "gasoline" },
  fill(11000, 40, g),
  fill(11500, 40, g),
]);
check("trecho com abastecimento sem litros é descartado", gap.kmPerLiter, 12.5);
check("trecho com abastecimento sem litros: distância", gap.distance, 1000);

// Flex com etanol e gasolina misturados: aproximado, sem combustível.
const mixed = realConsumption([
  fill(10000, 40, g),
  fill(10400, 40, { fullTank: true, fuel: "ethanol" }),
  fill(10900, 40, g),
]);
check("mistura é aproximada", mixed.approximate, true);
check("mistura não tem combustível", mixed.fuel, null);

// Um trecho medido de gasolina no meio de trechos misturados: vale o medido.
const somePure = realConsumption([
  fill(10000, 40, g),
  fill(10400, 40, { fullTank: true, fuel: "ethanol" }),
  fill(10900, 40, g),
  fill(11400, 40, g),
]);
check("trecho puro vence os misturados", somePure.kmPerLiter, 12.5);
check("trecho puro é medido", somePure.approximate, false);

// GNV no meio do trecho: m³ não é litro.
const gnv = realConsumption([
  fill(10000, 40, g),
  fill(10300, 12, { fullTank: false, fuel: "gnv" }),
  fill(10600, 30, g),
]);
check("GNV no meio descarta o trecho", gnv, null);

console.log(failures === 0 ? "check-garage-input: todas as assertivas passaram" : `${failures} assertiva(s) falharam`);
process.exit(failures ? 1 : 0);
