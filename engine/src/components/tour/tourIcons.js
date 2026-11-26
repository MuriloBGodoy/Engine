import {
  BriefcaseBusiness,
  Calendar,
  Car,
  CircleHelp,
  Compass,
  LayoutDashboard,
  MessageCircle,
  Search,
  Settings,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

/**
 * O ícone de cada seção e de cada capítulo do guia, pelo nome.
 *
 * Mora fora dos dois componentes porque os dois precisam do mesmo mapa: a
 * folha de ajuda mostra o ícone da tela, e o cartão do guia mostra o do
 * capítulo. Duas cópias divergiriam no primeiro ícone trocado — e aí a
 * mesma área apareceria com dois desenhos diferentes na mesma sessão.
 */
export const TOUR_ICONS = {
  home: Compass,
  car: Car,
  users: Users,
  briefcase: BriefcaseBusiness,
  calendar: Calendar,
  search: Search,
  chart: LayoutDashboard,
  message: MessageCircle,
  user: UserRound,
  settings: Settings,
  sparkles: Sparkles,
};

export const tourIcon = (nome) => TOUR_ICONS[nome] || CircleHelp;
