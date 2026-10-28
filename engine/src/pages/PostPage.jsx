import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { engineDB } from "../services/db";
import { GoalCard } from "./Community";
import { trackEvent } from "../services/observability";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { useRequireAccount } from "../hooks/useRequireAccount";
import { useSocialReport } from "../hooks/useSocialReport";

const emptyInteraction = { liked: false, rating: 0, comments: [] };

/**
 * Página de uma publicação, aberta por link direto: /post/:postId.
 *
 * Existe para o link compartilhado levar direto ao conteúdo, em vez de cair no
 * feed com um modal por cima. Abre sem login, porque quem recebe o link
 * normalmente ainda não tem conta — é o mesmo motivo pelo qual a leitura da
 * comunidade é pública.
 *
 * No celular é para cá que tocar num post leva, então todo botão do card
 * precisa funcionar aqui (auditoria social de 25/10/2026: seguir, editar e
 * apagar comentário, denunciar e bloquear eram funções vazias).
 */
export function PostPage({ user }) {
  const { postId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const requireAccount = useRequireAccount(user);
  const { openReport, reportDialog } = useSocialReport();
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  // Só o que a pessoa acabou de fazer fica em estado; o resto é derivado do
  // documento, que chega por snapshot.
  const [pendingLike, setPendingLike] = useState(null);
  const [pendingRating, setPendingRating] = useState(0);
  const [blockedIds, setBlockedIds] = useState([]);
  const [following, setFollowing] = useState([]);

  useEffect(() => {
    if (!postId) return undefined;

    const unsubscribe = engineDB.subscribeCommunityGoal(postId, (item) => {
      setGoal(item);
      setLoading(false);
    });

    return () => unsubscribe?.();
  }, [postId]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let alive = true;
    engineDB.getBlockedUsers(user.uid).then((ids) => {
      if (alive) setBlockedIds(ids);
    });
    return () => {
      alive = false;
    };
  }, [user?.uid]);

  const ownerId = goal?.ownerId || "";
  useEffect(() => {
    if (!user?.uid || !ownerId || ownerId === user.uid) return undefined;
    let alive = true;
    engineDB.getUserFollowing(user.uid).then((ids) => {
      if (alive) setFollowing(ids);
    });
    return () => {
      alive = false;
    };
  }, [user?.uid, ownerId]);

  // Comentário de quem eu bloqueei some aqui também, como no feed.
  const visibleGoal = useMemo(() => {
    if (!goal) return null;
    const blocked = new Set(blockedIds);
    return { ...goal, comments: (goal.comments || []).filter((c) => !blocked.has(c?.userId)) };
  }, [goal, blockedIds]);

  const interactions = goal
    ? {
        liked: pendingLike ?? Boolean(goal.likesBy?.[user?.uid]),
        rating: pendingRating || goal.ratingsBy?.[user?.uid] || 0,
        comments: [],
      }
    : emptyInteraction;

  const here = `/post/${postId}`;

  const fail = (error) => {
    console.error(error);
    const blocked = /blocked/.test(String(error?.message || error?.code || ""));
    toast(t(blocked ? "socialFixes.blockedAction" : "socialFixes.writeError"), "error");
  };

  const handleLike = async () => {
    if (requireAccount(here)) return;
    const next = !interactions.liked;
    setPendingLike(next);
    try {
      await engineDB.toggleCommunityLike(postId, next, user.uid);
    } catch (error) {
      setPendingLike(null);
      fail(error);
    }
  };

  const handleComment = async (_goalId, text) => {
    if (requireAccount(here)) return;
    try {
      await engineDB.addCommunityComment(postId, text, user.uid);
      toast(t("community.commentSaved"));
    } catch (error) {
      fail(error);
    }
  };

  const handleRate = async (_goalId, value) => {
    if (requireAccount(here)) return;
    setPendingRating(value);
    try {
      await engineDB.rateCommunityGoal(postId, value, user.uid);
      toast(t("community.ratingSaved"));
    } catch (error) {
      setPendingRating(0);
      fail(error);
    }
  };

  const handleEditComment = async (_goalId, commentId, text) => {
    try {
      await engineDB.updateCommunityComment(postId, commentId, text, user?.uid);
      toast(t("socialFixes.commentUpdated"));
    } catch (error) {
      fail(error);
    }
  };

  const handleDeleteComment = async (_goalId, commentId) => {
    const ok = await confirm({
      title: t("community.deleteCommentTitle"),
      message: t("community.deleteCommentConfirm"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await engineDB.deleteCommunityComment(postId, commentId, user?.uid);
      toast(t("community.commentDeleted"));
    } catch (error) {
      fail(error);
    }
  };

  const handleFollow = async () => {
    if (requireAccount(here) || !ownerId || ownerId === user.uid) return;
    const isFollowing = following.includes(ownerId);
    setFollowing((current) =>
      isFollowing ? current.filter((id) => id !== ownerId) : [...current, ownerId],
    );
    try {
      await engineDB.setFollow(ownerId, !isFollowing);
    } catch (error) {
      setFollowing((current) =>
        isFollowing ? [...current, ownerId] : current.filter((id) => id !== ownerId),
      );
      fail(error);
    }
  };

  const handleUnshare = async (item) => {
    const ok = await confirm({
      title: t("community.unshare"),
      message: t("socialFixes.unshareConfirm"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await engineDB.deleteCommunityGoal(item, user?.uid);
      toast(t("community.unsharedNotice"));
      navigate("/community", { replace: true });
    } catch (error) {
      console.error(error);
      toast(t("community.unshareError"), "error");
    }
  };

  const handleReport = (item) => {
    if (requireAccount(here)) return;
    openReport({ targetType: "goal", targetId: item.id, reportedUserId: item.ownerId });
  };

  const handleReportComment = (item, comment) => {
    if (requireAccount(here)) return;
    openReport({
      targetType: "comment",
      targetId: `${item.id}#${comment.id}`,
      reportedUserId: comment.userId || "",
    });
  };

  const handleBlock = async (item) => {
    if (requireAccount(here) || !item.ownerId) return;
    const ok = await confirm({
      title: t("community.blockTitle"),
      message: t("community.blockMessage", { user: item.username || item.author }),
      confirmLabel: t("community.block"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    try {
      await engineDB.setUserBlocked(item.ownerId, true, user.uid);
      toast(t("community.blockedNotice"));
      navigate("/community", { replace: true });
    } catch (error) {
      console.error(error);
      toast(t("community.blockError"), "error");
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      trackEvent("post_link_copiado", { postId });
      toast(t("community.linkCopied"));
    } catch {
      // Navegador sem permissão de área de transferência: a URL já está na
      // barra de endereço, então não vale interromper com um erro.
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--engine-bg)]">
        <p className="text-sm text-[var(--engine-text-muted)]">{t("common.loading")}</p>
      </div>
    );
  }

  // Post de quem eu bloqueei: não mostra (o feed também esconde).
  if (!visibleGoal || blockedIds.includes(ownerId)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--engine-bg)] px-6 text-center">
        <p className="text-sm font-bold text-[var(--engine-text)]">
          {t("community.postMissing")}
        </p>
        <button
          type="button"
          onClick={() => navigate("/community")}
          className="text-sm font-bold text-[var(--engine-accent)] hover:underline"
        >
          {t("community.backToFeed")}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--engine-bg)]">
      <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-[var(--engine-border)] bg-[var(--engine-bg)]/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/community"))}
          aria-label={t("community.backToFeed")}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-black text-[var(--engine-text)]">
          {t("community.postTitle")}
        </h1>
      </header>

      <div className="mx-auto w-full max-w-2xl sm:py-5">
        <GoalCard
          goal={visibleGoal}
          t={t}
          interactions={interactions}
          following={following}
          shared
          currentUserId={user?.uid}
          onLike={handleLike}
          onComment={handleComment}
          onRate={handleRate}
          onShare={handleShare}
          onUnshare={handleUnshare}
          onFollow={handleFollow}
          onOpenProfile={(profileUserId, person) => {
            const source = person || visibleGoal;
            const username = String(source?.username || "").replace(/^@/, "");
            if (username) navigate(`/community/@${username}`);
          }}
          onEditComment={handleEditComment}
          onDeleteComment={handleDeleteComment}
          onReport={handleReport}
          onReportComment={handleReportComment}
          onBlock={handleBlock}
          initialCommentsOpen
        />
      </div>
      {reportDialog}
    </div>
  );
}
