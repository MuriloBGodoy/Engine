import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Search, Send, X } from "lucide-react";
import {
  attachmentFromGoal,
  conversationPartner,
  profileCardFromSettings,
  sendMessage,
  startConversation,
  subscribeConversations,
} from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { useToast } from "./ToastProvider";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { useProfileSearch } from "../hooks/useProfileSearch";

const matches = (person, term) =>
  `${person.author || ""} ${person.username || ""}`.toLowerCase().includes(term);

/**
 * "Enviar publicação" — o mesmo gesto do Instagram: escolhe uma ou várias
 * pessoas, escreve um recado opcional e o post viaja como anexo na DM.
 */
export function ShareToChatModal({ open, goal, user, settings, onClose }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [sentTo, setSentTo] = useState([]);
  const [sendingTo, setSendingTo] = useState("");

  const userId = user?.uid || "";

  // Voltar no Android fecha a folha em vez de sair do post.
  useHistoryDismiss(open && Boolean(goal), onClose);

  useEffect(() => {
    if (!open || !userId) return undefined;
    // Compartilhar post é coisa de amigo: os fios de serviço (cliente ↔
    // prestador) ficam de fora da lista.
    return subscribeConversations(userId, (list) =>
      setConversations(list.filter((conversation) => conversation.kind !== "service")),
    );
  }, [open, userId]);

  useEffect(() => {
    if (!open) return undefined;
    // Esc agora vem do useHistoryDismiss (um ouvinte só, fecha o topo).
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const term = search.trim().toLowerCase();
  const foundProfiles = useProfileSearch(term, { enabled: open, max: 20 });

  // Contatos = quem já tem conversa + perfis públicos, sem repetição.
  const contacts = useMemo(() => {
    const seen = new Set();
    const list = [];

    conversations.forEach((conversation) => {
      const partner = conversationPartner(conversation, userId);
      if (!partner.userId || seen.has(partner.userId)) return;
      seen.add(partner.userId);
      list.push(partner);
    });

    foundProfiles.forEach((profile) => {
      const id = profile.userId || profile.id;
      if (!id || id === userId || seen.has(id)) return;
      seen.add(id);
      list.push({
        userId: id,
        author: profile.author,
        username: profile.username,
        avatar: profile.avatar,
        avatarInitials: profile.avatarInitials,
      });
    });

    return term ? list.filter((person) => matches(person, term)) : list;
  }, [conversations, foundProfiles, term, userId]);

  if (!open || !goal) return null;

  const handleSend = async (person) => {
    if (sendingTo || sentTo.includes(person.userId)) return;
    setSendingTo(person.userId);

    try {
      const conversationId = await startConversation(
        profileCardFromSettings(settings, user),
        person,
      );
      await sendMessage(conversationId, {
        senderId: userId,
        text: note.trim(),
        attachment: attachmentFromGoal(goal),
      });
      setSentTo((current) => [...current, person.userId]);
    } catch (error) {
      console.error(error);
      toast(t("messages.sendError"));
    } finally {
      setSendingTo("");
    }
  };

  return createPortal(
    <div className="engine-modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("messages.shareTitle")}
        className="engine-modal-panel engine-pop sm:max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-accent)]">
              {t("messages.shareTitle")}
            </p>
            <p className="mt-1 truncate text-sm font-bold text-[var(--engine-text)]">
              {goal.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            /* 44x44: media 40x40. */
            className="-m-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={20} />
          </button>
        </header>

        <div className="shrink-0 border-b border-[var(--engine-border)] p-4">
          <div className="relative">
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
        </div>

        <div className="engine-modal-body engine-scroll">
          {contacts.map((person) => {
            const sent = sentTo.includes(person.userId);
            return (
              <div
                key={person.userId}
                className="flex items-center gap-3 border-b border-[var(--engine-border)] px-4 py-3 last:border-0"
              >
                <ChatAvatar person={person} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--engine-text)]">
                    {person.author}
                  </p>
                  <p className="truncate text-xs font-medium text-[var(--engine-text-subtle)]">
                    {person.username}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSend(person)}
                  disabled={sent || sendingTo === person.userId}
                  /* 44px de altura: media 36. Sem `sm:h-9` porque Fold (673px)
                     e tablet passam do breakpoint e continuam sendo toque. */
                  className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[10px] font-black uppercase tracking-widest transition ${
                    sent
                      ? "bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                      : "bg-[var(--engine-accent)] text-white hover:brightness-95 disabled:opacity-50"
                  }`}
                >
                  {sent ? <Check size={14} /> : <Send size={14} />}
                  {sent ? t("messages.sent") : t("messages.sendTo")}
                </button>
              </div>
            );
          })}

          {!contacts.length && (
            <p className="px-4 py-10 text-center text-sm font-semibold text-[var(--engine-text-muted)]">
              {t("messages.noResults")}
            </p>
          )}
        </div>

        <div className="engine-safe-bottom shrink-0 border-t border-[var(--engine-border)] p-3">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("messages.optionalNote")}
            className="h-11 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 text-sm font-semibold text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
