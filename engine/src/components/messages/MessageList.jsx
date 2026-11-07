import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Check, CheckCheck, Flag, Pencil, Trash2 } from "lucide-react";
import {
  canEditMessage,
  dayKey,
  formatDayLabel,
  formatMessageTime,
  isMyMessage,
} from "../../services/chat";
import { formatAbsoluteTime } from "../../services/socialTime";
import { QuoteBubbleBody } from "./ServiceThread";

/**
 * O fio de mensagens — balões, separador de data e rolagem colada no fim.
 *
 * Saiu de pages/Messages.jsx em 07/11/2026 para que a janelinha flutuante
 * (MessageDock) mostrasse o MESMO fio da página inteira, e não uma cópia
 * empobrecida que envelheceria sozinha.
 */
export function MessageList({ messages, conversation, userId, locale, dayLabels, t, onOpenPost, onDelete, onEdit, onReport }) {
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

/** O que o cartão promete ao ser tocado, conforme o que ele carrega. */
const attachmentAction = (attachment, t) =>
  attachment?.href ? t("messages.openAttachment") : t("messages.viewPost");

function MessageBubble({ message, mine, deletable = mine, editable = false, locale, t, onOpenPost, onDelete, onEdit, onReport }) {
  const navigate = useNavigate();
  const attachment = message.attachment;
  const imageData = message.imageData;
  const gifData = message.gifData;

  return (
    <div className={`group flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
      {/* No celular não existe hover: com `opacity-0` o apagar ficava
          invisível ao toque (só aparecia com foco de teclado). Agora fica
          esmaecido no celular e aparece no hover a partir de sm. */}
      {/* `onEdit` pode não vir: a janelinha do canto mostra o mesmo fio sem
          oferecer edição. Sem esta guarda o lápis aparecia lá e quebrava. */}
      {editable && onEdit && (
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
            /* Post abre no visualizador de post; clube, evento, anúncio e
               perfil são navegação normal, pelo caminho guardado no anexo. */
            onClick={() =>
              attachment.href ? navigate(attachment.href) : onOpenPost(attachment.goalId)
            }
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
                {[attachment.author || attachment.subtitle, attachmentAction(attachment, t)]
                  .filter(Boolean)
                  .join(" · ")}
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
