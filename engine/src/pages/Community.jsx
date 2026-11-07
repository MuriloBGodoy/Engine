import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Archive,
  BellOff,
  Award,
  AtSign,
  Bookmark,
  Building,
  Calendar,
  CarFront,
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
  Play,
  Plus,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Target,
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
import "../services/i18n-social-feed";
import "../services/i18n-post-card";
import "../services/i18n-social-posts";
import { CaptionEditor } from "../components/social/CaptionEditor";
import { ReelsFeed } from "../components/social/ReelsFeed";
import { TrendingTags } from "../components/social/TrendingTags";
import { normalizeTag, tagPath } from "../services/socialText";
import { RichText } from "../components/social/RichText";
import {
  AvatarButton,
  CommentPreview,
  CommentsPanel,
  CommentsSheet,
} from "../components/social/Comments";
import { getInitials, withoutAt } from "../services/people";
import { useCommentComposer } from "../hooks/useCommentComposer";
import { PersonLink } from "../components/social/PersonLink";
import { PostMenu } from "../components/social/PostMenu";
import { setPostArchived } from "../services/archivedPosts";
import { TimeAgo } from "../components/social/TimeAgo";
import { PostVideoPlayer } from "../components/social/PostVideoPlayer";
import { CarsTab } from "../components/cars/CarsTab";
import { useSavedPosts } from "../hooks/useSavedPosts";
import { originTag } from "../services/carSpecSheet";
import { formatNumber, originLabel } from "../components/specsheet/labels";
import { useRequireAccount } from "../hooks/useRequireAccount";
import { useSocialReport } from "../hooks/useSocialReport";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { ShareToChatModal } from "../components/ShareToChatModal";
import { AdSlot } from "../components/AdSlot";
import { CreateFeedPostModal } from "../components/CreateFeedPostModal";
import { useRegion } from "../hooks/RegionProvider";
import { applyRegionFilter } from "../services/region";
import { formatFipeYear } from "../services/carDisplay";

const fallbackImage =
  "https://images.unsplash.com/photo-1598209279122-8541213a0387?q=80&w=900";

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

const isGoalShared = (goal, sharedGoalIds, userId = "") => {
  const goalId = communityGoalId(goal, userId || goal.ownerId);
  const legacyGoalId = legacyCommunityGoalId(goal, userId || goal.ownerId);
  return [goal.id, `user-${goal.id}`, goalId, legacyGoalId].some((id) =>
    sharedGoalIds.includes(id),
  );
};

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
const youTubeId = (url) =>
  String(url || "").match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
  )?.[1] || "";

/**
 * Capa do vídeo do YouTube, com o player entrando só no toque.
 *
 * Antes o `<iframe>` nascia junto com o post: passar o feed já puxava o
 * código do YouTube de cada vídeo à vista, e três posts desses engasgavam
 * um celular de entrada. Capa é imagem estática; quem quer assistir carrega.
 */
function YouTubeSlide({ id, t }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
        title={t("community.watchVideo")}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        className="h-full w-full shrink-0 bg-black"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={t("community.watchVideo")}
      className="relative h-full w-full shrink-0 bg-black"
    >
      <img
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        draggable={false}
        className="h-full w-full object-cover opacity-90"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/65 text-white">
          <Play size={26} fill="currentColor" strokeWidth={0} className="ml-0.5" />
        </span>
      </span>
    </button>
  );
}

function PostVideo({ url, t }) {
  const id = youTubeId(url);

  if (id) {
    return (
      <div className="aspect-video bg-black">
        <YouTubeSlide id={id} t={t} />
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

// Janela do toque duplo. Abaixo de ~250 ms muita gente não consegue; acima de
// ~350 o toque simples (abrir o post) começa a parecer travado.
const DOUBLE_TAP_MS = 300;

// Moldura do Instagram: a 1a foto decide a proporção do post inteiro, presa
// entre 4:5 (retrato) e 1,91:1 (paisagem). Antes era 4:3 fixo: foto em pé
// perdia cabeça e rodas. As demais fotos do carrossel preenchem a mesma
// moldura. Enquanto a 1a não carrega, 1:1 (meio-termo que menos pula).
const MEDIA_MIN_RATIO = 4 / 5;
const MEDIA_MAX_RATIO = 1.91;
const clampMediaRatio = (width, height) =>
  width > 0 && height > 0
    ? Math.min(Math.max(width / height, MEDIA_MIN_RATIO), MEDIA_MAX_RATIO)
    : 1;

function PostGallery({ images, videoUrl = "", alt, t, onOpen, onDoubleTap, box = null, onRatio }) {
  const [index, setIndex] = useState(0);
  const [ratio, setRatio] = useState(1);
  /* Vídeo do YouTube entra como mais um item do carrossel, não como bloco
     embaixo da foto: empilhados, o post virava uma foto alta com um player
     espremido no pé. */
  const videoId = youTubeId(videoUrl);
  const slides = useMemo(
    () => [
      ...images.map((src) => ({ key: src, type: "image", src })),
      ...(videoId ? [{ key: `yt-${videoId}`, type: "youtube", id: videoId }] : []),
    ],
    [images, videoId],
  );
  const dragStart = useRef(null);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);
  const heartRef = useRef(null);

  useEffect(() => () => clearTimeout(tapTimer.current), []);

  const playHeart = () => {
    const heart = heartRef.current;
    if (!heart?.animate) return;
    heart.animate(
      [
        { opacity: 0, transform: "scale(0.4)" },
        { opacity: 1, transform: "scale(1.15)", offset: 0.25 },
        { opacity: 1, transform: "scale(1)", offset: 0.6 },
        { opacity: 0, transform: "scale(1)" },
      ],
      { duration: 850, easing: "ease-out" },
    );
  };

  // Toque duplo na foto curte, como no Instagram — e só curte: tocar duas
  // vezes num post já curtido não desfaz (quem quer descurtir usa o coração).
  // Com toque duplo ligado, o toque simples espera a janela passar antes de
  // abrir o post; sem ele, abre na hora.
  const handleTap = () => {
    const now = Date.now();
    if (onDoubleTap && now - lastTap.current < DOUBLE_TAP_MS) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      playHeart();
      onDoubleTap();
      return;
    }
    lastTap.current = now;
    if (!onOpen) return;
    if (!onDoubleTap) {
      onOpen();
      return;
    }
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(onOpen, DOUBLE_TAP_MS);
  };

  const total = slides.length;
  const current = Math.min(index, total - 1);
  const onVideo = slides[current]?.type === "youtube";

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
      className="relative max-w-full overflow-hidden bg-[var(--engine-surface-2)]"
      // No lightbox do desktop a moldura cabe na caixa disponível mantendo a
      // proporção da foto: sem tarja preta dos lados nem corte.
      style={
        box
          ? {
              height: Math.round(Math.min(box.maxHeight, box.maxWidth / ratio)),
              width: Math.round(Math.min(box.maxHeight, box.maxWidth / ratio) * ratio),
            }
          : { aspectRatio: ratio }
      }
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {slides.map((slide, position) =>
          slide.type === "youtube" ? (
            <YouTubeSlide key={slide.key} id={slide.id} t={t} />
          ) : (
          <img
            key={slide.key}
            src={slide.src}
            alt={alt}
            draggable={false}
            onLoad={
              position === 0
                ? (event) => {
                    const next = clampMediaRatio(
                      event.currentTarget.naturalWidth,
                      event.currentTarget.naturalHeight,
                    );
                    setRatio(next);
                    onRatio?.(next);
                  }
                : undefined
            }
            onError={(event) => {
              event.currentTarget.src = fallbackImage;
            }}
            className="h-full w-full shrink-0 object-cover"
          />
          ),
        )}
      </div>

      {/* A foto é o "abrir publicação" — mesmo gesto de qualquer feed — e o
          toque duplo curte. `touch-manipulation` tira o zoom de toque duplo
          do navegador, que comeria o gesto. */}
      {/* No item de vídeo a camada de abrir sai da frente: ela cobriria o
          play, e tocar num vídeo tem que tocar o vídeo. */}
      {onVideo ? null : onOpen ? (
        <button
          type="button"
          onClick={handleTap}
          aria-label={t("community.openPost")}
          title={t("community.openPost")}
          className="absolute inset-0 touch-manipulation"
        />
      ) : onDoubleTap ? (
        <div aria-hidden="true" onClick={handleTap} className="absolute inset-0 touch-manipulation" />
      ) : null}

      <span
        ref={heartRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-white opacity-0 drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
      >
        <Heart size={92} fill="currentColor" strokeWidth={0} />
      </span>

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

          <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
            {current + 1}/{total}
          </span>
          <div className="pointer-events-none absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/35 px-1.5 py-1">
            {slides.map((slide, position) => (
              <span
                key={slide.key}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  position === current ? "bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Hashtag, menção e link no post: acento em versão de TEXTO (legível no
// escuro, onde o acento cheio dá ~3,3:1 em letra miúda).
const RICH_LINK = "font-semibold text-[var(--engine-accent-text)] hover:underline";

// Legenda cortada perto de duas linhas no celular. Por caractere, como o
// Instagram, e sempre num espaço: cortar dentro de uma #tag quebraria o link.
const CAPTION_PREVIEW_CHARS = 110;

const compactMoney = (value, language) =>
  new Intl.NumberFormat(language, {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);

/**
 * Até 4 chips do que o dono declarou na ficha (potência, torque, câmbio,
 * stage). Só o declarado: o feed não consulta catálogo de fábrica por post.
 * Cada chip leva no `title` de onde o número veio (regra do Brian: declarado
 * sempre etiquetado).
 */
const specChips = (specs, t, language) => {
  if (!specs) return [];
  const chips = [];
  const power = specs.performance?.powerCv;
  if (power) {
    chips.push({ id: "power", label: `${formatNumber(language, power.value)} cv`, cell: power });
  }
  const torque = specs.performance?.torque;
  if (torque) {
    chips.push({
      id: "torque",
      label: `${formatNumber(language, torque.value, 1)} ${torque.unit || "kgfm"}`,
      cell: torque,
    });
  }
  const aspiration = specs.version?.aspiration;
  if (aspiration && aspiration !== "naturally_aspirated") {
    chips.push({ id: "aspiration", label: t(`specSheet.value.aspiration.${aspiration}`) });
  }
  const transmission = specs.version?.transmission;
  if (transmission) {
    chips.push({ id: "transmission", label: t(`specSheet.value.transmission.${transmission}`) });
  }
  if (specs.stage && specs.stage !== "stock") {
    chips.push({ id: "stage", label: t(`specSheet.stage.${specs.stage}`) });
  }
  return chips.slice(0, 4);
};

/**
 * Faixa de cima do post de carro/meta (o "título + números" do Strava):
 * nome do carro abre a ficha; na meta, guardado/falta/% e a barra; no post de
 * carro, os chips da ficha. A nota em estrelas virou um "★ 4,7" que abre o
 * seletor — na linha de ações ela disputava espaço com curtir e salvar.
 */
function PostFicha({ goal, t, language, full, isGoal, progress, rating, onRate, onOpenSpecs }) {
  const [rateOpen, setRateOpen] = useState(false);
  const completed = isGoal && isGoalCompleted(goal);
  const hasMoney = isGoal && Number(goal.targetValue) > 0;
  const chips = isGoal ? [] : specChips(goal.specs, t, language);
  const KindIcon = isGoal ? Target : Car;

  return (
    <div className="relative space-y-1.5 px-3 pb-2.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
          <KindIcon size={13} aria-hidden="true" />
        </span>
        {/* Mesmo gesto do CarCard: o nome do veículo É a porta da ficha. O
            carro é de outra pessoa, então a ficha abre só em leitura. */}
        <button
          type="button"
          onClick={onOpenSpecs}
          aria-label={t("specSheet.cardAction")}
          className="group/specs -my-2 flex min-h-11 min-w-0 items-center gap-1 rounded-lg text-left sm:my-0 sm:min-h-0"
        >
          <span className="min-w-0 truncate [font-family:var(--font-display)] text-sm font-bold text-[var(--engine-text)]">
            {full ? getVehicleTitle(goal) : getVehicleTitleShort(goal)}
          </span>
          {goal.year ? (
            <span className="shrink-0 text-[13px] text-[var(--engine-text-muted)]">
              · {formatFipeYear(goal.year, t("car.zeroKm"))}
            </span>
          ) : null}
          <ChevronRight
            size={14}
            aria-hidden="true"
            className="shrink-0 text-[var(--engine-text-muted)] transition group-hover/specs:translate-x-0.5 group-hover/specs:text-[var(--engine-accent)]"
          />
        </button>

        {isGoal && (
          <button
            type="button"
            onClick={() => setRateOpen((open) => !open)}
            aria-expanded={rateOpen}
            aria-label={rating > 0 ? t("postCard.rating", { value: rating.toFixed(1) }) : t("postCard.rate")}
            className="-my-2 ml-auto flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-1.5 text-xs font-bold tabular-nums text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] sm:my-0 sm:min-h-8"
          >
            <Star size={13} className="text-amber-400" fill={rating > 0 ? "currentColor" : "none"} />
            {rating > 0 ? rating.toLocaleString(language, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : t("postCard.rate")}
          </button>
        )}
      </div>

      {rateOpen && (
        <div className="absolute right-3 top-9 z-10 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] px-1.5 shadow-[var(--engine-shadow-lg)] sm:right-4">
          <RatingControl
            value={rating}
            size={20}
            label={t("community.rate")}
            onRate={(value) => {
              onRate(value);
              setRateOpen(false);
            }}
          />
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            const tag = chip.cell ? originTag(chip.cell) : "";
            return (
              <span
                key={chip.id}
                title={tag ? originLabel(t, tag) : undefined}
                className="rounded-md border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--engine-text)]"
              >
                {chip.label}
              </span>
            );
          })}
        </div>
      )}

      {isGoal &&
        (completed ? (
          /* Meta batida: barra cheia, "100%" e selo diziam a mesma coisa
             três vezes. Fica só o selo. */
          <div className="flex items-center gap-2">
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--engine-accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--engine-accent-text)]">
              <Trophy size={12} />
              {t("community.completed")}
            </span>
            <span className="mr-1.5 flex">
              <InfoTip text={t("community.privacyLine")} align="right" />
            </span>
          </div>
        ) : (
          <>
            {/* Valores em dinheiro só existem no post do próprio dono; para os
                outros o banco manda só o percentual. */}
            {hasMoney && (
              <dl className="flex gap-5">
                <div className="min-w-0">
                  <dt className="text-[11px] text-[var(--engine-text-muted)]">{t("postCard.goalSaved")}</dt>
                  <dd className="[font-family:var(--font-display)] text-[15px] font-bold tabular-nums text-[var(--engine-text)]">
                    {compactMoney(goal.savedValue, language)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] text-[var(--engine-text-muted)]">{t("postCard.goalLeft")}</dt>
                  <dd className="[font-family:var(--font-display)] text-[15px] font-bold tabular-nums text-[var(--engine-text)]">
                    {compactMoney(Math.max(Number(goal.targetValue) - Number(goal.savedValue), 0), language)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] text-[var(--engine-text-muted)]">{t("postCard.goalTarget")}</dt>
                  <dd className="[font-family:var(--font-display)] text-[15px] font-bold tabular-nums text-[var(--engine-accent-text)]">
                    {progress.toFixed(0)}%
                  </dd>
                </div>
              </dl>
            )}
            <div className="flex items-center gap-2">
              <span
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--engine-surface-2)]"
              >
                <span
                  className="block h-full rounded-full bg-[var(--engine-accent)] transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </span>
              {!hasMoney && (
                <span className="shrink-0 text-xs font-bold tabular-nums text-[var(--engine-accent-text)]">
                  {t("postCard.goalOfTarget", { value: progress.toFixed(0) })}
                </span>
              )}
              <span className="mr-1.5 flex">
              <InfoTip text={t("community.privacyLine")} align="right" />
            </span>
            </div>
          </>
        ))}
    </div>
  );
}

/** "autor legenda… mais". O @ do autor abre o perfil como o nome no topo. */
function PostCaption({ goal, t, full, onExpand }) {
  const text = goal.note || "";
  const cut = full || text.length <= CAPTION_PREVIEW_CHARS
    ? text
    : text.slice(0, Math.max(text.lastIndexOf(" ", CAPTION_PREVIEW_CHARS), 40)).trimEnd();
  const truncated = cut !== text;
  const handle = withoutAt(goal.username) || goal.author;

  return (
    <p className="break-words px-3 pb-2 text-sm leading-[1.45] text-[var(--engine-text)] sm:px-4">
      <span className="mr-1 font-bold">{handle}</span>
      <RichText text={cut} linkClassName={RICH_LINK} className="whitespace-pre-line" />
      {truncated && (
        <>
          {"… "}
          <button
            type="button"
            onClick={onExpand}
            className="font-medium text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
          >
            {t("postCard.more")}
          </button>
        </>
      )}
    </p>
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
  onArchive,
  onMute,
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
  commentPreview = true,
  // Lightbox do desktop: a mídia mora na coluna da esquerda, fora do cartão.
  hideMedia = false,
}) {
  const [commentsOpen, setCommentsOpen] = useState(initialCommentsOpen);
  const [specsOpen, setSpecsOpen] = useState(false);
  const { composerRef, panelProps: commentProps } = useCommentComposer({
    goalId: goal.id,
    onComment,
    onEditComment,
  });

  const { i18n } = useTranslation();
  const [captionOpen, setCaptionOpen] = useState(false);
  const { isSaved, toggleSaved } = useSavedPosts(currentUserId);
  const requireAccount = useRequireAccount(currentUserId ? { uid: currentUserId } : null);
  const saved = isSaved(goal.id);
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
  const textFirst =
    isFreePost && !photos.length && !goal.videoUrl && !goal.video && Boolean(goal.note);
  // No modal de publicação (desktop) os comentários já estão ao lado: o balão
  // leva o foco para o compositor em vez de abrir outra folha.
  const showComments = onCommentClick || (() => setCommentsOpen(true));

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
    // Arquivar: só no post livre. No carro da garagem o "deixar de
    // compartilhar" JÁ é o arquivo — tira do feed e o carro continua na
    // garagem — e dois itens com a mesma função é o que deixa menu confuso.
    ...(isOwner && isFreePost && onArchive
      ? [
          {
            icon: Archive,
            label: t("community.archive"),
            onClick: () => onArchive(goal),
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
    // Silenciar vem ANTES de bloquear no menu, e sem o vermelho: é a saída
    // leve, e menu bom oferece a leve primeiro. Bloquear fica por último,
    // onde moram as coisas das quais não se volta fácil.
    ...(!isOwner && onMute
      ? [
          {
            icon: BellOff,
            label: t("community.mute", { user: withoutAt(goal.username) || goal.author }),
            onClick: () => onMute(goal),
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
      <header className="flex items-center gap-2.5 px-3 py-2 sm:px-4">
        <AvatarButton
          person={goal}
          size="sm"
          onClick={() => onOpenProfile(goal.ownerId, goal)}
        />
        <div className="min-w-0 flex-1">
          {/* Linha 1: quem (o nome não encolhe antes do @). Linha 2: clube,
              horário e "editado". Selo, cargo e botão na mesma linha do nome
              faziam ele virar "Rafael ..." no celular. */}
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenProfile(goal.ownerId, goal)}
              className="-my-3 inline-flex min-h-11 min-w-0 max-w-[70%] shrink-0 items-center text-left text-[13px] font-bold text-[var(--engine-text)] transition hover:text-[var(--engine-accent-text)] sm:my-0 sm:min-h-0"
            >
              <span className="truncate">{goal.author}</span>
            </button>
            {goal.verified && (
              <ShieldCheck size={13} className="shrink-0 text-[var(--engine-accent)]" />
            )}
            {/* O @ ao lado do nome também abre o perfil: nas redes o
                arroba É o nome, e aqui só o nome respondia ao toque. */}
            <button
              type="button"
              onClick={() => onOpenProfile(goal.ownerId, goal)}
              className="min-w-0 truncate text-xs text-[var(--engine-text-muted)] transition hover:text-[var(--engine-accent-text)]"
            >
              {goal.username}
            </button>
          </div>
          {(goal.clubTag || goal.createdAt || (isModal && goal.city)) && (
            <div className="mt-px flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-[var(--engine-text-muted)]">
              {/* Post publicado a partir de um clube carrega a sigla dele: é
                  assim que a crew aparece no feed geral (CLUBES-CONTRATO §2). */}
              <ClubTag tag={goal.clubTag} className="shrink-0" />
              {goal.clubTag && goal.createdAt ? <span aria-hidden="true">·</span> : null}
              {goal.createdAt ? (
                <TimeAgo
                  value={goal.createdAt}
                  editedAt={goal.editedAt}
                  short
                  className="shrink-0 hover:text-[var(--engine-text)]"
                />
              ) : null}
              {isModal && goal.city ? (
                <span className="min-w-0 truncate">· {goal.city}</span>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Selo de curtidas do POST: só a faixa mais alta que ele bateu
              sozinho — 10K substitui 1K aqui, mas os dois continuam contando
              na aba de Conquistas do perfil (decisão da sessão de
              22/08/2026). Sem faixa batida, nada aparece. */}
          {/* Abaixo de 360px o selo empurrava o horário para baixo dele. */}
          {/* Na coluna de 380px do lightbox o selo espremia o nome. */}
          {postLikeTier && !isModal && (
            <span className="hidden min-[360px]:flex">
              <AchievementBadge tier={postLikeTier} state="unlocked" />
            </span>
          )}

          {/* "Compartilhada / Privada" diz se o carro da GARAGEM está publicado.
              Num post livre não significa nada: ele nasce no feed, e o selo só
              aparecia como "privada" porque post nenhum entra em sharedGoalIds. */}
          {isOwner && !isFreePost ? (
            <span className="text-[11px] font-semibold text-[var(--engine-text-muted)]">
              {shared ? t("community.shared") : t("community.privateDraft")}
            </span>
          ) : isOwner ? null : (
            !isFollowing && (
              <button
                type="button"
                onClick={() => onFollow(goal)}
                className="-my-3 inline-flex min-h-11 items-center rounded-full px-1.5 text-[13px] font-bold text-[var(--engine-accent-text)] transition hover:brightness-110 sm:my-0 sm:min-h-0"
              >
                {t("community.follow")}
              </button>
            )
          )}
        </div>

        <PostMenu items={menuItems} label={t("community.postOptions")} />
      </header>

      {/* Ficha ANTES da mídia, como o card de atividade do Strava: o carro e a
          meta são a manchete, a foto é a prova. Post livre só tem ficha quando
          foi publicado a partir de um carro. */}
      {(!isFreePost || goal.title) && (goal.brand || goal.model) && (
        <PostFicha
          goal={goal}
          t={t}
          language={i18n.language}
          full={isModal}
          isGoal={!isFreePost}
          progress={progress}
          rating={rating}
          onRate={(value) => onRate(goal.id, value)}
          onOpenSpecs={() => setSpecsOpen(true)}
        />
      )}

      {/* Foto e vídeo do YouTube no mesmo carrossel; vídeo nativo continua
          com o player próprio, que tem corte, capa e som definidos no envio. */}
      {!hideMedia && photos.length > 0 && (
        <PostGallery
          images={photos}
          videoUrl={goal.video ? "" : goal.videoUrl}
          alt={goal.title}
          t={t}
          onOpen={openable ? () => onOpenPost(goal.id) : undefined}
          onDoubleTap={() => {
            if (!liked) onLike(goal.id);
          }}
        />
      )}

      {hideMedia ? null : goal.video ? (
        <PostVideoPlayer video={goal.video} />
      ) : goal.videoUrl && photos.length === 0 ? (
        <PostVideo url={goal.videoUrl} t={t} />
      ) : null}

      {/* Post sem foto nem vídeo: o texto É o conteúdo, então vem antes dos
          botões. Deixar curtir e comentar acima de um card vazio fazia a ação
          aparecer antes de existir o que curtir. */}
      {textFirst && (
        <RichText
          as="p"
          text={goal.note}
          linkClassName={RICH_LINK}
          className="block whitespace-pre-line break-words px-3 pb-1 pt-0.5 text-[15px] leading-6 text-[var(--engine-text)] sm:px-4"
        />
      )}

      <div className="flex items-center px-1 sm:px-2">
        <ActionButton
          active={liked}
          title={t("community.like")}
          onClick={() => onLike(goal.id)}
          icon={<Heart size={22} fill={liked ? "currentColor" : "none"} />}
          count={likeCount}
          language={i18n.language}
        />
        <ActionButton
          title={t("community.commentsAction")}
          onClick={showComments}
          icon={<MessageCircle size={22} />}
          count={comments.length}
          language={i18n.language}
        />
        {onSendToChat && (
          <ActionButton
            title={t("messages.shareTitle")}
            onClick={() => onSendToChat(goal)}
            icon={<Send size={21} />}
          />
        )}
        <div className="ml-auto">
          <ActionButton
            title={saved ? t("postCard.unsave") : t("postCard.save")}
            pressed={saved}
            onClick={() => {
              if (requireAccount()) return;
              toggleSaved(goal.id);
            }}
            icon={<Bookmark size={21} fill={saved ? "currentColor" : "none"} />}
          />
        </div>
      </div>

      {/* Legenda à moda do Instagram: @ do autor + texto, cortada com "mais".
          No modal ela vem inteira. */}
      {goal.note && !textFirst && (
        <PostCaption
          goal={goal}
          t={t}
          full={isModal || captionOpen}
          onExpand={() => setCaptionOpen(true)}
        />
      )}

      {/* Prévia dos comentários, como no Instagram: "ver todos os N" e o
          último comentário numa linha. A conversa inteira abre por cima, na
          folha — o cartão não vira a thread. */}
      {commentPreview && comments.length > 0 && (
        <CommentPreview comments={comments} t={t} onOpen={showComments} />
      )}

      {specsOpen && (
        <SpecSheetModal car={goal} onClose={() => setSpecsOpen(false)} />
      )}

      {commentsOpen && (
        <CommentsSheet
          goal={goal}
          comments={comments}
          currentUserId={currentUserId}
          t={t}
          onClose={() => setCommentsOpen(false)}
          onOpenProfile={onOpenProfile}
          onDeleteComment={onDeleteComment}
          onReportComment={onReportComment}
          composerRef={composerRef}
          {...commentProps}
        />
      )}
    </article>
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

function ActionButton({ active = false, pressed, title, icon, onClick, count = 0, language }) {
  // Curtido: só o ícone fica vermelho. O número segue na cor do texto: o
  // acento cheio em número miúdo não passa contraste no escuro.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed ?? (active || undefined)}
      className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[var(--engine-text)] transition-colors hover:bg-[var(--engine-surface-2)]"
      title={title}
      aria-label={title}
    >
      <span className={active ? "text-[var(--engine-accent)]" : ""}>{icon}</span>
      {count > 0 && (
        <span className="text-[13px] font-semibold tabular-nums">
          {formatCount(count, language)}
        </span>
      )}
    </button>
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

/**
 * Publicação individual.
 *
 * Todo post agora tem endereço próprio (`/community?goal=<id>`): é o que as
 * notificações e o link de compartilhar abrem, em vez de só filtrar o feed.
 */
export function PostModal({ goal, loading, openComments, t, onClose, cardProps }) {
  // No desktop, post com foto vira o lightbox do Instagram: mídia à esquerda,
  // comentários numa coluna ao lado. Fora disso (celular, ou post só de
  // texto) o modal mostra SÓ o post, com a prévia dos comentários, e a
  // conversa abre na folha pelo balão — até 30/10/2026 a thread inteira vinha
  // colada embaixo do post, e o post virava cabeçalho dos comentários.
  const isWide = useMediaQuery("(min-width: 1024px)");
  // A coluna lateral de comentários só se justifica quando há mídia ocupando a
  // esquerda. Num post de texto ela deixava metade do modal vazia, com um
  // "sem comentários" gigante ao lado de duas linhas de conteúdo.
  const hasMedia = Boolean(goal?.images?.length || goal?.image || goal?.videoUrl || goal?.video);
  const sideBySide = isWide && hasMedia;
  const { composerRef, panelProps: commentProps } = useCommentComposer({
    goalId: goal?.id || "",
    onComment: cardProps.onComment,
    onEditComment: cardProps.onEditComment,
  });

  const comments = goal?.comments || [];
  const gallery = goal?.images?.length ? goal.images : goal?.image ? [goal.image] : [];
  // Lightbox como o do Instagram: o modal tem a largura da mídia + a coluna
  // de 380px, nada mais. A mídia sai da proporção do 1o item (presa entre
  // 4:5 e 1,91:1) dentro de uma caixa de no máximo min(90vh - cabeçalho,
  // 860px) de altura. Antes o painel herdava `width: 100%` do
  // .engine-modal-panel e sobrava uma faixa vazia à direita da coluna.
  // A proporção fica guardada por post: trocar de publicação não herda a
  // moldura da anterior.
  const [ratioByPost, setRatioByPost] = useState({});
  const fallbackRatio = goal?.video
    ? clampMediaRatio(goal.video.width, goal.video.height)
    : gallery.length
      ? 1
      : 16 / 9;
  const mediaRatio = (goal && ratioByPost[goal.id]) || fallbackRatio;
  const lightbox = (() => {
    if (!sideBySide) return null;
    // Os tetos vêm do tamanho que as redes de referência usam, não da tela:
    // num monitor grande o modal antigo ia a 860px de altura e 1080 de
    // largura de mídia, somava 1463 com a coluna e virava quase a janela
    // inteira — deixava de parecer um post aberto e passava a parecer outra
    // página. Com 700x720 o painel fica em no máximo ~1100px, que é a ordem
    // de grandeza do lightbox do Instagram.
    const maxHeight = Math.min(window.innerHeight * 0.86 - 54, 700);
    const maxWidth = Math.min(window.innerWidth * 0.92 - 383, 720);
    const height = Math.round(Math.min(maxHeight, maxWidth / mediaRatio));
    const width = Math.round(height * mediaRatio);
    // +380 da coluna, +1 da borda dela, +2 das bordas do painel.
    return { width, height, panelWidth: width + 383 };
  })();

  // Quem chega por notificação de comentário (`?comments=1`): no lightbox o
  // compositor já vem focado; fora dele, a folha de comentários abre direto
  // (`initialCommentsOpen` no cartão), porque o comentário é o motivo da visita.
  useEffect(() => {
    if (!openComments || !goal || !sideBySide) return;
    composerRef.current?.focus({ preventScroll: false });
  }, [openComments, goal, sideBySide, composerRef]);

  return (
    <div className="engine-modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("community.postTitle")}
        className={`engine-modal-panel engine-pop ${sideBySide ? "" : "sm:max-w-xl"}`}
        // Estilo em linha de propósito: a regra `.engine-modal-panel` (fora de
        // camada) ganha de qualquer utilitário do Tailwind 4.
        style={lightbox ? { width: lightbox.panelWidth, maxWidth: "none" } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--engine-border)] py-1.5 pl-4 pr-2">
          <h2 className="text-sm font-bold text-[var(--engine-text)]">
            {goal ? t("community.postTitle") : t("common.loading")}
          </h2>
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

        {goal && sideBySide ? (
          // Altura = a da mídia: a coluna rola por dentro, em vez de esticar o
          // modal e deixar faixa vazia embaixo de foto paisagem.
          <div className="flex min-h-0 flex-none" style={{ height: lightbox.height }}>
            {/* Mídia à esquerda, do tamanho da proporção dela. */}
            <div
              className="flex shrink-0 items-center justify-center overflow-hidden bg-[var(--engine-surface-2)]"
              style={{ width: lightbox.width, height: lightbox.height }}
            >
              {gallery.length > 0 ? (
                <PostGallery
                  images={gallery}
                  videoUrl={goal.video ? "" : goal.videoUrl}
                  alt={goal.title}
                  t={t}
                  box={{ maxWidth: lightbox.width, maxHeight: lightbox.height }}
                  onRatio={(value) =>
                    setRatioByPost((current) =>
                      current[goal.id] === value ? current : { ...current, [goal.id]: value },
                    )
                  }
                  onDoubleTap={() => {
                    if (!cardProps.interactions?.liked) cardProps.onLike(goal.id);
                  }}
                />
              ) : goal.video ? (
                <div className="w-full">
                  <PostVideoPlayer video={goal.video} autoPlay={false} />
                </div>
              ) : (
                <div className="w-full">
                  <PostVideo url={goal.videoUrl} t={t} />
                </div>
              )}
            </div>

            {/* Coluna da direita: autor, ficha, legenda inteira e ações em
                cima; a conversa rola embaixo, com o compositor preso ao pé. */}
            <div className="flex min-h-0 w-[380px] shrink-0 flex-col border-l border-[var(--engine-border)]">
              <div className="engine-scroll max-h-[55%] shrink-0 overflow-y-auto border-b border-[var(--engine-border)]">
                <GoalCard
                  {...cardProps}
                  goal={goal}
                  t={t}
                  variant="modal"
                  hideMedia
                  // A lista já está logo abaixo: o balão só leva ao compositor.
                  commentPreview={false}
                  onCommentClick={() => composerRef.current?.focus()}
                />
              </div>
              <CommentsPanel
                goal={goal}
                comments={comments}
                currentUserId={cardProps.currentUserId}
                t={t}
                onOpenProfile={cardProps.onOpenProfile}
                onDeleteComment={cardProps.onDeleteComment}
                onReportComment={cardProps.onReportComment}
                composerRef={composerRef}
                {...commentProps}
              />
            </div>
          </div>
        ) : goal ? (
          <div className="engine-scroll engine-safe-bottom min-h-0 flex-1 overflow-y-auto">
            <GoalCard
              // A chave troca com o post: `initialCommentsOpen` é estado
              // inicial, e o mesmo cartão reaproveitado não reabriria a
              // folha ao trocar de publicação.
              key={goal.id}
              {...cardProps}
              goal={goal}
              t={t}
              variant="modal"
              initialCommentsOpen={openComments}
            />
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
  const topLevelTab = ["clubes", "eventos", "carros"].includes(rawTab) ? rawTab : "goals";
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
  const [mutedUserIds, setMutedUserIds] = useState([]);
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
  const mutedSet = useMemo(() => new Set(mutedUserIds), [mutedUserIds]);

  const goals = useMemo(
    () =>
      communityGoals
        // Bloquear some com a publicação e também com os comentários da
        // pessoa nos posts dos outros — meia-medida não é bloqueio.
        .filter((goal) => !blockedSet.has(goal.ownerId))
        // Silenciar tira a pessoa DO FEED e para por aí: os comentários dela
        // continuam onde estão, e o perfil dela continua inteiro. Quem some
        // de tudo é o bloqueado — a diferença entre os dois é justamente
        // essa, e apagar o silenciado de todo canto o transformaria num
        // bloqueio que não avisa que é um.
        .filter((goal) => !mutedSet.has(goal.ownerId))
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
    [blockedSet, mutedSet, carsById, communityGoals, profiles, user?.uid],
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

    engineDB
      .getMutedUsers(user?.uid)
      .then((ids) => {
        if (alive) setMutedUserIds(ids);
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

  const handleComment = async (goalId, comment, replyTo = "") => {
    if (requireAccount(`${goalPath(goalId)}&comments=1`)) return;
    try {
      await engineDB.addCommunityComment(goalId, comment, user?.uid, replyTo);
      flash(t(replyTo ? "community.replySaved" : "community.commentSaved"));
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

  /**
   * Toque no nome ou na foto de alguém abre o perfil da pessoa.
   *
   * Antes isso abria uma espiada em modal, que mostrava metade das coisas e
   * ainda obrigava a voltar pra ver o resto. Rede social nenhuma faz isso: o
   * perfil é uma página. A rota resolve por @, então quando o card não traz
   * o @ a gente busca o perfil só pra descobrir pra onde ir.
   */
  const handleOpenProfile = async (profileUserId, fallback = {}) => {
    const known = withoutAt(
      fallback.username || profiles[profileUserId]?.username || "",
    );
    if (known) {
      navigate(`/community/@${known}`);
      return;
    }
    if (!profileUserId) return;

    try {
      const profile = await engineDB.getPublicProfile(profileUserId);
      const username = withoutAt(profile?.username || "");
      if (username) navigate(`/community/@${username}`);
      else flash(t("community.profileUnavailable"), "error");
    } catch (error) {
      console.error(error);
      flash(t("community.profileUnavailable"), "error");
    }
  };

  // Link antigo de perfil: /community?user=<uid>. Continua funcionando —
  // leva pra página da pessoa em vez de abrir o modal que não existe mais.
  useEffect(() => {
    if (!openProfileId) {
      handledProfileId.current = "";
      return undefined;
    }
    if (handledProfileId.current === openProfileId) return undefined;

    handledProfileId.current = openProfileId;
    const timer = window.setTimeout(() => {
      closeParamModal("user");
      handleOpenProfile(openProfileId, profiles[openProfileId] || {});
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openProfileId, profiles]);

  // Arquivar: sai do ar para todo mundo (inclusive para mim) e fica no
  // arquivo do perfil, de onde volta inteiro.
  const handleArchive = async (goal) => {
    if (requireAccount(goalPath(goal.id))) return;
    const ok = await confirm({
      title: t("community.archive"),
      message: t("community.archiveConfirm"),
      confirmLabel: t("community.archive"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    try {
      await setPostArchived(goal.id, true);
      flash(t("community.archived"));
    } catch (error) {
      flashWriteError(error);
    }
  };

  // Silenciar: some do meu feed e mais nada. Sem confirmação com cara de
  // decisão grave — é reversível num toque e ninguém é avisado.
  const handleMute = async (goal) => {
    if (requireAccount(goalPath(goal.id)) || !goal.ownerId) return;
    try {
      await engineDB.setUserMuted(goal.ownerId, true, user?.uid);
      setMutedUserIds((ids) => (ids.includes(goal.ownerId) ? ids : [...ids, goal.ownerId]));
      flash(t("community.muted", { user: withoutAt(goal.username) || goal.author }));
    } catch (error) {
      flashWriteError(error);
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
      flash(
        error?.code === "too-many-hashtags"
          ? t("socialPosts.errors.tooManyHashtags", { max: 30 })
          : t("community.captionError"),
        "error",
      );
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
    { id: "carros", label: t("cars.tab"), icon: CarFront },
    ...(hasRail ? [] : [{ id: "ranking", label: t("community.tabs.ranking"), icon: Trophy }]),
    { id: "clubes", label: t("community.tabs.clubs"), icon: Building },
    { id: "eventos", label: t("community.tabs.events"), icon: Calendar },
  ];

  const activeSectionRef = useRef(null);

  /* Abas de primeiro nível vivem na URL (?tab=). "goals" guarda ainda uma
     sub-aba própria (feed/vídeos/ranking); clubes e eventos não têm. */
  const TOP_LEVEL = ["clubes", "eventos", "carros"];
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
            {/* A borda direita esmaece no celular: é o sinal de que a tira rola
                (em 320px só cabem ~1,5 abas ao lado dos botões). */}
            <div className="engine-scroll-x flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-full bg-[var(--engine-surface-2)] p-1 pr-6 [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] sm:gap-0 sm:overflow-visible sm:pr-1 sm:[mask-image:none]">
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
                    {/* No celular o ícone sai: medido em 04/11/2026 num
                        Galaxy de 360px ele custava 21px por aba e sobrava
                        meia aba visível. O rótulo é o que a pessoa lê. */}
                    <Icon size={15} className="hidden shrink-0 sm:block" />
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
                className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--engine-accent)] text-white transition hover:brightness-95 sm:flex xl:hidden"
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
                className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:flex"
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
                    <>
                    <div className="mb-4 flex items-center gap-2">
                    <label className="engine-field flex h-11 w-full min-w-0 flex-1 items-center gap-2.5 rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface)] pl-4 pr-1.5">
                      <Search size={16} className="shrink-0 text-[var(--engine-text-subtle)]" />
                      <input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        // "#tag" + Enter abre a página da hashtag.
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || !query.trim().startsWith("#")) return;
                          const tag = normalizeTag(query);
                          if (!tag) return;
                          event.preventDefault();
                          navigate(tagPath(tag));
                        }}
                        enterKeyHint="search"
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
                    {/* No celular este botão saiu da barra de abas pra não
                        disputar largura com os rótulos. Aqui é o lugar certo:
                        quem abre a busca está procurando alguém ou alguma
                        coisa. No desktop ele continua na barra. */}
                    <button
                      type="button"
                      onClick={() => setPeopleModalOpen(true)}
                      title={t("community.discoverPeople")}
                      aria-label={t("community.discoverPeople")}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:hidden"
                    >
                      <UserPlus size={18} />
                    </button>
                    </div>
                      <TrendingTags className="-mt-2 mb-4" />
                    </>
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
                            onArchive={handleArchive}
                            onMute={handleMute}
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

              {/* Vídeos enviados, um por tela (Reels). Até 02/11/2026 a aba
                  era um aviso "em breve" fixo. */}
              {activeSubTab === "videos" && <ReelsFeed user={user} blockedIds={blockedUserIds} />}

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

          {/* Acervo dos carros do Engine. Feed é momento; isto é catálogo. */}
          {topLevelTab === "carros" && <CarsTab region={region} user={user} />}
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

            <TrendingTags variant="list" />

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

      {/* Publicar no celular: botão flutuante, como Instagram e X.
          Vai pelo portal porque um `fixed` dentro de ancestral com
          backdrop-filter passa a se posicionar em relação a ele, não à tela —
          armadilha que já custou um modal aqui. O CSS o faz pousar acima da
          barra de abas e sumir enquanto o convite de instalação está na tela. */}
      {topLevelTab === "goals" &&
        createPortal(
          <button
            type="button"
            onClick={() => {
              if (requireAccount("/community?compose=1")) return;
              setPostModalOpen(true);
            }}
            aria-label={t("feedPost.action")}
            /* Onde ele aparece é decisão do CSS, não daqui: o `sm:hidden`
               que morava nesta linha perdia para o `display: flex` da
               classe e nunca escondeu nada. */
            className="engine-compose-fab"
          >
            <Plus size={24} />
          </button>,
          document.body,
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
            onArchive: handleArchive,
            onMute: handleMute,
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
        <CaptionEditor
          goal={captionGoal}
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
                <PersonLink username={goal.username} className="hover:text-[var(--engine-accent)]">
                  {goal.username}
                </PersonLink>
                {` · ${goal.likes} likes · ${getProgress(goal).toFixed(0)}%`}
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
                <PersonLink
                  username={goal.username}
                  className="block text-xs font-bold uppercase tracking-widest text-[var(--engine-text-subtle)] hover:text-[var(--engine-accent)]"
                >
                  {goal.author} / {goal.username}
                </PersonLink>
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
