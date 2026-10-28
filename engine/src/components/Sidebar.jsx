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
  Sparkles,
  Users,
} from "lucide-react";
import { auth } from "../services/supabase";
import { authPath } from "../services/authRedirect";
import { useSignOut } from "../hooks/useSignOut";
import { publicUsername } from "../services/db";
import { useTranslation } from "react-i18next";
import { useUnreadMessages } from "../hooks/useUnreadMessages";
import { Logo } from "./Logo";
import { GuestLoginHint } from "./GuestLoginHint";
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

export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  profileSettings = {},
  privacySettings = {},
  user: userProp,
  className = "",
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const user = userProp || auth.currentUser;
  const isGuest = !user;
  const displayName = profileSettings.displayName || user?.displayName;
  const avatar = profileSettings.avatar || user?.photoURL;
  const username = publicUsername(profileSettings.username, user?.uid);
  const showEmail = privacySettings.showEmailInSidebar !== false;
  const unreadMessages = useUnreadMessages(user?.uid);

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
    { name: t("nav.settings"), path: "/settings", icon: Settings },
  ];

  const isActivePath = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const profileAvatar = (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--engine-accent)] text-xs font-bold text-white">
      {avatar ? (
        <img
          src={avatar}
          alt={displayName || "Perfil"}
          className="h-full w-full object-cover"
        />
      ) : (
        getInitials(displayName)
      )}
    </div>
  );

  return (
    <aside
      className={`h-[100dvh] shrink-0 flex-col overflow-hidden border-r border-[var(--engine-border)] bg-[var(--engine-surface)] transition-[width] duration-300 ease-out ${
        collapsed ? "w-[76px]" : "w-[260px]"
      } ${className}`}
    >
      {/* Marca */}
      <div
        className={`flex h-[68px] shrink-0 items-center border-b border-[var(--engine-border)] ${
          collapsed ? "justify-center px-3" : "px-5"
        }`}
      >
        <Logo collapsed={collapsed} markSize={32} />
      </div>

      {/* Navegação — min-h-0 permite que ela role em vez de empurrar o perfil
          para fora da tela quando a altura aperta (era o corte na base). */}
      <nav className="engine-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {menuItems.map((item) => {
          const active = isActivePath(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.name : undefined}
              className={`group relative flex h-11 items-center rounded-xl text-[14px] font-medium transition-colors ${
                collapsed ? "mx-auto w-11 justify-center" : "gap-3 px-3"
              } ${
                active
                  ? "bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                  : "text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
              }`}
            >
              {active && !collapsed && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--engine-accent)]" />
              )}
              <span className="relative shrink-0">
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                {/* Recolhida, a sidebar só tem espaço para um ponto */}
                {item.badge > 0 && collapsed && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--engine-accent)] ring-2 ring-[var(--engine-surface)]" />
                )}
              </span>
              {/* Recolhida: só o ícone (centralizado no quadrado). O rótulo,
                  mesmo invisível, empurrava o ícone e fazia o destaque
                  parecer vazar para a direita. */}
              {!collapsed && (
                <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap">
                  <span className="truncate">{item.name}</span>
                  {item.badge > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--engine-accent)] px-1.5 text-[10px] font-black text-white">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </span>
              )}
            </Link>
          );
        })}
        {/* Instalar o app — só aparece quando o navegador permite. Fica no
            menu, e não na base, porque a dica de visitante (GuestLoginHint)
            ocupa a base da barra e cobria o botão. */}
        <InstallButton variant="sidebar" collapsed={collapsed} />

        {/* Planos fica de fora da lista principal de propósito: é um link
            discreto, abaixo das áreas do app, e não uma área a mais. */}
        <div className="mt-3 border-t border-[var(--engine-border)] pt-3">
          <Link
            to="/planos"
            title={collapsed ? t("nav.plans") : undefined}
            aria-label={collapsed ? t("nav.plans") : undefined}
            className={`flex h-10 items-center rounded-xl text-[13px] font-medium transition-colors ${
              collapsed ? "mx-auto w-11 justify-center" : "gap-3 px-3"
            } ${
              isActivePath("/planos")
                ? "text-[var(--engine-accent)]"
                : "text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
            }`}
          >
            <Sparkles size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{t("nav.plans")}</span>}
          </Link>
        </div>
      </nav>

      {/* Recolher / expandir — carrinho que acelera no hover */}
      <div className="shrink-0 px-3 pb-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
          className="engine-car-toggle flex h-10 w-full items-center justify-center rounded-xl text-[var(--engine-text-subtle)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
        >
          <span className="relative flex h-5 w-9 items-center justify-center">
            <span
              className="engine-car-line"
              style={{ top: "22%", right: "58%", width: "11px" }}
            />
            <span
              className="engine-car-line"
              style={{ top: "50%", right: "56%", width: "15px" }}
            />
            <span
              className="engine-car-line"
              style={{ top: "78%", right: "58%", width: "9px" }}
            />
            <Car
              className="engine-car shrink-0"
              size={22}
              strokeWidth={2.1}
              style={{ transform: collapsed ? "scaleX(-1)" : "none" }}
            />
          </span>
        </button>
      </div>

      {/* Perfil / logout — para visitante vira o acesso ao login.
          pb generoso garante folga da borda inferior mesmo quando a UI do
          navegador/SO come alguns pixels na base da viewport. */}
      <div className="shrink-0 border-t border-[var(--engine-border)] px-3 pt-3 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        {isGuest ? (
          <div className="relative">
            <Link
              to={authPath("/login", here)}
              title={t("nav.login")}
              aria-label={t("nav.login")}
              className={`flex h-11 items-center rounded-xl bg-[var(--engine-accent)] font-semibold text-white transition hover:brightness-95 ${
                collapsed ? "mx-auto w-11 justify-center" : "gap-2 px-3 text-[13px]"
              }`}
            >
              <LogIn size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{t("nav.login")}</span>}
            </Link>
            {/* Dica contextual só faz sentido com a sidebar expandida. */}
            {!collapsed && <GuestLoginHint placement="top" />}
          </div>
        ) : (
          <div
            className={`flex items-center rounded-xl p-2 ${
              collapsed ? "justify-center" : "gap-3"
            }`}
          >
            <Link
              to={username ? `/community/${username}` : "/community"}
              title={t("settings.sections.profile")}
              className="shrink-0 rounded-full transition-transform active:scale-95"
            >
              {profileAvatar}
            </Link>
            <div
              className={`min-w-0 flex-1 overflow-hidden transition-all duration-300 ${
                collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              }`}
            >
              <p className="truncate text-[13px] font-semibold text-[var(--engine-text)]">
                {displayName || t("settings.sections.profile")}
              </p>
              {showEmail && user?.email && (
                <p className="truncate text-[11px] font-medium text-[var(--engine-text-subtle)]">
                  {user.email}
                </p>
              )}
            </div>
            {!collapsed && (
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-subtle)] transition-colors hover:bg-[var(--engine-accent-soft)] hover:text-[var(--engine-accent)]"
                title={t("nav.logout")}
                aria-label={t("nav.logout")}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
