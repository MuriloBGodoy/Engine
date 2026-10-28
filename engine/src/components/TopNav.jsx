import { Link, useLocation } from "react-router-dom";
import {
  Car,
  BriefcaseBusiness,
  Calendar,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageCircle,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";
import { authPath } from "../services/authRedirect";
import { useSignOut } from "../hooks/useSignOut";
import { publicUsername } from "../services/db";
import { useTranslation } from "react-i18next";
import { useUnreadMessages } from "../hooks/useUnreadMessages";
import { useServiceAdmin } from "../hooks/useServiceAdmin";
import { Logo } from "./Logo";
import { Topbar } from "./TopBar";
import { GuestLoginHint } from "./GuestLoginHint";
import { RegionPicker } from "./RegionPicker";
import { InstallButton } from "./InstallButton";

const getInitials = (name) => {
  if (!name) return "U";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

/**
 * Layout de navegação horizontal (alternativa à Sidebar). Desktop-only —
 * no mobile continua valendo o MobileNav. Embute as ações globais
 * (notificações, tema, idioma) da Topbar à direita.
 */
export function TopNav({
  settings,
  onSettingsUpdate,
  user,
  profileSettings = {},
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const isGuest = !user;
  const displayName = profileSettings.displayName || user?.displayName;
  const avatar = profileSettings.avatar || user?.photoURL;
  const username = publicUsername(profileSettings.username, user?.uid);
  const unreadMessages = useUnreadMessages(user?.uid);
  // Moderação: só para quem o banco diz que é admin (is_service_admin).
  const { isAdmin } = useServiceAdmin(user);
  const moderationActive = location.pathname.startsWith("/moderacao");

  // Sair pede confirmação (ver useSignOut).
  const handleLogout = useSignOut();
  const here = `${location.pathname}${location.search}`;

  const menuItems = [
    { name: t("nav.home"), path: "/", icon: Home },
    { name: t("nav.dashboard"), path: "/dashboard", icon: LayoutDashboard },
    { name: t("nav.garage"), path: "/garagem", icon: Car },
    { name: t("nav.community"), path: "/community", icon: Users },
    {
      name: t("nav.messages"),
      path: "/messages",
      icon: MessageCircle,
      badge: unreadMessages,
    },
    { name: t("nav.services"), path: "/services", icon: BriefcaseBusiness },
    { name: t("nav.events"), path: "/events", icon: Calendar },
  ];
  // Configurações vai como ícone à direita, junto do avatar: com ela, oito
  // itens com nome não cabiam na faixa e se espremiam uns nos outros.
  const settingsActive = location.pathname.startsWith("/settings");

  const isActivePath = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <header className="sticky top-0 z-40 hidden border-b border-[var(--engine-border)] bg-[var(--engine-bg)]/85 backdrop-blur-xl lg:block">
      {/* Mais largo que o engine-container (1200px) do conteúdo: o menu com
          nomes precisa de ~1150px só para os itens e as ações. */}
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-4 px-6 lg:px-10">
        <Link to="/" className="shrink-0">
          <Logo markSize={30} />
        </Link>

        <nav className="ml-2 flex min-w-0 items-center gap-0.5">
          {menuItems.map((item) => {
            const active = isActivePath(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.name}
                aria-label={item.name}
                className={`flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                    : "text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
                }`}
              >
                <span className="relative">
                  <Icon size={17} strokeWidth={active ? 2.4 : 2} />
                  {item.badge > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-[var(--engine-accent)]" />
                  )}
                </span>
                <span className="hidden xl:inline">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <InstallButton variant="topnav" />
          <RegionPicker compact className="mr-1" />
          {isGuest ? (
            <div className="relative">
              <Link
                to={authPath("/login", here)}
                title={t("nav.login")}
                className="flex h-9 items-center gap-2 rounded-full bg-[var(--engine-accent)] px-4 text-[13px] font-semibold text-white transition hover:brightness-95"
              >
                <LogIn size={17} />
                {t("nav.login")}
              </Link>
              <GuestLoginHint placement="bottom-right" />
            </div>
          ) : (
            <>
              <Topbar
                settings={settings}
                onSettingsUpdate={onSettingsUpdate}
                user={user}
              />
              {isAdmin && (
                <Link
                  to="/moderacao"
                  title={t("nav.moderation")}
                  aria-label={t("nav.moderation")}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                    moderationActive
                      ? "bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                      : "text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
                  }`}
                >
                  <ShieldAlert size={20} strokeWidth={moderationActive ? 2.4 : 2} />
                </Link>
              )}
              <Link
                to="/settings"
                title={t("nav.settings")}
                aria-label={t("nav.settings")}
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                  settingsActive
                    ? "bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                    : "text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
                }`}
              >
                <Settings size={20} strokeWidth={settingsActive ? 2.4 : 2} />
              </Link>
              <span className="mx-1.5 h-6 w-px bg-[var(--engine-border)]" />
              <Link
                to={username ? `/community/${username}` : "/community"}
                title={t("settings.sections.profile")}
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--engine-accent)] text-xs font-bold text-white transition-transform active:scale-95"
              >
                {avatar ? (
                  <img
                    src={avatar}
                    alt={displayName || "Perfil"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getInitials(displayName)
                )}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--engine-text-subtle)] transition-colors hover:bg-[var(--engine-accent-soft)] hover:text-[var(--engine-accent)]"
                title={t("nav.logout")}
                aria-label={t("nav.logout")}
              >
                <LogOut size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
