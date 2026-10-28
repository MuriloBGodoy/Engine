#!/usr/bin/env node

/**
 * Verificação das regras de IPVA do simulador.
 *
 * Cada regra aqui veio de uma lei conferida, e cada uma tem um lado em que
 * errar é caro: cobrar de quem é isento tira da pessoa um carro que caberia,
 * isentar quem paga coloca ela num carro que não cabe. As assertivas fixam os
 * dois lados, não só o caso feliz.
 *
 * Mesmo formato do `check-affordability.mjs`: roda o motor real.
 *
 * Uso:
 *   node scripts/check-ipva.mjs
 */

import { estimateOwnership, simulateCar } from "../src/services/ownership.js";

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(
      `FALHOU  ${label}\n        esperado ${JSON.stringify(expected)}\n        obtido   ${JSON.stringify(actual)}`,
    );
  } else {
    console.log(`OK      ${label}`);
  }
};

const YEAR = new Date().getFullYear();
const round = (n) => Math.round(n * 100) / 100;
const run = (car, state, inputs = {}) =>
  estimateOwnership(car, { fuelType: "gasoline", ...inputs }, { country: "BR", state });
const annualTax = (car, state, inputs) => round(run(car, state, inputs).monthly.tax * 12);

const toyota = (model, value, year = `${YEAR} Gasolina`) => ({
  brand: "Toyota",
  model,
  year,
  targetValue: value,
});

// --- Híbrido flex em SP (Lei 18.065/2024) ----------------------------------
// Nomes exatamente como a FIPE grava, conferidos na API em 06/10/2026.
const corollaCross = toyota("Corolla Cross XRX 1.8 16V Aut. (Híbrido)", 200000);
const corollaAltis = toyota("Corolla Altis Prem. 1.8 Aut. (Híbrido)", 190000);
const yarisCross = toyota("YARIS Cross XRE 1.5 16V 5p Aut. (Híbrido)", 170000);

if (YEAR <= 2026) {
  check("Corolla Cross híbrido em SP: IPVA zero", annualTax(corollaCross, "SP"), 0);
  check("Corolla Altis híbrido em SP: IPVA zero", annualTax(corollaAltis, "SP"), 0);
  check("Yaris Cross híbrido em SP: IPVA zero", annualTax(yarisCross, "SP"), 0);
  check(
    "a isenção vem rotulada, para a tela explicar o zero",
    run(corollaCross, "SP").tax.basis,
    "sp_hybrid",
  );
  // O combustível que a pessoa escolhe não muda o carro: flex continua flex.
  check(
    "isenção vale abastecendo com etanol também",
    annualTax(corollaCross, "SP", { fuelType: "ethanol" }),
    0,
  );
}

// Fora da isenção — cada um por um motivo diferente da lei.
check(
  "Yaris Cross a combustão (sem marcador de híbrido) paga 4%",
  annualTax(toyota("YARIS Cross XRX 1.5 16V 5p Aut.", 160000), "SP"),
  6400,
);
check(
  "RAV4 híbrido é só gasolina: paga 4%",
  annualTax(toyota("RAV4 2.5 SX Connect 4x4  Aut. (Híbrido)", 250000), "SP"),
  10000,
);
check(
  "Camry híbrido é só gasolina: paga 4%",
  annualTax(toyota("Camry XLE  2.5 16V Aut. (Híbrido)", 240000), "SP"),
  9600,
);
check(
  "híbrido leve com Flex no nome não engana: Pulse paga 4%",
  annualTax(
    { brand: "Fiat", model: "PULSE AUDACE 1.0 TB 200 Flex Hybrid Aut.", year: `${YEAR} Gasolina`, targetValue: 130000 },
    "SP",
  ),
  5200,
);
check(
  "acima do teto de R$ 261.154,45 o híbrido flex paga 4%",
  annualTax(toyota("Corolla Cross XRX 1.8 16V Aut. (Híbrido)", 270000), "SP"),
  10800,
);
check(
  "a isenção é de SP: Corolla Cross híbrido no RJ paga os 4% do RJ",
  annualTax(corollaCross, "RJ"),
  8000,
);
check(
  "carro comum continua rotulado como alíquota",
  run(toyota("YARIS Cross XRX 1.5 16V 5p Aut.", 160000), "SP").tax.basis,
  "rate",
);

// --- Imunidade por idade (EC 137/2025) -------------------------------------
{
  const old = { brand: "Volkswagen", model: "Gol 1.0", year: `${YEAR - 22} Gasolina`, targetValue: 15000 };
  check("carro com 20+ anos é imune em qualquer UF", annualTax(old, "SP"), 0);
  const result = run(old, "SP");
  check("a imunidade vem rotulada com a idade", [result.tax.basis, result.tax.exemptAge], ["age_exempt", 20]);
}

// --- Isenção estadual por idade, antes dos 20 -------------------------------
// As duas bordas de cada regra: no ano em que isenta e no ano anterior.
{
  const gol = (age) => ({
    brand: "Volkswagen",
    model: "Gol 1.0",
    year: `${YEAR - age} Gasolina`,
    targetValue: 20000,
  });
  const cases = [
    // [UF, primeira idade isenta, alíquota da UF]
    ["BA", 16, 0.025],
    ["ES", 16, 0.02],
    ["RN", 12, 0.03],
    ["RR", 11, 0.03],
    ["AP", 12, 0.03],
    ["GO", 15, 0.0375],
  ];
  for (const [uf, age, rate] of cases) {
    check(`${uf}: ${age} anos é isento`, annualTax(gol(age), uf), 0);
    check(`${uf}: ${age - 1} anos ainda paga`, annualTax(gol(age - 1), uf), round(20000 * rate));
  }
  // O caso que as listas da imprensa erram: Tocantins cobra de quem tem 15+.
  check("TO: 18 anos ainda paga (TO não isenta antes dos 20)", annualTax(gol(18), "TO"), 400);
  check("PE: 19 anos ainda paga, a 2,4%", annualTax(gol(19), "PE"), 480);
}

// --- Auditoria de 25/10/2026: um carro, um número ---------------------------
// Cada caso fixa um bug medido na auditoria (docs/auditoria-simulador-2026-10-25.md).
// Rodam pelo `simulateCar`, a função que modal, card e Painel chamam. Os
// valores em reais dependem do market-data.json da semana, então as
// assertivas de reais são por faixa; as de estrutura são exatas.
{
  const SP = { country: "BR", state: "SP" };
  const within = (label, value, low, high) =>
    check(`${label} (obtido ${Math.round(value)})`, value >= low && value <= high, true);
  const onix = {
    brand: "GM - Chevrolet",
    model: "ONIX HATCH 1.0 12V Flex 5p Mec.",
    year: "2024 Gasolina",
    targetValue: 80000,
    savedValue: 0,
    type: "owned",
  };

  // 1. Carro próprio é à vista — sem simulação salva e com a salva antiga.
  const owned = simulateCar(onix, { profile: SP });
  check("Onix quitado: abre à vista", owned.inputs.purchaseMode, "cash");
  check("Onix quitado: sem parcela", owned.monthly.financing, 0);
  // R$ 855/mês na auditoria = 1.000 km a 11,1 km/l padrão + IPVA e
  // licenciamento diluídos. Com o INMETRO (13,4 km/l) a conta comparável cai.
  within("Onix quitado SP: comparável entre R$ 700 e R$ 900/mês", owned.comparableMonthly, 700, 900);
  const legacy = simulateCar({ ...onix, ownership: { purchaseMode: "finance", ...SP } });
  check("Onix quitado com simulação antiga 'finance': vira à vista", legacy.monthly.financing, 0);
  const chosen = simulateCar({
    ...onix,
    ownership: { purchaseMode: "finance", ...SP, touched: ["purchaseMode"] },
  });
  check("financiar escolhido de verdade (touched) é respeitado", chosen.inputs.purchaseMode, "finance");

  // 2. Combustível vem da FIPE.
  const hilux = {
    brand: "Toyota",
    model: "Hilux CD SRX 4x4 2.8 TDI Diesel Aut.",
    year: "2024 Diesel",
    targetValue: 250000,
    ownership: { kmPerMonth: 1500, purchaseMode: "cash", fuelType: "gasoline", country: "BR", state: "MS" },
  };
  const hiluxRun = simulateCar(hilux);
  check("Hilux diesel salva como gasolina: simula diesel", hiluxRun.inputs.fuelType, "diesel");
  check("Hilux diesel em MS: IPVA de 4,5%", round(hiluxRun.monthly.tax * 12), 11250);
  const dolphin = {
    brand: "BYD",
    model: "DOLPHIN 95 cv (Elétrico)",
    year: "2024 Elétrico",
    targetValue: 150000,
    ownership: { purchaseMode: "cash", country: "BR", state: "BA" },
  };
  const dolphinRun = simulateCar(dolphin);
  check("Dolphin: simula elétrico", dolphinRun.inputs.fuelType, "electric");
  check("Dolphin na BA: IPVA zero (isento até R$ 300 mil)", dolphinRun.monthly.tax, 0);
  check("Dolphin: preço da energia marcado como sem fonte", dolphinRun.fuel.priceSourced, false);
  check(
    "Onix flex não é forçado a combustível nenhum",
    simulateCar({ ...onix, ownership: { fuelType: "ethanol", ...SP } }).inputs.fuelType,
    "ethanol",
  );

  // 3. Um carro, um número: o consumo do INMETRO entra sem estar salvo, e a
  // manchete é "todo mês" + anual à parte.
  const goal = { ...onix, type: "goal", ownership: { kmPerMonth: 1200, ...SP } };
  const goalRun = simulateCar(goal);
  check("consumo do INMETRO entra na conta salva", goalRun.fuel.consumption, 13.4);
  check(
    "manchete + anual/12 = total comparável",
    round(goalRun.headline.monthly + goalRun.headline.yearly / 12),
    round(goalRun.comparableMonthly),
  );

  // 6. Consumo por combustível: 13 km/l da gasolina não atravessa para o etanol.
  const g13 = simulateCar({
    ...onix,
    ownership: { purchaseMode: "cash", userConsumption: 13, fuelType: "gasoline", ...SP },
  });
  check("consumo antigo migra para o combustível salvo", g13.inputs.userConsumptionByFuel, { gasoline: 13 });
  const eth = simulateCar(onix, { inputs: { ...g13.inputs, fuelType: "ethanol" }, location: SP });
  check("trocar para etanol não herda os 13 km/l", eth.fuel.consumption, 9.5);

  // 8. Sem estado: nada de IPVA ou licenciamento de padrão na soma.
  const noState = simulateCar(onix);
  check("sem estado: pede o estado", noState.needsState, true);
  check("sem estado: IPVA fora da soma", noState.tax.basis, "no_state");
  check("sem estado: anual zero", noState.headline.yearly, 0);
  const oldNoState = simulateCar({ brand: "Fiat", model: "Palio 1.0", year: `${YEAR - 21} Gasolina`, targetValue: 15000 });
  check("sem estado, 20+ anos: imune pela Constituição, vale sem UF", oldNoState.tax.basis, "age_exempt");
}

console.log("");
console.log(failures ? `${failures} FALHA(S)` : "Tudo certo.");
process.exit(failures ? 1 : 0);
