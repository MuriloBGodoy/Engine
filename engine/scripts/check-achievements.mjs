/**
 * Travas do sistema de conquistas.
 *
 *   npm run check:achievements
 *
 * Duas coisas separadas:
 *
 * 1. A lógica dos degraus, que é pura e decide o que a tela mostra.
 * 2. Que a lista de ids do serviço é IDÊNTICA à lista fechada do banco (o
 *    `check` da tabela `achievements`, em supabase/migrations). Essa é a mais
 *    importante: são duas cópias da mesma verdade, em linguagens diferentes, e o servidor nega calado o id que não estiver na
 *    dele. Sem esta trava, acrescentar uma conquista só no JavaScript daria uma
 *    feature que parece pronta e é negada em produção — foi exatamente assim
 *    que a coleção `events` passou meses sem funcionar.
 *
 * O comportamento no banco (dedup, lista fechada, revogação, data carimbada) é
 * testado de verdade em `npm run check:rls`.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(ROOT, "..");

const {
  LIKE_TIERS,
  MILESTONE_IDS,
  ACHIEVEMENT_IDS,
  likeTierId,
  visibleLikeTiers,
  earnedLikeTiers,
  postBadgeTier,
  garageAchievementIds,
  longestMonthStreak,
  categoryOf,
  ACHIEVEMENT_CATALOG,
} = await import(pathToFileURL(path.join(ROOT, "src/services/achievementTiers.js")).href);

let falhas = 0;
const check = (nome, ok, detalhe = "") => {
  if (ok) {
    console.log(`  ok   ${nome}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${nome}${detalhe ? `\n         ${detalhe}` : ""}`);
  }
};
const igual = (nome, obtido, esperado) =>
  check(
    nome,
    JSON.stringify(obtido) === JSON.stringify(esperado),
    `obtive ${JSON.stringify(obtido)}, esperava ${JSON.stringify(esperado)}`,
  );

console.log("\nconquistas\n");

// --- os ids batem com a lista fechada do banco
// A lista mora no `check` da coluna `achievements.achievement_id`. Vale a
// definição MAIS RECENTE: migração nova que mexer na lista substitui a velha,
// então as migrações são lidas em ordem e a última ocorrência vence.
const PASTA_MIGRACOES = path.join(REPO, "supabase", "migrations");
const migracoes = fs
  .readdirSync(PASTA_MIGRACOES)
  .filter((nome) => nome.endsWith(".sql"))
  .sort()
  .map((nome) => fs.readFileSync(path.join(PASTA_MIGRACOES, nome), "utf8"))
  .join(" ");
const definicoes = [...migracoes.matchAll(/achievement_id in \(([\s\S]*?)\)\)/g)];
const naRegra = [...(definicoes.at(-1)?.[1] || "").matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
igual("a lista de ids do serviço é idêntica à da regra", ACHIEVEMENT_IDS, naRegra);

// --- a régua
//
// Catálogo ampliado em 06/10/2026: os dez ids antigos têm de continuar
// existindo com o MESMO nome, senão quem já tinha conquistado perde o selo.
const ANTIGOS = [
  "first_goal", "first_conquest", "owned_car", "followers_1000",
  "likes_1000", "likes_10000", "likes_50000", "likes_100000", "likes_500000", "likes_1000000",
];
igual("nenhum id antigo sumiu", ANTIGOS.filter((id) => !ACHIEVEMENT_IDS.includes(id)), []);
igual("nenhum id repetido", ACHIEVEMENT_IDS.length, new Set(ACHIEVEMENT_IDS).size);
check("todo id tem categoria", ACHIEVEMENT_IDS.every((id) => categoryOf(id)));
igual(
  "as seis categorias, na ordem da aba",
  ACHIEVEMENT_CATALOG.map((c) => c.key),
  ["garage", "logbook", "community", "clubs", "events", "simulator"],
);
igual("a escada de curtidas começa pequena", LIKE_TIERS, [
  10, 50, 100, 500, 1000, 10000, 50000, 100000, 500000, 1000000,
]);
check("os marcos antigos continuam marcos", ["first_goal", "first_conquest", "owned_car"].every((id) => MILESTONE_IDS.includes(id)));
check("o id do degrau é o esperado pela regra", likeTierId(1000) === "likes_1000");

// --- "um degrau à frente": nunca seção vazia, nunca a escada inteira
igual("com zero curtidas mostra o primeiro degrau (seção não nasce vazia)", visibleLikeTiers(0), [10]);
igual("com as 11 curtidas reais de hoje, 10 batido e 50 à frente", visibleLikeTiers(11), [10, 50]);
igual("faltando uma para 1k, o degrau à frente é 1k", visibleLikeTiers(999), [10, 50, 100, 500, 1000]);
igual("com 12.400, 50k à frente", visibleLikeTiers(12400), [10, 50, 100, 500, 1000, 10000, 50000]);
igual("no topo não existe 'próximo' para inventar", visibleLikeTiers(5000000), LIKE_TIERS);

// --- conquistado é diferente de visível
igual("conquistado não inclui o degrau à frente", earnedLikeTiers(12400), [10, 50, 100, 500, 1000, 10000]);
igual("com 9 curtidas não se conquistou nada", earnedLikeTiers(9), []);

// --- o selo do post continua só a partir de 1k (os degraus pequenos são do perfil)
check("post com 500 não ganha selo", postBadgeTier(500) === null);
check("post com 1.500 mostra o de 1k", postBadgeTier(1500) === 1000);
check("post com 12.400 mostra o de 10k, não o de 1k", postBadgeTier(12400) === 10000);
check("post no topo mostra o de 1M", postBadgeTier(2000000) === 1000000);

// --- sequência de meses com aporte
igual("sem aporte, sequência zero", longestMonthStreak([]), 0);
igual("três meses seguidos", longestMonthStreak(["2026-01", "2026-02", "2026-03"]), 3);
igual("virada de ano conta como seguido", longestMonthStreak(["2025-11", "2025-12", "2026-01"]), 3);
igual("buraco quebra a sequência", longestMonthStreak(["2026-01", "2026-02", "2026-04", "2026-05", "2026-06"]), 3);
igual("dois aportes no mesmo mês contam um mês", longestMonthStreak(["2026-01", "2026-01", "2026-02"]), 2);

// --- o que a garagem dá
const meses = (n) =>
  Array.from({ length: n }, (_, i) => ({ amount: 100, date: `2026-${String(i + 1).padStart(2, "0")}-10` }));
igual("garagem vazia não dá nada", garageAchievementIds([]), []);
igual(
  "meta com metade guardada e 6 meses de aporte",
  garageAchievementIds([{ type: "goal", targetValue: 100, savedValue: 50, contributions: meses(6) }]),
  ["first_goal", "halfway", "first_contribution", "streak_3", "streak_6"],
);
check(
  "meta com menos da metade não é meio caminho",
  !garageAchievementIds([{ type: "goal", targetValue: 100, savedValue: 49 }]).includes("halfway"),
);
check(
  "carro próprio NÃO conta como meio caminho de meta",
  !garageAchievementIds([{ type: "owned", targetValue: 100, savedValue: 100 }]).includes("halfway"),
);
igual(
  "carro próprio com 12 gastos, consumo medido e simulação",
  garageAchievementIds(
    [{ type: "owned", targetValue: 0, expenses: Array.from({ length: 12 }, () => ({})), ownership: {} }],
    { hasMeasuredConsumption: true },
  ),
  ["owned_car", "first_expense", "expenses_10", "measured_consumption", "first_simulation"],
);
check(
  "todo id que a garagem devolve está na lista da regra",
  garageAchievementIds(
    [{ type: "goal", targetValue: 1, savedValue: 1, contributions: meses(12), expenses: Array(100).fill({}), ownership: {} }],
    { hasMeasuredConsumption: true },
  ).every((id) => ACHIEVEMENT_IDS.includes(id)),
);

// --- os fios estão ligados?
//
// A trava contra o defeito mais provável desta feature: o sistema inteiro
// existir, com teste e tudo, e NADA chamá-lo. Foi assim que a coleção `events`
// passou meses parecendo pronta. Aqui não se testa comportamento — se testa que
// o gatilho existe no lugar onde a conquista tem que acontecer.
const db = fs.readFileSync(path.join(ROOT, "src/services/db.js"), "utf8");
const perfil = fs.readFileSync(path.join(ROOT, "src/pages/UserProfile.jsx"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "src/App.jsx"), "utf8");
const servico = fs.readFileSync(path.join(ROOT, "src/services/achievements.js"), "utf8");
const clubes = fs.readFileSync(path.join(ROOT, "src/services/clubs.js"), "utf8");
const eventos = fs.readFileSync(path.join(ROOT, "src/services/events.js"), "utf8");

// Procura a CHAMADA (`this.x(`), nunca o nome solto: a definição do método
// contém o nome também, então `db.includes("x(")` continuava verdadeiro com a
// chamada apagada. As duas primeiras travas nasceram assim e passaram verdes na
// mutação — o método existia, ninguém invocava, e o teste dizia que estava tudo
// certo.
const ligacoes = [
  // Sem await de propósito: o aviso de curtida sai antes, a conquista depois.
  ["curtir concede degrau ao dono do post", db, "this.concederDegrausDeCurtida(goalData.ownerId, goalData.title);"],
  ["o degrau usa a contagem das curtidas, não o likesCount", db, "await this.countLikesReceived("],
  ["seguir confere a série de seguidores", db, 'grantSeries(targetUserId, "followers", total)'],
  ["a garagem usa o cálculo puro", db, "garageAchievementIds(cars, {"],
  ["publicar dá primeiro post", db, 'grantOwn("first_post")'],
  ["comentar dá primeiro comentário", db, 'grantOwn("first_comment")'],
  ["criar clube dá fundador", clubes, 'grantOwn("club_founder")'],
  ["entrar em clube dá a conquista", clubes, 'grantOwn("club_joined")'],
  ["aprovar pedido dá a conquista a quem entrou", clubes, 'grantAchievement(alvoUid, "club_joined")'],
  // Conta as linhas de membro, nunca o `member_count` de vitrine.
  ["membros do clube contam as linhas de membro", clubes, 'from("club_members").select("*", { count: "exact", head: true }).eq("club_id", String(clubId))'],
  ["entrar ou ser aprovado confere os membros do fundador", clubes, "concederMembrosAoFundador(clubId, club.founderId);"],
  ["postar no mural do clube dá a conquista", clubes, 'grantOwn("club_first_post")'],
  ["criar evento dá organizador", eventos, 'grantOwn("event_organizer")'],
  ["confirmar presença dá a conquista", eventos, 'grantOwn("event_rsvp")'],
  ["confirmados contam para quem organizou", eventos, 'grantSeries(String(organizer), "event_attendees", total)'],
  ["a garagem concede os marcos próprios", db, "this.sincronizarMarcosDaGaragem(cars)"],
  ["o perfil lê as conquistas de verdade", perfil, "listAchievements(userProfile.userId)"],
  ["o perfil conta as curtidas recebidas", perfil, "engineDB.countLikesReceived("],
];
for (const [nome, fonte, trecho] of ligacoes) {
  check(nome, fonte.includes(trecho), `não achei: ${trecho}`);
}
check("não sobrou TODO de ligação no perfil", !/TODO:\s*ligar/i.test(perfil));

// O andaime que sobreviveu ao commit: a aba nasceu recebendo
// `unlocked={new Set(["first_goal"])} likesReceived={11}` enquanto a camada de
// dados não existia, e assim TODO perfil mostrava o mesmo selo e o mesmo 11 —
// que era o total de curtidas do banco inteiro, de ninguém. Passou verde em
// tudo, porque a tela estava certa e o número era plausível.
check(
  "a aba não recebe conquista escrita à mão",
  !/unlocked=\{new Set\(/.test(perfil),
  "props de exemplo voltaram ao lugar do dado real",
);
check(
  "a aba não recebe contagem de curtida escrita à mão",
  !/likesReceived=\{\d/.test(perfil),
  "props de exemplo voltaram ao lugar do dado real",
);

// Trocar de perfil tem que apagar o anterior. Sem isto, quem vem de um perfil
// com selo vê o selo dele num perfil sem nenhum — e como o dado que chega é
// vazio, ele não sobrescreve nada e o engano fica na tela.
// Mesmo defeito de sempre, um andar acima: o aviso existir e nada monta-lo.
check(
  "quem concede anuncia",
  servico.includes("anunciar(userId, achievementId);"),
  "grantAchievement nao avisa a tela",
);
check(
  "o anunciante esta montado no App",
  /<AchievementAnnouncer\b/.test(app),
  "o componente existe e ninguem renderiza",
);

check(
  "trocar de perfil zera as conquistas do anterior",
  perfil.includes("setUnlockedAchievements(new Set())"),
  "não achei o reset ao trocar de perfil",
);

console.log(falhas === 0 ? "\ntudo verde\n" : `\n${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
