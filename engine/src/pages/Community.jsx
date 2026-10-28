import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Award,
  AtSign,
  Bookmark,
  Building,
  Calendar,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Edit3,
  Flag,
  Heart,
  MapPin,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Star,
  MessageCircle,
  Trophy,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";
import { ClubsTab } from "../components/community/ClubsTab";
import { getClub } from "../services/clubs";
import { useProfileSearch } from "../hooks/useProfileSearch";
import { ClubTag } from "../components/clubs/ClubEmblem";
import { Events } from "./Events";
import { engineDB, POST_KIND_POST } from "../services/db";
import { postBadgeTier } from "../services/achievements";
import { normalizeFipeBrand } from "../services/fipeVersion";
import { AchievementBadge } from "../components/achievements/AchievementBadge";
import { InfoTip } from "../components/InfoTip";
import { SpecSheetModal } from "../components/specsheet/SpecSheetModal";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useRequireAccount } from "../hooks/useRequireAccount";
import { useSocialReport } from "../hooks/useSocialReport";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { ShareToChatModal } from "../components/ShareToChatModal";
import { AdSlot } from "../components/AdSlot";
import { CreateFeedPostModal } from "../components/CreateFeedPostModal";
import { useRegion } from "../hooks/RegionProvider";
import { applyRegionFilter } from "../services/region";
import { profileCardFromSettings, startConversation } from "../services/chat";
import { formatFipeYear } from "../services/carDisplay";

const fallbackImage =
  "https://images.unsplash.com/photo-1598209279122-8541213a0387?q=80&w=900";

const videoPosts = [];
const friendSuggestions = [];

const emptyInteraction = {
  liked: false,
  comments: [],
  rating: 0,
};

// Post de outra pessoa não traz dinheiro (só `progress`, 0–100); o próprio
// post é mesclado com o carro da garagem e ainda tem os valores.
const getProgress = (goal) =>
  Number(goal.targetValue) > 0
    ? Math.min((Number(goal.savedValue) / Number(goal.targetValue)) * 100, 100)
    : Math.min(Math.max(Number(goal.progress) || 0, 0), 100);

const isGoalCompleted = (goal) => getProgress(goal) >= 100;

const RELATIVE_UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

// Tempo relativo ("há 2 horas") no idioma atual, sem depender de i18n manual.
const formatRelativeTime = (value, language = "pt-BR") => {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const diffSeconds = Math.round((time - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  try {
    const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
      if (absSeconds >= secondsInUnit) {
        return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
      }
    }
    return rtf.format(0, "second");
  } catch {
    return "";
  }
};

const getInitials = (name = "U") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

const isImageUrl = (value) =>
  typeof value === "string" && (value.startsWith("http") || value.startsWith("data:"));

const normalizeVehicleText = (value = "") =>
  String(value).replace(/\s+/g, " ").trim();

const removeVehicleBrand = (title = "", brand = "") => {
  let label = normalizeVehicleText(title);
  const brandParts = normalizeVehicleText(brand)
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  [normalizeVehicleText(brand), ...brandParts].forEach((part) => {
    if (part && label.toLowerCase().startsWith(part.toLowerCase())) {
      label = label.slice(part.length).trim();
    }
  });

  return label.replace(/^[-/|]+/, "").trim();
};

const getRankingVehicleLabel = (goal = {}) => {
  const brand = normalizeVehicleText(goal.brand);
  const model = removeVehicleBrand(goal.model, brand);
  const titleModel = removeVehicleBrand(goal.title, brand);
  const brandLower = brand.toLowerCase();

  if (model && model.toLowerCase() !== brandLower) {
    return model;
  }

  if (titleModel && titleModel.toLowerCase() !== brandLower) {
    return titleModel;
  }

  return model || normalizeVehicleText(goal.title) || brand || "Meta";
};

/**
 * Nome do veículo: "marca + modelo", sem repetir a marca quando o modelo
 * cadastrado já a contém (ou quando o modelo está vazio, caso em que sobra
 * só a marca).
 */
const getVehicleTitle = (goal = {}) => {
  const brand = normalizeVehicleText(goal.brand);
  const model = getRankingVehicleLabel(goal);

  if (!brand) return model;
  if (!model || model.toLowerCase() === brand.toLowerCase()) return brand;
  return `${brand} ${model}`;
};

/**
 * Nome curto para o feed: `GM - Chevrolet Corsa Sedan 1.8 MPFI FlexPower 8V 4p`
 * vira `Chevrolet Corsa Sedan`.
 *
 * A string da FIPE é a VERSÃO, e versão é assunto da ficha técnica — que é
 * justamente o que este botão abre. No card ela não cabia: truncava no meio e
 * comia o ano, que é a parte que ajuda a reconhecer o carro. Some a sigla
 * redundante da marca (`GM - `, `VW - `) e corta na cilindrada, que é onde a
 * designação do modelo acaba e começa a do motor. Sem cilindrada escrita, não
 * corta nada — chutar onde a versão começa seria pior que o nome comprido.
 */
const VERSION_START = /\s\d+[.,]\d.*$/;

const GOALS_SUBTABS = ["feed", "videos", "ranking"];

const getVehicleTitleShort = (goal = {}) => {
  const brand = normalizeFipeBrand(goal.brand);
  const model = getRankingVehicleLabel(goal).replace(VERSION_START, "").trim();

  if (!brand) return model || getVehicleTitle(goal);
  if (!model || model.toLowerCase() === brand.toLowerCase()) return brand;
  return `${brand} ${model}`;
};

const communityGoalId = (goal, userId = "") => {
  const goalId = String(goal?.id || "");
  if (goalId.startsWith("goal-")) return goalId;
  return `goal-${userId || goal?.ownerId || ""}-${String(goal?.carId || goalId).replace(/^user-/, "")}`;
};

const legacyCommunityGoalId = (goal, userId = "") => {
  const goalId = String(goal?.id || "");
  if (goalId.startsWith("goal-")) return goalId;
  return `goal-${userId || goal?.ownerId || ""}-user-${String(goal?.carId || goalId).replace(/^user-/, "")}`;
};

// Link compartilhável aponta para a página da publicação, e não mais para o
// feed com `?goal=`: quem recebe cai direto no conteúdo, e a URL diz o que é.
const buildShareUrl = (goal) => {
  const url = new URL(window.location.href);
  url.search = "";
  url.pathname = `/post/${goal.id}`;
  return url.toString();
};

const profileFromSettings = (settings, user) => {
  const name = settings.profile.displayName || user?.displayName || "Usuário Engine";
  return {
    id: user?.uid || "",
    userId: user?.uid || "",
    author: name,
    username: settings.profile.username || `@engine.${String(user?.uid || "").slice(0, 6)}`,
    avatar: settings.profile.avatar || user?.photoURL || "",
    avatarInitials: getInitials(name),
    city: settings.profile.location || "Engine Garage",
    note: settings.profile.bio || "",
  };
};

const withProfile = (person = {}, profiles = {}) => {
  const profile = profiles[person.userId] || profiles[person.ownerId];
  if (!profile) return person;
  // `note` fica de fora de propósito: no post ela é a legenda da publicação,
  // não a bio de quem publicou.
  return {
    ...person,
    author: profile.author ?? person.author,
    username: profile.username ?? person.username,
    avatar: profile.avatar ?? person.avatar,
    avatarInitials: profile.avatarInitials ?? person.avatarInitials,
    city: profile.city ?? person.city,
    country: profile.country ?? person.country,
    state: profile.state ?? person.state,
  };
};

const enrichGoalProfiles = (goal, profiles) => {
  const enriched = withProfile(goal, profiles);
  return {
    ...enriched,
    comments: (enriched.comments || []).map((comment) =>
      typeof comment === "string" ? comment : withProfile(comment, profiles),
    ),
  };
};

// O @ já vem no username salvo; ao lado do ícone de arroba ele duplicava.
const withoutAt = (value = "") => String(value || "").replace(/^@+/, "");

const mergeDefined = (base, incoming = {}) =>
  Object.entries(incoming).reduce(
    (merged, [key, value]) =>
      value === null || value === undefined || value === ""
        ? merged
        : { ...merged, [key]: value },
    { ...base },
  );

const getProfileStats = (profile = {}) => {
  const goals = profile.goals || [];
  const progress = goals.reduce((sum, goal) => sum + getProgress(goal), 0);
  return {
    goalsCount: profile.goalsCount ?? goals.length,
    likesCount:
      profile.likesCount ??
      goals.reduce((sum, goal) => sum + (Number(goal.likes) || 0), 0),
    averageProgress:
      profile.averageProgress ?? (goals.length ? progress / goals.length : 0),
  };
};

const isGoalShared = (goal, sharedGoalIds, userId = "") => {
  const goalId = communityGoalId(goal, userId || goal.ownerId);
  const legacyGoalId = legacyCommunityGoalId(goal, userId || goal.ownerId);
  return [goal.id, `user-${goal.id}`, goalId, legacyGoalId].some((id) =>
    sharedGoalIds.includes(id),
  );
};

function AvatarButton({ person, onClick, size = "md" }) {
  const label = person?.author || person?.name || "Usuário Engine";
  const avatar = person?.avatar || person?.avatarInitials || getInitials(label);
  const isSmall = size === "sm";
  const sizeClass = isSmall ? "h-8 w-8 text-xs" : "h-11 w-11";

  /* O desenho do avatar vive no `span`; o `button` é só o alvo. No tamanho
     pequeno (32px) a bolinha ficaria abaixo dos 44px de toque, então o botão
     cresce por fora com margem negativa e o avatar continua do tamanho que o
     layout pede. */
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center justify-center rounded-full transition hover:ring-2 hover:ring-red-500/40 ${
        isSmall ? "-m-1.5 h-11 w-11 sm:m-0 sm:h-8 sm:w-8" : "h-11 w-11"
      }`}
      title={label}
    >
      <span
        className={`flex ${sizeClass} items-center justify-center overflow-hidden rounded-full bg-[var(--engine-accent)] font-black italic text-white`}
      >
        {isImageUrl(avatar) ? (
          <img src={avatar} alt={label} className="h-full w-full object-cover" />
        ) : (
          avatar
        )}
      </span>
    </button>
  );
}

const buildUserGoals = (cars, settings, user) => {
  const displayName = settings.profile.displayName || user?.displayName || "Você";
  const username = settings.profile.username || "@sua.garagem";

  return cars.map((car, index) => ({
    id: String(car.id),
    carId: String(car.id),
    ownerId: user?.uid || "",
    author: displayName,
    username,
    avatar: settings.profile.avatar || getInitials(displayName),
    city: settings.profile.location || "Engine Garage",
    title: `${car.brand} ${car.model}`,
    brand: car.brand,
    model: car.model,
    year: car.year,
    image: car.image || fallbackImage,
    savedValue: car.savedValue,
    targetValue: car.targetValue,
    streak: 7 + index * 3,
    likes: 64 + index * 19,
    comments: [],
    rating: 4.5,
    verified: true,
    tagKey: "community.seed.mine",
    note: "",
    isMine: true,
  }));
};

function RatingControl({ value, onRate, label, size = 16 }) {
  return (
    <div className="flex items-center" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onRate(star)}
          className={`-my-2 flex h-11 items-center px-1 transition-transform hover:scale-110 sm:my-0 sm:h-auto sm:py-1.5 ${
            star <= Math.round(value)
              ? "text-amber-400"
              : "text-[var(--engine-border-strong)]"
          }`}
          title={`${star}/5`}
        >
          <Star
            size={size}
            fill={star <= Math.round(value) ? "currentColor" : "none"}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * Galeria do post. Uma foto só continua sendo uma imagem simples; com mais
 * de uma vira carrossel: arrastar o dedo no celular, setas no desktop e
 * bolinhas indicando onde você está.
 */
/**
 * Vídeo do post. Só YouTube é embutido; Instagram e TikTok exigem carregar
 * script deles na página, o que traz rastreamento de terceiro e uma
 * dependência externa capaz de quebrar o post. Para esses, o link abre fora.
 */
function PostVideo({ url, t }) {
  const match = String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
  );

  if (match?.[1]) {
    return (
      <div className="bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${match[1]}`}
          title={t("community.watchVideo")}
          allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="aspect-video w-full"
        />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mx-3 mb-1 flex items-center gap-2 rounded-xl border border-[var(--engine-border)] px-3 py-2.5 text-xs font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:mx-4"
    >
      <Play size={14} className="shrink-0" />
      <span className="truncate">{t("community.watchVideo")}</span>
    </a>
  );
}

function PostGallery({ images, alt, t, onOpen }) {
  const [index, setIndex] = useState(0);
  const dragStart = useRef(null);

  const total = images.length;
  const current = Math.min(index, total - 1);

  const go = (next) => setIndex(Math.max(0, Math.min(next, total - 1)));

  const handleTouchStart = (event) => {
    dragStart.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event) => {
    if (dragStart.current === null) return;
    const delta = event.changedTouches[0].clientX - dragStart.current;
    dragStart.current = null;
    if (Math.abs(delta) < 40) return;
    go(delta < 0 ? current + 1 : current - 1);
  };

  return (
    <div
      className="relative aspect-[4/3] overflow-hidden bg-[var(--engine-surface-2)]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {images.map((image) => (
          <img
            key={image}
            src={image}
            alt={alt}
            onError={(event) => {
              event.currentTarget.src = fallbackImage;
            }}
            className="h-full w-full shrink-0 object-cover"
          />
        ))}
      </div>

      {/* A foto é o "abrir publicação" — mesmo gesto de qualquer feed. */}
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("community.openPost")}
          title={t("community.openPost")}
          className="absolute inset-0"
        />
      )}

      {total > 1 && (
        <>
          {current > 0 && (
            <button
              type="button"
              onClick={() => go(current - 1)}
              aria-label={t("community.previousPhoto")}
              className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 sm:flex"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {current < total - 1 && (
            <button
              type="button"
              onClick={() => go(current + 1)}
              aria-label={t("community.nextPhoto")}
              className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 sm:flex"
            >
              <ChevronRight size={18} />
            </button>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((image, position) => (
              <span
                key={image}
                className={`h-1.5 rounded-full transition-all ${
                  position === current ? "w-4 bg-white" : "w-1.5 bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Menu "..." do post. Tira do cartão as ações raras (copiar link, remover)
 * que antes moravam na barra de ícones e a deixavam pesada.
 */
function PostMenu({ items, label }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={label}
        aria-label={label}
        className="-m-1.5 flex h-11 w-11 items-center justify-center rounded-full text-[var(--engine-text-subtle)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] sm:m-0 sm:h-8 sm:w-8"
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <>
          {/* Camada de saída: um clique em qualquer lugar fecha o menu. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="engine-pop absolute right-0 top-9 z-40 w-52 overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] shadow-[var(--engine-shadow-lg)]">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px] font-semibold transition-colors hover:bg-[var(--engine-surface-2)] ${
                    item.danger
                      ? "text-[var(--engine-accent)]"
                      : "text-[var(--engine-text)]"
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Cartão do feed.
 *
 * Segue a anatomia das redes sociais: cabeçalho enxuto, mídia grande, barra
 * de ações e só então o texto. O que era ruído em cada post (caixas de
 * métricas, aviso de privacidade repetido, formulário de comentário sempre
 * aberto) saiu ou virou uma linha só — comentar abre o modal.
 */
// Exportado para a página do post (/post/:id) reaproveitar exatamente o mesmo
// card do feed — duas versões do card divergiriam na primeira mudança.
export function GoalCard({
  goal,
  interactions,
  following,
  shared,
  t,
  onLike,
  onComment,
  onRate,
  onShare,
  onUnshare,
  onFollow,
  onOpenProfile,
  onEditComment,
  onDeleteComment,
  onOpenPost,
  onSendToChat,
  onEditCaption,
  onReport,
  onReportComment,
  onBlock,
  onCommentClick,
  currentUserId,
  variant = "feed",
  initialCommentsOpen = false,
}) {
  const [draft, setDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState("");
  const [editingDraft, setEditingDraft] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(initialCommentsOpen);
  const [commentMenuId, setCommentMenuId] = useState("");
  const [specsOpen, setSpecsOpen] = useState(false);

  const { i18n } = useTranslation();
  const progress = getProgress(goal);
  const comments = [...goal.comments, ...interactions.comments];
  const liked = interactions.liked;
  const likeCount = Number(goal.likes) || 0;
  // A faixa mais alta que ESTE post bateu sozinho — 10K sobrescreve 1K no
  // post (decisão da sessão de 22/08/2026); as duas continuam somando na aba
  // de Conquistas do perfil, que lê de outra fonte (curtidas recebidas no
  // total, não por post).
  const postLikeTier = postBadgeTier(likeCount);
  const rating = interactions.rating || goal.rating;
  const isFollowing = following.includes(goal.ownerId || goal.username);
  const isOwner = goal.isMine || goal.ownerId === currentUserId;
  const isModal = variant === "modal";
  const isFreePost = goal.kind === POST_KIND_POST;
  // Post de texto fica sem galeria em vez de ganhar a imagem genérica de
  // carro, que ali seria só ruído.
  const gallery = goal.images?.length ? goal.images : (goal.image ? [goal.image] : []);
  const photos = gallery.length ? gallery : isFreePost ? [] : [fallbackImage];
  // Post só de texto inverte a ordem: conteúdo antes dos botões de ação.
  const textFirst = isFreePost && !photos.length && !goal.videoUrl && Boolean(goal.note);
  // No modal de publicação (desktop) os comentários já estão ao lado: o balão
  // leva o foco para o compositor em vez de abrir outra folha.
  const showComments = onCommentClick || (() => setCommentsOpen(true));

  const submitComment = (event) => {
    event.preventDefault();
    const cleanDraft = draft.trim().slice(0, 180);
    if (!cleanDraft) return;
    onComment(goal.id, cleanDraft);
    setDraft("");
  };

  const startEditComment = (comment) => {
    setEditingCommentId(comment.id);
    setEditingDraft(comment.text || "");
  };

  const submitEditComment = (event, comment) => {
    event.preventDefault();
    const cleanDraft = editingDraft.trim().slice(0, 180);
    if (!cleanDraft) return;
    onEditComment(goal.id, comment.id, cleanDraft);
    setEditingCommentId("");
    setEditingDraft("");
  };

  const menuItems = [
    { icon: Copy, label: t("community.copyLink"), onClick: () => onShare(goal) },
    ...(isOwner && onEditCaption
      ? [
          {
            icon: Edit3,
            label: t("community.editCaption"),
            onClick: () => onEditCaption(goal),
          },
        ]
      : []),
    ...(isOwner
      ? [
          {
            icon: Trash2,
            label: t("community.unshare"),
            onClick: () => onUnshare(goal),
            danger: true,
          },
        ]
      : []),
    // Denunciar e bloquear só fazem sentido no conteúdo dos outros.
    ...(!isOwner && onReport
      ? [
          {
            icon: Flag,
            label: t("community.report"),
            onClick: () => onReport(goal),
          },
        ]
      : []),
    ...(!isOwner && onBlock
      ? [
          {
            icon: UserX,
            label: t("community.block"),
            onClick: () => onBlock(goal),
            danger: true,
          },
        ]
      : []),
  ];

  // Card inteiro abre a publicação, como em qualquer feed — antes só a foto
  // abria, então post de texto não tinha onde clicar. Os controles internos
  // (curtir, comentar, menu, avatar, links) continuam mandando no próprio
  // clique; por isso o guarda do `closest`.
  const openable = Boolean(onOpenPost) && !isModal;
  const handleCardClick = (event) => {
    if (!openable) return;
    if (event.target.closest("button, a, input, textarea, select, iframe, [role='button']")) {
      return;
    }
    onOpenPost(goal.id);
  };

  return (
    <article
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (!openable || event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenPost(goal.id);
        }
      }}
      role={openable ? "link" : undefined}
      tabIndex={openable ? 0 : undefined}
      className={
        isModal
          ? "bg-[var(--engine-elevated)]"
          : `border-b border-[var(--engine-border)] bg-[var(--engine-surface)] transition-colors last:border-b-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-accent)]/40 sm:rounded-2xl sm:border ${
              openable ? "cursor-pointer hover:bg-[var(--engine-surface-2)]/40" : ""
            }`
      }
    >
      <header className="flex items-center gap-2.5 px-3 py-2.5 sm:px-4">
        <AvatarButton
          person={goal}
          size="sm"
          onClick={() => onOpenProfile(goal.ownerId, goal)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenProfile(goal.ownerId, goal)}
              className="-my-3 inline-flex min-h-11 min-w-0 items-center truncate text-left text-[13px] font-bold text-[var(--engine-text)] transition hover:text-[var(--engine-accent)] sm:my-0 sm:min-h-0"
            >
              {goal.author}
            </button>
            {goal.verified && (
              <ShieldCheck size={13} className="shrink-0 text-[var(--engine-accent)]" />
            )}
          </div>
          <p className="flex items-center gap-1.5 truncate text-[11px] font-medium text-[var(--engine-text-subtle)]">
            <span className="truncate">
              {goal.username}
              {goal.city ? ` · ${goal.city}` : ""}
            </span>
            {/* Post publicado a partir de um clube carrega a sigla dele: é
                assim que a crew aparece no feed geral (CLUBES-CONTRATO §2). */}
            <ClubTag tag={goal.clubTag} />
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Selo de curtidas do POST: só a faixa mais alta que ele bateu
              sozinho — 10K substitui 1K aqui, mas os dois continuam contando
              na aba de Conquistas do perfil (decisão da sessão de
              22/08/2026). Sem faixa batida, nada aparece. */}
          {postLikeTier && <AchievementBadge tier={postLikeTier} state="unlocked" />}

          {/* "Compartilhada / Privada" diz se o carro da GARAGEM está publicado.
              Num post livre não significa nada: ele nasce no feed, e o selo só
              aparecia como "privada" porque post nenhum entra em sharedGoalIds. */}
          {isOwner && !isFreePost ? (
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
              {shared ? t("community.shared") : t("community.privateDraft")}
            </span>
          ) : isOwner ? null : (
            !isFollowing && (
              <button
                type="button"
                onClick={() => onFollow(goal)}
                className="-my-3 inline-flex min-h-11 items-center rounded-full px-2 text-[11px] font-black uppercase tracking-wide text-[var(--engine-accent)] transition hover:brightness-110 sm:my-0 sm:min-h-0"
              >
                {t("community.follow")}
              </button>
            )
          )}
        </div>

        <PostMenu items={menuItems} label={t("community.postOptions")} />
      </header>

      {photos.length > 0 && (
        <PostGallery
          images={photos}
          alt={goal.title}
          t={t}
          onOpen={onOpenPost ? () => onOpenPost(goal.id) : undefined}
        />
      )}

      {goal.videoUrl && <PostVideo url={goal.videoUrl} t={t} />}

      {/* Post sem foto nem vídeo: o texto É o conteúdo, então vem antes dos
          botões. Deixar curtir e comentar acima de um card vazio fazia a ação
          aparecer antes de existir o que curtir. */}
      {textFirst && (
        <p className="whitespace-pre-line px-3 pt-1 text-sm leading-6 text-[var(--engine-text)] sm:px-4">
          {goal.note}
        </p>
      )}

      <div className="flex items-center gap-0.5 px-2 pt-1.5 sm:px-3">
        <ActionButton
          active={liked}
          title={t("community.like")}
          onClick={() => onLike(goal.id)}
          icon={<Heart size={20} fill={liked ? "currentColor" : "none"} />}
          count={likeCount}
          language={i18n.language}
        />
        <ActionButton
          title={t("community.commentsAction")}
          onClick={showComments}
          icon={<MessageCircle size={20} />}
          count={comments.length}
          language={i18n.language}
        />
        {onSendToChat && (
          <ActionButton
            title={t("messages.shareTitle")}
            onClick={() => onSendToChat(goal)}
            icon={<Send size={19} />}
          />
        )}
        {/* Avaliar por estrela é sobre a meta/veículo; num post de texto ou
            foto solta não há o que pontuar. A nota fica colada no controle,
            em vez de numa linha própria embaixo. */}
        {!isFreePost && (
          <div className="ml-auto flex items-center gap-1.5">
            {rating > 0 && (
              <span className="text-[13px] font-bold tabular-nums text-[var(--engine-text-muted)]">
                {rating.toFixed(1)}
              </span>
            )}
            <RatingControl
              value={rating}
              label={t("community.rate")}
              onRate={(value) => onRate(goal.id, value)}
            />
          </div>
        )}
      </div>

      {/* Ordem de leitura: primeiro o que a pessoa escreveu, depois o que o
          sistema sabe sobre o carro. Antes a legenda vinha por último, atrás
          de título, barra e selo — o conteúdo do autor era a última coisa. */}
      <div className="space-y-2 px-3 pb-3.5 pt-1.5 sm:px-4 sm:pb-4">
        {goal.note && !textFirst && (
          <p
            className={`text-sm leading-6 text-[var(--engine-text)] ${
              isModal ? "whitespace-pre-line" : "line-clamp-3"
            }`}
          >
            {goal.note}
          </p>
        )}

        {/* No modal o cabeçalho já anuncia o veículo. Post livre só mostra
            quando foi publicado a partir de um carro. */}
        {/* Mesmo gesto do CarCard: o nome do veiculo E a porta da ficha. Aqui
            o carro e de outra pessoa, entao a ficha abre so em leitura — a
            camada de fabrica sai de marca/modelo/ano, que ja sao publicos, e o
            que o dono declarou vem sempre etiquetado por `publicSpecSheet`. */}
        {(!isFreePost || goal.title) && (goal.brand || goal.model) && (
          <button
            type="button"
            onClick={() => setSpecsOpen(true)}
            aria-label={t("specSheet.cardAction")}
            className="group/specs -mx-1 flex max-w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left text-[13px] leading-5 text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)]"
          >
            <span className="min-w-0 truncate">
              <span className="font-bold italic text-[var(--engine-text)]">
                {isModal ? getVehicleTitle(goal) : getVehicleTitleShort(goal)}
              </span>
              {goal.year ? <span>{` · ${formatFipeYear(goal.year, t("car.zeroKm"))}`}</span> : null}
            </span>
            <ChevronRight
              size={14}
              aria-hidden="true"
              className="shrink-0 transition group-hover/specs:translate-x-0.5 group-hover/specs:text-[var(--engine-accent)]"
            />
          </button>
        )}

        {!isFreePost &&
          (isGoalCompleted(goal) ? (
            /* Meta batida: barra cheia, "100%" e selo diziam a mesma coisa
               três vezes. Fica só o selo. */
            <div className="flex items-center gap-2">
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--engine-accent-soft)] px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-[var(--engine-accent)]">
                <Trophy size={11} />
                {t("community.completed")}
              </span>
              <InfoTip text={t("community.privacyLine")} align="right" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-1.5 max-w-[220px] flex-1 overflow-hidden rounded-full bg-[var(--engine-surface-2)]">
                <span
                  className="block h-full rounded-full bg-[var(--engine-accent)] transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </span>
              <span className="shrink-0 text-[11px] font-black tabular-nums text-[var(--engine-accent)]">
                {progress.toFixed(0)}%
              </span>
              <InfoTip text={t("community.privacyLine")} align="right" />
            </div>
          ))}
      </div>

      {specsOpen && (
        <SpecSheetModal car={goal} onClose={() => setSpecsOpen(false)} />
      )}

      {commentsOpen && (
        <CommentsModal
          goal={goal}
          comments={comments}
          draft={draft}
          editingCommentId={editingCommentId}
          editingDraft={editingDraft}
          commentMenuId={commentMenuId}
          currentUserId={currentUserId}
          t={t}
          onClose={() => setCommentsOpen(false)}
          onDraftChange={setDraft}
          onSubmitComment={submitComment}
          onOpenProfile={onOpenProfile}
          onStartEditComment={startEditComment}
          onEditingDraftChange={setEditingDraft}
          onSubmitEditComment={submitEditComment}
          onCancelEdit={() => {
            setEditingCommentId("");
            setEditingDraft("");
          }}
          onDeleteComment={onDeleteComment}
          onReportComment={onReportComment}
          onCommentMenuChange={setCommentMenuId}
        />
      )}
    </article>
  );
}

/**
 * Lista de comentários + compositor. Vive dentro do modal de comentários
 * (feed) e também na coluna lateral do modal de publicação (desktop).
 */
function CommentsPanel({
  goal,
  comments,
  draft,
  editingCommentId,
  editingDraft,
  commentMenuId,
  currentUserId,
  composerRef,
  t,
  onDraftChange,
  onSubmitComment,
  onOpenProfile,
  onStartEditComment,
  onEditingDraftChange,
  onSubmitEditComment,
  onCancelEdit,
  onDeleteComment,
  onReportComment,
  onCommentMenuChange,
  inline = false,
}) {
  return (
    <>
      {/* Inline, a lista entra no fluxo da coluna que já rola: manter o
          overflow próprio criaria scroll dentro de scroll. */}
      <div
        className={
          inline
            ? "border-t border-[var(--engine-border)] px-4 py-4 sm:px-5"
            : "engine-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
        }
      >
        {comments.length ? (
          <div className="space-y-4">
            {comments.map((comment, index) => (
              <CommentRow
                key={`${goal.id}-comment-${comment.id || index}`}
                goal={goal}
                comment={comment}
                currentUserId={currentUserId}
                editingCommentId={editingCommentId}
                editingDraft={editingDraft}
                commentMenuId={commentMenuId}
                t={t}
                onOpenProfile={onOpenProfile}
                onStartEditComment={onStartEditComment}
                onEditingDraftChange={onEditingDraftChange}
                onSubmitEditComment={onSubmitEditComment}
                onCancelEdit={onCancelEdit}
                onDeleteComment={onDeleteComment}
                onReportComment={onReportComment}
                onCommentMenuChange={onCommentMenuChange}
              />
            ))}
          </div>
        ) : (
          <div
            className={`flex flex-col items-center justify-center text-center ${
              inline ? "py-6" : "h-full min-h-48"
            }`}
          >
            <MessageCircle className="mb-3 text-[var(--engine-text-subtle)]" size={30} />
            <p className="text-sm font-bold text-[var(--engine-text)]">
              {t("community.noComments")}
            </p>
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmitComment}
        className="flex shrink-0 gap-2 border-t border-[var(--engine-border)] p-3 sm:p-4"
      >
        <input
          ref={composerRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={t(
            goal?.kind === POST_KIND_POST
              ? "community.commentPlaceholderPost"
              : "community.commentPlaceholder",
          )}
          className="min-w-0 flex-1 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-3 text-sm font-medium text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)] sm:px-4"
        />
        <button
          type="submit"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] text-white transition hover:brightness-95"
          title={t("community.send")}
          aria-label={t("community.send")}
        >
          <Send size={18} />
        </button>
      </form>
    </>
  );
}

function CommentsModal({ goal, onClose, t, ...panelProps }) {
  return (
    <div className="engine-modal-overlay" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        className="engine-modal-panel engine-pop sm:max-w-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-accent)]">
              {t("community.commentsAction")}
            </p>
            <h2 className="mt-1 truncate text-base font-extrabold italic text-[var(--engine-text)]">
              {getVehicleTitle(goal)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
            title={t("common.cancel")}
            aria-label={t("common.cancel")}
          >
            <X size={20} />
          </button>
        </div>

        <CommentsPanel goal={goal} t={t} {...panelProps} />
      </section>
    </div>
  );
}

function CommentRow({
  goal,
  comment,
  currentUserId,
  editingCommentId,
  editingDraft,
  commentMenuId,
  t,
  onOpenProfile,
  onStartEditComment,
  onEditingDraftChange,
  onSubmitEditComment,
  onCancelEdit,
  onDeleteComment,
  onReportComment,
  onCommentMenuChange,
}) {
  const { i18n } = useTranslation();
  const commentText = typeof comment === "string" ? comment : comment.text;
  const commentTime =
    typeof comment === "string"
      ? ""
      : formatRelativeTime(comment.createdAt, i18n.language);
  const wasEdited = typeof comment !== "string" && Boolean(comment.editedAt);
  const commentAuthor =
    typeof comment === "string" ? t("community.member") : comment.author;
  const commentUsername = typeof comment === "string" ? "" : comment.username;
  const commentPerson =
    typeof comment === "string"
      ? { author: commentAuthor, username: commentUsername }
      : {
          author: commentAuthor,
          username: commentUsername,
          avatar: comment.avatar,
          avatarInitials: comment.avatarInitials,
          userId: comment.userId,
        };
  const canEdit =
    typeof comment !== "string" &&
    comment.id &&
    comment.userId === currentUserId;
  const canDelete =
    typeof comment !== "string" &&
    comment.id &&
    (comment.userId === currentUserId || goal.ownerId === currentUserId);
  // Comentário de outra pessoa: denunciar (o visitante vai para o login).
  const canReport =
    typeof comment !== "string" &&
    Boolean(comment.id) &&
    Boolean(onReportComment) &&
    comment.userId !== currentUserId;
  const isEditing = canEdit && editingCommentId === comment.id;

  return (
    <div className="group flex gap-3 rounded-xl px-1 py-1.5 text-sm transition hover:bg-[var(--engine-surface-2)] hover:bg-[var(--engine-surface-2)]">
      <AvatarButton
        person={commentPerson}
        size="sm"
        onClick={() => onOpenProfile(commentPerson.userId, commentPerson)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenProfile(commentPerson.userId, commentPerson)}
            className="min-w-0 truncate text-left text-xs font-bold text-[var(--engine-text-muted)] transition hover:text-[var(--engine-accent)] dark:text-white"
          >
            {commentAuthor} <span className="text-[var(--engine-text-subtle)]">{commentUsername}</span>
          </button>
          {(canEdit || canDelete || canReport) && !isEditing && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() =>
                  onCommentMenuChange((current) =>
                    current === comment.id ? "" : comment.id,
                  )
                }
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--engine-text-subtle)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] hover:bg-[var(--engine-surface-2)] dark:hover:text-white"
                title={t("socialFixes.commentOptions")}
                aria-label={t("socialFixes.commentOptions")}
              >
                <MoreHorizontal size={16} />
              </button>
              {commentMenuId === comment.id && (
                <div className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface)] py-1 shadow-xl  ">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        onStartEditComment(comment);
                        onCommentMenuChange("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]  hover:bg-[var(--engine-surface-2)]"
                    >
                      <Edit3 size={14} />
                      {t("socialFixes.editComment")}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteComment(goal.id, comment.id);
                        onCommentMenuChange("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]  hover:bg-[var(--engine-surface-2)]"
                    >
                      <Trash2 size={14} />
                      {t("common.delete")}
                    </button>
                  )}
                  {canReport && (
                    <button
                      type="button"
                      onClick={() => {
                        onReportComment(goal, comment);
                        onCommentMenuChange("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
                    >
                      <Flag size={14} />
                      {t("socialFixes.reportComment")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {isEditing ? (
          <form
            onSubmit={(event) => onSubmitEditComment(event, comment)}
            className="mt-2 grid gap-2"
          >
            <input
              value={editingDraft}
              onChange={(event) => onEditingDraftChange(event.target.value)}
              className="min-h-10 rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-sm font-semibold text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)]   dark:text-white"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-lg bg-[var(--engine-accent)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white"
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-lg border border-[var(--engine-border)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-muted)] "
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="font-medium text-[var(--engine-text-muted)] ">
              {commentText}
            </p>
            {(commentTime || wasEdited) && (
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                {commentTime}
                {commentTime && wasEdited ? " · " : ""}
                {wasEdited ? t("community.edited") : ""}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ icon, value, label }) {
  const IconComponent = icon;

  return (
    <div className="rounded-xl bg-[var(--engine-surface-2)] p-3 ">
      <IconComponent size={18} className="mb-2 text-[var(--engine-accent)]" />
      <p className="text-lg font-black text-[var(--engine-text)] dark:text-white">{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
        {label}
      </p>
    </div>
  );
}

/**
 * Contagem ao lado do ícone, encurtada em números grandes (1,2 mil / 1.2K
 * conforme o idioma) para o botão não esticar e quebrar a linha de ações.
 */
const formatCount = (value, language) => {
  const count = Number(value) || 0;
  if (count < 1000) return String(count);
  return new Intl.NumberFormat(language, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
};

function ActionButton({ active = false, title, icon, onClick, count = 0, language }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center gap-1.5 rounded-full px-2 transition-colors sm:h-9 ${
        active
          ? "text-[var(--engine-accent)]"
          : "text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
      }`}
      title={title}
      aria-label={title}
    >
      {icon}
      {count > 0 && (
        <span className="text-[13px] font-bold tabular-nums">
          {formatCount(count, language)}
        </span>
      )}
    </button>
  );
}

function VideoCard({ video, t, saved, liked, onSave, onLike }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] shadow-xl   dark:shadow-none">
      <div className="relative bg-black">
        <video
          controls
          preload="metadata"
          poster={video.poster}
          className="aspect-[9/14] max-h-[680px] w-full bg-black object-cover"
        >
          <source src={video.src} />
        </video>
        <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur">
          <Play size={13} />
          {t("community.videoShort")}
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--engine-accent)]">
            {video.username}
          </p>
          <h2 className="mt-1 text-2xl font-black italic text-[var(--engine-text)] dark:text-white">
            {t(video.titleKey)}
          </h2>
          <p className="mt-2 text-sm font-medium text-[var(--engine-text-muted)] ">
            {t(video.captionKey)}
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--engine-border)] pt-4 ">
          <button
            type="button"
            onClick={() => onLike(video.id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition ${
              liked
                ? "bg-[var(--engine-accent)] text-white"
                : "bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)] "
            }`}
          >
            <Heart size={16} fill={liked ? "currentColor" : "none"} />
            {video.likes + (liked ? 1 : 0)}
          </button>
          <button
            type="button"
            onClick={() => onSave(video.id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition ${
              saved
                ? "bg-[var(--engine-accent)] text-white "
                : "bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)] "
            }`}
          >
            <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
            {saved ? t("community.saved") : t("community.save")}
          </button>
        </div>
      </div>
    </article>
  );
}

function ShareModal({
  goals,
  sharedGoalIds,
  notesByCarId = {},
  userId,
  t,
  onClose,
  onShare,
  onUnshare,
  onClearAll,
}) {
  const [composingId, setComposingId] = useState("");
  const [caption, setCaption] = useState("");

  const startComposing = (goal, currentNote) => {
    setComposingId((current) => (current === goal.id ? "" : goal.id));
    setCaption(currentNote || "");
  };

  return (
    <div className="engine-modal-overlay">
      <div className="engine-modal-panel engine-pop sm:max-w-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] p-4 sm:p-6">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">
              {t("community.shareModalTitle")}
            </h2>
            <p className="mt-2 text-sm font-medium text-[var(--engine-text-muted)] ">
              {t("community.shareModalCopy")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)] "
            title={t("common.cancel")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="engine-modal-body engine-scroll engine-safe-bottom space-y-3 p-4 sm:p-6">
          {goals.map((goal) => {
            const shared = isGoalShared(goal, sharedGoalIds, userId);
            const publishedNote = notesByCarId[String(goal.carId || goal.id)] || "";
            const composing = composingId === goal.id;

            return (
              <div
                key={goal.id}
                className="rounded-xl border border-[var(--engine-border)] p-3 transition hover:border-[var(--engine-accent)]"
              >
                <div className="flex w-full items-center gap-3">
                  <button
                    type="button"
                    onClick={() => startComposing(goal, publishedNote)}
                    className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  >
                    {/* A capa entra no fallback: carro com foto única não tem
                        `images`, e sem isso a lista inteira caía na imagem
                        genérica. */}
                    <img
                      src={goal.images?.[0] || goal.image || fallbackImage}
                      alt={goal.title}
                      className="h-16 w-20 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black italic text-[var(--engine-text)] dark:text-white">
                        {goal.title}
                      </p>
                      <p className="text-xs font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                        {getProgress(goal).toFixed(1)}%
                        {shared ? ` / ${t("community.shared")}` : ""}
                      </p>
                      {shared && publishedNote && !composing && (
                        <p className="mt-1 truncate text-xs font-medium text-[var(--engine-text-muted)]">
                          {publishedNote}
                        </p>
                      )}
                    </div>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        shared
                          ? "bg-[var(--engine-accent)] text-white"
                          : "bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)]"
                      }`}
                      title={shared ? t("community.editCaption") : t("community.publishGoal")}
                    >
                      {shared ? <Check size={17} /> : <Share2 size={17} />}
                    </span>
                  </button>
                  {shared && (
                    <button
                      type="button"
                      onClick={() => onUnshare(goal)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-accent)] hover:text-white "
                      title={t("community.unshare")}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {/* Legenda da publicação: escrita aqui, na hora de publicar
                    (ou editada depois), em vez de herdar a bio do perfil. */}
                {composing && (
                  <div className="mt-3 border-t border-[var(--engine-border)] pt-3">
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-text-subtle)]">
                      {t("community.captionLabel")}
                    </label>
                    <textarea
                      value={caption}
                      rows={3}
                      maxLength={280}
                      autoFocus
                      onChange={(event) => setCaption(event.target.value)}
                      placeholder={t("community.captionPlaceholder")}
                      className="engine-scroll w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2.5 text-sm font-medium text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
                    />
                    {/* Na garagem a foto é opcional; no feed, não: um post de
                        carro sem foto não diz nada a quem está rolando. */}
                    {!(goal.images?.length || goal.image) && (
                      <p className="mt-2 text-[11px] font-semibold text-[var(--engine-accent)]">
                        {t("community.photoNeededToShare")}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!(goal.images?.length || goal.image)}
                        onClick={() => {
                          onShare(goal, caption);
                          setComposingId("");
                        }}
                        className="rounded-full bg-[var(--engine-accent)] px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {shared ? t("common.save") : t("community.publishGoal")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setComposingId("")}
                        className="rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:text-[var(--engine-text)]"
                      >
                        {t("common.cancel")}
                      </button>
                      <span className="ml-auto text-[11px] font-semibold text-[var(--engine-text-subtle)]">
                        {caption.length}/280
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!goals.length && (
            <div className="rounded-xl border border-dashed border-[var(--engine-border)] p-8 text-center ">
              <Car className="mx-auto mb-3 text-[var(--engine-accent)]" size={34} />
              <p className="font-medium text-[var(--engine-text-muted)]">
                {t("community.noPersonalGoals")}
              </p>
            </div>
          )}
        </div>

        {/* Ação destrutiva mora aqui dentro: no feed ela era um botão
            permanente, do tamanho do de publicar. */}
        {onClearAll && goals.length > 0 && (
          <div className="engine-safe-bottom shrink-0 border-t border-[var(--engine-border)] px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={onClearAll}
              className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)] transition hover:text-[var(--engine-accent)]"
            >
              <Trash2 size={14} />
              {t("community.clearPublished")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UserProfileModal({
  profile,
  loading,
  isFollowing = false,
  t,
  currentUserId,
  onClose,
  onOpenGoal,
  onMessage,
  onFollow,
}) {
  const canMessage =
    Boolean(onMessage) &&
    Boolean(profile?.userId) &&
    profile.userId !== currentUserId;
  const canFollow =
    Boolean(onFollow) &&
    Boolean(profile?.userId) &&
    profile.userId !== currentUserId;
  const goals = profile?.goals || [];
  const stats = getProfileStats(profile);
  // Contagem reativa: o snapshot do backend (isFollowedByMe) é o ponto de
  // partida e o toggle local ajusta na hora, sem esperar um refetch.
  const followersDisplay = Math.max(
    0,
    (profile?.followersCount || 0) +
      (isFollowing ? 1 : 0) -
      (profile?.isFollowedByMe ? 1 : 0),
  );

  return (
    <div className="engine-modal-overlay">
      <div className="engine-modal-panel engine-pop sm:max-w-3xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--engine-accent)] text-lg font-black italic text-white sm:h-16 sm:w-16 sm:text-xl">
              {isImageUrl(profile?.avatar) ? (
                <img src={profile.avatar} alt={profile.author} className="h-full w-full object-cover" />
              ) : (
                profile?.avatarInitials || profile?.avatar || getInitials(profile?.author)
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--engine-accent)]">
                {t("community.profileTitle")}
              </p>
              {/* O nome que o feed já conhecia entra na hora: só cai no
                  "carregando" quando não temos nem isso. */}
              <h2 className="truncate text-xl font-extrabold italic text-[var(--engine-text)] dark:text-white sm:text-2xl">
                {profile?.author || (loading ? t("common.loading") : "Usuário Engine")}
              </h2>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium text-[var(--engine-text-subtle)] sm:text-sm">
                <span className="inline-flex items-center gap-1">
                  <AtSign size={14} />
                  {withoutAt(profile?.username) || "engine"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin size={14} />
                  {profile?.city || "Engine Garage"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canFollow && (
              <button
                type="button"
                onClick={() => onFollow(profile)}
                title={isFollowing ? t("community.following") : t("community.follow")}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[10px] font-black uppercase tracking-widest transition ${
                  isFollowing
                    ? "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                    : "bg-[var(--engine-accent)] text-white hover:brightness-95"
                }`}
              >
                {isFollowing ? <UserCheck size={15} /> : <UserPlus size={15} />}
                <span className="hidden sm:inline">
                  {isFollowing ? t("community.following") : t("community.follow")}
                </span>
              </button>
            )}
            {canMessage && (
              <button
                type="button"
                onClick={() => onMessage(profile)}
                title={t("messages.messageAction")}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--engine-accent)] px-3.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:brightness-95"
              >
                <MessageCircle size={15} />
                <span className="hidden sm:inline">{t("messages.messageAction")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)] "
              title={t("common.cancel")}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="engine-modal-body engine-scroll engine-safe-bottom space-y-5 p-4 sm:p-5">
          {profile?.note && (
            <p className="rounded-xl bg-[var(--engine-surface-2)] p-4 text-sm font-medium leading-6 text-[var(--engine-text-muted)]  ">
              {profile.note}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric icon={Users} label={t("community.profileStats.followers")} value={followersDisplay} />
            <Metric icon={Car} label={t("community.profileStats.goals")} value={stats.goalsCount} />
            <Metric icon={Heart} label={t("community.profileStats.likes")} value={stats.likesCount} />
            <Metric icon={Award} label={t("community.profileStats.avg")} value={`${Number(stats.averageProgress || 0).toFixed(0)}%`} />
          </div>

          {/* Followers and Following sections */}
          <div className="grid grid-cols-2 gap-4 border-t border-[var(--engine-border)] pt-4">
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
                Seguidores
              </h4>
              <div className="space-y-2">
                {profile?.followers && profile.followers.length > 0 ? (
                  profile.followers.slice(0, 5).map((follower) => (
                    <div
                      key={follower.id}
                      className="rounded-lg border border-[var(--engine-border)] p-2 text-sm text-[var(--engine-text)]"
                    >
                      {follower.author || "Usuário"}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[var(--engine-text-muted)]">Sem seguidores</p>
                )}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
                Seguindo
              </h4>
              <div className="space-y-2">
                {profile?.following && profile.following.length > 0 ? (
                  profile.following.slice(0, 5).map((following) => (
                    <div
                      key={following.id}
                      className="rounded-lg border border-[var(--engine-border)] p-2 text-sm text-[var(--engine-text)]"
                    >
                      {following.author || "Usuário"}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[var(--engine-text-muted)]">Não segue ninguém</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--engine-text)] dark:text-white">
              {t("community.profileGoals")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {goals.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => onOpenGoal(goal.id)}
                  className="flex items-center gap-3 rounded-xl border border-[var(--engine-border)] p-3 text-left transition hover:border-[var(--engine-accent)] "
                >
                  <img
                    src={goal.images?.[0] || fallbackImage}
                    alt={goal.title}
                    className="h-16 w-20 rounded-lg object-cover"
                    onError={(event) => {
                      event.currentTarget.src = fallbackImage;
                    }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black italic text-[var(--engine-text)] dark:text-white">
                      {goal.title}
                    </p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                      {getProgress(goal).toFixed(0)}% / {goal.likes} likes
                    </p>
                  </div>
                </button>
              ))}
              {!loading && !goals.length && (
                <p className="rounded-xl border border-dashed border-[var(--engine-border)] p-5 text-center text-sm font-medium text-[var(--engine-text-subtle)] ">
                  {t("community.profileEmpty")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Busca de pessoas (aba de usuários). Diretório de todos os perfis públicos
 * do Engine: buscar por nome/@, seguir/deixar de seguir na hora e tocar para
 * abrir o perfil (onde dá pra mandar DM).
 */
function PeopleSearchModal({
  people,
  query,
  onQueryChange,
  following,
  t,
  onFollow,
  onOpenProfile,
  onClose,
}) {
  const term = query.trim().toLowerCase();
  const results = term
    ? people.filter((person) =>
        `${person.author || ""} ${withoutAt(person.username) || ""} ${person.city || ""}`
          .toLowerCase()
          .includes(term),
      )
    : people;

  return (
    <div className="engine-modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="engine-modal-panel engine-pop sm:max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-accent)]">
              {t("community.findPeople")}
            </p>
            <h2 className="mt-1 truncate text-base font-extrabold italic text-[var(--engine-text)]">
              {t("community.peopleTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={20} />
          </button>
        </header>

        <div className="shrink-0 border-b border-[var(--engine-border)] p-3 sm:p-4">
          <label className="flex h-11 items-center gap-2.5 rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 focus-within:border-[var(--engine-accent)]">
            <Search size={16} className="shrink-0 text-[var(--engine-text-subtle)]" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("community.peopleSearchPlaceholder")}
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--engine-text)] outline-none"
            />
          </label>
        </div>

        <div className="engine-modal-body engine-scroll engine-safe-bottom p-2 sm:p-3">
          {results.length ? (
            <div className="space-y-0.5">
              {results.map((person) => {
                const isFollowing = following.includes(person.userId);
                return (
                  <div
                    key={person.userId}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--engine-surface-2)]"
                  >
                    <AvatarButton
                      person={person}
                      size="sm"
                      onClick={() => onOpenProfile(person.userId, person)}
                    />
                    <button
                      type="button"
                      onClick={() => onOpenProfile(person.userId, person)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-bold text-[var(--engine-text)]">
                        {person.author || "Usuário Engine"}
                      </p>
                      <p className="truncate text-xs font-medium text-[var(--engine-text-subtle)]">
                        @{withoutAt(person.username) || "engine"}
                        {person.city ? ` · ${person.city}` : ""}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onFollow(person)}
                      title={isFollowing ? t("community.following") : t("community.follow")}
                      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[10px] font-black uppercase tracking-widest transition ${
                        isFollowing
                          ? "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                          : "bg-[var(--engine-accent)] text-white hover:brightness-95"
                      }`}
                    >
                      {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
                      <span className="hidden min-[380px]:inline">
                        {isFollowing ? t("community.following") : t("community.follow")}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
              <Users className="mb-3 text-[var(--engine-text-subtle)]" size={30} />
              <p className="text-sm font-bold text-[var(--engine-text)]">
                {t("community.peopleEmpty")}
              </p>
              <p className="mt-1 max-w-xs text-xs font-medium text-[var(--engine-text-muted)]">
                {t("community.peopleEmptyHint")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Editor da legenda de uma publicação já no ar. */
function CaptionModal({ goal, t, onClose, onSave }) {
  const [caption, setCaption] = useState(goal?.note || "");

  return (
    <div className="engine-modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="engine-modal-panel engine-pop sm:max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-accent)]">
              {t("community.captionTitle")}
            </p>
            <p className="mt-1 truncate text-sm font-bold text-[var(--engine-text)]">
              {goal.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={20} />
          </button>
        </header>

        <div className="engine-modal-body engine-scroll p-4">
          <textarea
            value={caption}
            rows={5}
            maxLength={280}
            autoFocus
            onChange={(event) => setCaption(event.target.value)}
            placeholder={t("community.captionPlaceholder")}
            className="engine-scroll w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2.5 text-sm font-medium text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
          />
          <p className="mt-2 text-right text-[11px] font-semibold text-[var(--engine-text-subtle)]">
            {caption.length}/280
          </p>
        </div>

        <div className="engine-safe-bottom flex shrink-0 items-center gap-2 border-t border-[var(--engine-border)] p-3">
          <button
            type="button"
            onClick={() => onSave(goal, caption)}
            className="rounded-full bg-[var(--engine-accent)] px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-white transition hover:brightness-95"
          >
            {t("common.save")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-2.5 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:text-[var(--engine-text)]"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Publicação individual.
 *
 * Todo post agora tem endereço próprio (`/community?goal=<id>`): é o que as
 * notificações e o link de compartilhar abrem, em vez de só filtrar o feed.
 */
function PostModal({ goal, loading, openComments, t, onClose, cardProps }) {
  // No desktop os comentários ficam numa coluna ao lado do post (padrão do
  // lightbox das redes). No celular não há espaço "ao lado", então o balão
  // continua abrindo a folha de comentários.
  const isWide = useMediaQuery("(min-width: 1024px)");
  // A coluna lateral de comentários só se justifica quando há mídia ocupando a
  // esquerda. Num post de texto ela deixava metade do modal vazia, com um
  // "sem comentários" gigante ao lado de duas linhas de conteúdo.
  const hasMedia = Boolean(goal?.images?.length || goal?.image || goal?.videoUrl);
  const sideBySide = isWide && hasMedia;
  const [draft, setDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState("");
  const [editingDraft, setEditingDraft] = useState("");
  const [commentMenuId, setCommentMenuId] = useState("");
  const composerRef = useRef(null);

  const comments = goal?.comments || [];

  // Quem chega por notificação de comentário (`?comments=1`) cai no compositor
  // já focado. Antes esse parâmetro abria a folha de comentários; agora a
  // lista está sempre visível, então o que resta é levar a pessoa até ela.
  useEffect(() => {
    if (!openComments || !goal) return;
    composerRef.current?.focus({ preventScroll: false });
  }, [openComments, goal]);

  const submitComment = (event) => {
    event.preventDefault();
    const cleanDraft = draft.trim().slice(0, 180);
    if (!cleanDraft || !goal) return;
    cardProps.onComment(goal.id, cleanDraft);
    setDraft("");
  };

  const startEditComment = (comment) => {
    setEditingCommentId(comment.id);
    setEditingDraft(comment.text || "");
  };

  const submitEditComment = (event, comment) => {
    event.preventDefault();
    const cleanDraft = editingDraft.trim().slice(0, 180);
    if (!cleanDraft) return;
    cardProps.onEditComment(goal.id, comment.id, cleanDraft);
    setEditingCommentId("");
    setEditingDraft("");
  };

  const cancelEdit = () => {
    setEditingCommentId("");
    setEditingDraft("");
  };

  return (
    <div className="engine-modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("community.postTitle")}
        className={`engine-modal-panel engine-pop ${sideBySide ? "sm:max-w-5xl" : "sm:max-w-2xl"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-accent)]">
              {t("community.postTitle")}
            </p>
            {/* Post sem carro não tem veículo pra anunciar: getVehicleTitle
                caía no rótulo genérico "Meta", que é justamente o que ele não
                é. Nesse caso o cabeçalho identifica pelo autor. */}
            <h2 className="mt-1 truncate text-base font-extrabold italic text-[var(--engine-text)] dark:text-white">
              {!goal
                ? t("common.loading")
                : goal.kind === POST_KIND_POST && !goal.title
                  ? goal.author
                  : getVehicleTitle(goal)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t("common.cancel")}
            aria-label={t("common.cancel")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={20} />
          </button>
        </header>

        {goal ? (
          <div className="flex min-h-0 flex-1 lg:flex-row">
            <div className="engine-scroll engine-safe-bottom min-h-0 min-w-0 flex-1 overflow-y-auto lg:border-r lg:border-[var(--engine-border)]">
              <GoalCard
                {...cardProps}
                goal={goal}
                t={t}
                variant="modal"
                // O balão nunca abre outra folha por cima: a lista já está
                // logo abaixo (coluna única) ou ao lado (desktop com mídia).
                initialCommentsOpen={false}
                onCommentClick={() => composerRef.current?.focus()}
              />

              {/* Comentários abrem junto com a publicação, no fluxo da mesma
                  rolagem — antes era preciso tocar no balão e abrir um segundo
                  modal empilhado sobre o primeiro. */}
              {!sideBySide && (
                <CommentsPanel
                  inline
                  goal={goal}
                  comments={comments}
                  draft={draft}
                  editingCommentId={editingCommentId}
                  editingDraft={editingDraft}
                  commentMenuId={commentMenuId}
                  currentUserId={cardProps.currentUserId}
                  composerRef={composerRef}
                  t={t}
                  onDraftChange={setDraft}
                  onSubmitComment={submitComment}
                  onOpenProfile={cardProps.onOpenProfile}
                  onStartEditComment={startEditComment}
                  onEditingDraftChange={setEditingDraft}
                  onSubmitEditComment={submitEditComment}
                  onCancelEdit={cancelEdit}
                  onDeleteComment={cardProps.onDeleteComment}
                  onReportComment={cardProps.onReportComment}
                  onCommentMenuChange={setCommentMenuId}
                />
              )}
            </div>

            {sideBySide && (
              <div className="flex min-h-0 w-[360px] shrink-0 flex-col">
                <CommentsPanel
                  goal={goal}
                  comments={comments}
                  draft={draft}
                  editingCommentId={editingCommentId}
                  editingDraft={editingDraft}
                  commentMenuId={commentMenuId}
                  currentUserId={cardProps.currentUserId}
                  composerRef={composerRef}
                  t={t}
                  onDraftChange={setDraft}
                  onSubmitComment={submitComment}
                  onOpenProfile={cardProps.onOpenProfile}
                  onStartEditComment={startEditComment}
                  onEditingDraftChange={setEditingDraft}
                  onSubmitEditComment={submitEditComment}
                  onCancelEdit={cancelEdit}
                  onDeleteComment={cardProps.onDeleteComment}
                  onReportComment={cardProps.onReportComment}
                  onCommentMenuChange={setCommentMenuId}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="px-4 py-16 text-center text-sm font-semibold text-[var(--engine-text-muted)]">
            {loading ? t("common.loading") : t("community.postMissing")}
          </p>
        )}
      </div>
    </div>
  );
}

export function Community({ cars = [], settings, user }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const { region, setRegion } = useRegion();
  // No celular o card do feed já mostra o post inteiro; abrir um modal por
  // cima é redundante. A publicação em tela cheia fica reservada ao
  // redirecionamento (perfil, notificação, link) — que vale nos dois casos.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Casa com o `xl:` da grade: é a partir daí que o trilho lateral entra na
  // tela, e com ele o "Top da semana".
  const hasRail = useMediaQuery("(min-width: 1280px)");
  const [searchParams, setSearchParams] = useSearchParams();
  // `?tab=` aceita as abas de primeiro nível e também as sub-abas do feed.
  // Até 25/09/2026, `?tab=feed` (que o "Postar no mural" do clube gera)
  // destacava a aba FEED e não renderizava nada: o corpo só aparecia com
  // `tab === "goals"`. Valor desconhecido também cai no feed em vez de numa
  // página vazia.
  const rawTab = searchParams.get("tab") || "goals";
  const topLevelTab = ["clubes", "eventos"].includes(rawTab) ? rawTab : "goals";
  const composeClubId = searchParams.get("compose") ? searchParams.get("club") || "" : "";
  const [activeSubTab, setActiveSubTab] = useState(() =>
    GOALS_SUBTABS.includes(rawTab) ? rawTab : "feed",
  );
  const [query, setQuery] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [remoteGoal, setRemoteGoal] = useState(null);
  const [postToShare, setPostToShare] = useState(null);
  const [captionGoal, setCaptionGoal] = useState(null);
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const handledProfileId = useRef("");
  const [communityState, setCommunityState] = useState(
    engineDB.getDefaultCommunityState(),
  );
  const [communityGoals, setCommunityGoals] = useState([]);
  const [hasMoreGoals, setHasMoreGoals] = useState(false);
  const [loadingMoreGoals, setLoadingMoreGoals] = useState(false);
  const [publicProfiles, setPublicProfiles] = useState({});
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  // Publicar no mural de um clube: a página do clube manda pra cá com
  // `?club=<id>&compose=1`, e o post nasce carimbado. O clube é buscado
  // pelo id em vez de vir na URL porque sigla é identidade — vinda de
  // parâmetro, qualquer um exibiria a sigla alheia no próprio post (a
  // regra do Firestore barra a gravação, mas só depois de a tela já ter
  // mentido).
  const [composeClub, setComposeClub] = useState(null);

  const limparParametrosDeComposicao = () => {
    const params = new URLSearchParams(searchParams);
    if (!params.has("compose") && !params.has("club")) return;
    params.delete("compose");
    params.delete("club");
    setSearchParams(params, { replace: true });
  };
  const [searchOpen, setSearchOpen] = useState(false);
  const [peopleModalOpen, setPeopleModalOpen] = useState(false);
  const [profileModal, setProfileModal] = useState({
    open: false,
    loading: false,
    profile: null,
  });

  const personalGoals = useMemo(
    () => buildUserGoals(cars, settings, user),
    [cars, settings, user],
  );

  const profiles = useMemo(
    () => ({
      ...publicProfiles,
      ...(user?.uid ? { [user.uid]: profileFromSettings(settings, user) } : {}),
    }),
    [publicProfiles, settings, user],
  );

  // Diretório de pessoas para a aba "Pessoas": todos os perfis públicos
  // (o mapa vem duplicado por doc id + userId, então deduplicamos), sem eu
  // mesmo, em ordem alfabética.
  const foundPeople = useProfileSearch(peopleQuery, { enabled: peopleModalOpen, max: 30 });
  const peopleDirectory = useMemo(() => {
    const map = new Map();
    foundPeople.forEach((profile) => {
      const id = profile.userId || profile.id;
      if (!id || id === user?.uid || map.has(id)) return;
      map.set(id, { ...profile, userId: id });
    });
    return Array.from(map.values()).sort((a, b) =>
      String(a.author || "").localeCompare(String(b.author || "")),
    );
  }, [foundPeople, user?.uid]);

  // Legenda já publicada de cada carro — o modal de publicar usa para
  // pré-preencher a edição.
  const myPublishedNotes = useMemo(() => {
    const notes = {};
    communityGoals.forEach((goal) => {
      if (goal.ownerId === user?.uid && goal.carId) {
        notes[String(goal.carId)] = goal.note || "";
      }
    });
    return notes;
  }, [communityGoals, user?.uid]);

  const carsById = useMemo(
    () => new Map(cars.map((car) => [String(car.id), car])),
    [cars],
  );

  const blockedSet = useMemo(() => new Set(blockedUserIds), [blockedUserIds]);

  const goals = useMemo(
    () =>
      communityGoals
        // Bloquear some com a publicação e também com os comentários da
        // pessoa nos posts dos outros — meia-medida não é bloqueio.
        .filter((goal) => !blockedSet.has(goal.ownerId))
        .map((goal) => ({
          ...goal,
          comments: (goal.comments || []).filter(
            (comment) => !blockedSet.has(comment.userId),
          ),
        }))
        .map((goal) => {
          const currentCar =
            goal.ownerId === user?.uid ? carsById.get(String(goal.carId)) : null;
          const mergedGoal =
            currentCar?.model
              ? {
                  ...goal,
                  title: `${currentCar.brand} ${currentCar.model}`.trim(),
                  brand: currentCar.brand || goal.brand,
                  model: currentCar.model || goal.model,
                  year: currentCar.year || goal.year,
                  image: currentCar.image || goal.image,
                  savedValue: currentCar.savedValue ?? goal.savedValue,
                  targetValue: currentCar.targetValue ?? goal.targetValue,
                }
              : goal;

          return enrichGoalProfiles(mergedGoal, profiles);
        }),
    [blockedSet, carsById, communityGoals, profiles, user?.uid],
  );

  useEffect(() => {
    let alive = true;

    engineDB
      .getCommunityState()
      .then((state) => {
        if (alive) setCommunityState(state);
      })
      .catch((error) => console.error(error));

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = engineDB.subscribeCommunityGoals((goals, meta) => {
      setCommunityGoals(goals);
      setHasMoreGoals(Boolean(meta?.hasMore));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let alive = true;

    engineDB
      .getBlockedUsers(user?.uid)
      .then((ids) => {
        if (alive) setBlockedUserIds(ids);
      })
      .catch((error) => console.error(error));

    return () => {
      alive = false;
    };
  }, [user?.uid]);

  const handleLoadMoreGoals = async () => {
    if (loadingMoreGoals || !hasMoreGoals) return;
    setLoadingMoreGoals(true);
    try {
      const { goals: moreGoals, hasMore } = await engineDB.loadMoreCommunityGoals();
      setCommunityGoals((current) => {
        const existingIds = new Set(current.map((goal) => goal.id));
        return [...current, ...moreGoals.filter((goal) => !existingIds.has(goal.id))];
      });
      setHasMoreGoals(hasMore);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMoreGoals(false);
    }
  };

  // Autores dos posts e dos comentários que ESTÃO na tela — e só eles. Até
  // 25/09/2026 isto era uma escuta da coleção inteira de perfis (megabytes
  // por abertura, a cota do Firebase acabando com poucas centenas de
  // usuários). O post já nasce com nome e foto do autor; aqui só se
  // atualiza o retrato de quem mudou depois.
  const authorIdsKey = useMemo(() => {
    const ids = new Set();
    communityGoals.forEach((goal) => {
      if (goal.ownerId) ids.add(goal.ownerId);
      (goal.comments || []).forEach((comment) => {
        if (comment && typeof comment === "object" && comment.userId) ids.add(comment.userId);
      });
    });
    return [...ids].sort().join(",");
  }, [communityGoals]);

  useEffect(() => {
    if (!authorIdsKey) return undefined;
    let vivo = true;
    engineDB.getPublicProfilesByIds(authorIdsKey.split(",")).then((found) => {
      if (vivo) setPublicProfiles((current) => ({ ...current, ...found }));
    });
    return () => {
      vivo = false;
    };
  }, [authorIdsKey]);

  const openPostId = searchParams.get("goal") || "";
  const openProfileId = searchParams.get("user") || "";
  const openWithComments = searchParams.get("comments") === "1";

  const feedGoal = useMemo(
    () => goals.find((item) => item.id === openPostId) || null,
    [goals, openPostId],
  );

  // Se a publicação não veio na página carregada do feed (link direto ou
  // notificação antiga), acompanhamos o documento dela sozinho.
  useEffect(() => {
    if (!openPostId || feedGoal) return undefined;

    return engineDB.subscribeCommunityGoal(openPostId, (goal) =>
      setRemoteGoal({ id: openPostId, goal }),
    );
  }, [feedGoal, openPostId]);

  const loadedRemoteGoal = remoteGoal?.id === openPostId ? remoteGoal.goal : null;
  const remoteGoalLoading =
    Boolean(openPostId) && !feedGoal && remoteGoal?.id !== openPostId;

  const postModalGoal = useMemo(() => {
    if (feedGoal) return feedGoal;
    return loadedRemoteGoal ? enrichGoalProfiles(loadedRemoteGoal, profiles) : null;
  }, [feedGoal, loadedRemoteGoal, profiles]);

  const closeParamModal = (key) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    if (key === "goal") next.delete("comments");
    setSearchParams(next, { replace: true });
  };

  const openPost = (goalId) => {
    const next = new URLSearchParams(searchParams);
    next.set("goal", goalId);
    next.delete("comments");
    setSearchParams(next);
  };

  /**
   * Abrir publicação: modal no desktop, onde o feed continua atrás e a volta é
   * imediata; página no celular, onde modal empilhado atrapalha e o botão
   * "voltar" do aparelho precisa funcionar.
   *
   * Antes o mobile não abria de jeito nenhum — `onOpenPost` só era passado no
   * desktop, então tocar num post não fazia nada.
   */
  const openPostAnywhere = (goalId) => {
    if (isDesktop) {
      openPost(goalId);
      return;
    }
    navigate(`/post/${goalId}`);
  };

  const persistState = async (updater) => {
    setCommunityState((current) => {
      const next = updater(current);
      engineDB.saveCommunityState(next).catch((error) => console.error(error));
      return next;
    });
  };

  const flash = (message, tone) => toast(message, tone ? { tone } : undefined);
  const requireAccount = useRequireAccount(user);
  const { openReport, reportDialog } = useSocialReport();

  // A busca do feed alcança também o texto do post, que num post livre é o
  // conteúdo — procurar só por autor e veículo deixaria ele inalcançável.
  const searchedGoals = goals.filter((goal) =>
    `${goal.author} ${goal.title} ${goal.username} ${goal.note}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  // Filtro por região ativa, com proteção anti-tela-vazia: se filtrar zeraria
  // o feed, mostra tudo e sinaliza (regionWidened) para avisar o usuário.
  const { items: filteredGoals, widened: regionWidened } = applyRegionFilter(
    searchedGoals,
    region,
    (goal) => ({ country: goal.country, state: goal.state, city: goal.city }),
  );

  // O ranking é de metas: post livre não tem progresso e entraria sempre no
  // fim, empurrando meta de gente que está de fato poupando.
  const ranking = goals
    .filter((goal) => goal.kind !== POST_KIND_POST)
    .sort((a, b) => {
      const aInteractions = communityState.interactions[a.id] || emptyInteraction;
      const bInteractions = communityState.interactions[b.id] || emptyInteraction;
      const likesA = Number(a.likes) + (aInteractions.liked ? 1 : 0);
      const likesB = Number(b.likes) + (bInteractions.liked ? 1 : 0);
      if (likesB !== likesA) return likesB - likesA;

      const ratingA = aInteractions.rating || a.rating;
      const ratingB = bInteractions.rating || b.rating;
      if (ratingB !== ratingA) return ratingB - ratingA;

      return getProgress(b) - getProgress(a);
    })
    .slice(0, 5);

  const stats = goals.reduce(
    (acc, goal) => {
      acc.progress += getProgress(goal);
      acc.likes += goal.likes;
      return acc;
    },
    { progress: 0, likes: 0 },
  );

  const averageProgress = goals.length ? stats.progress / goals.length : 0;

  const updateInteraction = (goalId, updater) => {
    persistState((current) => {
      const previous = current.interactions[goalId] || emptyInteraction;
      return {
        ...current,
        interactions: {
          ...current.interactions,
          [goalId]: updater(previous),
        },
      };
    });
  };

  // Recusa do banco por bloqueio vira frase, não erro cru.
  const flashWriteError = (error) => {
    console.error(error);
    const blocked = /blocked/.test(String(error?.message || error?.code || ""));
    flash(t(blocked ? "socialFixes.blockedAction" : "socialFixes.writeError"), "error");
  };

  // Visitante: login e volta para o post (em vez de um toast de sucesso que
  // não gravou nada).
  const goalPath = (goalId) => (goalId ? `/community?goal=${encodeURIComponent(goalId)}` : "/community");

  const handleLike = (goalId) => {
    if (requireAccount(goalPath(goalId))) return;
    const goal = goals.find((item) => item.id === goalId);
    const liked = Boolean(goal?.likesBy?.[user?.uid]);
    engineDB.toggleCommunityLike(goalId, !liked, user?.uid).catch(flashWriteError);
  };

  const handleComment = async (goalId, comment) => {
    if (requireAccount(`${goalPath(goalId)}&comments=1`)) return;
    try {
      await engineDB.addCommunityComment(goalId, comment, user?.uid);
      flash(t("community.commentSaved"));
    } catch (error) {
      flashWriteError(error);
    }
  };

  const handleEditComment = async (goalId, commentId, text) => {
    try {
      await engineDB.updateCommunityComment(goalId, commentId, text, user?.uid);
      flash(t("socialFixes.commentUpdated"));
    } catch (error) {
      flashWriteError(error);
    }
  };

  const handleDeleteComment = async (goalId, commentId) => {
    const ok = await confirm({
      title: t("community.deleteCommentTitle"),
      message: t("community.deleteCommentConfirm"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await engineDB.deleteCommunityComment(goalId, commentId, user?.uid);
      flash(t("community.commentDeleted"));
    } catch (error) {
      flashWriteError(error);
    }
  };

  const handleRate = async (goalId, rating) => {
    if (requireAccount(goalPath(goalId))) return;
    try {
      await engineDB.rateCommunityGoal(goalId, rating, user?.uid);
      flash(t("community.ratingSaved"));
    } catch (error) {
      flashWriteError(error);
    }
  };

  const handleFollow = (target) => {
    if (requireAccount()) return;
    // Aceita tanto uma meta do feed (ownerId) quanto um perfil (userId).
    const ownerId = target.ownerId || target.userId || "";
    const followId = ownerId || target.username;
    const wasFollowing = communityState.following.includes(followId);
    persistState((current) => {
      const isFollowing = current.following.includes(followId);
      return {
        ...current,
        following: isFollowing
          ? current.following.filter((item) => item !== followId)
          : [...current.following, followId],
      };
    });

    if (ownerId && ownerId !== user?.uid) {
      engineDB
        .setFollow(ownerId, !wasFollowing)
        .catch((error) => console.error(error));
    }

  };

  const handleOpenProfile = async (profileUserId, fallback = {}) => {
    const profileGoals = goals.filter((goal) => goal.ownerId === profileUserId);
    const profileProgress = profileGoals.reduce((sum, goal) => sum + getProgress(goal), 0);
    const fallbackProfile = {
      id: profileUserId,
      userId: profileUserId,
      author: fallback.author || fallback.name || "Usuário Engine",
      username: fallback.username || "@engine",
      avatar: fallback.avatar || "",
      avatarInitials: fallback.avatarInitials || getInitials(fallback.author),
      city: fallback.city || "Engine Garage",
      note: fallback.note || "",
      goals: profileGoals,
      goalsCount: profileGoals.length,
      likesCount: profileGoals.reduce((sum, goal) => sum + (Number(goal.likes) || 0), 0),
      averageProgress: profileGoals.length ? profileProgress / profileGoals.length : 0,
    };

    setProfileModal({
      open: true,
      loading: Boolean(profileUserId),
      profile: fallbackProfile,
    });
    if (!profileUserId) return;

    try {
      const profile = await engineDB.getPublicProfile(profileUserId);
      setProfileModal({
        open: true,
        loading: false,
        // Campo vazio vindo do perfil público não apaga o que o card do feed
        // já sabia sobre a pessoa.
        profile: mergeDefined(fallbackProfile, profile),
      });
    } catch (error) {
      console.error(error);
      setProfileModal((current) => ({ ...current, loading: false }));
    }
  };

  // Notificação de seguidor (ou link de perfil): /community?user=<uid>.
  // O setTimeout evita setState síncrono dentro do efeito.
  useEffect(() => {
    if (!openProfileId) {
      handledProfileId.current = "";
      return undefined;
    }
    if (handledProfileId.current === openProfileId) return undefined;

    handledProfileId.current = openProfileId;
    const timer = window.setTimeout(
      () => handleOpenProfile(openProfileId, profiles[openProfileId] || {}),
      0,
    );

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openProfileId, profiles]);

  const closeProfileModal = () => {
    setProfileModal({ open: false, loading: false, profile: null });
    if (openProfileId) closeParamModal("user");
  };

  const handleOpenProfileGoal = (goalId) => {
    closeProfileModal();
    openPost(goalId);
  };

  const handleMessageProfile = async (profile) => {
    const targetId = profile?.userId || profile?.id;
    if (!targetId || targetId === user?.uid) return;

    try {
      const conversationId = await startConversation(
        profileCardFromSettings(settings, user),
        {
          userId: targetId,
          author: profile.author,
          username: profile.username,
          avatar: profile.avatar,
          avatarInitials: profile.avatarInitials,
        },
      );
      closeProfileModal();
      navigate(`/messages/${conversationId}`);
    } catch (error) {
      console.error(error);
      flash(t("messages.startError"), "error");
    }
  };

  const handleCopyShareLink = async (goal) => {
    const shareText = `${t("community.shareText")} ${goal.title} - ${getProgress(
      goal,
    ).toFixed(1)}%`;
    const shareUrl = buildShareUrl(goal);

    const payload = `${shareText} ${shareUrl}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        // Fallback sem diálogo nativo: copia via textarea temporária.
        const textarea = document.createElement("textarea");
        textarea.value = payload;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      flash(t("community.linkCopied"));
    } catch {
      flash(t("community.linkCopyError"), "error");
    }
  };

  const handlePublishGoal = async (goal, caption = "") => {
    if (!goal.isMine || goal.ownerId !== user?.uid) {
      await handleCopyShareLink(goal);
      return;
    }

    try {
      const publishedGoalId = await engineDB.shareCommunityGoal(
        goal,
        settings,
        user?.uid,
        caption,
      );
      persistState((current) => ({
        ...current,
        sharedGoalIds: Array.from(
          new Set([...current.sharedGoalIds, goal.id, publishedGoalId].filter(Boolean)),
        ),
      }));
      flash(t("community.sharedNotice"));
    } catch {
      flash(t("community.sharedDraftNotice"));
    }
  };

  const handleUnshareGoal = async (goal) => {
    if (!goal.isMine && goal.ownerId !== user?.uid) return;

    try {
      await engineDB.deleteCommunityGoal(goal, user?.uid);
      const goalId = communityGoalId(goal, user?.uid);
      const legacyGoalId = legacyCommunityGoalId(goal, user?.uid);
      persistState((current) => ({
        ...current,
        sharedGoalIds: current.sharedGoalIds.filter(
          (item) => ![goal.id, `user-${goal.id}`, goalId, legacyGoalId].includes(item),
        ),
      }));
      flash(t("community.unsharedNotice"));
    } catch (error) {
      console.error(error);
      flash(t("community.unshareError"), "error");
    }
  };

  const handleSaveCaption = async (goal, caption) => {
    try {
      await engineDB.updateCommunityGoalNote(goal.id, caption, user?.uid);
      setCaptionGoal(null);
      flash(t("community.captionSaved"));
    } catch (error) {
      console.error(error);
      flash(t("community.captionError"), "error");
    }
  };

  const handleReportGoal = (goal) => {
    if (requireAccount(goalPath(goal.id))) return;
    openReport({ targetType: "goal", targetId: goal.id, reportedUserId: goal.ownerId });
  };

  // Comentário: o alvo é "<post>#<comentário>" (o banco lê o texto dali).
  const handleReportComment = (goal, comment) => {
    if (requireAccount(`${goalPath(goal.id)}&comments=1`)) return;
    openReport({
      targetType: "comment",
      targetId: `${goal.id}#${comment.id}`,
      reportedUserId: comment.userId || "",
    });
  };

  const handleBlockUser = async (goal) => {
    if (!goal.ownerId) return;
    if (requireAccount()) return;
    const ok = await confirm({
      title: t("community.blockTitle"),
      message: t("community.blockMessage", { user: goal.username || goal.author }),
      confirmLabel: t("community.block"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;

    try {
      await engineDB.setUserBlocked(goal.ownerId, true, user?.uid);
      setBlockedUserIds((current) =>
        current.includes(goal.ownerId) ? current : [...current, goal.ownerId],
      );
      flash(t("community.blockedNotice"));
    } catch (error) {
      console.error(error);
      flash(t("community.blockError"), "error");
    }
  };

  const handleClearMyPublications = async () => {
    const ok = await confirm({
      title: t("community.clearPublishedTitle"),
      message: t("community.clearPublishedConfirm"),
      confirmLabel: t("community.clearPublishedAction"),
    });
    if (!ok) return;

    try {
      await engineDB.resetMyCommunityPublications(user?.uid);
      persistState((current) => ({
        ...current,
        sharedGoalIds: [],
      }));
      flash(t("community.clearPublishedNotice"));
    } catch (error) {
      console.error(error);
      flash(t("community.clearPublishedError"), "error");
    }
  };

  const handleSaveVideo = (videoId) => {
    persistState((current) => {
      const saved = current.savedVideos.includes(videoId);
      return {
        ...current,
        savedVideos: saved
          ? current.savedVideos.filter((item) => item !== videoId)
          : [...current.savedVideos, videoId],
      };
    });
  };

  const handleVideoLike = (videoId) => {
    updateInteraction(videoId, (previous) => ({
      ...previous,
      liked: !previous.liked,
    }));
  };

  /**
   * Navegação da comunidade numa barra só.
   *
   * Antes eram dois níveis empilhados — METAS|CLUBES em cima e
   * FEED|VÍDEOS|RANKING embaixo — com larguras diferentes e um campo de busca
   * ocupando uma terceira linha. "Metas" e "Feed" também diziam a mesma coisa:
   * o feed É o conteúdo das metas. Clubes não é um nível acima do feed, é uma
   * seção irmã.
   *
   * O ranking só entra aqui quando o trilho lateral não está na tela: no
   * desktop ele já aparece como "Top da semana" ao lado, e repetir seria
   * ocupar espaço à toa.
   */
  const sections = [
    { id: "feed", label: t("community.tabs.feed"), icon: Users },
    { id: "videos", label: t("community.tabs.videos"), icon: Clapperboard },
    ...(hasRail ? [] : [{ id: "ranking", label: t("community.tabs.ranking"), icon: Trophy }]),
    { id: "clubes", label: t("community.tabs.clubs"), icon: Building },
    { id: "eventos", label: t("community.tabs.events"), icon: Calendar },
  ];

  const activeSectionRef = useRef(null);

  /* Abas de primeiro nível vivem na URL (?tab=). "goals" guarda ainda uma
     sub-aba própria (feed/vídeos/ranking); clubes e eventos não têm. */
  const TOP_LEVEL = ["clubes", "eventos"];
  const activeSection = TOP_LEVEL.includes(topLevelTab) ? topLevelTab : activeSubTab;

  const selectSection = (id) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", TOP_LEVEL.includes(id) ? id : "goals");
    params.delete("club");
    setSearchParams(params);
    if (!TOP_LEVEL.includes(id)) setActiveSubTab(id);
  };

  useEffect(() => {
    activeSectionRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeSection]);


  // Abre o compositor já apontado para o clube quando a pessoa chega da
  // página dele. Busca o clube pelo id: é uma leitura, e é o que garante que
  // a sigla exibida seja a de verdade.
  useEffect(() => {
    if (!composeClubId || !user?.uid) return;
    let vivo = true;
    (async () => {
      try {
        const clube = await getClub(composeClubId);
        if (!vivo || !clube) return;
        setComposeClub({ id: clube.id, tag: clube.tag, name: clube.name });
        setPostModalOpen(true);
      } catch {
        // Clube sumiu, foi arquivado ou a regra negou: abrir o compositor sem
        // carimbo seria publicar no feed geral achando que é no mural.
        limparParametrosDeComposicao();
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeClubId, user?.uid]);

  // `?compose=1` (sem clube) abre o compositor; `?share=1` abre "publicar meu
  // carro" — é para onde o "Publicar meu carro" da garagem do clube leva.
  // Visitante que chegou aqui pelo login volta com o parâmetro e cai no modal.
  const composeFree = searchParams.get("compose") === "1" && !searchParams.get("club");
  const shareRequested = searchParams.get("share") === "1";
  useEffect(() => {
    if (!user?.uid || (!composeFree && !shareRequested)) return undefined;
    const timer = window.setTimeout(() => {
      if (composeFree) setPostModalOpen(true);
      if (shareRequested) setShareModalOpen(true);
      const params = new URLSearchParams(searchParams);
      params.delete("compose");
      params.delete("share");
      setSearchParams(params, { replace: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [composeFree, shareRequested, user?.uid, searchParams, setSearchParams]);

  return (
    <section className="pb-4 sm:pb-8">
      {/* Coluna única centrada + trilho à direita, como as redes que servem
          de referência. O hero (título gigante, estatísticas e o painel de
          publicação) saiu do topo: no celular ele comia a tela inteira antes
          do primeiro post. O que importava dele foi para o trilho e para o
          botão de publicar aqui em cima. */}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="mx-auto w-full min-w-0 max-w-[620px]">
          {/* Uma barra só: seções à esquerda, ações à direita. */}
          <div className="mb-4 flex w-full items-center gap-2">
            {/* Com cinco seções os rótulos não cabem lado a lado num celular:
                medido em 21/08/2026 davam 51px por aba e viravam "F.", "V.",
                "R.". A tira rola na horizontal (o mesmo que YouTube e X fazem
                quando passa de quatro) e no desktop volta a dividir igual. */}
            <div className="engine-scroll-x flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-full bg-[var(--engine-surface-2)] p-1 sm:gap-0 sm:overflow-visible">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    /* Numa tira que rola, a aba ativa precisa se anunciar: caindo
                       direto em ?tab=eventos ela nascia fora de vista à direita e
                       a tela parecia estar no Feed. */
                    ref={isActive ? activeSectionRef : undefined}
                    onClick={() => selectSection(section.id)}
                    className={`flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors sm:min-w-0 sm:flex-1 sm:shrink sm:px-2.5 sm:text-xs ${
                      isActive
                        ? "bg-[var(--engine-surface)] text-[var(--engine-accent)] shadow-[var(--engine-shadow-sm)]"
                        : "text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                    }`}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className="sm:truncate">{section.label}</span>
                  </button>
                );
              })}
            </div>

            {activeSection === "feed" && (
              <button
                type="button"
                onClick={() => setSearchOpen((open) => !open)}
                title={t("community.search")}
                aria-label={t("community.search")}
                aria-expanded={searchOpen}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
                  searchOpen || query
                    ? "border-[var(--engine-accent)] text-[var(--engine-accent)]"
                    : "border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                }`}
              >
                <Search size={18} />
              </button>
            )}

            {/* Publicar em qualquer largura: abaixo de 1280px o trilho lateral
                (onde moram "Publicar" e "Compartilhar meta") não aparece, e o
                celular ficava sem caminho para publicar. */}
            {topLevelTab === "goals" && (
              <button
                type="button"
                onClick={() => {
                  if (requireAccount("/community?compose=1")) return;
                  setPostModalOpen(true);
                }}
                title={t("feedPost.action")}
                aria-label={t("feedPost.action")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--engine-accent)] text-white transition hover:brightness-95 xl:hidden"
              >
                <Plus size={18} />
              </button>
            )}

            {topLevelTab === "goals" && (
              <button
                type="button"
                onClick={() => setPeopleModalOpen(true)}
                title={t("community.discoverPeople")}
                aria-label={t("community.discoverPeople")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
              >
                <UserPlus size={18} />
              </button>
            )}
          </div>

          {/* Goals Tab */}
          {topLevelTab === "goals" && (
            <>
              {activeSubTab === "feed" && (
                <>
                  {/* O campo só ocupa espaço quando a pessoa quer buscar; do
                      contrário fica atrás do ícone na barra. */}
                  {searchOpen && (
                    <label className="engine-field mb-4 flex h-11 w-full items-center gap-2.5 rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface)] pl-4 pr-1.5">
                      <Search size={16} className="shrink-0 text-[var(--engine-text-subtle)]" />
                      <input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t("community.search")}
                        className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--engine-text)] outline-none"
                      />
                      {/* Botão dentro da moldura, com área de toque de 32px e
                          padding-right menor pra compensar. */}
                      {query && (
                        <button
                          type="button"
                          onClick={() => setQuery("")}
                          aria-label={t("community.clearSearch")}
                          className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--engine-text-subtle)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)] sm:m-0 sm:h-8 sm:w-8"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </label>
                  )}

                  {regionWidened && (
                    <div className="region-widened">
                      <MapPin size={15} className="shrink-0 text-[var(--engine-accent)]" />
                      <span>{t("region.widened")}</span>
                      <button
                        type="button"
                        onClick={() => setRegion({ country: "all", state: "all" })}
                      >
                        {t("region.clear")}
                      </button>
                    </div>
                  )}

                  {filteredGoals.length ? (
                    /* No celular os posts encostam nas bordas e são separados por
                       uma linha; a partir de sm voltam a ser cartões soltos. */
                    <div className="-mx-4 border-y border-[var(--engine-border)] sm:mx-0 sm:space-y-5 sm:border-0">
                      {filteredGoals.map((goal, index) => (
                        <Fragment key={goal.id}>
                          <GoalCard
                            goal={goal}
                            t={t}
                            interactions={{
                              ...emptyInteraction,
                              liked: Boolean(goal.likesBy?.[user?.uid]),
                              rating: goal.ratingsBy?.[user?.uid] || goal.rating,
                            }}
                            following={communityState.following}
                            shared={isGoalShared(goal, communityState.sharedGoalIds, user?.uid)}
                            onLike={handleLike}
                            onComment={handleComment}
                            onRate={handleRate}
                            onShare={handleCopyShareLink}
                            onUnshare={handleUnshareGoal}
                            onFollow={handleFollow}
                            onOpenProfile={handleOpenProfile}
                            onEditComment={handleEditComment}
                            onDeleteComment={handleDeleteComment}
                            onOpenPost={openPostAnywhere}
                            onSendToChat={setPostToShare}
                            onEditCaption={setCaptionGoal}
                            onReport={handleReportGoal}
                            onReportComment={handleReportComment}
                            onBlock={handleBlockUser}
                            currentUserId={user?.uid}
                          />
                          {/* Card patrocinado nativo — entra no meio do feed
                              (padrão Webmotors), rotulado e discreto. */}
                          {index === 3 && (
                            <div className="px-4 py-4 sm:px-0 sm:py-0">
                              <AdSlot slot="community-feed" format="native" user={user} />
                            </div>
                          )}
                        </Fragment>
                      ))}
                    </div>
                  ) : (
                    <EmptyFeed t={t} />
                  )}

                  {hasMoreGoals && !query && (
                    <button
                      type="button"
                      onClick={handleLoadMoreGoals}
                      disabled={loadingMoreGoals}
                      className="mt-5 w-full rounded-full border border-[var(--engine-border)] py-3 text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-50"
                    >
                      {loadingMoreGoals ? t("common.loading") : t("community.loadMore")}
                    </button>
                  )}
                </>
              )}

              {activeSubTab === "videos" && (
                <div className="space-y-5">
                  {videoPosts.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      t={t}
                      saved={communityState.savedVideos.includes(video.id)}
                      liked={communityState.interactions[video.id]?.liked}
                      onSave={handleSaveVideo}
                      onLike={handleVideoLike}
                    />
                  ))}
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--engine-border)] p-10 text-center">
                    <Clapperboard className="mb-4 text-[var(--engine-accent)]" size={34} />
                    <h2 className="text-base font-extrabold tracking-tight text-[var(--engine-text)]">
                      {t("community.videos.slotTitle")}
                    </h2>
                    <p className="mt-2 max-w-sm text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
                      {t("community.videos.slotCopy")}
                    </p>
                  </div>
                </div>
              )}

              {activeSubTab === "ranking" && <RankingPanel ranking={ranking} t={t} />}
            </>
          )}


          {/* Clubes Tab */}
          {topLevelTab === "clubes" && (
            <ClubsTab searchParams={searchParams} setSearchParams={setSearchParams} user={user} />
          )}

          {/* Eventos Tab — a mesma página de /events, sem o cabeçalho dela: aqui
              quem anuncia onde você está é a barra de abas acima. A rota
              /events continua existindo e é o que o menu do desktop usa. */}
          {topLevelTab === "eventos" && <Events embedded user={user} />}
        </div>

        {/* Sidebar (only shown for Goals tab) */}
        {topLevelTab === "goals" && (
          <aside className="hidden space-y-5 xl:block">
            <div className="engine-card divide-y divide-[var(--engine-border)] px-4">
              <RailStat icon={Users} label={t("community.stats.goals")} value={goals.length} />
              <RailStat
                icon={Heart}
                label={t("community.stats.interactions")}
                value={stats.likes}
              />
              <RailStat
                icon={Award}
                label={t("community.stats.avg")}
                value={`${averageProgress.toFixed(0)}%`}
              />
            </div>

            <div className="engine-card space-y-2 p-4">
              <button
                type="button"
                onClick={() => setPostModalOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--engine-accent)] px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white transition hover:brightness-95"
              >
                <Plus size={15} />
                {t("feedPost.action")}
              </button>
              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--engine-border)] px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
              >
                <Car size={15} />
                {t("community.shareNewGoal")}
              </button>
            </div>

            <SidebarRanking ranking={ranking} t={t} />

            {friendSuggestions.length > 0 && (
              <Suggestions
                t={t}
                following={communityState.following}
                onFollow={handleFollow}
              />
            )}

            {/* Retângulo de lateral (300x250), como o rail dos marketplaces. */}
            <AdSlot slot="community-rail" format="rectangle" user={user} />
          </aside>
        )}
      </div>

      <CreateFeedPostModal
        open={postModalOpen}
        cars={cars}
        club={composeClub}
        onClose={() => {
          setPostModalOpen(false);
          setComposeClub(null);
          limparParametrosDeComposicao();
        }}
        onCreated={() => {
          setPostModalOpen(false);
          setComposeClub(null);
          limparParametrosDeComposicao();
        }}
      />

      {shareModalOpen && (
        <ShareModal
          goals={personalGoals}
          sharedGoalIds={communityState.sharedGoalIds}
          notesByCarId={myPublishedNotes}
          userId={user?.uid}
          t={t}
          onClose={() => setShareModalOpen(false)}
          onShare={handlePublishGoal}
          onUnshare={handleUnshareGoal}
          onClearAll={handleClearMyPublications}
        />
      )}

      {peopleModalOpen && (
        <PeopleSearchModal
          people={peopleDirectory}
          query={peopleQuery}
          onQueryChange={setPeopleQuery}
          following={communityState.following}
          t={t}
          onFollow={handleFollow}
          onOpenProfile={handleOpenProfile}
          onClose={() => setPeopleModalOpen(false)}
        />
      )}

      {profileModal.open && (
        <UserProfileModal
          profile={profileModal.profile}
          loading={profileModal.loading}
          isFollowing={communityState.following.includes(
            profileModal.profile?.userId,
          )}
          t={t}
          currentUserId={user?.uid}
          onClose={closeProfileModal}
          onOpenGoal={handleOpenProfileGoal}
          onMessage={handleMessageProfile}
          onFollow={handleFollow}
        />
      )}

      {Boolean(openPostId) && (
        <PostModal
          goal={postModalGoal}
          loading={remoteGoalLoading}
          openComments={openWithComments}
          t={t}
          onClose={() => closeParamModal("goal")}
          cardProps={{
            interactions: {
              ...emptyInteraction,
              liked: Boolean(postModalGoal?.likesBy?.[user?.uid]),
              rating: postModalGoal?.ratingsBy?.[user?.uid] || postModalGoal?.rating || 0,
            },
            following: communityState.following,
            shared: postModalGoal
              ? isGoalShared(postModalGoal, communityState.sharedGoalIds, user?.uid)
              : false,
            onLike: handleLike,
            onComment: handleComment,
            onRate: handleRate,
            onShare: handleCopyShareLink,
            onUnshare: handleUnshareGoal,
            onFollow: handleFollow,
            onOpenProfile: handleOpenProfile,
            onEditComment: handleEditComment,
            onDeleteComment: handleDeleteComment,
            onSendToChat: setPostToShare,
            onEditCaption: setCaptionGoal,
            onReport: handleReportGoal,
            onReportComment: handleReportComment,
            onBlock: handleBlockUser,
            currentUserId: user?.uid,
          }}
        />
      )}

      {captionGoal && (
        <CaptionModal
          goal={captionGoal}
          t={t}
          onClose={() => setCaptionGoal(null)}
          onSave={handleSaveCaption}
        />
      )}

      {reportDialog}

      <ShareToChatModal
        open={Boolean(postToShare)}
        goal={postToShare}
        user={user}
        settings={settings}
        onClose={() => setPostToShare(null)}
      />
    </section>
  );
}

/* Estatística do trilho: uma linha por número. Em três colunas os rótulos
   ("metas no feed", "progresso médio") não cabiam e truncavam. */
function RailStat({ icon, value, label }) {
  const IconComponent = icon;

  return (
    <div className="flex items-center gap-2.5 py-3">
      <IconComponent size={15} className="shrink-0 text-[var(--engine-accent)]" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-[var(--engine-text-muted)]">
        {label}
      </span>
      <span className="shrink-0 text-sm font-black text-[var(--engine-text)]">
        {value}
      </span>
    </div>
  );
}

function EmptyFeed({ t }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--engine-border)] bg-[var(--engine-surface)] p-8 text-center lg:col-span-2 xl:col-span-1 2xl:col-span-2  ">
      <Search className="mb-4 text-[var(--engine-accent)]" size={40} />
      <h2 className="text-lg font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">
        {t("community.noSearchResults")}
      </h2>
      <p className="mt-3 max-w-sm text-sm font-medium text-[var(--engine-text-muted)] ">
        {t("community.noSearchResultsCopy")}
      </p>
    </div>
  );
}

function SidebarRanking({ ranking, t }) {
  return (
    <section className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5  ">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--engine-text)] dark:text-white">
        <Trophy size={18} className="text-[var(--engine-accent)]" />
        {t("community.weekTop")}
      </h2>
      <div className="space-y-3">
        {ranking.slice(0, 3).map((goal, index) => (
          <div key={goal.id} className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--engine-accent)] text-xs font-black text-white">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-[var(--engine-text)] dark:text-white">
                {getVehicleTitleShort(goal)}
                {goal.year && (
                  <span className="font-bold text-[var(--engine-text-subtle)]">
                    {` · ${formatFipeYear(goal.year, t("car.zeroKm"))}`}
                  </span>
                )}
              </p>
              <p className="truncate text-[11px] font-medium text-[var(--engine-text-subtle)]">
                {goal.username} · {goal.likes} likes · {getProgress(goal).toFixed(0)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Suggestions({ t, following, onFollow }) {
  return (
    <section className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5  ">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--engine-text)] dark:text-white">
        <UserPlus size={18} className="text-[var(--engine-accent)]" />
        {t("community.suggestions.title")}
      </h2>
      <div className="space-y-3">
        {friendSuggestions.map((friend) => {
          const isFollowing = following.includes(friend.handle);
          return (
            <div key={friend.handle} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[var(--engine-text)] dark:text-white">
                  {friend.name}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                  {t(friend.matchKey)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onFollow(friend.handle)}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                  isFollowing
                    ? "bg-[var(--engine-accent)] text-white"
                    : "bg-[var(--engine-surface-2)] text-[var(--engine-accent)] hover:bg-[var(--engine-accent)] hover:text-white "
                }`}
                title={isFollowing ? t("community.following") : t("community.follow")}
              >
                {isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RankingPanel({ ranking, t }) {
  return (
    <div className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4 sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold tracking-tight text-[var(--engine-text)] dark:text-white">
            {t("community.rankingTitle")}
          </h2>
          <p className="mt-1 text-sm font-medium text-[var(--engine-text-muted)]">
            {t("community.rankingSubtitle")}
          </p>
        </div>
        <Trophy size={30} className="shrink-0 text-[var(--engine-accent)] sm:size-9" />
      </div>

      <div className="space-y-4">
        {ranking.map((goal, index) => {
          const progress = getProgress(goal);
          return (
            <div
              key={goal.id}
              className="grid gap-4 rounded-xl border border-[var(--engine-border)] p-4 md:grid-cols-[64px_1fr_160px] md:items-center "
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--engine-accent)] text-xl font-black italic text-white ">
                #{index + 1}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-black italic text-[var(--engine-text)] dark:text-white">
                  {getVehicleTitleShort(goal)}
                </p>
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                  {goal.author} / {goal.username}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--engine-surface-2)] dark:bg-red-950/30">
                  <div
                    className="h-full rounded-full bg-[var(--engine-accent)]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center md:grid-cols-1 md:text-right">
                <p className="text-sm font-black text-[var(--engine-accent)]">
                  {progress.toFixed(1)}%
                </p>
                <p className="text-sm font-black text-[var(--engine-text)] dark:text-white">
                  {goal.likes} likes
                </p>
                <p className="text-sm font-black text-amber-500">
                  {goal.rating.toFixed(1)} {t("community.rating")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
