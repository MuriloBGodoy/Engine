import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AtSign, BadgeCheck, Clock, Globe, Mail, MapPin, Navigation } from "lucide-react";
import { engineDB } from "../services/db";
import { fetchProProfileByHandle, proDisplay, proProfilePath } from "../services/proProfiles";
import { fetchProfileListings } from "../services/shops";
import { getServiceCategoryLabel, normalizeWhatsApp } from "../services/serviceListingDisplay";
import { shareOrCopyLink } from "../services/serviceListingPublic";
import { WhatsAppIcon } from "../components/services/ListingParts";
import { ProAvatar } from "../components/pro/ProUi";
import { ProVitrine } from "../components/pro/ProVitrine";
import { PublicMissing, PublicShell } from "../components/pro/PublicShell";
import { useToast } from "../components/ToastProvider";

/**
 * Página pública do perfil profissional: /p/<@>. Serve para a página
 * (@ próprio) e para a pessoa com conta profissional (@ dela). Capa, logo,
 * bio, horário, lugar, contato e a vitrine com os serviços e produtos.
 * @ de pessoa sem conta profissional vai para o perfil da comunidade.
 */
export function ProPage({ user }) {
  const { handle = "" } = useParams();
  const { t } = useTranslation();
  const toast = useToast();
  const [state, setState] = useState({ handle: null, value: null, rows: [], failed: false });
  const [cars, setCars] = useState([]);
  const loading = state.handle !== handle;
  const value = loading ? null : state.value;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const found = await fetchProProfileByHandle(handle);
        const rows = found?.profile ? await fetchProfileListings(found.profile.id) : [];
        if (alive) setState({ handle, value: found, rows, failed: false });
      } catch (error) {
        console.error(error);
        if (alive) setState({ handle, value: null, rows: [], failed: true });
      }
    })();
    return () => {
      alive = false;
    };
  }, [handle]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let alive = true;
    engineDB.getCars().then((list) => alive && setCars(list || [])).catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.uid]);

  const profile = value?.profile || null;
  useEffect(() => {
    if (!profile) return undefined;
    const previous = document.title;
    document.title = `${proDisplay(profile, value?.person).name} · Engine`;
    return () => {
      document.title = previous;
    };
  }, [profile, value?.person]);

  if (value?.redirect) return <Navigate to={value.redirect} replace />;

  if (loading) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-5xl animate-pulse sm:px-6 sm:py-6" aria-busy="true">
          <div className="h-40 w-full bg-[var(--engine-surface-2)] sm:rounded-2xl" />
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      </PublicShell>
    );
  }

  if (!profile) {
    return (
      <PublicShell>
        <PublicMissing
          title={t(state.failed ? "services.publicPage.errorTitle" : "pro.public.missingTitle")}
          copy={t(state.failed ? "services.publicPage.errorCopy" : "pro.public.missingCopy")}
          cta={t("services.publicPage.seeServices")}
        />
      </PublicShell>
    );
  }

  const display = proDisplay(profile, value.person);
  const data = profile.data;
  const page = profile.kind === "page";
  const isTeam = state.rows.some((row) => row.moderation_status !== "approved");
  const phone = data.hideContact ? "" : normalizeWhatsApp(`${data.whatsappCountry || ""}${data.whatsapp || ""}`);
  const waHref = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(t("pro.public.waHello", { name: display.name }))}` : "";
  const place = [data.city, data.state].filter(Boolean).join(" · ");
  const url = `${window.location.origin}${proProfilePath(profile, value.person?.username)}`;

  const share = async () => {
    const result = await shareOrCopyLink({ url, title: display.name });
    if (result === "copied") toast(t("services.share.copied"));
    if (result === "failed") toast(t("services.share.copyFailed", { url }), "error");
  };

  return (
    <PublicShell
      right={
        <button type="button" onClick={share} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)]">
          {t("services.share.action")}
        </button>
      }
    >
      <main className="mx-auto max-w-5xl pb-16 sm:px-6 sm:py-6">
        <div className="h-36 w-full overflow-hidden bg-[var(--engine-surface-2)] sm:h-52 sm:rounded-2xl">
          {display.cover && <img src={display.cover} alt="" className="h-full w-full object-cover" />}
        </div>
        <section className="px-4 sm:px-0">
          <div className="-mt-10 flex items-end gap-3">
            <span className="rounded-2xl border-4 border-[var(--engine-bg)]">
              <ProAvatar src={display.logo} name={display.name} size={84} square={page} />
            </span>
          </div>
          <h1 className="mt-3 flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight">
            {display.name}
            {page && <BadgeCheck size={20} className="text-[var(--engine-accent)]" aria-hidden="true" />}
          </h1>
          <p className="text-sm font-semibold text-[var(--engine-text-muted)]">
            {display.handle}
            {data.category ? ` · ${data.category === "shop" ? t("pro.categories.shop") : getServiceCategoryLabel(data.category, t)}` : ""}
          </p>
          {data.bio && <p className="mt-3 max-w-2xl whitespace-pre-line text-sm font-medium leading-6 text-[var(--engine-text)]">{data.bio}</p>}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {place && (
              <p className="flex items-start gap-2 text-sm font-semibold text-[var(--engine-text)]">
                <MapPin size={16} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
                {[data.address, place].filter(Boolean).join(" · ")}
              </p>
            )}
            {data.serviceArea && (
              <p className="flex items-start gap-2 text-sm font-semibold text-[var(--engine-text)]">
                <Navigation size={16} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
                {data.serviceArea}
              </p>
            )}
            {data.hours && (
              <p className="flex items-start gap-2 whitespace-pre-line text-sm font-semibold text-[var(--engine-text)]">
                <Clock size={16} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
                {data.hours}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:brightness-95">
                <WhatsAppIcon size={16} />
                WhatsApp
              </a>
            )}
            {!data.hideContact && data.email && (
              <a href={`mailto:${data.email}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)]">
                <Mail size={16} aria-hidden="true" />
                {t("pro.fields.email")}
              </a>
            )}
            {data.instagram && (
              <a href={`https://instagram.com/${encodeURIComponent(data.instagram)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)]">
                <AtSign size={16} aria-hidden="true" />@{data.instagram}
              </a>
            )}
            {data.website && (
              <a href={data.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)]">
                <Globe size={16} aria-hidden="true" />
                {t("pro.fields.website")}
              </a>
            )}
          </div>

          <h2 className="mt-8 text-[11px] font-black uppercase text-[var(--engine-text-muted)]">
            <span className="tracking-widest">{t("pro.vitrine.title")}</span>
          </h2>
          <div className="mt-3">
            <ProVitrine rows={state.rows} cars={cars} showStatus={isTeam} />
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
