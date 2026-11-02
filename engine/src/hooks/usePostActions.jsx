import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { engineDB } from "../services/db";
import { trackEvent } from "../services/observability";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { useRequireAccount } from "./useRequireAccount";
import { useSocialReport } from "./useSocialReport";
import { CaptionEditor } from "../components/social/CaptionEditor";

/**
 * Os botões do `GoalCard` fora da Comunidade: a página do post (/post/:id) e
 * o feed de publicações do perfil (/community/@nome?p=<id>).
 *
 * Nasceu dentro da PostPage (auditoria social de 25/10/2026: seguir, editar e
 * apagar comentário, denunciar e bloquear eram funções vazias ali). Com o
 * feed do perfil passou a haver duas telas fora da Comunidade com o mesmo
 * cartão — duas cópias destes handlers divergiriam no primeiro conserto.
 *
 * - `returnPath(goalId)`: para onde o login devolve o visitante.
 * - `onChanged(goalId)`: depois de cada escrita que deu certo. A PostPage não
 *   precisa (o snapshot do post já relê); o perfil relê a lista.
 * - `onRemoved(goal, reason)`: publicação apagada ("unshare") ou autor
 *   bloqueado ("block") — cada tela decide para onde vai.
 *
 * Seguir fica de fora: cada tela já sabe de quem é o botão.
 */
export function usePostActions({ user, returnPath, onChanged, onRemoved }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const requireAccount = useRequireAccount(user);
  const { openReport, reportDialog } = useSocialReport();
  // Só o que a pessoa acabou de fazer fica aqui; o resto vem do documento.
  const [pendingLikes, setPendingLikes] = useState({});
  const [pendingRatings, setPendingRatings] = useState({});
  const [blockedIds, setBlockedIds] = useState([]);
  // Legenda em edição (o "Editar legenda" do menu do post).
  const [captionGoal, setCaptionGoal] = useState(null);
  const uid = user?.uid || "";

  useEffect(() => {
    if (!uid) return undefined;
    let alive = true;
    engineDB.getBlockedUsers(uid).then((ids) => {
      if (alive) setBlockedIds(ids || []);
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  const here = (goalId) => (returnPath ? returnPath(goalId) : `/post/${goalId}`);
  const changed = (goalId) => onChanged?.(goalId);

  const fail = (error) => {
    console.error(error);
    const blocked = /blocked/.test(String(error?.message || error?.code || ""));
    toast(t(blocked ? "socialFixes.blockedAction" : "socialFixes.writeError"), "error");
  };

  const interactionsFor = (goal) => ({
    liked: pendingLikes[goal?.id] ?? Boolean(goal?.likesBy?.[uid]),
    rating: pendingRatings[goal?.id] || goal?.ratingsBy?.[uid] || 0,
    comments: [],
  });

  // Comentário de quem eu bloqueei some aqui também, como no feed.
  const withoutBlocked = (goal) => {
    if (!goal || !blockedIds.length) return goal;
    const blocked = new Set(blockedIds);
    return { ...goal, comments: (goal.comments || []).filter((c) => !blocked.has(c?.userId)) };
  };

  const onLike = async (goalId, goal) => {
    if (requireAccount(here(goalId))) return;
    const current = pendingLikes[goalId] ?? Boolean(goal?.likesBy?.[uid]);
    const next = !current;
    setPendingLikes((map) => ({ ...map, [goalId]: next }));
    try {
      await engineDB.toggleCommunityLike(goalId, next, uid);
      changed(goalId);
    } catch (error) {
      setPendingLikes((map) => {
        const copy = { ...map };
        delete copy[goalId];
        return copy;
      });
      fail(error);
    }
  };

  const onComment = async (goalId, text) => {
    if (requireAccount(here(goalId))) return;
    try {
      await engineDB.addCommunityComment(goalId, text, uid);
      toast(t("community.commentSaved"));
      changed(goalId);
    } catch (error) {
      fail(error);
    }
  };

  const onRate = async (goalId, value) => {
    if (requireAccount(here(goalId))) return;
    setPendingRatings((map) => ({ ...map, [goalId]: value }));
    try {
      await engineDB.rateCommunityGoal(goalId, value, uid);
      toast(t("community.ratingSaved"));
      changed(goalId);
    } catch (error) {
      setPendingRatings((map) => ({ ...map, [goalId]: 0 }));
      fail(error);
    }
  };

  const onEditComment = async (goalId, commentId, text) => {
    try {
      await engineDB.updateCommunityComment(goalId, commentId, text, uid);
      toast(t("socialFixes.commentUpdated"));
      changed(goalId);
    } catch (error) {
      fail(error);
    }
  };

  const onDeleteComment = async (goalId, commentId) => {
    const ok = await confirm({
      title: t("community.deleteCommentTitle"),
      message: t("community.deleteCommentConfirm"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await engineDB.deleteCommunityComment(goalId, commentId, uid);
      toast(t("community.commentDeleted"));
      changed(goalId);
    } catch (error) {
      fail(error);
    }
  };

  const onUnshare = async (goal) => {
    const ok = await confirm({
      title: t("community.unshare"),
      message: t("socialFixes.unshareConfirm"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await engineDB.deleteCommunityGoal(goal, uid);
      toast(t("community.unsharedNotice"));
      onRemoved?.(goal, "unshare");
    } catch (error) {
      console.error(error);
      toast(t("community.unshareError"), "error");
    }
  };

  const onReport = (goal) => {
    if (requireAccount(here(goal.id))) return;
    openReport({ targetType: "goal", targetId: goal.id, reportedUserId: goal.ownerId });
  };

  const onReportComment = (goal, comment) => {
    if (requireAccount(here(goal.id))) return;
    openReport({
      targetType: "comment",
      targetId: `${goal.id}#${comment.id}`,
      reportedUserId: comment.userId || "",
    });
  };

  const onBlock = async (goal) => {
    if (requireAccount(here(goal.id)) || !goal.ownerId) return;
    const ok = await confirm({
      title: t("community.blockTitle"),
      message: t("community.blockMessage", { user: goal.username || goal.author }),
      confirmLabel: t("community.block"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    try {
      await engineDB.setUserBlocked(goal.ownerId, true, uid);
      toast(t("community.blockedNotice"));
      onRemoved?.(goal, "block");
    } catch (error) {
      console.error(error);
      toast(t("community.blockError"), "error");
    }
  };

  // Editar a legenda: até 02/11/2026 só o feed tinha o modal — na página do
  // post (onde o toque no celular leva) e no feed do perfil o item nem
  // aparecia no menu.
  const onEditCaption = (goal) => setCaptionGoal(goal);
  const saveCaption = async (goal, caption) => {
    try {
      await engineDB.updateCommunityGoalNote(goal.id, caption, uid);
      setCaptionGoal(null);
      toast(t("community.captionSaved"));
      changed(goal.id);
    } catch (error) {
      console.error(error);
      toast(
        error?.code === "too-many-hashtags"
          ? t("socialPosts.errors.tooManyHashtags", { max: 30 })
          : t("community.captionError"),
        "error",
      );
    }
  };
  const captionDialog = captionGoal ? (
    <CaptionEditor goal={captionGoal} onClose={() => setCaptionGoal(null)} onSave={saveCaption} />
  ) : null;

  // O link é sempre o da página do post — no perfil, a barra de endereço
  // aponta para o perfil, não para a publicação.
  const onShare = async (goal) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/post/${goal.id}`);
      trackEvent("post_link_copiado", { postId: goal.id });
      toast(t("community.linkCopied"));
    } catch {
      // Navegador sem permissão de área de transferência: não vale um erro.
    }
  };

  return {
    blockedIds,
    interactionsFor,
    withoutBlocked,
    reportDialog,
    captionDialog,
    requireAccount,
    // `onLike` do cartão recebe só o id; quem usa passa o post junto.
    handlers: {
      onLike,
      onComment,
      onRate,
      onEditComment,
      onDeleteComment,
      onUnshare,
      onReport,
      onReportComment,
      onBlock,
      onShare,
      onEditCaption,
    },
  };
}
