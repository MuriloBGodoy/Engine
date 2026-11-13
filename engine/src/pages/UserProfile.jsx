import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Heart,
  MessageCircle,
  Share2,
  Flag,
  UserX,
  ArrowLeft,
  Copy,
  Play,
  Archive,
  Bookmark,
  Settings as Cog,
  LayoutGrid,
  AlignLeft,
  MapPin,
  Sparkles,
} from "lucide-react";
import { engineDB, POST_KIND_POST } from "../services/db";
import { GoalCard } from "./Community";
import { ShareToChatModal } from "../components/ShareToChatModal";
import { usePostActions } from "../hooks/usePostActions";
import { fetchSavedPosts } from "../services/savedPosts";
import { fetchArchivedPosts, setPostArchived } from "../services/archivedPosts";
import { fetchSavedCars } from "../services/savedCars";
import { TimeAgo } from "../components/social/TimeAgo";
import { openShareSheet, shareUrls } from "../services/shareLinks";
import "../services/i18n-social-posts";
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
import { BioWithMentions } from "../components/mentions/BioWithMentions";
import { EngineBlock } from "../components/mentions/EngineBlock";
import { useEnginePresence } from "../hooks/useEnginePresence";
import { PostMenu } from "../components/social/PostMenu";
import { PeopleSheet } from "../components/social/PeopleSheet";
import { fetchLikedPosts } from "../services/likedPosts";
import { listUserShowcase } from "../services/carShowcase";
import { postCover, postIsVisual } from "../services/postCover";
import "../services/i18n-profile-hub";

// Banner will be solid color gradient - no default image
const DEFAULT_BANNER_GRADIENT = "from-[var(--engine-accent)] to-[var(--engine-accent)]/70";

// O rótulo e o número embaixo de cada contador. Viram constante porque dois
// dos três são botões e o terceiro não, e sem isso a mesma linha de classes
// apareceria três vezes e uma delas sairia do passo.
//
// O rótulo não leva mais `whitespace-nowrap`: até 11/11/2026 ele levava, e
// numa linha que carregava a foto de 80px, os três contadores E o menu dos
// três pontos, as palavras ficavam da largura da própria coluna —
// "Seguidores" e "Seguindo" eram lidos como uma palavra só. O menu desceu
// para a linha de ações; se ainda assim faltar largura (tradução comprida,
// aparelho de 320px), o rótulo quebra em duas linhas em vez de invadir o
// vizinho.
const statLabelClass =
  "text-[11px] font-medium lowercase leading-tight text-[var(--engine-text-muted)] sm:text-xs";

// O número era `--engine-accent` em peso 900: três contadores parados
// gritando mais alto que o nome da pessoa logo abaixo. Vermelho no Engine é
// cor de ação, e contador parado não é ação.
const statValueClass =
  "text-[17px] font-extrabold leading-tight tabular-nums text-[var(--engine-text)] sm:text-lg";

// As duas ações principais do perfil, de peso igual nos dois casos: "Editar
// perfil / Compartilhar" no seu, "Seguir / Mensagem" no dos outros. Antes o
// seu tinha um botão vermelho de ponta a ponta para editar o próprio perfil
// — a ação menos urgente da tela com o peso visual máximo.
const profileActionBase =
  "flex min-h-10 flex-1 items-center justify-center rounded-lg px-3 text-[13px] font-bold transition";
const profileActionClass = `${profileActionBase} border border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text)] hover:border-[var(--engine-border-strong)]`;


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
  // A capa: foto, quadro do vídeo enviado ou a miniatura do YouTube quando
  // o post é um link de vídeo (ver `services/postCover`).
  const image = postCover(goal);
  const hasVideo = Boolean(goal.videoUrl || goal.video);
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

      {(many || hasVideo) && (
        <span
          className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
          title={hasVideo ? t("socialFeed.video") : t("socialFeed.multiplePhotos")}
        >
          {hasVideo ? <Play size={16} fill="currentColor" /> : <Copy size={16} />}
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
  // `?tab=` abre direto na aba: é por aí que Configurações leva a pessoa para
  // "Salvos" e "Arquivadas", e é o que faz o endereço valer como link. Vale
  // na montagem e só: depois disso quem manda é o toque na aba, senão o
  // parâmetro antigo puxaria a pessoa de volta a cada render.
  const [activeTab, setActiveTab] = useState(() => {
    const pedida = new URLSearchParams(window.location.search).get("tab") || "posts";
    // `?tab=followers` e `?tab=following` continuam valendo como endereço:
    // viraram folha, não deixaram de existir. A aba volta a ser Publicações
    // e a folha abre por cima (ver `peopleTab` logo abaixo).
    return ["followers", "following"].includes(pedida) ? "posts" : pedida;
  });
  // "No Engine" (clubes, páginas, eventos) virou aba em 04/11/2026: no
  // cabeçalho ele empurrava a bio, o botão de editar e a grade pra baixo, e
  // num celular a pessoa abria o perfil e via um cartão de clube em vez das
  // publicações. A aba só existe quando há o que mostrar.
  const enginePresence = useEnginePresence(profile?.userId || "");
  // "Minhas coisas" (Salvos, Arquivadas, Curtidas): só no próprio perfil,
  // lidas quando abertas. Saíram da tira de abas em 06/11/2026 e passaram a
  // morar no "..." do canto, como em toda rede — não são vitrine, são
  // gaveta.
  const [savedGoals, setSavedGoals] = useState(null);
  const [archivedGoals, setArchivedGoals] = useState(null);
  const [likedGoals, setLikedGoals] = useState(null);
  const [savedCars, setSavedCars] = useState(null);
  const [savedKind, setSavedKind] = useState("posts");
  // Os carros que esta pessoa abriu para a comunidade: a aba Garagem.
  const [showcaseCars, setShowcaseCars] = useState([]);
  // Publicação sem foto não cabe num quadrado de grade: a grade mostra o
  // que é visual e os textos ficam numa lista, a um toque de distância.
  const [postsKind, setPostsKind] = useState("grid");
  // Seguidores/Seguindo deixaram de ser abas: abrem pelo contador, numa
  // folha (ver `PeopleSheet`). "" = fechada.
  const [peopleTab, setPeopleTab] = useState(() => {
    const pedida = new URLSearchParams(window.location.search).get("tab") || "";
    return ["followers", "following"].includes(pedida) ? pedida : "";
  });
  // Quem EU sigo — é o que decide o botão de cada linha da folha.
  const [myFollowing, setMyFollowing] = useState(() => new Set());
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
  // Qual @ já foi carregado: é o que distingue "abri outro perfil" de
  // "recarreguei este".
  const perfilCarregado = useRef("");
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
      // A aba volta para Publicações só quando a PESSOA muda. O efeito
      // também corre ao recarregar (`reloadKey`) e ao a sessão aparecer, e
      // ali resetar era errado duas vezes: `?tab=salvos`, que Configurações
      // usa, era desfeito logo depois de abrir, e restaurar uma publicação
      // arquivada jogava a pessoa de volta na grade.
      const mudouDePessoa = perfilCarregado.current !== cleanUsername;
      perfilCarregado.current = cleanUsername;
      if (mudouDePessoa) setActiveTab("posts");
      setUserGoals([]);
      setFollowers([]);
      setFollowing([]);
      setUnlockedAchievements(new Set());
      setLikesReceived(0);
      setIsFollowing(false);
      setFollowCounts({ followers: 0, following: 0 });
      if (mudouDePessoa) {
        // Esvaziar a vitrine num recarregamento faria a aba Garagem sumir
        // e voltar; só vale quando é outra pessoa mesmo.
        setShowcaseCars([]);
        setPostsKind("grid");
        setPeopleTab("");
      }
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
        // Os carros que esta pessoa abriu para a comunidade. Vem junto
        // porque é ele que decide se a aba Garagem existe — e uma aba que
        // só aparece depois de tocada não é uma aba.
        listUserShowcase(userProfile.userId).catch(() => []),
      ])
        .then(async ([goals, followersList, followingList, conquistas, curtidas, vitrine]) => {
          if (!vivo) return;
          setUserGoals(goals || []);
          setFollowers(followersList || []);
          setFollowing(followingList || []);
          setUnlockedAchievements(conquistas || new Set());
          setLikesReceived(curtidas || 0);
          setShowcaseCars(vitrine || []);
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

      // Quem eu sigo: vale no próprio perfil também, porque a folha de
      // seguidores precisa saber em cada linha se o botão é "Seguir" ou
      // "Seguindo".
      if (currentUserId) {
        engineDB.getUserFollowing(currentUserId).then((currentFollowing) => {
          if (!vivo) return;
          const lista = currentFollowing || [];
          setMyFollowing(new Set(lista));
          setIsFollowing(
            currentUserId !== userProfile.userId && lista.includes(userProfile.userId),
          );
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
      setMyFollowing((current) => {
        const next = new Set(current);
        if (isFollowing) next.delete(profile.userId);
        else next.add(profile.userId);
        return next;
      });
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

  // Seguir / deixar de seguir de dentro da folha, sem sair dela. A conta de
  // seguidores do perfil aberto só muda quando a pessoa mexida é o dono do
  // perfil — nos outros casos o número daqui não é sobre ela.
  const handleToggleFollowFrom = async (targetId, seguir) => {
    if (!targetId || requireAccount()) return;
    setMyFollowing((current) => {
      const next = new Set(current);
      if (seguir) next.add(targetId);
      else next.delete(targetId);
      return next;
    });
    try {
      if (seguir) await engineDB.followUser(currentUserId, targetId);
      else await engineDB.unfollowUser(currentUserId, targetId);
      if (targetId === profile?.userId) {
        setIsFollowing(seguir);
        setFollowCounts((current) => ({
          ...current,
          followers: Math.max(0, current.followers + (seguir ? 1 : -1)),
        }));
      }
      if (isOwnProfile) {
        setFollowing((list) =>
          seguir ? [...new Set([...list, targetId])] : list.filter((id) => id !== targetId),
        );
        setFollowCounts((current) => ({
          ...current,
          following: Math.max(0, current.following + (seguir ? 1 : -1)),
        }));
      }
    } catch (error) {
      console.error(error);
      setMyFollowing((current) => {
        const next = new Set(current);
        if (seguir) next.delete(targetId);
        else next.add(targetId);
        return next;
      });
      toast(t("socialFixes.writeError"), "error");
    }
  };

  // Remover seguidor: o gesto pequeno entre aguentar e bloquear. Não avisa
  // ninguém e não impede de seguir de novo — o aviso diz isso.
  const handleRemoveFollower = async (targetId) => {
    const pessoa = publicProfiles?.[targetId] || {};
    const nome = pessoa.username || pessoa.author || t("peopleSheet.unknown");
    const ok = await confirm({
      title: t("peopleSheet.removeTitle"),
      message: t("peopleSheet.removeMessage", { user: nome }),
      confirmLabel: t("peopleSheet.removeConfirm"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    try {
      await engineDB.removeFollower(currentUserId, targetId);
      setFollowers((list) =>
        list.filter((item) => (item.userId || item.followerId) !== targetId),
      );
      setFollowCounts((current) => ({
        ...current,
        followers: Math.max(0, current.followers - 1),
      }));
      toast(t("peopleSheet.removed"));
    } catch (error) {
      console.error(error);
      toast(t("socialFixes.writeError"), "error");
    }
  };

  // Compartilhar o perfil. Virou função porque agora é chamada de dois
  // lugares: o botão do seu perfil e o menu do perfil dos outros.
  const shareProfile = () =>
    openShareSheet({
      url: shareUrls.profile(profile.username),
      title: `${profile.author}${profile.username ? ` (${profile.username})` : ""}`,
      kind: "profile",
    });

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

  // O arquivo: publicações que eu tirei do ar. O banco esconde de todo mundo,
  // inclusive de mim — este é o único lugar por onde elas aparecem.
  useEffect(() => {
    if (activeTab !== "archived" || !isOwnProfile || !currentUserId) return undefined;
    let alive = true;
    fetchArchivedPosts()
      .then((list) => alive && setArchivedGoals(list))
      .catch((error) => {
        console.error(error);
        if (alive) setArchivedGoals([]);
      });
    return () => {
      alive = false;
    };
  }, [activeTab, isOwnProfile, currentUserId, reloadKey]);

  // Curtidas: rastro, não coleção — por isso mora no "..." e não numa aba.
  useEffect(() => {
    if (activeTab !== "liked" || !isOwnProfile || !currentUserId) return undefined;
    let alive = true;
    fetchLikedPosts(currentUserId)
      .then((list) => alive && setLikedGoals(list))
      .catch((error) => {
        console.error(error);
        if (alive) setLikedGoals([]);
      });
    return () => {
      alive = false;
    };
  }, [activeTab, isOwnProfile, currentUserId]);

  useEffect(() => {
    if (activeTab !== "saved" || savedKind !== "cars" || !isOwnProfile || !currentUserId) {
      return undefined;
    }
    let alive = true;
    fetchSavedCars(currentUserId)
      .then((list) => alive && setSavedCars(list))
      .catch((error) => {
        console.error(error);
        if (alive) setSavedCars([]);
      });
    return () => {
      alive = false;
    };
  }, [activeTab, savedKind, isOwnProfile, currentUserId]);

  useEffect(() => {
    if (activeTab !== "saved" || !isOwnProfile || !currentUserId) return undefined;
    let alive = true;
    fetchSavedPosts(currentUserId)
      .then((list) => alive && setSavedGoals(list))
      .catch((error) => {
        console.error(error);
        if (alive) setSavedGoals([]);
      });
    return () => {
      alive = false;
    };
  }, [activeTab, isOwnProfile, currentUserId]);

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

  // Quem vai para a grade e quem vai para a lista de textos — o mesmo
  // critério que `ProfilePostTile` usa para decidir o que desenha.
  const visualGoals = profileGoals.filter(postIsVisual);
  const textGoals = profileGoals.filter((goal) => !postIsVisual(goal));

  if (feedPostId) {
    return (
      <div className="min-h-screen bg-[var(--engine-bg)]">
        {/* Gruda logo abaixo da barra do app: no celular ela é fixa (64px +
            recorte do iPhone) e, com as duas em top-0, a do app (z-40)
            cobriria esta. No desktop NÃO existe barra fixa — a Topbar rola
            junto com o conteúdo dentro do <main> —, então `lg:top-16`
            deixava esta aqui pairando 64px abaixo do topo e o post passava
            por baixo, à vista, na faixa de cima. */}
        <header className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 flex items-center gap-3 border-b border-[var(--engine-border)] bg-[var(--engine-bg)] px-2 py-2 sm:px-4 lg:top-0">
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
                onSendToChat={setPostToShare}
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
            <p className="px-4 py-10 text-center text-sm font-semibold text-[var(--engine-text-muted)] sm:py-16">
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
        {postActions.captionDialog}
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

            {/* Contadores. Seguidores e Seguindo são BOTÕES: o número é a
                porta da lista, como em toda rede — foi o que tirou as duas
                da tira de abas. Posts continua texto: a lista dele já é a
                tela inteira logo abaixo.

                Três colunas em `flex-1 min-w-0`, dividindo por igual o que
                sobra da foto. O menu dos três pontos saiu desta linha em
                11/11/2026 e foi para a linha de ações: eram três coisas
                disputando uma linha só, e quem perdia era o rótulo. */}
            <div className="flex min-w-0 flex-1 items-start">
              <div className="min-w-0 flex-1 px-1 py-0.5 text-center">
                <p className={statValueClass}>{userGoals.length}</p>
                <p className={statLabelClass}>{t("socialFixes.profile.goals")}</p>
              </div>
              <button
                type="button"
                onClick={() => setPeopleTab("followers")}
                className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-center transition hover:bg-[var(--engine-surface-2)]"
              >
                <p className={statValueClass}>{followCounts.followers}</p>
                <p className={statLabelClass}>{t("socialFixes.profile.followers")}</p>
              </button>
              <button
                type="button"
                onClick={() => setPeopleTab("following")}
                className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-center transition hover:bg-[var(--engine-surface-2)]"
              >
                <p className={statValueClass}>{followCounts.following}</p>
                <p className={statLabelClass}>{t("socialFixes.profile.following")}</p>
              </button>
            </div>
          </div>

          {/* Name & Username */}
          <div className="mb-3">
            <h2 className="flex min-w-0 items-center gap-1.5 text-base font-black text-[var(--engine-text)] sm:text-lg">
              <span className="min-w-0 truncate">{profile.author || "Usuário Engine"}</span>
              {/* Selo de Apoiador: quem assina cedo aparece. É o único
                  benefício do plano que existe no ato da assinatura — os
                  outros ainda estão sendo construídos —, então ele precisa
                  estar onde os outros veem, não escondido em Configurações. */}
              {profile.supporter && (
                <span
                  title={t("billing.features.founder.supporterBadge")}
                  aria-label={t("billing.features.founder.supporterBadge")}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--engine-accent-soft)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--engine-accent-text)]"
                >
                  <Sparkles size={11} aria-hidden="true" />
                  {t("profile.supporter")}
                </span>
              )}
            </h2>
            <p className="text-sm font-medium text-[var(--engine-text-muted)]">
              {(profile.username || "engine").replace(/^@/, "") ? `@${(profile.username || "engine").replace(/^@/, "")}` : "@engine"}
            </p>
          </div>

          {/* Bio. O perfil público grava a bio como `note` (db.js,
              getProfileSnapshot); a tela lia `bio` e ela nunca aparecia. */}
          {/* Menções (`@[tipo:id]`) viram chip com o nome atual. */}
          <BioWithMentions
            key={reloadKey}
            text={profile.note || profile.bio || ""}
            ownerId={profile.userId}
            viewerId={currentUserId || ""}
          />

          {/* Cidade, com alfinete. Solta, em cinza pequeno, ela flutuava sem
              dizer que era um lugar. */}
          {profile.city && (
            <p className="mb-4 flex items-center gap-1 text-xs text-[var(--engine-text-muted)]">
              <MapPin size={12} className="shrink-0" aria-hidden="true" />
              {profile.city}
            </p>
          )}

          {/* Linha de ações: a MESMA forma nos dois perfis — duas ações de
              peso igual e um menu. No seu: Editar e Compartilhar. No dos
              outros: Seguir e Mensagem.

              Até 11/11/2026 o perfil alheio punha CINCO botões nesta linha:
              denunciar, bloquear e compartilhar eram quadrados fixos de 44px
              que não encolhem, e sobravam uns 80px para "SEGUINDO" e
              "MENSAGEM" em caixa alta, que quebravam no meio da palavra
              ("SEGUIND / O"). As três ações raras foram para o menu, que é
              onde o Instagram, o X e o WhatsApp põem exatamente essas três. */}
          <div className="flex w-full items-stretch gap-2 sm:gap-3">
            {isOwnProfile ? (
              <>
                <button type="button" onClick={() => setIsEditing(true)} className={profileActionClass}>
                  {t("socialFixes.profile.edit")}
                </button>
                <button type="button" onClick={shareProfile} className={profileActionClass}>
                  {t("socialPosts.share.action")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleFollow}
                  className={
                    isFollowing
                      ? profileActionClass
                      : `${profileActionBase} bg-[var(--engine-accent)] text-white hover:brightness-95`
                  }
                >
                  {isFollowing ? t("community.following") : t("community.follow")}
                </button>
                <button type="button" onClick={handleMessage} className={profileActionClass}>
                  {t("socialFixes.profile.message")}
                </button>
              </>
            )}
            <PostMenu
              label={t("profileHub.menu")}
              triggerClass="flex w-10 shrink-0 items-center justify-center self-stretch rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:border-[var(--engine-border-strong)] hover:text-[var(--engine-text)]"
              items={
                isOwnProfile
                  ? [
                      { label: t("socialPosts.saved.tab"), icon: Bookmark, onClick: () => setActiveTab("saved") },
                      { label: t("community.archivedTab"), icon: Archive, onClick: () => setActiveTab("archived") },
                      { label: t("profileHub.liked"), icon: Heart, onClick: () => setActiveTab("liked") },
                      { label: t("profileHub.settings"), icon: Cog, onClick: () => navigate("/settings") },
                    ]
                  : [
                      { label: t("socialPosts.share.action"), icon: Share2, onClick: shareProfile },
                      { label: t("socialFixes.profile.report"), icon: Flag, onClick: handleReportProfile },
                      ...(currentUserId
                        ? [{ label: t("community.block"), icon: UserX, onClick: handleBlockProfile, danger: true }]
                        : []),
                    ]
              }
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-stretch border-b border-[var(--engine-border)]">
          <div className="relative min-w-0 flex-1">
          <div className="flex gap-5 overflow-x-auto px-4 pr-8 [scrollbar-width:none] sm:gap-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
            {/* A tira só tem CONTEÚDO desta pessoa, e cada aba é um tipo de
                coisa diferente:
                  Publicações — o que ela contou (com ou sem carro ligado);
                  Garagem     — os carros que ela abriu para a comunidade;
                  No Engine   — clube, página, evento;
                  Conquistas.
                Seguidores e Seguindo saíram para o contador (são lista de
                gente, não conteúdo) e Salvos/Arquivadas/Curtidas para o
                "..." (são minhas, não vitrine). De sete abas para quatro.
                "Minhas coisas" ainda entra aqui quando o endereço pede
                (`?tab=saved`, vindo de Configurações) — a aba existe, só
                não ocupa a tira. */}
            {[
              { id: "posts", label: t("socialFeed.postsTab") },
              ...(showcaseCars.length || isOwnProfile
                ? [{ id: "garage", label: t("profileHub.garage") }]
                : []),
              ...(enginePresence.hasPresence
                ? [{ id: "engine", label: t("engineBlock.title") }]
                : []),
              { id: "achievements", label: t("profile.tabs.achievements") },
              ...(isOwnProfile && ["saved", "archived", "liked"].includes(activeTab)
                ? [
                    {
                      id: activeTab,
                      label: t(
                        activeTab === "saved"
                          ? "socialPosts.saved.tab"
                          : activeTab === "archived"
                            ? "community.archivedTab"
                            : "profileHub.liked",
                      ),
                    },
                  ]
                : []),
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  // A aba ativa precisa de uma ref para se anunciar quando a
                  // tira rola na horizontal (ver `activeTabRef` acima).
                  ref={isActive ? activeTabRef : undefined}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 whitespace-nowrap border-b-2 py-3.5 text-[13px] font-bold tracking-tight transition sm:text-sm ${
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
          {/* Esmaecido na borda direita: a tira rola e nada avisava —
              "CONQUIST⁄" cortado no meio parecia defeito. Ele mora sobre o
              respiro do fim da tira (o `pr-8` acima), nunca sobre texto. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--engine-bg)] to-transparent"
          />
        </div>

        {/* Grade / lista: entrou na PRÓPRIA tira de abas, à direita, e sem
            sublinhado. Até 11/11/2026 era uma segunda tira logo abaixo, com
            um segundo sublinhado vermelho — duas seleções acesas na mesma
            dobra, e o olho sem saber qual respondia ao toque.

            Fica fora do rolador para não sumir quando as abas passarem da
            largura da tela. Só existe quando existem os dois tipos: num
            perfil só de fotos não há escolha a oferecer. */}
        {activeTab === "posts" && textGoals.length > 0 && visualGoals.length > 0 && (
          <div className="flex shrink-0 items-center gap-0.5 pr-2 sm:pr-4">
            {[
              { id: "grid", icon: LayoutGrid, label: t("profileHub.grid") },
              { id: "texts", icon: AlignLeft, label: t("profileHub.texts") },
            ].map((vista) => {
              const ativa = postsKind === vista.id;
              const Icone = vista.icon;
              return (
                <button
                  key={vista.id}
                  type="button"
                  onClick={() => setPostsKind(vista.id)}
                  title={vista.label}
                  aria-label={vista.label}
                  aria-pressed={ativa}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    ativa
                      ? "text-[var(--engine-accent)]"
                      : "text-[var(--engine-text-subtle)] hover:text-[var(--engine-text)]"
                  }`}
                >
                  <Icone size={18} strokeWidth={ativa ? 2.6 : 2} />
                </button>
              );
            })}
          </div>
        )}
        </div>

        {/* Tab Content */}
        <div className="px-4 py-6 sm:px-6">
          {activeTab === "posts" && (
            <div>
              {/* Grade é para o que é visual. Publicação só de texto num
                  quadrado 1:1 vira um buraco escuro no meio das fotos — e
                  no Engine ela quase sempre é pergunta ("alguém sabe onde
                  acha essa peça?"), que se lê em linha e não em miniatura.
                  Então: a grade fica com foto e vídeo, e os textos ganham
                  uma lista do lado, a um toque. A tira de escolha só
                  aparece quando existe texto para mostrar. */}

              {postsKind === "texts" || !visualGoals.length ? null : (
                /* Grade de 3 colunas encostada nas bordas, como no Instagram:
                   até 30/10/2026 eram cartões com título e barra, que mostravam
                   seis posts por tela e não abriam nada. */
                <div className="-mx-4 -mt-6 grid grid-cols-3 gap-0.5 sm:-mx-6">
                  {visualGoals.map((goal) => (
                    <ProfilePostTile key={goal.id} goal={goal} t={t} onOpen={openFeedAt} />
                  ))}
                </div>
              )}

              {(postsKind === "texts" || !visualGoals.length) && textGoals.length > 0 && (
                <div className="space-y-2">
                  {textGoals.map((goal) => (
                    <TextPostRow key={goal.id} goal={goal} t={t} onOpen={openFeedAt} />
                  ))}
                </div>
              )}

              {!profileGoals.length ? (
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
              ) : null}
            </div>
          )}

          {activeTab === "saved" && isOwnProfile && (
            <div>
              <p className="-mt-2 mb-3 text-xs text-[var(--engine-text-muted)]">{t("socialPosts.saved.onlyYou")}</p>
              {/* Publicação e carro são coisas diferentes e abrem telas
                  diferentes: misturar os dois numa grade só faria o toque
                  virar sorteio. Duas seções, a mesma lista. */}
              <div className="mb-3 flex gap-1.5">
                {["posts", "cars"].map((qual) => (
                  <button
                    key={qual}
                    type="button"
                    onClick={() => setSavedKind(qual)}
                    className={`min-h-9 rounded-full px-3 text-[12.5px] font-bold transition-colors ${
                      savedKind === qual
                        ? "bg-[var(--engine-accent)] text-white"
                        : "bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]"
                    }`}
                  >
                    {t(qual === "posts" ? "socialFeed.postsTab" : "cars.tab")}
                  </button>
                ))}
              </div>

              {savedKind === "posts" ? (
                savedGoals === null ? (
                  <p className="py-10 text-center text-sm text-[var(--engine-text-muted)]">{t("common.loading")}</p>
                ) : savedGoals.length ? (
                  <div className="-mx-4 grid grid-cols-3 gap-0.5 sm:-mx-6">
                    {savedGoals.map((goal) => (
                      <ProfilePostTile key={goal.id} goal={goal} t={t} onOpen={(id) => navigate(`/post/${id}`)} />
                    ))}
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-[var(--engine-text-muted)]">{t("socialPosts.saved.empty")}</p>
                )
              ) : savedCars === null ? (
                <p className="py-10 text-center text-sm text-[var(--engine-text-muted)]">{t("common.loading")}</p>
              ) : savedCars.length ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {savedCars.map((car) => (
                    <Link
                      key={car.id}
                      to={`/carro/${car.slug}`}
                      className="overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)]"
                    >
                      <span className="block aspect-[4/3] overflow-hidden bg-[var(--engine-surface-2)]">
                        {car.image ? (
                          <img src={car.image} alt={car.title} loading="lazy" className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <span className="block p-2.5">
                        <span className="block truncate text-[13px] font-extrabold text-[var(--engine-text)]">
                          {car.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-[var(--engine-text-muted)]">
                          {[car.year, car.city].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-[var(--engine-text-muted)]">
                  {t("community.savedCarsEmpty")}
                </p>
              )}
            </div>
          )}

          {activeTab === "archived" && isOwnProfile && (
            <div>
              <p className="-mt-2 mb-3 text-xs text-[var(--engine-text-muted)]">
                {t("community.archivedOnlyYou")}
              </p>
              {archivedGoals === null ? (
                <p className="py-10 text-center text-sm text-[var(--engine-text-muted)]">{t("common.loading")}</p>
              ) : archivedGoals.length ? (
                <div className="space-y-2">
                  {archivedGoals.map((goal) => (
                    <ArchivedRow
                      key={goal.id}
                      goal={goal}
                      t={t}
                      onRestore={async () => {
                        try {
                          await setPostArchived(goal.id, false);
                          setArchivedGoals((list) => list.filter((item) => item.id !== goal.id));
                          toast(t("community.restored"));
                          setReloadKey((key) => key + 1);
                        } catch (error) {
                          console.error(error);
                          toast(t("socialFixes.writeError"), "error");
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-[var(--engine-text-muted)]">
                  {t("community.archivedEmpty")}
                </p>
              )}
            </div>
          )}

          {activeTab === "engine" && (
            <EngineBlock
              key={`engine-${reloadKey}`}
              data={enginePresence.data}
              isOwn={isOwnProfile}
              bare
            />
          )}

          {/* Garagem: os carros que esta pessoa abriu para a comunidade.
              É a aba que faltava, e é aqui que mora a diferença que a
              Comunidade precisava — publicação é um momento, carro é um
              objeto permanente, com ficha, preparação, página e busca. */}
          {activeTab === "garage" && (
            <div>
              {showcaseCars.length ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {showcaseCars.map((car) => (
                    <Link
                      key={car.id}
                      to={`/carro/${car.slug}`}
                      className="overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] transition hover:border-[var(--engine-accent)]"
                    >
                      <span className="block aspect-[4/3] overflow-hidden bg-[var(--engine-surface-2)]">
                        {car.image ? (
                          <img
                            src={car.image}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                      <span className="block p-2.5">
                        <span className="block truncate text-[13px] font-extrabold text-[var(--engine-text)]">
                          {[car.brand, car.model].filter(Boolean).join(" ") || car.slug}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-[var(--engine-text-muted)]">
                          {[car.year, car.city].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                  <p className="text-sm font-bold text-[var(--engine-text)]">
                    {t("profileHub.garageEmpty")}
                  </p>
                  {isOwnProfile && (
                    <>
                      <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--engine-text-muted)]">
                        {t("profileHub.garageEmptyMine")}
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate("/garagem")}
                        className="mt-4 rounded-lg border border-[var(--engine-border)] px-4 py-2 text-xs font-black uppercase tracking-wide text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                      >
                        {t("profileHub.garageGo")}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "liked" && isOwnProfile && (
            <div>
              <p className="-mt-2 mb-3 text-xs text-[var(--engine-text-muted)]">
                {t("profileHub.likedOnlyYou")}
              </p>
              {likedGoals === null ? (
                <p className="py-10 text-center text-sm text-[var(--engine-text-muted)]">
                  {t("common.loading")}
                </p>
              ) : likedGoals.length ? (
                <div className="-mx-4 grid grid-cols-3 gap-0.5 sm:-mx-6">
                  {likedGoals.map((goal) => (
                    <ProfilePostTile
                      key={goal.id}
                      goal={goal}
                      t={t}
                      onOpen={(id) => navigate(`/post/${id}`)}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-[var(--engine-text-muted)]">
                  {t("profileHub.likedEmpty")}
                </p>
              )}
            </div>
          )}

          {activeTab === "achievements" && (
            <AchievementsTab
              unlocked={unlockedAchievements}
              likesReceived={likesReceived}
              followersCount={followers.length}
              isOwn={isOwnProfile}
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
      <PeopleSheet
        open={Boolean(peopleTab)}
        tab={peopleTab || "followers"}
        onTab={setPeopleTab}
        onClose={() => setPeopleTab("")}
        followers={followers}
        following={following}
        profiles={publicProfiles}
        counts={followCounts}
        currentUserId={currentUserId}
        myFollowing={myFollowing}
        onToggleFollow={handleToggleFollowFrom}
        onRemoveFollower={isOwnProfile ? handleRemoveFollower : null}
        t={t}
      />
      {reportDialog}
      {postActions.reportDialog}
      {postActions.captionDialog}
    </div>
  );
}

/**
 * Uma publicação sem foto, na lista "Textos" do perfil.
 *
 * Linha e não quadrado, pelo mesmo motivo do arquivo: quadrado existe para
 * passar o olho por imagem, e aqui não há imagem nenhuma. O que a pessoa
 * procura é a frase.
 */
function TextPostRow({ goal, t, onOpen }) {
  const texto = String(goal.note || goal.title || "").trim();
  const curtidas = Number(goal.likes) || 0;
  const comentarios = goal.comments?.length || 0;
  // Link de vídeo que não entrega miniatura (Instagram, TikTok) cai aqui
  // por falta de capa, mas não é um post de texto: o selo diz o que é, em
  // vez de deixar a pessoa descobrir abrindo.
  const temVideo = Boolean(goal.videoUrl);

  return (
    <button
      type="button"
      onClick={() => onOpen(goal.id)}
      className="flex w-full items-start gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3 text-left transition hover:border-[var(--engine-accent)]"
    >
      {temVideo && (
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]">
          <Play size={15} fill="currentColor" strokeWidth={0} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-3 text-[13.5px] font-semibold leading-5 text-[var(--engine-text)]">
          {texto || t("community.archivedNoText")}
        </p>
        <p className="mt-1.5 flex items-center gap-3 text-[11.5px] font-semibold text-[var(--engine-text-subtle)]">
          {goal.createdAt ? <TimeAgo value={goal.createdAt} short /> : null}
          <span className="inline-flex items-center gap-1">
            <Heart size={12} />
            {curtidas}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={12} />
            {comentarios}
          </span>
        </p>
      </div>
    </button>
  );
}

/**
 * Uma publicação arquivada.
 *
 * Linha, e não quadradinho como em "Salvos": a grade existe para passar o
 * olho por muita coisa, e o arquivo é uma lista curta onde a pessoa procura
 * UMA publicação específica para trazer de volta. Post de texto nem tem foto
 * para pôr num quadrado.
 */
function ArchivedRow({ goal, t, onRestore }) {
  const capa = goal.image || goal.images?.[0] || "";
  const texto = String(goal.note || goal.title || "").trim();

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-2.5">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--engine-surface-2)]">
        {capa ? (
          <img src={capa} alt="" className="h-full w-full object-cover" />
        ) : (
          <Archive size={18} className="text-[var(--engine-text-subtle)]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-semibold leading-5 text-[var(--engine-text)]">
          {texto || t("community.archivedNoText")}
        </p>
        {goal.createdAt ? (
          <p className="mt-0.5 text-[11px] text-[var(--engine-text-subtle)]">
            <TimeAgo value={goal.createdAt} short />
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRestore}
        className="min-h-11 shrink-0 rounded-lg border border-[var(--engine-border)] px-3 text-[12px] font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
      >
        {t("community.restore")}
      </button>
    </div>
  );
}
