// Entrada numérica e de data da Garagem: aporte, gasto, litros, odômetro.
//
// Até 25/10/2026 cada modal tinha o próprio `parse`, que removia TODO ponto e
// trocava a vírgula por ponto. "38.5" litros virava 385 L e "1500.50" de
// aporte virava R$ 150.050 — sem aviso, e daí a previsão, a meta batida e o
// consumo saíam errados com cara de certos. Aqui mora a regra única.
//
// Nada aqui depende de React: é testado por `scripts/check-garage-input.mjs`.

/**
 * Lê um número digitado à brasileira OU à americana.
 *
 *   "38,5"  "38.5"          -> 38.5
 *   "1.500,50" "1,500.50"   -> 1500.5
 *   "1500.50"               -> 1500.5
 *   "1.500"  "87.500"       -> 1500, 87500  (ponto + 3 dígitos = milhar)
 *   "1.500.000"             -> 1500000
 *   "R$ 250"                -> 250
 *
 * A regra que decide os casos ambíguos:
 *   - com vírgula E ponto, o que vier por último é o decimal;
 *   - só vírgula: uma é decimal; várias só valem como milhar (grupos de 3);
 *   - só ponto: um ponto seguido de EXATAMENTE 3 dígitos é milhar (é assim que
 *     o brasileiro escreve "1.500"); com 1, 2 ou 4+ dígitos é decimal.
 *
 * "40.123" litros vira 40123 por essa regra — e é a faixa de plausibilidade
 * (abaixo) que pega, não o parser. Devolve `NaN` para o que não é número;
 * vazio devolve `null` (campo opcional não informado).
 */
export const parseDecimal = (input) => {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : NaN;

  const text = String(input)
    .replace(/R\$|\s/gi, "")
    .replace(/^\+/, "");
  if (!text) return null;
  if (!/^-?[\d.,]+$/.test(text)) return NaN;

  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");

  let normalized;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    const [intPart, fracPart, ...rest] = body.split(decimalSep);
    if (rest.length || fracPart.includes(thousandSep)) return NaN;
    if (!isGrouped(intPart, thousandSep)) return NaN;
    normalized = `${intPart.split(thousandSep).join("")}.${fracPart}`;
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = body.split(sep);
    if (parts.length > 2) {
      if (!isGrouped(body, sep)) return NaN;
      normalized = parts.join("");
    } else if (
      sep === "." &&
      /^[1-9]\d{0,2}$/.test(parts[0]) &&
      /^\d{3}$/.test(parts[1])
    ) {
      // "0.500" é meio, não quinhentos: milhar nunca começa em zero.
      normalized = parts.join("");
    } else {
      normalized = `${parts[0] || "0"}.${parts[1]}`;
    }
  } else {
    normalized = body;
  }

  if (!/^\d+(\.\d*)?$/.test(normalized)) return NaN;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  return negative ? -value : value;
};

// "1.500.000" é milhar válido; "1.50.000" não é.
const isGrouped = (text, sep) => {
  const parts = text.split(sep);
  if (parts.length === 1) return /^\d+$/.test(parts[0]);
  return /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((part) => /^\d{3}$/.test(part));
};

/**
 * Data de hoje no fuso DO APARELHO, como `AAAA-MM-DD`.
 *
 * `toISOString()` é UTC: no Brasil (UTC−3), das 21h à meia-noite o lançamento
 * nascia com a data de amanhã, e o `max` do campo de data deixava escolher
 * amanhã. Quem está em Lisboa ou na Cidade do México também tem o próprio fuso
 * — por isso é o do aparelho, e não America/Sao_Paulo cravado.
 */
export const localISODate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Faixas de plausibilidade.
 *
 * `max` é o teto duro: acima disso não é carro de passeio, é erro de digitação,
 * e o lançamento não entra. `confirmAbove` é o teto mole: pode acontecer, mas é
 * raro o bastante para perguntar antes de gravar. As faixas são largas de
 * propósito — elas pegam vírgula no lugar errado (385 L num Kwid), não julgam
 * o gasto de ninguém.
 */
export const INPUT_LIMITS = {
  // Aporte: um carro de luxo chega a alguns milhões; acima de R$ 10 mi é zero
  // a mais.
  contribution: { min: 0.01, max: 10_000_000 },
  // Gasto avulso: IPVA de importado ou motor novo passam de R$ 20 mil, mas são
  // raros; R$ 1 mi num lançamento só é erro.
  expense: { min: 0.01, max: 1_000_000, confirmAbove: 20_000 },
  // Um abastecimento só: tanque de picape grande + preço alto ainda fica bem
  // abaixo de R$ 1.500.
  fuelAmount: { confirmAbove: 1_500 },
  // Litros por abastecimento: o maior tanque de carro de passeio vendido aqui
  // fica na casa dos 80 L (Hilux, Ranger, SW4). 200 L é teto de qualquer coisa
  // com placa de carro.
  liters: { min: 0.5, max: 200, confirmAbove: 100 },
  // Preço por litro (ou por m³ de GNV) implícito em valor ÷ litros. Fora disso
  // quase sempre é o litro ou o valor digitado errado.
  pricePerLiter: { min: 2, max: 15 },
  // Odômetro: 2 milhões de km é teto físico de qualquer carro.
  odometer: { min: 0, max: 2_000_000 },
  // Salto de odômetro entre dois lançamentos que merece pergunta.
  odometerJump: { confirmAbove: 30_000 },
};

/**
 * Valida um aporte. Devolve `{ value, error, warnings }`:
 *   - `error`: chave i18n que impede gravar (com `errorParams`);
 *   - `warnings`: lista de `{ key, params }` que pedem confirmação antes.
 */
export const validateContribution = (raw, { remaining = null } = {}) => {
  const value = parseDecimal(raw);
  const limits = INPUT_LIMITS.contribution;
  if (value === null || Number.isNaN(value) || value < limits.min) {
    return { value: null, error: "garageInput.amountInvalid", warnings: [] };
  }
  if (value > limits.max) {
    return {
      value: null,
      error: "garageInput.amountTooHigh",
      errorParams: { max: limits.max },
      warnings: [],
    };
  }
  const warnings = [];
  // Passar do que falta é possível (a pessoa arredondou para cima), mas é
  // também o sintoma exato do "1500.50 virou 150.050".
  if (remaining !== null && remaining > 0 && value > remaining) {
    warnings.push({ key: "garageInput.contributionAboveRemaining", params: { value, remaining } });
  }
  return { value: round2(value), error: null, warnings };
};

/**
 * Valida um gasto. `previousOdometer` é o maior odômetro já lançado no carro
 * (0 quando não há): odômetro que volta é pergunta, não erro, porque a pessoa
 * pode estar lançando um gasto antigo.
 */
export const validateExpense = (
  { category, amount, odometer, liters },
  { previousOdometer = 0 } = {},
) => {
  const warnings = [];
  const isFuel = category === "fuel";

  const value = parseDecimal(amount);
  if (value === null || Number.isNaN(value) || value < INPUT_LIMITS.expense.min) {
    return { error: "garageInput.amountInvalid", warnings };
  }
  if (value > INPUT_LIMITS.expense.max) {
    return {
      error: "garageInput.amountTooHigh",
      errorParams: { max: INPUT_LIMITS.expense.max },
      warnings,
    };
  }
  if (isFuel && value > INPUT_LIMITS.fuelAmount.confirmAbove) {
    warnings.push({ key: "garageInput.fuelAmountHigh", params: { value } });
  } else if (value > INPUT_LIMITS.expense.confirmAbove) {
    warnings.push({ key: "garageInput.amountHigh", params: { value } });
  }

  let odo = parseDecimal(odometer);
  if (odo !== null) {
    if (Number.isNaN(odo) || odo < 0) return { error: "garageInput.odometerInvalid", warnings };
    if (odo > INPUT_LIMITS.odometer.max) {
      return {
        error: "garageInput.odometerTooHigh",
        errorParams: { max: INPUT_LIMITS.odometer.max },
        warnings,
      };
    }
    odo = Math.round(odo);
    if (odo > 0 && previousOdometer > 0) {
      if (odo < previousOdometer) {
        warnings.push({
          key: "garageInput.odometerBackwards",
          params: { value: odo, previous: previousOdometer },
        });
      } else if (odo - previousOdometer > INPUT_LIMITS.odometerJump.confirmAbove) {
        warnings.push({
          key: "garageInput.odometerJump",
          params: { value: odo, previous: previousOdometer },
        });
      }
    }
  }

  let lit = isFuel ? parseDecimal(liters) : null;
  if (lit !== null) {
    const limits = INPUT_LIMITS.liters;
    if (Number.isNaN(lit) || lit < limits.min) {
      return { error: "garageInput.litersInvalid", warnings };
    }
    if (lit > limits.max) {
      return { error: "garageInput.litersTooHigh", errorParams: { max: limits.max }, warnings };
    }
    if (lit > limits.confirmAbove) {
      warnings.push({ key: "garageInput.litersHigh", params: { value: lit } });
    }
    const perLiter = value / lit;
    const price = INPUT_LIMITS.pricePerLiter;
    if (perLiter < price.min || perLiter > price.max) {
      warnings.push({ key: "garageInput.pricePerLiterOdd", params: { value: perLiter } });
    }
    lit = round2(lit);
  }

  return {
    error: null,
    warnings,
    value: { amount: round2(value), odometer: odo || 0, liters: lit || 0 },
  };
};

const round2 = (value) => Math.round(value * 100) / 100;
