/**
 * Gera `src/services/emojis.js` a partir do arquivo oficial do Unicode
 * (emoji-test.txt). Escrever emoji na mão é como escrever acentuação na mão:
 * o que falta só aparece quando alguém procura e não acha.
 *
 * Três filtros, e cada um tem uma razão:
 *
 *  - **Só `fully-qualified`.** As outras formas existem no arquivo justamente
 *    porque são escritas SEM o seletor de apresentação; coladas num texto
 *    elas podem sair como símbolo preto-e-branco.
 *  - **Nada acima de E14.0.** O aparelho desenha o emoji com a fonte DELE.
 *    Um emoji de 2023 num celular de 2021 vira quadradinho vazio — e quem
 *    manda não vê o quadradinho, quem recebe é que vê.
 *  - **Sem tom de pele e sem bandeira de país.** Os tons multiplicam a lista
 *    por cinco (são entradas separadas no arquivo) e pedem uma interface
 *    própria para escolher o tom; as bandeiras de país são 270 itens que
 *    ninguém procura num chat de carro. Ficam as de corrida e afins.
 *
 * Uso:  node scripts/generate-emojis.mjs caminho/para/emoji-test.txt
 */
import { readFileSync, writeFileSync } from "node:fs";

const VERSAO_MAXIMA = 14.0;
const TONS = /[\u{1F3FB}-\u{1F3FF}]/u;

// Grupo do Unicode -> grupo nosso. O que não está aqui é descartado.
const GRUPOS = {
  "Smileys & Emotion": "rostos",
  "People & Body": "pessoas",
  "Animals & Nature": "natureza",
  "Food & Drink": "comida",
  "Travel & Places": "viagem",
  Activities: "atividades",
  Objects: "objetos",
  Symbols: "simbolos",
};

// A casa primeiro: é um app de carro. Estes saem da ordem do Unicode e vão
// para o topo, na ordem em que alguém falaria deles.
const GARAGEM = [
  "🚗", "🏎️", "🚙", "🛻", "🏍️", "🛵",
  "🚐", "🚚", "🚜", "🏁", "🛞", "⛽",
  "🔧", "🛠️", "⚙️", "🔩", "🪛", "🔋",
  "🚨", "🚦", "🛣️", "🗺️", "🧰", "🧯",
];

const entrada = process.argv[2];
if (!entrada) throw new Error("falta o caminho do emoji-test.txt");

const linhas = readFileSync(entrada, "utf8").split(/\r?\n/);
const grupos = new Map(Object.values(GRUPOS).map((chave) => [chave, []]));
const vistos = new Set(GARAGEM);

let grupoAtual = "";
let subgrupoAtual = "";

for (const linha of linhas) {
  const grupo = linha.match(/^# group: (.+)$/);
  if (grupo) { grupoAtual = grupo[1].trim(); continue; }
  const subgrupo = linha.match(/^# subgroup: (.+)$/);
  if (subgrupo) { subgrupoAtual = subgrupo[1].trim(); continue; }
  if (!linha || linha.startsWith("#")) continue;

  const item = linha.match(/;\s*fully-qualified\s*#\s*(\S+)\s+E(\d+\.\d+)\s/);
  if (!item) continue;

  const [, emoji, versao] = item;
  const nosso =
    GRUPOS[grupoAtual] || (grupoAtual === "Flags" && subgrupoAtual === "flag" ? "simbolos" : null);
  if (!nosso) continue;
  if (Number(versao) > VERSAO_MAXIMA) continue;
  if (TONS.test(emoji)) continue;
  if (vistos.has(emoji)) continue;

  vistos.add(emoji);
  grupos.get(nosso).push(emoji);
}

const bloco = (lista) => {
  const linhasDeSeis = [];
  for (let i = 0; i < lista.length; i += 12) {
    linhasDeSeis.push("    " + lista.slice(i, i + 12).map((e) => JSON.stringify(e)).join(", "));
  }
  return linhasDeSeis.join(",\n");
};

const partes = [
  { key: "garagem", lista: GARAGEM },
  ...Object.values(GRUPOS).map((chave) => ({ key: chave, lista: grupos.get(chave) })),
];

const saida = `/**
 * A lista de emojis do app, por grupo e na ordem do Unicode (CLDR) — a mesma
 * dos teclados, para quem procura achar onde o dedo já sabe.
 *
 * GERADO por \`node scripts/generate-emojis.mjs emoji-test.txt\` a partir do
 * arquivo oficial do Unicode. Não edite na mão: edite o script e gere de novo.
 *
 * Fora da lista, de propósito: emoji acima do Emoji 14.0 (vira quadradinho em
 * aparelho mais velho, e quem manda não vê o quadradinho), tons de pele (são
 * entradas separadas e pedem interface própria) e as 270 bandeiras de país.
 */

export const EMOJI_GRUPOS = [
${partes.map((p) => `  {\n    key: ${JSON.stringify(p.key)},\n    emojis: [\n${bloco(p.lista)},\n    ],\n  },`).join("\n")}
];

/** Todos, em ordem, para a busca e para contar. */
export const EMOJIS = EMOJI_GRUPOS.flatMap((grupo) => grupo.emojis);
`;

writeFileSync("src/services/emojis.js", saida, "utf8");
for (const p of partes) console.log(String(p.lista.length).padStart(5), p.key);
console.log(String(partes.reduce((s, p) => s + p.lista.length, 0)).padStart(5), "TOTAL");
