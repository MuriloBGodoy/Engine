import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { firestore } from "./firebase";

/**
 * Mensagens diretas (DM) do Engine.
 *
 * Modelo no Firestore:
 *   conversations/{id}                -> id determinístico "uidA__uidB"
 *     memberIds: [uidA, uidB]         (ordenado; usado no array-contains)
 *     members:   { uid: {author, username, avatar, avatarInitials} }
 *     unread:    { uid: number }
 *     lastMessage: { text, senderId, type, createdAt }
 *   conversations/{id}/messages/{msgId}
 *     { senderId, text, type: "text" | "post", attachment?, createdAt }
 *
 * O cartão do autor fica desnormalizado na conversa para a lista renderizar
 * sem N leituras de perfil.
 */
const CONVERSATIONS = "conversations";
const MESSAGES_LIMIT = 200;
const MESSAGE_MAX_LENGTH = 2000;

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
  const target = Number(goal.targetValue) || 0;
  const progress = target
    ? Math.min((Number(goal.savedValue) / target) * 100, 100)
    : 0;

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

  // Sem orderBy: "array-contains" + orderBy exigiria índice composto no
  // Firestore. A lista de conversas é curta, então ordenamos no cliente.
  const conversationsQuery = query(
    collection(firestore, CONVERSATIONS),
    where("memberIds", "array-contains", userId),
    limit(60),
  );

  return onSnapshot(
    conversationsQuery,
    (snapshot) => {
      const conversations = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      callback(conversations);
    },
    (error) => {
      console.warn("[chat] subscribeConversations", error);
      callback([], error);
    },
  );
};

/** Mensagens de uma conversa. Mesmo contrato: `(mensagens, erro)`. */
export const subscribeMessages = (conversationId, callback) => {
  if (!conversationId) {
    callback([]);
    return () => {};
  }

  const messagesQuery = query(
    collection(firestore, CONVERSATIONS, conversationId, "messages"),
    orderBy("createdAt", "desc"),
    limit(MESSAGES_LIMIT),
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .reverse();
      callback(messages);
    },
    (error) => {
      console.warn("[chat] subscribeMessages", error);
      callback([], error);
    },
  );
};

/**
 * Garante que a conversa entre duas pessoas existe e devolve o id.
 * Como o id é determinístico, abrir a mesma pessoa duas vezes nunca duplica.
 */
export const startConversation = async (me, other) => {
  if (!me?.userId || !other?.userId || me.userId === other.userId) {
    throw new Error("Conversa inválida.");
  }

  const conversationId = conversationIdFor(me.userId, other.userId);
  const conversationRef = doc(firestore, CONVERSATIONS, conversationId);
  const snapshot = await getDoc(conversationRef);

  if (!snapshot.exists()) {
    await setDoc(conversationRef, {
      memberIds: [me.userId, other.userId].sort(),
      members: {
        [me.userId]: memberCard(me),
        [other.userId]: memberCard(other),
      },
      unread: { [me.userId]: 0, [other.userId]: 0 },
      lastMessage: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return conversationId;
  }

  // Mantém o próprio cartão em dia (nome/avatar podem ter mudado).
  await updateDoc(conversationRef, {
    [`members.${me.userId}`]: memberCard(me),
  }).catch((error) => console.warn("[chat] startConversation", error));

  return conversationId;
};

const notifyNewMessage = async (recipientId, senderId, sender, conversationId) => {
  const author = sender.author || "Alguém";

  await addDoc(collection(firestore, "users", recipientId, "notifications"), {
    type: "message",
    actorId: senderId,
    actorName: author,
    actorUsername: sender.username || "",
    recipientId,
    conversationId,
    targetPath: `/messages/${conversationId}`,
    notificationTitle: "Nova mensagem",
    notificationBody: `${author} te enviou uma mensagem.`,
    text: `${author} te enviou uma mensagem.`,
    read: false,
    createdAt: serverTimestamp(),
  });
};

export const sendMessage = async (
  conversationId,
  { senderId, text = "", attachment = null, imageData = null, gifData = null, gifId = null },
) => {
  const body = String(text || "").trim().slice(0, MESSAGE_MAX_LENGTH);
  if (!conversationId || !senderId || (!body && !attachment && !imageData && !gifData)) return null;

  const conversationRef = doc(firestore, CONVERSATIONS, conversationId);
  const snapshot = await getDoc(conversationRef);
  if (!snapshot.exists()) throw new Error("Conversa não encontrada.");

  const conversation = snapshot.data();
  const recipientId = (conversation.memberIds || []).find(
    (id) => id !== senderId,
  );

  const messageType = gifData ? "gif" : imageData ? "image" : attachment ? "post" : "text";
  const created = await addDoc(collection(conversationRef, "messages"), {
    senderId,
    text: body,
    type: messageType,
    status: "delivered",
    ...(attachment ? { attachment } : {}),
    ...(imageData ? { imageData } : {}),
    ...(gifData ? { gifData, gifId } : {}),
    createdAt: serverTimestamp(),
  });

  await updateDoc(conversationRef, {
    updatedAt: serverTimestamp(),
    lastMessage: {
      text: body || (gifData ? "🎬 GIF" : imageData ? "📷 Imagem" : attachmentSummary(attachment)),
      senderId,
      type: messageType,
      createdAt: serverTimestamp(),
    },
    [`unread.${senderId}`]: 0,
    ...(recipientId ? { [`unread.${recipientId}`]: increment(1) } : {}),
  });

  // Só avisa no sino quando a conversa estava "zerada": mensagens seguidas de
  // um mesmo papo não viram uma enxurrada de notificações.
  if (recipientId && !conversationUnread(conversation, recipientId)) {
    await notifyNewMessage(
      recipientId,
      senderId,
      memberCard(conversation.members?.[senderId]),
      conversationId,
    ).catch((error) => console.warn("[chat] notifyNewMessage", error));
  }

  return created.id;
};

export const markConversationRead = async (conversationId, userId) => {
  if (!conversationId || !userId) return;

  await updateDoc(doc(firestore, CONVERSATIONS, conversationId), {
    [`unread.${userId}`]: 0,
  }).catch((error) => console.warn("[chat] markConversationRead", error));

  // Marcar mensagens não-lidas como vistas
  try {
    const messagesRef = collection(firestore, CONVERSATIONS, conversationId, "messages");
    const messagesQuery = query(messagesRef, where("senderId", "!=", userId), where("status", "==", "delivered"));
    const snapshot = await getDocs(messagesQuery);

    if (!snapshot.empty) {
      const batch = writeBatch(firestore);
      snapshot.docs.forEach((messageDoc) => {
        batch.update(messageDoc.ref, { status: "seen" });
      });
      await batch.commit();
    }
  } catch (error) {
    console.warn("[chat] markMessagesAsSeen", error);
  }
};

export const deleteMessage = async (conversationId, messageId) => {
  if (!conversationId || !messageId) return;
  await deleteDoc(
    doc(firestore, CONVERSATIONS, conversationId, "messages", messageId),
  );
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
