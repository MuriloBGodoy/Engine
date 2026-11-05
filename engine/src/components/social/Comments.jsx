import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Edit3, Flag, MessageCircle, MoreHorizontal, Send, Trash2, X } from "lucide-react";
import { POST_KIND_POST } from "../../services/db";
import { getInitials, isImageUrl, withoutAt } from "../../services/people";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { buildThreads } from "../../services/comments";
import { RichText } from "./RichText";
import { TimeAgo } from "./TimeAgo";

const RICH_LINK = "font-semibold text-[var(--engine-accent-text)] hover:underline";

/** Quantas respostas aparecem antes do "ver mais". */
const RESPOSTAS_A_MOSTRAR = 2;

/**
 * O retrato de alguém, como botão que leva ao perfil.
 *
 * O desenho mora no `span`; o `button` é só o alvo. No tamanho pequeno (32px)
 * a bolinha ficaria abaixo dos 44px de toque, então o botão cresce por fora
 * com margem negativa e o avatar continua do tamanho que o layout pede.
 */
export function AvatarButton({ person, onClick, size = "md" }) {
  const label = person?.author || person?.name || "Usuário Engine";
  const avatar = person?.avatar || person?.avatarInitials || getInitials(label);
  const isSmall = size === "sm";
  const sizeClass = isSmall ? "h-8 w-8 text-xs" : "h-11 w-11";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center justify-center rounded-full transition hover:ring-2 hover:ring-red-500/40 ${
        isSmall ? "-m-1.5 h-11 w-11 sm:m-0 sm:h-8 sm:w-8" : "h-11 w-11"
      }`}
      title={label}
    >
      <span
        className={`flex ${sizeClass} items-center justify-center overflow-hidden rounded-full bg-[var(--engine-accent)] font-black italic text-white`}
      >
        {isImageUrl(avatar) ? (
          <img src={avatar} alt={label} className="h-full w-full object-cover" />
        ) : (
          avatar
        )}
      </span>
    </button>
  );
}

/**
 * Lista de comentários + compositor. Vive dentro da folha de comentários
 * (feed, página do post, vídeos) e também na coluna lateral do modal de
 * publicação no desktop.
 */
export function CommentsPanel({
  goal,
  comments,
  draft,
  replyTo = null,
  editingCommentId,
  editingDraft,
  commentMenuId,
  currentUserId,
  composerRef,
  t,
  onDraftChange,
  onSubmitComment,
  onReply,
  onCancelReply,
  onOpenProfile,
  onStartEditComment,
  onEditingDraftChange,
  onSubmitEditComment,
  onCancelEdit,
  onDeleteComment,
  onReportComment,
  onCommentMenuChange,
  inline = false,
}) {
  const threads = useMemo(() => buildThreads(comments), [comments]);

  return (
    <>
      {/* Inline, a lista entra no fluxo da coluna que já rola: manter o
          overflow próprio criaria scroll dentro de scroll. */}
      <div
        className={
          inline
            ? "border-t border-[var(--engine-border)] px-4 py-4 sm:px-5"
            : "engine-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
        }
      >
        {threads.length ? (
          <div className="space-y-4">
            {threads.map(({ comment, replies }, index) => (
              <CommentThread
                key={`${goal.id}-comment-${(typeof comment === "string" ? "" : comment.id) || index}`}
                goal={goal}
                comment={comment}
                replies={replies}
                currentUserId={currentUserId}
                editingCommentId={editingCommentId}
                editingDraft={editingDraft}
                commentMenuId={commentMenuId}
                t={t}
                onReply={onReply}
                onOpenProfile={onOpenProfile}
                onStartEditComment={onStartEditComment}
                onEditingDraftChange={onEditingDraftChange}
                onSubmitEditComment={onSubmitEditComment}
                onCancelEdit={onCancelEdit}
                onDeleteComment={onDeleteComment}
                onReportComment={onReportComment}
                onCommentMenuChange={onCommentMenuChange}
              />
            ))}
          </div>
        ) : (
          <div
            className={`flex flex-col items-center justify-center text-center ${
              inline ? "py-6" : "h-full min-h-48"
            }`}
          >
            <MessageCircle className="mb-3 text-[var(--engine-text-subtle)]" size={30} />
            <p className="text-sm font-bold text-[var(--engine-text)]">
              {t("community.noComments")}
            </p>
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmitComment}
        className="shrink-0 border-t border-[var(--engine-border)] p-3 sm:p-4"
      >
        {/* Respondendo a quem: a pessoa precisa ver para onde o texto vai — e
            poder desistir sem apagar o que já escreveu. */}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--engine-surface-2)] px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--engine-text-muted)]">
              {t("community.replyingTo", {
                user: withoutAt(replyTo.username) || replyTo.author || t("community.member"),
              })}
            </span>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label={t("common.cancel")}
              className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-subtle)] transition hover:text-[var(--engine-text)]"
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={composerRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={t(
              replyTo
                ? "community.replyPlaceholder"
                : goal?.kind === POST_KIND_POST
                  ? "community.commentPlaceholderPost"
                  : "community.commentPlaceholder",
            )}
            className="min-w-0 flex-1 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-3 text-sm font-medium text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)] sm:px-4"
          />
          <button
            type="submit"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] text-white transition hover:brightness-95"
            title={t("community.send")}
            aria-label={t("community.send")}
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </>
  );
}

/**
 * Um comentário e o fio dele.
 *
 * O fio tem um nível só, como no Instagram: responder uma resposta continua
 * no mesmo fio (quem garante isso é o banco). As duas primeiras respostas
 * aparecem; o resto fica atrás de "ver mais" — senão um fio de vinte respostas
 * empurra todos os outros comentários para fora da tela.
 */
function CommentThread({ comment, replies, t, ...rowProps }) {
  const [aberto, setAberto] = useState(false);
  const visiveis = aberto ? replies : replies.slice(0, RESPOSTAS_A_MOSTRAR);
  const escondidas = replies.length - visiveis.length;

  return (
    <div>
      <CommentRow comment={comment} t={t} {...rowProps} />
      {replies.length > 0 && (
        <div className="mt-2 space-y-2 border-l border-[var(--engine-border)] pl-3 sm:pl-4">
          {visiveis.map((reply, index) => (
            <CommentRow
              key={reply.id || `reply-${index}`}
              comment={reply}
              t={t}
              {...rowProps}
            />
          ))}
          {escondidas > 0 && (
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="min-h-9 text-[12.5px] font-bold text-[var(--engine-text-subtle)] transition hover:text-[var(--engine-text-muted)]"
            >
              {t("community.moreReplies", { count: escondidas })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Prévia dos comentários no cartão: o link "ver todos" e o comentário mais
 * recente, cortado numa linha. Tudo é um botão só — a prévia não tem ação
 * própria, ela é a porta da folha.
 */
export function CommentPreview({ comments, t, onOpen }) {
  const last = comments[comments.length - 1];
  const text = typeof last === "string" ? last : last?.text || "";
  const who =
    typeof last === "string" ? "" : withoutAt(last?.username) || last?.author || "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full px-3 pb-3 text-left sm:px-4"
    >
      {comments.length > 1 && (
        <span className="block text-[13px] font-medium text-[var(--engine-text-subtle)] transition hover:text-[var(--engine-text-muted)]">
          {t("socialFeed.viewAllComments", { count: comments.length })}
        </span>
      )}
      {text && (
        <span className="mt-0.5 block truncate text-[13px] leading-5 text-[var(--engine-text)]">
          {who && <span className="mr-1 font-bold">{who}</span>}
          {text}
        </span>
      )}
    </button>
  );
}

export function CommentRow({
  goal,
  comment,
  currentUserId,
  editingCommentId,
  editingDraft,
  commentMenuId,
  t,
  onReply,
  onOpenProfile,
  onStartEditComment,
  onEditingDraftChange,
  onSubmitEditComment,
  onCancelEdit,
  onDeleteComment,
  onReportComment,
  onCommentMenuChange,
}) {
  const commentText = typeof comment === "string" ? comment : comment.text;
  const commentTime = typeof comment === "string" ? "" : comment.createdAt;
  const wasEdited = typeof comment !== "string" && Boolean(comment.editedAt);
  const commentAuthor =
    typeof comment === "string" ? t("community.member") : comment.author;
  const commentUsername = typeof comment === "string" ? "" : comment.username;
  const commentPerson =
    typeof comment === "string"
      ? { author: commentAuthor, username: commentUsername }
      : {
          author: commentAuthor,
          username: commentUsername,
          avatar: comment.avatar,
          avatarInitials: comment.avatarInitials,
          userId: comment.userId,
        };
  const canEdit =
    typeof comment !== "string" &&
    comment.id &&
    comment.userId === currentUserId;
  const canDelete =
    typeof comment !== "string" &&
    comment.id &&
    (comment.userId === currentUserId || goal.ownerId === currentUserId);
  // Comentário de outra pessoa: denunciar (o visitante vai para o login).
  const canReport =
    typeof comment !== "string" &&
    Boolean(comment.id) &&
    Boolean(onReportComment) &&
    comment.userId !== currentUserId;
  const canReply = typeof comment !== "string" && Boolean(comment.id) && Boolean(onReply);
  const isEditing = canEdit && editingCommentId === comment.id;
  // O "@fulano" na frente da resposta: dentro de um fio de três pessoas é o
  // que diz a quem ela responde, já que todas aparecem no mesmo degrau.
  const respondeuA = typeof comment === "string" ? "" : comment.replyToAuthor || "";

  return (
    <div className="group flex gap-3 rounded-xl px-1 py-1.5 text-sm transition hover:bg-[var(--engine-surface-2)]">
      <AvatarButton
        person={commentPerson}
        size="sm"
        onClick={() => onOpenProfile(commentPerson.userId, commentPerson)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenProfile(commentPerson.userId, commentPerson)}
            className="min-w-0 truncate text-left text-xs font-bold text-[var(--engine-text-muted)] transition hover:text-[var(--engine-accent)] dark:text-white"
          >
            {commentAuthor} <span className="text-[var(--engine-text-subtle)]">{commentUsername}</span>
          </button>
          {(canEdit || canDelete || canReport) && !isEditing && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() =>
                  onCommentMenuChange((current) =>
                    current === comment.id ? "" : comment.id,
                  )
                }
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--engine-text-subtle)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] dark:hover:text-white"
                title={t("socialFixes.commentOptions")}
                aria-label={t("socialFixes.commentOptions")}
              >
                <MoreHorizontal size={16} />
              </button>
              {commentMenuId === comment.id && (
                <div className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface)] py-1 shadow-xl">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        onStartEditComment(comment);
                        onCommentMenuChange("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
                    >
                      <Edit3 size={14} />
                      {t("socialFixes.editComment")}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteComment(goal.id, comment.id);
                        onCommentMenuChange("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
                    >
                      <Trash2 size={14} />
                      {t("common.delete")}
                    </button>
                  )}
                  {canReport && (
                    <button
                      type="button"
                      onClick={() => {
                        onReportComment(goal, comment);
                        onCommentMenuChange("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
                    >
                      <Flag size={14} />
                      {t("socialFixes.reportComment")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {isEditing ? (
          <form
            onSubmit={(event) => onSubmitEditComment(event, comment)}
            className="mt-2 grid gap-2"
          >
            <input
              value={editingDraft}
              onChange={(event) => onEditingDraftChange(event.target.value)}
              className="min-h-10 rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-sm font-semibold text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)] dark:text-white"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-lg bg-[var(--engine-accent)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white"
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-lg border border-[var(--engine-border)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="font-medium text-[var(--engine-text-muted)]">
              {respondeuA ? (
                <span className="mr-1 font-semibold text-[var(--engine-accent-text)]">
                  {respondeuA}
                </span>
              ) : null}
              <RichText text={commentText} linkClassName={RICH_LINK} />
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {commentTime ? (
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                  <TimeAgo value={commentTime} editedAt={wasEdited ? comment.editedAt : ""} short />
                </p>
              ) : wasEdited ? (
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                  {t("community.edited")}
                </p>
              ) : null}
              {canReply && (
                <button
                  type="button"
                  onClick={() => onReply(comment)}
                  className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)] transition hover:text-[var(--engine-accent)]"
                >
                  {t("community.reply")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Folha de comentários: sobe de baixo no celular e encosta na direita no
 * desktop (classes `engine-drawer`, as mesmas do painel de avisos). É o que o
 * Instagram faz no app — o post fica atrás, à vista, e fechar devolve a
 * pessoa exatamente onde ela estava.
 *
 * Vai para o `document.body` por portal: o cartão do feed mora dentro de
 * ancestrais com `transform`/`backdrop-filter`, e um `position: fixed` ali
 * dentro fica preso ao ancestral em vez da tela. O voltar do aparelho fecha a
 * folha primeiro (useHistoryDismiss), em vez de sair da página.
 */
export function CommentsSheet({ goal, onClose, t, ...panelProps }) {
  useHistoryDismiss(true, onClose);
  const count = panelProps.comments?.length || 0;

  // O portal muda o DOM, não a árvore do React: o clique dentro da folha
  // ainda sobe até o <article> do cartão, que abre o post ao ser clicado. O
  // invólucro corta a subida (o fundo escuro fecha antes disso).
  return createPortal(
    <div onClick={(event) => event.stopPropagation()}>
      <div className="engine-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("community.commentsAction")}
        className="engine-drawer engine-safe-bottom"
      >
        {/* Alça: diz "isto é uma folha" no celular. */}
        <span
          aria-hidden="true"
          className="mx-auto mt-2 block h-1 w-10 shrink-0 rounded-full bg-[var(--engine-border-strong)] sm:hidden"
        />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-2.5 sm:py-3.5">
          <h2 className="min-w-0 truncate text-[15px] font-extrabold text-[var(--engine-text)]">
            {t("community.commentsAction")}
            {count > 0 && (
              <span className="ml-1.5 font-semibold tabular-nums text-[var(--engine-text-subtle)]">
                {count}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
            title={t("socialFeed.closeComments")}
            aria-label={t("socialFeed.closeComments")}
          >
            <X size={20} />
          </button>
        </div>

        {/* No celular a folha cresce com a lista até 78% da tela; sem uma
            altura mínima, "sem comentários" virava uma tira de 200px. */}
        <div className="flex min-h-[45dvh] flex-1 flex-col overflow-hidden sm:min-h-0">
          <CommentsPanel goal={goal} t={t} {...panelProps} />
        </div>
      </section>
    </div>,
    document.body,
  );
}
