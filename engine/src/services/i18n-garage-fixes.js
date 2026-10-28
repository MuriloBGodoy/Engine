import i18n from "./i18n";

/**
 * Textos das correções pré-lançamento da Garagem (auditoria de 25/10/2026):
 * faixas de plausibilidade, confirmação de exclusão, erro da FIPE, filtro de
 * versão, consumo medido × aproximado, combustível e tanque cheio.
 *
 * Fora do i18n.js pelo mesmo motivo do `i18n-billing.js`: aquele arquivo é
 * editado por várias frentes ao mesmo tempo. Entra por `addResourceBundle`
 * com deep merge, sem sobrescrever nada que já exista. pt-PT, en-GB, es-MX e
 * es-AR apontam para os mesmos objetos (ver o fim do i18n.js) e o resto cai
 * no en-US.
 *
 * `cv`, `km`, `L` e `km/l` não são traduzidos: são unidade, não palavra.
 */

const ptBR = {
  garageInput: {
    amountInvalid: "Informe um valor maior que zero. Pode usar vírgula ou ponto: 38,5 ou 38.5.",
    amountTooHigh: "Valor acima de {{max}}. Confira se não sobrou um zero ou uma vírgula fora do lugar.",
    odometerInvalid: "Odômetro inválido. Use só números, como 87500 ou 87.500.",
    odometerTooHigh: "Odômetro acima de {{max}} km. Confira o número.",
    litersInvalid: "Litros inválidos. Use 38,5 ou 38.5.",
    litersTooHigh: "{{max}} L não cabem num tanque de carro. Confira a vírgula: 38,5 e não 385.",
    contributionAboveRemaining: "{{value}} é mais do que falta para a meta ({{remaining}}).",
    amountHigh: "{{value}} num lançamento só é bem acima do comum.",
    fuelAmountHigh: "{{value}} num abastecimento só é bem acima do comum.",
    litersHigh: "{{value}} L é mais do que cabe na maioria dos tanques.",
    pricePerLiterOdd: "Isso dá {{value}} por litro, longe do preço de bomba. Confira o valor e os litros.",
    odometerBackwards: "O odômetro ({{value}} km) é menor que o último lançado ({{previous}} km).",
    odometerJump: "O odômetro ({{value}} km) pulou muito desde o último lançado ({{previous}} km).",
    confirmTitle: "Confere esse número?",
    confirmSave: "Está certo, salvar",
    reviewValue: "Corrigir",
    deleteContributionTitle: "Apagar este aporte?",
    deleteContributionBody: "{{value}} de {{date}} sai do histórico e do total guardado.",
    deleteExpenseTitle: "Apagar este gasto?",
    deleteExpenseBody: "{{value}} de {{date}} sai do histórico e das médias.",
    deleteError: "Não foi possível apagar agora. Tente de novo.",
  },
  garageFixes: {
    forecastShort: "Previsão: {{date}}",
    fipe: {
      brandsError: "Não conseguimos carregar as marcas da FIPE.",
      modelsError: "Não conseguimos carregar os modelos da FIPE.",
      yearsError: "Não conseguimos carregar os anos da FIPE.",
      priceError: "Não conseguimos consultar o preço FIPE desta versão.",
      retry: "Tentar de novo",
      filterLabel: "Buscar versão",
      filterPlaceholder: "Ex.: onix 1.0 aut",
      filterCount: "{{count}} de {{total}} versões",
      filterEmpty: "Nenhuma versão com esse texto. Tente menos palavras.",
      pricedAt: "Consulta FIPE de {{date}}",
      pricedAtUnknown: "Consulta FIPE do dia do cadastro",
      manualPrice: "Valor definido por você",
      editPriceHint: "Pode trocar pelo preço que você encontrou.",
      refreshPrice: "Atualizar preço FIPE",
      refreshing: "Consultando a FIPE...",
      refreshUnavailable: "Escolha marca, modelo e ano de novo para consultar a FIPE.",
      targetRequired: "Informe o valor da meta. Sem ele não dá para calcular quanto falta.",
      zeroOwnedTitle: "Salvar sem valor?",
      zeroOwnedBody: "O preço FIPE não veio. O carro entra na garagem, mas o simulador fica sem o valor do carro.",
      zeroOwnedConfirm: "Salvar assim",
    },
    consumption: {
      label: "Consumo",
      measured: "Consumo medido",
      approximate: "Consumo aproximado",
      approximateHint: "Marque tanque cheio e o combustível para medir",
      fuelHint: "Tanque cheio a tanque cheio, {{fuel}}",
      needFullFills: "Precisa de 2 abastecimentos de tanque cheio com odômetro",
    },
    fuel: {
      label: "Combustível",
      gasoline: "Gasolina",
      ethanol: "Etanol",
      diesel: "Diesel",
      gnv: "GNV",
      fullTank: "Completei o tanque",
      fullTankHint: "Sem tanque cheio não dá para medir o consumo",
      partial: "parcial",
    },
  },
};

const enUS = {
  garageInput: {
    amountInvalid: "Enter an amount greater than zero. Comma or dot both work: 38,5 or 38.5.",
    amountTooHigh: "Amount above {{max}}. Check for an extra zero or a misplaced comma.",
    odometerInvalid: "Invalid odometer. Use numbers only, like 87500.",
    odometerTooHigh: "Odometer above {{max}} km. Check the number.",
    litersInvalid: "Invalid liters. Use 38.5 or 38,5.",
    litersTooHigh: "{{max}} L won't fit in a car's tank. Check the decimal: 38.5, not 385.",
    contributionAboveRemaining: "{{value}} is more than what's left for the goal ({{remaining}}).",
    amountHigh: "{{value}} in a single entry is well above usual.",
    fuelAmountHigh: "{{value}} for a single fill-up is well above usual.",
    litersHigh: "{{value}} L is more than most tanks hold.",
    pricePerLiterOdd: "That's {{value}} per liter, far from pump prices. Check the amount and the liters.",
    odometerBackwards: "The odometer ({{value}} km) is lower than the last one entered ({{previous}} km).",
    odometerJump: "The odometer ({{value}} km) jumped a lot since the last one entered ({{previous}} km).",
    confirmTitle: "Is this number right?",
    confirmSave: "It's right, save",
    reviewValue: "Fix it",
    deleteContributionTitle: "Delete this contribution?",
    deleteContributionBody: "{{value}} from {{date}} leaves the history and the saved total.",
    deleteExpenseTitle: "Delete this expense?",
    deleteExpenseBody: "{{value}} from {{date}} leaves the history and the averages.",
    deleteError: "Couldn't delete right now. Try again.",
  },
  garageFixes: {
    forecastShort: "Est. {{date}}",
    fipe: {
      brandsError: "We couldn't load the FIPE brands.",
      modelsError: "We couldn't load the FIPE models.",
      yearsError: "We couldn't load the FIPE years.",
      priceError: "We couldn't get the FIPE price for this version.",
      retry: "Try again",
      filterLabel: "Search version",
      filterPlaceholder: "E.g. onix 1.0 aut",
      filterCount: "{{count}} of {{total}} versions",
      filterEmpty: "No version matches that text. Try fewer words.",
      pricedAt: "FIPE price from {{date}}",
      pricedAtUnknown: "FIPE price from the day you added it",
      manualPrice: "Value set by you",
      editPriceHint: "You can replace it with the price you found.",
      refreshPrice: "Update FIPE price",
      refreshing: "Checking FIPE...",
      refreshUnavailable: "Pick brand, model and year again to check FIPE.",
      targetRequired: "Enter the goal value. Without it we can't tell how much is left.",
      zeroOwnedTitle: "Save without a value?",
      zeroOwnedBody: "The FIPE price didn't come through. The car goes into the garage, but the simulator won't have its value.",
      zeroOwnedConfirm: "Save anyway",
    },
    consumption: {
      label: "Fuel economy",
      measured: "Measured economy",
      approximate: "Approximate economy",
      approximateHint: "Mark full tank and fuel to measure it",
      fuelHint: "Full tank to full tank, {{fuel}}",
      needFullFills: "Needs 2 full-tank fill-ups with odometer",
    },
    fuel: {
      label: "Fuel",
      gasoline: "Gasoline",
      ethanol: "Ethanol",
      diesel: "Diesel",
      gnv: "CNG",
      fullTank: "I filled the tank",
      fullTankHint: "Without a full tank, economy can't be measured",
      partial: "partial",
    },
  },
};

const esES = {
  garageInput: {
    amountInvalid: "Ingresa un valor mayor que cero. Sirve coma o punto: 38,5 o 38.5.",
    amountTooHigh: "Valor por encima de {{max}}. Revisa si sobra un cero o una coma fuera de lugar.",
    odometerInvalid: "Odómetro inválido. Usa solo números, como 87500.",
    odometerTooHigh: "Odómetro por encima de {{max}} km. Revisa el número.",
    litersInvalid: "Litros inválidos. Usa 38,5 o 38.5.",
    litersTooHigh: "{{max}} L no caben en el tanque de un auto. Revisa la coma: 38,5 y no 385.",
    contributionAboveRemaining: "{{value}} es más de lo que falta para la meta ({{remaining}}).",
    amountHigh: "{{value}} en un solo registro está muy por encima de lo común.",
    fuelAmountHigh: "{{value}} en una sola carga está muy por encima de lo común.",
    litersHigh: "{{value}} L es más de lo que cabe en la mayoría de los tanques.",
    pricePerLiterOdd: "Eso da {{value}} por litro, lejos del precio del surtidor. Revisa el valor y los litros.",
    odometerBackwards: "El odómetro ({{value}} km) es menor que el último registrado ({{previous}} km).",
    odometerJump: "El odómetro ({{value}} km) saltó mucho desde el último registrado ({{previous}} km).",
    confirmTitle: "¿Confirmas este número?",
    confirmSave: "Está bien, guardar",
    reviewValue: "Corregir",
    deleteContributionTitle: "¿Borrar este aporte?",
    deleteContributionBody: "{{value}} del {{date}} sale del historial y del total ahorrado.",
    deleteExpenseTitle: "¿Borrar este gasto?",
    deleteExpenseBody: "{{value}} del {{date}} sale del historial y de los promedios.",
    deleteError: "No se pudo borrar ahora. Inténtalo de nuevo.",
  },
  garageFixes: {
    forecastShort: "Previsión: {{date}}",
    fipe: {
      brandsError: "No pudimos cargar las marcas de FIPE.",
      modelsError: "No pudimos cargar los modelos de FIPE.",
      yearsError: "No pudimos cargar los años de FIPE.",
      priceError: "No pudimos consultar el precio FIPE de esta versión.",
      retry: "Intentar de nuevo",
      filterLabel: "Buscar versión",
      filterPlaceholder: "Ej.: onix 1.0 aut",
      filterCount: "{{count}} de {{total}} versiones",
      filterEmpty: "Ninguna versión con ese texto. Prueba con menos palabras.",
      pricedAt: "Consulta FIPE del {{date}}",
      pricedAtUnknown: "Consulta FIPE del día del registro",
      manualPrice: "Valor definido por ti",
      editPriceHint: "Puedes cambiarlo por el precio que encontraste.",
      refreshPrice: "Actualizar precio FIPE",
      refreshing: "Consultando FIPE...",
      refreshUnavailable: "Elige marca, modelo y año de nuevo para consultar FIPE.",
      targetRequired: "Ingresa el valor de la meta. Sin él no se puede calcular cuánto falta.",
      zeroOwnedTitle: "¿Guardar sin valor?",
      zeroOwnedBody: "El precio FIPE no llegó. El auto entra al garaje, pero el simulador queda sin su valor.",
      zeroOwnedConfirm: "Guardar así",
    },
    consumption: {
      label: "Consumo",
      measured: "Consumo medido",
      approximate: "Consumo aproximado",
      approximateHint: "Marca tanque lleno y el combustible para medirlo",
      fuelHint: "Tanque lleno a tanque lleno, {{fuel}}",
      needFullFills: "Necesita 2 cargas de tanque lleno con odómetro",
    },
    fuel: {
      label: "Combustible",
      gasoline: "Gasolina",
      ethanol: "Etanol",
      diesel: "Diésel",
      gnv: "GNC",
      fullTank: "Llené el tanque",
      fullTankHint: "Sin tanque lleno no se puede medir el consumo",
      partial: "parcial",
    },
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
