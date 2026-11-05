import { useRef, useState } from "react";

/**
 * O compositor de comentário: rascunho, a quem estou respondendo e o
 * comentário que estou editando.
 *
 * Duas telas escrevem comentário — o cartão do feed (folha por cima) e o
 * modal de publicação do desktop (coluna ao lado) — e até 04/11/2026 cada uma
 * tinha sua cópia destes cinco estados. Com a resposta entrando em cena seriam
 * duas cópias de uma regra nova para divergir no primeiro conserto.
 *
 * `onComment(goalId, texto, replyTo)` é quem de fato escreve; o terceiro
 * argumento é o id do comentário respondido (o banco confere se ele existe).
 */
export function useCommentComposer({ goalId, onComment, onEditComment }) {
  const [draft, setDraft] = useState("");
  // As pessoas marcadas com @ no rascunho. Para gente, o rótulo JÁ é o
  // @usuario, então o texto vai cru para o banco — a lista serve só para o
  // campo saber quantas menções cabem ainda.
  const [mentions, setMentions] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState("");
  const [editingDraft, setEditingDraft] = useState("");
  const [commentMenuId, setCommentMenuId] = useState("");
  const composerRef = useRef(null);

  const submitComment = (event) => {
    event.preventDefault();
    const cleanDraft = draft.trim().slice(0, 180);
    if (!cleanDraft || !goalId) return;
    onComment?.(goalId, cleanDraft, replyTo?.id || "");
    setDraft("");
    setMentions([]);
    setReplyTo(null);
  };

  // Responder leva o foco para o campo: no celular o teclado sobe junto e a
  // pessoa não precisa procurar onde escrever.
  const startReply = (comment) => {
    setReplyTo(comment);
    setEditingCommentId("");
    setEditingDraft("");
    composerRef.current?.focus({ preventScroll: false });
  };

  const startEditComment = (comment) => {
    setReplyTo(null);
    setEditingCommentId(comment.id);
    setEditingDraft(comment.text || "");
  };

  const submitEditComment = (event, comment) => {
    event.preventDefault();
    const cleanDraft = editingDraft.trim().slice(0, 180);
    if (!cleanDraft) return;
    onEditComment?.(goalId, comment.id, cleanDraft);
    setEditingCommentId("");
    setEditingDraft("");
  };

  const cancelEdit = () => {
    setEditingCommentId("");
    setEditingDraft("");
  };

  return {
    composerRef,
    // Tudo o que `CommentsPanel`/`CommentsSheet` esperam, com os nomes deles.
    panelProps: {
      draft,
      mentions,
      replyTo,
      editingCommentId,
      editingDraft,
      commentMenuId,
      onDraftChange: (text, list) => {
        setDraft(text);
        setMentions(list || []);
      },
      onSubmitComment: submitComment,
      onReply: startReply,
      onCancelReply: () => setReplyTo(null),
      onStartEditComment: startEditComment,
      onEditingDraftChange: setEditingDraft,
      onSubmitEditComment: submitEditComment,
      onCancelEdit: cancelEdit,
      onCommentMenuChange: setCommentMenuId,
    },
  };
}
