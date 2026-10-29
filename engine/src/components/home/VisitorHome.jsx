import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CalendarDays,
  Calculator,
  Car,
  Check,
  ChevronRight,
  Heart,
  MapPin,
  Star,
  Store,
  Users,
  Wrench,
} from "lucide-react";
import { AdSlot } from "../AdSlot";
import { useRegion } from "../../hooks/RegionProvider";
import { applyRegionFilter, regionShortLabel } from "../../services/region";
import { fetchHomeShowcase } from "../../services/homeShowcase";
import { getServiceCategoryLabel } from "../../services/serviceListingDisplay";
import { serviceListingPath } from "../../services/serviceListingPublic";
import { formatCarName } from "../../services/carDisplay";
import { formatEventDay } from "../../services/eventTime";
import { eventTypeLabel } from "../../services/eventTypes";
import { authPath } from "../../services/authRedirect";

/**
 * Home de quem ainda não entrou.
 *
 * Em 5 segundos a pessoa precisa entender o que é o Engine (garagem + custo
 * real de ter o carro + comunidade + serviços locais) e ver que tem gente de
 * verdade aqui. Por isso a ordem: promessa e CTAs, os quatro pilares (cada um
 * diz se é aberto ou pede conta, para nenhum botão levar a uma parede sem
 * aviso), o simulador explicado sem número inventado, e só então o conteúdo
 * real — serviços da região, posts e encontros — cada um com um vazio que
 * explica o que vai aparecer ali, em vez de uma página morta.
 */

// Sem `display` aqui: quem usa decide (inline-flex, ou hidden lg:inline-flex
// — com os dois na mesma classe, o inline-flex venceria o hidden).
const linkShape =
  "items-center justify-center gap-2 rounded-lg font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)]";
const linkBase = `inline-flex ${linkShape}`;
const linkPrimary = `${linkBase} h-12 px-6 text-sm bg-[var(--engine-accent)] text-white shadow-[0_2px_10px_var(--engine-accent-soft)] hover:brightness-95 active:brightness-90`;
const linkSecondary = `${linkBase} h-12 px-6 text-sm border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text)] hover:border-[var(--engine-text-muted)]`;

const SIGNUP_TO_GARAGE = authPath("/register", "/garagem");

// O rail rola até a borda da tela no celular (sangra o padding do <main>) e
// vira grade a partir de lg, onde .engine-rail deixa de valer.
const railClass =
  "engine-rail -mx-4 gap-3 px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:px-0";
const railItem = "w-[78%] max-w-[300px] sm:w-[46%] lg:w-auto lg:max-w-none";

function SectionHeader({ title, to, linkLabel, id }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
      <h2 id={id} className="font-display text-lg font-bold tracking-tight text-[var(--engine-text)] sm:text-xl">
        {title}
      </h2>
      {to && (
        <Link
          to={to}
          className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 text-[13px] font-semibold text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
        >
          {linkLabel}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function EmptyState({ icon, title, body, children }) {
  return (
    <div className="engine-card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--engine-text)]">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">{body}</p>
      </div>
      {children}
    </div>
  );
}

function SkeletonRail({ tall = false }) {
  return (
    <div className={railClass} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className={`${railItem} engine-card overflow-hidden`}>
          <div className={`${tall ? "aspect-square" : "aspect-[4/3]"} bg-[var(--engine-surface-2)] motion-safe:animate-pulse`} />
          <div className="space-y-2 p-3">
            <div className="h-3 w-3/4 rounded bg-[var(--engine-surface-2)] motion-safe:animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-[var(--engine-surface-2)] motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadError() {
  const { t } = useTranslation();
  return (
    <p className="engine-card px-4 py-3 text-[13px] text-[var(--engine-text-muted)]">
      {t("visitorHome.loadError")}
    </p>
  );
}

/* ----------------------------------------------------------------- hero -- */

function Hero() {
  const { t } = useTranslation();
  const pillars = [
    { key: "garage", icon: Car, to: SIGNUP_TO_GARAGE, open: false },
    { key: "cost", icon: Calculator, to: SIGNUP_TO_GARAGE, open: false },
    { key: "community", icon: Users, to: "/community", open: true },
    { key: "services", icon: Wrench, to: "/services", open: true },
  ];

  return (
    <section className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12">
      {/* Luz de fundo: decorativa, não captura clique. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 left-0 -z-10 h-80 w-full max-w-2xl bg-[radial-gradient(55%_60%_at_30%_40%,var(--engine-accent-soft),transparent_72%)]"
      />

      <div className="engine-rise">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--engine-text-muted)] sm:text-xs">
          {t("visitorHome.eyebrow")}
        </p>
        <h1 className="text-balance font-display text-[2.125rem] font-bold leading-[1.05] tracking-tight text-[var(--engine-text)] sm:text-5xl lg:text-[3.25rem]">
          {t("visitorHome.title")}
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--engine-text-muted)] sm:text-base">
          {t("visitorHome.subtitle")}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to="/register" className={`${linkPrimary} w-full sm:w-auto`}>
            {t("visitorHome.ctaRegister")}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link to="/services" className={`${linkSecondary} w-full sm:w-auto`}>
            <Wrench size={17} aria-hidden="true" />
            {t("visitorHome.ctaServices")}
          </Link>
        </div>
        <p className="mt-3 text-[13px] text-[var(--engine-text-muted)]">
          {t("visitorHome.haveAccount")}{" "}
          <Link
            to="/login"
            className="font-semibold text-[var(--engine-text)] underline decoration-[var(--engine-border-strong)] underline-offset-4 hover:decoration-[var(--engine-text)]"
          >
            {t("visitorHome.signIn")}
          </Link>
        </p>
      </div>

      <nav aria-label={t("visitorHome.pillars.label")} className="engine-rise grid grid-cols-2 gap-3">
        {pillars.map((pillar) => (
          <Link
            key={pillar.key}
            to={pillar.to}
            className="engine-card engine-card-hover group flex min-h-[148px] flex-col p-4 sm:p-5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
              <pillar.icon size={20} aria-hidden="true" />
            </span>
            <span className="mt-3 flex items-center gap-1 text-sm font-bold text-[var(--engine-text)]">
              {t(`visitorHome.pillars.${pillar.key}.title`)}
              <ChevronRight
                size={15}
                aria-hidden="true"
                className="text-[var(--engine-text-muted)] transition-transform group-hover:translate-x-0.5"
              />
            </span>
            <span className="mt-1 text-[12.5px] leading-snug text-[var(--engine-text-muted)]">
              {t(`visitorHome.pillars.${pillar.key}.desc`)}
            </span>
            <span className="mt-auto pt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--engine-text-muted)]">
              {pillar.open ? t("visitorHome.pillars.open") : t("visitorHome.pillars.withAccount")}
            </span>
          </Link>
        ))}
      </nav>
    </section>
  );
}

/* ------------------------------------------------------------ custo real -- */

const COST_ITEMS = ["ipva", "insurance", "fuel", "maintenance", "financing", "depreciation"];

function CostSlab() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="home-cost" className="engine-slab p-5 sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-10">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--engine-slab-accent)] sm:text-xs">
            {t("visitorHome.cost.eyebrow")}
          </p>
          <h2 id="home-cost" className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {t("visitorHome.cost.title")}
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--engine-slab-fg-muted)] sm:text-[15px]">
            {t("visitorHome.cost.body")}
          </p>
          <Link
            to={SIGNUP_TO_GARAGE}
            className={`${linkShape} mt-5 hidden h-12 bg-[var(--engine-slab-fg)] px-6 text-sm text-[var(--engine-slab-ink)] hover:brightness-95 lg:inline-flex`}
          >
            <Calculator size={18} aria-hidden="true" />
            {t("visitorHome.cost.cta")}
          </Link>
        </div>

        <div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {COST_ITEMS.map((key) => (
              <li
                key={key}
                className="flex items-start gap-2.5 rounded-xl border border-[var(--engine-slab-line)] bg-[var(--engine-slab-cell)] px-3 py-2.5 text-[13.5px] leading-snug"
              >
                <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--engine-slab-accent)]" />
                {t(`visitorHome.cost.items.${key}`)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--engine-slab-fg-muted)]">
            {t("visitorHome.cost.note")}
          </p>
          <Link
            to={SIGNUP_TO_GARAGE}
            className={`${linkBase} mt-4 h-12 w-full bg-[var(--engine-slab-fg)] px-6 text-sm text-[var(--engine-slab-ink)] hover:brightness-95 lg:hidden`}
          >
            <Calculator size={18} aria-hidden="true" />
            {t("visitorHome.cost.cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- serviços -- */

function ListingCard({ listing }) {
  const { t, i18n } = useTranslation();
  const photo = listing.photos[0];
  const place = [listing.city, listing.state].filter(Boolean).join(" · ");
  const rated = listing.ratingCount > 0 && listing.ratingAvg;

  return (
    <Link
      to={serviceListingPath(listing)}
      className={`${railItem} engine-card engine-card-hover group flex flex-col overflow-hidden`}
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--engine-surface-2)]">
        {photo ? (
          <img
            src={photo}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--engine-text-muted)]">
            <Store size={32} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--engine-text-muted)]">
          {getServiceCategoryLabel(listing.category, t)}
        </p>
        <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-[var(--engine-text)]">
          {listing.title || listing.providerName}
        </h3>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[12px] text-[var(--engine-text-muted)]">
          {place && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin size={13} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{place}</span>
            </span>
          )}
          {rated ? (
            <span
              className="inline-flex items-center gap-1"
              aria-label={t("visitorHome.services.rating", {
                avg: listing.ratingAvg.toLocaleString(i18n.language, { maximumFractionDigits: 1 }),
                count: listing.ratingCount,
              })}
            >
              <Star size={13} aria-hidden="true" className="fill-current" />
              {listing.ratingAvg.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}
              <span aria-hidden="true">({listing.ratingCount})</span>
            </span>
          ) : (
            <span>{t("visitorHome.services.noRating")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function ProviderCard() {
  const { t } = useTranslation();
  return (
    <Link
      to="/services"
      className={`${railItem} group flex flex-col justify-between gap-4 rounded-2xl border border-dashed border-[var(--engine-border-strong)] p-4 transition-colors hover:border-[var(--engine-text-muted)]`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]">
        <Store size={20} aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-bold text-[var(--engine-text)]">
          {t("visitorHome.services.providerTitle")}
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
          {t("visitorHome.services.providerBody")}
        </span>
      </span>
      <span className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-[var(--engine-text)]">
        {t("visitorHome.services.providerCta")}
        <ArrowRight size={15} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function ServicesSection({ state }) {
  const { t } = useTranslation();
  const { region } = useRegion();
  const regionName = regionShortLabel(region);

  const { items, widened } = useMemo(
    () =>
      applyRegionFilter(state?.items || [], region, (listing) => ({
        country: listing.country,
        state: listing.state,
        city: listing.city,
      })),
    [state, region],
  );
  const shown = items.slice(0, 3);

  return (
    <section aria-labelledby="home-services">
      <SectionHeader
        id="home-services"
        title={t("visitorHome.services.title")}
        to="/services"
        linkLabel={t("visitorHome.services.seeAll")}
      />
      {!state ? (
        <SkeletonRail />
      ) : state.failed ? (
        <LoadError />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Wrench size={22} aria-hidden="true" />}
          title={t("visitorHome.services.emptyTitle")}
          body={t("visitorHome.services.emptyBody")}
        >
          <Link to="/services" className={`${linkSecondary} h-11 w-full shrink-0 sm:w-auto`}>
            {t("visitorHome.services.providerCta")}
          </Link>
        </EmptyState>
      ) : (
        <>
          {widened && regionName && (
            <p className="mb-3 text-[12.5px] text-[var(--engine-text-muted)]">
              {t("visitorHome.services.widened", { region: regionName })}
            </p>
          )}
          <div className={railClass}>
            {shown.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
            {/* Com menos de três anúncios, a vaga vira convite ao prestador:
                a vitrine nunca fica com um buraco. */}
            {shown.length < 3 && <ProviderCard />}
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ comunidade -- */

const isImageUrl = (value) => /^(https?:|data:image\/)/.test(String(value || ""));

function PostCard({ post }) {
  const { t } = useTranslation();
  const image = post.image || post.images?.[0] || "";
  const carName = formatCarName(post) || post.title;
  const isGoal = post.kind !== "post";
  const badge = isGoal
    ? post.progress > 0
      ? t("visitorHome.community.goalProgress", { progress: Math.round(post.progress) })
      : t("visitorHome.community.goal")
    : t("visitorHome.community.post");

  return (
    <Link
      to={`/post/${encodeURIComponent(post.id)}`}
      className={`${railItem} engine-card engine-card-hover group flex flex-col overflow-hidden`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--engine-surface-2)]">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center p-5">
            <p className="line-clamp-4 font-display text-base font-semibold leading-snug text-[var(--engine-text)]">
              {post.note || carName}
            </p>
          </div>
        )}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-[var(--engine-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--engine-text)] shadow-[var(--engine-shadow-sm)]">
          {badge}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        {carName && (
          <h3 className="line-clamp-1 text-sm font-bold text-[var(--engine-text)]">{carName}</h3>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2">
          {isImageUrl(post.avatar) ? (
            <img src={post.avatar} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--engine-surface-2)] text-[10px] font-bold text-[var(--engine-text-muted)]">
              {String(post.avatar || "").slice(0, 2)}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--engine-text-muted)]">
            {post.author}
            {post.city && post.city !== "Engine Garage" ? ` · ${post.city}` : ""}
          </span>
          {post.likes > 0 && (
            <span className="inline-flex items-center gap-1 text-[12px] text-[var(--engine-text-muted)]">
              <Heart size={13} aria-hidden="true" />
              {post.likes}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function CommunitySection({ state }) {
  const { t } = useTranslation();
  const posts = (state?.items || []).slice(0, 3);

  return (
    <section aria-labelledby="home-community">
      <SectionHeader
        id="home-community"
        title={t("visitorHome.community.title")}
        to="/community"
        linkLabel={t("visitorHome.community.seeAll")}
      />
      {!state ? (
        <SkeletonRail />
      ) : state.failed ? (
        <LoadError />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<Users size={22} aria-hidden="true" />}
          title={t("visitorHome.community.emptyTitle")}
          body={t("visitorHome.community.emptyBody")}
        />
      ) : (
        <div className={railClass}>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- eventos -- */

function EventRow({ event }) {
  const { t, i18n } = useTranslation();
  const day = formatEventDay(event, i18n.language, { day: "2-digit" });
  const month = formatEventDay(event, i18n.language, { month: "short" }).replace(".", "");
  const weekday = formatEventDay(event, i18n.language, { weekday: "short" }).replace(".", "");
  const place = [event.location, event.state].filter(Boolean).join(" · ");

  return (
    <Link
      to={`/events/${encodeURIComponent(event.id)}`}
      className="engine-card engine-card-hover flex items-center gap-4 p-3.5 sm:p-4"
    >
      <span className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-[var(--engine-surface-2)] py-2 leading-none">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--engine-text-muted)]">{month}</span>
        <span className="mt-1 font-display text-xl font-bold text-[var(--engine-text)]">{day}</span>
        <span className="mt-1 text-[10px] uppercase text-[var(--engine-text-muted)]">{weekday}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--engine-text-muted)]">
          {eventTypeLabel(t, event.type)}
          {event.startTime ? ` · ${event.startTime}` : ""}
        </span>
        <span className="mt-0.5 block truncate text-sm font-bold text-[var(--engine-text)]">{event.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-[var(--engine-text-muted)]">
          {place && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin size={13} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{place}</span>
            </span>
          )}
          {event.participantCount > 0 && (
            <span>{t("visitorHome.events.going", { count: event.participantCount })}</span>
          )}
        </span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--engine-text-muted)]" />
    </Link>
  );
}

function EventsSection({ state }) {
  const { t } = useTranslation();
  const { region } = useRegion();
  const { items } = useMemo(
    () =>
      applyRegionFilter(
        state?.items || [],
        region,
        (event) => ({ country: event.country, state: event.state }),
        { minVisible: 2 },
      ),
    [state, region],
  );
  const shown = items.slice(0, 3);

  return (
    <section aria-labelledby="home-events">
      <SectionHeader
        id="home-events"
        title={t("visitorHome.events.title")}
        to="/events"
        linkLabel={t("visitorHome.events.seeAll")}
      />
      {!state ? (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1].map((index) => (
            <div key={index} className="engine-card h-[84px] motion-safe:animate-pulse" />
          ))}
        </div>
      ) : state.failed ? (
        <LoadError />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={22} aria-hidden="true" />}
          title={t("visitorHome.events.emptyTitle")}
          body={t("visitorHome.events.emptyBody")}
        >
          <Link to="/events" className={`${linkSecondary} h-11 w-full shrink-0 sm:w-auto`}>
            {t("visitorHome.events.emptyCta")}
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {shown.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ fechamento -- */

function FinalCta() {
  const { t } = useTranslation();
  return (
    <section className="engine-card flex flex-col gap-4 p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-xl">
        <h2 className="font-display text-xl font-bold tracking-tight text-[var(--engine-text)] sm:text-2xl">
          {t("visitorHome.final.title")}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--engine-text-muted)]">
          {t("visitorHome.final.body")}
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
        <Link to={SIGNUP_TO_GARAGE} className={`${linkPrimary} w-full whitespace-nowrap sm:w-auto`}>
          {t("visitorHome.final.cta")}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link to="/login" className={`${linkSecondary} w-full whitespace-nowrap sm:w-auto`}>
          {t("visitorHome.final.signIn")}
        </Link>
      </div>
    </section>
  );
}

export function VisitorHome() {
  // null = carregando. Uma leitura por visita à Home; as seções se viram com
  // o que vier (cada uma tem seu vazio e seu erro).
  const [showcase, setShowcase] = useState(null);

  useEffect(() => {
    let active = true;
    fetchHomeShowcase().then((result) => {
      if (active) setShowcase(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-10 pb-4 pt-2 sm:gap-14 sm:pt-4">
      <Hero />
      <CostSlab />
      <ServicesSection state={showcase?.listings} />
      <CommunitySection state={showcase?.posts} />
      <EventsSection state={showcase?.events} />
      <FinalCta />
      <AdSlot slot="home-footer" format="horizontal" className="mx-auto w-full max-w-4xl" />
    </div>
  );
}
