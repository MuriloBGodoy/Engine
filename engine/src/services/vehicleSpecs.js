/**
 * Camada 1 da ficha técnica: FÁBRICA.
 *
 * Junta o que o parser leu da string da FIPE (`fipeVersion.js`) com as duas
 * tabelas do Han — `engine-specs.json` (potência e torque, por MOTOR) e
 * `vehicle-performance.json` (0-100 e velocidade máxima, por VEÍCULO). O
 * resultado é um mapa de campos em que cada campo diz, além do valor, POR QUE
 * ele não tem valor quando não tem.
 *
 * Essa distinção é o produto deste arquivo, não um detalhe de implementação:
 *
 *   - `value`  — temos número e sabemos de onde veio.
 *   - `absent` — ninguém publica. A Fiat não publica 0-100 em ficha nenhuma;
 *                isso não é buraco nosso, é buraco do mercado.
 *   - `held`   — RETIDO. Existe número candidato, mas mais de um, e servir um
 *                deles seria servir o motor errado com cara de certeza. É a
 *                abstenção do parser chegando até a tela.
 *
 * `absent` e `held` parecem a mesma coisa e não são: do primeiro não há o que
 * fazer; o segundo some no instante em que a pessoa disser qual é o motor dela.
 * A tela precisa dos dois separados — é a textura 3 contra a textura 4 do
 * protótipo do Jesse.
 *
 * NADA AQUI É EDITÁVEL. Fábrica é afirmação sobre a VERSÃO, não sobre o
 * exemplar. O que a pessoa declara entra em `carSpecSheet.js`, por cima disto,
 * e sinalizado como dela.
 */

import engineTable from "./engine-specs.json" with { type: "json" };
import performanceTable from "./vehicle-performance.json" with { type: "json" };
import { ASPIRATION, CONFIDENCE, FUEL, TRANSMISSION, parseFipeVersion } from "./fipeVersion.js";

/** Estado de um campo da ficha. Mapeia 1:1 nas texturas do protótipo. */
export const SPEC_STATUS = {
  /** Textura 1 e 2: tem valor (a confiança separa confirmado de inferido). */
  VALUE: "value",
  /** Textura 3: não existe fonte. */
  ABSENT: "absent",
  /** Textura 4: existe fonte demais, e escolher seria chutar. */
  HELD: "held",
};

/** Por que um campo ficou RETIDO. Vira frase na tela; aqui é só código. */
export const HOLD_REASON = {
  /** O parser se absteve na aspiração: o grupo tem versão com e sem turbo. */
  ASPIRATION_UNKNOWN: "aspiration_unknown",
  /** Sem cilindrada não há chave de motor. */
  DISPLACEMENT_UNKNOWN: "displacement_unknown",
  /** Duas linhas da tabela casam e nada as desempata. */
  MULTIPLE_ENGINE_CANDIDATES: "multiple_engine_candidates",
  MULTIPLE_PERFORMANCE_CANDIDATES: "multiple_performance_candidates",
};

/** Por que um campo ficou AUSENTE. */
export const ABSENT_REASON = {
  /** A tabela não tem linha para este motor. É o caso da maior parte da base. */
  NO_ENGINE_ROW: "no_engine_row",
  NO_PERFORMANCE_ROW: "no_performance_row",
  /** A linha existe, mas o fabricante não publica este campo. */
  FIELD_NOT_PUBLISHED: "field_not_published",
  /**
   * O fabricante PUBLICA o número e ele não fecha — e por isso não vai à tela.
   *
   * Não é `field_not_published`, que acusa a montadora de não publicar, nem
   * `no_performance_row`, que diz que ninguém mediu. As duas frases seriam
   * falsas: o documento existe, o número está impresso nele, e quem se recusa a
   * repetir somos nós.
   *
   * O caso que criou o código: a ficha do Mobi Trekking MY22 (Stellantis, doc
   * 72) publica 0-100 de 14,4 s na gasolina e 14,9 s no ETANOL. Em motor flex o
   * etanol entrega mais potência e o tempo tem de ser MENOR — é assim nas
   * outras 20 fichas Fiat lidas, inclusive na do MESMO Mobi Trekking no MY21
   * (14,4 / 13,8). Provavelmente é erro de digitação da Fiat. Provavelmente não
   * basta: corrigir documento de fabricante é inventar dado, e repetir um
   * número que a própria ficha desmente é servir carro errado com carimbo de
   * camada 1. Fica em branco, e a tela diz por quê.
   *
   * Marcado campo a campo, em `disputedFields` na linha da tabela: a velocidade
   * máxima da MESMA ficha é consistente com todas as irmãs e continua valendo.
   */
  SOURCE_DISPUTED: "source_disputed",
  /**
   * A tabela tem este motor, e o documento de onde ele saiu é de OUTRO modelo.
   * Não é `no_engine_row` (que diz "não temos o motor") nem
   * `field_not_published` (que acusa a montadora de não publicar): o número
   * existe, publicado, e é do carro do vizinho.
   *
   * Motor igual não implica número igual — o Tracker e o Onix dividem bloco,
   * curso, diâmetro e taxa de compressão e diferem 20 Nm; a Saveiro e o Polo
   * dividem o EA211 1.6 e diferem 3 cv no etanol. Servir o do vizinho é
   * exatamente o erro que este arquivo existe para não cometer.
   */
  NO_ROW_FOR_THIS_MODEL: "no_row_for_this_model",
  /**
   * A linha existe para este motor, mas só cobre outro ano-modelo. Hyundai e
   * Renault publicam só a ficha do MY corrente — ou seja, justamente o carro
   * usado, que é a maior parte da Garagem, fica de fora. Merece frase própria
   * porque a resposta honesta é "temos, mas de outro ano", não "não temos".
   */
  OUTSIDE_YEAR_WINDOW: "outside_year_window",
  /** A FIPE simplesmente não escreveu (câmbio em 45%, portas em 45%). */
  NOT_WRITTEN_BY_FIPE: "not_written_by_fipe",
  /** Motor elétrico e híbrido não são endereçáveis pela chave de cilindrada. */
  OUT_OF_TABLE_SCOPE: "out_of_table_scope",
};

/**
 * Quão perto do carro a linha da tabela está.
 *
 * `model_verified` — o fabricante publicou este motor NESTE modelo. É o único
 *                    escopo que a tabela produz hoje, e é de propósito: ver
 *                    `matchEngineRow`.
 * `engine_family`  — o motor casa e o documento NÃO diz de que modelo é. Só
 *                    acontece em linha sem `models`, que é a forma de a tabela
 *                    declarar "isto vale para a família". Nenhuma linha usa
 *                    isso hoje; o campo existe para quando o Han tiver uma
 *                    fonte que fale de motor e não de carro.
 */
export const MATCH_SCOPE = {
  MODEL_VERIFIED: "model_verified",
  ENGINE_FAMILY: "engine_family",
  // A própria string da FIPE declara a potência ("Lancer 2.0 16V 160cv Mec.").
  // Não vem da nossa tabela e não tem par flex nem rpm, mas é explícita e não
  // depende de acertar o motor — vale mais que abstenção.
  FIPE_DECLARED: "fipe_declared",
};

export const KGFM_TO_NM = 9.80665;

export const toNm = (value, unit) =>
  value === null || value === undefined
    ? null
    : unit === "Nm"
      ? Number(value)
      : Number(value) * KGFM_TO_NM;

export const toKgfm = (value, unit) =>
  value === null || value === undefined
    ? null
    : unit === "kgfm"
      ? Number(value)
      : Number(value) / KGFM_TO_NM;

// ---------------------------------------------------------------------------
// Tradução do vocabulário das tabelas para o do parser
// ---------------------------------------------------------------------------

const TABLE_ASPIRATION = { NA: ASPIRATION.NATURAL, TB: ASPIRATION.TURBO };
const TABLE_FUEL = {
  Flex: FUEL.FLEX,
  Diesel: FUEL.DIESEL,
  Gasolina: FUEL.GASOLINE,
  Etanol: FUEL.ETHANOL,
};

/**
 * Câmbio como a tabela de desempenho escreve, em texto livre de fabricante.
 * `Manual 6` e `EDC (dupla embreagem)` são strings de catálogo, não enum.
 */
const parseTableTransmission = (raw) => {
  const text = String(raw || "").toLowerCase();
  if (!text) return null;
  if (text.includes("cvt")) return TRANSMISSION.CVT;
  if (text.includes("edc") || text.includes("dupla")) return TRANSMISSION.DUAL_CLUTCH;
  if (text.includes("manual") || text.includes("mec")) return TRANSMISSION.MANUAL;
  if (text.includes("autom")) return TRANSMISSION.AUTOMATIC;
  return null;
};

/**
 * `Aut.` na FIPE cobre automático de conversor, CVT e dupla embreagem — ela não
 * distingue. Então um `Aut.` casa com qualquer um dos três; o que NÃO pode é
 * casar com manual, porque é exatamente aí que o número muda (Duster 1.6:
 * 11,5 s no manual, 13,1 s no CVT).
 *
 * Se sobrar mais de um candidato compatível, a saída é reter, não sortear.
 */
const AUTOMATIC_FAMILY = new Set([
  TRANSMISSION.AUTOMATIC,
  TRANSMISSION.CVT,
  TRANSMISSION.DUAL_CLUTCH,
  TRANSMISSION.AUTOMATED,
]);

const transmissionCompatible = (parsedValue, tableValue) => {
  if (!tableValue) return true; // linha sem câmbio declarado é curinga
  if (!parsedValue) return true; // não sabemos o nosso: não dá para descartar
  if (parsedValue === tableValue) return true;
  return AUTOMATIC_FAMILY.has(parsedValue) && AUTOMATIC_FAMILY.has(tableValue);
};

const inYearWindow = (year, from, to) => {
  if (!year) return true; // sem ano não dá para descartar linha nenhuma
  if (from && year < from) return false;
  if (to && year > to) return false;
  return true;
};

const normalizeName = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

// ---------------------------------------------------------------------------
// Motor: potência e torque
// ---------------------------------------------------------------------------

/**
 * O badge é o desempatador quando a chave colide. `170 TSI` (116 cv) e
 * `200 TSI` (128 cv) têm marca, cilindrada, válvulas, aspiração e combustível
 * idênticos; o que os separa está escrito na string da FIPE e em nenhum outro
 * lugar: `Tera 1.0 170 TSI Flex 12V 5p Mec.`.
 */
const badgeMatches = (badge, model) => {
  if (!badge) return null;
  const text = String(model || "");
  // O campo aceita alternativas separadas por barra: `Turbo 200 / T200`.
  const alternatives = String(badge)
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const alternative of alternatives) {
    const digits = alternative.match(/\d{3}/)?.[0];
    if (digits && new RegExp(`\\b${digits}\\b`).test(text)) return true;
    const bare = alternative.replace(/[^A-Za-z]/g, "");
    if (bare.length >= 3 && new RegExp(`\\b${bare}\\b`, "i").test(text)) return true;
    // Badge com hífen, como `GR-S`: tirar a pontuação vira `GRS`, que não casa
    // com `Hilux CD GR-S 4x4`. Aqui o hífen vale como hífen, espaço ou nada.
    if (alternative.includes("-")) {
      const pattern = alternative
        .split("-")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[-\\s]?");
      if (new RegExp(`\\b${pattern}\\b`, "i").test(text)) return true;
    }
  }
  return false;
};

const engineRowMatches = (row, parsed) => {
  if (row.brand !== parsed.brand?.value) return false;
  if (Number(row.displacementL) !== parsed.displacement?.value) return false;
  if (TABLE_ASPIRATION[row.aspiration] !== parsed.aspiration?.value) return false;
  if (TABLE_FUEL[row.fuel] !== parsed.fuel?.value) return false;

  // Válvulas entram na chave porque são o discriminador de geração (1.6 8V
  // EA111 x 1.6 16V MSI). Quando a FIPE não escreveu, não dá para usar como
  // filtro — vira só desempate mais adiante.
  const rowValves = row.valves ? Number(String(row.valves).replace(/\D/g, "")) : null;
  if (rowValves && parsed.valves?.value && rowValves !== parsed.valves.value) return false;

  // Câmbio só entra quando a linha declara, e só quando o fabricante publica
  // número diferente por câmbio: a Hilux 2.8 manual tem 430 Nm e a automática
  // 500, com o mesmo motor. Câmbio desconhecido não descarta — sobram as duas
  // linhas e a ficha retém, que é o certo.
  if (!transmissionCompatible(parsed.transmission?.value, parseTableTransmission(row.transmission))) {
    return false;
  }

  return true;
};

/**
 * A FIPE escreve a carroceria dentro do nome comercial (`ONIX HATCH`,
 * `ONIX SEDAN Plus`); a montadora escreve só o nome (`Onix`, `Onix Plus`). São
 * o mesmo carro e as duas grafias precisam casar, senão o filtro de modelo
 * descarta linha certa por causa de vocabulário.
 *
 * Tabela curta e conferida uma a uma, não uma regra genérica de "tira a palavra
 * de carroceria": `Palio Weekend` e `Palio` são carros diferentes, e uma regra
 * assim juntaria os dois. Cada entrada aqui é uma afirmação sobre um carro
 * específico e precisa ser defensável sozinha.
 *
 *   ONIX HATCH  -> Onix       — o hatch É o Onix.
 *   ONIX SEDAN  -> Onix Plus  — desde 2020 o sedã do Onix se chama Onix Plus, e
 *                               toda entrada `ONIX SEDAN` da FIPE traz `Plus`
 *                               no nome. O sedã anterior era o Prisma, e a FIPE
 *                               escreve PRISMA nele.
 *   HILUX SW4   -> SW4        — a FIPE mantém `Hilux` na frente porque o SUV
 *                               nasceu como derivado da picape. A Toyota do
 *                               Brasil vende e DOCUMENTA o carro como `SW4`:
 *                               o manual do proprietário do SW4 é separado do
 *                               da Hilux, e é dele que sai o número. O apelido
 *                               casa as duas grafias — e NÃO junta os dois
 *                               carros: eles continuam separados porque o
 *                               parser agora lê `HILUX SW4` como nome próprio,
 *                               diferente de `HILUX`.
 */
const FIPE_NAMEPLATE_ALIAS = {
  ONIXHATCH: "ONIX",
  ONIXSEDAN: "ONIXPLUS",
  HILUXSW4: "SW4",
  // Mesmo caso do SW4: a FIPE prefixa com o nome do irmão mais velho, a Renault
  // vende e documenta como `Oroch`.
  DUSTEROROCH: "OROCH",
};

/** Nomes normalizados pelos quais este carro atende. Nunca vazio se há nome. */
const carNameplates = (parsed) => {
  const nameplate = normalizeName(parsed?.nameplate?.value);
  if (!nameplate) return [];
  const alias = FIPE_NAMEPLATE_ALIAS[nameplate];
  return alias ? [nameplate, alias] : [nameplate];
};

const listsAnyOf = (models, names) =>
  (models || []).some((model) => names.includes(normalizeName(model)));

/**
 * Aplica o override por modelo quando existe. A Saveiro 1.6 tem 120 cv no
 * etanol contra 117 do Polo com o MESMO motor na chave; sem o override ela
 * perderia 3 cv, que é pouco para o olho e é errado do mesmo jeito.
 *
 * O override é uma ficha DAQUELE modelo: quando ele casa, o carro está
 * verificado no modelo mesmo que o `models` da linha-base não o cite. É por
 * isso que a Saveiro sobrevive ao filtro de modelo.
 */
const findOverride = (row, parsed, names = carNameplates(parsed)) => {
  const overrides = engineTable.overridesPorModelo || [];
  if (!names.length) return null;

  const key = [row.brand, row.displacementL, row.valves, row.aspiration, row.fuel]
    .filter(Boolean)
    .join(" / ");

  return (
    overrides.find((override) => {
      if (normalizeName(override.overrides) !== normalizeName(key)) return false;
      if (!names.includes(normalizeName(override.model))) return false;
      if (!inYearWindow(parsed.modelYear?.value, override.yearFrom, override.yearTo)) return false;
      const overrideTransmission = parseTableTransmission(override.transmission);
      if (overrideTransmission && parsed.transmission?.value !== overrideTransmission) return false;
      return true;
    }) || null
  );
};

/**
 * Escolhe a linha de motor, ou não escolhe nenhuma.
 *
 * @returns {{row: object|null, scope: string|null, reason: string|null, override: object|null}}
 */
export function matchEngineRow(parsed) {
  const fuel = parsed?.fuel?.value;
  if (fuel === FUEL.ELECTRIC || fuel === FUEL.HYBRID || fuel === FUEL.PLUGIN_HYBRID) {
    // Potência de híbrido é de sistema e BEV não tem cilindrada: a chave desta
    // tabela não endereça nenhum dos dois. Dizer isso é melhor que casar por
    // aproximação.
    return { row: null, scope: null, reason: ABSENT_REASON.OUT_OF_TABLE_SCOPE, override: null };
  }
  if (!parsed?.displacement?.value) {
    return { row: null, scope: null, reason: HOLD_REASON.DISPLACEMENT_UNKNOWN, override: null };
  }
  if (!parsed?.aspiration?.value) {
    // Abstenção herdada do parser: 1.0 aspirado e 1.0 turbo diferem ~40%.
    return { row: null, scope: null, reason: HOLD_REASON.ASPIRATION_UNKNOWN, override: null };
  }

  const all = (engineTable.engines || []).filter((row) => engineRowMatches(row, parsed));
  if (!all.length) {
    return { row: null, scope: null, reason: ABSENT_REASON.NO_ENGINE_ROW, override: null };
  }

  // O `models` da linha é FILTRO ELIMINATÓRIO, não desempate.
  //
  // Era desempate, e servia número errado. Quando a janela de ano derrubava a
  // concorrência e sobrava um único candidato, ele voltava como `engine_family`
  // ainda que o `models` dele não citasse o carro — a AUSÊNCIA DE CONCORRÊNCIA
  // promovia palpite a resposta. Dois casos medidos na base:
  //
  //   - Tracker 1.0 T de ano-modelo <=2025 recebia a linha do Onix: 160/165 Nm
  //     no lugar dos 180/185 Nm dele. Mesmo bloco (999 cm³, 74 x 77,49 mm,
  //     10,5:1) e 20 Nm de diferença.
  //   - `up! Connect 1.0 TSI` recebia a linha 200 TSI do Polo: 128 cv no etanol
  //     num carro de 105 cv. 22% a mais, e nada na tela dizia que era
  //     inferência, porque a `scope` não é desenhada.
  //
  // Motor igual não implica número igual: a mesma peça muda de calibração, de
  // escape e de homologação a cada aplicação. Quem publica potência é o modelo,
  // não o motor. Então linha com `models` só responde pelos modelos que lista,
  // e um override daquele modelo também admite a linha, porque o override É a
  // ficha do modelo (é o que mantém a Saveiro 1.6 com os 120 cv dela).
  //
  // Linha SEM `models` segue curinga e sai como `engine_family`: é como a
  // tabela diz "isto vale para a família". Nenhuma linha faz isso hoje, então o
  // escopo some da base — de propósito, até que a tela saiba desenhá-lo.
  //
  // MODELO ANTES DE ANO, e a ordem é parte da resposta. Um Onix 1.0 turbo de
  // 2022 tem linha de Onix na tabela, só que de outro ano-modelo: o certo é
  // dizer "temos, mas de outro ano". Filtrando por ano primeiro, a linha do
  // Onix sumia antes de ser vista e sobrava a de outro modelo — que é, aliás,
  // por onde o número errado entrava.
  //
  // `excludeBadge` é o mesmo filtro pelo lado de fora: a linha da Hilux vale
  // para o modelo inteiro MENOS a GR-S, que tem calibração própria. Sem ele, a
  // GR-S de um ano em que só existe a linha comum receberia os 204 cv dela.
  const names = carNameplates(parsed);
  const forThisModel = all.filter(
    (row) =>
      (!(row.models || []).length ||
        listsAnyOf(row.models, names) ||
        findOverride(row, parsed, names)) &&
      badgeMatches(row.excludeBadge, parsed.raw.model) !== true,
  );
  if (!forThisModel.length) {
    // Havia linha para o motor e nenhuma responde por este modelo. Não é "não
    // temos o motor", é "o que temos é de outro carro" — e a diferença importa:
    // a primeira frase é buraco nosso, a segunda é pedido de fonte com nome e
    // sobrenome.
    return { row: null, scope: null, reason: ABSENT_REASON.NO_ROW_FOR_THIS_MODEL, override: null };
  }

  const inWindow = forThisModel.filter((row) =>
    inYearWindow(parsed.modelYear?.value, row.yearFrom, row.yearTo),
  );
  if (!inWindow.length) {
    return { row: null, scope: null, reason: ABSENT_REASON.OUTSIDE_YEAR_WINDOW, override: null };
  }

  let candidates = inWindow;

  // 1º desempate: o badge escrito na própria string da FIPE.
  if (candidates.length > 1) {
    const byBadge = candidates.filter((row) => badgeMatches(row.badge, parsed.raw.model) === true);
    if (byBadge.length === 1) candidates = byBadge;
    else {
      // Linha com badge que a string NÃO traz é candidata errada quando existe
      // irmã sem badge exigido.
      const withoutContradiction = candidates.filter(
        (row) => badgeMatches(row.badge, parsed.raw.model) !== false,
      );
      if (withoutContradiction.length) candidates = withoutContradiction;
    }
  }

  // 2º: linha que cita o modelo ganha de linha curinga. Todas as sobreviventes
  // já respondem por este carro — o filtro por modelo aconteceu lá em cima —,
  // então aqui só se separa o que é ficha do modelo do que é ficha de família.
  const scoped = candidates.map((row) => ({
    row,
    override: findOverride(row, parsed, names),
    scope: (row.models || []).length ? MATCH_SCOPE.MODEL_VERIFIED : MATCH_SCOPE.ENGINE_FAMILY,
  }));
  const verified = scoped.filter((item) => item.scope === MATCH_SCOPE.MODEL_VERIFIED);
  const chosen = verified.length ? verified : scoped;

  if (chosen.length === 1) {
    return { row: chosen[0].row, scope: chosen[0].scope, reason: null, override: chosen[0].override };
  }
  return { row: null, scope: null, reason: HOLD_REASON.MULTIPLE_ENGINE_CANDIDATES, override: null };
}

// ---------------------------------------------------------------------------
// Veículo: 0-100 e velocidade máxima
// ---------------------------------------------------------------------------

/**
 * Palavras de um acabamento, em maiúsculas e sem pontuação. `SRX Plat.` vira
 * `["SRX", "PLAT"]`. Por PALAVRA, e não string colada, porque o acabamento `S`
 * do Compass existe e casaria dentro de qualquer outra palavra.
 */
const trimWords = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/**
 * O acabamento da linha bate com o do carro?
 *
 * Casa por PREFIXO DE PALAVRA, e a escolha é medida na base, não estética. A
 * FIPE escreve o acabamento e o código do motor no mesmo lugar da string —
 * `COMPASS LIMITED T270 1.3 TB 4x2 Flex Aut`, `COMPASS S T270 1.3 TB 4x2 Flex
 * Aut.` —, então exigir igualdade exata perderia todos os T270, que são
 * justamente os que esta função existe para separar. Prefixo pega o acabamento
 * e ignora o que vem depois dele.
 *
 * O QUE FICA DE FORA, DE PROPÓSITO: FIPE truncada NÃO casa. `COMPASS LONG. T270`
 * não vira Longitude e `Toro Vol. TRIBUTO 125` não vira Volcano. Dá para
 * adivinhar? Dá. Mas `LONG.` também abreviaria um Longitude Night Eagle, que é
 * outra ficha, e o preço de errar aqui é servir 9,7 s onde são 8,9 s. Sem
 * acabamento legível, a resposta certa é não ter número.
 *
 * O RISCO QUE SOBRA, dito por escrito: acabamento longo que COMEÇA com o nome
 * de um curto casa com o curto — `MOBI EASY COMFORT` casa com a linha `Easy`.
 * Hoje a janela de ano segura esse caso (a linha Easy é MY21 e o Easy Comfort é
 * de 2018), mas isso é segunda linha de defesa, não a primeira. Se aparecer um
 * par assim dentro da MESMA janela, a saída é escrever as duas linhas, não
 * afrouxar esta regra.
 */
const trimMatches = (rowTrims, parsedTrim) => {
  const got = trimWords(parsedTrim);
  if (!got.length) return false;
  return (rowTrims || []).some((candidate) => {
    const want = trimWords(candidate);
    return want.length > 0 && want.every((word, i) => got[i] === word);
  });
};

/**
 * A versão na tabela de desempenho é texto de catálogo (`1.0 200 TSI`,
 * `Intense Plus 1.6`, `1.0 12V aspirado`). Três checagens, e nenhuma chuta.
 *
 * 1. ACABAMENTO. Só entra quando a linha declara `trim`, e aí é ELIMINATÓRIA:
 *    linha com acabamento só responde por aquele acabamento, e se o acabamento
 *    do carro não for legível ela não responde por ninguém. É o que destrava as
 *    12 fichas que estavam paradas em `_meta.bloqueadoPorTrim`: sem isto,
 *    Compass Sport e Compass Limited são o MESMO carro para o matcher, caem
 *    sempre em `multiple_performance_candidates` e a tela fica retida. Com
 *    isto, cada um recebe o número da ficha dele — e a diferença é de 0,9 s no
 *    0-100 do Compass e de 4,5 km/h na ponta da Toro. Não é ruído.
 *
 *    Linha SEM `trim` continua respondendo pelo modelo inteiro, como antes. É
 *    assim que as 32 linhas que já existiam seguem funcionando sem retoque.
 *
 * 2. CABINE, mesma regra do acabamento.
 * 3. CILINDRADA, se o texto trouxer.
 *
 * A ASPIRAÇÃO SAIU DAQUI e foi para `performanceRowAspiration`, e é a mudança
 * mais importante deste arquivo nesta rodada. Antes ela era o `else` da
 * cilindrada: `if (displacement) return ...` retornava na hora e a checagem de
 * aspiração nunca rodava para nenhuma linha que tivesse cilindrada no texto.
 * Consequência medida em 20/08/2026 sobre as 4.864 versões da FIPE:
 *
 *   - 11 versões de Creta 1.6 ASPIRADO recebiam os 8,1 s da ficha do 1.6 TURBO
 *     GDI de dupla embreagem. O aspirado faz uns 11 s. Três segundos.
 *   - 29 versões de HB20 e HB20S recebiam os 14,5 s da ficha do 1.0 ASPIRADO,
 *     incluindo as versões `TB` — que fazem 10,7 s.
 *
 * Nenhum desses casos era detectável lendo o código: os dois números eram
 * plausíveis, vinham de camada 1 e apareciam na tela com a mesma cara de
 * certeza. Só a varredura versão a versão mostra.
 *
 * A aspiração também não podia virar um simples `&&` aqui, porque filtrar em
 * silêncio transforma abstenção em "ninguém publicou" — ver o comentário de
 * `performanceRowAspiration`.
 */
const performanceVersionMatches = (row, parsed) => {
  const version = String(row.version || "");

  if ((row.trim || []).length && !trimMatches(row.trim, parsed?.trim?.value)) return false;

  // CABINE, mesma regra do acabamento: só entra quando a linha declara, e aí é
  // eliminatória. Numa picape a cabine é meia tonelada de diferença — a ficha
  // do Saveiro CD Cross diz, com todas as letras, "cabine simples é mais leve e
  // o número é outro, não extrapolar", e sem este campo o código extrapolava
  // para 28 versões de Saveiro, cabine simples e estendida inclusive.
  if (row.cab && parsed?.body?.cab?.value !== row.cab) return false;

  const displacement = version.match(/(?<!\d)(\d)\.(\d)(?!\d)/);
  if (displacement && Number(displacement[0]) !== parsed.displacement?.value) return false;

  return true;
};

/**
 * Aspiração que o texto da linha declara, ou `null` quando ele não declara.
 *
 * Está separada de `performanceVersionMatches` por um motivo de TELA, não de
 * organização: quando o parser se absteve da aspiração, filtrar aqui apagaria a
 * abstenção e a linha sumiria em silêncio — o campo sairia como `no_performance_row`
 * ("ninguém publicou"), que é MENTIRA quando a Hyundai publicou os dois números
 * e o que falta é saber qual é o carro. O certo é RETER, e reter é uma decisão
 * de `matchPerformanceRow`, que enxerga o conjunto.
 *
 * Caso medido: `HB20 Comfort 1.0 Flex 12V Mec.` tem duas linhas candidatas na
 * tabela (1.0 aspirado, 15,4 s; 1.0 Turbo GDI, 10,7 s) e a FIPE não escreve o
 * marcador. Cinco segundos de diferença. Retido, e destravável pela pessoa.
 */
const performanceRowAspiration = (row) => {
  const version = String(row.version || "");
  if (/\bTSI\b|\bTCe\b|\bTGDI\b|\bTurbo\b|\bT\d{3}\b/i.test(version)) return ASPIRATION.TURBO;
  if (/aspirado|\bSCe\b|\bMSI\b/i.test(version)) return ASPIRATION.NATURAL;
  return null;
};

export function matchPerformanceRow(parsed) {
  // Os MESMOS apelidos da tabela de motor, e não `normalizeName` cru como era
  // antes. A divergência entre as duas tabelas era invisível e custava linha:
  // a FIPE escreve `ONIX HATCH`, a linha de desempenho da Chevrolet diz `Onix`,
  // e o resultado é que a única linha de Onix da tabela nunca respondia por
  // nenhuma versão de Onix da base. O mesmo valeria para o Oroch, cujo nome na
  // FIPE é `DUSTER OROCH`.
  const names = carNameplates(parsed);
  if (!names.length || !parsed?.brand?.value) {
    return { row: null, reason: ABSENT_REASON.NO_PERFORMANCE_ROW };
  }

  // Nenhuma linha desta tabela é de híbrido ou de elétrico, e a tabela não tem
  // coluna de combustível para dizer isso — então quem diz é este corte, espelho
  // do que `matchEngineRow` já faz.
  //
  // O caso concreto que ele existe para barrar: `COMPASS S 1.3 TB 4XE Aut.
  // (Híbrido)` é o plug-in, e tem a MESMA marca, a MESMA cilindrada, o MESMO
  // acabamento (`S`) e a mesma marca de turbo do `COMPASS S T270 1.3 TB 4x2
  // Flex Aut.`. Sem este corte, o 4xe — que faz o 0-100 em torno de 7 s com os
  // dois motores somados — receberia os 9,8 s da ficha do T270 a combustão.
  // Dois carros diferentes com o mesmo nome, de novo.
  //
  // Quando entrar ficha de híbrido, isto vira comparação de combustível de
  // verdade e deixa de ser um corte.
  const fuel = parsed?.fuel?.value;
  if (fuel === FUEL.ELECTRIC || fuel === FUEL.HYBRID || fuel === FUEL.PLUGIN_HYBRID) {
    return { row: null, reason: ABSENT_REASON.OUT_OF_TABLE_SCOPE };
  }

  const byVehicle = (performanceTable.performance || []).filter(
    (row) =>
      row.brand === parsed.brand.value &&
      names.includes(normalizeName(row.nameplate)) &&
      performanceVersionMatches(row, parsed),
  );
  if (!byVehicle.length) return { row: null, reason: ABSENT_REASON.NO_PERFORMANCE_ROW };

  // Aspiração, e a ordem importa: primeiro se pergunta se a tabela DEPENDE dela
  // para este carro, e só depois se filtra. Se depende e o parser se absteve,
  // a resposta é RETIDO — que some no instante em que a pessoa disser qual é o
  // motor dela — e não "ninguém publicou", que seria falso.
  const byAspiration = byVehicle.filter((row) => {
    const declared = performanceRowAspiration(row);
    return !declared || declared === parsed.aspiration?.value;
  });
  if (!byAspiration.length) {
    const dependeDaAspiracao = byVehicle.some((row) => performanceRowAspiration(row) !== null);
    if (dependeDaAspiracao && !parsed.aspiration?.value) {
      return { row: null, reason: HOLD_REASON.ASPIRATION_UNKNOWN };
    }
    return { row: null, reason: ABSENT_REASON.NO_PERFORMANCE_ROW };
  }

  const inWindow = byAspiration.filter((row) =>
    inYearWindow(parsed.modelYear?.value, row.yearFrom, row.yearTo),
  );
  if (!inWindow.length) return { row: null, reason: ABSENT_REASON.OUTSIDE_YEAR_WINDOW };

  const compatible = inWindow.filter((row) =>
    transmissionCompatible(parsed.transmission?.value, parseTableTransmission(row.transmission)),
  );
  if (!compatible.length) return { row: null, reason: ABSENT_REASON.NO_PERFORMANCE_ROW };
  if (compatible.length > 1) {
    // Câmbio move 1,5 s e 11 km/h na mesma Duster. Com dois candidatos, o certo
    // é a tela ficar sem número.
    return { row: null, reason: HOLD_REASON.MULTIPLE_PERFORMANCE_CANDIDATES };
  }
  return { row: compatible[0], reason: null };
}

// ---------------------------------------------------------------------------
// Montagem das células
// ---------------------------------------------------------------------------

const sourceOf = (row) =>
  row
    ? {
        doc: row.sourceDoc || "",
        url: row.source || "",
        layer: row.sourceLayer ?? null,
        date: row.sourceDate || null,
        verifiedAt: row.verifiedAt || null,
      }
    : null;

const HOLD_CODES = new Set(Object.values(HOLD_REASON));

const emptyCell = (id, reason, extra = {}) => ({
  id,
  status: HOLD_CODES.has(reason) ? SPEC_STATUS.HELD : SPEC_STATUS.ABSENT,
  reason,
  value: null,
  pair: null,
  unit: null,
  origin: null,
  ...extra,
});

/**
 * Célula com valor. `pair` existe porque flex é dois números, e o protótipo
 * trata os dois como par simétrico em vez de eleger um principal. Par idêntico
 * colapsa em valor único — repetir 17,5 dos dois lados é ruído.
 */
const valueCell = (id, { value, pair, unit, confidence, scope, source, note, fuelBasis }) => {
  const collapsed =
    pair && pair.ethanol !== null && pair.ethanol === pair.gasoline ? pair.ethanol : null;

  return {
    id,
    status: SPEC_STATUS.VALUE,
    reason: null,
    origin: "factory",
    method: "catalog",
    value: collapsed ?? (pair ? null : (value ?? null)),
    pair: collapsed ? null : (pair ?? null),
    unit: unit ?? null,
    fuelBasis: fuelBasis ?? null,
    confidence: confidence || CONFIDENCE.EXPLICIT,
    scope: scope || null,
    source: source || null,
    note: note || "",
  };
};

const buildPair = (gasoline, ethanol) => {
  if (gasoline === null && ethanol === null) return null;
  if (gasoline !== null && ethanol === null) return null;
  if (gasoline === null && ethanol !== null) return null;
  return { gasoline, ethanol };
};

const num = (value) => (value === null || value === undefined ? null : Number(value));

/**
 * Potência declarada na própria string da FIPE — 8,3% das versões trazem
 * ("Palio EX 1.3 mpi Fire 8V 67cv 2p", "Lancer 2.0 16V 160cv Mec.").
 *
 * Serve de RECURSO quando a tabela de motores não responde, inclusive quando o
 * motivo é abstenção de aspiração. A abstenção existe para não servir a
 * potência do motor errado; aqui não há motor a acertar, o número está escrito
 * no nome do veículo. Reter um valor explícito por causa de uma chave que nem
 * seria consultada é esconder o que se sabe.
 *
 * Não substitui a tabela quando ela responde: lá vem par flex e rpm, aqui vem
 * um número só, sem combustível declarado.
 */
const fipeDeclaredPowerCell = (parsed, reason) => {
  const declarado = parsed?.declaredPowerCv;
  if (!declarado || !Number.isFinite(Number(declarado.value))) {
    return emptyCell("powerCv", reason);
  }

  return valueCell("powerCv", {
    value: Number(declarado.value),
    unit: "cv",
    confidence: declarado.confidence || CONFIDENCE.EXPLICIT,
    scope: MATCH_SCOPE.FIPE_DECLARED,
    source: { doc: "Tabela FIPE", url: "", layer: 2, date: null, verifiedAt: null },
    note: declarado.evidence || "",
  });
};

const powerCell = (match, parsed) => {
  const { row, scope, reason, override } = match;
  if (!row) return fipeDeclaredPowerCell(parsed, reason);

  const merged = { ...row, ...(override || {}) };
  const gasoline = num(merged.powerGasolineCv);
  const ethanol = num(merged.powerEthanolCv);
  const diesel = num(merged.powerDieselCv);

  if (gasoline === null && ethanol === null && diesel === null) {
    return fipeDeclaredPowerCell(parsed, ABSENT_REASON.FIELD_NOT_PUBLISHED);
  }

  const source = sourceOf(override || row);
  if (diesel !== null && gasoline === null && ethanol === null) {
    return valueCell("powerCv", {
      value: diesel,
      unit: "cv",
      fuelBasis: "diesel",
      scope,
      source,
      note: merged.engineFamily || "",
    });
  }

  return valueCell("powerCv", {
    value: ethanol ?? gasoline,
    pair: buildPair(gasoline, ethanol),
    unit: "cv",
    fuelBasis: buildPair(gasoline, ethanol) ? null : ethanol !== null ? "ethanol" : "gasoline",
    scope,
    source,
    note: merged.engineFamily || "",
  });
};

const torqueCell = (match) => {
  const { row, scope, reason, override } = match;
  if (!row) return emptyCell("torque", reason);

  const merged = { ...row, ...(override || {}) };
  const unit = merged.torqueUnit || null;
  const gasoline = num(merged.torqueGasoline);
  const ethanol = num(merged.torqueEthanol);
  const diesel = num(merged.torqueDiesel);

  if (gasoline === null && ethanol === null && diesel === null) {
    return emptyCell("torque", ABSENT_REASON.FIELD_NOT_PUBLISHED);
  }

  const source = sourceOf(override || row);
  if (diesel !== null && gasoline === null && ethanol === null) {
    return valueCell("torque", { value: diesel, unit, fuelBasis: "diesel", scope, source });
  }

  return valueCell("torque", {
    value: ethanol ?? gasoline,
    pair: buildPair(gasoline, ethanol),
    unit,
    fuelBasis: buildPair(gasoline, ethanol) ? null : ethanol !== null ? "ethanol" : "gasoline",
    scope,
    source,
  });
};

const performanceCell = (id, match, keys) => {
  const { row, reason } = match;
  if (!row) return emptyCell(id, reason);

  const single = num(row[keys.single]);
  const gasoline = num(row[keys.gasoline]);
  const ethanol = num(row[keys.ethanol]);

  if (single === null && gasoline === null && ethanol === null) {
    // Campo vazio porque NÓS não confiamos no que está publicado é outra frase
    // de "o fabricante não publicou". Ver ABSENT_REASON.SOURCE_DISPUTED.
    return emptyCell(
      id,
      (row.disputedFields || []).includes(id)
        ? ABSENT_REASON.SOURCE_DISPUTED
        : ABSENT_REASON.FIELD_NOT_PUBLISHED,
    );
  }

  return valueCell(id, {
    value: single ?? ethanol ?? gasoline,
    pair: single === null ? buildPair(gasoline, ethanol) : null,
    unit: keys.unit,
    fuelBasis:
      single !== null || buildPair(gasoline, ethanol)
        ? null
        : ethanol !== null
          ? "ethanol"
          : "gasoline",
    scope: MATCH_SCOPE.MODEL_VERIFIED,
    source: sourceOf(row),
  });
};

/** Campo que vem direto da string da FIPE, sem tabela nenhuma no meio. */
const parsedCell = (id, parsedField, unit = null) =>
  parsedField
    ? valueCell(id, {
        value: parsedField.value,
        unit,
        confidence: parsedField.confidence,
        scope: MATCH_SCOPE.MODEL_VERIFIED,
        source: { doc: "Tabela FIPE", url: "", layer: 4, date: null, verifiedAt: null },
        note: parsedField.evidence || "",
      })
    : emptyCell(id, ABSENT_REASON.NOT_WRITTEN_BY_FIPE);

/**
 * Ficha de fábrica completa de um carro da Garagem.
 *
 * @param {{brand?: string, model?: string, year?: string}} car
 * @param {{parsed?: object}} [options] parser já rodado, para não repetir
 */
export function getFactorySpecs(car, options = {}) {
  const parsed = options.parsed || parseFipeVersion(car);
  const engineMatch = matchEngineRow(parsed);
  const perfMatch = matchPerformanceRow(parsed);

  return {
    parsed,
    engineMatch,
    performanceMatch: perfMatch,
    fields: {
      powerCv: powerCell(engineMatch, parsed),
      torque: torqueCell(engineMatch),
      accel0to100S: performanceCell("accel0to100S", perfMatch, {
        single: "accel0to100Unico",
        gasoline: "accel0to100Gasoline",
        ethanol: "accel0to100Ethanol",
        unit: "s",
      }),
      topSpeedKmh: performanceCell("topSpeedKmh", perfMatch, {
        single: "topSpeedUnico",
        gasoline: "topSpeedGasoline",
        ethanol: "topSpeedEthanol",
        unit: "km/h",
      }),
      displacement: parsedCell("displacement", parsed.displacement, "L"),
      valves: parsedCell("valves", parsed.valves),
      aspiration:
        parsed.aspiration === null
          ? emptyCell("aspiration", HOLD_REASON.ASPIRATION_UNKNOWN)
          : parsedCell("aspiration", parsed.aspiration),
      fuel: parsedCell("fuel", parsed.fuel),
      transmission: parsedCell("transmission", parsed.transmission),
      doors: parsedCell("doors", parsed.body.doors),
      bodyStyle: parsedCell("bodyStyle", parsed.body.style),
      drivetrain: parsedCell("drivetrain", parsed.drivetrain),
      engineFamily: engineMatch.row
        ? valueCell("engineFamily", {
            value: (engineMatch.override || engineMatch.row).engineFamily || null,
            scope: engineMatch.scope,
            source: sourceOf(engineMatch.override || engineMatch.row),
          })
        : emptyCell("engineFamily", engineMatch.reason),
    },
  };
}
