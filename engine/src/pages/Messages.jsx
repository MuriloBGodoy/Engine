import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ChevronRight,
  CloudOff,
  MessageCircle,
  Search,
  Send,
  Trash2,
  UserRound,
  Image,
  Check,
  CheckCheck,
  Flag,
  UserX,
  CheckCircle2,
  RotateCcw,
  Pencil,
  X,
} from "lucide-react";
import {
  attachmentSummary,
  canEditMessage,
  chatErrorKey,
  editMessage,
  localizedPreview,
  conversationTab,
  conversationVisible,
  iAmProviderOf,
  isMyMessage,
  isServiceConversation,
  setServiceConversationStatus,
  conversationPartner,
  conversationUnread,
  dayKey,
  deleteMessage,
  formatConversationTime,
  formatDayLabel,
  formatMessageTime,
  markConversationRead,
  profileCardFromSettings,
  sendMessage,
  startConversation,
  subscribeConversations,
  subscribeMessages,
} from "../services/chat";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useSocialReport } from "../hooks/useSocialReport";
import { engineDB } from "../services/db";
import { useProfileSearch } from "../hooks/useProfileSearch";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { ChatAvatar } from "../components/ChatAvatar";
import { ImagePreviewModal } from "../components/ImagePreviewModal";
import { EmojiPicker } from "../components/EmojiPicker";
import { GiphyPicker } from "../components/GiphyPicker";
import { compressImage, readFileAsDataUrl, blobToDataUrl } from "../services/imageCompression";
import { QuoteBubbleBody, ServiceContextCard, ServiceStatusPill } from "../components/messages/ServiceThread";
import { QUOTE_DEFAULT_LIMITS } from "../services/quotes";
import { formatAbsoluteTime } from "../services/socialTime";
import "../services/i18n-social-posts";

// Abas da caixa (migration 20261030120000). "Conversas" é a de sempre;
// "Serviços" são os fios em que eu sou o cliente; "Clientes", os em que eu
// sou o prestador. Como o Principal/Geral do Instagram para conta
// profissional: o trabalho não se mistura com os amigos.
const TABS = ["direct", "services", "clients"];
const STATUS_FILTERS = ["all", "new", "replied", "closed"];

const matchesQuery = (person, term, extra = "") =>
  `${person.author || ""} ${person.username || ""} ${person.city || ""} ${extra}`
    .toLowerCase()
    .includes(term);

/**
 * Central de mensagens diretas.
 *
 * Desktop: duas colunas (lista + conversa), como Instagram/WhatsApp Web.
 * Mobile: uma coluna só — a lista some quando uma conversa está aberta e o
 * botão de voltar traz ela de volta.
 */
export function Messages({ user, settings }) {
  const { t, i18n } = useTranslation();
  const { openReport, reportDialog } = useSocialReport();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { conversationId = "" } = useParams();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [conversations, setConversations] = useState([]);
  // Erro de leitura da lista. Sem isto, falha virava "nenhuma conversa".
  const [chatError, setChatError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [showGiphyPicker, setShowGiphyPicker] = useState(false);
  const [tab, setTab] = useState("direct");
  const [statusFilter, setStatusFilter] = useState("all");
  const [statusBusy, setStatusBusy] = useState(false);
  // Mensagem em edição: o texto dela vai para o compositor, como no WhatsApp.
  const [editingState, setEditing] = useState(null);
  // Trocar de conversa larga a edição (a mensagem é de outra conversa).
  const editing = editingState?.conversationId === conversationId ? editingState : null;
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);

  const userId = user?.uid || "";
  const locale = i18n.language || "pt-BR";
  const dayLabels = {
    today: t("messages.today"),
    yesterday: t("messages.yesterday"),
  };

  useEffect(() => {
    if (!userId) return undefined;
    return subscribeConversations(userId, (lista, erro) => {
      setConversations(lista);
      setChatError(erro || null);
    });
  }, [userId]);

  useEffect(() => {
    if (!conversationId) return undefined;
    return subscribeMessages(conversationId, setMessages);
  }, [conversationId]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === conversationId) || null,
    [conversationId, conversations],
  );

  // Fio de serviço que o cliente abriu e não mandou nada: só ele vê.
  const visibleConversations = useMemo(
    () =>
      conversations.filter(
        (item) => item.id === conversationId || conversationVisible(item, userId),
      ),
    [conversations, conversationId, userId],
  );

  // Não lidas e presença por aba. A aba só aparece quando tem conversa.
  const tabStats = useMemo(() => {
    const stats = Object.fromEntries(TABS.map((key) => [key, { count: 0, unread: 0 }]));
    visibleConversations.forEach((item) => {
      const key = conversationTab(item, userId);
      stats[key].count += 1;
      stats[key].unread += conversationUnread(item, userId);
    });
    return stats;
  }, [visibleConversations, userId]);
  const shownTabs = TABS.filter((key) => key === "direct" || tabStats[key].count > 0);

  // Abrir um fio pelo link (aviso do sino, botão do anúncio) leva para a aba
  // dele. Ajuste de estado durante o render, sem efeito: a aba segue a
  // conversa aberta, e a pessoa ainda pode trocar de aba depois.
  const activeTab = activeConversation ? conversationTab(activeConversation, userId) : "";
  const [syncedFor, setSyncedFor] = useState("");
  if (activeConversation && syncedFor !== activeConversation.id) {
    setSyncedFor(activeConversation.id);
    if (activeTab !== tab) setTab(activeTab);
  }
  const currentTab = shownTabs.includes(tab) ? tab : "direct";

  const partner = useMemo(
    () => (activeConversation ? conversationPartner(activeConversation, userId) : null),
    [activeConversation, userId],
  );

  // Abrir a conversa já marca como lida (e toda vez que chega algo novo com
  // a janela aberta).
  useEffect(() => {
    if (!conversationId || !userId || !activeConversation) return;
    if (!conversationUnread(activeConversation, userId)) return;
    markConversationRead(conversationId, userId);
  }, [activeConversation, conversationId, messages.length, userId]);

  const term = search.trim().toLowerCase();
  // Sugestões só existem quando se busca ou quando ainda não há conversa;
  // fora disso nem consulta.
  const foundProfiles = useProfileSearch(term, {
    enabled: Boolean(term) || !conversations.length,
    max: 20,
  });

  const filteredConversations = useMemo(() => {
    let list = visibleConversations.filter((item) => conversationTab(item, userId) === currentTab);
    if (currentTab === "clients" && statusFilter !== "all") {
      list = list.filter((item) => (item.serviceStatus || "new") === statusFilter);
    }
    if (!term) return list;
    return list.filter((conversation) =>
      matchesQuery(
        conversationPartner(conversation, userId),
        term,
        `${conversation.context?.listingTitle || ""} ${conversation.context?.car || ""}`,
      ),
    );
  }, [visibleConversations, currentTab, statusFilter, term, userId]);

  // Pessoas da comunidade que ainda não têm conversa aberta. Some quando já
  // existem conversas e nada foi buscado (a lista não é um diretório), mas
  // aparece de cara para quem ainda não conversou com ninguém.
  const suggestions = useMemo(() => {
    if (currentTab !== "direct") return [];
    if (!term && conversations.length) return [];

    const known = new Set(
      conversations.map((conversation) => conversationPartner(conversation, userId).userId),
    );
    const seen = new Set();

    return foundProfiles
      .filter((profile) => {
        const id = profile.userId || profile.id;
        if (!id || id === userId || known.has(id) || seen.has(id)) return false;
        if (term && !matchesQuery(profile, term)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 8);
  }, [conversations, currentTab, foundProfiles, term, userId]);

  const openConversationWith = async (profile) => {
    try {
      const id = await startConversation(profileCardFromSettings(settings, user), {
        userId: profile.userId || profile.id,
        author: profile.author,
        username: profile.username,
        avatar: profile.avatar,
        avatarInitials: profile.avatarInitials,
      });
      setSearch("");
      navigate(`/messages/${id}`);
    } catch (error) {
      console.error(error);
      toast(t("messages.startError"));
    }
  };

  const startEdit = (message) => {
    setEditing({ ...message, conversationId });
    setDraft(message.text || "");
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || !conversationId) return;

    if (editing) {
      setSending(true);
      try {
        if (text !== editing.text) await editMessage(editing.id, text);
        cancelEdit();
      } catch (error) {
        console.error(error);
        toast(
          t(
            String(error?.code || error?.message) === "edit-window-closed"
              ? "socialPosts.messages.editWindowClosed"
              : "socialPosts.messages.editError",
          ),
        );
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    setDraft("");
    try {
      await sendMessage(conversationId, { senderId: userId, text });
    } catch (error) {
      console.error(error);
      setDraft(text);
      // Bloqueio (de qualquer um dos lados) é recusado pelo banco.
      toast(
        t(
          chatErrorKey(error) ||
            (/blocked/.test(String(error?.message || error?.code || "")) ? "socialFixes.blockedAction" : "messages.sendError"),
        ),
      );
    } finally {
      setSending(false);
    }
  };

  // Denunciar uma mensagem recebida: o banco confere que quem denuncia está
  // na conversa e guarda o texto para a moderação.
  const handleReportMessage = (message) => {
    openReport({ targetType: "message", targetId: message.id, reportedUserId: message.senderId || "" });
  };

  const handleBlockPartner = async () => {
    if (!partner?.userId) return;
    const ok = await confirm({
      title: t("community.blockTitle"),
      message: t("community.blockMessage", { user: partner.username || partner.author }),
      confirmLabel: t("community.block"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    try {
      await engineDB.setUserBlocked(partner.userId, true, userId);
      toast(t("community.blockedNotice"));
      navigate("/messages");
    } catch (error) {
      console.error(error);
      toast(t("community.blockError"));
    }
  };

  const handleDeleteMessage = async (message) => {
    const ok = await confirm({
      title: t("messages.deleteTitle"),
      message: t("messages.deleteConfirm"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;

    try {
      await deleteMessage(conversationId, message.id);
    } catch (error) {
      console.error(error);
      toast(t("messages.deleteError"));
    }
  };

  const handleImageSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      toast(t("messages.invalidImage"));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPreviewImage(dataUrl);
    } catch (error) {
      console.error(error);
      toast(t("messages.imageError"));
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImagePreviewSend = async (imageUrl, caption) => {
    if (!conversationId) return;

    setCompressing(true);
    try {
      const isGif = imageUrl.includes("data:image/gif");
      const blob = await compressImage(imageUrl, 1600, 0.8, isGif);
      const compressedUrl = await blobToDataUrl(blob);

      setSending(true);
      setDraft("");
      setPreviewImage(null);

      await sendMessage(conversationId, {
        senderId: userId,
        text: caption || "",
        imageData: compressedUrl,
      });
    } catch (error) {
      console.error(error);
      toast(t(chatErrorKey(error) || "messages.sendError"));
    } finally {
      setSending(false);
      setCompressing(false);
    }
  };

  const handleEmojiSelect = (emoji) => {
    setDraft((prev) => prev + emoji);
  };

  const handleGiphySelect = async (gif) => {
    if (!conversationId) return;

    setShowGiphyPicker(false);
    setSending(true);

    try {
      await sendMessage(conversationId, {
        senderId: userId,
        text: "",
        gifData: gif.gifUrl,
        gifId: gif.gifId,
      });
    } catch (error) {
      console.error(error);
      toast(t(chatErrorKey(error) || "messages.sendError"));
    } finally {
      setSending(false);
    }
  };

  // Prestador marca o fio como fechado (ou reabre).
  const isService = isServiceConversation(activeConversation || {});
  // Dono do anúncio ou alguém da equipe da página (20261101130000).
  const iAmProvider = isService && iAmProviderOf(activeConversation, userId);
  const awaitingProvider =
    isService &&
    !iAmProvider &&
    activeConversation?.startedBy === userId &&
    !activeConversation?.firstReplyAt &&
    Boolean(activeConversation?.lastMessage);
  const toggleClosed = async () => {
    if (!iAmProvider || statusBusy) return;
    setStatusBusy(true);
    try {
      await setServiceConversationStatus(
        conversationId,
        activeConversation.serviceStatus === "closed" ? "replied" : "closed",
      );
    } catch (error) {
      console.error(error);
      toast(t("serviceChat.status.error"));
    } finally {
      setStatusBusy(false);
    }
  };

  const showList = !conversationId || isDesktop;
  const showThread = Boolean(conversationId);

  return (
    <section className="flex flex-1 flex-col" style={{ gridColumn: "1 / -1" }}>
      {/* No celular a caixa encosta nas bordas (ganha largura útil) e volta a
          ser cartão a partir de sm — mesmo padrão do header da comunidade. */}
      <div className="engine-chat-shell -mx-4 flex overflow-hidden border-y border-[var(--engine-border)] bg-[var(--engine-surface)] sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
        {showList && (
          <aside
            className={`flex min-w-0 flex-col border-[var(--engine-border)] lg:w-[340px] lg:flex-none lg:border-r ${
              showThread ? "hidden lg:flex" : "flex-1"
            }`}
          >
            <div className="shrink-0 border-b border-[var(--engine-border)] p-4">
              <h1 className="text-lg font-extrabold italic tracking-tight text-[var(--engine-text)]">
                {t("messages.title")}
              </h1>
              <div className="relative mt-3">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--engine-text-subtle)]"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("messages.searchPlaceholder")}
                  className="h-11 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] pl-9 pr-3 text-sm font-semibold text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
                />
              </div>
              {shownTabs.length > 1 && (
                <div
                  role="tablist"
                  aria-label={t("serviceChat.tabs.label")}
                  className="mt-3 flex gap-1 rounded-xl bg-[var(--engine-surface-2)] p-1"
                >
                  {shownTabs.map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={currentTab === key}
                      onClick={() => setTab(key)}
                      className={`flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold transition ${
                        currentTab === key
                          ? "bg-[var(--engine-surface)] text-[var(--engine-text)] shadow-sm"
                          : "text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                      }`}
                    >
                      <span className="truncate">{t(`serviceChat.tabs.${key}`)}</span>
                      {tabStats[key].unread > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[var(--engine-accent)] px-1 text-[9px] font-black text-white">
                          {tabStats[key].unread > 9 ? "9+" : tabStats[key].unread}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {currentTab === "clients" && (
                <div className="engine-scroll -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                  {STATUS_FILTERS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={statusFilter === key}
                      onClick={() => setStatusFilter(key)}
                      className={`min-h-8 shrink-0 rounded-full border px-3 text-[11px] font-bold transition ${
                        statusFilter === key
                          ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                          : "border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                      }`}
                    >
                      {t(`serviceChat.status.${key}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="engine-scroll min-h-0 flex-1 overflow-y-auto">
              {filteredConversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  userId={userId}
                  locale={locale}
                  dayLabels={dayLabels}
                  active={conversation.id === conversationId}
                  t={t}
                  youLabel={t("messages.you")}
                  emptyLabel={t("messages.noMessagesYet")}
                  quoteLabel={t("serviceChat.quoteBubble")}
                  onClick={() => {
                    setSearch("");
                    navigate(`/messages/${conversation.id}`);
                  }}
                />
              ))}

              {suggestions.length > 0 && (
                <div className="border-t border-[var(--engine-border)]">
                  <p className="px-4 pb-2 pt-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-text-subtle)]">
                    {t("messages.people")}
                  </p>
                  {suggestions.map((profile) => (
                    <button
                      key={profile.userId || profile.id}
                      type="button"
                      onClick={() => openConversationWith(profile)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--engine-surface-2)]"
                    >
                      <ChatAvatar person={profile} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--engine-text)]">
                          {profile.author}
                        </span>
                        <span className="block truncate text-xs font-medium text-[var(--engine-text-subtle)]">
                          {profile.username}
                        </span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-[var(--engine-text-subtle)]" />
                    </button>
                  ))}
                </div>
              )}

              {/* Leitura que falhou nao e caixa vazia: sem esta divisao, uma
                  permissao negada e uma vida sem conversa desenhavam a mesma
                  tela, e nao havia como saber que as mensagens ainda existiam. */}
              {!filteredConversations.length && !suggestions.length && chatError && (
                <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--engine-accent)]/40 bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
                    <CloudOff size={20} />
                  </div>
                  <p className="mt-4 text-sm font-bold text-[var(--engine-text)]">
                    {t("messages.loadFailed")}
                  </p>
                  <p className="mt-2 max-w-xs text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
                    {t("messages.loadFailedHint")}
                  </p>
                </div>
              )}

              {!filteredConversations.length && !suggestions.length && !chatError && (
                <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--engine-border)] text-[var(--engine-text-subtle)]">
                    <MessageCircle size={20} />
                  </div>
                  <p className="mt-4 text-sm font-bold text-[var(--engine-text)]">
                    {term
                      ? t("messages.noResults")
                      : currentTab === "services"
                        ? t("serviceChat.emptyServices")
                        : currentTab === "clients"
                          ? t("serviceChat.emptyClients")
                          : t("messages.empty")}
                  </p>
                  <p className="mt-2 max-w-xs text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
                    {term
                      ? t("messages.noResultsHint")
                      : currentTab === "services"
                        ? t("serviceChat.emptyServicesHint")
                        : currentTab === "clients"
                          ? t("serviceChat.emptyClientsHint")
                          : t("messages.emptyHint")}
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}

        {showThread ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center gap-2 border-b border-[var(--engine-border)] p-3 sm:px-4">
              <button
                type="button"
                onClick={() => navigate("/messages")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] lg:hidden"
                aria-label={t("messages.back")}
              >
                <ArrowLeft size={20} />
              </button>

              <ChatAvatar person={partner} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--engine-text)]">
                  {partner?.author || t("messages.title")}
                </p>
                <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--engine-text-subtle)]">
                  <span className="truncate">{partner?.username}</span>
                  {iAmProvider && <ServiceStatusPill status={activeConversation?.serviceStatus} />}
                </p>
              </div>

              {iAmProvider && (
                <button
                  type="button"
                  onClick={toggleClosed}
                  disabled={statusBusy}
                  title={activeConversation?.serviceStatus === "closed" ? t("serviceChat.status.reopen") : t("serviceChat.status.close")}
                  aria-label={activeConversation?.serviceStatus === "closed" ? t("serviceChat.status.reopen") : t("serviceChat.status.close")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)] disabled:opacity-40"
                >
                  {activeConversation?.serviceStatus === "closed" ? <RotateCcw size={18} /> : <CheckCircle2 size={19} />}
                </button>
              )}

              {partner?.username && (
                <button
                  type="button"
                  onClick={() => navigate(`/community/${partner.username}`)}
                  title={t("messages.viewProfile")}
                  aria-label={t("messages.viewProfile")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
                >
                  <UserRound size={19} />
                </button>
              )}
              {partner?.userId && !partner?.deleted && (
                <button
                  type="button"
                  onClick={handleBlockPartner}
                  title={t("community.block")}
                  aria-label={t("community.block")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
                >
                  <UserX size={19} />
                </button>
              )}
            </header>

            {isService && <ServiceContextCard conversation={activeConversation} locale={locale} />}

            <MessageList
              messages={messages}
              conversation={activeConversation}
              userId={userId}
              locale={locale}
              dayLabels={dayLabels}
              t={t}
              onOpenPost={(goalId) => navigate(`/community?goal=${encodeURIComponent(goalId)}`)}
              onDelete={handleDeleteMessage}
              onEdit={startEdit}
              onReport={handleReportMessage}
            />

            {awaitingProvider && !partner?.deleted && (
              <p className="shrink-0 border-t border-[var(--engine-border)] px-4 pt-2 text-[11px] font-medium text-[var(--engine-text-subtle)]">
                {t("serviceChat.awaiting", { count: QUOTE_DEFAULT_LIMITS.maxMessagesBeforeReply })}
              </p>
            )}
            {partner?.deleted ? (
              <p className="shrink-0 border-t border-[var(--engine-border)] p-4 text-center text-sm text-[var(--engine-text-muted)]">
                {t("messages.accountDeleted")}
              </p>
            ) : (
              <>
              {editing && (
                <div className="flex shrink-0 items-center gap-2 border-t border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-2 text-xs">
                  <Pencil size={13} className="shrink-0 text-[var(--engine-accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[var(--engine-text)]">{t("socialPosts.messages.editing")}</span>
                    <span className="block truncate text-[var(--engine-text-muted)]">{editing.text}</span>
                  </span>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    aria-label={t("socialPosts.messages.cancelEdit")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface)]"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
              <form
                onSubmit={handleSend}
                className="flex shrink-0 items-stretch gap-2 border-t border-[var(--engine-border)] p-3"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,image/gif"
                  onChange={handleImageSelected}
                  className="hidden"
                  aria-label={t("socialPosts.messages.chooseImage")}
                />
  
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || compressing || Boolean(editing)}
                    title={t("socialPosts.messages.photo")}
                    aria-label={t("socialPosts.messages.photo")}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)] disabled:opacity-40"
                  >
                    <Image size={18} />
                  </button>
  
                  <button
                    type="button"
                    onClick={() => setShowGiphyPicker(true)}
                    disabled={sending || Boolean(editing)}
                    title={t("socialPosts.messages.gif")}
                    aria-label={t("socialPosts.messages.gif")}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)] disabled:opacity-40 font-black text-xs"
                  >
                    GIF
                  </button>
  
                  <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                </div>
  
                <textarea
                  ref={composerRef}
                  value={draft}
                  rows={1}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && editing) {
                      event.preventDefault();
                      cancelEdit();
                      return;
                    }
                    if (event.key === "Enter" && !event.shiftKey && isDesktop) {
                      handleSend(event);
                    }
                  }}
                  placeholder={t("messages.composerPlaceholder")}
                  className="engine-scroll max-h-32 min-h-11 w-full min-w-0 flex-1 resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-2 text-sm font-semibold text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
                  style={{ lineHeight: "1.5" }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  title={editing ? t("socialPosts.messages.saveEdit") : t("messages.send")}
                  aria-label={editing ? t("socialPosts.messages.saveEdit") : t("messages.send")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] text-white transition hover:brightness-95 disabled:opacity-40"
                >
                  <Send size={18} />
                </button>
              </form>
              </>
            )}

            {previewImage && (
              <ImagePreviewModal
                imageUrl={previewImage}
                onSend={handleImagePreviewSend}
                onCancel={() => setPreviewImage(null)}
                isLoading={compressing}
              />
            )}

            {showGiphyPicker && (
              <GiphyPicker
                onSelect={handleGiphySelect}
                onClose={() => setShowGiphyPicker(false)}
              />
            )}
          </div>
        ) : (
          <div className="hidden min-w-0 flex-1 flex-col items-center justify-center px-6 text-center lg:flex">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--engine-border)] text-[var(--engine-text-subtle)]">
              <MessageCircle size={24} />
            </div>
            <p className="mt-4 text-base font-extrabold italic text-[var(--engine-text)]">
              {t("messages.pickConversation")}
            </p>
            <p className="mt-2 max-w-sm text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
              {t("messages.pickConversationHint")}
            </p>
          </div>
        )}
      </div>
      {reportDialog}
    </section>
  );
}

function ConversationRow({
  t,
  conversation,
  userId,
  locale,
  dayLabels,
  active,
  youLabel,
  emptyLabel,
  quoteLabel,
  onClick,
}) {
  const partner = conversationPartner(conversation, userId);
  const unread = conversationUnread(conversation, userId);
  const last = conversation.lastMessage;
  const service = isServiceConversation(conversation);
  const preview = last
    ? `${last.senderId === userId ? `${youLabel}: ` : ""}${last.type === "quote" ? `${quoteLabel}: ` : ""}${
        localizedPreview(last.text, t) || attachmentSummary(null)
      }`
    : emptyLabel;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-[var(--engine-border)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[var(--engine-surface-2)] ${
        active ? "bg-[var(--engine-accent-soft)]" : ""
      }`}
    >
      <ChatAvatar person={partner} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-bold text-[var(--engine-text)]">
            {partner.author}
          </span>
          {service && iAmProviderOf(conversation, userId) && (
            <ServiceStatusPill status={conversation.serviceStatus} className="ml-auto" />
          )}
          <span
            title={formatAbsoluteTime(conversation.updatedAt, locale)}
            className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--engine-text-subtle)]"
          >
            {formatConversationTime(conversation.updatedAt, locale, dayLabels)}
          </span>
        </span>
        {service && conversation.context?.listingTitle && (
          <span className="block truncate text-[11px] font-semibold text-[var(--engine-accent)]">
            {conversation.context.listingTitle}
            {conversation.context.car ? ` · ${conversation.context.car}` : ""}
          </span>
        )}
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={`min-w-0 flex-1 truncate text-[13px] ${
              unread
                ? "font-bold text-[var(--engine-text)]"
                : "font-medium text-[var(--engine-text-muted)]"
            }`}
          >
            {preview}
          </span>
          {unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--engine-accent)] px-1.5 text-[10px] font-black text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function MessageList({ messages, conversation, userId, locale, dayLabels, t, onOpenPost, onDelete, onEdit, onReport }) {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  // Marca onde entra o separador de data antes de renderizar (a lista precisa
  // comparar cada mensagem com a anterior).
  const rows = messages.map((message, index) => {
    const currentDay = dayKey(message.createdAt);
    const previousDay = index ? dayKey(messages[index - 1].createdAt) : "";
    return {
      message,
      showDay: Boolean(currentDay) && currentDay !== previousDay,
    };
  });

  return (
    <div
      ref={listRef}
      className="engine-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-4"
    >
      {!messages.length && (
        <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-bold text-[var(--engine-text)]">
            {t("messages.noMessages")}
          </p>
          <p className="mt-2 max-w-xs text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
            {t("messages.noMessagesHint")}
          </p>
        </div>
      )}

      {rows.map(({ message, showDay }) => (
        <div key={message.id}>
            {showDay && (
              <p className="py-3 text-center text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-text-subtle)]">
                {formatDayLabel(message.createdAt, locale, dayLabels)}
              </p>
            )}
            <MessageBubble
              message={message}
              mine={isMyMessage(conversation, message, userId)}
              deletable={message.senderId === userId}
              editable={canEditMessage(message, userId)}
              onEdit={onEdit}
              locale={locale}
              t={t}
              onOpenPost={onOpenPost}
              onDelete={onDelete}
              onReport={onReport}
            />
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ message, mine, deletable = mine, editable = false, locale, t, onOpenPost, onDelete, onEdit, onReport }) {
  const attachment = message.attachment;
  const imageData = message.imageData;
  const gifData = message.gifData;

  return (
    <div className={`group flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
      {/* No celular não existe hover: com `opacity-0` o apagar ficava
          invisível ao toque (só aparecia com foco de teclado). Agora fica
          esmaecido no celular e aparece no hover a partir de sm. */}
      {editable && (
        <button
          type="button"
          onClick={() => onEdit(message)}
          title={t("socialPosts.messages.edit")}
          aria-label={t("socialPosts.messages.edit")}
          className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-subtle)] opacity-60 transition hover:text-[var(--engine-accent)] focus:opacity-100 group-hover:opacity-100 sm:opacity-0"
        >
          <Pencil size={13} />
        </button>
      )}
      {deletable && (
        <button
          type="button"
          onClick={() => onDelete(message)}
          title={t("messages.deleteTitle")}
          aria-label={t("messages.deleteTitle")}
          className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-subtle)] opacity-60 transition hover:text-[var(--engine-accent)] focus:opacity-100 group-hover:opacity-100 sm:opacity-0"
        >
          <Trash2 size={13} />
        </button>
      )}

      <div
        className={`max-w-[min(78%,28rem)] overflow-hidden rounded-2xl px-3 py-2 ${
          mine
            ? "rounded-br-md bg-[var(--engine-accent)] text-white"
            : "rounded-bl-md bg-[var(--engine-surface-2)] text-[var(--engine-text)]"
        }`}
      >
        {gifData && (
          <img
            src={gifData}
            alt={t("socialPosts.messages.sentGif")}
            className="mb-2 max-h-64 w-full rounded-lg object-cover"
          />
        )}

        {imageData && (
          <img
            src={imageData}
            alt={t("socialPosts.messages.sentImage")}
            className="mb-2 max-h-64 w-full rounded-lg object-cover"
          />
        )}

        {message.type === "quote" && <QuoteBubbleBody quote={message.quote} mine={mine} locale={locale} />}

        {attachment && (
          <button
            type="button"
            onClick={() => onOpenPost(attachment.goalId)}
            className={`mb-2 block w-full overflow-hidden rounded-xl text-left transition ${
              mine ? "bg-black/15" : "bg-[var(--engine-surface)]"
            }`}
          >
            {attachment.image && (
              <img
                src={attachment.image}
                alt={attachment.title}
                className="h-28 w-full object-cover sm:h-32"
              />
            )}
            <span className="block px-3 py-2">
              <span className="block truncate text-[13px] font-extrabold italic">
                {attachment.title}
              </span>
              <span
                className={`mt-0.5 block truncate text-[11px] font-semibold ${
                  mine ? "text-white/75" : "text-[var(--engine-text-subtle)]"
                }`}
              >
                {attachment.author} · {t("messages.viewPost")}
              </span>
            </span>
          </button>
        )}

        {message.text && (
          <p className="whitespace-pre-wrap break-words text-sm font-medium leading-6">
            {message.text}
          </p>
        )}

        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] font-semibold ${
            mine ? "text-white/70" : "text-[var(--engine-text-subtle)]"
          }`}
        >
          {message.editedAt && <span>{t("socialPosts.messages.edited")} ·</span>}
          <time
            dateTime={message.createdAt || undefined}
            title={formatAbsoluteTime(message.createdAt, locale)}
          >
            {formatMessageTime(message.createdAt, locale)}
          </time>
          {mine && (
            <>
              {message.status === "seen" && (
                <CheckCheck size={12} className="text-white/70" />
              )}
              {message.status === "delivered" && (
                <Check size={12} className="text-white/70" />
              )}
            </>
          )}
        </div>
      </div>

      {!mine && onReport && (
        <button
          type="button"
          onClick={() => onReport(message)}
          title={t("socialFixes.reportMessage")}
          aria-label={t("socialFixes.reportMessage")}
          className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-subtle)] opacity-60 transition hover:text-[var(--engine-accent)] focus:opacity-100 group-hover:opacity-100 sm:opacity-0"
        >
          <Flag size={13} />
        </button>
      )}
    </div>
  );
}
