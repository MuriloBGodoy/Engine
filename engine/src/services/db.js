import { get, set, del } from "idb-keyval";
import { auth, must, nowIso, supabase, watchTable } from "./supabase";
import {
  grantOwn,
  grantSeries,
  garageAchievementIds,
  syncLikeAchievements,
  syncOwnMilestones,
} from "./achievements";
import { inferLocation } from "./locations";
import { listingEditNeedsReview, PRICE_MAX_LENGTH } from "./serviceListingRules";
import { normalizeOwnershipInputs, LIFE_SITUATION_TYPES } from "./ownership";
import { normalizeExpense, normalizeExpenses, realConsumption } from "./expenses";
import { localISODate } from "./garageInput";
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
    // Capa do perfil, data URI reduzido (ver BANNER em services/imagens).
    banner: "",
  },
  // Só entra aqui o que alguma tela LÊ. Até 05/10/2026 a página de
  // configurações exibia moeda, fuso, densidade, página inicial, meta anual,
  // alertas por e-mail, 2FA e tempo de sessão — chaves gravadas e nunca
  // consultadas por ninguém. Documentos antigos ainda as carregam; são inertes.
  preferences: {
    // Vazio = seguir o idioma do navegador (ver services/languageChoice.js).
    // Era "pt-BR", e o App aplicava o default por cima da detecção.
    language: "",
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
const SERVICE_STATUS_APPROVED = "approved";
const SERVICE_STATUS_PENDING = "pending";
const SERVICE_STATUS_CHANGES_REQUESTED = "changes_requested";
const SERVICE_STATUS_REJECTED = "rejected";
// Tirado do ar pela moderação depois de aprovado (denúncia, golpe, foto alheia).
const SERVICE_STATUS_SUSPENDED = "suspended";
const FIRESTORE_TIMEOUT_MS = 7000;
// Carro antigo ainda pode trazer foto em base64 guardada neste aparelho; a
// leitura do servidor já vem com URL do Storage desde a migração.
const CARS_TIMEOUT_MS = 20000;
const COMMUNITY_GOALS_PAGE_SIZE = 20;

// --- linhas do banco <-> objetos das telas ---------------------------------
//
// No Supabase cada coleção virou tabela: o que regra e consulta enxergam é
// coluna, o resto mora em `data`. As telas continuam recebendo o objeto plano
// de sempre (`goal.ownerId`, `goal.likesCount`...), montado aqui.

const omitKeys = (object, keys) =>
  Object.fromEntries(Object.entries(object || {}).filter(([key]) => !keys.includes(key)));

const GOAL_COLUMN_KEYS = [
  "id", "ownerId", "userId", "kind", "clubId", "likesCount", "likesBy", "comments",
  "ratingsBy", "createdAt", "updatedAt",
];

const goalFromRow = (row) => ({
  ...(row.data || {}),
  id: row.id,
  ownerId: row.owner_id,
  userId: row.owner_id,
  kind: row.kind,
  clubId: row.club_id,
  likesCount: row.likes_count,
  comments: row.comments || [],
  ratingsBy: row.ratings_by || {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Só o conteúdo: curtida, comentário e avaliação o banco não deixa o dono escrever. */
const goalToRow = (goal) => ({
  id: goal.id,
  owner_id: goal.ownerId,
  kind: goal.kind === POST_KIND_POST ? POST_KIND_POST : POST_KIND_GOAL,
  club_id: String(goal.clubId || ""),
  data: serializeForFirestore(omitKeys(goal, GOAL_COLUMN_KEYS)),
});

export { goalFromRow };

const profileFromRow = (row) => ({
  ...(row.data || {}),
  id: row.user_id,
  userId: row.user_id,
  username: row.username,
  author: row.author,
  updatedAt: row.updated_at,
});

const LISTING_COLUMN_KEYS = [
  "id", "ownerId", "moderationStatus", "viewCount", "detailCount", "whatsappCount",
  "ratingCount", "ratingAvg", "createdAt", "updatedAt",
  "slug",
];

const listingFromRow = (row) => ({
  ...(row.data || {}),
  id: row.id,
  ownerId: row.owner_id,
  moderationStatus: row.moderation_status,
  // Endereço público (/servicos/<slug>): o banco gera e guarda, o app só lê.
  // Antes da migração de 25/10/2026 a coluna não existe e vem vazio.
  slug: row.slug || "",
  viewCount: row.view_count,
  detailCount: row.detail_count,
  whatsappCount: row.whatsapp_count,
  // Nota das avaliações (services/serviceReviews.js), mantida por trigger.
  ratingCount: row.rating_count || 0,
  ratingAvg: row.rating_avg == null ? null : Number(row.rating_avg),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const notificationFromRow = (row) => ({
  ...(row.data || {}),
  id: row.id,
  type: row.type,
  actorId: row.actor_id || "",
  recipientId: row.user_id,
  read: row.read,
  createdAt: row.created_at,
});
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
    const rows = must(await supabase.from("post_likes").select("post_id").eq("liker_id", userId));
    myLikedGoalIds = new Set(rows.map((row) => row.post_id));
  } catch (error) {
    // Rede caindo: o coração fica apagado até a próxima carga, e curtir de
    // novo é idempotente (a chave é post + pessoa).
    warnFirestoreFallback("refreshMyLikedGoals", error);
  }
};
// Paginação do feed por cursor: o `updated_at` e o id do último post da página.
let communityGoalsCursor = null;
let communityGoalsHasMore = true;

// O backend Java (engine-api) saiu do caminho do front em 16/10/2026, junto
// com o Firebase. Os ramos `apiEnabled()` só existiam em dev — produção nunca
// os usou — e cada um deles já tinha custado um bug que só aparecia num
// ambiente. O front fala direto com o Supabase em todo lugar.

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
    const row = must(
      await supabase.from("public_profiles").select("data").eq("user_id", userId).maybeSingle(),
    );
    const publicAvatar = row?.data?.avatar || "";
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

// Teto por registro. O Postgres aguenta muito mais, mas foto em base64 dentro
// do registro é o que derrubava o feed: com o Storage ligado a foto vira URL,
// e este teto só pega o caso de a subida ter falhado e caído no base64.
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
  // De onde veio o alvo: "fipe" (consulta automática) ou "manual" (o preço que
  // a pessoa achou). `null` é o legado, anterior a 25/10/2026. `pricedAt` é o
  // dia da consulta FIPE: sem ele, "Preço FIPE" parecia ser o de hoje.
  priceSource: ["fipe", "manual"].includes(car.priceSource) ? car.priceSource : null,
  pricedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(car.pricedAt || "")) ? car.pricedAt : null,
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
  console.warn(`Servidor indisponivel em ${operation}. Usando fallback local.`, error);
};

const requireUserId = (userId = currentUserId) => {
  if (!userId) {
    throw new Error("Usuário não identificado.");
  }
  return userId;
};

// settings, community e moderation (lista de bloqueados): o espaço privado,
// que só o dono lê.
const readPrivateDoc = async (docId, userId = currentUserId) => {
  const row = must(
    await supabase
      .from("user_private")
      .select("data")
      .eq("user_id", requireUserId(userId))
      .eq("doc_id", docId)
      .maybeSingle(),
  );
  return row ? row.data : null;
};

/** Grava por cima (`merge: false`) ou mescla no nível de cima (`merge: true`). */
const writePrivateDoc = async (docId, data, { merge = true, userId = currentUserId } = {}) => {
  const uid = requireUserId(userId);
  const next = merge ? { ...((await readPrivateDoc(docId, uid)) || {}), ...data } : data;
  must(
    await supabase
      .from("user_private")
      .upsert({ user_id: uid, doc_id: docId, data: serializeForFirestore(next), updated_at: nowIso() }),
  );
  return next;
};

// Perfis já lidos nesta sessão. Perfil muda pouco e a mesma pessoa aparece
// em várias telas (post, comentário, lista de seguidores): ler de novo a
// cada tela é o custo que a escuta da coleção inteira pagava em dobro.
const publicProfileCache = new Map();

const usernameDocId = (username) => normalizeUsername(username).replace(/^@/, "");

// O @ que vai para o perfil público. Quem nunca escolheu um ganha
// `@engine.<uid>` (o backend faz igual em EngineNormalizer), e todo link para o
// próprio perfil precisa sair daqui: o menu montava o @ com o começo do e-mail,
// que não existe no banco, e o perfil abria em "Usuário não encontrado".
export const publicUsername = (username, userId = "") =>
  normalizeUsername(username || "") || (userId ? `@engine.${userId.slice(0, 6)}` : "");

const getProfileSnapshot = (settings = {}, userId = currentUserId) => {
  const profile = settings.profile || {};
  const author = profile.displayName || "Usuário Engine";
  const username = publicUsername(profile.username, userId);

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
    // A capa vai só aqui: o retrato acima também é copiado em post,
    // comentário e notificação, e até 400 KB de imagem não cabem em cada um.
    banner: settings.profile?.banner || "",
    updatedAt: nowIso(),
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
    createdAt: nowIso(),
    updatedAt: nowIso(),
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
  updatedAt: nowIso(),
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

export const normalizeServiceListing = (listing = {}) => {
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
    slug: String(listing.slug || "").trim().slice(0, 80),
    title,
    providerName,
    category: String(listing.category || "").trim().slice(0, 60),
    description: String(listing.description || "").trim().slice(0, 900),
    price: String(listing.price || "").trim().slice(0, PRICE_MAX_LENGTH),
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
    // Nota das avaliações: só leitura, o trigger do banco mantém.
    ratingCount: Number(listing.ratingCount) || 0,
    ratingAvg: listing.ratingAvg == null ? null : Number(listing.ratingAvg) || null,
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
      SERVICE_STATUS_SUSPENDED,
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

// Id de usuário no Supabase é UUID. Link antigo, comentário de conta excluída
// e anexo de conversa ainda podem trazer o uid do Firebase, e mandar isso para
// uma coluna UUID derruba a consulta inteira — não só aquele id.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUserId = (value) => UUID_PATTERN.test(String(value || ""));

/** `%` e `_` são curinga no `ilike`: quem digita "a_b" procura "a_b". */
const escapeLike = (text) => String(text).replace(/[\\%_]/g, (char) => `\\${char}`);

const countRows = async (table, column, value) => {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw error;
  return count || 0;
};

const fetchFeedPage = async (cursor) => {
  let request = supabase
    .from("community_goals")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(COMMUNITY_GOALS_PAGE_SIZE);
  if (cursor) {
    request = request.or(
      `updated_at.lt."${cursor.updatedAt}",and(updated_at.eq."${cursor.updatedAt}",id.lt."${cursor.id}")`,
    );
  }
  const rows = must(await request);
  const last = rows[rows.length - 1];
  return {
    goals: rows.map((row) => normalizeCommunityGoal(goalFromRow(row))),
    cursor: last ? { updatedAt: last.updated_at, id: last.id } : cursor,
    hasMore: rows.length === COMMUNITY_GOALS_PAGE_SIZE,
  };
};

const fetchListings = async ({ isAdmin, userId }) => {
  let request = supabase.from("service_listings").select("*").order("updated_at", { ascending: false });
  // A RLS já entrega a cada um só o que ele pode ver (aprovados, os próprios,
  // e tudo para a moderação). O filtro aqui é para o admin navegando como
  // usuário comum ver o que o público vê.
  if (!isAdmin) {
    request = isUserId(userId)
      ? request.or(`moderation_status.eq.${SERVICE_STATUS_APPROVED},owner_id.eq.${userId}`)
      : request.eq("moderation_status", SERVICE_STATUS_APPROVED);
  }
  return must(await request)
    .map((row) => normalizeServiceListing(listingFromRow(row)))
    .filter((listing) => listing.active)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
};

/** Linha crua de `service_listings` -> anúncio no formato das telas. */
export const serviceListingFromRow = (row) => normalizeServiceListing(listingFromRow(row));

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

    let serverCarCount;
    let serverSettings;

    try {
      [serverCarCount, serverSettings] = await Promise.all([
        withTimeout(countRows("cars", "user_id", userId), "migracao de carros"),
        withTimeout(readPrivateDoc("settings", userId), "migracao de configuracoes"),
      ]);
    } catch (error) {
      warnFirestoreFallback("migrateLegacyData", error);
      await set(migratedKey, true);
      return;
    }

    // A migracao e oportunista: subir dado antigo e bom, mas falhar nisso nao
    // pode custar a leitura da garagem. `migratedKey` fica sem marcar quando a
    // escrita falha, para tentar de novo na proxima sessao em vez de desistir
    // do dado antigo para sempre.
    try {
      if (serverCarCount === 0) {
        const carsToMigrate = existingCars?.length ? existingCars : legacyCars;
        if (carsToMigrate?.length) {
          must(
            await supabase.from("cars").upsert(
              carsToMigrate.map(normalizeCar).map((car) => ({
                user_id: userId,
                id: car.id,
                data: serializeForFirestore(car),
                updated_at: nowIso(),
              })),
            ),
          );
        }
      }

      if (!serverSettings) {
        const settingsToMigrate = existingSettings || legacySettings;
        if (settingsToMigrate) {
          await writePrivateDoc("settings", normalizeSettings(settingsToMigrate), {
            merge: false,
            userId,
          });
        }
      }
    } catch (error) {
      warnFirestoreFallback("migrateLegacyData/escrita", error);
      return;
    }

    await set(migratedKey, true);
  },

  async getCars() {
    if (!currentUserId) return getLocalCars();

    try {
      const rows = await withTimeout(
        supabase.from("cars").select("id, data").eq("user_id", currentUserId).then(must),
        "buscar carros",
        CARS_TIMEOUT_MS,
      );
      const cars = rows
        .map((row) => normalizeCar({ ...row.data, id: row.id }))
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

  /** Um carro só, pelo id: lançar um aporte não justifica ler a garagem inteira. */
  async getCar(carId) {
    if (!carId) return null;

    if (!currentUserId) {
      const cars = await getLocalCars();
      return cars.find((item) => String(item.id) === String(carId)) || null;
    }

    try {
      const row = await withTimeout(
        supabase
          .from("cars")
          .select("id, data")
          .eq("user_id", currentUserId)
          .eq("id", String(carId))
          .maybeSingle()
          .then(must),
        "buscar carro",
        CARS_TIMEOUT_MS,
      );
      if (row) return normalizeCar({ ...row.data, id: row.id });
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
      // Fuso do aparelho: em UTC o aporte das 21h nascia com a data de amanhã.
      date: String(date || localISODate()).slice(0, 10),
      createdAt: new Date().toISOString(),
    };

    const updated = normalizeCar({
      ...car,
      savedValue: (Number(car.savedValue) || 0) + value,
      contributions: [contribution, ...(car.contributions || [])],
    });

    await this.saveCar(updated);
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
   * acumula rumo a um alvo, gasto é dinheiro que saiu.
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

    // Foto que não conseguiu subir para o Storage cai em base64 dentro do
    // registro. Passar do teto fazia a gravação ser recusada e o erro morria
    // num console.warn: a tela dizia que salvou e a foto sumia no refresh.
    assertCarFitsDocument(normalizedCar);

    let savedToServer = true;
    try {
      await withTimeout(
        supabase
          .from("cars")
          .upsert({
            user_id: currentUserId,
            id: normalizedCar.id,
            data: serializeForFirestore(normalizedCar),
            updated_at: nowIso(),
          })
          .then(must),
        "salvar carro",
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

    try {
      await withTimeout(
        Promise.all([
          supabase.from("cars").delete().eq("user_id", currentUserId).eq("id", String(id)).then(must),
          supabase
            .from("community_goals")
            .delete()
            .in("id", [`goal-${currentUserId}-${id}`, `goal-${currentUserId}-user-${id}`])
            .then(must),
        ]),
        "excluir carro",
      );
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

    must(await supabase.from("cars").delete().eq("user_id", currentUserId));
    must(await supabase.from("community_goals").delete().eq("owner_id", currentUserId));
  },

  async getCommunityState() {
    if (!currentUserId) {
      const state = await get("engine_community");
      return normalizeCommunityState(state);
    }

    return normalizeCommunityState((await readPrivateDoc("community")) || {});
  },

  async saveCommunityState(state) {
    const normalizedState = normalizeCommunityState(state);
    if (!currentUserId) {
      await set("engine_community", normalizedState);
      return normalizedState;
    }

    try {
      await writePrivateDoc("community", normalizedState);
    } catch (error) {
      console.warn("Could not save to private community doc:", error);
    }
    return normalizedState;
  },

  /**
   * Feed da Comunidade em tempo real: a primeira página, relida quando algum
   * post muda (o Realtime avisa; a releitura é uma consulta de 20 linhas).
   */
  subscribeCommunityGoals(callback) {
    communityGoalsCursor = null;
    communityGoalsHasMore = true;
    let active = true;

    // Uma consulta por assinatura do feed. Não bloqueia: quando a resposta
    // chega, o próximo carregamento já sai com os corações certos.
    refreshMyLikedGoals(currentUserId);

    const load = async () => {
      try {
        const page = await fetchFeedPage(null);
        if (!active) return;
        communityGoalsCursor = page.cursor;
        communityGoalsHasMore = page.hasMore;
        callback(page.goals, { hasMore: page.hasMore });
      } catch (error) {
        warnFirestoreFallback("subscribeCommunityGoals", error);
        if (active) callback([], { hasMore: false });
      }
    };

    load();
    const stop = watchTable("feed", { table: "community_goals" }, load);
    return () => {
      active = false;
      stop();
    };
  },

  async loadMoreCommunityGoals() {
    if (!communityGoalsCursor || !communityGoalsHasMore) {
      return { goals: [], hasMore: false };
    }

    const page = await fetchFeedPage(communityGoalsCursor);
    communityGoalsCursor = page.cursor;
    communityGoalsHasMore = page.hasMore;
    return { goals: page.goals, hasMore: page.hasMore };
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

    let active = true;
    const load = async () => {
      try {
        const row = must(
          await supabase.from("community_goals").select("*").eq("id", String(goalId)).maybeSingle(),
        );
        if (active) callback(row ? normalizeCommunityGoal(goalFromRow(row)) : null);
      } catch (error) {
        warnFirestoreFallback("subscribeCommunityGoal", error);
        if (active) callback(null);
      }
    };

    load();
    const stop = watchTable(
      "post",
      { table: "community_goals", filter: `id=eq.${String(goalId)}` },
      load,
    );
    return () => {
      active = false;
      stop();
    };
  },

  // --- perfis públicos: SEMPRE pontuais -----------------------------------
  //
  // Até 25/09/2026 existia `subscribePublicProfiles`, uma escuta viva da
  // coleção INTEIRA, usada por cinco telas. Medido em produção com 6
  // usuários: 172 KB por abertura da Comunidade. Nenhuma tela precisa de
  // todos. Estas três leituras cobrem as cinco, e `npm run check:escala`
  // trava a volta da escuta.

  /** Só os perfis pedidos, em lotes, com cache. */
  async getPublicProfilesByIds(ids = []) {
    const wanted = [...new Set((ids || []).filter(Boolean).map(String))];
    // Id que não é UUID não é de ninguém no Supabase: vira "não existe" sem
    // perguntar ao servidor (e sem derrubar o lote).
    wanted.filter((id) => !isUserId(id)).forEach((id) => publicProfileCache.set(id, null));
    const missing = wanted.filter((id) => !publicProfileCache.has(id));
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      try {
        const rows = must(await supabase.from("public_profiles").select("*").in("user_id", chunk));
        rows.forEach((row) => publicProfileCache.set(row.user_id, profileFromRow(row)));
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
   * Um perfil pelo @nome. `null` quer dizer "não existe" de verdade; erro de
   * leitura é lançado, para a tela distinguir "não existe" de "não consegui
   * ver" em vez de tratar os dois como sumiço.
   */
  async getPublicProfileByUsername(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) return null;
    const row = must(
      await supabase.from("public_profiles").select("*").eq("username", normalized).limit(1).maybeSingle(),
    );
    if (!row) return null;
    const profile = profileFromRow(row);
    publicProfileCache.set(row.user_id, profile);
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
        const rows = must(
          await supabase
            .from("public_profiles")
            .select("*")
            .order("updated_at", { ascending: false })
            .limit(max),
        );
        return rows.map(profileFromRow);
      }
      // Sem diferenciar maiúscula: no Firestore "joão" não achava "João".
      const handle = normalizeUsername(raw);
      const [porNome, porHandle] = await Promise.all([
        supabase.from("public_profiles").select("*").ilike("author", `${escapeLike(raw)}%`).limit(max),
        handle
          ? supabase.from("public_profiles").select("*").ilike("username", `${escapeLike(handle)}%`).limit(max)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const vistos = new Map();
      [...must(porHandle), ...must(porNome)].forEach((row) => {
        if (!vistos.has(row.user_id)) vistos.set(row.user_id, profileFromRow(row));
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
    let active = true;

    const load = async () => {
      try {
        const listings = await fetchListings({ isAdmin, userId });
        if (active) callback(listings);
      } catch (error) {
        warnFirestoreFallback("subscribeServiceListings", error);
        const localListings = (await get("engine_service_listings")) || [];
        if (!active) return;
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
      }
    };

    load();
    const stop = watchTable("listings", { table: "service_listings" }, load);
    return () => {
      active = false;
      stop();
    };
  },

  /**
   * Cria ou edita um anúncio. `options.original` é o anúncio como estava ao
   * abrir o editor: com ele dá para saber se a edição só mexeu em campo leve
   * (preço, contato, agenda) e o anúncio aprovado continua no ar. Quem decide
   * de verdade é o guard do banco; o status que volta dele é o que vale.
   *
   * Devolve `{ listing, queued }` — `queued` = foi para a fila de aprovação.
   */
  async saveServiceListing(listing, settings = {}, userId = currentUserId, options = {}) {
    if (!userId) throw new Error("Entre na sua conta para publicar o anúncio.");

    const isAdmin = Boolean(options.isAdmin);
    const original = options.original ? normalizeServiceListing(options.original) : null;
    const profile = getProfileSnapshot(settings, userId);
    const draft = normalizeServiceListing({
      ...listing,
      ownerId: isAdmin && listing.ownerId ? listing.ownerId : userId,
      providerName: listing.providerName || profile.author,
      country: listing.country || settings?.profile?.country || "",
      state: listing.state || settings?.profile?.state || "",
      city: listing.city || profile.city,
      // E-mail público é opcional: vazio fica vazio. Antes o e-mail de login
      // era recolocado aqui e virava contato público sem a pessoa querer.
      email: listing.email || "",
    });
    const staysLive =
      (isAdmin && original?.moderationStatus === SERVICE_STATUS_APPROVED) ||
      !listingEditNeedsReview(original, draft);
    const moderationStatus = staysLive ? SERVICE_STATUS_APPROVED : SERVICE_STATUS_PENDING;
    const normalized = normalizeServiceListing({
      ...draft,
      moderationStatus,
      moderationNote: staysLive ? original?.moderationNote : "",
      reviewedAt: staysLive ? original?.reviewedAt : "",
      reviewedBy: staysLive ? original?.reviewedBy : "",
      moderationHistory: original?.moderationHistory || [],
      // O banco carimba a data de envio; esta é só a da cópia local.
      submittedAt: staysLive ? original?.submittedAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const row = {
      owner_id: normalized.ownerId,
      moderation_status: normalized.moderationStatus,
      data: serializeForFirestore(omitKeys(normalized, LISTING_COLUMN_KEYS)),
    };

    let sentToServer = true;
    try {
      // Atualiza se existe, cria se não. Não é `upsert` porque a regra de
      // CRIAR exige status pendente e dono = quem grava — e o admin editando
      // um anúncio aprovado de outra pessoa cairia nela mesmo sendo edição.
      let saved = await withTimeout(
        supabase
          .from("service_listings")
          .update(row)
          .eq("id", normalized.id)
          .select("id, moderation_status")
          .then(must),
        "salvar anuncio de servico",
      );
      if (!saved.length) {
        saved = await withTimeout(
          supabase
            .from("service_listings")
            .insert({ ...row, id: normalized.id })
            .select("id, moderation_status")
            .then(must),
          "salvar anuncio de servico",
        );
      }
      // O guard pode discordar da previsão (campo legado que mudou de
      // formato, por exemplo): vale o que o banco gravou.
      if (saved[0]?.moderation_status) {
        normalized.moderationStatus = saved[0].moderation_status;
      }
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
    return {
      listing: normalized,
      queued: normalized.moderationStatus !== SERVICE_STATUS_APPROVED,
    };
  },

  async moderateServiceListing(listingId, status, note = "", reviewerId = currentUserId) {
    if (!listingId || !reviewerId) return;
    if (
      ![
        SERVICE_STATUS_APPROVED,
        SERVICE_STATUS_CHANGES_REQUESTED,
        SERVICE_STATUS_REJECTED,
        SERVICE_STATUS_SUSPENDED,
      ].includes(status)
    ) {
      throw new Error("Status de moderacao invalido.");
    }

    const current = await supabase
      .from("service_listings")
      .select("*")
      .eq("id", String(listingId))
      .maybeSingle()
      .then(must)
      .catch((error) => {
        warnFirestoreFallback("moderateServiceListing.get", error);
        return null;
      });
    const listing = current
      ? normalizeServiceListing(listingFromRow(current))
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
    };

    try {
      if (!current) throw new Error("Anúncio não encontrado no servidor.");
      const data = current.data || {};
      must(
        await supabase
          .from("service_listings")
          .update({
            moderation_status: status,
            data: {
              ...data,
              moderationNote: cleanNote,
              reviewedBy: reviewerId,
              reviewedAt,
              moderationHistory: [...(data.moderationHistory || []), historyEntry],
            },
          })
          .eq("id", String(listingId)),
      );
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
      const copy = {
        [SERVICE_STATUS_APPROVED]: {
          type: "service_approved",
          title: "Anúncio aprovado",
          body: "Seu anúncio foi publicado.",
          text: `Seu anúncio ${listing.title} foi aprovado e publicado.`,
        },
        [SERVICE_STATUS_CHANGES_REQUESTED]: {
          type: "service_changes_requested",
          title: "Alterações solicitadas",
          body: "Revise os comentários da moderação.",
          text: `Seu anúncio ${listing.title} voltou para ajustes.`,
        },
        [SERVICE_STATUS_REJECTED]: {
          type: "service_rejected",
          title: "Anúncio recusado",
          body: "Confira o motivo enviado pela moderação.",
          text: `Seu anúncio ${listing.title} foi recusado.`,
        },
        [SERVICE_STATUS_SUSPENDED]: {
          type: "service_suspended",
          title: "Anúncio tirado do ar",
          body: "Confira o motivo. Você pode corrigir e reenviar.",
          text: `Seu anúncio ${listing.title} foi tirado do ar pela moderação.`,
        },
      }[status];

      // A decisão já está gravada. Se o aviso falhar, a moderação não pode
      // ver "não foi possível aprovar" com o anúncio já aprovado.
      try {
        await this.notifyUser(listing.ownerId, {
          type: copy.type,
          actorId: reviewerId,
          serviceId: String(listingId),
          serviceTitle: listing.title,
          moderationNote: patch.moderationNote,
          targetPath: "/services",
          notificationTitle: copy.title,
          notificationBody: copy.body,
          text: copy.text,
        });
      } catch (error) {
        warnFirestoreFallback("moderateServiceListing.notify", error);
      }
    }
  },

  async deleteServiceListing(listingId, userId = currentUserId) {
    if (!listingId || !userId) return;

    try {
      await withTimeout(
        supabase.from("service_listings").delete().eq("id", String(listingId)).then(must),
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

    // Republicar a mesma meta atualiza o conteúdo; curtidas, comentários,
    // avaliações e a data de criação o banco preserva sozinho.
    const payload = buildCommunityGoal(goal, userId, settings, note, club);
    must(await supabase.from("community_goals").upsert(goalToRow(payload)));

    // Sem await: a conquista não pode atrasar nem derrubar a publicação.
    grantOwn("first_post");
    return payload.id;
  },

  /**
   * Publica um post livre no feed: texto, fotos e link de vídeo, podendo ou
   * não estar amarrado a um carro da garagem.
   *
   * Vai para a mesma tabela das metas, marcado com `kind: "post"`, então
   * herda curtida, comentário, denúncia, bloqueio e as regras de segurança.
   */
  async createCommunityPost({
    text,
    images = [],
    videoUrl = "",
    car = null,
    // Carimbo de clube: post do mural de um clube é um post da Comunidade
    // marcado, não uma tabela paralela. O banco exige ser MEMBRO para gravar.
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
      clubId: String(clubId || ""),
      clubTag: String(clubTag || ""),
    };

    assertCarFitsDocument(payload);

    must(await supabase.from("community_goals").insert(goalToRow(payload)));
    grantOwn("first_post");
    return id;
  },

  /** Edita só a legenda de uma publicação já no ar. */
  async updateCommunityGoalNote(goalId, note, userId = currentUserId) {
    if (!userId || !goalId) return;

    const text = String(note || "").trim().slice(0, 280);
    const row = must(
      await supabase.from("community_goals").select("data").eq("id", String(goalId)).maybeSingle(),
    );
    if (!row) return;
    must(
      await supabase
        .from("community_goals")
        .update({ data: { ...row.data, note: text } })
        .eq("id", String(goalId)),
    );
  },

  async deleteCommunityGoal(goal, userId = currentUserId) {
    if (!userId) return;
    // Curtidas saem junto, em cascata no banco.
    must(
      await supabase
        .from("community_goals")
        .delete()
        .in("id", [communityGoalId(goal, userId), legacyCommunityGoalId(goal, userId)]),
    );
  },

  async resetMyCommunityPublications(userId = currentUserId) {
    if (!userId) return;
    must(await supabase.from("community_goals").delete().eq("owner_id", userId));
  },

  /**
   * Nome, @ e avatar viajam copiados em cada publicação, para o feed não ler
   * um perfil por card. Trocar nas configurações atualiza as cópias.
   *
   * A legenda NÃO entra aqui: até 16/10/2026 esta sincronia gravava a bio do
   * perfil por cima da legenda de cada post — salvar as configurações apagava
   * o que a pessoa tinha escrito ao publicar.
   */
  async syncCommunityProfile(settings, userId = currentUserId) {
    if (!userId) return;

    const profile = getProfileSnapshot(settings, userId);
    const rows = must(
      await supabase.from("community_goals").select("id, data").eq("owner_id", userId),
    );

    await Promise.all(
      rows.map(async (row) =>
        must(
          await supabase
            .from("community_goals")
            .update({
              data: {
                ...row.data,
                author: profile.author,
                username: profile.username,
                avatar: profile.avatar,
                avatarInitials: profile.avatarInitials,
                city: profile.city,
              },
            })
            .eq("id", row.id),
        ),
      ),
    );
  },

  async syncCommunityCar(car, userId = currentUserId) {
    if (!userId) return;

    const rows = must(
      await supabase
        .from("community_goals")
        .select("id, data")
        .in("id", [communityGoalId(car, userId), legacyCommunityGoalId(car, userId)]),
    );
    const patch = omitKeys(serializeForFirestore(communityCarPatch(car)), ["updatedAt"]);

    await Promise.all(
      rows.map(async (row) =>
        must(
          await supabase
            .from("community_goals")
            .update({ data: { ...row.data, ...patch } })
            .eq("id", row.id),
        ),
      ),
    );
  },

  async syncPublicProfile(settings, userId = currentUserId) {
    if (!userId) return;

    const profile = buildPublicProfile(settings, userId);
    must(
      await supabase.from("public_profiles").upsert({
        user_id: userId,
        username: profile.username,
        author: profile.author,
        data: serializeForFirestore(omitKeys(profile, ["id", "userId", "updatedAt"])),
      }),
    );
    publicProfileCache.delete(String(userId));
  },

  /**
   * Confere os marcos que dependem só da garagem da pessoa.
   *
   * Devolve os marcos que ESTA chamada concedeu, para a tela comemorar. Não
   * gera notificação: a pessoa está olhando.
   */
  async sincronizarMarcosDaGaragem(cars = []) {
    if (!currentUserId || !cars.length) return [];
    try {
      return await syncOwnMilestones(
        currentUserId,
        garageAchievementIds(cars, {
          ownedType: CAR_TYPE_OWNED,
          hasMeasuredConsumption: cars.some((car) => realConsumption(car.expenses || [])),
        }),
      );
    } catch (error) {
      warnFirestoreFallback("sincronizarMarcosDaGaragem", error);
      return [];
    }
  },

  /**
   * Confere os degraus de curtida do dono do post e concede o que faltar.
   *
   * Roda no cliente de QUEM CURTIU — é escrita no perfil de outra pessoa, e o
   * banco é a defesa: lista fechada de ids, data carimbada por ele. Falha aqui
   * nunca derruba a curtida: o selo é consequência, não o ato.
   */
  async concederDegrausDeCurtida(ownerId, goalTitle) {
    if (!ownerId) return;
    try {
      const total = await this.countLikesReceived(ownerId);
      const novos = await syncLikeAchievements(ownerId, total);
      // Só o maior degrau novo vira aviso: quem já tinha 60 curtidas antes dos
      // degraus pequenos existirem ganha 10 e 50 juntos na próxima curtida.
      for (const id of novos.slice(-1)) {
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

  /** Quantas curtidas UM post tem, contadas nas linhas de curtida. */
  async countPostLikes(goalId) {
    if (!goalId) return 0;
    try {
      return await countRows("post_likes", "post_id", String(goalId));
    } catch (error) {
      warnFirestoreFallback("countPostLikes", error);
      return 0;
    }
  },

  /**
   * Total de curtidas que a pessoa recebeu somando todos os posts dela. Não dá
   * pra forjar: `post_owner_id` é carimbado pelo banco a partir do dono real.
   */
  async countLikesReceived(userId) {
    if (!isUserId(userId)) return 0;
    try {
      return await countRows("post_likes", "post_owner_id", userId);
    } catch (error) {
      warnFirestoreFallback("countLikesReceived", error);
      return 0;
    }
  },

  async getPublicProfile(userId) {
    if (!isUserId(userId)) return null;

    const [profileRow, goalRows, followersCount, myFollow] = await Promise.all([
      supabase.from("public_profiles").select("*").eq("user_id", userId).maybeSingle().then(must),
      supabase
        .from("community_goals")
        .select("*")
        .eq("owner_id", userId)
        .order("updated_at", { ascending: false })
        .then(must),
      countRows("follows", "target_id", userId).catch(() => 0),
      currentUserId && currentUserId !== userId
        ? supabase
            .from("follows")
            .select("follower_id")
            .eq("follower_id", currentUserId)
            .eq("target_id", userId)
            .maybeSingle()
            .then(must)
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const goals = goalRows.map((row) => normalizeCommunityGoal(goalFromRow(row)));
    const totalProgress = goals.reduce((sum, goal) => {
      const target = Number(goal.targetValue) || 0;
      return sum + (target ? Math.min((Number(goal.savedValue) / target) * 100, 100) : 0);
    }, 0);

    // O perfil público só nasce quando a pessoa salva os ajustes; até lá, os
    // dados do autor que viajam junto de cada meta são a melhor fonte.
    const profile = profileRow ? profileFromRow(profileRow) : {};
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
      likesCount: goals.reduce((sum, goal) => sum + (Number(goal.likes) || 0), 0),
      averageProgress: goals.length ? totalProgress / goals.length : 0,
      followersCount,
      isFollowedByMe: Boolean(myFollow),
    };
  },

  // Segue / deixa de seguir uma pessoa. Uma linha (quem segue, quem é
  // seguido) responde as duas listas — no Firestore eram dois espelhos que
  // podiam discordar.
  async setFollow(targetUserId, isFollowing, followerId = currentUserId) {
    if (!isUserId(targetUserId) || !followerId || targetUserId === followerId) return;

    if (isFollowing) {
      const actorSettings = await this.getSettings();
      const actor = getProfileSnapshot(actorSettings, followerId);

      must(
        await supabase.from("follows").upsert({
          follower_id: followerId,
          target_id: targetUserId,
          data: {
            author: actor.author,
            username: actor.username,
            avatar: actor.avatar,
            avatarInitials: actor.avatarInitials,
          },
        }),
      );

      // Mesma forma do degrau de curtida: quem segue é quem detecta.
      try {
        const total = await countRows("follows", "target_id", targetUserId);
        // A série inteira (10, 100, 1.000). Notifica só o maior degrau que
        // esta chamada concedeu.
        const novos = await grantSeries(targetUserId, "followers", total);
        const maior = novos[novos.length - 1];
        if (maior) {
          const degrau = Number(maior.split("_")[1]);
          await this.notifyUser(targetUserId, {
            type: "achievement",
            achievementId: maior,
            targetPath: "/settings",
            notificationTitle: "Conquista desbloqueada",
            notificationBody: `${degrau.toLocaleString("pt-BR")} pessoas seguem sua garagem.`,
            text: `Você alcançou ${degrau.toLocaleString("pt-BR")} seguidores.`,
          });
        }
      } catch (error) {
        warnFirestoreFallback("marco de seguidores", error);
      }
      // A notificação mora AQUI, e não em quem chama: havia dois botões de
      // seguir e só um deles avisava (auditoria de 25/09/2026).
      if (followerId === currentUserId) {
        await this.notifyFollow(targetUserId).catch((error) =>
          warnFirestoreFallback("notifyFollow", error),
        );
      }
    } else {
      must(
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("target_id", targetUserId),
      );
    }
  },

  async getUserGoals(userId) {
    if (!isUserId(userId)) return [];

    try {
      const rows = must(
        await supabase
          .from("community_goals")
          .select("*")
          .eq("owner_id", userId)
          .order("updated_at", { ascending: false }),
      );
      return rows.map((row) => normalizeCommunityGoal(goalFromRow(row)));
    } catch (error) {
      console.error("Error fetching user goals:", error);
      return [];
    }
  },

  async getUserFollowers(userId) {
    if (!isUserId(userId)) return [];

    try {
      const rows = must(
        await supabase.from("follows").select("follower_id, data, created_at").eq("target_id", userId),
      );
      return rows.map((row) => ({
        userId: row.follower_id,
        followerId: row.follower_id,
        ...row.data,
        createdAt: row.created_at,
      }));
    } catch (error) {
      console.error("Error fetching followers:", error);
      return [];
    }
  },

  async getUserFollowing(userId) {
    if (!isUserId(userId)) return [];

    try {
      const rows = must(
        await supabase.from("follows").select("target_id").eq("follower_id", userId),
      );
      return rows.map((row) => row.target_id);
    } catch (error) {
      console.error("Error fetching user following:", error);
      return [];
    }
  },

  /**
   * "Sou moderação de serviços?" — pergunta ao banco (public.is_service_admin),
   * a única fonte. Visitante, erro ou rede fora: false.
   */
  async isServiceAdmin() {
    try {
      return must(await supabase.rpc("is_service_admin")) === true;
    } catch (error) {
      warnFirestoreFallback("isServiceAdmin", error);
      return false;
    }
  },

  /** Denúncias de anúncio ainda abertas, da mais antiga para a mais nova. */
  async fetchServiceListingReports() {
    try {
      return must(
        await supabase
          .from("reports")
          .select("id, target_id, reason, created_at")
          .eq("target_type", "service_listing")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(200),
      ).map((row) => ({
        id: row.id,
        listingId: row.target_id,
        reason: row.reason || "",
        createdAt: row.created_at,
      }));
    } catch (error) {
      warnFirestoreFallback("fetchServiceListingReports", error);
      return [];
    }
  },

  /** Fecha as denúncias de um anúncio (a moderação já agiu ou dispensou). */
  async resolveServiceListingReports(listingId, status = "resolved") {
    must(
      await supabase
        .from("reports")
        .update({ status })
        .eq("target_type", "service_listing")
        .eq("target_id", String(listingId))
        .eq("status", "pending"),
    );
  },

  /**
   * Abre uma denúncia. Só a moderação lê — quem denuncia não relê a própria
   * denúncia, para ninguém mapear o que já foi reportado.
   */
  async reportContent({ targetType, targetId, reportedUserId = "", reason = "" }) {
    if (!currentUserId || !targetId) return;

    must(
      await supabase.from("reports").insert({
        target_type: String(targetType || "goal"),
        target_id: String(targetId),
        reported_user_id: String(reportedUserId || ""),
        reporter_id: currentUserId,
        reason: String(reason || "").slice(0, 280),
      }),
    );
  },

  /**
   * Conta uma visita, uma abertura de anúncio ou um clique no WhatsApp.
   *
   * O banco só deixa subir de um em um, e só em anúncio aprovado. Aqui do lado
   * do cliente a trava é o sessionStorage: recarregar a página não conta de
   * novo. Não é auditoria, é ordem de grandeza.
   */
  async trackServiceListingMetric(listingId, metric, source = "direct") {
    if (!listingId || !["view", "detail", "whatsapp"].includes(metric)) return;

    const onceKey = `engine_metric:${listingId}:${metric}`;
    try {
      if (window.sessionStorage.getItem(onceKey)) return;
      window.sessionStorage.setItem(onceKey, "1");
    } catch {
      // Navegador com storage bloqueado: conta assim mesmo, sem a trava.
    }

    try {
      must(
        await supabase.rpc("track_listing_metric", {
          p_listing_id: String(listingId),
          p_metric: metric,
          // De onde veio: o painel mês a mês do Pro separa busca, perfil, link.
          p_source: source,
        }),
      );
    } catch (error) {
      // Métrica nunca pode atrapalhar quem está usando o app.
      warnFirestoreFallback("trackServiceListingMetric", error);
    }
  },

  async getBlockedUsers(userId = currentUserId) {
    if (!userId) return [];

    try {
      return (await readPrivateDoc("moderation", userId))?.blockedUserIds || [];
    } catch (error) {
      warnFirestoreFallback("getBlockedUsers", error);
      return [];
    }
  },

  async setUserBlocked(targetUserId, blocked, userId = currentUserId) {
    if (!userId || !targetUserId || targetUserId === userId) return;

    const atual = (await readPrivateDoc("moderation", userId))?.blockedUserIds || [];
    const blockedUserIds = blocked
      ? [...new Set([...atual, targetUserId])]
      : atual.filter((id) => id !== targetUserId);
    await writePrivateDoc("moderation", { blockedUserIds, updatedAt: nowIso() }, { userId });
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
    if (!isUserId(userId) || userId === actorId) return;

    const { type, ...data } = notification || {};
    must(
      await supabase.from("notifications").insert({
        user_id: userId,
        actor_id: actorId,
        type,
        read: false,
        data: serializeForFirestore(omitKeys(data, ["actorId", "recipientId", "read", "createdAt"])),
      }),
    );
  },

  async notifyFollow(userId) {
    if (!userId || userId === currentUserId) return;

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

    let active = true;
    const load = async () => {
      try {
        const rows = must(
          await supabase
            .from("notifications")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(200),
        );
        if (active) callback(rows.map(notificationFromRow));
      } catch (error) {
        warnFirestoreFallback("subscribeNotifications", error);
        if (active) callback([]);
      }
    };

    load();
    const stop = watchTable("notifications", { table: "notifications", filter: `user_id=eq.${userId}` }, load);
    return () => {
      active = false;
      stop();
    };
  },

  async markNotificationsRead(userId = currentUserId) {
    if (!userId) return;
    must(
      await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false),
    );
  },

  async toggleCommunityLike(goalId, liked, userId = currentUserId) {
    if (!userId) return;

    // As três leituras não dependem uma da outra: em paralelo, para a curtida
    // não esperar três idas ao servidor em fila.
    const [goalRow, likeRow, actorSettings] = await Promise.all([
      supabase.from("community_goals").select("owner_id, data").eq("id", goalId).maybeSingle().then(must),
      supabase
        .from("post_likes")
        .select("post_id")
        .eq("post_id", goalId)
        .eq("liker_id", userId)
        .maybeSingle()
        .then(must),
      liked ? this.getSettings() : null,
    ]);
    const goalData = goalRow ? { ...goalRow.data, ownerId: goalRow.owner_id } : null;
    // Uma linha por pessoa em `post_likes`; o contador do post é mantido pelo
    // banco a partir dessas linhas, e é delas que o marco de conquista conta.
    const jaCurtiu = Boolean(likeRow);

    if (!liked) {
      if (jaCurtiu) {
        must(await supabase.from("post_likes").delete().eq("post_id", goalId).eq("liker_id", userId));
      }
      myLikedGoalIds.delete(goalId);
      return;
    }
    if (jaCurtiu) return;

    must(await supabase.from("post_likes").insert({ post_id: goalId, liker_id: userId }));
    myLikedGoalIds.add(goalId);
    if (!goalData) return;

    // O aviso sai ANTES da conferência de conquista: ele é o que o dono do
    // post precisa ver, e a conquista custa mais umas idas ao servidor. Quem
    // curte e logo sai da página (recarregar, fechar a aba) cortava a
    // corrente no meio — e era o aviso, que vinha por último, que se perdia.
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

    // Sem await: a conquista é consequência, não o ato.
    this.concederDegrausDeCurtida(goalData.ownerId, goalData.title);
  },

  async addCommunityComment(goalId, comment, userId = currentUserId) {
    if (!userId) return;

    const actorSettings = await this.getSettings();
    const actor = getProfileSnapshot(actorSettings, userId);
    // Autor e data quem carimba é o banco; o cartão (nome, @, avatar) vem daqui.
    const saved = must(
      await supabase.rpc("add_comment", {
        p_post_id: goalId,
        p_comment: {
          author: actor.author,
          username: actor.username,
          avatar: actor.avatar,
          avatarInitials: actor.avatarInitials,
          text: String(comment).trim().slice(0, 180),
        },
      }),
    );
    grantOwn("first_comment");

    const goalRow = must(
      await supabase.from("community_goals").select("owner_id, data").eq("id", goalId).maybeSingle(),
    );
    if (goalRow) {
      await this.notifyUser(goalRow.owner_id, {
        type: "comment",
        actorId: userId,
        actorName: actor.author,
        actorUsername: actor.username,
        goalId,
        goalTitle: goalRow.data?.title,
        commentId: saved?.id,
        targetPath: `/community?goal=${encodeURIComponent(goalId)}&comments=1`,
        notificationTitle: "Novo comentário",
        notificationBody: `${actor.author} comentou na sua publicação.`,
        text: `${actor.author} comentou na sua meta ${goalRow.data?.title}.`,
      });
    }
  },

  async updateCommunityComment(goalId, commentId, text, userId = currentUserId) {
    if (!userId || !goalId || !commentId) return;
    must(
      await supabase.rpc("update_comment", {
        p_post_id: String(goalId),
        p_comment_id: String(commentId),
        p_text: String(text || ""),
      }),
    );
  },

  async deleteCommunityComment(goalId, commentId, userId = currentUserId) {
    if (!userId || !goalId || !commentId) return;
    must(
      await supabase.rpc("delete_comment", {
        p_post_id: String(goalId),
        p_comment_id: String(commentId),
      }),
    );
  },

  async rateCommunityGoal(goalId, rating, userId = currentUserId) {
    if (!userId) return;

    must(
      await supabase.rpc("rate_goal", {
        p_post_id: goalId,
        p_rating: Math.max(1, Math.min(Number(rating) || 1, 5)),
      }),
    );

    const goalRow = must(
      await supabase.from("community_goals").select("owner_id, data").eq("id", goalId).maybeSingle(),
    );
    if (goalRow && goalRow.owner_id !== userId) {
      const actorSettings = await this.getSettings();
      const actor = getProfileSnapshot(actorSettings, userId);
      await this.notifyUser(goalRow.owner_id, {
        type: "rating",
        actorId: userId,
        actorName: actor.author,
        actorUsername: actor.username,
        goalId,
        goalTitle: goalRow.data?.title,
        targetPath: `/community?goal=${encodeURIComponent(goalId)}`,
        notificationTitle: "Nova avaliação",
        notificationBody: `${actor.author} avaliou sua publicação.`,
        text: `${actor.author} avaliou sua meta ${goalRow.data?.title}.`,
      });
    }
  },

  async getSettings() {
    if (!currentUserId) {
      const settings = await getLocalSettings();
      return normalizeSettings(settings);
    }

    try {
      const settings = (await withTimeout(readPrivateDoc("settings"), "buscar configuracoes")) || {};
      const normalized = await recoverSettingsAvatar(settings);
      await setLocalSettings(normalized);
      if (!settings?.profile?.avatar && normalized.profile.avatar) {
        writePrivateDoc("settings", serializeForFirestore(normalized), { merge: false }).catch((error) =>
          warnFirestoreFallback("persistRecoveredAvatar", error),
        );
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

    await this.reserveUsername(mergedSettings.profile.username, userId);

    let savedToServer = true;
    try {
      await withTimeout(
        writePrivateDoc("settings", serializeForFirestore(mergedSettings), { userId }),
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

    must(
      await supabase.from("user_private").delete().eq("user_id", currentUserId).eq("doc_id", "settings"),
    );
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

    // Atômico no banco: ler e gravar numa operação só, sem janela para dois
    // cadastros pegarem o mesmo nome.
    try {
      must(await supabase.rpc("reserve_username", { p_username: normalized }));
    } catch (error) {
      if (error.code === "username-taken") throw usernameTakenError();
      throw error;
    }

    return normalized;
  },

  /**
   * O nome já é de alguém? Consultado ANTES de criar a conta, para não nascer
   * conta órfã com o e-mail preso (auditoria de 25/09/2026).
   *
   * Devolve `null` quando não dá pra saber (sem rede): quem chama segue, e a
   * reserva atômica depois da criação da conta continua sendo a trava.
   */
  async isUsernameAvailable(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) return false;
    try {
      const row = must(
        await supabase.from("usernames").select("username").eq("username", usernameDocId(normalized)).maybeSingle(),
      );
      return !row;
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
