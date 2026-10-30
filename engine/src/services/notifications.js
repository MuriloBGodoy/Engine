import {
  BadgeDollarSign,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Heart,
  MessageCircle,
  RotateCcw,
  Send,
  Trophy,
  Star,
  UserPlus,
  XCircle,
} from "lucide-react";
import { localISODate } from "./reminders";
import { reminderNotificationCopy } from "./reminderLabels";

/**
 * Rótulos, ícones e textos das notificações — fora do componente para que o
 * arquivo do painel exporte só o componente (regra do fast refresh).
 */
const notificationLabels = {
  follow: "Novo seguidor",
  like: "Curtida",
  comment: "Comentário",
  rating: "Avaliação",
  service_approved: "Anúncio aprovado",
  service_changes_requested: "Anúncio retornado",
  service_rejected: "Anúncio recusado",
  service_suspended: "Anúncio tirado do ar",
  message: "Nova mensagem",
  garage_reminder: "Lembrete da garagem",
};

export const notificationStyles = {
  follow: { icon: UserPlus, iconClass: "text-sky-500" },
  like: { icon: Heart, iconClass: "text-red-500" },
  comment: { icon: MessageCircle, iconClass: "text-violet-500" },
  rating: { icon: Star, iconClass: "text-amber-500" },
  service_approved: { icon: CheckCircle2, iconClass: "text-emerald-500" },
  service_changes_requested: { icon: RotateCcw, iconClass: "text-sky-500" },
  service_rejected: { icon: XCircle, iconClass: "text-red-500" },
  service_suspended: { icon: XCircle, iconClass: "text-red-500" },
  message: { icon: Send, iconClass: "text-[var(--engine-accent)]" },
  achievement: { icon: Trophy, iconClass: "text-[var(--engine-accent)]" },
  garage_reminder: { icon: CalendarClock, iconClass: "text-amber-500" },
  quote_request: { icon: ClipboardList, iconClass: "text-[var(--engine-accent)]" },
  quote_reply: { icon: BadgeDollarSign, iconClass: "text-emerald-500" },
};

export const defaultNotificationStyle = {
  icon: Bell,
  iconClass: "text-slate-500",
};

export const formatNotificationTime = (createdAt) => {
  const date = createdAt?.toDate?.() || (createdAt ? new Date(createdAt) : null);
  if (!date || Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const getNotificationTarget = (notification) => {
  if (notification.targetPath) return notification.targetPath;

  if (notification.conversationId)
    return `/messages/${notification.conversationId}`;

  // Publicação: abre o post no modal (e já com os comentários, quando o
  // alerta é justamente sobre um comentário).
  if (notification.goalId) {
    const goal = `/community?goal=${encodeURIComponent(notification.goalId)}`;
    return notification.type === "comment" ? `${goal}&comments=1` : goal;
  }

  if (notification.serviceId) return "/services";

  // Sem meta: leva ao perfil de quem interagiu.
  if (["follow", "like", "comment", "rating"].includes(notification.type)) {
    return notification.actorId
      ? `/community?user=${encodeURIComponent(notification.actorId)}`
      : "/community";
  }

  return "";
};

// Tipos que a tela traduz no idioma de quem LÊ. Desde 25/10/2026 o banco
// grava só o tipo e os dados (nome de quem agiu, título do post); antes o
// título e o corpo iam prontos, em pt-BR, escritos por quem mandava — e eram
// texto livre, a porta do golpe "Anúncio recusado — clique aqui".
const TRANSLATED_TYPES = new Set([
  "follow", "like", "comment", "rating", "message", "achievement",
  "service_approved", "service_changes_requested", "service_rejected", "service_suspended",
  "quote_request", "quote_reply",
]);

// Pedido de orçamento: o aviso traz o id da categoria ("body-paint"); o
// rótulo é o mesmo de Serviços (services.categories.bodyPaint).
const quoteCategoryLabel = (category, t) =>
  category
    ? t(`services.categories.${String(category).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`)
    : "";

/**
 * Título e corpo de um aviso. `t` (i18next) traduz pelo tipo; `nameOf` dá o
 * nome de uma conquista. Sem `t` cai no texto pt-BR antigo.
 */
export const getNotificationCopy = (notification, t, nameOf, locale = "pt-BR") => {
  // Lembrete da garagem: "IPVA vence em 7 dias", com o "quando" calculado na
  // hora em que a pessoa LÊ (o aviso pode ficar dias no sino).
  if (t && notification.type === "garage_reminder") {
    return reminderNotificationCopy(notification, t, locale, localISODate());
  }
  const actor = notification.actorName || "";
  if (t && TRANSLATED_TYPES.has(notification.type)) {
    const vars = {
      actor: actor || t("notifications.someone"),
      title: notification.goalTitle || notification.serviceTitle || "",
      achievement:
        notification.type === "achievement" && notification.achievementId && nameOf
          ? nameOf(notification.achievementId)
          : "",
      category: quoteCategoryLabel(notification.quoteCategory, t),
      city: notification.quoteCity || "",
    };
    return {
      title: t(`notifications.types.${notification.type}.title`, vars),
      body: t(`notifications.types.${notification.type}.body`, vars),
    };
  }

  if (notification.notificationTitle || notification.notificationBody) {
    return {
      title:
        notification.notificationTitle ||
        notificationLabels[notification.type] ||
        "Notificação",
      body: notification.notificationBody || "",
    };
  }

  const fallbackActor = actor || "Alguém";
  const byType = {
    like: { title: "Nova curtida", body: `${fallbackActor} curtiu sua publicação.` },
    comment: { title: "Novo comentário", body: `${fallbackActor} comentou na sua publicação.` },
    rating: { title: "Nova avaliação", body: `${fallbackActor} avaliou sua publicação.` },
    follow: { title: "Novo seguidor", body: `${fallbackActor} começou a seguir você.` },
    message: { title: "Nova mensagem", body: `${fallbackActor} te enviou uma mensagem.` },
  };

  return (
    byType[notification.type] || {
      title: notificationLabels[notification.type] || "Notificação",
      body: notification.text || "",
    }
  );
};

// Tipo de aviso → chave em `settings.notifications`. O que não está aqui
// (status de anúncio) é aviso sobre a conta e não se desliga, como o
// "sua conta" do Instagram.
const notificationPreferenceByType = {
  like: "likes",
  rating: "likes",
  comment: "comments",
  follow: "follows",
  message: "messages",
  achievement: "achievements",
  // O job do servidor já não manda para quem desligou; isto esconde os que
  // chegaram antes de desligar.
  garage_reminder: "garageReminders",
};

export const NOTIFICATION_PREFERENCES = [
  "likes",
  "comments",
  "follows",
  "messages",
  "achievements",
];

/**
 * Filtro de quem RECEBE: quem notifica não lê as preferências alheias (elas
 * moram em `users/{uid}/private`). O aviso desligado continua gravado e
 * simplesmente não aparece no sino — religar traz o histórico de volta.
 */
export const isNotificationMuted = (notification, preferences = {}) => {
  const key = notificationPreferenceByType[notification?.type];
  return Boolean(key) && preferences[key] === false;
};
