import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Hash, Loader2, Share2 } from "lucide-react";
import { GoalCard } from "./Community";
import { engineDB } from "../services/db";
import { fetchHashtagCount, fetchHashtagPage } from "../services/socialPosts";
import { normalizeTag } from "../services/socialText";
import { openShareSheet, shareUrls } from "../services/shareLinks";
import { usePostActions } from "../hooks/usePostActions";
import { TrendingTags } from "../components/social/TrendingTags";
import { ShareToChatModal } from "../components/ShareToChatModal";
import "../services/i18n-social-posts";

/**
 * Página de uma #hashtag: /community/tag/<tag>.
 *
 * Aberta a visitante, como o feed. Os posts vêm de `post_hashtags`, que o
 * banco mantém a partir da legenda (migration 20261102150000) — a busca não
 * varre o feed. Mesmo cartão e mesmas ações do feed (usePostActions).
 */
export function HashtagPage({ user, settings }) {
  const { tag: rawTag = "" } = useParams();
  const tag = normalizeTag(decodeURIComponent(rawTag));
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [goals, setGoals] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("loading");
  const [count, setCount] = useState(0);
  const [following, setFollowing] = useState([]);
  const [postToShare, setPostToShare] = useState(null);

  const load = useCallback(
    async (from = null) => {
      if (!tag) return;
      try {
        const page = await fetchHashtagPage(tag, from);
        setGoals((current) => {
          const base = from ? current : [];
          const seen = new Set(base.map((goal) => goal.id));
          return [...base, ...page.goals.filter((goal) => !seen.has(goal.id))];
        });
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        setStatus("ready");
      } catch (error) {
        console.error(error);
        setStatus("error");
      }
    },
    [tag],
  );

  useEffect(() => {
    if (!tag) return undefined;
    let alive = true;
    fetchHashtagPage(tag)
      .then((page) => {
        if (!alive) return;
        setGoals(page.goals);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        setStatus("ready");
      })
      .catch((error) => {
        console.error(error);
        if (alive) setStatus("error");
      });
    fetchHashtagCount(tag).then((value) => alive && setCount(value));
    return () => {
      alive = false;
    };
  }, [tag]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let alive = true;
    engineDB.getUserFollowing(user.uid).then((ids) => alive && setFollowing(ids || []));
    return () => {
      alive = false;
    };
  }, [user?.uid]);

  const { blockedIds, interactionsFor, withoutBlocked, handlers, reportDialog, captionDialog, requireAccount } =
    usePostActions({
      user,
      returnPath: (goalId) => `/post/${goalId}`,
      onChanged: () => load(null),
      onRemoved: (goal) => setGoals((list) => list.filter((item) => item.id !== goal.id && item.ownerId !== goal.ownerId)),
    });

  const handleFollow = async (goal) => {
    const ownerId = goal?.ownerId;
    if (requireAccount(`/community/tag/${tag}`) || !ownerId || ownerId === user?.uid) return;
    const isFollowing = following.includes(ownerId);
    setFollowing((list) => (isFollowing ? list.filter((id) => id !== ownerId) : [...list, ownerId]));
    try {
      await engineDB.setFollow(ownerId, !isFollowing);
    } catch (error) {
      console.error(error);
      setFollowing((list) => (isFollowing ? [...list, ownerId] : list.filter((id) => id !== ownerId)));
    }
  };

  const visible = goals.filter((goal) => !blockedIds.includes(goal.ownerId)).map(withoutBlocked);

  return (
    <div className="min-h-screen bg-[var(--engine-bg)]">
      <header className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 flex items-center gap-3 border-b border-[var(--engine-border)] bg-[var(--engine-bg)] px-2 py-2 sm:px-4 lg:top-0">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/community"))}
          aria-label={t("socialPosts.tags.back")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
          <Hash size={20} />
        </span>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-base font-black text-[var(--engine-text)]">{tag ? `#${tag}` : "#"}</h1>
          {tag && (
            <p className="text-[12px] font-semibold text-[var(--engine-text-subtle)]">
              {t("socialPosts.tags.posts", { count })}
            </p>
          )}
        </div>
        {tag && (
          <button
            type="button"
            onClick={() => openShareSheet({ url: shareUrls.hashtag(tag), title: `#${tag} no Engine`, kind: "hashtag" })}
            aria-label={t("socialPosts.share.action")}
            title={t("socialPosts.share.action")}
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
          >
            <Share2 size={18} />
          </button>
        )}
      </header>

      <div className="mx-auto w-full max-w-2xl sm:py-5">
        {!tag ? (
          <p className="px-4 py-16 text-center text-sm font-semibold text-[var(--engine-text-muted)]">
            {t("socialPosts.tags.invalid")}
          </p>
        ) : status === "loading" ? (
          <p className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-[var(--engine-text-muted)]">
            <Loader2 size={16} className="animate-spin" />
            {t("common.loading")}
          </p>
        ) : !visible.length ? (
          <div className="space-y-6 px-4 py-12 text-center">
            <p className="text-sm font-semibold text-[var(--engine-text-muted)]">
              {status === "error" ? t("socialPosts.tags.loadError") : t("socialPosts.tags.empty")}
            </p>
            <TrendingTags className="justify-center" />
          </div>
        ) : (
          <div className="border-y border-[var(--engine-border)] sm:space-y-5 sm:border-0">
            {visible.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                t={t}
                interactions={interactionsFor(goal)}
                following={following}
                shared
                currentUserId={user?.uid}
                {...handlers}
                onLike={(goalId) => handlers.onLike(goalId, goal)}
                onFollow={handleFollow}
                onSendToChat={setPostToShare}
                onOpenPost={(goalId) => navigate(`/post/${goalId}`)}
                onOpenProfile={(_userId, person) => {
                  const username = String(person?.username || "").replace(/^@/, "");
                  if (username) navigate(`/community/@${username}`);
                }}
              />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={() => load(cursor)}
                className="mx-4 my-5 block w-[calc(100%-2rem)] rounded-full border border-[var(--engine-border)] py-3 text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:mx-0 sm:w-full"
              >
                {t("socialPosts.tags.loadMore")}
              </button>
            )}
          </div>
        )}
      </div>

      <ShareToChatModal
        open={Boolean(postToShare)}
        goal={postToShare}
        user={user}
        settings={settings}
        onClose={() => setPostToShare(null)}
      />
      {reportDialog}
      {captionDialog}
    </div>
  );
}
