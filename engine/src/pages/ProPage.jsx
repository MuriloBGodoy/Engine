import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AtSign, Clock, Globe, Mail, MapPin, Navigation } from "lucide-react";
import { engineDB } from "../services/db";
import { fetchProProfileByHandle, proDisplay, proProfilePath } from "../services/proProfiles";
import { fetchProfileListings } from "../services/shops";
import { getServiceCategoryLabel, normalizeWhatsApp } from "../services/serviceListingDisplay";
import { openShareSheet } from "../services/shareLinks";
import { ProPageHeader } from "../components/shop/ProPageHeader";
import { profileInitials } from "../services/shopFormat";
import { ProVitrine } from "../components/pro/ProVitrine";
import { PublicMissing, PublicShell } from "../components/pro/PublicShell";

/**
 * Página pública do perfil profissional: /p/<@>. Serve para a página
 * (@ próprio) e para a pessoa com conta profissional (@ dela). Capa, logo,
 * bio, horário, lugar, contato e a vitrine com os serviços e produtos.
 * @ de pessoa sem conta profissional vai para o perfil da comunidade.
 */
export function ProPage({ user }) {
  const { handle = "" } = useParams();
  const { t, i18n } = useTranslation();
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
  const isTeam = state.rows.some((row) => row.moderation_status !== "approved");
  const phone = data.hideContact ? "" : normalizeWhatsApp(`${data.whatsappCountry || ""}${data.whatsapp || ""}`);
  const waHref = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(t("pro.public.waHello", { name: display.name }))}` : "";
  const place = [data.city, data.state].filter(Boolean).join(", ");
  const url = `${window.location.origin}${proProfilePath(profile, value.person?.username)}`;
  const live = state.rows.filter((row) => row.data?.active !== false);
  const counts = {
    products: live.filter((row) => row.kind === "product").length,
    services: live.filter((row) => row.kind !== "product").length,
  };
  // Nota da página = média das notas dos anúncios, pesada pelo nº de avaliações.
  const rated = live.filter((row) => Number(row.rating_count) > 0 && row.rating_avg != null);
  const ratingCount = rated.reduce((sum, row) => sum + Number(row.rating_count), 0);
  const rating = ratingCount
    ? { count: ratingCount, avg: rated.reduce((sum, row) => sum + Number(row.rating_avg) * Number(row.rating_count), 0) / ratingCount }
    : null;

  const share = () => openShareSheet({ url, title: display.name, kind: "page" });

  return (
    <PublicShell
      right={
        <button type="button" onClick={share} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)]">
          {t("services.share.action")}
        </button>
      }
    >
      <main className="mx-auto max-w-[1280px] pb-16">
        <ProPageHeader
          page={{
            name: display.name,
            handle: display.handle.replace(/^@/, ""),
            category: data.category ? (data.category === "shop" ? t("pro.categories.shop") : getServiceCategoryLabel(data.category, t)) : "",
            cover: display.cover,
            logo: display.logo,
            initials: profileInitials(display.name),
            rating: rating ? rating.avg.toLocaleString(i18n.language, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : "",
            ratingCount: rating?.count || 0,
            place,
            productCount: counts.products,
            serviceCount: counts.services,
          }}
          whatsappHref={waHref}
          actions={
            !data.hideContact && data.email ? (
              <a
                href={`mailto:${data.email}`}
                aria-label={t("pro.fields.email")}
                className="grid min-h-11 w-12 shrink-0 place-items-center rounded-[14px] border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text)]"
              >
                <Mail size={18} aria-hidden="true" />
              </a>
            ) : null
          }
        >
          {data.bio && <p className="mt-3.5 max-w-2xl whitespace-pre-line text-sm leading-6 text-[var(--engine-text)]">{data.bio}</p>}
          {(data.address || data.serviceArea || data.hours || data.instagram || data.website) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-semibold text-[var(--engine-text-muted)]">
              {data.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} aria-hidden="true" />
                  {data.address}
                </span>
              )}
              {data.serviceArea && (
                <span className="inline-flex items-center gap-1.5">
                  <Navigation size={14} aria-hidden="true" />
                  {data.serviceArea}
                </span>
              )}
              {data.hours && (
                <span className="inline-flex items-center gap-1.5 whitespace-pre-line">
                  <Clock size={14} aria-hidden="true" />
                  {data.hours}
                </span>
              )}
              {data.instagram && (
                <a href={`https://instagram.com/${encodeURIComponent(data.instagram)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-1.5 text-[var(--engine-text)] underline-offset-2 hover:underline">
                  <AtSign size={14} aria-hidden="true" />
                  {data.instagram}
                </a>
              )}
              {data.website && (
                <a href={data.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-6 items-center gap-1.5 text-[var(--engine-text)] underline-offset-2 hover:underline">
                  <Globe size={14} aria-hidden="true" />
                  {t("pro.fields.website")}
                </a>
              )}
            </div>
          )}
        </ProPageHeader>
        <ProVitrine rows={state.rows} cars={cars} showStatus={isTeam} handle={display.handle.replace(/^@/, "")} />
      </main>
    </PublicShell>
  );
}
