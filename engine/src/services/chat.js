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
});

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
  const partnerId =
    (conversation.memberIds || []).find((id) => id !== userId) || "";
  return {
    userId: partnerId,
    ...memberCard(conversation.members?.[partnerId]),
  };
};

export const conversationUnread = (conversation = {}, userId = "") =>
  Number(conversation.unread?.[userId]) || 0;

/** Resumo curto de um anexo, usado na prévia da lista de conversas. */
export const attachmentSummary = (attachment) =>
  attachment?.title ? `📷 ${attachment.title}` : "📷 Publicação";

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
    title: goal.title || "",
    brand: goal.brand || "",
    model: goal.model || "",
    year: goal.year || "",
    image: goal.image || "",
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
      const rows = must(
        await supabase
          .from("conversations")
          .select("*")
          .contains("member_ids", [userId])
          .order("updated_at", { ascending: false })
          .limit(60),
      );
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

export const deleteMessage = async (conversationId, messageId) => {
  if (!conversationId || !messageId) return;
  must(await supabase.from("messages").delete().eq("id", messageId));
};

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
