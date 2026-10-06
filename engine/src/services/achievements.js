/**
 * Conquistas do Engine.
 *
 * Cada conquista é um documento em `users/{uid}/achievements/{id}`, com o id
 * sendo o próprio marco. Não há campo de estado: existir é ter conquistado.
 *
 * Por que assim, e não um contador ou uma lista no perfil:
 *
 * - **Dedup de graça.** O Firestore nega `create` em documento que já existe.
 *   Duas detecções simultâneas do mesmo marco não viram duas conquistas nem
 *   duas notificações — a segunda falha sozinha, sem transação.
 * - **Revogável.** Fraude descoberta depois se desfaz apagando o documento,
 *   sem reconstruir nada, porque ele não guarda estado incremental.
 * - **Escrita alheia contida.** Quem detecta o cruzamento é o cliente de quem
 *   praticou a ação (quem curtiu, quem seguiu), porque o Firebase está no plano
 *   Spark e não há Cloud Function pra fazer isso no servidor. Ou seja: é escrita
 *   no perfil de OUTRA pessoa. A regra prende por uma lista fechada de ids e por
 *   um corpo de um campo só, então o máximo que se consegue é dar a alguém uma
 *   conquista que ela já ia ganhar.
 *
 * A LISTA DE IDS AQUI ESPELHA A REGRA. Se mudar um, mude o outro — id fora da
 * lista é negado pelo servidor (ver `firestore.rules`, match
 * `/users/{userId}/achievements/{achievementId}`).
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, firestore } from "./firebase";
import {
  earnedLikeTiers,
  earnedTiers,
  isAchievementId,
  likeTierId,
  seriesTierId,
  tiersOf,
} from "./achievementTiers";

const ACHIEVEMENTS_SUBCOLLECTION = "achievements";

// A régua vive num módulo sem dependência, para poder ser testada em Node.
// Reexportada aqui para quem consome ter um endereço só.
export {
  isAchievementId,
  LIKE_TIERS,
  MILESTONE_IDS,
  ACHIEVEMENT_IDS,
  likeTierId,
  visibleLikeTiers,
  earnedLikeTiers,
  postBadgeTier,
  POST_BADGE_TIERS,
  FOLLOWER_TIERS,
  ACHIEVEMENT_CATALOG,
  categoryOf,
  seriesOf,
  tiersOf,
  visibleTiers,
  earnedTiers,
  seriesTierId,
  garageAchievementIds,
} from "./achievementTiers";

const achievementsRef = (userId) =>
  collection(firestore, "users", userId, ACHIEVEMENTS_SUBCOLLECTION);

// --- quem avisa a tela -------------------------------------------------------
//
// A conquista é concedida no fundo, em três caminhos diferentes (curtir, seguir,
// abrir a garagem), e nenhum deles sabe desenhar nada. Em vez de cada um chamar
// a tela, quem concede anuncia e quem estiver montado escuta.
//
// O filtro que importa mora aqui: só anuncia quando a conquista é de QUEM ESTÁ
// COM O APP ABERTO. Conceder é rotineiramente escrita no perfil de outra pessoa
// — quem curtiu concede ao dono do post — e comemorar na tela de quem curtiu
// seria comemorar a conquista alheia. Para essa pessoa o aviso é a notificação,
// que chega mesmo com o app fechado.
const ouvintes = new Set();

export const subscribeAchievementUnlocked = (ouvinte) => {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
};

const anunciar = (userId, achievementId) => {
  if (userId !== auth.currentUser?.uid) return;
  for (const ouvinte of ouvintes) {
    try {
      ouvinte(achievementId);
    } catch {
      // Um ouvinte quebrado não pode derrubar a concessão nem os outros.
    }
  }
};

/** Ids já conquistados por alguém. Leitura pública, como o perfil. */
export const listAchievements = async (userId) => {
  if (!userId) return new Set();
  try {
    const snapshot = await getDocs(achievementsRef(userId));
    return new Set(snapshot.docs.map((d) => d.id));
  } catch {
    // Conquista é enfeite do perfil: se falhar, o perfil abre sem selo em vez
    // de não abrir.
    return new Set();
  }
};

/**
 * Concede um marco, se ele ainda não existir.
 *
 * Devolve `true` só quando ESTA chamada foi a que criou — é esse retorno que
 * decide se a notificação sai, e é o que impede duas abas abertas de avisarem
 * duas vezes. O `create` que perde a corrida falha na regra, não aqui.
 */
// Já sabido nesta sessão: conquistado, ou tentado e negado por já existir.
// Sem isto, "primeiro post" tentaria gravar em todo post — uma escrita negada
// por post, para sempre. Chave `${uid}/${id}`.
const jaResolvido = new Set();

export const grantAchievement = async (userId, achievementId) => {
  if (!userId || !auth.currentUser || !isAchievementId(achievementId)) return false;
  const chave = `${userId}/${achievementId}`;
  if (jaResolvido.has(chave)) return false;
  try {
    const alvo = doc(firestore, "users", userId, ACHIEVEMENTS_SUBCOLLECTION, achievementId);
    // `create` puro: sem merge, para o Firestore negar quando já existe. Com
    // merge isto viraria update e a dedup sumiria.
    await setDoc(alvo, { unlockedAt: serverTimestamp() });
    jaResolvido.add(chave);
    anunciar(userId, achievementId);
    return true;
  } catch {
    // Negado = já existia (ou sem permissão): não adianta tentar de novo
    // nesta sessão.
    jaResolvido.add(chave);
    return false;
  }
};

/** Conquista de uma ação da própria pessoa (primeiro post, entrou num clube...). */
export const grantOwn = (achievementId) =>
  grantAchievement(auth.currentUser?.uid, achievementId).catch(() => false);

/**
 * Concede os degraus de uma série que `value` já cruzou, para `userId`.
 * Devolve só os que ESTA chamada concedeu. Sequencial, para as notificações
 * saírem na ordem dos degraus.
 */
export const grantSeries = async (userId, series, value) => {
  if (!userId) return [];
  const alvos = earnedTiers(tiersOf(series), value).map((tier) => seriesTierId(series, tier));
  if (!alvos.length) return [];
  const jaTem = await listAchievements(userId);
  const concedidos = [];
  for (const id of alvos) {
    if (jaTem.has(id)) continue;
    if (await grantAchievement(userId, id)) concedidos.push(id);
  }
  return concedidos;
};

/** Revoga. É do dono (ou da moderação) — a rede de segurança contra fraude. */
export const revokeAchievement = async (userId, achievementId) => {
  if (!userId || !isAchievementId(achievementId)) return false;
  try {
    await deleteDoc(
      doc(firestore, "users", userId, ACHIEVEMENTS_SUBCOLLECTION, achievementId),
    );
    return true;
  } catch {
    return false;
  }
};

/**
 * Concede os marcos que dependem só da garagem da própria pessoa.
 *
 * Recebe a lista de ids já apurada (`garageAchievementIds`, na régua pura) em
 * vez dos carros: assim este módulo não precisa saber o que é "tipo do carro"
 * nem como se mede consumo, e o serviço de conquistas fica com uma
 * responsabilidade só.
 *
 * Escrita no próprio perfil, então não tem a complicação dos marcos de curtida:
 * sem concorrência de terceiro, sem notificação (a pessoa está na tela, quem
 * avisa é o toast).
 */
export const syncOwnMilestones = async (userId, alvos = []) => {
  if (!userId || !alvos.length) return [];

  const jaTem = await listAchievements(userId);
  const concedidos = [];
  for (const id of alvos) {
    if (jaTem.has(id)) continue;
    if (await grantAchievement(userId, id)) concedidos.push(id);
  }
  return concedidos;
};

/**
 * Confere os degraus de curtida de alguém e concede o que faltar.
 *
 * Roda no cliente de quem acabou de curtir, com o total vindo de
 * `countLikesReceived`, que conta a subcoleção — não o `likesCount` que fica no
 * post. Aquele é número de vitrine e a regra só consegue prender o passo em ±1,
 * então dava pra empurrar de um em um até o selo; este conta documento que
 * ninguém escreve no lugar do outro.
 *
 * Devolve só os marcos que ESTA chamada concedeu, para a notificação sair uma
 * vez por conquista.
 */
export const syncLikeAchievements = async (userId, likesReceived) => {
  if (!userId) return [];
  const jaTem = await listAchievements(userId);
  const concedidos = [];
  for (const tier of earnedLikeTiers(likesReceived)) {
    const id = likeTierId(tier);
    if (jaTem.has(id)) continue;
    // Sequencial de propósito: se duas conquistas caem juntas, a ordem das
    // notificações segue a ordem dos degraus.
    if (await grantAchievement(userId, id)) concedidos.push(id);
  }
  return concedidos;
};
