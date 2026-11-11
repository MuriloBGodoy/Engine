import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ChevronRight,
  CloudOff,
  MessageCircle,
  Search,
  Send,
  Image,
  Video,
  Plus,
  Camera,
  UserX,
  CheckCircle2,
  RotateCcw,
  Pencil,
  X,
} from "lucide-react";
import {
  chatErrorKey,
  editMessage,
  conversationTab,
  conversationVisible,
  iAmProviderOf,
  isServiceConversation,
  setServiceConversationStatus,
  conversationPartner,
  conversationUnread,
  deleteMessage,
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
import { useLiveProfiles, withLiveProfile } from "../hooks/useLiveProfiles";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { ChatAvatar } from "../components/ChatAvatar";
import { profilePath } from "../services/people";
import { ImagePreviewModal } from "../components/ImagePreviewModal";
import { EmojiPicker } from "../components/EmojiPicker";
import { GiphyPicker } from "../components/GiphyPicker";
import { compressImage, readFileAsDataUrl, blobToDataUrl } from "../services/imageCompression";
import { imagesFromPaste } from "../services/clipboardImage";
import { uploadChatVideo } from "../services/chatMedia";
import { BottomSheet } from "../components/BottomSheet";
import { ServiceContextCard, ServiceStatusPill } from "../components/messages/ServiceThread";
import { ConversationRow } from "../components/messages/ConversationRow";
import { MessageList } from "../components/messages/MessageList";
import { QUOTE_DEFAULT_LIMITS } from "../services/quotes";
import { VIDEO_LIMITS } from "../services/postVideo";
import "../services/i18n-social-posts";
import "../services/i18n-message-dock";

// Abas da caixa (migration 20261030120000). "Conversas" é a de sempre;
// "Serviços" são os fios em que eu sou o cliente; "Clientes", os em que eu
// sou o prestador. Como o Principal/Geral do Instagram para conta
// profissional: o trabalho não se mistura com os amigos.
const TABS = ["direct", "services", "clients"];
// Erros de vídeo que valem mostrar com nome; o resto vira "não deu para
// enviar" (mesma lista do compositor de post).
const VIDEO_ERRORS_SHOWN = ["tooBig", "format", "notVideo", "unreadable"];
const VIDEO_MB = Math.round(VIDEO_LIMITS.maxBytes / (1024 * 1024));
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
  const [sendingVideo, setSendingVideo] = useState(false);
  const [showGiphyPicker, setShowGiphyPicker] = useState(false);
  const [anexosAbertos, setAnexosAbertos] = useState(false);
  const galeriaRef = useRef(null);
  const cameraRef = useRef(null);
  const [tab, setTab] = useState("direct");
  const [statusFilter, setStatusFilter] = useState("all");
  const [statusBusy, setStatusBusy] = useState(false);
  // Mensagem em edição: o texto dela vai para o compositor, como no WhatsApp.
  const [editingState, setEditing] = useState(null);
  // Trocar de conversa larga a edição (a mensagem é de outra conversa).
  const editing = editingState?.conversationId === conversationId ? editingState : null;
  const composerRef = useRef(null);

  /**
   * O campo cresce com o texto, até o teto de `max-h-32`.
   *
   * 09/11/2026: sem isto o campo tinha uma linha de altura fixa, então um
   * texto de duas linhas — ou mesmo o próprio "Mensagem..." quando a tela era
   * estreita — ficava com a segunda linha cortada por baixo da borda. É o
   * mesmo comportamento de WhatsApp e Instagram: uma linha em repouso, e a
   * caixa sobe conforme se escreve.
   */
  const ajustaAltura = useCallback((el) => {
    if (!el) return;
    el.style.height = "auto";
    const altura = el.scrollHeight;
    el.style.height = `${altura}px`;
    // Enquanto o texto couber, não há o que rolar — e a barra de rolagem do
    // navegador reserva ~12px mesmo vazia. Numa tela de 320px esses 12px
    // eram justamente o que jogava o "Mensagem..." para uma segunda linha.
    const teto = parseFloat(getComputedStyle(el).maxHeight);
    el.style.overflowY = Number.isFinite(teto) && altura > teto ? "auto" : "hidden";
  }, []);

  /**
   * O campo entra medido, não só depois da primeira tecla.
   *
   * O efeito abaixo escuta `draft`, mas o compositor só aparece quando a
   * conversa termina de carregar — depois, portanto, da última mudança de
   * `draft`. Resultado: em repouso o campo ficava com a altura crua do
   * navegador e com a barra de rolagem reservada. Medir no momento em que o
   * elemento entra no DOM resolve os dois casos.
   */
  const ligaComposer = useCallback(
    (el) => {
      composerRef.current = el;
      ajustaAltura(el);
    },
    [ajustaAltura],
  );

  useEffect(() => {
    ajustaAltura(composerRef.current);
  }, [draft, ajustaAltura]);

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

  // O cartão guardado na conversa é do dia em que ela começou: quem trocou de
  // @ ficava com o @ velho no chat, e desde que o nome virou o caminho para o
  // perfil, esse @ velho abria uma página que não existe. O perfil de verdade
  // entra por cima.
  const partnerIds = useMemo(
    () => conversations.map((item) => conversationPartner(item, userId).userId),
    [conversations, userId],
  );
  const livePeople = useLiveProfiles(partnerIds);

  const partner = useMemo(
    () =>
      activeConversation
        ? withLiveProfile(conversationPartner(activeConversation, userId), livePeople)
        : null,
    [activeConversation, userId, livePeople],
  );
  // Conta apagada não tem @, e sem @ não existe perfil para abrir: o
  // cabeçalho então não oferece um toque que não leva a lugar nenhum.
  const partnerPath = partner?.deleted ? "" : profilePath(partner?.username);

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
        withLiveProfile(conversationPartner(conversation, userId), livePeople),
        term,
        `${conversation.context?.listingTitle || ""} ${conversation.context?.car || ""}`,
      ),
    );
  }, [visibleConversations, currentTab, statusFilter, term, userId, livePeople]);

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
      await deleteMessage(conversationId, message.id, message);
    } catch (error) {
      console.error(error);
      toast(t("messages.deleteError"));
    }
  };

  const handleImageSelected = async (file) => {
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
  };

  // Vídeo na conversa: sobe para o bucket fechado da conversa e a mensagem
  // guarda só o caminho (services/chatMedia.js). Sem corte e sem editor — na
  // DM o vídeo é recado, não publicação.
  const handleVideoSelected = async (file) => {
    if (!conversationId || !file || sending) return;
    setSendingVideo(true);
    try {
      const video = await uploadChatVideo(file, { conversationId, userId });
      await sendMessage(conversationId, { senderId: userId, text: "", video });
    } catch (error) {
      console.error(error);
      const code = VIDEO_ERRORS_SHOWN.includes(error?.code) ? error.code : "upload";
      toast(t(`socialPosts.videoErrors.${code}`, { mb: VIDEO_MB }));
    } finally {
      setSendingVideo(false);
    }
  };

  // Um seletor só para foto e vídeo — é o tipo do arquivo que decide o
  // caminho. Antes eram dois botões no compositor, cada um com o seu
  // `accept`: quem abria o da foto não via os vídeos da galeria e achava que
  // o Engine não mandava vídeo.
  const receberAnexo = (event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    setAnexosAbertos(false);
    if (!file) return;
    if (file.type.startsWith("video/")) handleVideoSelected(file);
    else handleImageSelected(file);
  };

  // Ctrl+V com uma foto na área de transferência cai na MESMA prévia do
  // seletor de arquivo: legenda, editor e envio continuam um caminho só.
  const handlePaste = async (event) => {
    if (!conversationId || sending || compressing || editing) return;
    const [file] = imagesFromPaste(event);
    if (!file) return;
    event.preventDefault();
    try {
      setPreviewImage(await readFileAsDataUrl(file));
    } catch (error) {
      console.error(error);
      toast(t("messages.imageError"));
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
  // Conversa aberta no celular ocupa a tela toda; ver `isChatThread` em App.jsx.
  const immersive = showThread && !isDesktop;

  return (
    <section className="flex flex-1 flex-col" style={{ gridColumn: "1 / -1" }}>
      {/* No celular a caixa encosta nas bordas (ganha largura útil) e volta a
          ser cartão a partir de sm — mesmo padrão do header da comunidade. */}
      <div
        className={
          immersive
            ? "engine-chat-shell--immersive flex overflow-hidden bg-[var(--engine-surface)] lg:rounded-2xl lg:border lg:border-[var(--engine-border)] lg:shadow-sm"
            : "engine-chat-shell -mx-4 flex overflow-hidden border-y border-[var(--engine-border)] bg-[var(--engine-surface)] sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm"
        }
      >
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
                  livePeople={livePeople}
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
            <header
              className={`flex shrink-0 items-center gap-2 border-b border-[var(--engine-border)] p-3 sm:px-4 ${
                immersive ? "pt-[calc(0.75rem+env(safe-area-inset-top))]" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => navigate("/messages")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] lg:hidden"
                aria-label={t("messages.back")}
              >
                <ArrowLeft size={20} />
              </button>

              {/* O retrato e o nome são o caminho para o perfil, como em
                  qualquer app de mensagem — antes era preciso achar um ícone
                  de bonequinho à direita, que ninguém lê como "ver perfil". */}
              <button
                type="button"
                onClick={() => partnerPath && navigate(partnerPath)}
                disabled={!partnerPath}
                title={partnerPath ? t("messages.viewProfile") : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl text-left transition enabled:hover:bg-[var(--engine-surface-2)] disabled:cursor-default"
              >
                <ChatAvatar person={partner} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--engine-text)]">
                    {partner?.author || t("messages.title")}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--engine-text-subtle)]">
                    <span className="truncate">{partner?.username}</span>
                    {iAmProvider && <ServiceStatusPill status={activeConversation?.serviceStatus} />}
                  </span>
                </span>
              </button>

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
                onPaste={handlePaste}
                className={`flex shrink-0 items-end gap-1 border-t border-[var(--engine-border)] p-2 min-[360px]:gap-1.5 sm:gap-2 sm:p-3 ${
                  immersive ? "pb-[calc(0.5rem+env(safe-area-inset-bottom))]" : ""
                }`}
              >
                {/* Um "+" no lugar de quatro botões. Medido em 10/11/2026 num
                    celular de 320px: foto, vídeo, GIF e emoji deixavam 102px
                    para o campo de texto, e "Mensagem..." mede 98px — por isso
                    o texto parecia cortado. Com um botão só sobram ~190px.
                    O emoji fica só no computador: o teclado do celular já tem
                    emoji, e ali o botão só ocupava lugar. */}
                <button
                  type="button"
                  onClick={() => setAnexosAbertos(true)}
                  disabled={sending || compressing || sendingVideo || Boolean(editing)}
                  title={t("messages.attach")}
                  aria-label={t("messages.attach")}
                  aria-haspopup="dialog"
                  aria-expanded={anexosAbertos}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-40 sm:h-11 sm:w-11"
                >
                  {sendingVideo || compressing ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--engine-border)] border-t-[var(--engine-accent)]" />
                  ) : (
                    <Plus size={19} />
                  )}
                </button>

                {isDesktop && <EmojiPicker onEmojiSelect={handleEmojiSelect} />}

                <textarea
                  ref={ligaComposer}
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
                  className="engine-scroll max-h-32 min-h-10 w-full min-w-[6rem] flex-1 resize-none rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-2 py-2 text-sm font-semibold text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)] min-[360px]:px-3.5 sm:min-h-11 sm:px-4"
                  style={{ lineHeight: "1.5" }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  title={editing ? t("socialPosts.messages.saveEdit") : t("messages.send")}
                  aria-label={editing ? t("socialPosts.messages.saveEdit") : t("messages.send")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--engine-accent)] text-white transition hover:brightness-95 disabled:opacity-40 min-[360px]:h-10 min-[360px]:w-10 sm:h-11 sm:w-11 sm:rounded-xl"
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

            {/* Os dois campos ficam FORA da folha: a folha fecha assim que a
                pessoa escolhe o que quer, e um input que some junto com ela
                nunca chega a abrir o seletor do sistema. */}
            <input
              ref={galeriaRef}
              type="file"
              accept="image/*,video/*"
              onChange={receberAnexo}
              className="hidden"
              tabIndex={-1}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={receberAnexo}
              className="hidden"
              tabIndex={-1}
            />

            <BottomSheet
              open={anexosAbertos}
              onClose={() => setAnexosAbertos(false)}
              ariaLabel={t("messages.attach")}
              bare
            >
              <div className="grid grid-cols-4 gap-x-2 gap-y-4 pb-1 pt-1">
                {[
                  {
                    chave: "midia",
                    icone: <Image size={21} />,
                    rotulo: t("messages.attachPhotoVideo"),
                    acao: () => {
                      setAnexosAbertos(false);
                      galeriaRef.current?.click();
                    },
                  },
                  {
                    chave: "camera",
                    icone: <Camera size={21} />,
                    rotulo: t("messages.attachCamera"),
                    acao: () => {
                      setAnexosAbertos(false);
                      cameraRef.current?.click();
                    },
                  },
                  {
                    chave: "gif",
                    icone: <span className="text-[11px] font-black">GIF</span>,
                    rotulo: t("socialPosts.messages.gif"),
                    acao: () => {
                      setAnexosAbertos(false);
                      setShowGiphyPicker(true);
                    },
                  },
                ].map((item) => (
                  <button
                    key={item.chave}
                    type="button"
                    onClick={item.acao}
                    className="flex min-h-[4.5rem] flex-col items-center gap-1.5 rounded-xl p-1 text-[11px] font-bold leading-tight text-[var(--engine-text-muted)] transition active:scale-95"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-accent)]">
                      {item.icone}
                    </span>
                    <span className="w-full text-center">{item.rotulo}</span>
                  </button>
                ))}
              </div>
            </BottomSheet>
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
