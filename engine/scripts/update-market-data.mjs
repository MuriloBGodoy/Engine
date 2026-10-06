#!/usr/bin/env node

/**
 * Atualiza os números de mercado que o simulador usa e grava em
 * `src/services/market-data.json`.
 *
 * Por que existe: preço de combustível e taxa de juros moravam como constantes
 * no código, medidas à mão uma vez (combustível em 14/08/2026, juros em agosto)
 * e envelhecendo em silêncio. Agora saem da fonte toda semana — ver o workflow
 * `.github/workflows/market-data.yml`, que roda este script e faz commit quando
 * algo muda.
 *
 * Fontes (as duas públicas, sem chave):
 *   - ANP, levantamento semanal de preços, posto a posto, últimas 4 semanas:
 *       .../shpc/qus/ultimas-4-semanas-gasolina-etanol.csv
 *       .../shpc/qus/ultimas-4-semanas-diesel-gnv.csv
 *     `dadosabertos.anp.gov.br` NÃO resolve; o caminho que funciona é o gov.br.
 *   - Banco Central, SGS 25471: taxa média mensal de juros, aquisição de
 *     veículos, pessoa física (% a.m.).
 *
 * O método é o mesmo da medição manual de 14/08/2026 (SIMULADOR-FONTES.md):
 * média simples do preço de venda dos postos; fator por UF = média da UF ÷
 * média nacional, com tabelas SEPARADAS para gasolina e etanol (formação de
 * preço diferente). UF com menos de MIN_STATIONS postos fica fora da tabela de
 * fator e cai na média nacional — foi o caso do etanol no AP (3 postos).
 *
 * Falha de uma fonte NÃO apaga o dado anterior dela: o arquivo mantém o último
 * valor bom e só a parte que respondeu é atualizada. Se nada respondeu, o
 * script sai com erro e não escreve nada.
 *
 * Uso:
 *   node scripts/update-market-data.mjs           # baixa e grava
 *   node scripts/update-market-data.mjs --check   # baixa e só mostra
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "src", "services", "market-data.json");
const CHECK_ONLY = process.argv.includes("--check");

const ANP_BASE = "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/qus";
const ANP_GAS_ETHANOL = `${ANP_BASE}/ultimas-4-semanas-gasolina-etanol.csv`;
const ANP_DIESEL = `${ANP_BASE}/ultimas-4-semanas-diesel-gnv.csv`;
const BCB_RATE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.25471/dados/ultimos/1?formato=json";

const MIN_STATIONS = 10;
// Produto como a ANP escreve -> combustível do simulador. Aditivada fica de
// fora: é a comum que serve de referência.
const PRODUCTS = { GASOLINA: "gasoline", ETANOL: "ethanol", "DIESEL S10": "diesel" };

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (engine market-data)" } });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  // O CSV da ANP é Latin-1 em alguns arquivos; os campos que usamos (UF,
  // produto, data, preço) são ASCII, então decodificar como latin1 é seguro.
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString("latin1");
}

/** Lê o CSV da ANP e soma preço e contagem por produto e por UF. */
function accumulate(csv, acc) {
  const lines = csv.split(/\r?\n/);
  const header = lines[0].replace(/^[^A-Za-z]+/, "").split(";");
  const col = (name) => header.findIndex((h) => h.trim() === name);
  const iUf = col("Estado - Sigla");
  const iProduct = col("Produto");
  const iDate = col("Data da Coleta");
  const iPrice = col("Valor de Venda");
  if ([iUf, iProduct, iDate, iPrice].some((i) => i < 0)) {
    throw new Error(`cabeçalho da ANP mudou: ${header.join(" | ")}`);
  }
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split(";");
    const fuel = PRODUCTS[cells[iProduct]?.trim()];
    if (!fuel) continue;
    const price = Number(String(cells[iPrice]).replace(",", "."));
    if (!(price > 0)) continue;
    const uf = cells[iUf].trim();
    const [d, m, y] = cells[iDate].trim().split("/");
    const iso = `${y}-${m}-${d}`;
    const bucket = (acc[fuel] ||= { sum: 0, n: 0, byUf: {}, from: iso, to: iso });
    bucket.sum += price;
    bucket.n += 1;
    const ufBucket = (bucket.byUf[uf] ||= { sum: 0, n: 0 });
    ufBucket.sum += price;
    ufBucket.n += 1;
    if (iso < bucket.from) bucket.from = iso;
    if (iso > bucket.to) bucket.to = iso;
  }
}

function summarize(bucket) {
  const national = bucket.sum / bucket.n;
  const factors = {};
  for (const [uf, { sum, n }] of Object.entries(bucket.byUf).sort()) {
    if (n >= MIN_STATIONS) factors[uf] = round(sum / n / national, 2);
  }
  return { national: round(national, 2), stations: bucket.n, factors, from: bucket.from, to: bucket.to };
}

async function main() {
  const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const next = { ...previous };
  let anyUpdated = false;

  // ---- combustível
  try {
    const acc = {};
    accumulate(await fetchText(ANP_GAS_ETHANOL), acc);
    try {
      accumulate(await fetchText(ANP_DIESEL), acc);
    } catch (error) {
      console.error(`diesel: ${error.message} — mantém o anterior`);
    }
    const fuel = { ...(previous.fuel || {}) };
    for (const key of ["gasoline", "ethanol", "diesel"]) {
      if (acc[key]?.n) fuel[key] = summarize(acc[key]);
    }
    fuel.source = "ANP — levantamento semanal de preços, últimas 4 semanas";
    next.fuel = fuel;
    anyUpdated = true;
  } catch (error) {
    console.error(`combustível: ${error.message} — mantém o anterior`);
  }

  // ---- juros
  try {
    const res = await fetch(BCB_RATE);
    if (!res.ok) throw new Error(`${res.status}`);
    const [last] = await res.json();
    const [, m, y] = last.data.split("/");
    next.rate = {
      monthlyPct: Number(last.valor),
      month: `${y}-${m}`,
      source: "Banco Central, SGS 25471 — juros médios, aquisição de veículos, PF",
    };
    anyUpdated = true;
  } catch (error) {
    console.error(`juros: ${error.message} — mantém o anterior`);
  }

  if (!anyUpdated) {
    console.error("nenhuma fonte respondeu; nada foi escrito");
    process.exit(1);
  }

  const summary = {
    gasolina: next.fuel?.gasoline && `${next.fuel.gasoline.national} (${next.fuel.gasoline.stations} postos)`,
    etanol: next.fuel?.ethanol && `${next.fuel.ethanol.national} (${next.fuel.ethanol.stations} postos)`,
    diesel: next.fuel?.diesel && `${next.fuel.diesel.national} (${next.fuel.diesel.stations} postos)`,
    coleta: next.fuel?.gasoline && `${next.fuel.gasoline.from} a ${next.fuel.gasoline.to}`,
    juros: next.rate && `${next.rate.monthlyPct}% a.m. (${next.rate.month})`,
  };
  console.log(summary);

  if (CHECK_ONLY) return;
  // Só reescreve se algo mudou — o workflow usa o diff do git para decidir se
  // faz commit, e um carimbo de data sozinho geraria commit toda semana.
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  if (fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === serialized) {
    console.log("sem mudança");
    return;
  }
  fs.writeFileSync(OUT, serialized);
  console.log(`gravado em ${path.relative(process.cwd(), OUT)}`);
}

main();
