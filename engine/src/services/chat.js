import { must, supabase, watchTable } from "./supabase";

/**
 * Mensagens diretas (DM) do Engine.
 *
 * Modelo no banco:
 *   conversations                     -> id determinístico "uidA__uidB"
 *     member_ids: [uidA, uidB]        (ordenado)
 *     members:    { uid: {author, username, avatar, avatarInitials} }
 *     unread:     { uid: number }
 *     last_message: { text, senderId, type, createdAt }
 *   messages (conversation_id)
 *     { sender_id, text, type: "text" | "post" | "image" | "gif", data, created_at }
 *
 * O cartão do autor fica desnormalizado na conversa para a lista renderizar
 * sem N leituras de perfil. Abrir conversa, mandar mensagem e marcar como lida
 * são funções do banco: cada uma mexe na conversa dos DOIS, e é lá que se
 * garante que ninguém entra em conversa alheia nem mexe no contador do outro.
 */
const MESSAGES_LIMIT = 200;
const MESSAGE_MAX_LENGTH = 2000;

const conversationFromRow = (row) => ({
  id: row.id,
  memberIds: row.member_ids || [],
  members: row.members || {},
  unread: row.unread || {},
  lastMessage: row.last_message || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  // Fio de serviço (migration 20261030120000): amarrado a um anúncio.
  kind: row.kind || "direct",
  listingId: row.listing_id || "",
  customerId: row.customer_id || "",
  providerId: row.provider_id || "",
  quoteRequestId: row.quote_request_id || "",
  serviceStatus: row.service_status || "",
  context: row.context || {},
  startedBy: row.started_by || "",
  firstReplyAt: row.first_reply_at || null,
  // Página profissional dona do anúncio (20261101130000): a equipe lê e
  // responde como o prestador.
  profileId: row.profile_id || "",
});

/**
 * Páginas profissionais em que eu estou na equipe (ativo). Preenchido por
 * `subscribeConversations`; as funções abaixo usam para saber de que lado
 * da conversa eu estou quando não sou um dos dois `member_ids`.
 */
const myTeamProfiles = new Set();

const loadMyTeamProfiles = async (userId) => {
  const { data, error } = await supabase
    .from("pro_profile_members")
    .select("profile_id, pro_profiles(kind)")
    .eq("user_id", userId)
    .eq("status", "active");
  myTeamProfiles.clear();
  if (error) return [];
  for (const row of data || []) {
    if (row.pro_profiles?.kind === "page") myTeamProfiles.add(row.profile_id);
  }
  return [...myTeamProfiles];
};

/**
 * Em nome de quem eu ajo nesta conversa: eu mesmo, ou — na conversa de uma
 * página em que estou na equipe — o prestador (mesma regra do
 * `conversation_actor` do banco).
 */
export const conversationActor = (conversation, userId = "") => {
  // `null` chega quando as mensagens carregam antes da conversa (abrir
  // /messages/<id> direto): sem conversa, quem age sou eu.
  if (!conversation) return userId;
  if ((conversation.memberIds || []).includes(userId)) return userId;
  if (
    conversation.kind === "service" &&
    conversation.profileId &&
    myTeamProfiles.has(conversation.profileId) &&
    conversation.customerId !== userId
  ) {
    return conversation.providerId;
  }
  return userId;
};

/** A mensagem é do meu lado da conversa? (Na página: qualquer um da equipe.) */
export const isMyMessage = (conversation = {}, message = {}, userId = "") => {
  if (message.senderId === userId) return true;
  const actor = conversationActor(conversation, userId);
  return (
    actor !== userId &&
    conversation.kind === "service" &&
    actor === conversation.providerId &&
    Boolean(message.senderId) &&
    message.senderId !== conversation.customerId
  );
};

/** Eu respondo por este fio como prestador (dono do anúncio ou equipe da página)? */
export const iAmProviderOf = (conversation = {}, userId = "") =>
  conversation.kind === "service" && conversationActor(conversation, userId) === conversation.providerId;

const messageFromRow = (row) => ({
  ...(row.data || {}),
  id: row.id,
  senderId: row.sender_id || "",
  text: row.text,
  type: row.type,
  status: row.status,
  createdAt: row.created_at,
});

export const conversationIdFor = (a, b) =>
  [String(a || ""), String(b || "")].sort().join("__");

export const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

// `deletedAt` é gravado por quem exclui a conta (services/accountDeletion.js).
// O @ fica vazio de propósito: ele foi liberado, e "ver perfil" levaria ao
// próximo dono do nome.
const memberCard = (person = {}) => ({
  author: person.author || person.displayName || "Usuário Engine",
  username: person.deletedAt ? "" : person.username || "@engine",
  avatar: person.avatar || "",
  avatarInitials: person.avatarInitials || "",
  deleted: Boolean(person.deletedAt),
});

/** Cartão do usuário logado a partir dos settings — usado ao criar conversas. */
export const profileCardFromSettings = (settings = {}, user = null) => {
  const profile = settings.profile || {};
  const author = profile.displayName || user?.displayName || "Usuário Engine";

  return {
    userId: user?.uid || "",
    author,
    username: profile.username || `@engine.${String(user?.uid || "").slice(0, 6)}`,
    avatar: profile.avatar || user?.photoURL || "",
    avatarInitials: author
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2),
  };
};

export const conversationPartner = (conversation = {}, userId = "") => {
  const me = conversationActor(conversation, userId);
  const partnerId =
    (conversation.memberIds || []).find((id) => id !== me) || "";
  return {
    userId: partnerId,
    ...memberCard(conversation.members?.[partnerId]),
  };
};

export const conversationUnread = (conversation = {}, userId = "") =>
  Number(conversation.unread?.[conversationActor(conversation, userId)]) || 0;

/** Resumo curto de um anexo, usado na prévia da lista de conversas. */
export const attachmentSummary = (attachment) =>
  attachment?.title ? `📷 ${attachment.title}` : "📷 Publicação";

/**
 * Anexo de qualquer coisa do Engine que não seja um post: clube, evento,
 * anúncio, página profissional, perfil, hashtag.
 *
 * Antes só post virava cartão, e o resto era mandado como texto — chegava um
 * endereço cru de setenta caracteres na conversa, com o id do clube à mostra.
 * Guardo o caminho, e não o endereço inteiro, porque abrir é navegação
 * interna: o domínio muda (netlify, domínio próprio) e o cartão antigo
 * continua valendo.
 */
export const attachmentFromShare = ({ kind = "link", url = "", title = "", subtitle = "", image = "" } = {}) => {
  let href = String(url || "");
  try {
    const parsed = new URL(href, "https://enginegarage.com.br");
    href = `${parsed.pathname}${parsed.search}`;
  } catch {
    // Endereço estranho: guarda como veio, o cartão vira texto simples.
  }
  return {
    kind: String(kind || "link"),
    href,
    title: String(title || "").slice(0, 120),
    subtitle: String(subtitle || "").slice(0, 120),
    image: String(image || ""),
  };
};

export const attachmentFromGoal = (goal = {}) => {
  // Post de outra pessoa não traz dinheiro, só `progress` (0–100).
  const target = Number(goal.targetValue) || 0;
  const progress = target
    ? Math.min((Number(goal.savedValue) / target) * 100, 100)
    : Math.min(Math.max(Number(goal.progress) || 0, 0), 100);

  return {
    kind: "post",
    goalId: String(goal.id || ""),
    ownerId: goal.ownerId || "",
    author: goal.author || "",
    username: goal.username || "",
    // Post livre não tem título: a prévia na conversa usa o começo do texto
    // (antes chegava um cartão em branco).
    title: goal.title || String(goal.note || "").replace(/\s+/g, " ").trim().slice(0, 80),
    brand: goal.brand || "",
    model: goal.model || "",
    year: goal.year || "",
    image: goal.image || goal.images?.[0] || goal.video?.poster || "",
    progress: Number(progress.toFixed(1)),
  };
};

/**
 * Lista de conversas.
 *
 * O callback recebe `(conversas, erro)`. O segundo argumento existe porque
 * `callback([])` no catch e indistinguivel de "voce nao tem conversa": uma
 * permissao negada, um token expirando na troca de conta ou a rede caindo
 * desenhavam exatamente a mesma tela de quem nunca conversou com ninguem.
 */
export const subscribeConversations = (userId, callback) => {
  if (!userId) {
    callback([]);
    return () => {};
  }

  let active = true;
  const load = async () => {
    try {
      const teams = await loadMyTeamProfiles(userId).catch(() => []);
      let request = supabase.from("conversations").select("*");
      request = teams.length
        ? request.or(`member_ids.cs.{${userId}},profile_id.in.(${teams.join(",")})`)
        : request.contains("member_ids", [userId]);
      const rows = must(await request.order("updated_at", { ascending: false }).limit(60));
      if (active) callback(rows.map(conversationFromRow));
    } catch (error) {
      console.warn("[chat] subscribeConversations", error);
      if (active) callback([], error);
    }
  };

  load();
  // A RLS já limita o aviso às conversas da pessoa.
  const stop = watchTable("conversations", { table: "conversations" }, load);
  return () => {
    active = false;
    stop();
  };
};

/** Mensagens de uma conversa. Mesmo contrato: `(mensagens, erro)`. */
export const subscribeMessages = (conversationId, callback) => {
  if (!conversationId) {
    callback([]);
    return () => {};
  }

  let active = true;
  const load = async () => {
    try {
      const rows = must(
        await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(MESSAGES_LIMIT),
      );
      if (active) callback(rows.map(messageFromRow).reverse());
    } catch (error) {
      console.warn("[chat] subscribeMessages", error);
      if (active) callback([], error);
    }
  };

  load();
  const stop = watchTable(
    "messages",
    { table: "messages", filter: `conversation_id=eq.${conversationId}` },
    load,
  );
  return () => {
    active = false;
    stop();
  };
};

/**
 * Garante que a conversa entre duas pessoas existe e devolve o id.
 * Como o id é determinístico, abrir a mesma pessoa duas vezes nunca duplica.
 * Reabrir atualiza o PRÓPRIO cartão (nome e avatar podem ter mudado).
 */
export const startConversation = async (me, other) => {
  if (!me?.userId || !other?.userId || me.userId === other.userId) {
    throw new Error("Conversa inválida.");
  }

  return must(
    await supabase.rpc("start_conversation", {
      p_other: other.userId,
      p_my_card: memberCard(me),
      p_other_card: memberCard(other),
    }),
  );
};

/**
 * Manda a mensagem. Prévia na lista, contador de não lidas e o aviso no sino
 * (só quando a conversa estava zerada para quem recebe) saem do banco, no
 * mesmo passo da mensagem.
 */
export const sendMessage = async (
  conversationId,
  { senderId, text = "", attachment = null, imageData = null, gifData = null, gifId = null },
) => {
  const body = String(text || "").trim().slice(0, MESSAGE_MAX_LENGTH);
  if (!conversationId || !senderId || (!body && !attachment && !imageData && !gifData)) return null;

  const messageType = gifData ? "gif" : imageData ? "image" : attachment ? "post" : "text";
  return must(
    await supabase.rpc("send_message", {
      p_conversation: conversationId,
      p_text: body,
      p_type: messageType,
      p_data: {
        ...(attachment ? { attachment } : {}),
        ...(imageData ? { imageData } : {}),
        ...(gifData ? { gifData, gifId } : {}),
      },
    }),
  );
};

/** Zera o meu contador e marca como vistas as mensagens que o outro mandou. */
export const markConversationRead = async (conversationId, userId) => {
  if (!conversationId || !userId) return;

  const { error } = await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });
  if (error) console.warn("[chat] markConversationRead", error);
};

/**
 * Apaga a própria mensagem. A prévia da conversa e o contador de não lidas o
 * banco acerta sozinho (`messages_after_delete`, 20261102150000) — antes a
 * lista continuava mostrando o texto apagado. `select()` para saber se a
 * linha saiu de fato: RLS que recusa não dá erro, só apaga zero linhas.
 */
export const deleteMessage = async (conversationId, messageId) => {
  if (!conversationId || !messageId) return;
  const rows = must(await supabase.from("messages").delete().eq("id", messageId).select("id"));
  if (!rows?.length) throw Object.assign(new Error("not-found"), { code: "not-found" });
};

/** Editar vale para texto próprio, até 15 minutos depois (o banco confere). */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

export const canEditMessage = (message = {}, userId = "", now = Date.now()) =>
  Boolean(userId) &&
  message.senderId === userId &&
  (message.type || "text") === "text" &&
  Boolean(message.text) &&
  now - toMillis(message.createdAt) < MESSAGE_EDIT_WINDOW_MS;

export const editMessage = async (messageId, text) =>
  must(
    await supabase.rpc("edit_message", {
      p_message: messageId,
      p_text: String(text || "").trim().slice(0, MESSAGE_MAX_LENGTH),
    }),
  );

/**
 * Prévia da lista no idioma de quem lê: o banco grava "📷 Imagem" etc. em
 * pt-BR quando a mensagem não tem texto.
 */
const SERVER_PREVIEWS = {
  "📷 Imagem": "socialPosts.messages.previewImage",
  "🎬 GIF": "socialPosts.messages.previewGif",
  "📷 Publicação": "socialPosts.messages.previewPost",
};
export const localizedPreview = (text = "", t) =>
  t && SERVER_PREVIEWS[text] ? t(SERVER_PREVIEWS[text]) : text;

/* ===== Formatação ===== */

const toDate = (value) => {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const formatMessageTime = (value, locale = "pt-BR") => {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

/** Rótulo do separador de dia dentro da conversa. */
export const formatDayLabel = (value, locale = "pt-BR", labels = {}) => {
  const date = toDate(value);
  if (!date) return "";

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) return labels.today || "Hoje";
  if (isSameDay(date, yesterday)) return labels.yesterday || "Ontem";

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
};

/** Horário curto da lista de conversas: hoje = hora, senão data. */
export const formatConversationTime = (value, locale = "pt-BR", labels = {}) => {
  const date = toDate(value);
  if (!date) return "";

  const now = new Date();
  if (isSameDay(date, now)) return formatMessageTime(value, locale);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return labels.yesterday || "Ontem";

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
};

export const dayKey = (value) => {
  const date = toDate(value);
  return date ? date.toDateString() : "";
};

/* ===== Conversa cliente ↔ prestador (fio de serviço) ===== */

/**
 * Um fio por anúncio e cliente: `svc__<anúncio>__<cliente>`. O banco monta o
 * mesmo id em `start_service_conversation` e quando o prestador responde um
 * orçamento, então dá para navegar direto sem perguntar.
 */
export const serviceConversationId = (listingId, customerId) =>
  `svc__${listingId}__${customerId}`;

export const isServiceConversation = (conversation = {}) => conversation.kind === "service";

/**
 * Aba da conversa em Mensagens:
 *   direct   — amigos e comunidade;
 *   services — eu sou o cliente (fios com prestadores);
 *   clients  — eu sou o prestador.
 */
export const conversationTab = (conversation = {}, userId = "") => {
  if (!isServiceConversation(conversation)) return "direct";
  return iAmProviderOf(conversation, userId) ? "clients" : "services";
};

/**
 * Fio aberto pelo cliente e ainda sem mensagem nenhuma: só ele vê na lista.
 * Abrir a tela de contato e desistir não pode virar um "novo cliente" vazio
 * na caixa do prestador.
 */
export const conversationVisible = (conversation = {}, userId = "") =>
  Boolean(conversation.lastMessage) || !conversation.startedBy || conversation.startedBy === userId;

// Códigos que o banco devolve e a tela sabe explicar (serviceChat.errors.*).
const CHAT_ERRORS = new Set([
  "not-signed-in", "not-found", "own-listing", "blocked", "too-many-open",
  "rate-limited", "awaiting-reply", "invalid-status", "account-suspended", "sold",
]);

export const chatErrorKey = (error) => {
  const code = String(error?.message || error?.code || "");
  return CHAT_ERRORS.has(code) ? `serviceChat.errors.${code}` : "";
};

/**
 * Abre (ou reabre) o fio com o prestador do anúncio. `car` é o rótulo do
 * carro (marca, modelo, ano) quando o cliente escolhe mandar; vazio mantém o
 * que já estava. `quoteRequestId` amarra um pedido de orçamento MEU ao fio.
 */
export const startServiceConversation = async (listingId, { car = "", quoteRequestId = null } = {}) =>
  must(
    await supabase.rpc("start_service_conversation", {
      p_listing: String(listingId || ""),
      p_car: String(car || "").trim().slice(0, 120),
      p_quote_request: quoteRequestId || null,
    }),
  );

/** Cartão fixado no topo do fio: anúncio, carro, pedido e resposta. Null fora de fio de serviço. */
export const fetchServiceContext = async (conversationId) => {
  if (!conversationId) return null;
  return must(await supabase.rpc("service_conversation_context", { p_conversation: conversationId }));
};

/** Só o prestador: "new" | "replied" | "closed". */
export const setServiceConversationStatus = async (conversationId, status) =>
  must(
    await supabase.rpc("set_service_conversation_status", {
      p_conversation: conversationId,
      p_status: status,
    }),
  );

/** A conversa, se existe e eu sou dela (a RLS esconde o resto). Null se não. */
export const findConversation = async (conversationId) => {
  if (!conversationId) return null;
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return data ? conversationFromRow(data) : null;
};
