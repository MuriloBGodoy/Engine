import { createElement } from "react";
import {
  Calculator,
  CalendarCheck,
  CalendarPlus,
  Crown,
  Flag,
  Fuel,
  Gauge,
  Heart,
  Key,
  Megaphone,
  MessageCircle,
  NotebookPen,
  PenLine,
  PiggyBank,
  Receipt,
  Repeat,
  Ticket,
  Trophy,
  Users,
  UsersRound,
} from "lucide-react";
import { seriesOf } from "../../services/achievementTiers";

/**
 * Ícone por marco. Os quatro primeiros vêm do vocabulário que o produto já
 * usava (Flag no menu do post, Trophy em meta batida, Key no carro que já é
 * seu, Users em seguidores); os do catálogo de 06/10/2026 seguem a mesma ideia:
 * o ícone da ação que dá a conquista.
 *
 * Ids fechados pela regra do Firestore (ver `src/services/achievementTiers.js`).
 */
export const MILESTONE_ICON = {
  first_goal: Flag,
  first_conquest: Trophy,
  owned_car: Key,
  followers_1000: Users,
  first_contribution: PiggyBank,
  halfway: Gauge,
  first_expense: Receipt,
  measured_consumption: Fuel,
  first_post: PenLine,
  first_comment: MessageCircle,
  club_joined: UsersRound,
  club_founder: Crown,
  club_first_post: Megaphone,
  event_rsvp: CalendarCheck,
  event_organizer: CalendarPlus,
  first_simulation: Calculator,
};

/** Ícone de cada série com degraus. */
export const SERIES_ICON = {
  streak: Repeat,
  expenses: NotebookPen,
  likes: Heart,
  followers: Users,
  club_members: UsersRound,
  event_attendees: Ticket,
};

/** Ícone de qualquer id: marco ou degrau de série. */
export function achievementIcon(id) {
  if (MILESTONE_ICON[id]) return MILESTONE_ICON[id];
  const serie = seriesOf(id);
  return serie ? SERIES_ICON[serie.series] : Trophy;
}

/**
 * O ícone de um id já desenhado. Componente fixo, para quem renderiza não
 * criar um componente novo a cada render (o que o React reinicia).
 */
export function AchievementIcon({ id, ...props }) {
  const Icon = achievementIcon(id);
  return Icon ? createElement(Icon, props) : null;
}

/**
 * "1000" -> "1K", "1000000" -> "1M". Decisão da sessão de 22/08/2026: o
 * degrau de curtidas não tem nome, só o número por extenso — e essa
 * abreviação (K/M) é lida igual nos três idiomas do produto, então não
 * passa por i18n.
 */
export function formatTierLabel(tier) {
  if (tier >= 1_000_000) return `${tier / 1_000_000}M`;
  if (tier >= 1_000) return `${tier / 1_000}K`;
  return String(tier);
}

/**
 * Nome de qualquer id, para toast, celebração e aba. Marco tem nome próprio
 * (`achievements.items.<id>.name`); degrau de série é o nome da série com o
 * número ("10 curtidas", "Constância: 3 meses").
 */
export function achievementName(t, language, id) {
  const serie = seriesOf(id);
  if (!serie) return t(`achievements.items.${id}.name`);
  return t(`achievements.series.${serie.series}.tier`, {
    alvo: new Intl.NumberFormat(language).format(serie.tier),
    count: serie.tier,
  });
}
