import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Car,
  BriefcaseBusiness,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageCircle,
  Users,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import { publicUsername } from "../services/db";
import { useTranslation } from "react-i18next";
import { useUnreadMessages } from "../hooks/useUnreadMessages";
import { Logo } from "./Logo";
import { Topbar } from "./TopBar";
import { GuestLoginHint } from "./GuestLoginHint";
import { RegionPicker } from "./RegionPicker";

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
 * Navegação mobile compartilhada pelos dois layouts (sidebar e top-nav):
 * header fixo no topo + barra de abas fixa embaixo. Só aparece em telas < lg.
 *
 * A barra de baixo leva as 5 áreas principais — com 6 itens os rótulos
 * ("Comunidade", "Configurações") não cabem num celular de 360px e viravam
 * texto cortado. Ajustes ficam no header, junto do avatar.
 *
 * Essa regra chegou a ser furada: Eventos entrou como sétima aba e o rótulo foi
 * baixado para 7px para caber. Medido em 21/08/2026, dava 51px por aba num
 * iPhone 14 (a diretriz da Apple pede que a aba não fique abaixo de 78pt) e um
 * rótulo que ninguém lê. Voltamos a cinco:
 *
 *   - Mensagens virou ícone com contador aqui no header, que é onde Instagram
 *     e X põem a caixa de entrada.
 *   - Eventos virou a terceira aba de Comunidade, ao lado de Metas e Clubes.
 *     A rota /events continua existindo e é o que o menu do desktop usa.
 *
 * Se um dia entrar uma área nova, ela tira outra da barra — não vira a sexta.
 *
 * Área segura (13/09/2026, WebKit): no PWA a barra de status é translúcida
 * (`black-translucent` no index.html) e o conteúdo passa por baixo dela — o
 * header tinha `py-2.5` e ficava atrás do relógio em todo iPhone com notch;
 * daí o `env(safe-area-inset-top)` no topo. A barra de abas é `fixed`, então
 * o padding lateral do body não a alcança: em landscape a primeira aba ficava
 * debaixo do notch; daí os env() laterais. A classe `engine-mobile-nav` é o
 * gancho que o index.css usa para o convite de instalação subir acima dela.
 */
export function MobileNav({
  profileSettings = {},
  settings,
  onSettingsUpdate,
  user,
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = user || auth.currentUser;
  const isGuest = !currentUser;
  const displayName = profileSettings.displayName || currentUser?.displayName;
  const avatar = profileSettings.avatar || currentUser?.photoURL;
  const username = publicUsername(profileSettings.username, currentUser?.uid);
  const unreadMessages = useUnreadMessages(currentUser?.uid);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Erro ao deslogar:", error);
    }
  };

  const menuItems = [
    { name: t("nav.home"), path: "/", icon: Home },
    { name: t("nav.dashboard"), path: "/dashboard", icon: LayoutDashboard },
    { name: t("nav.garage"), path: "/garagem", icon: Car },
    { name: t("nav.community"), path: "/community", icon: Users },
    { name: t("nav.services"), path: "/services", icon: BriefcaseBusiness },
  ];

  const isActivePath = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[var(--engine-border)] bg-[var(--engine-bg)]/85 px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur-xl lg:hidden">
        {/* 44px de largura: o logo tem 36 e o link media 36x44 (HIG pede 44). */}
        <Link to="/" aria-label="Engine" className="-ml-1 flex h-11 w-11 items-center justify-center">
          <Logo markSize={36} collapsed />
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          <RegionPicker compact className="mr-0.5" />
          {settings && onSettingsUpdate && !isGuest && (
            <Topbar
              settings={settings}
              onSettingsUpdate={onSettingsUpdate}
              user={currentUser}
            />
          )}
          {isGuest ? (
            <div className="relative ml-1">
              <Link
                to="/login"
                title={t("nav.login")}
                className="flex h-11 items-center gap-1.5 rounded-full bg-[var(--engine-accent)] px-4 text-[13px] font-semibold text-white transition active:scale-95"
              >
                <LogIn size={16} />
                {t("nav.login")}
              </Link>
              <GuestLoginHint placement="dock" />
            </div>
          ) : (
            <>
              {/* Mensagens saiu da barra de baixo para caber cinco abas; aqui no
                  header com contador é onde Instagram e X põem a caixa de
                  entrada. O contador é o que faz o ícone valer o lugar. */}
              <Link
                to="/messages"
                title={t("nav.messages")}
                aria-label={t("nav.messages")}
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-subtle)] transition-colors active:text-[var(--engine-accent)]"
              >
                <MessageCircle size={21} />
                {unreadMessages > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--engine-accent)] px-1 text-[9px] font-black leading-none text-white">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                )}
              </Link>
              {/* O avatar é a porta de entrada de Perfil no mobile. */}
              <Link
                to={username ? `/community/${username}` : "/community"}
                title={t("settings.sections.profile")}
                aria-label={t("settings.sections.profile")}
                className={`ml-0.5 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--engine-accent)] text-xs font-bold text-white transition-transform active:scale-95`}
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
                className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--engine-text-subtle)] transition-colors active:text-[var(--engine-accent)]"
                title={t("nav.logout")}
                aria-label={t("nav.logout")}
              >
                <LogOut size={19} />
              </button>
            </>
          )}
        </div>
      </header>

      <nav className="engine-mobile-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[var(--engine-border)] bg-[var(--engine-bg)]/95 pb-[max(env(safe-area-inset-bottom),0.35rem)] pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] pt-1 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl lg:hidden">
        {menuItems.map((item) => {
          const active = isActivePath(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[11px] font-semibold leading-tight tracking-tight transition-colors ${
                active
                  ? "text-[var(--engine-accent)]"
                  : "text-[var(--engine-text-subtle)]"
              }`}
            >
              <span
                className={`relative flex h-7 w-full max-w-14 items-center justify-center rounded-lg transition-colors ${
                  active ? "bg-[var(--engine-accent-soft)]" : ""
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                {item.badge > 0 && (
                  <span className="absolute right-1.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--engine-accent)] px-1 text-[8px] font-black leading-none text-white">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center leading-none">
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
