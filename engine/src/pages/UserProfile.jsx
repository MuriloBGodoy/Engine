import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Heart,
  MessageCircle,
  Share2,
  Users,
  ArrowLeft,
  UserPlus,
  UserCheck,
  Mail,
} from "lucide-react";
import { engineDB } from "../services/db";
import { auth } from "../services/firebase";
import { EditProfileModal } from "../components/EditProfileModal";
import { AchievementsTab } from "../components/achievements/AchievementsTab";
import { listAchievements } from "../services/achievements";
import { profileCardFromSettings, startConversation } from "../services/chat";

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

export function UserProfile({ settings = {}, user = null }) {
  const { identifier } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const currentUserId = user?.uid || auth.currentUser?.uid;

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
    if (!currentUserId || !profile) return;
    try {
      if (isFollowing) {
        await engineDB.unfollowUser(currentUserId, profile.userId);
      } else {
        await engineDB.followUser(currentUserId, profile.userId);
      }
      setIsFollowing(!isFollowing);
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
    }
  };

  const handleMessage = async () => {
    if (!currentUserId || !profile) return;
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
    }
  };

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeTab]);

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
        <p className="mb-4 text-[var(--engine-text)]">Usuário não encontrado</p>
        <button
          onClick={() => navigate("/community")}
          className="text-[var(--engine-accent)] hover:underline"
        >
          Voltar para Comunidade
        </button>
      </div>
    );
  }

  const avatar = profile.avatar || null;
  const initials = profile.author
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "EN";

  return (
    <div className="min-h-screen bg-[var(--engine-bg)]">
      {/* Back Button - Fixed Sticky */}
      <div className="sticky top-0 z-50 flex items-center px-4 py-3 backdrop-blur-md sm:px-6 border-b border-[var(--engine-border)] bg-[var(--engine-bg)]/95 shadow-sm">
        <button
          onClick={() => window.history.back()}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
          aria-label="Voltar"
          title="Voltar para a página anterior"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="mx-auto w-full max-w-2xl">
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
                    Metas
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-[var(--engine-accent)] sm:text-xl">
                    {followers.length}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-[var(--engine-text-muted)] sm:text-[11px]">
                    Seguidores
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-[var(--engine-accent)] sm:text-xl">
                    {following.length}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-[var(--engine-text-muted)] sm:text-[11px]">
                    Seguindo
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

          {/* Bio */}
          {profile.bio && (
            <p className="mb-4 text-sm text-[var(--engine-text)] leading-relaxed">
              {profile.bio}
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
                Editar Perfil
              </button>
            ) : currentUserId && currentUserId !== profile?.userId && (
              <>
                <button
                  onClick={handleFollow}
                  className={`flex-1 rounded-lg py-2 text-xs font-black uppercase tracking-wide transition sm:py-2.5 ${
                    isFollowing
                      ? "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                      : "bg-[var(--engine-accent)] text-white hover:brightness-95"
                  }`}
                >
                  {isFollowing ? "Seguindo" : "Seguir"}
                </button>
                <button
                  onClick={handleMessage}
                  className="flex-1 rounded-lg border border-[var(--engine-border)] py-2 text-xs font-black uppercase tracking-wide text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:py-2.5"
                >
                  Mensagem
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[var(--engine-border)]">
          <div className="flex gap-6 overflow-x-auto px-4 sm:px-6">
            {[
              { id: "posts", label: t("profile.tabs.goals") },
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
              {userGoals.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {userGoals.map((goal) => {
                    const progress = goal.targetValue ? (goal.savedValue / goal.targetValue) * 100 : 0;
                    return (
                      <div
                        key={goal.id}
                        className="group overflow-hidden rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] transition hover:border-[var(--engine-accent)]"
                      >
                        {goal.image && (
                          <div className="relative h-32 overflow-hidden bg-[var(--engine-surface)]">
                            <img
                              src={goal.image}
                              alt={goal.title}
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                          </div>
                        )}
                        <div className="p-3">
                          <div className="mb-3">
                            <p className="line-clamp-2 text-sm font-bold text-[var(--engine-text)]">
                              {goal.title || `${goal.brand} ${goal.model}`}
                            </p>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--engine-border)]">
                            <div
                              className="h-full bg-[var(--engine-accent)]"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs font-bold text-[var(--engine-text)]">
                            {Math.min(Math.round(progress), 100)}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <p className="text-sm font-bold text-[var(--engine-text)]">
                    Nenhuma meta compartilhada
                  </p>
                  <p className="mt-1 text-xs text-[var(--engine-text-muted)]">
                    {isOwnProfile
                      ? "Só aparece aqui o que você publicar na comunidade"
                      : "Este usuário não compartilhou metas"}
                  </p>
                  {isOwnProfile && (
                    <button
                      onClick={() => navigate("/garagem")}
                      className="mt-4 rounded-lg border border-[var(--engine-border)] px-4 py-2 text-xs font-black uppercase tracking-wide text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                    >
                      Ir para a Garagem
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
                    Sem seguidores ainda
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
                    Não segue ninguém ainda
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
          profileSettings={settings.profile || profile}
          onSave={(updated) => {
            setProfile(prev => ({ ...prev, ...updated }));
          }}
        />
      )}
    </div>
  );
}
