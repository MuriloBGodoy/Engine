import { get, set, del } from "idb-keyval";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getCountFromServer,
  documentId,
  getDocs,
  getDocsFromServer,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, firestore } from "./firebase";
import {
  grantAchievement,
  syncLikeAchievements,
  syncOwnMilestones,
} from "./achievements";
import { inferLocation } from "./locations";
import { normalizeOwnershipInputs, LIFE_SITUATION_TYPES } from "./ownership";
import { normalizeExpense, normalizeExpenses } from "./expenses";
import { normalizeSpecSheet, publicSpecSheet } from "./carSpecSheet";

const defaultSettings = {
  profile: {
    displayName: "",
    username: "",
    phone: "",
    country: "BR",
    state: "",
    location: "",
    bio: "",
    avatar: "",
  },
  // Só entra aqui o que alguma tela LÊ. Até 05/10/2026 a página de
  // configurações exibia moeda, fuso, densidade, página inicial, meta anual,
  // alertas por e-mail, 2FA e tempo de sessão — chaves gravadas e nunca
  // consultadas por ninguém. Documentos antigos ainda as carregam; são inertes.
  preferences: {
    language: "pt-BR",
    theme: "dark",
    navLayout: "sidebar",
    defaultGarageSort: "progress-desc",
  },
  // Avisos DENTRO do app, por tipo (o sino). O Engine não envia e-mail nem
  // push; o filtro é aplicado em quem recebe, ao exibir — ver
  // `isNotificationMuted` em services/notifications.js.
  notifications: {
    pauseAll: false,
    likes: true,
    comments: true,
    follows: true,
    messages: true,
    achievements: true,
  },
  privacy: {
    showEmailInSidebar: true,
    lockSensitiveValues: false,
  },
  // Renda e despesa são da PESSOA, não do carro. Antes disso a renda morava em
  // `car.ownership` e portanto estava duplicada no documento de cada carro:
  // atualizar simulando o Golf deixava a simulação do Jetta com o valor velho.
  // Vive em `users/{uid}/private/settings`, que não é copiado para o perfil
  // público nem para a comunidade.
  budget: {
    monthlyIncome: 0,
    monthlyExpenses: 0,
    // Qual carro da garagem sai da conta quando a pessoa diz que vai trocar —
    // o gasto dele já está dentro da despesa declarada.
    replacedCarId: "",
    lifeSituation: "shared",
    incomeSharePct: 20,
    updatedAt: "",
  },
};

const USERNAME_REGISTRY_KEY = "engine_username_registry";
const LEGACY_CARS_KEY = "engine_cars";
const LEGACY_SETTINGS_KEY = "engine_settings";
const USERS_COLLECTION = "users";
const USERNAMES_COLLECTION = "usernames";
const LIKES_SUBCOLLECTION = "likes";
const COMMUNITY_COLLECTION = "communityGoals";
const PUBLIC_PROFILES_COLLECTION = "publicProfiles";
const REPORTS_COLLECTION = "reports";
const SERVICE_LISTINGS_COLLECTION = "serviceListings";
const SERVICE_STATUS_APPROVED = "approved";
const SERVICE_STATUS_PENDING = "pending";
const SERVICE_STATUS_CHANGES_REQUESTED = "changes_requested";
const SERVICE_STATUS_REJECTED = "rejected";
const FIRESTORE_TIMEOUT_MS = 7000;
// A garagem carrega as fotos junto (base64 dentro do documento), então baixar
// alguns megabytes é normal enquanto o Storage não estiver ligado.
const CARS_TIMEOUT_MS = 20000;
const ENGINE_API_URL = import.meta.env.VITE_API_URL || "";
const COMMUNITY_GOALS_PAGE_SIZE = 20;
const defaultCommunityState = {
  interactions: {},
  following: [],
  sharedGoalIds: [],
  savedVideos: [],
};
let currentUserId = null;

/**
 * Quais publicações a pessoa que está olhando já curtiu.
 *
 * A curtida virou documento numa subcoleção, então a resposta não vem mais de
 * graça junto do post — o feed teria que consultar a subcoleção post a post. Em
 * vez disso, uma consulta de grupo por sessão traz tudo que ESTA pessoa curtiu,
 * e o feed responde de memória. O conjunto também é atualizado na hora quando
 * ela curte ou descurte, para o coração não esperar o servidor.
 */
let myLikedGoalIds = new Set();

// Os marcos da própria garagem são conferidos quando ela muda. Esta bandeira
// garante mais uma conferida por sessão, para quem já tinha carro antes de as
// conquistas existirem receber o selo sem precisar salvar nada de novo.
let marcosDaGaragemConferidos = false;

const refreshMyLikedGoals = async (userId) => {
  if (!userId) {
    myLikedGoalIds = new Set();
    return;
  }
  try {
    const snapshot = await getDocs(
      query(collectionGroup(firestore, LIKES_SUBCOLLECTION), where("likerId", "==", userId)),
    );
    // O pai do documento de curtida é a subcoleção; o pai dela é o post.
    myLikedGoalIds = new Set(snapshot.docs.map((d) => d.ref.parent.parent?.id).filter(Boolean));
  } catch (error) {
    // Índice de grupo ainda propagando, ou rede caindo: o coração fica apagado
    // até a próxima carga, e curtir de novo é idempotente (o id é o uid).
    warnFirestoreFallback("refreshMyLikedGoals", error);
  }
};
let communityGoalsCursorDoc = null;
let communityGoalsHasMore = true;

const apiEnabled = () => Boolean(ENGINE_API_URL && auth.currentUser);

const apiRequest = async (path, options = {}) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("Usuário não autenticado.");
  }

  const response = await fetch(`${ENGINE_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Falha ao chamar Engine API.");
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

const apiJson = (method, path, body) =>
  apiRequest(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const scopedKey = (name, userId = currentUserId) => {
  if (!userId) {
    throw new Error("Usuário não identificado.");
  }
  return `engine_users:${userId}:${name}`;
};

const mergeSettings = (settings = {}) => ({
  profile: { ...defaultSettings.profile, ...(settings.profile || {}) },
  preferences: {
    ...defaultSettings.preferences,
    ...(settings.preferences || {}),
  },
  notifications: {
    ...defaultSettings.notifications,
    ...(settings.notifications || {}),
  },
  privacy: { ...defaultSettings.privacy, ...(settings.privacy || {}) },
  budget: { ...defaultSettings.budget, ...(settings.budget || {}) },
});

const normalizeUsername = (username = "") => {
  const clean = username
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 24);

  return clean ? `@${clean}` : "";
};

const normalizePhone = (phone = "") =>
  phone
    .trim()
    .replace(/[^\d+()\-\s]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 24);

/** Valor em dinheiro vindo de campo livre: nunca negativo, nunca absurdo. */
const clampMoney = (value) =>
  Math.min(Math.max(Number(value) || 0, 0), 100000000);

const normalizeSettings = (settings = {}) => {
  const merged = mergeSettings(settings);
  return {
    ...merged,
    profile: {
      ...merged.profile,
      displayName: merged.profile.displayName.trim().slice(0, 80),
      username: normalizeUsername(merged.profile.username),
      phone: normalizePhone(merged.profile.phone),
      country: String(merged.profile.country || "").trim().slice(0, 4).toUpperCase(),
      state: String(merged.profile.state || "").trim().slice(0, 8).toUpperCase(),
      location: merged.profile.location.trim().slice(0, 80),
      bio: merged.profile.bio.trim().slice(0, 280),
    },
    budget: {
      ...merged.budget,
      monthlyIncome: clampMoney(merged.budget.monthlyIncome),
      monthlyExpenses: clampMoney(merged.budget.monthlyExpenses),
      replacedCarId: String(merged.budget.replacedCarId || "").slice(0, 64),
      lifeSituation: LIFE_SITUATION_TYPES.includes(merged.budget.lifeSituation)
        ? merged.budget.lifeSituation
        : "shared",
      incomeSharePct: Math.min(
        Math.max(Math.round(Number(merged.budget.incomeSharePct) || 20), 1),
        100,
      ),
      updatedAt: String(merged.budget.updatedAt || "").slice(0, 32),
    },
  };
};

const recoverSettingsAvatar = async (settings = {}, userId = currentUserId) => {
  const normalized = normalizeSettings(settings);
  if (normalized.profile.avatar || !userId) return normalized;

  const localSettings = await getLocalSettings(userId);
  const localAvatar = localSettings?.profile?.avatar || "";
  if (localAvatar) {
    return {
      ...normalized,
      profile: { ...normalized.profile, avatar: localAvatar },
    };
  }

  try {
    const profileSnapshot = await getDoc(publicProfileDoc(userId));
    const publicAvatar = profileSnapshot.exists()
      ? profileSnapshot.data()?.avatar || ""
      : "";
    if (publicAvatar) {
      return {
        ...normalized,
        profile: { ...normalized.profile, avatar: publicAvatar },
      };
    }
  } catch (error) {
    warnFirestoreFallback("recoverSettingsAvatar", error);
  }

  const authAvatar = auth.currentUser?.photoURL || "";
  return authAvatar
    ? {
        ...normalized,
        profile: { ...normalized.profile, avatar: authAvatar },
      }
    : normalized;
};

export const MAX_CAR_PHOTOS = 4;

/** Galeria do carro: aceita o campo antigo (`image`) e o novo (`images`). */
const normalizeCarImages = (car = {}) => {
  const list = Array.isArray(car.images) ? car.images : [];
  // A capa entra na lista: sem isso, carro que só tem `image` (o que vem de
  // qualquer origem que não devolva a galeria) era normalizado para zero foto,
  // e como `image` é derivado de `images[0]`, salvar apagava a imagem no banco.
  const all = [...list, car.image]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return Array.from(new Set(all)).slice(0, MAX_CAR_PHOTOS);
};

// Teto real do Firestore por documento. A margem cobre o que o SDK acrescenta
// (nome dos campos, timestamps, overhead de serialização) e o que o
// JSON.stringify não mede com precisão.
const FIRESTORE_DOC_LIMIT = 1048576;
const DOC_SAFE_BUDGET = Math.floor(FIRESTORE_DOC_LIMIT * 0.85);
const CAR_TOO_LARGE_MESSAGE =
  "As fotos deste carro passaram do limite de armazenamento. Remova alguma foto ou use imagens menores.";
// Gravações que falham no servidor AVISAM. Até 25/09/2026 cinco delas pegavam
// o erro do Firestore, guardavam uma cópia no navegador e devolviam sucesso:
// "Anúncio enviado para aprovação" sem nada ter chegado, admin "aprovando" um
// status que não mudou (e notificando o prestador), perfil "salvo" que só
// existia naquele aparelho. O `saveCar` já tinha sido corrigido em agosto;
// estas seguem o mesmo padrão.
const SETTINGS_NOT_SYNCED_MESSAGE =
  "Suas alterações ficaram só neste aparelho e não chegaram ao servidor. Verifique a conexão e salve de novo.";
const LISTING_NOT_SENT_MESSAGE =
  "O anúncio não chegou ao servidor e NÃO foi enviado para aprovação. Verifique a conexão e envie de novo — se tiver foto, tente com uma imagem menor.";
const NOT_DELETED_MESSAGE =
  "Não foi possível excluir agora: o servidor não confirmou. Verifique a conexão e tente de novo.";
const MODERATION_NOT_SAVED_MESSAGE =
  "A decisão não foi gravada no servidor. Nada foi alterado no anúncio; tente de novo.";

const CAR_NOT_SYNCED_MESSAGE =
  "O carro foi salvo neste aparelho, mas não chegou ao servidor. Verifique a conexão e salve de novo — se tiver foto, tente com uma imagem menor.";

const approximateDocSize = (value) => {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return JSON.stringify(value).length;
  }
};

const isDocumentTooLarge = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "invalid-argument" ||
    message.includes("longer than") ||
    message.includes("maximum") ||
    message.includes("1048576")
  );
};

/** Barra o save antes de tentar, quando o carro não cabe no documento. */
const assertCarFitsDocument = (car) => {
  if (approximateDocSize(car) <= DOC_SAFE_BUDGET) return;
  throw new Error(CAR_TOO_LARGE_MESSAGE);
};

/** Meta é o carro que a pessoa quer; owned é o que ela já tem na garagem. */
/**
 * Leitura que falhou e NAO tem cache pra mostrar no lugar.
 *
 * Existe porque `catch { return [] }` e indistinguivel de "voce nao tem nada".
 * A garagem do Murilo (1,9 MB de foto em base64 dentro dos documentos) estourou
 * o timeout num aparelho sem cache e a tela disse "adicione seu primeiro
 * carro" para quem tinha sete. Cache com conteudo continua sendo resposta
 * legitima — modo offline. Cache vazio depois de falha e erro, e erro tem que
 * aparecer.
 */
export class FalhaDeLeitura extends Error {
  constructor(oQue, causa) {
    super(`Nao foi possivel carregar ${oQue}.`);
    this.name = "FalhaDeLeitura";
    this.oQue = oQue;
    this.cause = causa;
  }
}

export const CAR_TYPE_GOAL = "goal";
export const CAR_TYPE_OWNED = "owned";

const normalizeCar = (car) => ({
  id: String(car.id || crypto.randomUUID()),
  // Default `goal` mantém retrocompatibilidade: todo carro cadastrado antes
  // desta mudança é meta, porque era a única coisa que existia.
  type: car.type === CAR_TYPE_OWNED ? CAR_TYPE_OWNED : CAR_TYPE_GOAL,
  brand: String(car.brand || "").trim().slice(0, 80),
  model: String(car.model || "").trim().slice(0, 120),
  year: String(car.year || "").trim().slice(0, 40),
  // Códigos FIPE da versão. Chave canônica do veículo no Brasil: transforma
  // qualquer consulta futura de ficha técnica de casamento por string em busca
  // por chave.
  //
  // `null` NÃO é excepcional — é o estado da maior parte da base, cadastrada
  // antes deste campo existir. Quem consumir precisa ter fallback por
  // brand/model/year e nunca assumir que o campo está preenchido.
  //
  // Só grava se marca, modelo e ano vierem juntos: um trio incompleto aponta
  // para um veículo diferente do que está escrito no card.
  fipe:
    car.fipe?.brandCode && car.fipe?.modelCode && car.fipe?.yearCode
      ? {
          brandCode: String(car.fipe.brandCode).trim().slice(0, 12),
          modelCode: String(car.fipe.modelCode).trim().slice(0, 12),
          // `2022-1` (gasolina/flex) ou `2022-3` (diesel): o sufixo é o
          // combustível e faz parte da chave.
          yearCode: String(car.fipe.yearCode).trim().slice(0, 12),
          // `004278-1`. Vem só da resposta de preço e pode faltar se a
          // chamada falhou — os três códigos acima já bastam para reconsultar.
          code: String(car.fipe.code || "").trim().slice(0, 16),
        }
      : null,
  targetValue: Math.max(Number(car.targetValue) || 0, 0),
  savedValue: Math.max(Number(car.savedValue) || 0, 0),
  images: normalizeCarImages(car),
  // `image` continua sendo a capa, para tudo que já lê esse campo.
  image: normalizeCarImages(car)[0] || "",
  // Histórico de aportes. Fica no próprio doc do carro, e não numa
  // subcoleção, porque o volume é pequeno (quem guarda dinheiro guarda uma vez
  // por mês) e assim o histórico vem junto do carro — inclusive no modo local,
  // sem login, sem código separado.
  contributions: Array.isArray(car.contributions)
    ? car.contributions
        .map((entry) => ({
          id: String(entry?.id || crypto.randomUUID()),
          amount: Math.max(Number(entry?.amount) || 0, 0),
          date: String(entry?.date || "").slice(0, 10),
          createdAt: entry?.createdAt || new Date().toISOString(),
        }))
        .filter((entry) => entry.amount > 0 && entry.date)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [],
  // Gastos reais do carro que a pessoa já tem. Fica no doc do carro pelo mesmo
  // motivo dos aportes — e com teto, porque abastecimento é semanal, não
  // mensal: sem limite o histórico cresceria para sempre dentro de um
  // documento que já carrega as fotos em base64.
  expenses: normalizeExpenses(car.expenses),
  // Ficha técnica declarada pela pessoa: o que ela completou e o que ela
  // MODIFICOU no exemplar. Mora aqui, e não numa coleção por versão como a
  // ficha de fábrica, porque é dado de UM carro — não existe outro dono para
  // reaproveitar. No pior caso — todos os campos, todos os chips e o texto no
  // teto — são 2.750 bytes medidos: 0,3% do orçamento do documento, contra
  // 200-700 KB de UMA foto em base64. Limites e faixas em `carSpecSheet.js`.
  specs: normalizeSpecSheet(car.specs),
  // Simulação de custo real de posse (inputs do usuário), quando existir.
  ownership: car.ownership
    ? {
        ...normalizeOwnershipInputs(car.ownership),
        country: String(car.ownership.country || "").trim().slice(0, 4).toUpperCase(),
        state: String(car.ownership.state || "").trim().slice(0, 8).toUpperCase(),
        // Quais campos a PESSOA informou, em oposição aos que o modelo assumiu.
        // Sem isso, ao reabrir o simulador não há como distinguir "escolheu
        // 26-35" de "assumimos 26-35" — e a faixa de incerteza, que existe
        // justamente para medir o que não se sabe, nasceria zerada e mentindo.
        touched: Array.isArray(car.ownership.touched)
          ? car.ownership.touched.map((key) => String(key).slice(0, 32)).slice(0, 24)
          : [],
      }
    : null,
  updatedAt: car.updatedAt || new Date().toISOString(),
});

const serializeForFirestore = (value) => JSON.parse(JSON.stringify(value));

const withTimeout = (promise, label, timeoutMs = FIRESTORE_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(
        () => reject(new Error(`${label} demorou demais para responder.`)),
        timeoutMs,
      );
    }),
  ]);

const localUserKey = (name, userId = currentUserId) =>
  userId ? scopedKey(name, userId) : name;

const getLocalCars = async (userId = currentUserId) =>
  (await get(localUserKey("cars", userId))) || (await get(LEGACY_CARS_KEY)) || [];

const setLocalCars = async (cars, userId = currentUserId) => {
  if (userId) {
    await set(scopedKey("cars", userId), cars);
    return;
  }

  await set(LEGACY_CARS_KEY, cars);
};

const getLocalSettings = async (userId = currentUserId) =>
  (await get(localUserKey("settings", userId))) ||
  (await get(LEGACY_SETTINGS_KEY));

const setLocalSettings = async (settings, userId = currentUserId) => {
  if (userId) {
    await set(scopedKey("settings", userId), settings);
    return;
  }

  await set(LEGACY_SETTINGS_KEY, settings);
};

// Nome repetido carrega um código, não só uma frase: a tela reagia procurando
// "usuario" na mensagem, que dizia "usuário" com acento — a frase certa nunca
// aparecia e a pessoa via o erro genérico.
const usernameTakenError = () =>
  Object.assign(new Error("Este usuário já está em uso."), { code: "username-taken" });

const warnFirestoreFallback = (operation, error) => {
  console.warn(`Firestore indisponivel em ${operation}. Usando fallback local.`, error);
};

const userDoc = (userId = currentUserId) => {
  if (!userId) {
    throw new Error("Usuário não identificado.");
  }
  return doc(firestore, USERS_COLLECTION, userId);
};

const userCarsCollection = (userId = currentUserId) =>
  collection(userDoc(userId), "cars");

const userCarDoc = (carId, userId = currentUserId) =>
  doc(userCarsCollection(userId), String(carId));

const userSettingsDoc = (userId = currentUserId) =>
  doc(userDoc(userId), "private", "settings");

const userCommunityDoc = (userId = currentUserId) =>
  doc(userDoc(userId), "private", "community");

// Lista de bloqueados: mora no espaço privado do usuário, que só ele lê.
const userModerationDoc = (userId = currentUserId) =>
  doc(userDoc(userId), "private", "moderation");

const userNotificationsCollection = (userId = currentUserId) =>
  collection(userDoc(userId), "notifications");

const publicProfilesCollection = () => collection(firestore, PUBLIC_PROFILES_COLLECTION);

// Perfis já lidos nesta sessão. Perfil muda pouco e a mesma pessoa aparece
// em várias telas (post, comentário, lista de seguidores): ler de novo a
// cada tela é o custo que a escuta da coleção inteira pagava em dobro.
const publicProfileCache = new Map();

const publicProfileDoc = (userId) =>
  doc(firestore, PUBLIC_PROFILES_COLLECTION, String(userId));

const followersCollection = (userId) =>
  collection(firestore, PUBLIC_PROFILES_COLLECTION, String(userId), "followers");

const followerDoc = (targetUserId, followerId) =>
  doc(
    firestore,
    PUBLIC_PROFILES_COLLECTION,
    String(targetUserId),
    "followers",
    String(followerId),
  );

const followingCollection = (userId) =>
  collection(firestore, PUBLIC_PROFILES_COLLECTION, String(userId), "following");

const followingDoc = (userId, targetUserId) =>
  doc(
    firestore,
    PUBLIC_PROFILES_COLLECTION,
    String(userId),
    "following",
    String(targetUserId),
  );

const usernameDocId = (username) => normalizeUsername(username).replace(/^@/, "");

const getProfileSnapshot = (settings = {}, userId = currentUserId) => {
  const profile = settings.profile || {};
  const author = profile.displayName || "Usuário Engine";
  const username = normalizeUsername(profile.username) || `@engine.${userId.slice(0, 6)}`;

  return {
    author,
    username,
    avatar: profile.avatar || "",
    avatarInitials: author
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2),
    city: profile.location || "Engine Garage",
    note: profile.bio || "",
  };
};

const buildPublicProfile = (settings = {}, userId = currentUserId) => {
  const profile = getProfileSnapshot(settings, userId);
  return {
    id: userId,
    userId,
    ...profile,
    updatedAt: serverTimestamp(),
  };
};

const buildCommunityGoal = (goal, userId, settings = {}, note = "", club = null) => {
  const profile = getProfileSnapshot(settings, userId);

  return {
    id: `goal-${userId}-${goal.id}`,
    userId: userId,
    ownerId: userId,
    carId: String(goal.id),
    author: profile.author,
    username: profile.username,
    avatar: profile.avatar,
    avatarInitials: profile.avatarInitials,
    city: profile.city,
    title: `${goal.brand} ${goal.model}`,
    brand: goal.brand,
    model: goal.model,
    year: goal.year,
    image: goal.image,
    images: normalizeCarImages(goal),
    savedValue: goal.savedValue,
    targetValue: goal.targetValue,
    // Legenda escrita na hora de publicar — não é mais a bio do perfil.
    note: String(note || "").trim().slice(0, 280),
    // Carimbo de clube (campos NOVOS e opcionais). Publicar a meta a partir da
    // página do clube marca o post; publicar da Comunidade deixa "" — e "" em
    // vez de ausente porque a consulta do mural é igualdade em `clubId`.
    clubId: String(club?.id || club?.clubId || ""),
    clubTag: String(club?.tag || club?.clubTag || ""),
    verified: true,
    likesCount: 0,
    comments: [],
    ratingsBy: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
};

const communityGoalId = (goal, userId = currentUserId) => {
  const goalId = String(goal?.id || "");
  // Post livre já nasce com id próprio e não tem carro pra derivar: sem esta
  // saída, apagar um post montava um id inexistente e não apagava nada.
  if (goalId.startsWith("post-")) return goalId;
  if (goalId.startsWith("goal-")) return goalId;

  const carId = String(goal?.carId || goalId.replace(/^user-/, ""));
  return `goal-${userId}-${carId}`;
};

const legacyCommunityGoalId = (goal, userId = currentUserId) => {
  const goalId = String(goal?.id || "");
  if (goalId.startsWith("goal-")) return goalId;

  const carId = String(goal?.carId || goalId.replace(/^user-/, ""));
  return `goal-${userId}-user-${carId}`;
};

// DECISÃO EXPLÍCITA: o código FIPE (`car.fipe`) NÃO entra no payload público.
//
// Não é pelo motivo que parece. O argumento óbvio seria "o código permite
// descobrir o valor do carro dos outros" — e ele não se sustenta, porque
// `targetValue` já é o preço FIPE e já é publicado aqui de propósito: é o
// denominador da barra de progresso, é a feature.
//
// O motivo real é outro, e é de porta de mão única. Publicar um identificador
// é irreversível na prática: dá para acrescentar um campo a uma coleção
// pública depois, mas não dá para tirá-lo dos leitores que já copiaram. E hoje
// ele não compra nada: a ficha técnica é derivada de `brand`/`model`/`year`
// pelo parser em `services/fipeVersion.js`, caminho que precisa existir de
// qualquer jeito porque a maior parte da base é anterior ao campo.
//
// Ou seja: publicar agora seria assumir um custo permanente por um ganho zero.
// Se aparecer um consumo que a string não sirva, revisita-se — com o mesmo
// critério de mínimo necessário que mantém `ownership` fora daqui.
const communityCarPatch = (car) => ({
  carId: String(car.id),
  title: `${car.brand} ${car.model}`.trim(),
  brand: car.brand,
  model: car.model,
  year: car.year,
  image: car.image,
  images: normalizeCarImages(car),
  savedValue: car.savedValue,
  targetValue: car.targetValue,
  // DECISÃO EXPLÍCITA, e ela vai no sentido CONTRÁRIO da de cima. A ficha
  // declarada pelo dono ENTRA no payload público.
  //
  // `ownership` fica de fora porque é dinheiro e ninguém pediu para mostrar.
  // A ficha declarada é o oposto disso: ela só existe porque a pessoa quis
  // contar o que fez no carro dela, e a Comunidade é uma das três entradas da
  // feature desde o primeiro briefing. Não publicar seria construir o campo e
  // esconder justamente onde ele serve.
  //
  // O que torna isso seguro está no formato, não na moderação: `publicSpecSheet`
  // só emite valor acompanhado de `origin` e `method`, e só para carro
  // `owned`. Número declarado chega ao leitor sempre etiquetado como afirmação
  // do dono — nunca como número verificado. Sem essa etiqueta a Comunidade
  // viraria placar de cavalo inventado, e é a única coisa que este produto vem
  // defendendo desde que o `consumption.js` foi desmascarado.
  //
  // Nada de FÁBRICA vai junto: quem lê deriva a camada 1 do mesmo `brand`/
  // `model`/`year` que já é público, com o mesmo parser. Publicar a camada 1
  // criaria uma cópia que envelhece sozinha quando a tabela do Han melhorar —
  // que é exatamente o defeito do `fipe-consumption-db.json`.
  specs: publicSpecSheet(car),
  updatedAt: serverTimestamp(),
});

/**
 * Publicação de meta (o carro da garagem) ou post livre (foto, vídeo e texto).
 *
 * Os dois vivem na mesma coleção de propósito: o feed, o card, curtida,
 * comentário, avaliação, denúncia, bloqueio e as regras de segurança já
 * existem para `communityGoals`. Coleção separada significaria manter duas
 * cópias disso tudo.
 */
export const POST_KIND_GOAL = "goal";
export const POST_KIND_POST = "post";

// Exportado porque o mural do clube É esta coleção, filtrada por `clubId`: a
// camada de Clubes precisa entregar ao GoalCard exatamente a mesma forma que o
// feed entrega. Normalizador duplicado seria um segundo lugar para esquecer de
// arrumar quando o formato mudar.
export const normalizeCommunityGoal = (goal = {}) => {
  const ratings = Object.values(goal.ratingsBy || {}).map(Number).filter(Boolean);
  const rating = ratings.length
    ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
    : 0;
  const author = goal.author || "Usuário Engine";

  return {
    id: goal.id,
    // Sem `kind` é publicação de meta: é o que existia antes dos posts.
    kind: goal.kind === POST_KIND_POST ? POST_KIND_POST : POST_KIND_GOAL,
    videoUrl: goal.videoUrl || "",
    author,
    username: goal.username || "@engine",
    avatar:
      goal.avatar ||
      goal.avatarInitials ||
      author
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2),
    city: goal.city || "Engine Garage",
    title: goal.title || `${goal.brand || ""} ${goal.model || ""}`.trim(),
    brand: goal.brand || "",
    model: goal.model || "",
    year: goal.year || "",
    image: goal.image || "",
    images: normalizeCarImages(goal),
    // Ficha declarada do dono, quando ele publicou uma. Passa pela mesma
    // normalização da escrita: post antigo, post adulterado e post de outra
    // versão do app caem na mesma peneira, e valor sem `origin` não sobrevive.
    specs: normalizeSpecSheet(goal.specs),
    savedValue: Number(goal.savedValue) || 0,
    targetValue: Number(goal.targetValue) || 0,
    streak: Number(goal.streak) || 1,
    // Durante a transição um post pode ter só o mapa antigo, só o contador
    // novo, ou os dois. `likesCount` ganha quando existe.
    likes:
      typeof goal.likesCount === "number"
        ? goal.likesCount
        : Object.keys(goal.likesBy || {}).length,
    comments: (goal.comments || []).map((comment) =>
      typeof comment === "string"
        ? { text: comment, author: "Engine", username: "@engine" }
        : {
            text: comment.text,
            id: comment.id || comment.createdAt || crypto.randomUUID(),
            author: comment.author || "Usuário Engine",
            username: comment.username || "@engine",
            avatar: comment.avatar || comment.avatarInitials || "",
            avatarInitials: comment.avatarInitials || "",
            userId: comment.userId || "",
            createdAt: comment.createdAt || "",
            editedAt: comment.editedAt || "",
          },
    ),
    rating: rating || 0,
    verified: Boolean(goal.verified),
    tagKey: "community.seed.mine",
    note: goal.note || "",
    isMine: goal.ownerId === currentUserId,
    ownerId: goal.ownerId,
    userId: goal.userId || goal.ownerId,
    carId: goal.carId,
    // Carimbo do clube. Vem como "" quando não há, porque o card decide
    // mostrar o chip `[TAG]` por `clubTag` — e `undefined` obrigaria toda
    // linha da tela a um `?.`.
    clubId: goal.clubId || "",
    clubTag: goal.clubTag || "",
    // Projeção por leitor, não a lista inteira: a UI só pergunta
    // `likesBy?.[user.uid]`, então mandar o mapa completo era carregar a lista
    // de todo mundo para responder uma pergunta sobre uma pessoa.
    likesBy:
      currentUserId && myLikedGoalIds.has(goal.id)
        ? { [currentUserId]: true }
        : goal.likesBy || {},
    ratingsBy: goal.ratingsBy || {},
  };
};

const normalizeCommunityState = (state = {}) => ({
  interactions: state.interactions || {},
  following: Array.isArray(state.following) ? state.following : [],
  sharedGoalIds: Array.isArray(state.sharedGoalIds) ? state.sharedGoalIds : [],
  savedVideos: Array.isArray(state.savedVideos) ? state.savedVideos : [],
});

/**
 * Aceita "@fulano", "fulano", "instagram.com/fulano" ou a URL completa com
 * query, e guarda sempre só o handle. Quem cola link do navegador não deveria
 * ver o anúncio quebrado por isso.
 */
const normalizeSocialHandle = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const withoutUrl = raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^(instagram|tiktok)\.com\//i, "")
    .split(/[/?#]/)[0];

  return withoutUrl.replace(/^@/, "").slice(0, 40);
};

const normalizeServiceListing = (listing = {}) => {
  const title = String(listing.title || "").trim().slice(0, 90);
  const providerName = String(listing.providerName || "").trim().slice(0, 80);
  let country = String(listing.country || "").trim().slice(0, 4).toUpperCase();
  let state = String(listing.state || "").trim().slice(0, 8).toUpperCase();
  const city = String(listing.city || "").trim().slice(0, 80);
  // Anúncios legados (sem país/estado): tenta inferir pela cidade, se o nome
  // for único no dataset. Assim eles deixam de aparecer "soltos" no filtro.
  if ((!country || !state) && city) {
    const inferred = inferLocation(city);
    if (inferred) {
      country = country || inferred.country;
      state = state || inferred.state;
    }
  }
  const address = String(listing.address || "").trim().slice(0, 160);
  const whatsappCountry = String(listing.whatsappCountry || "+55")
    .trim()
    .replace(/[^\d+]/g, "")
    .slice(0, 6);
  const whatsapp = normalizePhone(
    listing.whatsapp && !String(listing.whatsapp).trim().startsWith("+")
      ? `${whatsappCountry} ${listing.whatsapp}`
      : listing.whatsapp || "",
  );
  const email = String(listing.email || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);

  return {
    id: String(listing.id || crypto.randomUUID()),
    ownerId: String(listing.ownerId || currentUserId || ""),
    title,
    providerName,
    category: String(listing.category || "").trim().slice(0, 60),
    description: String(listing.description || "").trim().slice(0, 900),
    price: String(listing.price || "").trim().slice(0, 80),
    serviceMode: ["place", "mobile", "hybrid"].includes(listing.serviceMode)
      ? listing.serviceMode
      : "hybrid",
    country,
    state,
    city,
    address,
    serviceArea: String(listing.serviceArea || "").trim().slice(0, 160),
    whatsappCountry,
    whatsapp,
    email,
    website: String(listing.website || "").trim().slice(0, 160),
    // Portfólio do prestador. Para quem se divulga em rede social, o perfil é
    // o site: guardamos o @ limpo (aceita colar a URL inteira) e montamos o
    // link na hora de exibir.
    instagram: normalizeSocialHandle(listing.instagram),
    tiktok: normalizeSocialHandle(listing.tiktok),
    // Vídeo entra por link, nunca hospedado: subir vídeo pro Storage queima
    // banda e custo rápido, e o prestador já tem o vídeo publicado.
    videoUrl: String(listing.videoUrl || "").trim().slice(0, 300),
    // Retorno do anúncio, mostrado só pro dono. É o que responde "quantos
    // clientes vieram daí?" — e é o que sustenta a renovação da assinatura.
    viewCount: Number(listing.viewCount) || 0,
    detailCount: Number(listing.detailCount) || 0,
    whatsappCount: Number(listing.whatsappCount) || 0,
    availability: String(listing.availability || "").trim().slice(0, 180),
    experience: String(listing.experience || "").trim().slice(0, 180),
    photos: Array.isArray(listing.photos)
      ? listing.photos
          .map((photo) => String(photo || "").trim())
          .filter(Boolean)
          .slice(0, 6)
      : [],
    moderationStatus: [
      SERVICE_STATUS_APPROVED,
      SERVICE_STATUS_PENDING,
      SERVICE_STATUS_CHANGES_REQUESTED,
      SERVICE_STATUS_REJECTED,
    ].includes(
      listing.moderationStatus,
    )
      ? listing.moderationStatus
      : SERVICE_STATUS_PENDING,
    moderationNote: String(listing.moderationNote || "").trim().slice(0, 600),
    moderationHistory: Array.isArray(listing.moderationHistory)
      ? listing.moderationHistory
          .map((entry) => ({
            status: String(entry?.status || "").trim(),
            note: String(entry?.note || "").trim().slice(0, 600),
            reviewerId: String(entry?.reviewerId || entry?.reviewedBy || "").trim(),
            reviewedAt: entry?.reviewedAt || entry?.createdAt || "",
          }))
          .filter((entry) => entry.status)
          .slice(0, 20)
      : [],
    reviewedBy: String(listing.reviewedBy || "").trim(),
    reviewedAt: listing.reviewedAt || "",
    submittedAt: listing.submittedAt || listing.createdAt || new Date().toISOString(),
    tags: Array.isArray(listing.tags)
      ? listing.tags.map((tag) => String(tag).trim().slice(0, 28)).filter(Boolean).slice(0, 8)
      : String(listing.tags || "")
          .split(",")
          .map((tag) => tag.trim().slice(0, 28))
          .filter(Boolean)
          .slice(0, 8),
    subscriptionStatus: listing.subscriptionStatus || "preview_unlocked",
    active: listing.active !== false,
    createdAt: listing.createdAt || new Date().toISOString(),
    updatedAt: listing.updatedAt || new Date().toISOString(),
  };
};

export const engineDB = {
  setCurrentUser(userId) {
    currentUserId = userId || null;
    // Conjunto é por pessoa: trocar de conta não pode herdar coração aceso.
    refreshMyLikedGoals(currentUserId);
  },

  async migrateLegacyData(userId) {
    if (!userId) return;

    const migratedKey = scopedKey("legacy_migrated", userId);
    if (await get(migratedKey)) return;

    const [existingCars, legacyCars, existingSettings, legacySettings] =
      await Promise.all([
        get(scopedKey("cars", userId)),
        get(LEGACY_CARS_KEY),
        get(scopedKey("settings", userId)),
        get(LEGACY_SETTINGS_KEY),
      ]);

    let firestoreCars;
    let firestoreSettings;

    try {
      [firestoreCars, firestoreSettings] = await Promise.all([
        withTimeout(getDocs(userCarsCollection(userId)), "migracao de carros"),
        withTimeout(getDoc(userSettingsDoc(userId)), "migracao de configuracoes"),
      ]);
    } catch (error) {
      warnFirestoreFallback("migrateLegacyData", error);
      await set(migratedKey, true);
      return;
    }

    // A migracao e oportunista: subir dado antigo e bom, mas falhar nisso nao
    // pode custar a leitura da garagem. So a LEITURA estava protegida — a
    // escrita, nao. Um `batch.commit()` recusado subia ate o App, abortava o
    // efeito ANTES do `getCars()` e deixava `cars: []` com `carsError: null`:
    // exatamente a tela do vazio legitimo, que agora diz o nome da conta. Seria
    // a mentira de sempre com endereco errado — acusar a conta por uma escrita
    // que falhou. `migratedKey` fica sem marcar de proposito, para tentar de
    // novo na proxima sessao em vez de desistir do dado antigo para sempre.
    try {
      if (firestoreCars.empty) {
        const carsToMigrate = existingCars?.length ? existingCars : legacyCars;
        if (carsToMigrate?.length) {
          const batch = writeBatch(firestore);
          carsToMigrate.map(normalizeCar).forEach((car) => {
            batch.set(userCarDoc(car.id, userId), serializeForFirestore(car));
          });
          await batch.commit();
        }
      }

      if (!firestoreSettings.exists()) {
        const settingsToMigrate = existingSettings || legacySettings;
        if (settingsToMigrate) {
          await setDoc(
            userSettingsDoc(userId),
            serializeForFirestore(normalizeSettings(settingsToMigrate)),
          );
        }
      }
    } catch (error) {
      warnFirestoreFallback("migrateLegacyData/escrita", error);
      return;
    }

    await set(migratedKey, true);
  },

  // Sem branch de API: GET /cars devolve o carro sem `images`, `ownership`,
  // `contributions` nem `type`, e o front deriva a capa de `images[0]` — o
  // carro voltava sem galeria e o save seguinte apagava a foto no banco. Foi
  // assim que a imagem do Corsa se perdeu.
  async getCars() {
    if (!currentUserId) return getLocalCars();

    try {
      const snapshot = await withTimeout(
        getDocs(userCarsCollection()),
        "buscar carros",
        // Documento com foto em base64 é pesado: 7s derrubava a leitura da
        // garagem inteira e jogava a tela no cache, que vinha incompleto.
        CARS_TIMEOUT_MS,
      );
      const cars = snapshot.docs
        .map((item) => normalizeCar({ id: item.id, ...item.data() }))
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

      // O cache precisa refletir o que o servidor tem. Sem isto ele só
      // guardava os carros salvos NESTE aparelho, e qualquer falha de leitura
      // fazia os outros sumirem da garagem — como se tivessem sido apagados.
      await setLocalCars(cars).catch(() => {});

      // Uma conferida por sessão, sem bloquear: quem já tinha carro antes de as
      // conquistas existirem ganha o selo sem precisar salvar nada de novo.
      if (!marcosDaGaragemConferidos) {
        marcosDaGaragemConferidos = true;
        this.sincronizarMarcosDaGaragem(cars).catch(() => {});
      }

      return cars;
    } catch (error) {
      warnFirestoreFallback("getCars", error);
      const cache = await getLocalCars();
      // Cache com carro dentro e modo offline: mostrar o que se tem e melhor
      // que travar. Cache VAZIO nao e "voce nao tem carro" — e leitura que
      // falhou, e devolver [] aqui foi exatamente o que fez a garagem parecer
      // apagada num aparelho onde ela nunca tinha sido lida.
      if (cache.length > 0) return cache;
      throw new FalhaDeLeitura("a garagem", error);
    }
  },

  /**
   * Um carro só, pelo id.
   *
   * Existe porque lançar um aporte ou um gasto não justifica ler a garagem
   * inteira: com as fotos em base64 dentro do documento, cada leitura dessas
   * arrasta megabytes por um carro que já se sabe qual é. Foi assim que a cota
   * diária do Firestore virou um teto alcançável.
   */
  async getCar(carId) {
    if (!carId) return null;

    if (!currentUserId) {
      const cars = await getLocalCars();
      return cars.find((item) => String(item.id) === String(carId)) || null;
    }

    try {
      const snapshot = await withTimeout(
        getDoc(userCarDoc(carId)),
        "buscar carro",
        CARS_TIMEOUT_MS,
      );
      if (snapshot.exists()) {
        return normalizeCar({ id: snapshot.id, ...snapshot.data() });
      }
    } catch (error) {
      warnFirestoreFallback("getCar", error);
    }

    const cars = await getLocalCars();
    return cars.find((item) => String(item.id) === String(carId)) || null;
  },

  /**
   * Registra um aporte na meta.
   *
   * Aporte é evento, não edição de campo: guarda valor e data, e soma ao
   * `savedValue`. A soma é incremental de propósito — recalcular a partir do
   * histórico apagaria o que a pessoa já tinha guardado antes de começar a
   * registrar.
   */
  async addCarContribution(carId, { amount, date }) {
    const value = Math.max(Number(amount) || 0, 0);
    if (!carId || !value) return null;

    const car = await this.getCar(carId);
    if (!car) return null;

    const contribution = {
      id: crypto.randomUUID(),
      amount: value,
      date: String(date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      createdAt: new Date().toISOString(),
    };

    const updated = normalizeCar({
      ...car,
      savedValue: (Number(car.savedValue) || 0) + value,
      contributions: [contribution, ...(car.contributions || [])],
    });

    await this.saveCar(updated);
    // Devolve o carro montado aqui, e não o retorno de saveCar: em dev o
    // backend Java responde sem os campos que ele não conhece, e o histórico
    // sumiria da tela logo depois de ser registrado.
    return updated;
  },

  /** Remove um aporte lançado errado e desfaz a soma. */
  async removeCarContribution(carId, contributionId) {
    const car = await this.getCar(carId);
    if (!car) return null;

    const target = (car.contributions || []).find((item) => item.id === contributionId);
    if (!target) return car;

    const updated = normalizeCar({
      ...car,
      savedValue: Math.max((Number(car.savedValue) || 0) - target.amount, 0),
      contributions: car.contributions.filter((item) => item.id !== contributionId),
    });

    await this.saveCar(updated);
    return updated;
  },

  /**
   * Lança um gasto do carro.
   *
   * Diferente do aporte, não mexe em `savedValue`: aporte é dinheiro que se
   * acumula rumo a um alvo, gasto é dinheiro que saiu. Somar os dois no mesmo
   * campo misturaria as duas leituras da garagem.
   */
  async addCarExpense(carId, expense) {
    const value = Math.max(Number(expense?.amount) || 0, 0);
    if (!carId || !value) return null;

    const car = await this.getCar(carId);
    if (!car) return null;

    const entry = normalizeExpense({ ...expense, id: crypto.randomUUID() });
    const updated = normalizeCar({
      ...car,
      expenses: [entry, ...(car.expenses || [])],
    });

    await this.saveCar(updated);
    return updated;
  },

  /** Remove um gasto lançado errado. */
  async removeCarExpense(carId, expenseId) {
    const car = await this.getCar(carId);
    if (!car) return null;

    const updated = normalizeCar({
      ...car,
      expenses: (car.expenses || []).filter((item) => item.id !== expenseId),
    });

    await this.saveCar(updated);
    return updated;
  },

  async saveCar(car) {
    const normalizedCar = normalizeCar(car);

    if (!currentUserId) {
      const cars = await getLocalCars();
      const index = cars.findIndex((c) => c.id === car.id);
      if (index !== -1) {
        cars[index] = normalizedCar;
      } else {
        cars.push(normalizedCar);
      }
      await setLocalCars(cars);
      return normalizedCar;
    }

    // Enquanto o Storage estiver desligado, a foto vai em base64 DENTRO do
    // documento, e o Firestore corta em 1 MiB. Passar disso fazia a gravação
    // ser recusada e o erro morria num console.warn: a tela dizia que salvou e
    // a foto sumia no refresh. Melhor barrar antes, com um motivo que a pessoa
    // entenda.
    assertCarFitsDocument(normalizedCar);

    // Sem branch de API pelo mesmo motivo do getCars: POST /cars responde sem
    // os campos que o backend Java não conhece, e esse retorno virava o estado
    // do app — a galeria e o tipo do carro sumiam da tela logo após salvar.
    let savedToServer = true;
    try {
      await withTimeout(
        setDoc(
          userCarDoc(normalizedCar.id),
          serializeForFirestore(normalizedCar),
          { merge: true },
        ),
        "salvar carro",
        // Subir a foto em base64 dentro do documento passa fácil de 7s. Com o
        // limite antigo o Promise.race desistia, o erro morria num warn, e o
        // carro ficava salvo só neste aparelho — foi o que fez a foto voltar a
        // sumir depois do refresh.
        CARS_TIMEOUT_MS,
      );
      await this.syncCommunityCar(normalizedCar).catch((error) =>
        warnFirestoreFallback("syncCommunityCar", error),
      );
    } catch (error) {
      // Recusa por tamanho não é queda de rede: não dá pra tratar como
      // offline e seguir, senão a foto some de novo sem ninguém saber.
      if (isDocumentTooLarge(error)) {
        throw new Error(CAR_TOO_LARGE_MESSAGE);
      }
      warnFirestoreFallback("saveCar", error);
      savedToServer = false;
    }

    const localCars = await getLocalCars();
    const index = localCars.findIndex((c) => c.id === normalizedCar.id);
    if (index !== -1) {
      localCars[index] = normalizedCar;
    } else {
      localCars.push(normalizedCar);
    }
    await setLocalCars(localCars);

    // Salvou aqui mas não no servidor: sem avisar, a pessoa vê o carro certo
    // na tela e descobre a perda no próximo refresh, sem entender o motivo.
    if (!savedToServer) {
      throw new Error(CAR_NOT_SYNCED_MESSAGE);
    }

    return normalizedCar;
  },

  async deleteCar(id) {
    if (!currentUserId) {
      const cars = await this.getCars();
      const updatedCars = cars.filter((c) => c.id !== id);
      await set(LEGACY_CARS_KEY, updatedCars);
      return;
    }

    if (apiEnabled()) {
      await apiRequest(`/cars/${id}`, { method: "DELETE" });
      const cars = await getLocalCars();
      await setLocalCars(cars.filter((c) => c.id !== String(id)));
      return;
    }

    try {
      await Promise.all([
        withTimeout(deleteDoc(userCarDoc(id)), "excluir carro"),
        withTimeout(
          deleteDoc(doc(firestore, COMMUNITY_COLLECTION, `goal-${currentUserId}-${id}`)),
          "excluir post da comunidade",
        ),
        withTimeout(
          deleteDoc(doc(firestore, COMMUNITY_COLLECTION, `goal-${currentUserId}-user-${id}`)),
          "excluir post legado da comunidade",
        ),
      ]);
    } catch (error) {
      warnFirestoreFallback("deleteCar", error);
      // Tirar só daqui faria o carro "voltar" no próximo acesso, sem motivo
      // aparente. Fica na tela e a pessoa sabe que não excluiu.
      throw new Error(NOT_DELETED_MESSAGE);
    }

    const cars = await getLocalCars();
    await setLocalCars(cars.filter((c) => c.id !== String(id)));
  },

  async resetDatabase() {
    if (!currentUserId) {
      await del(LEGACY_CARS_KEY);
      return;
    }

    if (apiEnabled()) {
      await apiRequest("/cars", { method: "DELETE" });
      await setLocalCars([]);
      return;
    }

    const [carsSnapshot, communitySnapshot] = await Promise.all([
      getDocs(userCarsCollection()),
      getDocs(query(collection(firestore, COMMUNITY_COLLECTION))),
    ]);
    const batch = writeBatch(firestore);
    carsSnapshot.docs.forEach((item) => batch.delete(item.ref));
    communitySnapshot.docs
      .filter((item) => item.data().ownerId === currentUserId)
      .forEach((item) => batch.delete(item.ref));
    await batch.commit();
  },

  async getCommunityState() {
    if (!currentUserId) {
      const state = await get("engine_community");
      return normalizeCommunityState(state);
    }

    if (apiEnabled()) {
      return normalizeCommunityState(await apiRequest("/community/state"));
    }

    const snapshot = await getDoc(userCommunityDoc());
    const state = snapshot.exists() ? snapshot.data() : {};
    return normalizeCommunityState(state);
  },

  async saveCommunityState(state) {
    const normalizedState = normalizeCommunityState(state);
    if (!currentUserId) {
      await set("engine_community", normalizedState);
      return normalizedState;
    }

    if (apiEnabled()) {
      return normalizeCommunityState(
        await apiJson("PUT", "/community/state", normalizedState),
      );
    }

    try {
      await setDoc(userCommunityDoc(), serializeForFirestore(normalizedState), {
        merge: true,
      });
    } catch (error) {
      console.warn("Could not save to private community doc:", error);
    }
    return normalizedState;
  },

  // Sem branch de API: GET /community/goals devolve o goal sem `note`,
  // `image`, `images` nem `verified` (o normalizador do backend monta um
  // `noteKey` e larga a legenda pra trás), então em dev a legenda publicada
  // nunca chegava no feed. O Firestore ainda troca polling de 10s por
  // tempo real.
  subscribeCommunityGoals(callback) {
    communityGoalsCursorDoc = null;
    communityGoalsHasMore = true;

    // Uma consulta por assinatura do feed. Não bloqueia: quando a resposta
    // chega, o próximo snapshot já sai com os corações certos.
    refreshMyLikedGoals(currentUserId);

    const communityQuery = query(
      collection(firestore, COMMUNITY_COLLECTION),
      orderBy("updatedAt", "desc"),
      limit(COMMUNITY_GOALS_PAGE_SIZE),
    );

    return onSnapshot(
      communityQuery,
      (snapshot) => {
        communityGoalsCursorDoc = snapshot.docs[snapshot.docs.length - 1] || null;
        communityGoalsHasMore = snapshot.docs.length === COMMUNITY_GOALS_PAGE_SIZE;
        callback(
          snapshot.docs.map((item) =>
            normalizeCommunityGoal({ id: item.id, ...item.data() }),
          ),
          { hasMore: communityGoalsHasMore },
        );
      },
      (error) => {
        warnFirestoreFallback("subscribeCommunityGoals", error);
        callback([], { hasMore: false });
      },
    );
  },

  async loadMoreCommunityGoals() {
    if (!communityGoalsCursorDoc || !communityGoalsHasMore) {
      return { goals: [], hasMore: false };
    }

    const nextPageQuery = query(
      collection(firestore, COMMUNITY_COLLECTION),
      orderBy("updatedAt", "desc"),
      startAfter(communityGoalsCursorDoc),
      limit(COMMUNITY_GOALS_PAGE_SIZE),
    );

    const snapshot = await getDocs(nextPageQuery);
    communityGoalsCursorDoc = snapshot.docs[snapshot.docs.length - 1] || communityGoalsCursorDoc;
    communityGoalsHasMore = snapshot.docs.length === COMMUNITY_GOALS_PAGE_SIZE;

    return {
      goals: snapshot.docs.map((item) =>
        normalizeCommunityGoal({ id: item.id, ...item.data() }),
      ),
      hasMore: communityGoalsHasMore,
    };
  },

  /**
   * Acompanha UMA publicação — usada pelo modal de post aberto por link direto
   * ou notificação, quando a meta não está na página já carregada do feed.
   */
  subscribeCommunityGoal(goalId, callback) {
    if (!goalId) {
      callback(null);
      return () => {};
    }

    // Sem branch de API: não existe GET /community/goals/{id} no backend Java,
    // e o catch entregava callback(null) — abrir um post por link direto ou
    // notificação simplesmente não achava a publicação em dev.
    return onSnapshot(
      doc(firestore, COMMUNITY_COLLECTION, String(goalId)),
      (snapshot) => {
        callback(
          snapshot.exists()
            ? normalizeCommunityGoal({ id: snapshot.id, ...snapshot.data() })
            : null,
        );
      },
      (error) => {
        warnFirestoreFallback("subscribeCommunityGoal", error);
        callback(null);
      },
    );
  },

  // --- perfis públicos: SEMPRE pontuais -----------------------------------
  //
  // Até 25/09/2026 existia `subscribePublicProfiles`, uma escuta viva da
  // coleção INTEIRA, usada por cinco telas. Medido em produção com 6
  // usuários: 172 KB por abertura da Comunidade, porque os avatares moram em
  // base64 dentro do perfil. Com ~200 usuários, as aberturas de um dia
  // esgotavam a cota do plano Spark e o app parava para todo mundo. E o
  // Perfil decidia "essa pessoa não existe" pela primeira resposta da
  // escuta — que vem do cache com um documento só (o próprio usuário) — e
  // redirecionava todo link direto de perfil para a Comunidade.
  //
  // Nenhuma tela precisa de todos. Estas três leituras cobrem as cinco, e
  // `npm run check:escala` trava a volta da escuta.

  /** Só os perfis pedidos, em lotes de 30 (limite do `in`), com cache. */
  async getPublicProfilesByIds(ids = []) {
    const wanted = [...new Set((ids || []).filter(Boolean).map(String))];
    const missing = wanted.filter((id) => !publicProfileCache.has(id));
    for (let i = 0; i < missing.length; i += 30) {
      const chunk = missing.slice(i, i + 30);
      try {
        const snapshot = await getDocs(
          query(publicProfilesCollection(), where(documentId(), "in", chunk)),
        );
        snapshot.docs.forEach((item) =>
          publicProfileCache.set(item.id, { id: item.id, ...item.data() }),
        );
        // Quem não voltou não existe: guardar `null` evita pedir de novo.
        chunk.forEach((id) => {
          if (!publicProfileCache.has(id)) publicProfileCache.set(id, null);
        });
      } catch (error) {
        warnFirestoreFallback("getPublicProfilesByIds", error);
      }
    }
    const result = {};
    wanted.forEach((id) => {
      const profile = publicProfileCache.get(id);
      if (profile) result[id] = profile;
    });
    return result;
  },

  /**
   * O servidor respondeu e o perfil não existe — conta excluída. Diferente de
   * "não consegui ler": erro de rede não grava `null` no cache.
   */
  isProfileGone(userId) {
    return publicProfileCache.get(String(userId)) === null;
  },

  /**
   * Um perfil pelo @nome, com resposta do SERVIDOR. `null` quer dizer "não
   * existe" de verdade; erro de leitura é lançado, para a tela distinguir
   * "não existe" de "não consegui ver" em vez de tratar os dois como sumiço.
   */
  async getPublicProfileByUsername(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) return null;
    const snapshot = await getDocsFromServer(
      query(publicProfilesCollection(), where("username", "==", normalized), limit(1)),
    );
    if (snapshot.empty) return null;
    const item = snapshot.docs[0];
    const profile = { id: item.id, ...item.data() };
    publicProfileCache.set(item.id, profile);
    return profile;
  },

  /**
   * Busca por prefixo do @nome e do nome exibido, no máximo `max` pessoas.
   * Sem termo, devolve os perfis atualizados mais recentemente — é o que
   * aparece como sugestão, e nunca a base inteira.
   */
  async searchPublicProfiles(term = "", { max = 20 } = {}) {
    const raw = String(term || "").trim();
    try {
      if (!raw) {
        const snapshot = await getDocs(
          query(publicProfilesCollection(), orderBy("updatedAt", "desc"), limit(max)),
        );
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      }
      const handle = normalizeUsername(raw);
      const name = raw.charAt(0).toUpperCase() + raw.slice(1);
      const prefixo = (campo, valor) =>
        getDocs(
          query(
            publicProfilesCollection(),
            where(campo, ">=", valor),
            where(campo, "<", `${valor}\uf8ff`),
            orderBy(campo),
            limit(max),
          ),
        );
      const [porNome, porHandle] = await Promise.all([
        prefixo("author", name),
        handle ? prefixo("username", handle) : Promise.resolve({ docs: [] }),
      ]);
      const vistos = new Map();
      [...porHandle.docs, ...porNome.docs].forEach((item) => {
        if (!vistos.has(item.id)) vistos.set(item.id, { id: item.id, ...item.data() });
      });
      return [...vistos.values()].slice(0, max);
    } catch (error) {
      warnFirestoreFallback("searchPublicProfiles", error);
      return [];
    }
  },

  subscribeServiceListings(callback, options = {}) {
    const isAdmin = Boolean(options.isAdmin);
    const userId = options.userId || currentUserId;
    const listingsQuery = isAdmin
      ? query(
          collection(firestore, SERVICE_LISTINGS_COLLECTION),
          orderBy("updatedAt", "desc"),
        )
      : query(
          collection(firestore, SERVICE_LISTINGS_COLLECTION),
          where("moderationStatus", "==", SERVICE_STATUS_APPROVED),
        );

    return onSnapshot(
      listingsQuery,
      (snapshot) => {
        const publicListings = snapshot.docs
          .map((item) => normalizeServiceListing({ id: item.id, ...item.data() }))
          .filter((listing) => listing.active)
          .sort((a, b) =>
            String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
          );

        if (isAdmin || !userId) {
          callback(publicListings);
          return;
        }

        const ownerQuery = query(
          collection(firestore, SERVICE_LISTINGS_COLLECTION),
          where("ownerId", "==", userId),
        );

        getDocs(ownerQuery)
          .then((ownerSnapshot) => {
            const byId = new Map(publicListings.map((listing) => [listing.id, listing]));
            ownerSnapshot.docs
              .map((item) => normalizeServiceListing({ id: item.id, ...item.data() }))
              .filter((listing) => listing.active)
              .forEach((listing) => byId.set(listing.id, listing));
            callback(
              Array.from(byId.values()).sort((a, b) =>
                String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
              ),
            );
          })
          .catch((error) => {
            warnFirestoreFallback("subscribeServiceListingsOwner", error);
            callback(publicListings);
          });
      },
      async (error) => {
        warnFirestoreFallback("subscribeServiceListings", error);
        const localListings = (await get("engine_service_listings")) || [];
        callback(
          localListings
            .map(normalizeServiceListing)
            .filter((listing) => listing.active)
            .filter(
              (listing) =>
                isAdmin ||
                listing.ownerId === userId ||
                listing.moderationStatus === SERVICE_STATUS_APPROVED,
            ),
        );
      },
    );
  },

  async saveServiceListing(listing, settings = {}, userId = currentUserId, options = {}) {
    if (!userId) throw new Error("Usuario nao identificado.");

    const isAdmin = Boolean(options.isAdmin);
    const profile = getProfileSnapshot(settings, userId);
    const existingStatus = listing.moderationStatus || SERVICE_STATUS_PENDING;
    const moderationStatus =
      isAdmin && existingStatus === SERVICE_STATUS_APPROVED
        ? SERVICE_STATUS_APPROVED
        : SERVICE_STATUS_PENDING;
    const normalized = normalizeServiceListing({
      ...listing,
      ownerId: isAdmin && listing.ownerId ? listing.ownerId : userId,
      providerName: listing.providerName || profile.author,
      country: listing.country || settings?.profile?.country || "",
      state: listing.state || settings?.profile?.state || "",
      city: listing.city || profile.city,
      email: listing.email || auth.currentUser?.email || "",
      moderationStatus,
      moderationNote: moderationStatus === SERVICE_STATUS_PENDING ? "" : listing.moderationNote,
      reviewedAt: moderationStatus === SERVICE_STATUS_PENDING ? "" : listing.reviewedAt,
      reviewedBy: moderationStatus === SERVICE_STATUS_PENDING ? "" : listing.reviewedBy,
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let sentToServer = true;
    try {
      await withTimeout(
        setDoc(
          doc(firestore, SERVICE_LISTINGS_COLLECTION, normalized.id),
          {
            ...serializeForFirestore(normalized),
            updatedAt: serverTimestamp(),
            createdAt: listing.createdAt || serverTimestamp(),
          },
          { merge: true },
        ),
        "salvar anuncio de servico",
      );
    } catch (error) {
      warnFirestoreFallback("saveServiceListing", error);
      sentToServer = false;
    }

    const localListings = (await get("engine_service_listings")) || [];
    const index = localListings.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      localListings[index] = normalized;
    } else {
      localListings.unshift(normalized);
    }
    await set("engine_service_listings", localListings);
    // A cópia local guarda o rascunho (a pessoa não perde o que escreveu),
    // mas a tela precisa saber que NÃO foi para a fila de aprovação.
    if (!sentToServer) {
      throw new Error(LISTING_NOT_SENT_MESSAGE);
    }
    return normalized;
  },

  async moderateServiceListing(listingId, status, note = "", reviewerId = currentUserId) {
    if (!listingId || !reviewerId) return;
    if (
      ![
        SERVICE_STATUS_APPROVED,
        SERVICE_STATUS_CHANGES_REQUESTED,
        SERVICE_STATUS_REJECTED,
      ].includes(status)
    ) {
      throw new Error("Status de moderacao invalido.");
    }

    const listingRef = doc(firestore, SERVICE_LISTINGS_COLLECTION, String(listingId));
    const listingSnapshot = await getDoc(listingRef).catch((error) => {
      warnFirestoreFallback("moderateServiceListing.get", error);
      return null;
    });
    const listing = listingSnapshot?.exists()
      ? normalizeServiceListing({ id: listingSnapshot.id, ...listingSnapshot.data() })
      : ((await get("engine_service_listings")) || [])
          .map(normalizeServiceListing)
          .find((item) => item.id === String(listingId));
    const cleanNote = String(note || "").trim().slice(0, 600);
    const reviewedAt = new Date().toISOString();
    const historyEntry = {
      status,
      note: cleanNote,
      reviewerId,
      reviewedAt,
    };
    const patch = {
      moderationStatus: status,
      moderationNote: cleanNote,
      reviewedBy: reviewerId,
      reviewedAt,
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(listingRef, {
        ...patch,
        moderationHistory: arrayUnion(historyEntry),
      });
    } catch (error) {
      warnFirestoreFallback("moderateServiceListing.update", error);
      // Antes seguia: marcava aprovado na cópia local E notificava o
      // prestador "seu anúncio foi aprovado" — com o status intacto no
      // servidor e o anúncio invisível ao público.
      throw new Error(MODERATION_NOT_SAVED_MESSAGE);
    }

    const localListings = (await get("engine_service_listings")) || [];
    const localIndex = localListings.findIndex((item) => item.id === String(listingId));
    if (localIndex >= 0) {
      localListings[localIndex] = normalizeServiceListing({
        ...localListings[localIndex],
        ...patch,
        updatedAt: reviewedAt,
        moderationHistory: [
          ...(localListings[localIndex].moderationHistory || []),
          historyEntry,
        ],
      });
      await set("engine_service_listings", localListings);
    }

    if (listing?.ownerId) {
      const notificationType =
        status === SERVICE_STATUS_APPROVED
          ? "service_approved"
          : status === SERVICE_STATUS_CHANGES_REQUESTED
            ? "service_changes_requested"
            : "service_rejected";
      const notificationText =
        status === SERVICE_STATUS_APPROVED
          ? `Seu anuncio ${listing.title} foi aprovado e publicado.`
          : status === SERVICE_STATUS_CHANGES_REQUESTED
            ? `Seu anuncio ${listing.title} voltou para ajustes.`
            : `Seu anuncio ${listing.title} foi recusado.`;

      await this.notifyUser(listing.ownerId, {
        type: notificationType,
        actorId: reviewerId,
        serviceId: String(listingId),
        serviceTitle: listing.title,
        moderationNote: patch.moderationNote,
        targetPath: "/services",
        notificationTitle:
          status === SERVICE_STATUS_APPROVED
            ? "Anúncio aprovado"
            : status === SERVICE_STATUS_CHANGES_REQUESTED
              ? "Alterações solicitadas"
              : "Anúncio recusado",
        notificationBody:
          status === SERVICE_STATUS_APPROVED
            ? "Seu anúncio foi publicado."
            : status === SERVICE_STATUS_CHANGES_REQUESTED
              ? "Revise os comentários do admin."
              : "Confira o motivo enviado pelo admin.",
        text: notificationText,
      });
    }
  },

  async deleteServiceListing(listingId, userId = currentUserId) {
    if (!listingId || !userId) return;

    try {
      await withTimeout(
        deleteDoc(doc(firestore, SERVICE_LISTINGS_COLLECTION, String(listingId))),
        "excluir anuncio de servico",
      );
    } catch (error) {
      warnFirestoreFallback("deleteServiceListing", error);
      throw new Error(NOT_DELETED_MESSAGE);
    }

    const localListings = (await get("engine_service_listings")) || [];
    await set(
      "engine_service_listings",
      localListings.filter((item) => item.id !== String(listingId)),
    );
  },

  async shareCommunityGoal(goal, settings, userId = currentUserId, note = "", club = null) {
    if (!userId) throw new Error("Usuário não identificado.");

    // Sem branch de API por dois motivos concretos, os dois verificados no
    // EngineFirestoreService.shareCommunityGoal:
    //  - ele descarta a legenda recebida e grava `profile.note`, que é a BIO
    //    do perfil — por isso a descrição escrita na hora nunca aparecia;
    //  - ele grava só `image`, sem `images`, então a publicação saía com uma
    //    foto só, em vez da galeria do carro.
    const payload = buildCommunityGoal(goal, userId, settings, note, club);
    const goalRef = doc(firestore, COMMUNITY_COLLECTION, payload.id);
    const existing = await getDoc(goalRef);
    const existingData = existing.exists() ? existing.data() : {};

    await setDoc(
      goalRef,
      {
        ...payload,
        likesCount: existingData.likesCount ?? 0,
        comments: existingData.comments || [],
        ratingsBy: existingData.ratingsBy || {},
        createdAt: existingData.createdAt || payload.createdAt,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return payload.id;
  },

  /**
   * Publica um post livre no feed: texto, fotos e link de vídeo, podendo ou
   * não estar amarrado a um carro da garagem.
   *
   * Vai para a mesma coleção das metas, marcado com `kind: "post"`, então
   * herda curtida, comentário, denúncia, bloqueio e as regras de segurança
   * que já existem — inclusive a que impede um visitante de editar conteúdo
   * alheio.
   */
  async createCommunityPost({
    text,
    images = [],
    videoUrl = "",
    car = null,
    // Carimbo de clube: campos NOVOS e opcionais. Post do mural de um clube é
    // um post da Comunidade marcado, não uma coleção paralela — herda card,
    // curtida em subcoleção, comentário, denúncia e bloqueio, e ainda aparece
    // no feed geral com o chip `[TAG]`, que é propaganda do clube. A regra do
    // Firestore exige ser MEMBRO para gravar o carimbo.
    clubId = "",
    clubTag = "",
  }) {
    if (!currentUserId) throw new Error("Entre na sua conta para publicar.");

    const content = String(text || "").trim().slice(0, 1000);
    const photos = images.map((item) => String(item || "").trim()).filter(Boolean);
    if (!content && !photos.length && !videoUrl) {
      throw new Error("Escreva algo ou adicione uma foto.");
    }

    const settings = await this.getSettings();
    const profile = getProfileSnapshot(settings, currentUserId);
    const id = `post-${currentUserId}-${Date.now()}`;

    const payload = {
      id,
      kind: POST_KIND_POST,
      userId: currentUserId,
      ownerId: currentUserId,
      author: profile.author,
      username: profile.username,
      avatar: profile.avatar,
      avatarInitials: profile.avatarInitials,
      city: profile.city,
      note: content,
      images: photos.slice(0, MAX_CAR_PHOTOS),
      image: photos[0] || "",
      videoUrl: String(videoUrl || "").trim().slice(0, 300),
      // Quando o post nasce de um carro da garagem, guarda a identificação
      // dele: é o que deixa o perfil virar linha do tempo daquele veículo.
      carId: car?.id ? String(car.id) : "",
      title: car ? `${car.brand} ${car.model}`.trim() : "",
      brand: car?.brand || "",
      model: car?.model || "",
      year: car?.year || "",
      // "" e não ausente: a consulta do mural é igualdade em `clubId`, e campo
      // que às vezes existe e às vezes não é o tipo de dado que faz uma
      // consulta devolver menos do que devia sem ninguém notar.
      clubId: String(clubId || ""),
      clubTag: String(clubTag || ""),
      likesCount: 0,
      comments: [],
      ratingsBy: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Mesmo teto do carro: sem Storage, a foto vai em base64 dentro do
    // documento e o Firestore recusa acima de 1 MiB.
    assertCarFitsDocument(payload);

    await setDoc(doc(firestore, COMMUNITY_COLLECTION, id), payload);
    return id;
  },

  /** Edita só a legenda de uma publicação já no ar. */
  async updateCommunityGoalNote(goalId, note, userId = currentUserId) {
    if (!userId || !goalId) return;

    const text = String(note || "").trim().slice(0, 280);

    // Sem branch de API: não existe PATCH /community/goals/{id} no backend
    // Java (só /like e /rating), então delegar pra lá derrubava o salvamento
    // da legenda em dev.
    await updateDoc(doc(firestore, COMMUNITY_COLLECTION, String(goalId)), {
      note: text,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteCommunityGoal(goal, userId = currentUserId) {
    if (!userId) return;
    const goalId = communityGoalId(goal, userId);

    // Sem branch de API: é o mesmo caminho de escrita das outras publicações,
    // e manter os dois já custou seis bugs entre ontem e hoje.
    await Promise.all([
      deleteDoc(doc(firestore, COMMUNITY_COLLECTION, goalId)),
      deleteDoc(doc(firestore, COMMUNITY_COLLECTION, legacyCommunityGoalId(goal, userId))),
    ]);
  },

  async resetMyCommunityPublications(userId = currentUserId) {
    if (!userId) return;

    if (apiEnabled()) {
      await apiRequest("/community/goals", { method: "DELETE" });
      return;
    }

    const snapshot = await getDocs(
      query(collection(firestore, COMMUNITY_COLLECTION), where("ownerId", "==", userId)),
    );
    const batch = writeBatch(firestore);
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    if (!snapshot.empty) await batch.commit();
  },

  async syncCommunityProfile(settings, userId = currentUserId) {
    if (!userId) return;
    if (apiEnabled()) return;

    const profile = getProfileSnapshot(settings, userId);
    const snapshot = await getDocs(
      query(collection(firestore, COMMUNITY_COLLECTION), where("ownerId", "==", userId)),
    );
    const batch = writeBatch(firestore);

    snapshot.docs.forEach((item) => {
      batch.update(item.ref, {
        author: profile.author,
        username: profile.username,
        avatar: profile.avatar,
        avatarInitials: profile.avatarInitials,
        city: profile.city,
        note: profile.note,
        updatedAt: serverTimestamp(),
      });
    });

    if (!snapshot.empty) await batch.commit();
  },

  async syncCommunityCar(car, userId = currentUserId) {
    if (!userId || apiEnabled()) return;

    const goalIds = [
      communityGoalId(car, userId),
      legacyCommunityGoalId(car, userId),
    ];
    const batch = writeBatch(firestore);
    let hasUpdates = false;

    await Promise.all(
      goalIds.map(async (goalId) => {
        const goalRef = doc(firestore, COMMUNITY_COLLECTION, goalId);
        const snapshot = await getDoc(goalRef);
        if (!snapshot.exists()) return;
        batch.update(goalRef, communityCarPatch(car));
        hasUpdates = true;
      }),
    );

    if (hasUpdates) await batch.commit();
  },

  async syncPublicProfile(settings, userId = currentUserId) {
    if (!userId || apiEnabled()) return;

    await setDoc(publicProfileDoc(userId), buildPublicProfile(settings, userId), {
      merge: true,
    });
  },

  /**
   * Quantas curtidas UM post tem, contadas na subcoleção.
   *
   * Diferente de `likesCount`, que fica no documento do post e é mantido por
   * quem curte: aquele é número de vitrine, e a regra só consegue prender o
   * passo em 1 pra cima ou 1 pra baixo. Este aqui conta a fonte, e ninguém
   * escreve no documento de curtida alheio. Marco de conquista se decide por
   * este, nunca pelo outro.
   */
  /**
   * Confere os degraus de curtida do dono do post e concede o que faltar.
   *
   * Roda no cliente de QUEM CURTIU — é escrita no perfil de outra pessoa, e a
   * regra do Firestore é a defesa: lista fechada de ids e corpo de um campo só.
   * Falha aqui nunca derruba a curtida: o selo é consequência, não o ato.
   */
  /**
   * Confere os marcos que dependem só da garagem da pessoa.
   *
   * Recebe os carros que o chamador já tem em mãos, para não ler de novo. Passa
   * fatos, não carros: quem sabe o que é tipo de carro e aporte total é aqui, e
   * o serviço de conquistas fica sem essa responsabilidade.
   *
   * Devolve os marcos que ESTA chamada concedeu, para a tela comemorar. Não
   * gera notificação: a pessoa está olhando.
   */
  async sincronizarMarcosDaGaragem(cars = []) {
    if (!currentUserId || !cars.length) return [];
    try {
      return await syncOwnMilestones(currentUserId, {
        temMeta: cars.some((car) => car.type !== CAR_TYPE_OWNED),
        temProprio: cars.some((car) => car.type === CAR_TYPE_OWNED),
        temConquistado: cars.some(
          (car) => Number(car.targetValue) > 0 && Number(car.savedValue) >= Number(car.targetValue),
        ),
      });
    } catch (error) {
      warnFirestoreFallback("sincronizarMarcosDaGaragem", error);
      return [];
    }
  },

  async concederDegrausDeCurtida(ownerId, goalTitle) {
    if (!ownerId) return;
    try {
      const total = await this.countLikesReceived(ownerId);
      const novos = await syncLikeAchievements(ownerId, total);
      for (const id of novos) {
        // Quem recebeu o selo pode estar offline: por isso vira notificação, e
        // não um aviso na tela de quem curtiu.
        await this.notifyUser(ownerId, {
          type: "achievement",
          achievementId: id,
          goalTitle: goalTitle || "",
          targetPath: "/settings",
          notificationTitle: "Conquista desbloqueada",
          // Diz QUAL, e não "uma conquista": o aviso genérico obriga a abrir o
          // perfil pra descobrir o que aconteceu.
          notificationBody: `Sua garagem passou de ${new Intl.NumberFormat("pt-BR").format(
            Number(id.replace("likes_", "")),
          )} curtidas.`,
          text: "Você desbloqueou uma conquista.",
        });
      }
    } catch (error) {
      warnFirestoreFallback("concederDegrausDeCurtida", error);
    }
  },

  async countPostLikes(goalId) {
    if (!goalId) return 0;
    try {
      const alvo = collection(firestore, COMMUNITY_COLLECTION, goalId, LIKES_SUBCOLLECTION);
      return (await getCountFromServer(alvo)).data().count;
    } catch (error) {
      warnFirestoreFallback("countPostLikes", error);
      return 0;
    }
  },

  /**
   * Total de curtidas que a pessoa recebeu somando todos os posts dela.
   *
   * Uma consulta de grupo em vez de abrir post por post — é o número que os
   * degraus de 1k a 1M olham. Também não dá pra forjar: `postOwnerId` é
   * conferido contra o dono real do post na regra de escrita.
   */
  async countLikesReceived(userId) {
    if (!userId) return 0;
    try {
      const alvo = query(
        collectionGroup(firestore, LIKES_SUBCOLLECTION),
        where("postOwnerId", "==", userId),
      );
      return (await getCountFromServer(alvo)).data().count;
    } catch (error) {
      warnFirestoreFallback("countLikesReceived", error);
      return 0;
    }
  },

  async getPublicProfile(userId) {
    if (!userId) return null;

    if (apiEnabled()) {
      return apiRequest(`/community/users/${userId}`);
    }

    const [profileSnapshot, goalsSnapshot, followersSnapshot, myFollowSnapshot] =
      await Promise.all([
        getDoc(publicProfileDoc(userId)),
        getDocs(query(collection(firestore, COMMUNITY_COLLECTION), where("ownerId", "==", userId))),
        // Agregação em vez de baixar todo seguidor só para tirar o `.size`:
        // com mil seguidores isso eram mil leituras para mostrar um número.
        getCountFromServer(followersCollection(userId)).catch(() => null),
        currentUserId && currentUserId !== userId
          ? getDoc(followerDoc(userId, currentUserId)).catch(() => null)
          : Promise.resolve(null),
      ]);

    const goals = goalsSnapshot.docs.map((item) =>
      normalizeCommunityGoal({ id: item.id, ...item.data() }),
    );
    const totalProgress = goals.reduce((sum, goal) => {
      const target = Number(goal.targetValue) || 0;
      return sum + (target ? Math.min((Number(goal.savedValue) / target) * 100, 100) : 0);
    }, 0);

    // O doc em publicProfiles só nasce quando a pessoa salva os ajustes; até
    // lá, os dados do autor que viajam junto de cada meta são a melhor fonte
    // (antes caíamos num "Usuário Engine / @engine" genérico).
    const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
    const fromGoals = goals[0] || {};
    const pick = (...values) => values.find(Boolean) || "";

    return {
      id: userId,
      userId,
      ...profile,
      author: pick(profile.author, fromGoals.author, "Usuário Engine"),
      username: pick(profile.username, fromGoals.username, "@engine"),
      avatar: pick(profile.avatar, fromGoals.avatar),
      avatarInitials: pick(profile.avatarInitials, fromGoals.avatarInitials),
      city: pick(profile.city, fromGoals.city, "Engine Garage"),
      note: pick(profile.note, fromGoals.note),
      goals,
      goalsCount: goals.length,
      likesCount: goals.reduce(
        (sum, goal) =>
          sum +
          (typeof goal.likesCount === "number"
            ? goal.likesCount
            : Object.keys(goal.likesBy || {}).length),
        0,
      ),
      averageProgress: goals.length ? totalProgress / goals.length : 0,
      followersCount: followersSnapshot?.data?.().count || 0,
      isFollowedByMe: Boolean(myFollowSnapshot?.exists?.()),
    };
  },

  // Segue / deixa de seguir uma pessoa: grava (ou remove) o doc do seguidor
  // em publicProfiles/{alvo}/followers/{eu}. A notificação de novo seguidor
  // continua saindo de quem chama (Community.handleFollow).
  async setFollow(targetUserId, isFollowing, followerId = currentUserId) {
    if (!targetUserId || !followerId || targetUserId === followerId) return;

    // Sem branch de API aqui de propósito: o endpoint /users/{id}/follow só
    // dispara notificação (quem chama isso é notifyFollow). Delegar pra ele
    // deixava o vínculo sem gravar nenhum lado e ainda notificava duas vezes.
    const followerRef = followerDoc(targetUserId, followerId);
    const followingRef = followingDoc(followerId, targetUserId);

    if (isFollowing) {
      const actorSettings = await this.getSettings();
      const actor = getProfileSnapshot(actorSettings, followerId);

      await Promise.all([
        setDoc(followerRef, {
          followerId,
          author: actor.author,
          username: actor.username,
          avatar: actor.avatar,
          avatarInitials: actor.avatarInitials,
          createdAt: serverTimestamp(),
        }),
        // O espelho guarda só o id do alvo: os dados de exibição vêm de
        // publicProfiles na hora de renderizar, então nunca ficam defasados.
        setDoc(followingRef, {
          userId: targetUserId,
          createdAt: serverTimestamp(),
        }),
      ]);

      // Mesma forma do degrau de curtida: quem segue é quem detecta.
      try {
        const total = (await getCountFromServer(followersCollection(targetUserId)))
          .data()
          .count;
        if (total >= 1000 && (await grantAchievement(targetUserId, "followers_1000"))) {
          await this.notifyUser(targetUserId, {
            type: "achievement",
            achievementId: "followers_1000",
            targetPath: "/settings",
            notificationTitle: "Conquista desbloqueada",
            notificationBody: "Mil pessoas seguem sua garagem.",
            text: "Você alcançou 1.000 seguidores.",
          });
        }
      } catch (error) {
        warnFirestoreFallback("marco de seguidores", error);
      }
      // A notificação mora AQUI, e não em quem chama. Havia dois botões de
      // seguir: o do card no feed chamava setFollow + notifyFollow; o da
      // página de perfil chamava só followUser → setFollow. Mesmo vínculo
      // gravado, mas "Novo seguidor" só saía por um deles (auditoria de
      // 25/09/2026). Só notifica quando quem segue é quem está no app.
      if (followerId === currentUserId) {
        await this.notifyFollow(targetUserId).catch((error) =>
          warnFirestoreFallback("notifyFollow", error),
        );
      }
    } else {
      await Promise.all([
        deleteDoc(followerRef),
        deleteDoc(followingRef),
      ]);
    }
  },

  async getUserGoals(userId) {
    if (!userId) return [];

    try {
      const goalsQuery = query(
        collection(firestore, COMMUNITY_COLLECTION),
        where("userId", "==", userId),
      );
      const snapshot = await getDocs(goalsQuery);
      return snapshot.docs
        .map((item) =>
          normalizeCommunityGoal({ id: item.id, ...item.data() }),
        )
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    } catch (error) {
      console.error("Error fetching user goals:", error);
      return [];
    }
  },

  async getUserFollowers(userId) {
    if (!userId) return [];

    try {
      const snapshot = await getDocs(followersCollection(userId));
      return snapshot.docs.map((doc) => ({
        userId: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Error fetching followers:", error);
      return [];
    }
  },

  async getUserFollowing(userId) {
    if (!userId) return [];

    try {
      const snapshot = await getDocs(followingCollection(userId));
      // O id do doc é o uid de quem está sendo seguido.
      return snapshot.docs.map((doc) => doc.id);
    } catch (error) {
      console.error("Error fetching user following:", error);
      return [];
    }
  },

  /**
   * Abre uma denúncia. Só a moderação lê a coleção `reports` — quem denuncia
   * não relê a própria denúncia, para ninguém mapear o que já foi reportado.
   */
  async reportContent({ targetType, targetId, reportedUserId = "", reason = "" }) {
    if (!currentUserId || !targetId) return;

    await addDoc(collection(firestore, REPORTS_COLLECTION), {
      targetType: String(targetType || "goal"),
      targetId: String(targetId),
      reportedUserId: String(reportedUserId || ""),
      reporterId: currentUserId,
      reason: String(reason || "").slice(0, 280),
      status: "pending",
      createdAt: serverTimestamp(),
    });
  },

  /**
   * Conta uma visita, uma abertura de anúncio ou um clique no WhatsApp.
   *
   * O contador vive no próprio documento do anúncio, e as regras só deixam
   * subir de um em um — não dá pra zerar nem inflar a métrica alheia. Aqui do
   * lado do cliente a trava é o sessionStorage: recarregar a página não conta
   * de novo. Não é auditoria, é ordem de grandeza — o que o prestador precisa
   * pra saber se está valendo.
   */
  async trackServiceListingMetric(listingId, metric) {
    const fields = {
      view: "viewCount",
      detail: "detailCount",
      whatsapp: "whatsappCount",
    };
    const field = fields[metric];
    if (!listingId || !field) return;

    const onceKey = `engine_metric:${listingId}:${metric}`;
    try {
      if (window.sessionStorage.getItem(onceKey)) return;
      window.sessionStorage.setItem(onceKey, "1");
    } catch {
      // Navegador com storage bloqueado: conta assim mesmo, sem a trava.
    }

    try {
      await updateDoc(doc(firestore, SERVICE_LISTINGS_COLLECTION, String(listingId)), {
        [field]: increment(1),
      });
    } catch (error) {
      // Métrica nunca pode atrapalhar quem está usando o app.
      warnFirestoreFallback("trackServiceListingMetric", error);
    }
  },

  async getBlockedUsers(userId = currentUserId) {
    if (!userId) return [];

    try {
      const snapshot = await getDoc(userModerationDoc(userId));
      return snapshot.exists() ? snapshot.data().blockedUserIds || [] : [];
    } catch (error) {
      warnFirestoreFallback("getBlockedUsers", error);
      return [];
    }
  },

  async setUserBlocked(targetUserId, blocked, userId = currentUserId) {
    if (!userId || !targetUserId || targetUserId === userId) return;

    await setDoc(
      userModerationDoc(userId),
      {
        blockedUserIds: blocked ? arrayUnion(targetUserId) : arrayRemove(targetUserId),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  },

  async followUser(followerId, targetUserId) {
    if (!followerId || !targetUserId || followerId === targetUserId) return;
    await this.setFollow(targetUserId, true, followerId);
  },

  async unfollowUser(followerId, targetUserId) {
    if (!followerId || !targetUserId || followerId === targetUserId) return;
    await this.setFollow(targetUserId, false, followerId);
  },

  async notifyUser(userId, notification) {
    const actorId = notification?.actorId || currentUserId;
    if (!userId || userId === actorId) return;

    await addDoc(userNotificationsCollection(userId), {
      ...notification,
      actorId,
      recipientId: userId,
      read: false,
      createdAt: serverTimestamp(),
    });
  },

  async notifyFollow(userId) {
    if (!userId || userId === currentUserId) return;

    if (apiEnabled()) {
      await apiRequest(`/community/users/${userId}/follow`, { method: "POST" });
      return;
    }

    const actorSettings = await this.getSettings();
    const actor = getProfileSnapshot(actorSettings, currentUserId);
    await this.notifyUser(userId, {
      type: "follow",
      actorId: currentUserId,
      actorName: actor.author,
      actorUsername: actor.username,
      targetPath: `/community?user=${encodeURIComponent(currentUserId)}`,
      notificationTitle: "Novo seguidor",
      notificationBody: `${actor.author} começou a seguir sua garagem.`,
      text: `${actor.author} começou a seguir sua garagem.`,
    });
  },

  subscribeNotifications(userId = currentUserId, callback) {
    if (!userId) return () => {};

    if (apiEnabled()) {
      let active = true;
      const load = async () => {
        try {
          const notifications = await apiRequest("/notifications");
          if (active) callback(notifications);
        } catch (error) {
          warnFirestoreFallback("subscribeNotifications", error);
          if (active) callback([]);
        }
      };
      load();
      const interval = window.setInterval(load, 10000);
      return () => {
        active = false;
        window.clearInterval(interval);
      };
    }

    return onSnapshot(
      query(userNotificationsCollection(userId), orderBy("createdAt", "desc")),
      (snapshot) => {
        callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      },
      (error) => {
        warnFirestoreFallback("subscribeNotifications", error);
        callback([]);
      },
    );
  },

  async markNotificationsRead(userId = currentUserId) {
    if (!userId) return;

    if (apiEnabled()) {
      await apiRequest("/notifications/read", { method: "PATCH" });
      return;
    }

    const snapshot = await getDocs(userNotificationsCollection(userId));
    const batch = writeBatch(firestore);
    snapshot.docs
      .filter((item) => !item.data().read)
      .forEach((item) => batch.update(item.ref, { read: true }));

    if (!snapshot.empty) await batch.commit();
  },

  async toggleCommunityLike(goalId, liked, userId = currentUserId) {
    if (!userId) return;

    if (apiEnabled()) {
      await apiJson("PATCH", `/community/goals/${goalId}/like`, { liked });
      return;
    }

    const goalRef = doc(firestore, COMMUNITY_COLLECTION, goalId);
    const goal = await getDoc(goalRef);
    const goalData = goal.exists() ? goal.data() : null;

    // A curtida virou um documento com o uid como id, na subcoleção `likes`.
    // Antes era uma chave no mapa `likesBy`, dentro do próprio post — e
    // documento no Firestore tem teto de 1 MiB, dividido com os comentários.
    // Medido em 22/08/2026: o post travava em ~16.900 curtidas, e em ~2.800
    // quando tinha 2.000 comentários. Quanto mais viral, menor o teto.
    //
    // `likesCount` fica no post só como número de vitrine, para a lista não
    // precisar contar a subcoleção post a post. Quem manda na verdade é a
    // subcoleção: marco de conquista se conta lá, com getCountFromServer, que
    // ninguém consegue forjar.
    const likeRef = doc(goalRef, LIKES_SUBCOLLECTION, userId);
    const jaCurtiu = (await getDoc(likeRef)).exists();

    if (liked && !jaCurtiu) {
      await setDoc(likeRef, {
        likerId: userId,
        postOwnerId: goalData?.ownerId || "",
        createdAt: serverTimestamp(),
      });
      await updateDoc(goalRef, { likesCount: increment(1), updatedAt: serverTimestamp() });
      myLikedGoalIds.add(goalId);

      // Sem Cloud Function, quem detecta o marco é quem acabou de curtir. O
      // total vem da subcoleção, não do `likesCount` do post: aquele é vitrine
      // e a regra só prende o passo em 1, então dava pra empurrar até o selo.
      await this.concederDegrausDeCurtida(goalData?.ownerId, goalData?.title);
    } else if (!liked && jaCurtiu) {
      await deleteDoc(likeRef);
      await updateDoc(goalRef, { likesCount: increment(-1), updatedAt: serverTimestamp() });
      myLikedGoalIds.delete(goalId);
    }

    if (liked && goalData) {
      const actorSettings = await this.getSettings();
      const actor = getProfileSnapshot(actorSettings, userId);
      await this.notifyUser(goalData.ownerId, {
        type: "like",
        actorId: userId,
        actorName: actor.author,
        actorUsername: actor.username,
        goalId,
        goalTitle: goalData.title,
        targetPath: `/community?goal=${encodeURIComponent(goalId)}`,
        notificationTitle: "Nova curtida",
        notificationBody: `${actor.author} curtiu sua publicação.`,
        text: `${actor.author} curtiu sua meta ${goalData.title}.`,
      });
    }
  },

  async addCommunityComment(goalId, comment, userId = currentUserId) {
    if (!userId) return;

    if (apiEnabled()) {
      await apiJson("POST", `/community/goals/${goalId}/comments`, { comment });
      return;
    }

    const goalRef = doc(firestore, COMMUNITY_COLLECTION, goalId);
    const goal = await getDoc(goalRef);
    const goalData = goal.exists() ? goal.data() : null;
    const actorSettings = await this.getSettings();
    const actor = getProfileSnapshot(actorSettings, userId);
    const commentId = crypto.randomUUID();

    await updateDoc(goalRef, {
      comments: arrayUnion({
        id: commentId,
        userId,
        author: actor.author,
        username: actor.username,
        avatar: actor.avatar,
        avatarInitials: actor.avatarInitials,
        text: String(comment).trim().slice(0, 180),
        createdAt: new Date().toISOString(),
      }),
      updatedAt: serverTimestamp(),
    });

    if (goalData) {
      await this.notifyUser(goalData.ownerId, {
        type: "comment",
        actorId: userId,
        actorName: actor.author,
        actorUsername: actor.username,
        goalId,
        goalTitle: goalData.title,
        commentId,
        targetPath: `/community?goal=${encodeURIComponent(goalId)}&comments=1`,
        notificationTitle: "Novo comentário",
        notificationBody: `${actor.author} comentou na sua publicação.`,
        text: `${actor.author} comentou na sua meta ${goalData.title}.`,
      });
    }
  },

  async updateCommunityComment(goalId, commentId, text, userId = currentUserId) {
    if (!userId || !goalId || !commentId) return;

    const goalRef = doc(firestore, COMMUNITY_COLLECTION, String(goalId));
    const snapshot = await getDoc(goalRef);
    if (!snapshot.exists()) return;

    const comments = Array.isArray(snapshot.data().comments)
      ? snapshot.data().comments
      : [];
    const updatedComments = comments.map((comment) => {
      if (comment?.id !== commentId || comment?.userId !== userId) return comment;
      return {
        ...comment,
        text: String(text || "").trim().slice(0, 180),
        editedAt: new Date().toISOString(),
      };
    });

    await updateDoc(goalRef, {
      comments: updatedComments,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteCommunityComment(goalId, commentId, userId = currentUserId) {
    if (!userId || !goalId || !commentId) return;

    const goalRef = doc(firestore, COMMUNITY_COLLECTION, String(goalId));
    const snapshot = await getDoc(goalRef);
    if (!snapshot.exists()) return;

    const goalData = snapshot.data();
    const comments = Array.isArray(goalData.comments) ? goalData.comments : [];
    const updatedComments = comments.filter(
      (comment) =>
        comment?.id !== commentId ||
        (comment?.userId !== userId && goalData.ownerId !== userId),
    );

    await updateDoc(goalRef, {
      comments: updatedComments,
      updatedAt: serverTimestamp(),
    });
  },

  async rateCommunityGoal(goalId, rating, userId = currentUserId) {
    if (!userId) return;

    if (apiEnabled()) {
      await apiJson("PATCH", `/community/goals/${goalId}/rating`, { rating });
      return;
    }

    const goalRef = doc(firestore, COMMUNITY_COLLECTION, goalId);
    const goal = await getDoc(goalRef);
    const goalData = goal.exists() ? goal.data() : null;

    await updateDoc(goalRef, {
      [`ratingsBy.${userId}`]: Math.max(1, Math.min(Number(rating) || 1, 5)),
      updatedAt: serverTimestamp(),
    });

    if (goalData && goalData.ownerId !== userId) {
      const actorSettings = await this.getSettings();
      const actor = getProfileSnapshot(actorSettings, userId);
      await this.notifyUser(goalData.ownerId, {
        type: "rating",
        actorId: userId,
        actorName: actor.author,
        actorUsername: actor.username,
        goalId,
        goalTitle: goalData.title,
        targetPath: `/community?goal=${encodeURIComponent(goalId)}`,
        notificationTitle: "Nova avaliação",
        notificationBody: `${actor.author} avaliou sua publicação.`,
        text: `${actor.author} avaliou sua meta ${goalData.title}.`,
      });
    }
  },

  async getSettings() {
    if (!currentUserId) {
      const settings = await getLocalSettings();
      return normalizeSettings(settings);
    }

    if (apiEnabled()) {
      const settings = await recoverSettingsAvatar(await apiRequest("/settings"));
      await setLocalSettings(settings);
      return settings;
    }

    try {
      const snapshot = await withTimeout(
        getDoc(userSettingsDoc()),
        "buscar configuracoes",
      );
      const settings = snapshot.exists() ? snapshot.data() : {};
      const normalized = await recoverSettingsAvatar(settings);
      await setLocalSettings(normalized);
      if (!settings?.profile?.avatar && normalized.profile.avatar) {
        setDoc(
          userSettingsDoc(),
          { profile: { avatar: normalized.profile.avatar } },
          { merge: true },
        ).catch((error) => warnFirestoreFallback("persistRecoveredAvatar", error));
      }
      return normalized;
    } catch (error) {
      warnFirestoreFallback("getSettings", error);
      const settings = await getLocalSettings();
      return recoverSettingsAvatar(settings);
    }
  },

  async saveSettings(settings, userId = currentUserId) {
    const mergedSettings = normalizeSettings(settings);

    if (!userId) {
      await this.reserveUsername(mergedSettings.profile.username, userId);
      await setLocalSettings(mergedSettings, userId);
      return mergedSettings;
    }

    if (apiEnabled()) {
      const savedSettings = normalizeSettings(
        await apiJson("PUT", "/settings", mergedSettings),
      );
      await setLocalSettings(savedSettings, userId);
      return savedSettings;
    }

    await this.reserveUsername(mergedSettings.profile.username, userId);

    let savedToServer = true;
    try {
      await withTimeout(
        setDoc(userSettingsDoc(userId), serializeForFirestore(mergedSettings), {
          merge: true,
        }),
        "salvar configuracoes",
      );
    } catch (error) {
      warnFirestoreFallback("saveSettings", error);
      savedToServer = false;
    }

    await setLocalSettings(mergedSettings, userId);
    if (!savedToServer) {
      throw new Error(SETTINGS_NOT_SYNCED_MESSAGE);
    }
    await this.syncPublicProfile(mergedSettings, userId).catch((error) =>
      warnFirestoreFallback("syncPublicProfile", error),
    );
    await this.syncCommunityProfile(mergedSettings, userId).catch((error) =>
      warnFirestoreFallback("syncCommunityProfile", error),
    );
    return mergedSettings;
  },

  async resetSettings() {
    if (!currentUserId) {
      await del(LEGACY_SETTINGS_KEY);
      return defaultSettings;
    }

    if (apiEnabled()) {
      return normalizeSettings(await apiRequest("/settings", { method: "DELETE" }));
    }

    await deleteDoc(userSettingsDoc());
    return defaultSettings;
  },

  async reserveUsername(username, userId = currentUserId) {
    const normalized = normalizeUsername(username);
    if (!normalized) return "";

    if (!userId || userId === "pending") {
      const registry = (await get(USERNAME_REGISTRY_KEY)) || {};
      const owner = registry[normalized];

      if (owner && owner !== userId && owner !== "pending") {
        throw usernameTakenError();
      }

      await set(USERNAME_REGISTRY_KEY, {
        ...registry,
        [normalized]: userId,
      });

      return normalized;
    }

    const usernameRef = doc(firestore, USERNAMES_COLLECTION, usernameDocId(normalized));
    await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(usernameRef);
      const owner = snapshot.exists() ? snapshot.data().userId : null;

      if (owner && owner !== userId) {
        throw usernameTakenError();
      }

      transaction.set(usernameRef, {
        username: normalized,
        userId,
        updatedAt: serverTimestamp(),
      });
    });

    return normalized;
  },

  /**
   * O nome já é de alguém? Consultado ANTES de criar a conta no Auth.
   *
   * Até 25/09/2026 o cadastro criava a conta primeiro e só depois descobria
   * que o nome era repetido: a conta nascia órfã (sem nome, sem perfil), a
   * tela dizia "não foi possível criar sua conta", e na segunda tentativa —
   * com outro nome — a pessoa recebia "este e-mail já está cadastrado".
   * Preso fora do app com o próprio e-mail.
   *
   * Devolve `null` quando não dá pra saber (regra antiga ainda publicada, sem
   * rede): quem chama segue, e a reserva transacional depois da criação da
   * conta continua sendo a trava de verdade.
   */
  async isUsernameAvailable(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) return false;
    try {
      const snapshot = await getDoc(doc(firestore, USERNAMES_COLLECTION, usernameDocId(normalized)));
      return !snapshot.exists();
    } catch {
      return null;
    }
  },

  async releasePendingUsername(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) return;

    const registry = (await get(USERNAME_REGISTRY_KEY)) || {};
    if (registry[normalized] === "pending") {
      delete registry[normalized];
      await set(USERNAME_REGISTRY_KEY, registry);
    }
  },

  normalizeUsername,
  normalizePhone,

  getDefaultSettings() {
    return defaultSettings;
  },

  getDefaultCommunityState() {
    return defaultCommunityState;
  },


};
