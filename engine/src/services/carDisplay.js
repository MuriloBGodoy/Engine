/**
 * Como um carro aparece na TELA. Dado continua como veio da FIPE; aqui só se
 * decide a forma de mostrar.
 *
 * Nasceu na auditoria de 25/09/2026 com dois defeitos da mesma família:
 *
 * - Todo carro zero-km aparecia com o ano "32000" — no select do cadastro
 *   ("32000 Flex") e no card da garagem ("FIAT · 32000 FLEX"). 32000 é a
 *   sentinela da FIPE para zero quilômetro; `fipeVersion.js` já sabia disso
 *   (`FIPE_ZERO_KM_YEAR`), mas cada tela mostrava o texto cru.
 * - "VW - VolksWagen Gol…" no modal de gastos e no Painel: a correção do
 *   feed (02/09) ficou num helper local da Comunidade e não chegou lá.
 */
import { normalizeFipeBrand } from "./fipeVersion";

const FIPE_ZERO_KM = /^32000\b/;

/** "32000 Flex" → "0 km Flex"; "2023 Gasolina" fica como está. */
export function formatFipeYear(raw, zeroKmLabel = "0 km") {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  return text.replace(FIPE_ZERO_KM, zeroKmLabel);
}

/** "VW - VolksWagen" → "Volkswagen"; o resto passa como veio. */
export function formatCarBrand(raw) {
  return normalizeFipeBrand(raw) || String(raw ?? "").trim();
}

/**
 * O NOME que o carro usa na tela: o apelido quando o dono deu um, senão
 * marca + modelo.
 *
 * Existe porque "Bruxa" e "Chevrolet Corsa Wind" não competem — um é como o
 * dono chama o carro, o outro é o que o carro é. Onde cabe uma linha só (card
 * da garagem, lembrete, lista de orçamento), vai o apelido; onde cabem duas,
 * o apelido em cima e `formatCarName` embaixo, que é o papel de
 * `carSubtitle`.
 */
export function carTitle(car = {}) {
  const nick = String(car.nickname ?? "").trim();
  return nick || formatCarName(car);
}

/**
 * A linha de baixo: o nome técnico, mas só quando a de cima é o apelido.
 * Sem apelido devolve "" — repetir "Corsa Wind" embaixo de "Corsa Wind" é
 * ruído.
 */
export function carSubtitle(car = {}) {
  return String(car.nickname ?? "").trim() ? formatCarName(car) : "";
}

/** Marca normalizada + modelo, sem repetir a marca quando o modelo já a traz. */
export function formatCarName(car = {}) {
  const brand = formatCarBrand(car.brand);
  const model = String(car.model ?? "").trim();
  if (!brand) return model;
  if (!model) return brand;
  if (model.toLowerCase().startsWith(brand.toLowerCase())) return model;
  return `${brand} ${model}`;
}
