import {
  attachmentSummary,
  conversationPartner,
  conversationUnread,
  formatConversationTime,
  iAmProviderOf,
  isServiceConversation,
  localizedPreview,
} from "../../services/chat";
import { withLiveProfile } from "../../hooks/useLiveProfiles";
import { formatAbsoluteTime } from "../../services/socialTime";
import { ChatAvatar } from "../ChatAvatar";
import { ServiceStatusPill } from "./ServiceThread";

/**
 * Uma linha da caixa de entrada: retrato, nome, prévia e não lidas.
 *
 * Saiu de dentro de pages/Messages.jsx em 07/11/2026, quando a caixa ganhou
 * uma segunda casa — a janelinha flutuante (MessageDock). A lista desenhada
 * em dois lugares vira duas listas diferentes na primeira correção que só um
 * dos dois recebe.
 */
export function ConversationRow({
  t,
  conversation,
  userId,
  locale,
  dayLabels,
  active,
  youLabel,
  emptyLabel,
  quoteLabel,
  livePeople,
  onClick,
}) {
  const partner = withLiveProfile(conversationPartner(conversation, userId), livePeople);
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
