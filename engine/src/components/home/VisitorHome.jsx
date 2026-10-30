import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarDays,
  Calculator,
  Camera,
  Car,
  Check,
  ChevronRight,
  FileCheck,
  Heart,
  Link2,
  MapPin,
  MessageSquareQuote,
  Receipt,
  Shield,
  ShieldCheck,
  Star,
  Store,
  Target,
  Trophy,
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
 * A história que ela conta (do Murilo, 28/10/2026): o Engine nasceu para
 * responder quanto é preciso ganhar para ter e chegar no carro dos sonhos;
 * depois virou casa de quem divulga serviço automotivo no Insta e no TikTok;
 * daí veio o lado social, com clubes, encontros e conquistas. "Tudo num lugar
 * só" — e os quatro pilares pesam igual. A calculadora é uma ferramenta dentro
 * do pilar do sonho, não a manchete.
 *
 * Ordem: promessa e CTAs com os quatro pilares (atalhos para as seções), a
 * faixa "como tudo se conecta", os quatro pilares com o conteúdo real que cada
 * um tem (metas, anúncios aprovados, clubes, encontros, posts) e o fechamento.
 * Cada vitrine tem carregando, erro e um vazio que explica o que vai aparecer
 * ali. Nenhum número inventado: o simulador é explicado pela regra, não por um
 * exemplo de valor.
 */

// Sem `display` aqui: quem usa decide (inline-flex, ou hidden lg:inline-flex
// — com os dois na mesma classe, o inline-flex venceria o hidden).
const linkShape =
  "items-center justify-center gap-2 rounded-lg font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)]";
const linkBase = `inline-flex ${linkShape}`;
const linkPrimary = `${linkBase} h-12 px-6 text-sm bg-[var(--engine-accent)] text-white shadow-[0_2px_10px_var(--engine-accent-soft)] hover:brightness-95 active:brightness-90`;
const linkSecondary = `${linkBase} h-12 px-6 text-sm border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text)] hover:border-[var(--engine-text-muted)]`;
const linkStrong = `${linkBase} h-12 px-6 text-sm bg-[var(--engine-text)] text-[var(--engine-bg)] hover:opacity-90`;

const SIGNUP_TO_GARAGE = authPath("/register", "/garagem");

// O rail rola até a borda da tela no celular (sangra o padding do <main>) e
// vira grade a partir de lg, onde .engine-rail deixa de valer.
const railClass =
  "engine-rail -mx-4 gap-3 px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:px-0";
const railItem = "w-[78%] max-w-[300px] sm:w-[46%] lg:w-auto lg:max-w-none";
const eyebrowClass =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--engine-text-muted)] sm:text-xs";

/* ------------------------------------------------------------ peças ------ */

function SectionHeader({ title, to, linkLabel, id }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h3 id={id} className="font-display text-base font-bold tracking-tight text-[var(--engine-text)] sm:text-lg">
        {title}
      </h3>
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

function PillarIntro({ id, eyebrow, title, body, children }) {
  return (
    <div className="min-w-0">
      <p className={eyebrowClass}>{eyebrow}</p>
      <h2
        id={id}
        className="mt-2 text-balance font-display text-2xl font-bold leading-tight tracking-tight text-[var(--engine-text)] sm:text-3xl"
      >
        {title}
      </h2>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--engine-text-muted)]">{body}</p>
      {children}
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

function SkeletonRail({ short = false }) {
  return (
    <div className={railClass} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className={`${railItem} engine-card overflow-hidden`}>
          {!short && <div className="aspect-[4/3] bg-[var(--engine-surface-2)] motion-safe:animate-pulse" />}
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

const PILLARS = [
  { key: "dream", anchor: "sonho", icon: Target },
  { key: "garage", anchor: "garagem", icon: Car },
  { key: "services", anchor: "servicos", icon: Wrench },
  { key: "community", anchor: "comunidade", icon: Users },
];

function Hero() {
  const { t } = useTranslation();

  return (
    <section className="relative grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-12">
      {/* Luz de fundo: decorativa, não captura clique. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 left-0 -z-10 h-80 w-full max-w-2xl bg-[radial-gradient(55%_60%_at_30%_40%,var(--engine-accent-soft),transparent_72%)]"
      />

      <div className="engine-rise">
        <h1 className="text-balance font-display text-[2rem] font-bold leading-[1.06] tracking-tight text-[var(--engine-text)] sm:text-5xl lg:text-[3.25rem]">
          {t("visitorHome.sloganLead")}{" "}
          {/* Texto grande (≥24px, negrito): o vermelho passa no 3:1 nos dois temas. */}
          <span className="text-[var(--engine-accent)]">{t("visitorHome.sloganAccent")}</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--engine-text-muted)] sm:text-base">
          <strong className="font-semibold text-[var(--engine-text)]">{t("visitorHome.lead")}</strong>{" "}
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

      {/* Os quatro pilares, com o mesmo peso. São atalhos para as seções
          desta página: nenhum leva a uma parede de login. */}
      <nav aria-label={t("visitorHome.pillars.label")} className="engine-rise grid grid-cols-2 gap-3">
        {PILLARS.map((pillar, index) => (
          <a
            key={pillar.key}
            href={`#${pillar.anchor}`}
            className="engine-card engine-card-hover group flex min-h-[132px] flex-col p-4 sm:p-5"
          >
            <span className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
                <pillar.icon size={20} aria-hidden="true" />
              </span>
              <span className="font-display text-xs font-bold text-[var(--engine-text-muted)]" aria-hidden="true">
                0{index + 1}
              </span>
            </span>
            <span className="mt-3 text-sm font-bold text-[var(--engine-text)]">
              {t(`visitorHome.pillars.${pillar.key}.title`)}
            </span>
            <span className="mt-1 text-[12.5px] leading-snug text-[var(--engine-text-muted)]">
              {t(`visitorHome.pillars.${pillar.key}.desc`)}
            </span>
          </a>
        ))}
      </nav>
    </section>
  );
}

/* --------------------------------------------------- como tudo se conecta -- */

const CONNECT_STEPS = [
  { key: "car", icon: Car },
  { key: "reminder", icon: Bell },
  { key: "quote", icon: MessageSquareQuote },
  { key: "provider", icon: BadgeCheck },
  { key: "post", icon: Camera },
  { key: "dream", icon: Target },
];

function ConnectStrip() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="home-connect" className="engine-card p-4 sm:p-6">
      <h2 id="home-connect" className={eyebrowClass}>
        {t("visitorHome.connect.title")}
      </h2>
      <ol className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-2">
        {CONNECT_STEPS.map((step, index) => (
          <li key={step.key} className="flex items-start gap-2.5 lg:flex-col lg:gap-2">
            {/* No desktop a linha entre os ícones desenha o caminho. */}
            <span className="flex shrink-0 items-center gap-2 lg:w-full lg:pr-1">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--engine-border-strong)] text-[var(--engine-text)]">
                <step.icon size={17} aria-hidden="true" />
              </span>
              {index < CONNECT_STEPS.length - 1 && (
                <span aria-hidden="true" className="hidden h-px flex-1 bg-[var(--engine-border-strong)] lg:block" />
              )}
            </span>
            <span className="min-w-0 pt-2 text-[13px] leading-snug text-[var(--engine-text)] lg:pt-0">
              {t(`visitorHome.connect.${step.key}`)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------ 01 sonho --- */

const COST_ITEMS = ["ipva", "insurance", "fuel", "maintenance", "financing", "depreciation"];

function SimulatorTool() {
  const { t } = useTranslation();
  return (
    <div className="engine-slab p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--engine-slab-accent)]">
        {t("visitorHome.dream.toolEyebrow")}
      </p>
      <p className="mt-2 font-display text-xl font-bold leading-tight tracking-tight sm:text-2xl">
        {t("visitorHome.dream.toolTitle")}
      </p>

      <ul className="mt-4 flex flex-wrap gap-1.5">
        {COST_ITEMS.map((key) => (
          <li
            key={key}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--engine-slab-line)] bg-[var(--engine-slab-cell)] px-2.5 py-1 text-[12px]"
          >
            <Check size={12} aria-hidden="true" className="text-[var(--engine-slab-accent)]" />
            {t(`visitorHome.dream.items.${key}`)}
          </li>
        ))}
      </ul>

      {/* A regra, não um exemplo: renda em que o custo do mês é 20% = custo × 5. */}
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <span className="flex items-center rounded-xl border border-[var(--engine-slab-line)] bg-[var(--engine-slab-cell)] px-3 py-3 text-[13px] font-semibold leading-snug">
          {t("visitorHome.dream.monthlyCost")}
        </span>
        <span className="flex items-center font-display text-base font-bold text-[var(--engine-slab-fg-muted)]">
          {t("visitorHome.dream.times")}
        </span>
        <span className="flex items-center rounded-xl bg-[var(--engine-slab-raise)] px-3 py-3 text-[13px] font-bold leading-snug text-[var(--engine-slab-accent)] ring-1 ring-[var(--engine-slab-accent)]">
          {t("visitorHome.dream.income")}
        </span>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-[var(--engine-slab-fg-muted)]">{t("visitorHome.dream.note")}</p>
      <Link
        to={SIGNUP_TO_GARAGE}
        className={`${linkBase} mt-4 h-12 w-full bg-[var(--engine-slab-fg)] px-6 text-sm text-[var(--engine-slab-ink)] hover:brightness-95 sm:w-auto`}
      >
        <Calculator size={18} aria-hidden="true" />
        {t("visitorHome.dream.cta")}
      </Link>
    </div>
  );
}

const isImageUrl = (value) => /^(https?:|data:image\/)/.test(String(value || ""));

function AuthorLine({ post }) {
  return (
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
  );
}

function PostImage({ post, badge }) {
  const image = post.image || post.images?.[0] || "";
  return (
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
            {post.note || formatCarName(post) || post.title}
          </p>
        </div>
      )}
      {badge && (
        <span className="absolute left-2.5 top-2.5 rounded-full bg-[var(--engine-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--engine-text)] shadow-[var(--engine-shadow-sm)]">
          {badge}
        </span>
      )}
    </div>
  );
}

function GoalCard({ post }) {
  const { t } = useTranslation();
  const progress = Math.round(post.progress);
  return (
    <Link
      to={`/post/${encodeURIComponent(post.id)}`}
      className={`${railItem} engine-card engine-card-hover group flex flex-col overflow-hidden`}
    >
      <PostImage post={post} />
      <div className="flex flex-1 flex-col p-3.5">
        <h4 className="line-clamp-1 text-sm font-bold text-[var(--engine-text)]">{formatCarName(post) || post.title}</h4>
        <div className="mt-2 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--engine-surface-2)]">
            {/* Largura vem do dado: é a exceção de estilo inline que o resto do app também usa. */}
            <span className="block h-full rounded-full bg-[var(--engine-accent)]" style={{ width: `${Math.max(progress, 2)}%` }} />
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-[var(--engine-text)]">
            {t("visitorHome.dream.saved", { progress })}
          </span>
        </div>
        <AuthorLine post={post} />
      </div>
    </Link>
  );
}

function DreamPillar({ state }) {
  const { t } = useTranslation();
  const goals = (state?.items || []).filter((post) => post.kind !== "post").slice(0, 3);

  return (
    <section id="sonho" aria-labelledby="home-dream" className="scroll-mt-24 space-y-6">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-10">
        <PillarIntro
          id="home-dream"
          eyebrow={t("visitorHome.dream.eyebrow")}
          title={t("visitorHome.dream.title")}
          body={t("visitorHome.dream.body")}
        />
        <SimulatorTool />
      </div>

      <div>
        <SectionHeader title={t("visitorHome.dream.goalsTitle")} to="/community" linkLabel={t("visitorHome.community.seeAll")} />
        {!state ? (
          <SkeletonRail />
        ) : state.failed ? (
          <LoadError />
        ) : goals.length === 0 ? (
          <EmptyState
            icon={<Target size={22} aria-hidden="true" />}
            title={t("visitorHome.dream.goalsEmptyTitle")}
            body={t("visitorHome.dream.goalsEmptyBody")}
          />
        ) : (
          <div className={railClass}>
            {goals.map((post) => (
              <GoalCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- 02 garagem -- */

const REMINDERS = [
  { key: "ipva", icon: Receipt },
  { key: "licensing", icon: FileCheck },
  { key: "service", icon: Wrench },
  { key: "insurance", icon: ShieldCheck },
];

function GaragePillar() {
  const { t } = useTranslation();
  return (
    <section id="garagem" aria-labelledby="home-garage" className="scroll-mt-24">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-10">
        <PillarIntro
          id="home-garage"
          eyebrow={t("visitorHome.garage.eyebrow")}
          title={t("visitorHome.garage.title")}
          body={t("visitorHome.garage.body")}
        >
          <Link to={SIGNUP_TO_GARAGE} className={`${linkStrong} mt-5 w-full sm:w-auto`}>
            <Car size={18} aria-hidden="true" />
            {t("visitorHome.garage.cta")}
          </Link>
        </PillarIntro>

        <div>
          <ul className="grid grid-cols-2 gap-3">
            {REMINDERS.map((item) => (
              <li key={item.key} className="engine-card flex flex-col p-4">
                <span className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text)]">
                    <item.icon size={19} aria-hidden="true" />
                  </span>
                  <Bell size={15} aria-hidden="true" className="text-[var(--engine-text-muted)]" />
                </span>
                <span className="mt-3 text-sm font-bold text-[var(--engine-text)]">
                  {t(`visitorHome.garage.reminders.${item.key}.title`)}
                </span>
                <span className="mt-1 text-[12.5px] leading-snug text-[var(--engine-text-muted)]">
                  {t(`visitorHome.garage.reminders.${item.key}.desc`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--engine-text-muted)]">
            {t("visitorHome.garage.note")}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- 03 serviços -- */

const PROVIDER_POINTS = [
  { key: "page", icon: Link2 },
  { key: "quotes", icon: MessageSquareQuote },
  { key: "reviews", icon: Star },
  { key: "social", icon: Camera },
];

function BioCard() {
  const { t } = useTranslation();
  // O endereço é o do próprio app: é exatamente o que vai na bio.
  const host = typeof window !== "undefined" ? window.location.host : "";
  return (
    <div className="engine-card p-5 sm:p-6">
      <p className={eyebrowClass}>{t("visitorHome.services.bioLabel")}</p>
      <p className="mt-2 flex min-w-0 items-center gap-2 rounded-xl border border-[var(--engine-border-strong)] bg-[var(--engine-surface-2)] px-3 py-2.5 font-mono text-[13px] text-[var(--engine-text)]">
        <Link2 size={15} aria-hidden="true" className="shrink-0 text-[var(--engine-text-muted)]" />
        <span className="truncate">
          {host}
          {t("visitorHome.services.bioPath")}
        </span>
      </p>
      <ul className="mt-4 space-y-2.5">
        {PROVIDER_POINTS.map((point) => (
          <li key={point.key} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-[var(--engine-text)]">
            <point.icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
            {t(`visitorHome.services.points.${point.key}`)}
          </li>
        ))}
      </ul>
      <Link to="/services" className={`${linkStrong} mt-5 w-full`}>
        <Store size={18} aria-hidden="true" />
        {t("visitorHome.services.cta")}
      </Link>
    </div>
  );
}

function ListingCard({ listing }) {
  const { t, i18n } = useTranslation();
  const photo = listing.photos[0];
  const place = [listing.city, listing.state].filter(Boolean).join(" · ");
  const rated = listing.ratingCount > 0 && listing.ratingAvg;
  const avg = rated ? listing.ratingAvg.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) : "";

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
        <h4 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-[var(--engine-text)]">
          {listing.title || listing.providerName}
        </h4>
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
              aria-label={t("visitorHome.services.rating", { avg, count: listing.ratingCount })}
            >
              <Star size={13} aria-hidden="true" className="fill-current" />
              {avg}
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
        {t("visitorHome.services.cta")}
        <ArrowRight size={15} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function ServicesPillar({ state }) {
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
    <section id="servicos" aria-labelledby="home-services" className="scroll-mt-24 space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-10">
        <PillarIntro
          id="home-services"
          eyebrow={t("visitorHome.services.eyebrow")}
          title={t("visitorHome.services.title")}
          body={t("visitorHome.services.body")}
        >
          {/* O outro lado da mesma vitrine: quem precisa do serviço. */}
          <Link
            to="/services/orcamentos"
            className="engine-card engine-card-hover group mt-5 flex items-center gap-3 p-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
              <MessageSquareQuote size={20} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--engine-text)]">
                {t("visitorHome.services.customerTitle")}
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--engine-text-muted)]">
                {t("visitorHome.services.customerBody")}
              </span>
            </span>
            <span className="hidden shrink-0 items-center gap-1 text-[13px] font-semibold text-[var(--engine-text)] sm:inline-flex">
              {t("visitorHome.services.customerCta")}
            </span>
            <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--engine-text-muted)]" />
          </Link>
        </PillarIntro>
        <BioCard />
      </div>

      <div>
        <SectionHeader
          title={t("visitorHome.services.listTitle")}
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
              {t("visitorHome.services.cta")}
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
      </div>
    </section>
  );
}

/* -------------------------------------------------------- 04 comunidade -- */

const COMMUNITY_POINTS = [
  { key: "clubs", icon: Shield },
  { key: "meets", icon: CalendarDays },
  { key: "achievements", icon: Trophy },
  { key: "posts", icon: Camera },
];

function ClubCard({ club }) {
  const { t } = useTranslation();
  const place = [club.city, club.state].filter(Boolean).join(" · ");
  return (
    <Link
      to={`/clubs/${encodeURIComponent(club.id)}`}
      className={`${railItem} engine-card engine-card-hover flex flex-col p-4`}
    >
      <span className="flex items-center gap-3">
        <span className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-text)] px-2 font-mono text-[12px] font-bold tracking-wide text-[var(--engine-bg)]">
          {club.tag}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-[var(--engine-text)]">{club.name}</span>
          <span className="block truncate text-[12px] text-[var(--engine-text-muted)]">
            {[place, t("visitorHome.community.members", { count: club.memberCount })].filter(Boolean).join(" · ")}
          </span>
        </span>
      </span>
      {club.motto && (
        <span className="mt-3 line-clamp-2 text-[13px] italic leading-snug text-[var(--engine-text-muted)]">
          “{club.motto}”
        </span>
      )}
    </Link>
  );
}

function PostCard({ post }) {
  const { t } = useTranslation();
  const carName = formatCarName(post) || post.title;
  return (
    <Link
      to={`/post/${encodeURIComponent(post.id)}`}
      className={`${railItem} engine-card engine-card-hover group flex flex-col overflow-hidden`}
    >
      <PostImage post={post} badge={t("visitorHome.community.post")} />
      <div className="flex flex-1 flex-col p-3.5">
        {carName && <h4 className="line-clamp-1 text-sm font-bold text-[var(--engine-text)]">{carName}</h4>}
        <AuthorLine post={post} />
      </div>
    </Link>
  );
}

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

function CommunityPillar({ clubs, events, posts }) {
  const { t } = useTranslation();
  const { region } = useRegion();

  const clubsShown = useMemo(
    () =>
      applyRegionFilter(clubs?.items || [], region, (club) => ({ country: club.country, state: club.state }), {
        minVisible: 3,
      }).items.slice(0, 3),
    [clubs, region],
  );
  const eventsShown = useMemo(
    () =>
      applyRegionFilter(events?.items || [], region, (event) => ({ country: event.country, state: event.state }), {
        minVisible: 2,
      }).items.slice(0, 3),
    [events, region],
  );
  // Metas já aparecem no pilar do sonho; aqui entram só os posts.
  const postsShown = (posts?.items || []).filter((post) => post.kind === "post" && (post.image || post.images?.length)).slice(0, 3);

  return (
    <section id="comunidade" aria-labelledby="home-community" className="scroll-mt-24 space-y-6">
      <PillarIntro
        id="home-community"
        eyebrow={t("visitorHome.community.eyebrow")}
        title={t("visitorHome.community.title")}
        body={t("visitorHome.community.body")}
      >
        <ul className="mt-4 flex flex-wrap gap-2">
          {COMMUNITY_POINTS.map((point) => (
            <li
              key={point.key}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--engine-border-strong)] px-3 text-[13px] font-semibold text-[var(--engine-text)]"
            >
              <point.icon size={15} aria-hidden="true" className="text-[var(--engine-accent)]" />
              {t(`visitorHome.community.points.${point.key}`)}
            </li>
          ))}
        </ul>
      </PillarIntro>

      <div>
        <SectionHeader title={t("visitorHome.community.clubsTitle")} to="/clubs" linkLabel={t("visitorHome.community.clubsSeeAll")} />
        {!clubs ? (
          <SkeletonRail short />
        ) : clubs.failed ? (
          <LoadError />
        ) : clubsShown.length === 0 ? null : (
          <div className={railClass}>
            {clubsShown.map((club) => (
              <ClubCard key={club.id} club={club} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeader title={t("visitorHome.events.title")} to="/events" linkLabel={t("visitorHome.events.seeAll")} />
        {!events ? (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1].map((index) => (
              <div key={index} className="engine-card h-[84px] motion-safe:animate-pulse" />
            ))}
          </div>
        ) : events.failed ? (
          <LoadError />
        ) : eventsShown.length === 0 ? (
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
            {eventsShown.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* Post solto só entra quando tem foto; sem nenhum, a seção some —
          clubes e encontros já seguram o pilar. */}
      {postsShown.length > 0 && (
        <div>
          <SectionHeader title={t("visitorHome.community.postsTitle")} to="/community" linkLabel={t("visitorHome.community.seeAll")} />
          <div className={railClass}>
            {postsShown.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
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
        <p className="mt-4 font-display text-sm font-bold italic tracking-tight text-[var(--engine-text)]">
          {t("brand.signature")}
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

const Divider = () => <hr className="border-[var(--engine-border)]" />;

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
      <ConnectStrip />
      <DreamPillar state={showcase?.posts} />
      <Divider />
      <GaragePillar />
      <Divider />
      <ServicesPillar state={showcase?.listings} />
      <Divider />
      <CommunityPillar clubs={showcase?.clubs} events={showcase?.events} posts={showcase?.posts} />
      <FinalCta />
      <AdSlot slot="home-footer" format="horizontal" className="mx-auto w-full max-w-4xl" />
    </div>
  );
}
