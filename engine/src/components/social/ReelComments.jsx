import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { engineDB } from "../../services/db";
import { profilePath } from "../../services/people";
import { usePostActions } from "../../hooks/usePostActions";
import { useCommentComposer } from "../../hooks/useCommentComposer";
import { CommentsSheet } from "./Comments";

/**
 * Os comentários de um vídeo, por cima do vídeo.
 *
 * Até 04/11/2026 o balão da aba Vídeos levava para /post/:id — a pessoa saía
 * do feed vertical, lia dois comentários e tinha que voltar e reencontrar
 * onde estava. É o que Reels e TikTok nunca fazem: lá a conversa sobe por
 * cima e o vídeo continua rodando atrás.
 *
 * A lista vem do próprio post em tempo real (`subscribeCommunityGoal`), então
 * o comentário recém-escrito aparece sem recarregar nada, e o contador do
 * vídeo acompanha pelo `onCount`.
 */
export function ReelComments({ goalId, user, onClose, onCount }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [goal, setGoal] = useState(null);

  const { withoutBlocked, handlers, reportDialog } = usePostActions({
    user,
    returnPath: (id) => `/post/${id}`,
  });

  const { composerRef, panelProps } = useCommentComposer({
    goalId,
    onComment: handlers.onComment,
    onEditComment: handlers.onEditComment,
  });

  useEffect(() => {
    if (!goalId) return undefined;
    const unsubscribe = engineDB.subscribeCommunityGoal(goalId, setGoal);
    return () => unsubscribe?.();
  }, [goalId]);

  const visible = withoutBlocked(goal);
  const comments = visible?.comments || [];

  // O número ao lado do balão é do vídeo, não da folha: ele tem que andar
  // junto quando alguém comenta com a folha aberta.
  useEffect(() => {
    if (visible) onCount?.(comments.length);
  }, [visible, comments.length, onCount]);

  const openProfile = (userId, person) => {
    const path = profilePath(person?.username);
    if (path) navigate(path);
  };

  return (
    <>
      <CommentsSheet
        goal={visible || { id: goalId }}
        comments={comments}
        currentUserId={user?.uid || ""}
        t={t}
        onClose={onClose}
        onOpenProfile={openProfile}
        onDeleteComment={handlers.onDeleteComment}
        onReportComment={handlers.onReportComment}
        composerRef={composerRef}
        {...panelProps}
      />
      {reportDialog}
    </>
  );
}
