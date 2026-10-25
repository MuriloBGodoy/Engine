import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BriefcaseBusiness,
  Clock,
  Copy,
  Gauge,
  Mail,
  MapPin,
  SearchX,
  Store,
} from "lucide-react";
import { engineDB } from "../services/db";
import {
  categoryIcons,
  getInitials,
  getServiceCategoryLabel,
  hasMapAddress,
  mapQuery,
  modeIcons,
  modeLabelKeys,
  normalizeServiceCategory,
  normalizeWhatsApp,
} from "../services/serviceListingDisplay";
import {
  copyText,
  getServiceListingByHandle,
  serviceListingPath,
  serviceListingUrl,
} from "../services/serviceListingPublic";
import { MapPreview, PortfolioLinks, WhatsAppIcon } from "../components/services/ListingParts";
import { ShareListingButton } from "../components/services/ShareListing";
import { ServiceReviews } from "../components/services/ServiceReviews";
import { useToast } from "../components/ToastProvider";

/**
 * Página pública de um anúncio: /servicos/<slug>. O "link da bio".
 *
 * Quem chega aqui tocou num link no Instagram, no TikTok ou no WhatsApp, no
 * celular, quase sempre sem conta no Engine. Então: abre sem login, fora do
 * shell do app (sem menu, sem barra de abas), e a primeira tela responde as
 * três perguntas de quem quer contratar — o que faz, onde, e como chamo.
 *
 * Aprovado é público. O dono vê o próprio anúncio mesmo pendente, com um aviso
 * de que ninguém mais vê ainda (a RLS já entrega assim). O resto cai no
 * estado "não disponível", com caminho para a vitrine.
 *
 * Métricas: abrir esta página conta como `detail` com origem `link`, e tocar
 * no WhatsApp conta como `whatsapp` com origem `link`. O dono não conta.
 */

function Gallery({ listing, t }) {
  const photos = listing.photos || [];
  const scrollerRef = useRef(null);
  const [index, setIndex] = useState(0);
  const CategoryIcon = categoryIcons[normalizeServiceCategory(listing.category)] || Store;

  if (!photos.length) {
    // Sem foto, um bloco honesto com a categoria e as iniciais — nunca uma
    // foto de banco de imagem fingindo ser o trabalho do prestador.
    return (
      <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 bg-[var(--engine-surface-2)] sm:rounded-2xl">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--engine-accent)] font-display text-xl font-extrabold text-white">
          {getInitials(listing.providerName || listing.title)}
        </span>
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--engine-text-muted)]">
          <CategoryIcon size={15} aria-hidden="true" />
          {getServiceCategoryLabel(listing.category, t)}
        </span>
      </div>
    );
  }

  const goTo = (target) => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTo({ left: target * node.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="min-w-0">
      <div className="relative overflow-hidden bg-[var(--engine-surface-2)] sm:rounded-2xl">
        <div
          ref={scrollerRef}
          onScroll={(event) => {
            const node = event.currentTarget;
            const next = Math.round(node.scrollLeft / Math.max(1, node.clientWidth));
            if (next !== index) setIndex(next);
          }}
          className="engine-chip-scroll flex snap-x snap-mandatory overflow-x-auto scroll-smooth motion-reduce:scroll-auto"
          aria-label={t("services.publicPage.photos", { count: photos.length })}
        >
          {photos.map((photo, photoIndex) => (
            <img
              key={`${photo}-${photoIndex}`}
              src={photo}
              alt={photoIndex === 0 ? listing.title : t("services.viewPhoto", { value: photoIndex + 1 })}
              loading={photoIndex === 0 ? "eager" : "lazy"}
              className="aspect-[4/3] w-full shrink-0 snap-center object-cover lg:aspect-[16/10]"
            />
          ))}
        </div>
        {photos.length > 1 && (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-1 text-xs font-black tracking-widest text-white">
            {index + 1}/{photos.length}
          </span>
        )}
      </div>

      {photos.length > 1 && (
        <div className="engine-chip-scroll mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:px-0">
          {photos.map((photo, photoIndex) => (
            <button
              key={`thumb-${photo}-${photoIndex}`}
              type="button"
              onClick={() => goTo(photoIndex)}
              aria-label={t("services.viewPhoto", { value: photoIndex + 1 })}
              aria-current={photoIndex === index}
              className={`h-14 w-[72px] shrink-0 overflow-hidden rounded-lg border-2 transition ${
                photoIndex === index
                  ? "border-[var(--engine-accent)]"
                  : "border-transparent opacity-70 hover:opacity-100"
              }`}
            >
              <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// O título de seção é <h2> pela estrutura, mas o espaçamento vem de um <span>:
// a regra global de h1/h2 do index.css fica fora das camadas do Tailwind e
// ganharia do `tracking-widest`.
function SectionTitle({ children }) {
  return (
    <h2 className="text-[11px] font-black uppercase text-[var(--engine-text-muted)]">
      <span className="tracking-widest">{children}</span>
    </h2>
  );
}

function Fact({ icon, label, value }) {
  const Icon = icon;
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl bg-[var(--engine-surface-2)] p-3">
      <Icon size={18} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">{label}</p>
        <p className="mt-0.5 break-words text-sm font-bold text-[var(--engine-text)]">{value}</p>
      </div>
    </div>
  );
}

function OwnerBanner({ listing, t }) {
  const toast = useToast();
  const approved = listing.moderationStatus === "approved";
  const copy = async () => {
    const ok = await copyText(serviceListingUrl(listing));
    toast(
      ok ? t("services.share.copiedOwner") : t("services.share.copyFailed", { url: serviceListingUrl(listing) }),
      ok ? undefined : "error",
    );
  };

  return (
    <div className="border-b border-[var(--engine-border)] bg-[var(--engine-surface)] px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold leading-5 text-[var(--engine-text)]">
          {approved ? t("services.publicPage.ownerApproved") : t("services.publicPage.ownerPending")}
        </p>
        {approved && (
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95"
          >
            <Copy size={15} aria-hidden="true" />
            {t("services.share.copyMyLink")}
          </button>
        )}
      </div>
    </div>
  );
}

function PageShell({ children, right }) {
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

export function ServicePublicPage({ user }) {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [result, setResult] = useState({ slug: null, listing: null, failed: false });
  const loading = result.slug !== slug;
  const listing = loading ? null : result.listing;
  const isOwner = Boolean(listing && user?.uid && listing.ownerId === user.uid);

  useEffect(() => {
    let alive = true;
    getServiceListingByHandle(slug)
      .then((found) => {
        if (alive) setResult({ slug, listing: found, failed: false });
      })
      .catch(() => {
        if (alive) setResult({ slug, listing: null, failed: true });
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  // Chegou pelo id (link antigo) e o anúncio tem slug: troca a barra de
  // endereço pelo link bonito, para quem copiar dali copiar o certo.
  useEffect(() => {
    if (listing?.slug && listing.slug !== slug) {
      navigate(serviceListingPath(listing), { replace: true });
    }
  }, [listing, slug, navigate]);

  // Uma visita por sessão (o db trava). O dono conferindo a própria página
  // não é cliente.
  useEffect(() => {
    if (!listing || listing.moderationStatus !== "approved" || isOwner) return;
    engineDB.trackServiceListingMetric(listing.id, "detail", "link");
  }, [listing, isOwner]);

  useEffect(() => {
    if (!listing) return undefined;
    const previous = document.title;
    document.title = `${listing.title} · Engine`;
    return () => {
      document.title = previous;
    };
  }, [listing]);

  if (loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-5xl animate-pulse motion-reduce:animate-none sm:px-6 sm:py-6" aria-busy="true">
          <div className="aspect-[4/3] w-full bg-[var(--engine-surface-2)] sm:rounded-2xl lg:aspect-[16/10]" />
          <div className="space-y-3 px-4 py-5 sm:px-0">
            <div className="h-4 w-28 rounded bg-[var(--engine-surface-2)]" />
            <div className="h-8 w-3/4 rounded bg-[var(--engine-surface-2)]" />
            <div className="h-4 w-1/2 rounded bg-[var(--engine-surface-2)]" />
          </div>
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      </PageShell>
    );
  }

  if (!listing) {
    return (
      <PageShell>
        <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]">
            <SearchX size={26} aria-hidden="true" />
          </span>
          <h1 className="mt-5 font-display text-xl font-extrabold tracking-tight">
            {result.failed ? t("services.publicPage.errorTitle") : t("services.publicPage.missingTitle")}
          </h1>
          <p className="mt-2 text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
            {result.failed ? t("services.publicPage.errorCopy") : t("services.publicPage.missingCopy")}
          </p>
          <Link
            to="/services"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--engine-accent)] px-6 text-sm font-bold text-white transition hover:brightness-95"
          >
            {t("services.publicPage.seeServices")}
          </Link>
        </main>
      </PageShell>
    );
  }

  const approved = listing.moderationStatus === "approved";
  const phone = normalizeWhatsApp(listing.whatsapp);
  const ModeIcon = modeIcons[listing.serviceMode] || BriefcaseBusiness;
  const place = [listing.city, listing.state].filter(Boolean).join(" · ");
  const showMap = hasMapAddress(listing) && listing.serviceMode !== "mobile";
  const whatsappHref = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(t("services.publicPage.whatsappMessage", { title: listing.title }))}`
    : undefined;
  const onWhatsApp = () => {
    if (!isOwner && approved) engineDB.trackServiceListingMetric(listing.id, "whatsapp", "link");
  };
  const emailHref = listing.email
    ? `mailto:${listing.email}?subject=${encodeURIComponent(t("services.emailSubject", { title: listing.title }))}`
    : undefined;

  const contactCard = (
    <div className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4 sm:p-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] font-display font-extrabold text-white">
          {getInitials(listing.providerName || listing.title)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--engine-text)]">
            {listing.providerName || t("services.engineProfessional")}
          </p>
          <p className="truncate text-xs font-medium text-[var(--engine-text-muted)]">
            {place || t("services.remoteFallback")}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-[var(--engine-border)] pt-4">
        <span className="text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
          {t("services.priceLabel")}
        </span>
        <span className="font-display text-xl font-extrabold text-[var(--engine-text)]">
          {listing.price || t("services.quoteFallback")}
        </span>
      </div>
      <div className="mt-4 hidden gap-2 lg:grid">
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onWhatsApp}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-700"
          >
            <WhatsAppIcon size={18} />
            {t("services.whatsapp")}
          </a>
        )}
        {emailHref && (
          <a
            href={emailHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
          >
            <Mail size={16} aria-hidden="true" />
            {t("services.sendEmail")}
          </a>
        )}
        {approved && <ShareListingButton listing={listing} variant="soft" asOwner={isOwner} source="pagina" />}
      </div>
      {!phone && !listing.email && (
        <p className="mt-4 text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
          {t("services.publicPage.noContact")}
        </p>
      )}
    </div>
  );

  return (
    <PageShell
      right={
        approved ? <ShareListingButton listing={listing} variant="icon" asOwner={isOwner} source="pagina" /> : null
      }
    >
      {isOwner && <OwnerBanner listing={listing} t={t} />}

      <main className="mx-auto max-w-5xl pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:pb-16">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="min-w-0">
            <Gallery listing={listing} t={t} />

            <div className="px-4 pt-5 sm:px-0">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--engine-accent)]">
                {getServiceCategoryLabel(listing.category, t)}
              </p>
              <h1 className="mt-2 break-words font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
                {listing.title}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-[var(--engine-text-muted)]">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin size={15} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{place || t("services.remoteFallback")}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ModeIcon size={15} className="shrink-0" aria-hidden="true" />
                  {t(modeLabelKeys[listing.serviceMode] || modeLabelKeys.hybrid)}
                </span>
              </p>

              <div className="mt-5 lg:hidden">{contactCard}</div>

              <section className="mt-7">
                <SectionTitle>{t("services.publicPage.about")}</SectionTitle>
                <p className="mt-2 whitespace-pre-line break-words text-[15px] font-medium leading-7 text-[var(--engine-text)]">
                  {listing.description}
                </p>
                {(listing.tags || []).length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {listing.tags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-full border border-[var(--engine-border)] px-3 py-1 text-xs font-bold text-[var(--engine-text-muted)]"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="mt-7 grid gap-2 sm:grid-cols-2">
                <Fact icon={Clock} label={t("services.schedule")} value={listing.availability || t("services.toArrange")} />
                {listing.experience && (
                  <Fact icon={Gauge} label={t("services.experience")} value={listing.experience} />
                )}
                {listing.serviceArea && (
                  <Fact icon={MapPin} label={t("services.publicPage.serviceArea")} value={listing.serviceArea} />
                )}
              </section>

              {showMap && (
                <section className="mt-7">
                  <SectionTitle>{t("services.publicPage.where")}</SectionTitle>
                  <p className="mt-2 text-sm font-semibold text-[var(--engine-text)]">{mapQuery(listing)}</p>
                  <div className="mt-3">
                    <MapPreview listing={listing} compact />
                  </div>
                </section>
              )}

              <PortfolioSection listing={listing} t={t} />

              <section id="service-reviews" className="mt-7">
                <ServiceReviews listing={listing} user={user} />
              </section>

              <footer className="mt-10 border-t border-[var(--engine-border)] pt-6 text-center">
                <p className="text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
                  {t("services.publicPage.footer")}
                </p>
                <div className="mt-3 flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-4">
                  <Link
                    to="/services"
                    className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-[var(--engine-accent)] hover:underline"
                  >
                    {t("services.publicPage.seeServices")}
                  </Link>
                  <Link
                    to="/services"
                    className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-[var(--engine-text)] hover:underline"
                  >
                    {t("services.publicPage.advertiseFree")}
                  </Link>
                </div>
              </footer>
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-20">{contactCard}</div>
          </aside>
        </div>
      </main>

      {/* Barra fixa do celular: a ação que importa sempre ao alcance do
          polegar, acima da barra de gestos. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--engine-border)] bg-[var(--engine-surface)] px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-3 lg:hidden">
        <div className="mx-auto flex max-w-5xl gap-2">
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onWhatsApp}
              className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              <WhatsAppIcon size={18} />
              <span className="truncate">{t("services.whatsapp")}</span>
            </a>
          ) : emailHref ? (
            <a
              href={emailHref}
              className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95"
            >
              <Mail size={17} aria-hidden="true" />
              <span className="truncate">{t("services.sendEmail")}</span>
            </a>
          ) : (
            <p className="flex min-h-12 flex-1 items-center text-xs font-medium text-[var(--engine-text-muted)]">
              {t("services.publicPage.noContact")}
            </p>
          )}
          {whatsappHref && emailHref && (
            <a
              href={emailHref}
              aria-label={t("services.sendEmail")}
              title={t("services.sendEmail")}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--engine-border)] text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
            >
              <Mail size={18} aria-hidden="true" />
            </a>
          )}
          {approved && (
            <ShareListingButton
              listing={listing}
              variant="bar"
              asOwner={isOwner}
              source="pagina"
            />
          )}
        </div>
      </div>
    </PageShell>
  );
}

function PortfolioSection({ listing, t }) {
  const has = listing.instagram || listing.tiktok || listing.website || listing.videoUrl;
  if (!has) return null;
  return (
    <section className="mt-7">
      <SectionTitle>{t("services.publicPage.portfolio")}</SectionTitle>
      <div className="mt-3">
        <PortfolioLinks listing={listing} t={t} large />
      </div>
    </section>
  );
}
