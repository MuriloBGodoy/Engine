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

import { estimateOwnership } from "../src/services/ownership.js";

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

console.log("");
console.log(failures ? `${failures} FALHA(S)` : "Tudo certo.");
process.exit(failures ? 1 : 0);
