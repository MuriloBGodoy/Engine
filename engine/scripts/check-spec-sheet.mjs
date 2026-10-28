#!/usr/bin/env node

/**
 * Verificação da ficha técnica editável e da camada de fábrica.
 *
 * Mesmo formato do `check-fipe-parser.mjs`, pelo mesmo motivo: ler o próprio
 * código e achar que está bom não é medição.
 *
 * 1. ASSERTIVAS — inclusive de CARRO IMPOSSÍVEL. Um Mobi de 400 cv tem de sair
 *    com aviso; um Kwid a diesel declarado tem de sair com aviso; um número
 *    fisicamente impossível não pode chegar ao banco. Isso é teste, não
 *    comentário.
 * 2. COBERTURA MEDIDA — roda a camada de fábrica contra as 4.864 versões reais
 *    da FIPE baixadas por `fetch-fipe-sample.mjs` e diz, com número, em quantos
 *    carros a ficha tem potência, em quantos ela fica RETIDA, em quantos ela
 *    fica AUSENTE e por quê. É esse número que decide se o estado vazio é o
 *    caso raro ou o caso comum. (Spoiler: é o comum.)
 *
 * Uso:
 *   node scripts/check-spec-sheet.mjs [amostra.json]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFipeVersion } from "../src/services/fipeVersion.js";
import {
  ABSENT_REASON,
  HOLD_REASON,
  MATCH_SCOPE,
  SPEC_STATUS,
  getFactorySpecs,
} from "../src/services/vehicleSpecs.js";
import {
  SPEC_ISSUE,
  SPEC_LAYER,
  SPEC_METHOD,
  normalizeSpecSheet,
  publicSpecSheet,
  resolveVehicleSpecSheet,
  specModificationSignals,
  validateRawEntry,
} from "../src/services/carSpecSheet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(
      `FALHOU  ${label}\n        esperado ${JSON.stringify(expected)}\n        obtido   ${JSON.stringify(actual)}`,
    );
  }
  return ok;
};

const codes = (issues) => issues.map((issue) => issue.code).sort();
const has = (issues, code) => issues.some((issue) => issue.code === code);

const owned = (brand, model, year, specs) => ({
  id: "x",
  type: "owned",
  brand,
  model,
  year,
  specs,
});

const declared = (value, extra = {}) => ({
  value,
  origin: SPEC_LAYER.DECLARED,
  method: SPEC_METHOD.OWNER,
  ...extra,
});
const modified = (value, extra = {}) => ({
  value,
  origin: SPEC_LAYER.MODIFIED,
  method: SPEC_METHOD.OWNER,
  ...extra,
});

/**
 * As 21 versões que a FIPE escreve com `Flexone` (amostra de 4.864, 20/08/2026).
 * Transcritas aqui e não filtradas do cache porque a assertiva precisa rodar
 * mesmo sem a amostra baixada — e porque a lista congelada é o que denuncia se
 * a FIPE mudar a grafia.
 */
const FIPE_FLEXONE = [
  "Civic Sedan EXR 2.0 Flexone 16V Aut. 4p",
  "Civic Sedan LXR 2.0 Flexone 16V Aut. 4p",
  "CR-V EXL 2.0 16V 4WD/2.0 Flexone Aut.",
  "CR-V EXL 2.0 Flexone 16V 2WD Aut.",
  "CR-V LX 2.0 16V 2WD/2.0 Flexone Aut.",
  "Fit DX 1.5 Flexone 16V 5p Aut.",
  "Fit DX 1.5 Flexone 16V 5p Mec.",
  "Fit EX/S 1.5 Flex/Flexone 16V 5p Aut.",
  "Fit EXL 1.5 Flex/Flexone 16V 5p Aut",
  "Fit LX 1.5 Flexone 16V 5p Aut.",
  "Fit LX 1.5 Flexone 16V 5p Mec.",
  "Fit Personal 1.5 Flexone 16V 5p Aut.",
  "HR-V EX 1.8 Flexone 16V 5p Aut.",
  "HR-V EXL 1.8 Flexone 16V 5p Aut.",
  "HR-V LX 1.8 Flexone 16V 5p Aut.",
  "HR-V LX 1.8 Flexone 16V 5p Mec.",
  "HR-V Touring 1.8 Flexone 16V 5p Aut.",
  "WR-V EX 1.5 Flexone 16V 5p Aut.",
  "WR-V EXL 1.5 Flexone 16V 5p Aut.",
  "WR-V LX 1.5 Flexone 16V 5p Aut.",
];

console.log("== assertivas ==\n");

// ---------------------------------------------------------------------------
// Camada 1 — fábrica
// ---------------------------------------------------------------------------
{
  const factory = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "Polo Comfortline 200 TSI 1.0 Flex 12V 5p Aut.",
    year: "2020 Gasolina",
  });
  check("polo 200 TSI: par flex de potência", factory.fields.powerCv.pair, {
    gasoline: 116,
    ethanol: 128,
  });
  check("polo 200 TSI: escopo verificado no modelo", factory.fields.powerCv.scope, MATCH_SCOPE.MODEL_VERIFIED);
  check("polo 200 TSI: torque idêntico colapsa em valor único", factory.fields.torque.pair, null);
  check("polo 200 TSI: torque 20,4", factory.fields.torque.value, 20.4);
  check("polo 200 TSI: 0-100 do veículo", factory.fields.accel0to100S.pair, {
    gasoline: 10.1,
    ethanol: 9.6,
  });
}
{
  // O override por modelo: a Saveiro tem 120 cv no etanol onde a chave crua daria
  // 117. Três cavalos que o olho não vê e que estariam errados do mesmo jeito.
  const saveiro = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "Saveiro CD Cross 1.6 MSI Total Flex 16V",
    year: "2019 Gasolina",
  });
  check("saveiro 1.6: override aplicado", saveiro.fields.powerCv.pair, {
    gasoline: 110,
    ethanol: 120,
  });
  const polo = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "Polo Comfortline 1.6 MSI Flex 16V 5p Aut.",
    year: "2019 Gasolina",
  });
  check("polo 1.6: sem override, 117 no etanol", polo.fields.powerCv.pair, {
    gasoline: 110,
    ethanol: 117,
  });
}
{
  // Abstenção herdada do parser: o Onix 1.0 aparece na FIPE com e sem turbo.
  const onix = getFactorySpecs({
    brand: "GM - Chevrolet",
    model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.",
    year: "2022 Gasolina",
  });
  check("onix 1.0: potência RETIDA, não ausente", onix.fields.powerCv.status, SPEC_STATUS.HELD);
  check("onix 1.0: motivo é a aspiração", onix.fields.powerCv.reason, HOLD_REASON.ASPIRATION_UNKNOWN);
}

// ---------------------------------------------------------------------------
// `models` é filtro, não desempate — o bug que serviu número errado
// ---------------------------------------------------------------------------
{
  // O caso que abriu a investigação: Tracker de ano-modelo <=2025 recebia a
  // linha do Onix e mostrava 160/165 Nm. Mesmo bloco, 20 Nm de diferença.
  const tracker = getFactorySpecs({
    brand: "GM - Chevrolet",
    model: "TRACKER 1.0 Turbo 12V Flex Aut.",
    year: "2025 Gasolina",
  });
  check("tracker 2025: não recebe o torque do Onix", tracker.fields.torque.value, null);
  check("tracker 2025: nem o par dele", tracker.fields.torque.pair, null);
  check("tracker 2025: nem a potência", tracker.fields.powerCv.status, SPEC_STATUS.ABSENT);
  // O MOTIVO faz parte da resposta, e é por isso que ele é assertiva.
  //
  // Enquanto o `models` da linha era desempate e não filtro, o Tracker até MY25
  // recebia os 160/165 Nm do Onix. O remendo da época foi por DADO: uma linha
  // Chevrolet/1.0/12V/TB com `models:["Tracker"]`, `yearTo:2025` e todos os
  // campos nulos, que ganhava o desempate e forçava ausência. Funcionava, mas
  // mentia no motivo — saía `field_not_published`, ou seja "a Chevrolet não
  // publica", quando a Chevrolet publica e quem não consegue ler a tabela do
  // PDF somos nós.
  //
  // O `models` virou filtro eliminatório em `matchEngineRow` e a linha nula foi
  // removida em 21/08/2026. A ausência continua — pelo motivo verdadeiro: temos
  // o motor, e a ficha que temos é de outro carro. Esta assertiva é o que
  // impede a linha nula de voltar sem que alguém perceba.
  check(
    "tracker 2025: e o motivo é o verdadeiro, não 'a montadora não publica'",
    tracker.fields.powerCv.reason,
    ABSENT_REASON.NO_ROW_FOR_THIS_MODEL,
  );

  // O ano em que existe documento do Tracker: aí sim, e pelo override, que é a
  // ficha DAQUELE modelo — por isso o escopo é verificado no modelo.
  const trackerNovo = getFactorySpecs({
    brand: "GM - Chevrolet",
    model: "TRACKER 1.0 Turbo 12V Flex Aut.",
    year: "2026 Gasolina",
  });
  check("tracker 2026: 115,5 cv", trackerNovo.fields.powerCv.value, 115.5);
  check("tracker 2026: 180/185 Nm, que são dele", trackerNovo.fields.torque.pair, {
    gasoline: 180,
    ethanol: 185,
  });
  check("tracker 2026: verificado no modelo", trackerNovo.fields.powerCv.scope, MATCH_SCOPE.MODEL_VERIFIED);
}
{
  // O segundo caso, achado na medição: o up! TSI é 105 cv e recebia os 128 cv
  // do Polo 200 TSI porque a janela de ano tinha derrubado a concorrência.
  const up = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "up! Connect 1.0 TSI Total Flex 12V 5p",
    year: "2018 Gasolina",
  });
  check("up! TSI: não recebe a potência do Polo", up.fields.powerCv.status, SPEC_STATUS.ABSENT);
  check("up! TSI: e diz que a linha é de outro modelo", up.fields.powerCv.reason, ABSENT_REASON.NO_ROW_FOR_THIS_MODEL);
}
{
  // A contrapartida do filtro: a Saveiro NÃO está no `models` da linha 1.6 16V
  // (que é do Polo e do Virtus), e mesmo assim responde — porque existe
  // override dela, e override é ficha do modelo.
  const saveiro = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "Saveiro Robust 1.6 Total Flex 16V CS",
    year: "2022 Gasolina",
  });
  check("saveiro: sobrevive ao filtro pelo override", saveiro.fields.powerCv.pair, {
    gasoline: 110,
    ethanol: 120,
  });
  check("saveiro: e é verificada no modelo", saveiro.fields.powerCv.scope, MATCH_SCOPE.MODEL_VERIFIED);
}
{
  // A FIPE escreve a carroceria no nome (`ONIX HATCH`, `ONIX SEDAN Plus`) e a
  // Chevrolet não (`Onix`, `Onix Plus`). Sem o apelido, o carro mais vendido do
  // Brasil não casa com a própria linha.
  const hatch = getFactorySpecs({
    brand: "GM - Chevrolet",
    model: "ONIX HATCH LTZ 1.0 12V TB Flex 5p Aut.",
    year: "2025 Gasolina",
  });
  check("onix hatch: casa com a linha 'Onix'", hatch.fields.powerCv.value, 115.5);
  check("onix hatch: verificado no modelo", hatch.fields.powerCv.scope, MATCH_SCOPE.MODEL_VERIFIED);
  check("onix hatch: 160/165 Nm, que são dele", hatch.fields.torque.pair, {
    gasoline: 160,
    ethanol: 165,
  });

  const sedan = getFactorySpecs({
    brand: "GM - Chevrolet",
    model: "ONIX SEDAN Plus LT 1.0 12V TB Flex Aut.",
    year: "2025 Gasolina",
  });
  check("onix sedan: casa com a linha 'Onix Plus'", sedan.fields.powerCv.value, 115.5);

  const antigo = getFactorySpecs({
    brand: "GM - Chevrolet",
    model: "ONIX HATCH ACTIV 1.4 8V Flex 5P Aut.",
    year: "2017 Gasolina",
  });
  check("onix 1.4: verificado no modelo, não por família", antigo.fields.powerCv.scope, MATCH_SCOPE.MODEL_VERIFIED);
}
{
  // Onix turbo de 2022: a linha do Onix existe, mas é MY2025+. A resposta é
  // "temos, de outro ano" — e não "não temos", nem a linha de outro modelo.
  const onix2022 = getFactorySpecs({
    brand: "GM - Chevrolet",
    model: "ONIX HATCH LTZ 1.0 12V TB Flex 5p Aut.",
    year: "2022 Gasolina",
  });
  check("onix 2022: fora da janela, não fora da tabela", onix2022.fields.powerCv.reason, ABSENT_REASON.OUTSIDE_YEAR_WINDOW);
}
{
  // MPI destrava o Tera de verdade: era `aspiration_unknown`, agora é ficha.
  const tera = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "Tera 1.0 MPI Flex 12V 5p Mec.",
    year: "2025 Flex",
  });
  check("tera MPI: potência do Tera", tera.fields.powerCv.pair, { gasoline: 77, ethanol: 84 });

  // E o Polo 1.0 MPI, que tem o mesmo motor e NÃO está na linha, continua sem
  // número: o Polo MPI é 75/84 e a linha do Tera é 77/84.
  const polo = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "Polo 1.0 MPI Flex 12V 5p",
    year: "2020 Flex",
  });
  check("polo MPI: destravou a aspiração e mesmo assim não chuta", polo.fields.powerCv.reason, ABSENT_REASON.NO_ROW_FOR_THIS_MODEL);
}
{
  // Janela de ano: a Hyundai só publica a ficha do MY corrente, então o HB20
  // usado — que é a maior parte da frota — fica fora. A resposta honesta é
  // "temos, mas de outro ano", e não "não temos".
  const velho = getFactorySpecs({
    brand: "Hyundai",
    model: "HB20 Comfort 1.0 TGDI Flex 12V Aut.",
    year: "2021 Gasolina",
  });
  check("hb20 2021: fora da janela do documento", velho.fields.powerCv.reason, ABSENT_REASON.OUTSIDE_YEAR_WINDOW);
  const novo = getFactorySpecs({
    brand: "Hyundai",
    model: "HB20 Platinum Plus 1.0 TGDI Flex 12V Aut.",
    year: "2026 Gasolina",
  });
  check("hb20 2026: dentro da janela", novo.fields.powerCv.pair, { gasoline: 115, ethanol: 120 });
}
{
  // Elétrico e híbrido não são endereçáveis pela chave de cilindrada, e dizer
  // isso é melhor do que casar por aproximação.
  const bev = getFactorySpecs({ brand: "BYD", model: "Dolphin EV GS (Elétrico)", year: "2024 Elétrico" });
  check("BEV: fora do escopo da tabela", bev.fields.powerCv.reason, ABSENT_REASON.OUT_OF_TABLE_SCOPE);
  check("BEV: status ausente, não retido", bev.fields.powerCv.status, SPEC_STATUS.ABSENT);
}

{
  // FLEXONE — o nome comercial do flex da Honda, escrito colado. O parser lia
  // `Flexone` como palavra desconhecida, não achava marcador de combustível e
  // caía no campo de ano da FIPE, que diz `Gasolina`. Com fuel=gasoline a
  // chave não encontrava o R18 1.8 FLEX do HR-V, que está na tabela.
  //
  // A assertiva do COMBUSTÍVEL vem primeiro de propósito: é o defeito. A da
  // potência é a consequência, e sozinha não diria onde quebrou.
  const hrv = getFactorySpecs({
    brand: "Honda",
    model: "HR-V EX 1.8 Flexone 16V 5p Aut.",
    year: "2021 Gasolina",
  });
  check("hr-v flexone: é flex, não gasolina", hrv.parsed.fuel.value, "flex");
  check(
    "hr-v flexone: e o marcador veio do nome, não do campo de ano",
    hrv.parsed.fuel.evidence,
    "marcador no nome",
  );
  check("hr-v flexone: destrava o R18 1.8", hrv.fields.powerCv.pair, {
    gasoline: 138,
    ethanol: 137,
  });
  check("hr-v flexone: verificado no modelo", hrv.fields.powerCv.scope, MATCH_SCOPE.MODEL_VERIFIED);

  // Carro impossível: HR-V 1.8 a gasolina pura nunca foi vendido no Brasil, e
  // o mesmo vale para Civic 2.0, CR-V 2.0, Fit 1.5 e WR-V 1.5 desta lista —
  // todo motor Flexone é flex por definição da própria Honda. Qualquer uma que
  // saia como não-flex é bug, e a assertiva mostra QUAL.
  const naoFlex = FIPE_FLEXONE.map((model) => ({
    model,
    fuel: parseFipeVersion({ brand: "Honda", model, year: "2017 Gasolina" }).fuel?.value ?? null,
  })).filter((row) => row.fuel !== "flex");
  check("nenhuma Honda Flexone sai como não-flex", naoFlex, []);
}

{
  // SW4 x HILUX — dois carros, um nome só na FIPE.
  //
  // A FIPE escreve o SUV como `Hilux SW4 ...`, e o parser reduzia isso ao
  // nameplate `Hilux`. Colapsados no mesmo nome, uma linha só teria de
  // responder pelos dois — e o MESMO 1GD-FTV 2.8 dá 204 cv na picape e 224 cv
  // no SUV. O Han mediu os dois números, conferiu, e NÃO escreveu linha
  // nenhuma justamente por isso.
  //
  // A assertiva do NOME vem primeiro: é onde quebrava.
  const sw4 = getFactorySpecs({
    brand: "Toyota",
    model: "Hilux SW4 SRX 4x4 2.8 TDI 16V Dies. Aut.",
    year: "2023 Diesel",
  });
  check("sw4: não é Hilux", sw4.parsed.nameplate.value, "Hilux SW4");
  check("sw4: 224 cv, que são dele", sw4.fields.powerCv.value, 224);
  check("sw4: no diesel, sem par flex", sw4.fields.powerCv.fuelBasis, "diesel");
  check("sw4: 550 Nm", sw4.fields.torque.value, 550);
  check("sw4: verificado no modelo", sw4.fields.powerCv.scope, MATCH_SCOPE.MODEL_VERIFIED);

  // A CONTRAPARTIDA, e é ela que impede o conserto de virar o bug anterior de
  // sinal trocado: a Hilux NÃO pode herdar a linha do SW4. Desde 06/10/2026 a
  // picape tem linhas próprias — o torque "ilegível" era daN.m sem o prefixo,
  // e a GR-S saiu da linha comum por `excludeBadge` —, então o que se verifica
  // agora é que cada Hilux pega o número DELA, e não o do irmão.
  const hilux = getFactorySpecs({
    brand: "Toyota",
    model: "Hilux CD SRX 4x4 2.8 TDI 16V Diesel Aut.",
    year: "2023 Diesel",
  });
  check("hilux SRX aut 2023: 204 cv, não os 224 do SW4", hilux.fields.powerCv.value, 204);
  check("hilux SRX aut 2023: 500 Nm (50 daN.m)", hilux.fields.torque.value, 500);

  const hiluxGrs = getFactorySpecs({
    brand: "Toyota",
    model: "Hilux CD GR-S 4x4 2.8 TDI Dies. Aut.",
    year: "2023 Diesel",
  });
  check("hilux GR-S 2023: 224 cv", hiluxGrs.fields.powerCv.value, 224);
  check("hilux GR-S 2023: 550 Nm", hiluxGrs.fields.torque.value, 550);

  const hiluxManual = getFactorySpecs({
    brand: "Toyota",
    model: "Hilux CS 4x4 2.8 TDI Diesel Mec.",
    year: "2024 Diesel",
  });
  check("hilux manual 2024: mesmos 204 cv", hiluxManual.fields.powerCv.value, 204);
  check("hilux manual 2024: 430 Nm, não os 500 do automático", hiluxManual.fields.torque.value, 430);

  const hiluxManual25 = getFactorySpecs({
    brand: "Toyota",
    model: "Hilux Chassi 4x4 2.8 TDI Diesel Mec.",
    year: "2025 Diesel",
  });
  check("hilux manual 2025: 420 Nm (42 daN.m no MY25)", hiluxManual25.fields.torque.value, 420);

  // A GR-S de 2025 não tem documento. A linha comum de 2025 existe e NÃO pode
  // responder por ela — é o que o `excludeBadge` garante. Sem ele, a GR-S
  // receberia 204 cv num carro de 224.
  const hiluxGrs25 = getFactorySpecs({
    brand: "Toyota",
    model: "Hilux CD GR-S 4x4 2.8 TDI Dies. Aut.",
    year: "2025 Diesel",
  });
  check("hilux GR-S 2025: sem número", hiluxGrs25.fields.powerCv.status, SPEC_STATUS.ABSENT);
  // O motivo é "temos a GR-S, mas de outro ano" — a linha dela é 2023-2024.
  check("hilux GR-S 2025: e o motivo é a janela de ano", hiluxGrs25.fields.powerCv.reason, ABSENT_REASON.OUTSIDE_YEAR_WINDOW);

  // Câmbio desconhecido: as linhas de manual e de automático sobrevivem juntas
  // e a ficha retém, em vez de escolher uma.
  const hiluxNoGear = getFactorySpecs({
    brand: "Toyota",
    model: "Hilux 4x2 2.8 Diesel",
    year: "2023 Diesel",
  });
  check("hilux sem câmbio no nome: retém", hiluxNoGear.fields.torque.status, SPEC_STATUS.HELD);

  // Janela: 2022 não foi relido.
  const hilux22 = getFactorySpecs({
    brand: "Toyota",
    model: "Hilux CD SRX 4x4 2.8 TDI 16V Diesel Aut.",
    year: "2022 Diesel",
  });
  check("hilux 2022: fora da janela", hilux22.fields.powerCv.reason, ABSENT_REASON.OUTSIDE_YEAR_WINDOW);

  // Janela: a linha é do manual MY23 e só responde por MY23. O SW4 2.8 de 2016
  // a 2020 é a calibração de 177 cv — servir 224 nele seria o mesmo erro com
  // outra roupa.
  const sw4Velho = getFactorySpecs({
    brand: "Toyota",
    model: "Hilux SW4 SRX 4x4 2.8 TDI 16V Dies. Aut.",
    year: "2018 Diesel",
  });
  check("sw4 2018: fora da janela do manual", sw4Velho.fields.powerCv.reason, ABSENT_REASON.OUTSIDE_YEAR_WINDOW);

  // Carro impossível: o SW4 2.8 dos anos 90 (3L aspirado, 90 cv) está na FIPE
  // como `Hilux SW4 4x4 2.8 Diesel`, sem marcador de sobrealimentação. Com o
  // ano de verdade ele não pode receber os 224 cv do 1GD-FTV — nem por janela
  // (é anterior a 2023) nem por aspiração (o parser não afirma turbo em diesel
  // pré-2005).
  const sw4Antigo = getFactorySpecs({
    brand: "Toyota",
    model: "Hilux SW4 4x4 2.8 Diesel",
    year: "1998 Diesel",
  });
  check("sw4 1998: não vira um 224 cv", sw4Antigo.fields.powerCv.value, null);
  check("sw4 1998: e nem chega a casar motor", sw4Antigo.fields.powerCv.reason, ABSENT_REASON.NO_ENGINE_ROW);
  check(
    "sw4 1998: porque o parser não afirma turbo em diesel pré-2005",
    sw4Antigo.parsed.aspiration.value,
    "naturally_aspirated",
  );
}

{
  // ACABAMENTO — a trava que segurava 12 fichas já coletadas.
  //
  // Compass Sport e Compass Limited têm o MESMO motor (T270), a MESMA
  // cilindrada e o MESMO câmbio (AT6), e a Jeep publica ficha separada para
  // cada um: 8,9 s contra 9,8 s no 0-100. Sem ler o acabamento, o matcher via
  // dois candidatos idênticos, caía em multiple_performance_candidates e a tela
  // ficava retida. Escolher "o mais comum" seria servir o carro do vizinho.
  const sport = getFactorySpecs({
    brand: "Jeep",
    model: "COMPASS SPORT T270 1.3 TB 4x2 Flex Aut.",
    year: "2023 Gasolina",
  });
  const limited = getFactorySpecs({
    brand: "Jeep",
    model: "COMPASS LIMITED T270 1.3 TB 4x2 Flex Aut",
    year: "2023 Gasolina",
  });
  check("compass sport: 8,9/8,8 s", sport.fields.accel0to100S.pair, { gasoline: 8.9, ethanol: 8.8 });
  check("compass sport: e com status de valor", sport.fields.accel0to100S.status, SPEC_STATUS.VALUE);
  check("compass limited: 9,8/9,4 s", limited.fields.accel0to100S.pair, { gasoline: 9.8, ethanol: 9.4 });
  check(
    "compass: os dois acabamentos NÃO recebem o mesmo número",
    JSON.stringify(sport.fields.accel0to100S.pair) ===
      JSON.stringify(limited.fields.accel0to100S.pair),
    false,
  );
  check("compass sport: velocidade máxima também é dele", sport.fields.topSpeedKmh.pair, {
    gasoline: 204.5,
    ethanol: 207,
  });

  // Toro: 4,5 km/h de diferença na ponta entre Volcano e Endurance.
  const volcano = getFactorySpecs({
    brand: "Fiat",
    model: "Toro Volcano 1.3 T270 4x2 Flex Aut.",
    year: "2023 Gasolina",
  });
  const endurance = getFactorySpecs({
    brand: "Fiat",
    model: "Toro Endurance 1.3 T270 4x2 Flex Aut.",
    year: "2023 Gasolina",
  });
  // `?.` de propósito: assertiva que estoura em vez de falhar esconde as
  // outras. Quando esta quebrar, tem de aparecer "obtido undefined", não um
  // TypeError que aborta a suíte no meio.
  check("toro volcano: 195,5 km/h na gasolina", volcano.fields.topSpeedKmh.pair?.gasoline, 195.5);
  check("toro endurance: 200 km/h na gasolina", endurance.fields.topSpeedKmh.pair?.gasoline, 200);

  // FIPE TRUNCADA NÃO CASA, e isto é a metade importante do conserto: sem esta
  // assertiva, alguém "melhora" o matcher com casamento por prefixo de LETRA e
  // o Longitude Night Eagle passa a receber a ficha do Longitude.
  const truncado = getFactorySpecs({
    brand: "Jeep",
    model: "COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.",
    year: "2023 Gasolina",
  });
  check("compass LONG.: não vira Longitude", truncado.fields.accel0to100S.status, SPEC_STATUS.ABSENT);
  check(
    "compass LONG.: e o motivo é não ter linha, não ter escolhido errado",
    truncado.fields.accel0to100S.reason,
    ABSENT_REASON.NO_PERFORMANCE_ROW,
  );

  // Acabamento de uma letra, e um plug-in com o MESMO nome. O 4xe faz o 0-100
  // com dois motores somados; a ficha do T270 a combustão não é dele.
  const s4xe = getFactorySpecs({
    brand: "Jeep",
    model: "COMPASS S 1.3 TB 4XE Aut. (Híbrido)",
    year: "2023 Gasolina",
  });
  check("compass 4xe: fora do escopo da tabela", s4xe.fields.accel0to100S.reason, ABSENT_REASON.OUT_OF_TABLE_SCOPE);
  const sCombustao = getFactorySpecs({
    brand: "Jeep",
    model: "COMPASS S T270 1.3 TB 4x2 Flex Aut.",
    year: "2023 Gasolina",
  });
  check("compass S a combustão: recebe a ficha dele", sCombustao.fields.accel0to100S.pair, {
    gasoline: 9.8,
    ethanol: 9.4,
  });

  // Mesmo acabamento, ano-modelo diferente, número diferente: o Mobi Like faz
  // 14,4 s no MY21 e 15,8 s no MY22 na gasolina. Se a janela de ano estivesse
  // aberta, um dos dois receberia o número do outro.
  const like21 = getFactorySpecs({ brand: "Fiat", model: "MOBI LIKE 1.0 Fire Flex 5p.", year: "2021 Gasolina" });
  const like22 = getFactorySpecs({ brand: "Fiat", model: "MOBI LIKE 1.0 Fire Flex 5p.", year: "2022 Gasolina" });
  check("mobi like MY21: 14,4 s na gasolina", like21.fields.accel0to100S.pair?.gasoline, 14.4);
  check("mobi like MY22: 15,8 s na gasolina", like22.fields.accel0to100S.pair?.gasoline, 15.8);

  // FONTE CONTESTADA — a ficha do Mobi Trekking MY22 diz que o etanol é mais
  // LENTO que a gasolina, o contrário do que motor flex faz. Não vai à tela, e
  // o motivo não pode ser "a montadora não publica", porque ela publica.
  const trekking22 = getFactorySpecs({
    brand: "Fiat",
    model: "MOBI TREKKING 1.0 Flex 5p.",
    year: "2022 Gasolina",
  });
  check("mobi trekking MY22: 0-100 em branco", trekking22.fields.accel0to100S.status, SPEC_STATUS.ABSENT);
  check(
    "mobi trekking MY22: e o motivo é a fonte não fechar",
    trekking22.fields.accel0to100S.reason,
    ABSENT_REASON.SOURCE_DISPUTED,
  );
  check(
    "mobi trekking MY22: a velocidade máxima da mesma ficha continua valendo",
    trekking22.fields.topSpeedKmh.pair,
    { gasoline: 151, ethanol: 152.2 },
  );

  // ABSTENÇÃO DE ASPIRAÇÃO NO DESEMPENHO. O HB20 1.0 tem duas fichas (aspirado
  // 15,4 s e turbo 10,7 s) e a FIPE não escreve o marcador. Cinco segundos.
  // Tem de sair RETIDO — "existe fonte demais" —, não ausente: ausente diria
  // que ninguém publicou, e a Hyundai publicou os dois.
  const hb20 = getFactorySpecs({
    brand: "Hyundai",
    model: "HB20 Comfort 1.0 Flex 12V 5p Mec.",
    year: "2026 Gasolina",
  });
  check("hb20 1.0: desempenho retido, não ausente", hb20.fields.accel0to100S.status, SPEC_STATUS.HELD);
  check("hb20 1.0: e o motivo é a aspiração", hb20.fields.accel0to100S.reason, HOLD_REASON.ASPIRATION_UNKNOWN);

  // E o Creta 1.6, que era o pior caso: recebia os 8,1 s do 1.6 TURBO GDI de
  // dupla embreagem porque a checagem de cilindrada retornava antes da de
  // aspiração. O 1.6 aspirado faz uns 11 s. Três segundos de mentira.
  const creta = getFactorySpecs({
    brand: "Hyundai",
    model: "Creta Action 1.6 16V Flex Aut.",
    year: "2026 Gasolina",
  });
  check("creta 1.6: não recebe os 8,1 s do 1.6 turbo", creta.fields.accel0to100S.status, SPEC_STATUS.HELD);
  check("creta 1.6: retido pela aspiração", creta.fields.accel0to100S.reason, HOLD_REASON.ASPIRATION_UNKNOWN);
}

{
  // ACHADOS DA MESMA MEDIÇÃO, mesma classe de defeito: linha de desempenho
  // respondendo por carro que não é o dela. Nenhum destes estava na lista de
  // travas — apareceram quando a frota passou a medir o 0-100 e a auditoria
  // varreu quem recebia número de quem.

  // 1. `200 TSI` sem cilindrada casava com QUALQUER turbo do modelo. O Polo GTI
  //    1.8 20V Turbo recebia o 0-100 do 1.0 três cilindros. Carro impossível.
  const gti = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "Polo GTI 1.8 Mi 150cv 20V Turbo 3p",
    year: "2010 Gasolina",
  });
  check("polo GTI 1.8: não recebe o 0-100 do 200 TSI", gti.fields.accel0to100S.status, SPEC_STATUS.ABSENT);
  const gts = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "T-Cross Hig. 250 TSI 1.4 Flex 16V 5p Aut",
    year: "2022 Gasolina",
  });
  check("t-cross 250 TSI 1.4: nem ele", gts.fields.accel0to100S.status, SPEC_STATUS.ABSENT);
  const tcross = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    year: "2022 Gasolina",
  });
  check("t-cross 200 TSI 1.0: continua com o dele", tcross.fields.accel0to100S.pair, {
    gasoline: 10.9,
    ethanol: 10.4,
  });

  // 2. Cabine. A ficha da Saveiro CD Cross diz "cabine simples é mais leve e o
  //    número é outro, não extrapolar" — e o código extrapolava para 28 versões.
  const cs = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "Saveiro Robust 1.6 Total Flex 16V CS",
    year: "2022 Gasolina",
  });
  check("saveiro Robust: não recebe o número da Cross", cs.fields.accel0to100S.status, SPEC_STATUS.ABSENT);
  // ESTA é a que testa a CABINE, e não a de cima: a Cross de cabine estendida
  // passa pelo corte de acabamento (o acabamento é o mesmo, `Cross`) e só é
  // barrada pela cabine. Sem ela, o campo `cab` podia sumir do código sem
  // nenhuma assertiva ficar vermelha — foi o que aconteceu na primeira
  // tentativa de mutação.
  const ce = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "Saveiro CROSS 1.6 T. Flex 16V CE",
    year: "2019 Gasolina",
  });
  check(
    "saveiro Cross cabine estendida: é outra cabine, outro peso, sem número",
    ce.fields.accel0to100S.status,
    SPEC_STATUS.ABSENT,
  );
  const cdCross = getFactorySpecs({
    brand: "VW - VolksWagen",
    model: "Saveiro CROSS 1.6 T.Flex 16V CD",
    year: "2022 Gasolina",
  });
  check("saveiro CD Cross: é o carro do documento e fica com o número", cdCross.fields.accel0to100S.pair, {
    gasoline: 10.5,
    ethanol: 10,
  });

  // 3. Acabamento de novo, agora separando aspirado de turbo: o Pulse Abarth
  //    (T270, 185 cv) recebia os 12,2 s do Pulse Drive 1.3 aspirado.
  const abarth = getFactorySpecs({
    brand: "Fiat",
    model: "PULSE ABARTH 1.3 Turbo 16V Flex Aut.",
    year: "2023 Gasolina",
  });
  check("pulse abarth: não recebe o tempo do 1.3 aspirado", abarth.fields.accel0to100S.status, SPEC_STATUS.ABSENT);

  // 4. Colapso de nome, o mesmo do SW4: a FIPE escreve `DUSTER OROCH`, e as
  //    cinco versões viravam Duster. Picape e SUV, mesmo motor, números
  //    diferentes — e a Oroch TEM linha própria na tabela.
  const oroch = getFactorySpecs({
    brand: "Renault",
    model: "DUSTER OROCH Dyna. 1.6 Flex 16V Mec.",
    year: "2026 Gasolina",
  });
  check("duster oroch: é Oroch", oroch.parsed.nameplate.value, "DUSTER OROCH");
  check("duster oroch: e pega a linha da Oroch, 11,8 s", oroch.fields.accel0to100S.value, 11.8);

  // 5. Apelido de nome faltando no matcher de desempenho: a FIPE escreve
  //    `ONIX HATCH`, a Chevrolet escreve `Onix`, e a única linha de Onix da
  //    tabela não respondia por versão nenhuma.
  const onix14 = getFactorySpecs({
    brand: "GM - Chevrolet",
    model: "ONIX HATCH LTZ 1.4 8V FlexPower 5p Aut.",
    year: "2016 Gasolina",
  });
  check("onix 1.4: a linha da Chevrolet finalmente responde", onix14.fields.accel0to100S.value, 12);
}

// ---------------------------------------------------------------------------
// Correção de identidade que DESTRAVA a ficha
// ---------------------------------------------------------------------------
{
  const car = owned("Hyundai", "HB20 Comfort 1.0 Flex 12V 5p Mec.", "2026 Gasolina");
  const antes = resolveVehicleSpecSheet(car);
  check("hb20 aspirado: retido antes da correção", antes.fields.powerCv.status, SPEC_STATUS.HELD);

  const depois = resolveVehicleSpecSheet({
    ...car,
    specs: { version: { aspiration: "naturally_aspirated" } },
  });
  check("hb20 aspirado: destravou com a correção", depois.fields.powerCv.pair, {
    gasoline: 75,
    ethanol: 80,
  });
  check("hb20 aspirado: a tela sabe que destravou", depois.unlockedBy.includes("powerCv"), true);
  check("hb20 aspirado: potência segue sendo de fábrica", depois.tags.powerCv, "fabrica");
  check("hb20 aspirado: a aspiração é dela", depois.tags.aspiration, "declarado");
}

// ---------------------------------------------------------------------------
// Camada 3 — o delta, que é a feature
// ---------------------------------------------------------------------------
{
  const car = owned("VW - VolksWagen", "Polo Comfortline 200 TSI 1.0 Flex 12V 5p Aut.", "2020 Gasolina", {
    performance: { powerCv: modified(200) },
    mods: ["remap", "exhaust", "intercooler"],
    stage: "stage2",
    notes: "Stage 2 na oficina do bairro, escape 3 polegadas.",
  });
  const sheet = resolveVehicleSpecSheet(car);
  check("polo stage 2: valor de hoje", sheet.fields.powerCv.value, 200);
  check("polo stage 2: rótulo", sheet.tags.powerCv, "modificado");
  check("polo stage 2: guarda o de fábrica que substituiu", sheet.fields.powerCv.replaces.pair, {
    gasoline: 116,
    ethanol: 128,
  });
  check("polo stage 2: entra na lista de deltas", sheet.deltas.length, 1);
  check("polo stage 2: sem aviso, o salto fecha com o que foi feito", codes(sheet.issues), []);
  check("polo stage 2: tem modificação", sheet.hasModifications, true);
}
{
  // Camada 2 pura: o carro é de fábrica, o buraco é nosso. Complementa, não
  // substitui, e a tela não deve desenhar seta nenhuma.
  //
  // ERA O ARGO 1.3 e deixou de servir em 19/08/2026: a Fiat publica sim o
  // desempenho do Argo (180/184 km/h), a linha entrou em
  // vehicle-performance.json e o buraco que este teste precisava sumiu. O teste
  // ficou vermelho por COBERTURA A MAIS, não por defeito — trocar o carro é a
  // correção certa, mexer no dado seria esconder o ganho.
  //
  // A Strada é a substituta estável: tem potência de fábrica (logo é um carro
  // que a tabela conhece de verdade) e NÃO tem velocidade máxima, porque as
  // cinco fichas da Strada no media.stellantis.com (ids 120 a 124) usam o
  // template SEM bloco de desempenho. É ausência do fabricante, não fila de
  // coleta, então o buraco não vai fechar por acidente.
  const car = owned("Fiat", "STRADA Freedom 1.3 Flex 8V CD", "2023 Gasolina", {
    performance: { topSpeedKmh: declared(158) },
  });
  const sheet = resolveVehicleSpecSheet(car);
  check("strada: velocidade declarada", sheet.tags.topSpeedKmh, "declarado");
  check("strada: não substitui nada", sheet.fields.topSpeedKmh.replaces, null);
  check("strada: preenche um buraco conhecido", Boolean(sheet.fields.topSpeedKmh.fills), true);
  check("strada: não conta como modificação", sheet.hasModifications, false);
}
{
  // Camada 2 dando um número que a fábrica desmente: 90 cv num Polo 200 TSI de
  // 116/128. Quase sempre é o número de outra versão. Mostra o dela, guarda o de
  // fábrica, e NÃO conta como delta — delta é só camada 3.
  const car = owned("VW - VolksWagen", "Polo Comfortline 200 TSI 1.0 Flex 12V 5p Aut.", "2020 Gasolina", {
    performance: { powerCv: declared(90) },
  });
  const sheet = resolveVehicleSpecSheet(car);
  check("conflito: mostra o número da pessoa", sheet.fields.powerCv.value, 90);
  check("conflito: não vira seta de delta", sheet.deltas.length, 0);
  check("conflito: entra na lista de conflitos", sheet.conflicts.length, 1);
  check("conflito: o de fábrica continua ao alcance", sheet.fields.powerCv.replaces.pair.ethanol, 128);
  check("conflito: avisado", has(sheet.issues, SPEC_ISSUE.DECLARED_CONFLICTS_WITH_FACTORY), true);
}
{
  // Correção que NÃO destrava nada não pode reivindicar crédito.
  const car = owned("VW - VolksWagen", "Polo Comfortline 200 TSI 1.0 Flex 12V 5p Aut.", "2020 Gasolina", {
    version: { doors: 5 },
  });
  check("corrigir portas não destrava potência", resolveVehicleSpecSheet(car).unlockedBy, []);
}
{
  // Dinamômetro: método, não camada. E "na roda" não é comparável com ficha de
  // fábrica, que é sempre no motor.
  const car = owned("VW - VolksWagen", "Polo Comfortline 200 TSI 1.0 Flex 12V 5p Aut.", "2020 Gasolina", {
    performance: {
      powerCv: modified(180, {
        method: SPEC_METHOD.DYNO,
        basis: "wheel",
        fuelBasis: "ethanol",
        shop: "Dino do Zé",
        date: "2026-03-10",
      }),
    },
    mods: ["remap"],
  });
  const sheet = resolveVehicleSpecSheet(car);
  check("dino: rótulo medido", sheet.tags.powerCv, "medido");
  check("dino: camada continua modificado", sheet.fields.powerCv.origin, SPEC_LAYER.MODIFIED);
  check("dino: procedência guardada", sheet.fields.powerCv.source.doc, "Dino do Zé");
  check("dino: roda x motor sinalizado", has(sheet.issues, SPEC_ISSUE.WHEEL_BASIS_NOT_COMPARABLE), true);
}

// ---------------------------------------------------------------------------
// Carro impossível — a parte que só eu pego
// ---------------------------------------------------------------------------
{
  // 400 cv num Mobi 1.0 de fábrica com 74. Não trava (existe Mobi de arrancada),
  // mas sai com três avisos, e um deles é o que importa: nada no motor foi
  // marcado.
  const car = owned("Fiat", "MOBI LIKE 1.0 Fire Flex 8V 5p", "2022 Gasolina", {
    performance: { powerCv: modified(400) },
    mods: ["wheels", "sound"],
  });
  const sheet = resolveVehicleSpecSheet(car);
  check("mobi 400 cv: grava mesmo assim", sheet.fields.powerCv.value, 400);
  check(
    "mobi 400 cv: avisos",
    codes(sheet.issues),
    [
      SPEC_ISSUE.POWER_ABOVE_FACTORY_WITHOUT_ENGINE_MOD,
      SPEC_ISSUE.POWER_FAR_ABOVE_FACTORY,
      SPEC_ISSUE.SPECIFIC_OUTPUT_IMPLAUSIBLE,
    ].sort(),
  );
}
{
  // O mesmo 400 cv num 2.0 turbo com preparação marcada: 200 cv/L é sábado no
  // preparador, e a tela não tem nada a dizer.
  const car = owned("VW - VolksWagen", "JETTA GLI 2.0 TSI 16V 4p Aut.", "2015 Gasolina", {
    performance: { powerCv: modified(400) },
    mods: ["turbo", "remap", "injection", "intercooler"],
    stage: "stage3",
  });
  const sheet = resolveVehicleSpecSheet(car);
  check("jetta 400 cv preparado: sem aviso", codes(sheet.issues), []);
  // A tabela do Han não tem VW 2.0 TSI: o de fábrica é desconhecido e a tela
  // NÃO pode desenhar a seta. É o caso mais comum da base inteira.
  check("jetta: sem valor de fábrica para comparar", sheet.fields.powerCv.replaces, null);
}
{
  // Kwid a diesel: o carro que nunca existiu. A FIPE escreveu Flex com todas as
  // letras, então isto não é preencher buraco, é contradizer o documento.
  const car = owned("Renault", "KWID ZEN 1.0 Flex 12V 5p Mec.", "2023 Gasolina", {
    version: { fuel: "diesel" },
  });
  const sheet = resolveVehicleSpecSheet(car);
  check(
    "kwid diesel: contradiz a FIPE",
    has(sheet.issues, SPEC_ISSUE.VERSION_CORRECTION_CONTRADICTS_FIPE),
    true,
  );
}
{
  // Unidade trocada: 30 kgfm digitado como 30 Nm em cima de 220 cv.
  const car = owned("VW - VolksWagen", "JETTA GLI 2.0 TSI 16V 4p Aut.", "2015 Gasolina", {
    performance: { powerCv: modified(220), torque: modified(30, { unit: "Nm" }) },
    mods: ["remap"],
  });
  const sheet = resolveVehicleSpecSheet(car);
  check("torque 30 Nm com 220 cv: unidade suspeita", has(sheet.issues, SPEC_ISSUE.TORQUE_UNIT_SUSPECT), true);
  check(
    "torque: sugere a unidade certa",
    sheet.issues.find((issue) => issue.code === SPEC_ISSUE.TORQUE_UNIT_SUSPECT).data.suggestedUnit,
    "kgfm",
  );
}
{
  // GNV não dá potência, tira.
  const car = owned("VW - VolksWagen", "Polo Comfortline 200 TSI 1.0 Flex 12V 5p Aut.", "2020 Gasolina", {
    performance: { powerCv: modified(140) },
    mods: ["gnv"],
  });
  const sheet = resolveVehicleSpecSheet(car);
  check("gnv com ganho: avisa", has(sheet.issues, SPEC_ISSUE.GNV_WITH_POWER_GAIN), true);
}
{
  // 300 km/h com 100 cv, e 0-100 em 3 s com 120 cv.
  const car = owned("Fiat", "MOBI LIKE 1.0 Fire Flex 8V 5p", "2022 Gasolina", {
    performance: { topSpeedKmh: declared(300), accel0to100S: declared(3) },
  });
  const sheet = resolveVehicleSpecSheet(car);
  check("300 km/h com 74 cv", has(sheet.issues, SPEC_ISSUE.TOP_SPEED_IMPLAUSIBLE_FOR_POWER), true);
  check("0-100 em 3 s com 74 cv", has(sheet.issues, SPEC_ISSUE.ACCEL_IMPLAUSIBLE_FOR_POWER), true);
}

// ---------------------------------------------------------------------------
// Normalização e limites
// ---------------------------------------------------------------------------
{
  check(
    "5.000 cv não chega ao banco",
    normalizeSpecSheet({ performance: { powerCv: modified(5000) } }),
    null,
  );
  check(
    "e a tela sabe explicar por quê",
    validateRawEntry("powerCv", { value: 5000 })[0].code,
    SPEC_ISSUE.OUT_OF_PHYSICAL_RANGE,
  );
  check("ficha vazia é null, não objeto vazio", normalizeSpecSheet({ mods: [], notes: "  " }), null);
  check(
    "chip inventado é descartado",
    normalizeSpecSheet({ mods: ["turbo", "asa-delta"] }).mods,
    ["turbo"],
  );
  check(
    "texto livre tem teto",
    normalizeSpecSheet({ notes: "a".repeat(5000) }).notes.length,
    1200,
  );
  const sujo = normalizeSpecSheet({ notes: `linha 1${String.fromCharCode(0)}linha 2` });
  check("controle vira espaço", sujo.notes, "linha 1 linha 2");
}

// ---------------------------------------------------------------------------
// Comunidade e fronteira com a Xuria
// ---------------------------------------------------------------------------
{
  const specs = {
    performance: { powerCv: modified(200) },
    mods: ["remap"],
    notes: "stage 2",
  };
  check(
    "carro-meta não publica ficha de exemplar",
    publicSpecSheet({ type: "goal", specs }),
    null,
  );
  const pub = publicSpecSheet({ type: "owned", specs });
  check("carro possuído publica", pub.performance.powerCv.value, 200);
  check("e sempre com a camada junto", pub.performance.powerCv.origin, SPEC_LAYER.MODIFIED);
  check("e com o método junto", pub.performance.powerCv.method, SPEC_METHOD.OWNER);
  check("payload inteiro marcado como do dono", pub.declaredByOwner, true);
  check("nada de fábrica vai junto", Object.keys(pub).includes("factory"), false);
}
{
  const signals = specModificationSignals(
    owned("Fiat", "MOBI LIKE 1.0 Fire Flex 8V 5p", "2022 Gasolina", {
      mods: ["gnv"],
    }),
  );
  check("GNV invalida a estimativa de consumo", signals.recommend.includes("invalidateConsumptionEstimate"), true);
  check("GNV sozinho não é preparação de motor", signals.hasEngineModifications, false);

  const blindado = specModificationSignals(
    owned("Fiat", "TORO Volcano 1.3 T270 16V Flex Aut.", "2023 Gasolina", { mods: ["armor"] }),
  );
  check("blindagem entra como ressalva de seguro", blindado.recommend.includes("insuranceCaveat"), true);
  check("blindagem entra como peso", blindado.recommend.includes("weightPenalty"), true);

  const limpo = specModificationSignals(owned("Fiat", "ARGO 1.3 Flex 8V", "2021 Gasolina", null));
  check("carro sem ficha não sinaliza nada", limpo.recommend, []);
}

// ---------------------------------------------------------------------------
// Tamanho no documento
// ---------------------------------------------------------------------------
{
  const cheio = normalizeSpecSheet({
    version: { aspiration: "turbo", transmission: "manual", fuel: "flex", drivetrain: "awd", doors: 4, valves: 16 },
    performance: {
      powerCv: modified(400, { method: SPEC_METHOD.DYNO, basis: "wheel", fuelBasis: "ethanol", shop: "A".repeat(60), date: "2026-08-17", note: "N".repeat(140) }),
      torque: modified(50, { unit: "kgfm", note: "N".repeat(140) }),
      topSpeedKmh: modified(280, { note: "N".repeat(140) }),
      accel0to100S: modified(4.8, { note: "N".repeat(140) }),
    },
    mods: ["turbo", "remap", "intake", "exhaust", "intercooler", "injection", "camshaft", "internals", "gnv", "clutch", "gearbox", "suspension", "brakes", "wheels", "bodykit", "sound", "armor"],
    stage: "stage3",
    notes: "N".repeat(1200),
  });
  const bytes = Buffer.byteLength(JSON.stringify(cheio), "utf8");
  console.log(`\nficha declarada no pior caso: ${bytes} bytes (orçamento do doc: 891.289)`);
  check("pior caso cabe folgado no documento", bytes < 4096, true);
}

console.log(failures === 0 ? "\ntodas as assertivas passaram\n" : `\n${failures} assertiva(s) falharam\n`);

// ---------------------------------------------------------------------------
// 2. Cobertura medida
// ---------------------------------------------------------------------------

const samplePath = process.argv[2] || path.join(__dirname, ".cache", "fipe-models.json");
if (!fs.existsSync(samplePath)) {
  console.log(`sem amostra em ${samplePath} — rode 'node scripts/fetch-fipe-sample.mjs'.`);
  process.exit(failures ? 1 : 0);
}

const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));

const measure = (label, year) => {
  const tally = { value: 0, held: 0, absent: 0 };
  const scopes = { [MATCH_SCOPE.MODEL_VERIFIED]: 0, [MATCH_SCOPE.ENGINE_FAMILY]: 0 };
  const reasons = {};
  const perf = { value: 0, held: 0, absent: 0 };
  let unlockable = 0;

  for (const row of sample) {
    const car = { brand: row.brand, model: row.model, year };
    const parsed = parseFipeVersion(car);
    const factory = getFactorySpecs(car, { parsed });
    const power = factory.fields.powerCv;

    tally[power.status] += 1;
    if (power.status === SPEC_STATUS.VALUE) scopes[power.scope] += 1;
    else reasons[power.reason] = (reasons[power.reason] || 0) + 1;

    perf[factory.fields.accel0to100S.status] += 1;

    // Quantos dos RETIDOS a própria pessoa consegue destravar dizendo qual é o
    // motor dela. É a métrica que justifica o campo editável de aspiração.
    if (power.reason === HOLD_REASON.ASPIRATION_UNKNOWN) {
      const destravou = ["turbo", "naturally_aspirated"].some((aspiration) => {
        const corrigido = getFactorySpecs(car, {
          parsed: { ...parsed, aspiration: { value: aspiration, confidence: "declared", evidence: "" } },
        });
        return corrigido.fields.powerCv.status === SPEC_STATUS.VALUE;
      });
      if (destravou) unlockable += 1;
    }
  }

  const pct = (n) => `${((n / sample.length) * 100).toFixed(1)}%`;
  console.log(`\n--- ${label} (${sample.length} versões) ---`);
  console.log(`potência de fábrica  valor ${pct(tally.value)}   retido ${pct(tally.held)}   ausente ${pct(tally.absent)}`);
  console.log(`  verificada no modelo ${scopes[MATCH_SCOPE.MODEL_VERIFIED]}, por família de motor ${scopes[MATCH_SCOPE.ENGINE_FAMILY]}`);
  console.log(`desempenho (0-100)   valor ${pct(perf.value)}   retido ${pct(perf.held)}   ausente ${pct(perf.absent)}`);
  console.log(`destraváveis pela correção do dono: ${unlockable} (${pct(unlockable)})`);
  console.log("motivos:");
  for (const [reason, count] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${pct(count).padStart(6)}  ${reason}`);
  }
};

/**
 * A medição acima é por VERSÃO da FIPE, e por versão a base é dominada por
 * carro antigo e por nicho: a FIPE lista 4.864 versões, das quais a esmagadora
 * maioria são Opalas, Corcéis e importados de dez unidades. A Garagem não é
 * assim — ela se concentra nos mesmos vinte carros que o Brasil compra.
 *
 * Então mede-se também a FROTA: versões reais, contemporâneas, dos modelos mais
 * vendidos. Esta é a taxa que a pessoa de verdade vai encontrar, e a de cima é
 * o piso. As duas juntas são a resposta honesta; qualquer uma sozinha mente.
 */
// Versão E ano conferidos um a um contra a FIPE (parallelum, /anos) em
// 27/10/2026: nenhuma linha aqui é um carro que não foi vendido.
const FLEET = [
  ["GM - Chevrolet", "ONIX HATCH LT 1.0 12V Flex 5p Mec.", "2022 Gasolina"],
  ["GM - Chevrolet", "ONIX HATCH LTZ 1.0 12V TB Flex 5p Aut.", "2022 Gasolina"],
  ["GM - Chevrolet", "TRACKER LT 1.0 Turbo 12V Flex Aut.", "2022 Gasolina"],
  ["Hyundai", "HB20 Comfort 1.0 Flex 12V Mec.", "2023 Gasolina"],
  ["Hyundai", "HB20 Platinum Plus 1.0 TB Flex 12V Aut.", "2024 Gasolina"],
  ["Hyundai", "Creta Comfort 1.0 TB 12V Flex Aut.", "2023 Gasolina"],
  ["Fiat", "Strada Freedom 1.3 Flex 8V CD", "2023 Gasolina"],
  ["Fiat", "ARGO DRIVE 1.0 6V Flex", "2022 Gasolina"],
  ["Fiat", "MOBI LIKE 1.0 Fire Flex 5p.", "2022 Gasolina"],
  ["Fiat", "PULSE DRIVE 1.0 Turbo 200 Flex Aut.", "2023 Gasolina"],
  ["Fiat", "Toro Volcano 1.3 T270 4x2 Flex Aut.", "2023 Gasolina"],
  ["Jeep", "COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.", "2022 Gasolina"],
  ["Jeep", "Renegade Sport T270 1.3 TB 4x2 Flex Aut.", "2022 Gasolina"],
  ["VW - VolksWagen", "Polo Track 1.0 Flex 12V 5p", "2023 Gasolina"],
  ["VW - VolksWagen", "T-Cross Sense 200 TSI 1.0 Flex 5p Aut.", "2022 Gasolina"],
  ["VW - VolksWagen", "VIRTUS 1.6 MSI Flex 16V 4p Aut.", "2022 Gasolina"],
  ["VW - VolksWagen", "Nivus Comfortline 1.0 200 TSI Flex Aut.", "2022 Gasolina"],
  ["VW - VolksWagen", "Gol 1.0 Flex 12V 5p", "2020 Gasolina"],
  ["VW - VolksWagen", "Saveiro Robust 1.6 Total Flex 16V CD", "2023 Gasolina"],
  ["Renault", "KWID Zen 1.0 Flex 12V 5p Mec.", "2023 Gasolina"],
  ["Renault", "DUSTER Intense 1.6 16V Flex Aut.", "2023 Gasolina"],
  ["Toyota", "Corolla XEi 2.0 Flex 16V Aut.", "2022 Gasolina"],
  ["Toyota", "Hilux CD SRV 4x4 2.8 TDI Diesel Aut.", "2022 Diesel"],
  ["Toyota", "Hilux SW4 SRX 4x4 2.8 TDI 16V Dies. Aut.", "2023 Diesel"],
  // Era "HR-V EXL 1.5 Flex TB", que não existe na FIPE: o EXL de 2023 é
  // aspirado (Sensing) e o turbo é só Advance/Touring. O teste contava 177 cv
  // para um carro de 126 — o carro impossível dentro do próprio teste.
  ["Honda", "HR-V EXL 1.5 Flex Sensing 16V 5p Aut.", "2023 Gasolina"],
  ["Honda", "HR-V Touring 1.5 Flex TB 16V 5p Aut.", "2023 Gasolina"],
  ["Nissan", "KICKS Active 1.6 16V Flex Aut.", "2023 Gasolina"],
  ["Ford", "Ranger XLS 3.2 20V 4x4 CD Diesel Aut.", "2016 Diesel"],
  ["Toyota", "YARIS XL 1.3 Flex 16V 5p Mec.", "2020 Gasolina"],
];

const measureFleet = () => {
  console.log(`\n--- frota real (${FLEET.length} versões contemporâneas de modelos de volume) ---`);
  let withValue = 0;
  let withAccel = 0;
  const cell = (c, unit) =>
    c.status === SPEC_STATUS.VALUE
      ? `${c.pair ? `${c.pair.ethanol}/${c.pair.gasoline}` : c.value} ${unit}`
      : `${c.status}: ${c.reason}`;
  for (const [brand, model, year] of FLEET) {
    const factory = getFactorySpecs({ brand, model, year });
    const power = factory.fields.powerCv;
    const accel = factory.fields.accel0to100S;
    if (power.status === SPEC_STATUS.VALUE) withValue += 1;
    if (accel.status === SPEC_STATUS.VALUE) withAccel += 1;
    const label =
      power.status === SPEC_STATUS.VALUE
        ? `${power.pair ? `${power.pair.ethanol}/${power.pair.gasoline}` : power.value} cv (${power.scope})`
        : `${power.status}: ${power.reason}`;
    console.log(`  ${model.slice(0, 42).padEnd(44)}${label.padEnd(34)}${cell(accel, "s")}`);
  }
  const pct = (n) => `${((n / FLEET.length) * 100).toFixed(0)}%`;
  console.log(`  => potência de fábrica em ${withValue}/${FLEET.length} (${pct(withValue)})`);

  // A frota só mede alguma coisa se as versões EXISTEM. Até 25/10/2026 a
  // fixture tinha 18 strings que a FIPE não escreve assim, uma delas um HR-V
  // EXL turbo que nunca foi vendido — e o teste contava 177 cv para ele.
  const known = new Set(sample.map((row) => `${row.brand}|${row.model}`));
  for (const [brand, model] of FLEET) {
    check(`frota: "${model}" existe na amostra FIPE`, known.has(`${brand}|${model}`), true);
  }
  // Números que conhecemos do motor, com versão e ano que existem.
  const powerOf = (brand, model, year) => {
    const cell = getFactorySpecs({ brand, model, year }).fields.powerCv;
    if (cell.status !== SPEC_STATUS.VALUE) return cell.status;
    return cell.pair ? [cell.pair.ethanol, cell.pair.gasoline] : cell.value;
  };
  check(
    "frota: HR-V EXL 2023 é aspirado, nunca os 177 cv do turbo",
    powerOf("Honda", "HR-V EXL 1.5 Flex Sensing 16V 5p Aut.", "2023 Gasolina") === 177,
    false,
  );
  check("frota: HR-V Touring turbo 177 cv", powerOf("Honda", "HR-V Touring 1.5 Flex TB 16V 5p Aut.", "2023 Gasolina"), 177);
  check("frota: Polo Track 84/77 cv", powerOf("VW - VolksWagen", "Polo Track 1.0 Flex 12V 5p", "2023 Gasolina"), [84, 77]);
  check("frota: T270 185/180 cv", powerOf("Jeep", "COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.", "2022 Gasolina"), [185, 180]);
  check("frota: Corolla 2.0 177/169 cv", powerOf("Toyota", "Corolla XEi 2.0 Flex 16V Aut.", "2022 Gasolina"), [177, 169]);
  // Onix 1.0 sem marcador de turbo: retido, não chutado.
  check("frota: Onix LT 1.0 sem TB fica retido", powerOf("GM - Chevrolet", "ONIX HATCH LT 1.0 12V Flex 5p Mec.", "2022 Gasolina"), SPEC_STATUS.HELD);
  // O 0-100 é o campo que o dono mais quer ver, e é o mais esparso. Medido à
  // parte porque a média com a potência esconderia os dois.
  console.log(`  => 0-100 em ${withAccel}/${FLEET.length} (${pct(withAccel)})`);
};

// Sem ano, toda janela passa: é o teto otimista da cobertura.
measure("ano desconhecido (teto otimista)", "");
// Com um carro de 2023, as janelas de Hyundai e Renault (2025+) caem fora. É o
// recorte realista: a Garagem é feita de carro usado.
measure("ano-modelo 2023 (recorte realista)", "2023 Gasolina");
measureFleet();

process.exit(failures ? 1 : 0);
