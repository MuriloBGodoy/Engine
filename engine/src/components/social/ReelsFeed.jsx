import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bookmark, Clapperboard, Heart, Loader2, MessageCircle, Send } from "lucide-react";
import { engineDB } from "../../services/db";
import { fetchVideoPage } from "../../services/socialPosts";
import { openShareSheet, shareUrls } from "../../services/shareLinks";
import { trackEvent } from "../../services/observability";
import { useRequireAccount } from "../../hooks/useRequireAccount";
import { useSavedPosts } from "../../hooks/useSavedPosts";
import { useToast } from "../ToastProvider";
import { PostVideoPlayer } from "./PostVideoPlayer";
import { RichText } from "./RichText";
import { TimeAgo } from "./TimeAgo";
import "../../services/i18n-social-posts";

const compact = (value, language) =>
  Number(value) >= 1000
    ? new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : String(Number(value) || 0);

/**
 * Aba Vídeos da Comunidade: um vídeo por tela, rolando na vertical com
 * encaixe (scroll-snap), como Reels/Shorts. Toca só o que está na tela; o
 * som, quando ligado, vale para os próximos. Arrastar com o dedo, roda do
 * mouse e as setas do teclado funcionam porque é rolagem nativa.
 *
 * Comentar abre a página do post já na folha de comentários — a mesma
 * conversa do feed, sem uma segunda implementação dela aqui.
 */
export function ReelsFeed({ user, blockedIds = [] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const requireAccount = useRequireAccount(user);
  const { isSaved, toggleSaved } = useSavedPosts(user?.uid || "");
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [status, setStatus] = useState("loading");
  const [activeId, setActiveId] = useState("");
  const [liked, setLiked] = useState({});
  const loadingRef = useRef(false);
  const listRef = useRef(null);
  const language = i18n.language || "pt-BR";
  const uid = user?.uid || "";

  const loadMore = useCallback(async (from = null, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const page = await fetchVideoPage(from);
      setItems((current) => {
        const base = reset ? [] : current;
        const seen = new Set(base.map((item) => item.id));
        return [...base, ...page.goals.filter((goal) => !seen.has(goal.id))];
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setStatus("ready");
    } catch (error) {
      console.error(error);
      setStatus((current) => (current === "loading" ? "error" : current));
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadMore(null, true);
  }, [loadMore]);

  const visible = items.filter((goal) => !blockedIds.includes(goal.ownerId));

  // Qual vídeo está na tela: o que passou de 60% de visibilidade.
  useEffect(() => {
    const root = listRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActiveId(entry.target.getAttribute("data-reel"));
          }
        });
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll("[data-reel]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [visible.length]);

  // Perto do fim, a próxima página.
  useEffect(() => {
    if (!hasMore || !activeId) return;
    const index = visible.findIndex((goal) => goal.id === activeId);
    if (index >= visible.length - 3) loadMore(cursor);
  }, [activeId, visible, hasMore, cursor, loadMore]);

  const like = async (goal) => {
    if (requireAccount(`/post/${goal.id}`)) return;
    const current = liked[goal.id] ?? Boolean(goal.likesBy?.[uid]);
    setLiked((map) => ({ ...map, [goal.id]: !current }));
    try {
      await engineDB.toggleCommunityLike(goal.id, !current, uid);
    } catch (error) {
      console.error(error);
      setLiked((map) => ({ ...map, [goal.id]: current }));
      toast(t("socialFixes.writeError"), "error");
    }
  };

  // A folha de compartilhar: DM do Engine em cima, WhatsApp/X/copiar embaixo.
  const share = (goal) => {
    const title = String(goal.note || "").replace(/\s+/g, " ").trim().slice(0, 80) || goal.author || "Engine";
    openShareSheet({ url: shareUrls.post(goal.id), title, goal, kind: "post" });
    trackEvent("post_compartilhar_aberto", { origem: "reels" });
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-[var(--engine-text-muted)]">
        <Loader2 size={16} className="animate-spin" />
        {t("socialPosts.reels.loading")}
      </div>
    );
  }

  if (!visible.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--engine-border)] p-10 text-center">
        <Clapperboard className="mb-4 text-[var(--engine-accent)]" size={34} />
        <h2 className="text-base font-extrabold tracking-tight text-[var(--engine-text)]">
          {status === "error" ? t("socialPosts.reels.error") : t("socialPosts.reels.empty")}
        </h2>
        {status !== "error" && (
          <p className="mt-2 max-w-sm text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
            {t("socialPosts.reels.emptyCopy")}
          </p>
        )}
      </div>
    );
  }

  const action =
    "flex flex-col items-center gap-0.5 text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]";
  const actionIcon = "flex h-11 w-11 items-center justify-center rounded-full bg-black/35";

  return (
    <div
      ref={listRef}
      className="-mx-4 h-[calc(100dvh-15.5rem-env(safe-area-inset-bottom))] min-h-[380px] lg:h-[calc(100dvh-12rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black [scrollbar-width:none] sm:mx-0 sm:rounded-2xl [&::-webkit-scrollbar]:hidden"
    >
      {visible.map((goal) => {
        const isLiked = liked[goal.id] ?? Boolean(goal.likesBy?.[uid]);
        const likes = Math.max(0, (Number(goal.likes) || 0) + (isLiked === Boolean(goal.likesBy?.[uid]) ? 0 : isLiked ? 1 : -1));
        const username = String(goal.username || "").replace(/^@/, "");
        const saved = isSaved(goal.id);
        return (
          <section key={goal.id} data-reel={goal.id} className="relative h-full w-full snap-start snap-always">
            <PostVideoPlayer video={goal.video} mode="reel" active={activeId === goal.id} />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pb-4 pr-20 pt-16 text-white">
              <button
                type="button"
                onClick={() => username && navigate(`/community/@${username}`)}
                className="pointer-events-auto flex min-h-11 items-center gap-2 text-left"
                aria-label={t("socialPosts.reels.profile")}
              >
                {goal.avatar && /^(https?:|data:)/.test(goal.avatar) ? (
                  <img src={goal.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[11px] font-black">
                    {String(goal.author || "?").slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="text-sm font-bold">{goal.author}</span>
              </button>
              {goal.note ? (
                <RichText
                  as="p"
                  text={goal.note}
                  className="pointer-events-auto mt-1 line-clamp-3 whitespace-pre-line text-sm leading-5"
                  linkClassName="font-bold text-white underline-offset-2 hover:underline"
                />
              ) : null}
              <TimeAgo
                value={goal.createdAt}
                editedAt={goal.editedAt}
                className="pointer-events-auto mt-1 text-[11px] font-semibold text-white/75"
              />
            </div>

            <div className="absolute bottom-16 right-2 flex flex-col items-center gap-3">
              <button type="button" onClick={() => like(goal)} aria-pressed={isLiked} aria-label={t("socialPosts.reels.like")} className={action}>
                <span className={actionIcon}>
                  <Heart size={22} fill={isLiked ? "currentColor" : "none"} className={isLiked ? "text-[var(--engine-accent)]" : ""} />
                </span>
                {compact(likes, language)}
              </button>
              <button
                type="button"
                onClick={() => navigate(`/post/${goal.id}?comments=1`)}
                aria-label={t("socialPosts.reels.comments")}
                className={action}
              >
                <span className={actionIcon}>
                  <MessageCircle size={22} />
                </span>
                {compact(goal.comments?.length || 0, language)}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (requireAccount(`/post/${goal.id}`)) return;
                  toggleSaved(goal.id);
                }}
                aria-pressed={saved}
                aria-label={t("socialPosts.saved.tab")}
                className={action}
              >
                <span className={actionIcon}>
                  <Bookmark size={21} fill={saved ? "currentColor" : "none"} />
                </span>
              </button>
              <button type="button" onClick={() => share(goal)} aria-label={t("socialPosts.reels.share")} className={action}>
                <span className={actionIcon}>
                  <Send size={20} />
                </span>
              </button>
            </div>
          </section>
        );
      })}
      {hasMore && (
        <div className="flex h-24 items-center justify-center text-white/70">
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}
    </div>
  );
}
