/**
 * Trava contra a mentira mais cara deste projeto: FALHA DESENHADA COMO VAZIO.
 *
 *   npm run check:leitura
 *
 * Já aconteceu cinco vezes, e a sexta foi pega antes de doer:
 *
 *   - Eventos: a coleção não tinha regra, caía no deny padrão, e a tela dizia
 *     "Nenhum evento encontrado". A feature nunca funcionou em produção e
 *     ninguém percebeu, porque ausência e proibição desenham a mesma coisa.
 *   - Garagem: `getCars` fazia `catch { return getLocalCars() }`. Num aparelho
 *     sem cache — conta nova, navegador novo, troca de conta — a leitura
 *     falhava e a tela dizia "adicione seu primeiro carro" para o dono de sete
 *     carros. Em 27/08/2026 isso foi relatado como perda de dados; nada tinha
 *     sido apagado.
 *   - Mensagens: `subscribeConversations` e `subscribeMessages` faziam
 *     `callback([])` no erro. Duas conversas com 19 mensagens intactas no banco
 *     viraram uma caixa de entrada vazia.
 *   - Conquistas: um `new Set(["first_goal"])` escrito à mão mostrava conquista
 *     de terceiro no perfil de qualquer pessoa.
 *   - Conta trocada: em 28/08/2026 o dono entrou com o outro Google dele. A
 *     garagem estava legitimamente vazia NAQUELA conta, e a tela dizia só "A
 *     garagem está vazia" — sem dizer em qual conta. Dois dias procurando um
 *     bug que não existia; os sete carros estavam intactos na outra conta.
 *     Vazio de verdade também precisa de endereço.
 *   - Migracao que falha: a leitura da migracao era protegida, a ESCRITA nao.
 *     Um `batch.commit()` recusado subia ate o App, matava o efeito antes do
 *     `getCars()` e deixava `cars: []` com `carsError: null` — a tela do vazio
 *     legitimo, que desde 28/08/2026 nomeia a conta. O conserto anterior teria
 *     virado acusacao: culpar a conta por uma escrita que falhou.
 *
 * A regra que todas violam é a mesma: quando a leitura não aconteceu, a
 * tela não pode afirmar que não há nada. Ou mostra cache de verdade, ou diz
 * que falhou. Nunca inventa o vazio.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FALHA ${name}${detail ? `\n         ${detail}` : ""}`);
  }
};

const db = read("src/services/db.js");
const chat = read("src/services/chat.js");
const garagem = read("src/pages/Garagem.jsx");
const mensagens = read("src/pages/Messages.jsx");
const app = read("src/App.jsx");

// 1. O tipo de erro precisa existir e ser exportado: é o que separa "falhou"
//    de "está vazio" em todo o resto da cadeia.
check(
  "db.js exporta FalhaDeLeitura",
  /export class FalhaDeLeitura extends Error/.test(db),
);

// 2. O catch do getCars não pode voltar a devolver lista.
const catchGetCars = db.slice(
  db.indexOf("async getCars()"),
  db.indexOf("async getCars()") + 2000,
);
check(
  "getCars lanca quando a leitura falha e o cache esta vazio",
  /if \(cache\.length > 0\) return cache;/.test(catchGetCars) &&
    /throw new FalhaDeLeitura/.test(catchGetCars),
  "sem isso, leitura falhada volta a virar garagem vazia",
);
check(
  "getCars nao devolve getLocalCars() direto no catch",
  !/warnFirestoreFallback\("getCars", error\);\s*return getLocalCars\(\);/.test(db),
);

// 3. chat.js: erro tem de chegar em quem desenha.
const errosDeChat = chat.match(/callback\(\[\], error\)/g) || [];
check(
  "chat.js entrega o erro junto da lista vazia (2 assinaturas)",
  errosDeChat.length === 2,
  `achei ${errosDeChat.length}`,
);
check(
  "nenhum handler de erro do chat faz callback([]) mudo",
  !/console\.warn\("\[chat\][^)]*\);\s*callback\(\[\]\);/.test(chat),
);

// 4. As telas precisam ter o galho do erro, separado do galho do vazio.
check(
  "a Garagem desenha o erro de leitura, com botao",
  /loadError/.test(garagem) &&
    /cars\.length === 0 && loadError/.test(garagem) &&
    /cars\.length === 0 && !loadError/.test(garagem) &&
    /garage\.retry/.test(garagem),
  "erro e vazio nao podem cair no mesmo bloco",
);
// 4b. Vazio legitimo tem de dizer DE QUEM esta vazio. Sem o e-mail na tela,
//     "conta errada" e "perdi tudo" desenham a mesma coisa.
// Fatia o galho do vazio legitimo: o e-mail tem de aparecer LA DENTRO, e nao
// so existir como prop em algum lugar do arquivo.
const galhoVazio = garagem.slice(
  garagem.indexOf("cars.length === 0 && !loadError"),
);
check(
  "o vazio da Garagem identifica a conta logada",
  garagem.includes("cars.length === 0 && !loadError") &&
    /\{accountEmail && \(/.test(galhoVazio) &&
    /garage\.emptyAccount", \{ account: accountEmail \}/.test(galhoVazio) &&
    /garage\.emptyAccountHint/.test(galhoVazio),
  'vazio sem e-mail vira "sumiu tudo"',
);
check(
  "o App passa o e-mail da conta para a Garagem",
  /accountEmail=\{user\?\.email/.test(app),
);

// 4c. A migracao e oportunista: se ela estourar, a leitura ainda tem de
//     acontecer. Senao o vazio legitimo — o que agora nomeia a conta — vira a
//     tela de uma escrita que falhou, e passa a acusar a conta errada.
const migracao = db.slice(
  db.indexOf("async migrateLegacyData(userId)"),
  db.indexOf("async getCars()"),
);
check(
  "a ESCRITA da migracao esta protegida por try/catch",
  /from\("cars"\)\.upsert\(/.test(migracao) &&
    /\} catch \(error\) \{\s*warnFirestoreFallback\("migrateLegacyData\/escrita", error\);/.test(
      migracao,
    ),
  "gravação solta aborta o efeito do App antes do getCars()",
);
check(
  "migracao que falha nao impede o App de ler a garagem",
  /migrateLegacyData\(userId\)\.catch\(/.test(app),
  "sem o .catch, migracao quebrada = garagem vazia sem erro na tela",
);

check(
  "Mensagens separa 'falhou' de 'nao tem conversa'",
  /chatError/.test(mensagens) &&
    /&& chatError/.test(mensagens) &&
    /&& !chatError/.test(mensagens),
);

// 5. O App tem de ligar os dois e oferecer o retry — sem isso a tela de erro
//    existe no arquivo e nunca aparece.
check(
  "o App passa loadError e onRetry para a Garagem",
  /loadError=\{carsError\}/.test(app) && /onRetry=\{recarregarCarros\}/.test(app),
);
check(
  "as preferencias nao caem junto com a garagem (allSettled)",
  /Promise\.allSettled\(\[\s*engineDB\.getCars\(\)/.test(app),
  "com Promise.all, garagem falhando levava tema, idioma e regiao junto",
);

// 6. Os textos existem nos tres idiomas com bloco proprio.
const i18n = read("src/services/i18n.js");
for (const chave of ["loadFailedTitle", "loadFailedBody", "retry", "loadFailed", "loadFailedHint", "emptyAccount", "emptyAccountHint"]) {
  const n = (i18n.match(new RegExp(`^\\s+${chave}:`, "gm")) || []).length;
  check(`i18n tem ${chave} nos 3 idiomas`, n >= 3, `achei ${n}`);
}

console.log(
  failures === 0 ? "\ntudo verde\n" : `\n${failures} trava(s) quebrada(s)\n`,
);
process.exit(failures === 0 ? 0 : 1);
