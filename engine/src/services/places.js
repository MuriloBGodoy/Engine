// Cidade: comparar, sugerir e gravar sempre do mesmo jeito.
//
// O PROBLEMA QUE ISTO RESOLVE. Até 14/11/2026 a cidade era texto livre em
// toda tela do app: perfil, anúncio de serviço, clube, orçamento. Cada um
// escrevia do seu jeito — "Araraquara", "araraquara", "ARARAQUARA",
// "Araraquara-SP", "Araraquara " — e os filtros comparavam string com string
// (`listing.city === escolhida`). Resultado: filtrar por cidade quase nunca
// achava nada, e como o Serviços tem proteção anti-tela-vazia (se o filtro
// zera, ele mostra tudo), a tela respondia com o catálogo inteiro. Para quem
// usa, o filtro de cidade simplesmente "não funcionava".
//
// Duas metades, e as duas são necessárias:
//
//   - `cityKey` conserta o passado: compara pelo nome sem acento, sem caixa,
//     sem o "-SP" grudado no fim. Os dados que já estão no banco escritos de
//     qualquer jeito passam a casar.
//   - `buscarCidades` conserta o futuro: o campo vira lista, a pessoa escolhe
//     um nome da tabela do IBGE e todo mundo da mesma cidade grava a MESMA
//     string.
//
// Fora do Brasil continua texto livre: não existe tabela equivalente para os
// doze países do seletor, e exigir uma lista que não temos seria pior do que
// deixar escrever.

import { getStates } from "./locations";

/**
 * Chave de comparação de cidade.
 *
 * "São Paulo", "sao paulo", "SÃO PAULO - SP" e " São  Paulo/SP " viram todas
 * `sao paulo`. O sufixo de UF sai porque muita gente escreve a cidade com o
 * estado colado, e no Engine o estado já é um campo à parte.
 */
export function cityKey(nome = "") {
  return String(nome)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    // "cidade/SP", "cidade - sp", "cidade, sp" no fim da string.
    .replace(/\s*[/,-]\s*[a-z]{2}\s*$/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Duas grafias da mesma cidade? Vazio nunca casa com nada. */
export function sameCity(a, b) {
  const ka = cityKey(a);
  return !!ka && ka === cityKey(b);
}

// Cache por UF: a lista é imutável, então basta cortar a string uma vez.
const cache = new Map();
let tabela = null;
let carregando = null;

async function tabelaBR() {
  if (tabela) return tabela;
  if (!carregando) {
    // `import()` dinâmico: os 73 KB da tabela só descem para quem abre um
    // campo de cidade, e ficam fora do pacote inicial do app.
    carregando = import("./cities-br.js").then((mod) => {
      tabela = mod.MUNICIPIOS_BR;
      return tabela;
    });
  }
  return carregando;
}

/**
 * Municípios de uma UF, em ordem alfabética. Só Brasil; para os outros países
 * devolve as poucas cidades do dataset de locations, que servem de sugestão
 * sem fingir ser lista completa.
 */
export async function cidadesDe(countryCode, stateCode) {
  if (!stateCode || stateCode === "all") return [];
  if (countryCode !== "BR") {
    return getStates(countryCode).find((s) => s.code === stateCode)?.cities || [];
  }
  const chave = `BR:${stateCode}`;
  if (cache.has(chave)) return cache.get(chave);
  const todas = await tabelaBR();
  const lista = (todas[stateCode] || "").split("|").filter(Boolean);
  cache.set(chave, lista);
  return lista;
}

/**
 * Busca dentro da UF. Casa por prefixo E por pedaço do meio, com acento
 * ignorado: "sao jose" acha "São José do Rio Preto", "ribeirao" acha
 * "Ribeirão Preto". Prefixo vem primeiro — quem digita "San" quer Santos
 * antes de "Cabo de Santo Agostinho".
 */
export async function buscarCidades(countryCode, stateCode, termo, limite = 8) {
  const lista = await cidadesDe(countryCode, stateCode);
  const alvo = cityKey(termo);
  if (!alvo) return lista.slice(0, limite);
  const comecam = [];
  const contem = [];
  for (const nome of lista) {
    const k = cityKey(nome);
    if (k.startsWith(alvo)) comecam.push(nome);
    else if (k.includes(alvo)) contem.push(nome);
    if (comecam.length >= limite) break;
  }
  return [...comecam, ...contem].slice(0, limite);
}

/**
 * O nome oficial correspondente ao que a pessoa escreveu, ou o texto dela se
 * a cidade não estiver na tabela (fora do Brasil, ou digitada errado).
 *
 * É isto que faz o filtro funcionar daqui para a frente: a tela grava sempre
 * a grafia do IBGE.
 */
export async function nomeOficial(countryCode, stateCode, texto) {
  const escrito = String(texto || "").trim();
  if (!escrito) return "";
  const lista = await cidadesDe(countryCode, stateCode);
  return lista.find((nome) => sameCity(nome, escrito)) || escrito;
}

/**
 * A UF de uma cidade, quando o nome é único no país inteiro.
 *
 * Serve para o conteúdo antigo, gravado só com cidade e sem estado: dá para
 * colocá-lo no mapa sem pedir nada a ninguém. Nome repetido (há 23 "Bom
 * Jesus" no Brasil) devolve null — chutar seria pior.
 */
let indiceNacional = null;
export async function ufDaCidade(nome) {
  const alvo = cityKey(nome);
  if (!alvo) return null;
  if (!indiceNacional) {
    const todas = await tabelaBR();
    indiceNacional = new Map();
    for (const [uf, texto] of Object.entries(todas)) {
      for (const cidade of texto.split("|")) {
        const k = cityKey(cidade);
        const atual = indiceNacional.get(k);
        if (atual === undefined) indiceNacional.set(k, uf);
        else if (atual !== uf) indiceNacional.set(k, null); // ambígua
      }
    }
  }
  return indiceNacional.get(alvo) ?? null;
}
