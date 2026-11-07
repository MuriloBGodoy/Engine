import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Image as ImageIcon, Maximize2, MessageCircle, Send, X } from "lucide-react";
import {
  chatErrorKey,
  conversationPartner,
  conversationUnread,
  conversationVisible,
  deleteMessage,
  markConversationRead,
  sendMessage,
  subscribeConversations,
  subscribeMessages,
} from "../../services/chat";
import { useLiveProfiles, withLiveProfile } from "../../hooks/useLiveProfiles";
import { useToast } from "../ToastProvider";
import { useConfirm } from "../ConfirmProvider";
import { ChatAvatar } from "../ChatAvatar";
import { ImagePreviewModal } from "../ImagePreviewModal";
import { ConversationRow } from "./ConversationRow";
import { MessageList } from "./MessageList";
import { blobToDataUrl, compressImage, readFileAsDataUrl } from "../../services/imageCompression";
import { imagesFromPaste } from "../../services/clipboardImage";
import "../../services/i18n-message-dock";
import "../../services/i18n-social-posts";

/**
 * A janelinha de mensagens — a caixa que acompanha a pessoa pelo app.
 *
 * 07/11/2026. Mensagens era mais um item da sidebar: para responder alguém
 * era preciso SAIR do que se estava fazendo, ir para /messages e voltar.
 * Conversa não é destino, é companhia — é por isso que Facebook, LinkedIn e
 * o Gmail põem o chat numa pílula no canto, que abre uma janela por cima do
 * resto. Aqui é a mesma ideia, com os mesmos dois botões que todo mundo já
 * conhece: expandir (abre a página inteira) e fechar.
 *
 * Só no desktop (lg). No celular a caixa de entrada já é um ícone com
 * contador no header (MobileNav) — uma janela flutuante ali cobriria o
 * conteúdo e brigaria com a barra de abas e com o botão de publicar da
 * comunidade, que moram no mesmo canto.
 *
 * O estado aberto/fechado sobrevive à navegação pelo localStorage: a janela
 * é uma decisão da pessoa sobre o espaço dela, não um estado de página.
 */

const DOCK_KEY = "engine:dock:messages";

const readDockState = () => {
  try {
    return window.localStorage.getItem(DOCK_KEY) === "open";
  } catch {
    return false;
  }
};

const writeDockState = (open) => {
  try {
    window.localStorage.setItem(DOCK_KEY, open ? "open" : "closed");
  } catch {
    /* navegação privada, armazenamento bloqueado: a janela só não lembra. */
  }
};

export function MessageDock({ user }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const confirm = useConfirm();

  const [open, setOpen] = useState(readDockState);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const fileRef = useRef(null);

  const userId = user?.uid || "";
  const locale = i18n.language || "pt-BR";
  const dayLabels = { today: t("messages.today"), yesterday: t("messages.yesterday") };
  // Na própria página de mensagens a janelinha seria a mesma coisa duas vezes.
  const onMessagesPage = location.pathname.startsWith("/messages");

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      return undefined;
    }
    return subscribeConversations(userId, (lista) => setConversations(lista || []));
  }, [userId]);

  useEffect(() => {
    if (!activeId || !open) {
      setMessages([]);
      return undefined;
    }
    return subscribeMessages(activeId, setMessages);
  }, [activeId, open]);

  // Sair da conta fecha a janela e larga a conversa.
  useEffect(() => {
    if (!userId) {
      setActiveId("");
      setOpen(false);
    }
  }, [userId]);

  // Esc fecha: primeiro o fio aberto, depois a janela. Mesmo degrau que o
  // voltar do Android faz nos modais (R8).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      // Prévia da foto aberta por cima: o Esc é dela.
      if (previewImage) return;
      if (activeId) setActiveId("");
      else {
        setOpen(false);
        writeDockState(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeId, previewImage]);

  const visibles = useMemo(
    () => conversations.filter((item) => conversationVisible(item, userId)),
    [conversations, userId],
  );

  const partnerIds = useMemo(
    () => visibles.map((item) => conversationPartner(item, userId).userId),
    [visibles, userId],
  );
  const livePeople = useLiveProfiles(partnerIds);

  const unread = useMemo(
    () => visibles.reduce((total, item) => total + conversationUnread(item, userId), 0),
    [visibles, userId],
  );

  const active = useMemo(
    () => visibles.find((item) => item.id === activeId) || null,
    [visibles, activeId],
  );
  const partner = active
    ? withLiveProfile(conversationPartner(active, userId), livePeople)
    : null;

  // Abrir o fio já zera o contador dele, como na página inteira.
  useEffect(() => {
    if (!open || !activeId || !userId || !active) return;
    if (!conversationUnread(active, userId)) return;
    markConversationRead(activeId, userId);
  }, [open, activeId, userId, active, messages.length]);

  const toggle = (next) => {
    setOpen(next);
    writeDockState(next);
    if (!next) setActiveId("");
  };

  const expand = () => {
    toggle(false);
    navigate(activeId ? `/messages/${activeId}` : "/messages");
  };

  const send = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || !activeId) return;
    setSending(true);
    setDraft("");
    try {
      await sendMessage(activeId, { senderId: userId, text });
    } catch (error) {
      console.error(error);
      setDraft(text);
      toast(t(chatErrorKey(error) || "messages.sendError"));
    } finally {
      setSending(false);
    }
  };

  const pickImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPreviewImage(await readFileAsDataUrl(file));
    } catch (error) {
      console.error(error);
      toast(t("messages.imageError"));
    }
  };

  const handlePaste = async (event) => {
    if (!activeId || sending || compressing) return;
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

  const sendImage = async (imageUrl, caption) => {
    if (!activeId) return;
    setCompressing(true);
    try {
      const blob = await compressImage(imageUrl, 1600, 0.8, imageUrl.includes("data:image/gif"));
      const compressed = await blobToDataUrl(blob);
      setSending(true);
      setPreviewImage(null);
      await sendMessage(activeId, { senderId: userId, text: caption || "", imageData: compressed });
    } catch (error) {
      console.error(error);
      toast(t(chatErrorKey(error) || "messages.sendError"));
    } finally {
      setSending(false);
      setCompressing(false);
    }
  };

  const removeMessage = async (message) => {
    const ok = await confirm({
      title: t("messages.deleteTitle"),
      message: t("messages.deleteConfirm"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await deleteMessage(activeId, message.id);
    } catch (error) {
      console.error(error);
      toast(t("messages.deleteError"));
    }
  };

  if (!userId || onMessagesPage) return null;

  // Os três retratos da pílula: as conversas mais recentes, como no Facebook.
  const faces = visibles
    .slice(0, 3)
    .map((item) => withLiveProfile(conversationPartner(item, userId), livePeople));

  return createPortal(
    <div className="engine-message-dock hidden lg:flex">
      {open ? (
        <section
          className="flex h-[min(30rem,calc(100dvh-7rem))] w-[22.5rem] flex-col overflow-hidden rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] shadow-[0_18px_48px_rgba(0,0,0,0.36)]"
          aria-label={t("nav.messages")}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-[var(--engine-border)] px-3 py-2.5">
            {activeId ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveId("")}
                  aria-label={t("messages.back")}
                  title={t("messages.back")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)]"
                >
                  <ArrowLeft size={18} />
                </button>
                <ChatAvatar person={partner} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-[var(--engine-text)]">
                    {partner?.author || t("nav.messages")}
                  </span>
                  <span className="block truncate text-[11px] font-medium text-[var(--engine-text-subtle)]">
                    {partner?.username}
                  </span>
                </span>
              </>
            ) : (
              <>
                <MessageCircle size={18} className="ml-1 shrink-0 text-[var(--engine-accent)]" />
                <h2 className="min-w-0 flex-1 truncate text-[13px] font-black uppercase tracking-wide text-[var(--engine-text)]">
                  {t("nav.messages")}
                </h2>
              </>
            )}

            <button
              type="button"
              onClick={expand}
              aria-label={t("messageDock.expand")}
              title={t("messageDock.expand")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => toggle(false)}
              aria-label={t("messageDock.close")}
              title={t("messageDock.close")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
            >
              <X size={17} />
            </button>
          </header>

          {activeId ? (
            <>
              <MessageList
                messages={messages}
                conversation={active}
                userId={userId}
                locale={locale}
                dayLabels={dayLabels}
                t={t}
                onOpenPost={(goalId) => {
                  toggle(false);
                  navigate(`/community?goal=${encodeURIComponent(goalId)}`);
                }}
                onDelete={removeMessage}
              />

              <form
                onSubmit={send}
                onPaste={handlePaste}
                className="flex shrink-0 items-end gap-1.5 border-t border-[var(--engine-border)] p-2"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,image/gif"
                  onChange={pickImage}
                  className="hidden"
                  aria-label={t("socialPosts.messages.chooseImage")}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={sending || compressing}
                  title={t("pasteImage.hint")}
                  aria-label={t("socialPosts.messages.photo")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)] disabled:opacity-40"
                >
                  <ImageIcon size={17} />
                </button>
                <textarea
                  value={draft}
                  rows={1}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) send(event);
                  }}
                  placeholder={t("messages.composerPlaceholder")}
                  className="engine-scroll max-h-24 min-h-10 w-full min-w-0 flex-1 resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2 text-[13px] font-semibold text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
                  style={{ lineHeight: "1.5" }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  aria-label={t("messages.send")}
                  title={t("messages.send")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] text-white transition hover:brightness-95 disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : (
            <div className="engine-scroll min-h-0 flex-1 overflow-y-auto">
              {visibles.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  userId={userId}
                  locale={locale}
                  dayLabels={dayLabels}
                  active={false}
                  t={t}
                  youLabel={t("messages.you")}
                  emptyLabel={t("messages.noMessagesYet")}
                  quoteLabel={t("serviceChat.quoteBubble")}
                  livePeople={livePeople}
                  onClick={() => setActiveId(conversation.id)}
                />
              ))}

              {!visibles.length && (
                <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-[13px] font-bold text-[var(--engine-text)]">
                    {t("messages.empty")}
                  </p>
                  <button
                    type="button"
                    onClick={expand}
                    className="min-h-9 rounded-full bg-[var(--engine-accent)] px-4 text-[11px] font-black uppercase tracking-wide text-white transition hover:brightness-95"
                  >
                    {t("messageDock.openInbox")}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        <button
          type="button"
          onClick={() => toggle(true)}
          title={t("nav.messages")}
          className="flex h-12 items-center gap-2.5 rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface)] pl-3.5 pr-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.34)] transition hover:border-[var(--engine-accent)]"
        >
          <span className="relative flex shrink-0 items-center text-[var(--engine-text-muted)]">
            <MessageCircle size={19} />
            {unread > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--engine-accent)] px-1 text-[9px] font-black leading-none text-white ring-2 ring-[var(--engine-surface)]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </span>
          <span className="text-[13px] font-bold text-[var(--engine-text)]">
            {t("nav.messages")}
          </span>
          {faces.length > 0 && (
            <span className="flex shrink-0 items-center pl-0.5">
              {faces.map((person, index) => (
                <span
                  key={person.userId || index}
                  className={`rounded-full ring-2 ring-[var(--engine-surface)] ${index ? "-ml-2" : ""}`}
                >
                  <ChatAvatar person={person} size="xs" />
                </span>
              ))}
            </span>
          )}
        </button>
      )}

      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          onSend={sendImage}
          onCancel={() => setPreviewImage(null)}
          isLoading={compressing}
        />
      )}
    </div>,
    document.body,
  );
}
