/**
 * Erro não pode aparecer em verde.
 *
 * O `toast(mensagem)` assume tom de SUCESSO quando ninguém diz o contrário —
 * é o certo para o caso comum ("Salvo!"), e é uma armadilha para o `catch`:
 * esquecer o segundo argumento não quebra nada, não acusa no lint e não
 * aparece em teste nenhum. O app mostra "Não foi possível abrir o
 * gerenciamento." com um tique verde de "deu certo", e quem lê acredita no
 * desenho, não no texto.
 *
 * Em 17/11/2026 eram 18 chamadas assim, em 3 arquivos. Corrigir as 18 não
 * impede a 19ª — por isso este script.
 *
 * A regra: toda chamada a `toast(...)` DENTRO de um `catch` precisa declarar
 * o tom ("error", "info" ou `tone:`). Fora do catch não se mexe.
 *
 * Uso: npm run check:toasts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const RAIZ = "src";
const TONS = ['"error"', "'error'", '"info"', "'info'", "tone:"];

function* arquivos(pasta) {
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) yield* arquivos(caminho);
    else if (/\.jsx?$/.test(nome)) yield caminho.split(sep).join("/");
  }
}

const recuoDe = (linha) => linha.length - linha.trimStart().length;

const achados = [];

for (const caminho of arquivos(RAIZ)) {
  const linhas = readFileSync(caminho, "utf8").split("\n");

  linhas.forEach((linha, i) => {
    if (!/\bcatch\b/.test(linha)) return;

    // O corpo do catch vai até a linha que fecha no mesmo recuo.
    const recuo = recuoDe(linha);
    const corpo = [];
    for (let j = i + 1; j < linhas.length; j += 1) {
      const atual = linhas[j];
      if (atual.trim() && recuoDe(atual) <= recuo && atual.trimStart().startsWith("}")) break;
      corpo.push([j, atual]);
    }

    for (let k = 0; k < corpo.length; k += 1) {
      const [numero, texto] = corpo[k];
      if (!/\btoast\(/.test(texto)) continue;

      // Junta a chamada inteira quando ela ocupa várias linhas.
      let trecho = texto;
      let m = k;
      const abertos = (s) => (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
      while (abertos(trecho) > 0 && m + 1 < corpo.length) {
        m += 1;
        trecho += `\n${corpo[m][1]}`;
      }
      k = m;

      if (!TONS.some((tom) => trecho.includes(tom))) {
        achados.push({ caminho, numero: numero + 1, trecho: texto.trim() });
      }
    }
  });
}

if (achados.length === 0) {
  console.log("check:toasts  ok — todo toast dentro de catch declara o tom.");
  process.exit(0);
}

console.error(`check:toasts  ${achados.length} erro(s) mostrados como sucesso:\n`);
for (const { caminho, numero, trecho } of achados) {
  console.error(`  ${caminho}:${numero}`);
  console.error(`    ${trecho}`);
}
console.error('\nFalta o tom: toast(mensagem, "error").');
process.exit(1);
