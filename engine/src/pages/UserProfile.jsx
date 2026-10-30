import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Heart,
  MessageCircle,
  Share2,
  Users,
  UserPlus,
  UserCheck,
  Mail,
  Flag,
  UserX,
  ArrowLeft,
  Copy,
  Play,
} from "lucide-react";
import { engineDB, POST_KIND_POST } from "../services/db";
import { GoalCard } from "./Community";
import { ShareToChatModal } from "../components/ShareToChatModal";
import { usePostActions } from "../hooks/usePostActions";
import "../services/i18n-social-feed";
import { auth } from "../services/supabase";
import { EditProfileModal } from "../components/EditProfileModal";
import { AchievementsTab } from "../components/achievements/AchievementsTab";
import { listAchievements } from "../services/achievements";
import { profileCardFromSettings, startConversation } from "../services/chat";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { useRequireAccount } from "../hooks/useRequireAccount";
import { useSocialReport } from "../hooks/useSocialReport";

// Banner will be solid color gradient - no default image
const DEFAULT_BANNER_GRADIENT = "from-[var(--engine-accent)] to-[var(--engine-accent)]/70";


// Um item das abas Seguidores/Seguindo. O perfil vem sempre de publicProfiles
// (dado vivo); `fallback` é o retrato gravado no doc de seguidor, usado só
// enquanto a lista de perfis não chegou ou se o perfil público sumiu.
function UserListItem({ userId, profiles, fallback = {} }) {
  const navigate = useNavigate();
  const userData = profiles?.[userId] || fallback;
  const rawUsername = (userData.username || "").replace(/^@/, "").trim();
  const username = rawUsername || "user";
  // Só vira botão quando dá pra chegar em algum lugar: a rota do perfil
  // resolve por username, não por uid.
  const canOpen = Boolean(rawUsername);

  return (
    <div
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={canOpen ? () => navigate(`/community/@${rawUsername}`) : undefined}
      onKeyDown={
        canOpen
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate(`/community/@${rawUsername}`);
              }
            }
          : undefined
      }
      className={`flex items-center gap-3 rounded-xl border border-[var(--engine-border)] p-3 transition hover:bg-[var(--engine-surface-2)] ${
        canOpen ? "cursor-pointer hover:border-[var(--engine-accent)]" : ""
      }`}
    >
      {userData.avatar ? (
        <img
          src={userData.avatar}
          alt={userData.author}
          className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="h-12 w-12 flex-shrink-0 rounded-full bg-[var(--engine-surface-2)] flex items-center justify-center text-xs font-bold">
          {userData.avatarInitials || "EN"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--engine-text)]">
          {userData.author || "Usuário Engine"}
        </p>
        <p className="text-xs text-[var(--engine-text-muted)]">@{username}</p>
      </div>
    </div>
  );
}

// Progresso da meta como o feed calcula: post dos outros traz só a
// porcentagem (sem dinheiro).
const goalProgress = (goal) =>
  goal.targetValue
    ? Math.min(100, (goal.savedValue / goal.targetValue) * 100)
    : Math.min(100, Number(goal.progress) || 0);

/**
 * Um quadrado da grade de publicações, como no Instagram: a primeira foto
 * recortada, um ícone no canto quando há mais fotos ou vídeo, e curtidas e
 * comentários ao passar o mouse. Post só de texto vira o próprio texto.
 * Meta (carro) ganha a barra fina de progresso no pé — é o que a diferencia
 * de um post solto, e é a única coisa que o Instagram não tem.
 */
function ProfilePostTile({ goal, t, onOpen }) {
  const image = goal.images?.[0] || goal.image || "";
  const many = (goal.images?.length || 0) > 1;
  const isGoal = goal.kind !== POST_KIND_POST;
  const likes = Number(goal.likes) || 0;
  const comments = goal.comments?.length || 0;
  const text = goal.note || goal.title || [goal.brand, goal.model].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      id={`profile-tile-${goal.id}`}
      onClick={() => onOpen(goal.id)}
      aria-label={`${text || t("community.openPost")} · ${t("socialFeed.tileStats", { likes, comments })}`}
      className="group relative aspect-square overflow-hidden bg-[var(--engine-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--engine-accent)]"
    >
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center p-2.5 sm:p-4">
          <span className="line-clamp-5 text-center text-[11px] font-semibold leading-snug text-[var(--engine-text)] sm:text-[13px]">
            {text}
          </span>
        </span>
      )}

      {(many || goal.videoUrl) && (
        <span
          className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
          title={goal.videoUrl ? t("socialFeed.video") : t("socialFeed.multiplePhotos")}
        >
          {goal.videoUrl ? <Play size={16} fill="currentColor" /> : <Copy size={16} />}
        </span>
      )}

      {isGoal && (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-black/35">
          <span
            className="block h-full bg-[var(--engine-accent)]"
            style={{ width: `${goalProgress(goal)}%` }}
          />
        </span>
      )}

      {/* Só no desktop (no toque não existe "passar o mouse"). */}
      <span className="pointer-events-none absolute inset-0 hidden items-center justify-center gap-4 bg-black/45 text-sm font-bold text-white opacity-0 transition group-hover:opacity-100 sm:flex">
        <span className="inline-flex items-center gap-1.5">
          <Heart size={17} fill="currentColor" />
          {likes}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle size={17} fill="currentColor" />
          {comments}
        </span>
      </span>
    </button>
  );
}

export function UserProfile({ settings = {}, user = null, onSettingsUpdate }) {
  const { identifier } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const currentUserId = user?.uid || auth.currentUser?.uid;
  const confirm = useConfirm();
  const toast = useToast();
  const requireAccount = useRequireAccount(user?.uid ? user : currentUserId ? { uid: currentUserId } : null);
  const { openReport, reportDialog } = useSocialReport();
  // Números de seguidores/seguindo vêm de uma função pública do banco: a
  // lista é só para quem tem conta, e o visitante via "0".
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });

  const [profile, setProfile] = useState(null);
  const [userGoals, setUserGoals] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState(() => new Set());
  const [likesReceived, setLikesReceived] = useState(0);
  const [following, setFollowing] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState("posts");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [publicProfiles, setPublicProfiles] = useState(null);
  const isOwnProfile = currentUserId === profile?.userId;
  // Com quatro abas a tira não cabe em 390px (medido em 21/08/2026, mesmo
  // limite que apareceu na Comunidade) e já rola na horizontal — mas a aba
  // ativa não se anunciava: setActiveTab("achievements") nascia fora da
  // vista e a tela parecia estar em Metas. Mesmo gesto de `Community.jsx`
  // (`activeSectionRef`).
  const activeTabRef = useRef(null);

  // Grade → feed: `?p=<id>` abre o feed vertical das publicações desta pessoa
  // já no post tocado, como o Instagram faz ao tocar num quadrado do perfil.
  // Mora na URL para o voltar do aparelho devolver à grade, e para o link
  // de um post do perfil abrir no mesmo lugar.
  const [searchParams, setSearchParams] = useSearchParams();
  const feedPostId = searchParams.get("p") || "";
  // Abrimos o feed com push? Então "voltar" é history.back(); se a pessoa
  // chegou por link já com `?p=`, voltar só tira o parâmetro.
  const feedPushed = useRef(false);
  const lastOpenedTile = useRef("");
  const scrolledToPost = useRef("");
  const [postToShare, setPostToShare] = useState(null);
  const viewer = user?.uid ? user : currentUserId ? { uid: currentUserId } : null;
  const profileUserId = profile?.userId || "";

  const reloadGoals = () => {
    if (!profileUserId) return;
    engineDB.getUserGoals(profileUserId).then((goals) => setUserGoals(goals || []));
  };

  const postActions = usePostActions({
    user: viewer,
    returnPath: (goalId) => `/community/${identifier}?p=${goalId}`,
    onChanged: reloadGoals,
    onRemoved: (goal, reason) => {
      if (reason === "block") {
        navigate("/community", { replace: true });
        return;
      }
      setUserGoals((list) => list.filter((item) => item.id !== goal.id));
    },
  });

  useEffect(() => {
    const cleanUsername = identifier?.replace(/^@/, "").toLowerCase().trim() || "";
    if (!cleanUsername) {
      navigate("/community");
      return undefined;
    }

    // `vivo` corta as respostas que chegam depois da saída da tela. A limpeza
    // do efeito precisa ser devolvida AQUI: antes ela estava dentro de uma
    // função async, então quem recebia o `return` era a Promise e não o React —
    // a inscrição nunca era cancelada e cada perfil visitado deixava mais uma
    // viva, escrevendo o dado da pessoa anterior por cima do atual a cada
    // atualização de qualquer perfil.
    let vivo = true;

    // UM perfil, pelo @nome, com resposta do servidor. Até 25/09/2026 isto
    // era uma escuta da coleção inteira, e a decisão "essa pessoa não existe"
    // saía da PRIMEIRA resposta dela — que vem do cache, com um documento só
    // (o próprio usuário). Todo link direto de perfil, para quem estava
    // logado, redirecionava para a Comunidade. Só funcionava depois de passar
    // pela Comunidade, que enchia o cache — por isso ninguém viu.
    (async () => {
      let userProfile = null;
      try {
        userProfile = await engineDB.getPublicProfileByUsername(cleanUsername);
      } catch (error) {
        console.error("Error loading user profile:", error);
        if (vivo) {
          setLoadFailed(true);
          setLoading(false);
        }
        return;
      }
      if (!vivo) return;

      // "Não existe" agora é resposta do servidor, e mostra a tela de perfil
      // não encontrado em vez de jogar a pessoa em outra página sem dizer nada.
      setLoadFailed(false);
      setProfile(userProfile);
      setLoading(false);
      if (!userProfile) return;

      // Trocar de pessoa apaga o que era da anterior. Sem isto, o visitante vê
      // os selos e a contagem de quem ele acabou de visitar — e num perfil sem
      // conquista nenhuma esse engano não passa, porque o dado que chega é
      // vazio e não sobrescreve nada na tela.
      //
      // Pular de perfil em perfil pelas listas também não pode deixar o
      // visitante parado na aba Seguidores do anterior.
      setActiveTab("posts");
      setUserGoals([]);
      setFollowers([]);
      setFollowing([]);
      setUnlockedAchievements(new Set());
      setLikesReceived(0);
      setIsFollowing(false);
      setFollowCounts({ followers: 0, following: 0 });
      engineDB.getFollowCounts(userProfile.userId).then((counts) => {
        if (vivo) setFollowCounts(counts);
      });

      // O perfil é a vitrine pública: mesmo no próprio perfil mostramos só
      // as metas publicadas na comunidade, nunca a garagem inteira — quem
      // quiser guardar um carro só pra si simplesmente não publica.
      Promise.all([
        engineDB.getUserGoals(userProfile.userId),
        engineDB.getUserFollowers(userProfile.userId),
        engineDB.getUserFollowing(userProfile.userId),
        listAchievements(userProfile.userId),
        // Conta os documentos de curtida, não soma `goal.likes`: o número
        // que fica no post é vitrine e pode ser empurrado de um em um pela
        // regra. O degrau se decide pela contagem da subcoleção.
        engineDB.countLikesReceived(userProfile.userId),
      ])
        .then(async ([goals, followersList, followingList, conquistas, curtidas]) => {
          if (!vivo) return;
          setUserGoals(goals || []);
          setFollowers(followersList || []);
          setFollowing(followingList || []);
          setUnlockedAchievements(conquistas || new Set());
          setLikesReceived(curtidas || 0);
          // Nome e foto só de quem aparece nas abas Seguidores/Seguindo.
          const ids = [
            ...(followersList || []).map((item) => item.userId || item.followerId),
            ...(followingList || []),
          ];
          const found = await engineDB.getPublicProfilesByIds(ids);
          if (!vivo) return;
          setPublicProfiles(found);
          // Quem seguia uma conta que depois foi excluída guarda o espelho
          // (a regra não deixa a conta excluída apagá-lo): some da lista e
          // da contagem em vez de virar "Usuário Engine" sem link.
          setFollowing((list) => list.filter((id) => !engineDB.isProfileGone(id)));
        })
        .catch((error) => {
          console.error("Error loading user profile:", error);
        });

      if (currentUserId && currentUserId !== userProfile.userId) {
        engineDB.getUserFollowing(currentUserId).then((currentFollowing) => {
          if (!vivo) return;
          setIsFollowing((currentFollowing || []).includes(userProfile.userId));
        });
      }
    })();

    return () => {
      vivo = false;
    };
  }, [identifier, currentUserId, navigate, reloadKey]);

  const handleFollow = async () => {
    if (!profile || requireAccount()) return;
    try {
      if (isFollowing) {
        await engineDB.unfollowUser(currentUserId, profile.userId);
      } else {
        await engineDB.followUser(currentUserId, profile.userId);
      }
      setIsFollowing(!isFollowing);
      setFollowCounts((current) => ({
        ...current,
        followers: Math.max(0, current.followers + (isFollowing ? -1 : 1)),
      }));
      // O contador é o tamanho da lista de seguidores, lida uma vez ao abrir
      // o perfil: sem mexer nela aqui, seguir mudava o botão e o número
      // continuava 0 (conferido no emulador com o vínculo já gravado).
      setFollowers((current) =>
        isFollowing
          ? current.filter((item) => (item.userId || item.followerId) !== currentUserId)
          : [...current, { userId: currentUserId, followerId: currentUserId }],
      );
    } catch (error) {
      console.error("Error updating follow status:", error);
      toast(t("socialFixes.writeError"), "error");
    }
  };

  const handleReportProfile = () => {
    if (!profile || requireAccount()) return;
    openReport({ targetType: "profile", targetId: profile.userId, reportedUserId: profile.userId });
  };

  const handleBlockProfile = async () => {
    if (!profile || requireAccount()) return;
    const ok = await confirm({
      title: t("community.blockTitle"),
      message: t("community.blockMessage", { user: profile.username || profile.author }),
      confirmLabel: t("community.block"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    try {
      await engineDB.setUserBlocked(profile.userId, true, currentUserId);
      toast(t("community.blockedNotice"));
      navigate("/community", { replace: true });
    } catch (error) {
      console.error(error);
      toast(t("community.blockError"), "error");
    }
  };

  const handleMessage = async () => {
    if (!profile || requireAccount()) return;
    try {
      // Abre (ou reabre) a conversa e vai direto para ela. Antes navegava
      // para `/messages?user=<id>`, mas Mensagens nunca leu esse parâmetro:
      // a pessoa caía na lista e tinha que achar o outro de novo.
      const id = await startConversation(profileCardFromSettings(settings, user), {
        userId: profile.userId,
        author: profile.author,
        username: profile.username,
        avatar: profile.avatar,
        avatarInitials: profile.avatarInitials,
      });
      navigate(`/messages/${id}`);
    } catch (error) {
      console.error("Error starting conversation:", error);
      toast(t("messages.startError"), "error");
    }
  };

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeTab]);

  // Feed aberto: rola até o post tocado uma vez (a lista pode chegar depois,
  // num link direto). De volta à grade: o quadrado de onde a pessoa saiu.
  useEffect(() => {
    if (!feedPostId) {
      scrolledToPost.current = "";
      const tile = lastOpenedTile.current;
      if (tile) {
        lastOpenedTile.current = "";
        document.getElementById(`profile-tile-${tile}`)?.scrollIntoView({ block: "center" });
      }
      return;
    }
    if (scrolledToPost.current === feedPostId) return;
    const target = document.getElementById(`profile-post-${feedPostId}`);
    if (!target) return;
    scrolledToPost.current = feedPostId;
    target.scrollIntoView({ block: "start" });
  }, [feedPostId, userGoals, loading]);

  const openFeedAt = (goalId) => {
    feedPushed.current = true;
    lastOpenedTile.current = goalId;
    const next = new URLSearchParams(searchParams);
    next.set("p", goalId);
    setSearchParams(next);
  };

  const closeFeed = () => {
    if (feedPushed.current) {
      feedPushed.current = false;
      navigate(-1);
      return;
    }
    lastOpenedTile.current = feedPostId;
    const next = new URLSearchParams(searchParams);
    next.delete("p");
    setSearchParams(next, { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--engine-text-muted)]">{t("common.loading")}</p>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="text-[var(--engine-text)]">{t("profile.loadFailed")}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setReloadKey((value) => value + 1);
          }}
          className="min-h-11 text-[var(--engine-accent)] hover:underline"
        >
          {t("profile.retry")}
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <p className="mb-4 text-[var(--engine-text)]">{t("socialFixes.profile.notFound")}</p>
        <button
          onClick={() => navigate("/community")}
          className="text-[var(--engine-accent)] hover:underline"
        >
          {t("community.backToFeed")}
        </button>
      </div>
    );
  }

  const avatar = profile.avatar || null;
  // `bannerURL` é onde o modal antigo (até 13/10/2026) gravava a capa, direto
  // no perfil público e fora dos ajustes. Quem pôs capa naquela época só a tem
  // lá; o próximo salvar a leva para `banner`.
  const banner = profile.banner || profile.bannerURL || null;
  const initials = profile.author
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "EN";

  // As publicações com o nome e a foto ATUAIS do perfil (o post guarda o
  // retrato do dia em que foi publicado) e sem comentário de quem eu bloqueei.
  const profileGoals = userGoals.map((goal) =>
    postActions.withoutBlocked({
      ...goal,
      author: profile.author || goal.author,
      username: profile.username || goal.username,
      avatar: profile.avatar || goal.avatar,
      avatarInitials: profile.avatarInitials || goal.avatarInitials,
      city: profile.city || goal.city,
    }),
  );
  const cleanProfileUsername = String(profile.username || "").replace(/^@/, "");

  if (feedPostId) {
    return (
      <div className="min-h-screen bg-[var(--engine-bg)]">
        {/* Gruda logo abaixo da barra do app (64px + recorte do iPhone; a do
            app é z-40 e cobriria esta se as duas usassem top-0). */}
        <header className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 flex items-center gap-3 border-b border-[var(--engine-border)] bg-[var(--engine-bg)] px-2 py-2 sm:px-4 lg:top-16">
          <button
            type="button"
            onClick={closeFeed}
            aria-label={t("socialFeed.backToProfile")}
            title={t("socialFeed.backToProfile")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[11px] font-bold uppercase tracking-wide text-[var(--engine-text-subtle)]">
              {cleanProfileUsername ? `@${cleanProfileUsername}` : profile.author}
            </p>
            <h1 className="truncate text-base font-black text-[var(--engine-text)]">
              {t("socialFeed.postsTitle")}
            </h1>
          </div>
        </header>

        {/* O mesmo cartão do feed da Comunidade, com todas as ações. Sem
            `onOpenPost`: já estamos dentro do feed, tocar no post não leva a
            lugar nenhum (o toque duplo ainda curte). */}
        <div className="mx-auto w-full max-w-2xl border-y border-[var(--engine-border)] sm:space-y-5 sm:border-0 sm:py-5">
          {profileGoals.map((goal) => (
            <div key={goal.id} id={`profile-post-${goal.id}`} className="scroll-mt-[calc(8rem+env(safe-area-inset-top))] lg:scroll-mt-32">
              <GoalCard
                goal={goal}
                t={t}
                interactions={postActions.interactionsFor(goal)}
                following={isFollowing ? [profile.userId] : []}
                shared
                currentUserId={currentUserId}
                {...postActions.handlers}
                onLike={(goalId) => postActions.handlers.onLike(goalId, goal)}
                onFollow={handleFollow}
                onSendToChat={currentUserId ? setPostToShare : undefined}
                onOpenProfile={(_userId, person) => {
                  const username = String(person?.username || "").replace(/^@/, "");
                  if (!username) return;
                  if (username.toLowerCase() === cleanProfileUsername.toLowerCase()) {
                    closeFeed();
                    return;
                  }
                  navigate(`/community/@${username}`);
                }}
              />
            </div>
          ))}
          {!profileGoals.length && (
            <p className="px-4 py-16 text-center text-sm font-semibold text-[var(--engine-text-muted)]">
              {t("community.postMissing")}
            </p>
          )}
        </div>

        <ShareToChatModal
          open={Boolean(postToShare)}
          goal={postToShare}
          user={user}
          settings={settings}
          onClose={() => setPostToShare(null)}
        />
        {postActions.reportDialog}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--engine-bg)]">
      <div className="mx-auto w-full max-w-2xl">
        {/* Capa: só aparece quem escolheu uma. */}
        {banner && (
          <img
            src={banner}
            alt=""
            className="h-32 w-full object-cover sm:mt-4 sm:h-44 sm:rounded-2xl"
          />
        )}

        {/* Profile Info - Instagram Style */}
        <div className="border-b border-[var(--engine-border)] px-4 py-6 sm:px-6">
          {/* Avatar + Name/Username Row */}
          <div className="mb-4 flex items-start gap-4 sm:gap-6">
            {/* Avatar */}
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border-2 border-[var(--engine-border)] bg-[var(--engine-surface-2)] sm:h-24 sm:w-24">
              {avatar ? (
                <img
                  src={avatar}
                  alt={profile.author}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-[var(--engine-text-muted)] sm:text-3xl">
                  {initials}
                </div>
              )}
            </div>

            {/* Stats - next to avatar on desktop, below on mobile */}
            <div className="flex-1">
              <div className="mb-3 grid grid-cols-3 gap-2 sm:gap-3">
                <div className="text-center">
                  <p className="text-lg font-black text-[var(--engine-accent)] sm:text-xl">
                    {userGoals.length}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-[var(--engine-text-muted)] sm:text-[11px]">
                    {t("socialFixes.profile.goals")}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-[var(--engine-accent)] sm:text-xl">
                    {followCounts.followers}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-[var(--engine-text-muted)] sm:text-[11px]">
                    {t("socialFixes.profile.followers")}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-[var(--engine-accent)] sm:text-xl">
                    {followCounts.following}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-[var(--engine-text-muted)] sm:text-[11px]">
                    {t("socialFixes.profile.following")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Name & Username */}
          <div className="mb-3">
            <h2 className="text-base font-black text-[var(--engine-text)] sm:text-lg">
              {profile.author || "Usuário Engine"}
            </h2>
            <p className="text-sm font-medium text-[var(--engine-text-muted)]">
              {(profile.username || "engine").replace(/^@/, "") ? `@${(profile.username || "engine").replace(/^@/, "")}` : "@engine"}
            </p>
          </div>

          {/* Bio. O perfil público grava a bio como `note` (db.js,
              getProfileSnapshot); a tela lia `bio` e ela nunca aparecia. */}
          {(profile.note || profile.bio) && (
            <p className="mb-4 whitespace-pre-line text-sm text-[var(--engine-text)] leading-relaxed">
              {profile.note || profile.bio}
            </p>
          )}

          {/* Location */}
          {profile.city && (
            <p className="mb-4 text-xs text-[var(--engine-text-muted)]">
              {profile.city}
            </p>
          )}

          {/* Action Buttons - Full width on mobile */}
          <div className="flex w-full gap-2 sm:gap-3">
            {isOwnProfile ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 rounded-lg bg-[var(--engine-accent)] py-2 text-xs font-black uppercase tracking-wide text-white transition hover:brightness-95 sm:py-2.5"
              >
                {t("socialFixes.profile.edit")}
              </button>
            ) : (
              <>
                <button
                  onClick={handleFollow}
                  className={`flex-1 rounded-lg py-2 text-xs font-black uppercase tracking-wide transition sm:py-2.5 ${
                    isFollowing
                      ? "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                      : "bg-[var(--engine-accent)] text-white hover:brightness-95"
                  }`}
                >
                  {isFollowing ? t("community.following") : t("community.follow")}
                </button>
                <button
                  onClick={handleMessage}
                  className="flex-1 rounded-lg border border-[var(--engine-border)] py-2 text-xs font-black uppercase tracking-wide text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:py-2.5"
                >
                  {t("socialFixes.profile.message")}
                </button>
                <button
                  type="button"
                  onClick={handleReportProfile}
                  title={t("socialFixes.profile.report")}
                  aria-label={t("socialFixes.profile.report")}
                  className="flex w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--engine-border)] text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                >
                  <Flag size={16} />
                </button>
                {currentUserId && (
                  <button
                    type="button"
                    onClick={handleBlockProfile}
                    title={t("community.block")}
                    aria-label={t("community.block")}
                    className="flex w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--engine-border)] text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                  >
                    <UserX size={16} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[var(--engine-border)]">
          <div className="flex gap-6 overflow-x-auto px-4 sm:px-6">
            {[
              { id: "posts", label: t("socialFeed.postsTab") },
              { id: "followers", label: t("profile.tabs.followers") },
              { id: "following", label: t("profile.tabs.following") },
              { id: "achievements", label: t("profile.tabs.achievements") },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  // A aba ativa precisa de uma ref para se anunciar quando a
                  // tira rola na horizontal (ver `activeTabRef` acima).
                  ref={isActive ? activeTabRef : undefined}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap border-b-2 py-4 text-sm font-bold uppercase tracking-wide transition ${
                    isActive
                      ? "border-[var(--engine-accent)] text-[var(--engine-accent)]"
                      : "border-transparent text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="px-4 py-6 sm:px-6">
          {activeTab === "posts" && (
            <div>
              {profileGoals.length ? (
                /* Grade de 3 colunas encostada nas bordas, como no Instagram:
                   até 30/10/2026 eram cartões com título e barra, que mostravam
                   seis posts por tela e não abriam nada. */
                <div className="-mx-4 -mt-6 grid grid-cols-3 gap-0.5 sm:-mx-6">
                  {profileGoals.map((goal) => (
                    <ProfilePostTile key={goal.id} goal={goal} t={t} onOpen={openFeedAt} />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <p className="text-sm font-bold text-[var(--engine-text)]">
                    {t("socialFixes.profile.noGoals")}
                  </p>
                  <p className="mt-1 text-xs text-[var(--engine-text-muted)]">
                    {isOwnProfile
                      ? t("socialFixes.profile.noGoalsMine")
                      : t("socialFixes.profile.noGoalsOther")}
                  </p>
                  {isOwnProfile && (
                    <button
                      onClick={() => navigate("/garagem")}
                      className="mt-4 rounded-lg border border-[var(--engine-border)] px-4 py-2 text-xs font-black uppercase tracking-wide text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                    >
                      {t("socialFixes.profile.goGarage")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "followers" && (
            <div className="space-y-3">
              {followers.length ? (
                followers.map((follower) => (
                  <UserListItem
                    key={follower.userId || follower.followerId}
                    userId={follower.userId || follower.followerId}
                    profiles={publicProfiles}
                    fallback={follower}
                  />
                ))
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <Users size={48} className="mb-3 text-[var(--engine-text-subtle)]" />
                  <p className="text-sm font-bold text-[var(--engine-text)]">
                    {currentUserId ? t("socialFixes.profile.noFollowers") : t("socialFixes.profile.signInToSeeList")}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "following" && (
            <div className="space-y-3">
              {following.length ? (
                following.map((userId) => (
                  <UserListItem key={userId} userId={userId} profiles={publicProfiles} />
                ))
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <Users size={48} className="mb-3 text-[var(--engine-text-subtle)]" />
                  <p className="text-sm font-bold text-[var(--engine-text)]">
                    {currentUserId ? t("socialFixes.profile.noFollowing") : t("socialFixes.profile.signInToSeeList")}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "achievements" && (
            <AchievementsTab
              unlocked={unlockedAchievements}
              likesReceived={likesReceived}
              followersCount={followers.length}
            />
          )}
        </div>
      </div>

      {isEditing && (
        <EditProfileModal
          isOpen={isEditing}
          onClose={() => setIsEditing(false)}
          settings={{
            ...settings,
            profile: {
              ...settings.profile,
              banner: settings.profile?.banner || banner || "",
            },
          }}
          onSave={(saved) => {
            onSettingsUpdate?.(saved);
            // Trocar o @ muda o endereço do perfil; sem trocar, relê o perfil
            // público para mostrar nome, bio e capa novos.
            const novo = saved?.profile?.username;
            if (novo && novo.replace(/^@/, "") !== identifier?.replace(/^@/, "").toLowerCase()) {
              navigate(`/community/${novo}`, { replace: true });
            } else {
              setReloadKey((value) => value + 1);
            }
          }}
        />
      )}
      {reportDialog}
      {postActions.reportDialog}
    </div>
  );
}
