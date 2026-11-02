import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, SearchX } from "lucide-react";
import { fetchProProfileById, proDisplay, proProfilePath } from "../../services/proProfiles";
import { ProAvatar } from "./ProUi";

/**
 * Casca das páginas públicas novas (/p/<@>, /produtos/<slug>): fora do shell
 * do app, como /servicos/<slug> — quem chega pelo link da bio cai direto no
 * conteúdo.
 */
export function PublicShell({ children, right = null }) {
  return (
    <div className="min-h-[100dvh] bg-[var(--engine-bg)] text-[var(--engine-text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--engine-border)] bg-[var(--engine-bg)] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/services"
            className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 font-display text-lg font-extrabold italic tracking-tight text-[var(--engine-text)]"
          >
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            Engine
          </Link>
          {right}
        </div>
      </header>
      {children}
    </div>
  );
}

export function PublicMissing({ title, copy, cta, to = "/services" }) {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]">
        <SearchX size={26} aria-hidden="true" />
      </span>
      <h1 className="mt-5 font-display text-xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm font-medium leading-6 text-[var(--engine-text-muted)]">{copy}</p>
      <Link
        to={to}
        className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--engine-accent)] px-6 text-sm font-bold text-white transition hover:brightness-95"
      >
        {cta}
      </Link>
    </main>
  );
}

/** Cartão "quem vende" com link para a vitrine do perfil (página ou pessoa). */
export function ProfileLinkCard({ profileId, fallbackName = "" }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ id: "", value: null });
  useEffect(() => {
    if (!profileId) return undefined;
    let alive = true;
    fetchProProfileById(profileId)
      .then((value) => alive && setState({ id: profileId, value }))
      .catch(() => alive && setState({ id: profileId, value: null }));
    return () => {
      alive = false;
    };
  }, [profileId]);
  const value = state.id === profileId ? state.value : null;
  const display = value ? proDisplay(value.profile, value.person) : { name: fallbackName, handle: "", logo: "" };
  const path = value ? proProfilePath(value.profile, value.person?.username) : "";
  const body = (
    <>
      <ProAvatar src={display.logo} name={display.name} size={48} square={value?.profile.kind === "page"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--engine-text)]">{display.name || fallbackName}</span>
        <span className="block truncate text-xs font-semibold text-[var(--engine-text-muted)]">{display.handle}</span>
      </span>
      {path && <ChevronRight size={18} aria-label={t("pro.seeShowcase")} className="shrink-0 text-[var(--engine-text-muted)]" />}
    </>
  );
  return path ? (
    <Link to={path} className="flex items-center gap-3 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3 transition hover:border-[var(--engine-border-strong)]">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3">{body}</div>
  );
}
