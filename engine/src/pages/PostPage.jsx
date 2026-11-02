import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { engineDB } from "../services/db";
import { GoalCard } from "./Community";
import { useToast } from "../components/ToastProvider";
import { useRequireAccount } from "../hooks/useRequireAccount";
import { usePostActions } from "../hooks/usePostActions";
import { openShareSheet, shareUrls } from "../services/shareLinks";

/**
 * Página de uma publicação, aberta por link direto: /post/:postId.
 *
 * Existe para o link compartilhado levar direto ao conteúdo, em vez de cair no
 * feed com um modal por cima. Abre sem login, porque quem recebe o link
 * normalmente ainda não tem conta — é o mesmo motivo pelo qual a leitura da
 * comunidade é pública.
 *
 * No celular é para cá que tocar num post leva. Até 30/10/2026 a página abria
 * já com a folha de comentários por cima (`initialCommentsOpen`): tocar no
 * post mostrava os comentários, e para ver o post era preciso voltar. Agora é
 * como no Instagram — o post primeiro, os comentários só pelo balão ou pelo
 * "ver todos os comentários". `?comments=1` (aviso de comentário) ainda abre a
 * folha direto, porque ali o comentário é o motivo da visita.
 */
export function PostPage({ user }) {
  const { postId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const requireAccount = useRequireAccount(user);
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState([]);
  const openComments = searchParams.get("comments") === "1";

  const { blockedIds, interactionsFor, withoutBlocked, handlers, reportDialog, captionDialog } = usePostActions({
    user,
    returnPath: (id) => `/post/${id}`,
    onRemoved: () => navigate("/community", { replace: true }),
  });

  useEffect(() => {
    if (!postId) return undefined;

    const unsubscribe = engineDB.subscribeCommunityGoal(postId, (item) => {
      setGoal(item);
      setLoading(false);
    });

    return () => unsubscribe?.();
  }, [postId]);

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

  const visibleGoal = withoutBlocked(goal);

  const handleFollow = async () => {
    if (requireAccount(`/post/${postId}`) || !ownerId || ownerId === user.uid) return;
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
      console.error(error);
      toast(t("socialFixes.writeError"), "error");
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
          interactions={interactionsFor(visibleGoal)}
          following={following}
          shared
          currentUserId={user?.uid}
          {...handlers}
          onLike={(id) => handlers.onLike(id, visibleGoal)}
          onFollow={handleFollow}
          // O aviãozinho abre a folha de compartilhar (DM + fora do Engine).
          onSendToChat={(item) =>
            openShareSheet({ url: shareUrls.post(item.id), title: item.title || String(item.note || "").slice(0, 80) || item.author || "Engine", goal: item, kind: "post" })
          }
          onOpenProfile={(profileUserId, person) => {
            const source = person || visibleGoal;
            const username = String(source?.username || "").replace(/^@/, "");
            if (username) navigate(`/community/@${username}`);
          }}
          initialCommentsOpen={openComments}
        />
      </div>
      {reportDialog}
      {captionDialog}
    </div>
  );
}
