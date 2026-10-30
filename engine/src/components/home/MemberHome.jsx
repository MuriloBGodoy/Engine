import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  CalendarDays,
  Car,
  ChevronRight,
  Inbox,
  MessageSquareQuote,
  Plus,
  Store,
  Target,
  Users,
} from "lucide-react";
import { AdSlot } from "../AdSlot";
import { useRegion } from "../../hooks/RegionProvider";
import { applyRegionFilter } from "../../services/region";
import { CAR_TYPE_OWNED } from "../../services/db";
import { formatCarName } from "../../services/carDisplay";
import { garageUpcoming, hasAnyReminderSetting, localISODate } from "../../services/reminders";
import { formatDueDate, reminderStatusText, reminderTitle } from "../../services/reminderLabels";
import { getServiceCategoryLabel } from "../../services/serviceListingDisplay";
import {
  fetchApprovedListings,
  fetchMyListings,
  fetchOpenQuoteInbox,
  fetchRecentPosts,
  fetchUpcomingEvents,
} from "../../services/homeShowcase";
import {
  EmptyState,
  EventRow,
  GoalCard,
  ListingCard,
  LoadError,
  PostCard,
  SectionHeader,
  SkeletonRail,
} from "./VisitorHome";

/**
 * "/" de quem entrou: o que há de novo comigo e com o meu carro hoje.
 *
 * Até 29/10/2026 era o hero de marketing antigo ("ENGINE GARAGE", meta
 * financeira, Começar/Ver painel e três cards que repetiam o menu) — uma
 * propaganda para quem já tinha conta. Agora é um painel pessoal com os
 * mesmos quatro pilares da Home do visitante: vencimentos, garagem, serviços
 * e comunidade.
 *
 * Vencimentos e garagem saem dos carros que o App já tem em memória: zero
 * leitura. O resto são leituras únicas, pequenas e com teto (homeShowcase.js),
 * cada uma por conta própria: se a de orçamentos falhar (migration ainda não
 * aplicada), só aquele pedaço some ou mostra o vazio.
 */

const railClass =
  "engine-rail -mx-4 gap-3 px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:px-0";
const linkSecondary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] px-5 text-[13px] font-semibold text-[var(--engine-text)] transition-colors hover:border-[var(--engine-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)]";
const linkPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--engine-accent)] px-5 text-[13px] font-semibold text-white transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)]";

/** Uma leitura com estado próprio: null = carregando; { items, failed }. */
function useRead(loader, deps) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    loader()
      .then((items) => active && setState({ items: items || [], failed: false }))
      .catch(() => active && setState({ items: [], failed: true }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/* ------------------------------------------------------------ saudação -- */

function Greeting({ name }) {
  const { t } = useTranslation();
  const first = String(name || "").trim().split(/\s+/)[0];
  return (
    <header className="engine-rise">
      <p className="text-[12px] font-semibold italic text-[var(--engine-text-muted)]">
        {t("visitorHome.sloganLead")} {t("visitorHome.sloganAccent")}
      </p>
      <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[var(--engine-text)] sm:text-3xl">
        {first ? t("memberHome.greeting", { name: first }) : t("memberHome.greetingNoName")}
      </h1>
      <p className="mt-1 text-[14px] text-[var(--engine-text-muted)]">{t("memberHome.today")}</p>
    </header>
  );
}

/* ------------------------------------------------------- vencimentos ---- */

const STATUS_DOT = {
  overdue: "bg-[var(--engine-accent)]",
  today: "bg-[var(--engine-accent)]",
  soon: "bg-[var(--engine-text)]",
};

function Reminders({ cars }) {
  const { t, i18n } = useTranslation();
  const today = localISODate();
  const owned = cars.filter((car) => car.type === CAR_TYPE_OWNED);
  if (!owned.length) return null;

  const configured = owned.some(hasAnyReminderSetting);
  const upcoming = garageUpcoming(owned, today)
    .filter((item) => ["overdue", "today", "soon"].includes(item.status))
    .slice(0, 3);

  return (
    <section aria-labelledby="member-reminders">
      <SectionHeader
        id="member-reminders"
        title={t("memberHome.reminders.title")}
        to="/garagem"
        linkLabel={t("memberHome.reminders.seeGarage")}
      />
      {!configured ? (
        <EmptyState
          icon={<Bell size={22} aria-hidden="true" />}
          title={t("memberHome.reminders.setupTitle")}
          body={t("memberHome.reminders.setupBody")}
        >
          <Link to="/garagem" className={`${linkSecondary} w-full shrink-0 sm:w-auto`}>
            {t("memberHome.reminders.setupCta")}
          </Link>
        </EmptyState>
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={<Bell size={22} aria-hidden="true" />}
          title={t("memberHome.reminders.clearTitle")}
          body={t("memberHome.reminders.clearBody")}
        />
      ) : (
        <ul className="engine-card divide-y divide-[var(--engine-border)]">
          {upcoming.map((item, index) => (
            <li key={`${item.carId}-${item.kind}-${item.dueDate || index}`}>
              <Link to="/garagem" className="flex min-h-14 items-center gap-3 px-4 py-3">
                <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--engine-text)]">
                    {reminderTitle(t, item)}
                  </span>
                  <span className="block truncate text-[12px] text-[var(--engine-text-muted)]">
                    {formatCarName(item.car) || t("reminders.yourCar")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={`block text-[12.5px] font-semibold ${
                      item.status === "soon" ? "text-[var(--engine-text)]" : "text-[var(--engine-accent)]"
                    }`}
                  >
                    {reminderStatusText(t, item)}
                  </span>
                  {item.dueDate && (
                    <span className="block text-[11.5px] text-[var(--engine-text-muted)]">
                      {formatDueDate(item.dueDate, i18n.language, today)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------------------------------------- garagem ---- */

function CarTile({ car }) {
  const { t } = useTranslation();
  const isGoal = car.type !== CAR_TYPE_OWNED;
  const progress = isGoal && car.targetValue ? Math.min(100, Math.round((car.savedValue / car.targetValue) * 100)) : 0;
  return (
    <Link
      to="/garagem"
      className="engine-card engine-card-hover flex w-[78%] max-w-[300px] flex-col overflow-hidden sm:w-[46%] lg:w-auto lg:max-w-none"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--engine-surface-2)]">
        {car.image ? (
          <img src={car.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--engine-text-muted)]">
            <Car size={32} aria-hidden="true" />
          </div>
        )}
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[var(--engine-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--engine-text)] shadow-[var(--engine-shadow-sm)]">
          {isGoal ? <Target size={12} aria-hidden="true" /> : <Car size={12} aria-hidden="true" />}
          {isGoal ? t("memberHome.garage.goal") : t("memberHome.garage.owned")}
        </span>
      </div>
      <div className="p-3.5">
        <p className="line-clamp-1 text-sm font-bold text-[var(--engine-text)]">{formatCarName(car)}</p>
        {isGoal ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--engine-surface-2)]">
              {/* Largura vem do dado: a exceção de estilo inline que o app inteiro usa. */}
              <span className="block h-full rounded-full bg-[var(--engine-accent)]" style={{ width: `${Math.max(progress, 2)}%` }} />
            </span>
            <span className="shrink-0 text-[12px] font-semibold text-[var(--engine-text)]">
              {t("memberHome.garage.saved", { progress })}
            </span>
          </div>
        ) : (
          car.year && <p className="mt-1 text-[12px] text-[var(--engine-text-muted)]">{car.year}</p>
        )}
      </div>
    </Link>
  );
}

function Garage({ cars }) {
  const { t } = useTranslation();
  // O carro que se tem primeiro; depois as metas, a mais adiantada antes.
  const sorted = [...cars].sort((a, b) => {
    const ownedA = a.type === CAR_TYPE_OWNED ? 0 : 1;
    const ownedB = b.type === CAR_TYPE_OWNED ? 0 : 1;
    if (ownedA !== ownedB) return ownedA - ownedB;
    const pa = a.targetValue ? a.savedValue / a.targetValue : 0;
    const pb = b.targetValue ? b.savedValue / b.targetValue : 0;
    return pb - pa;
  });
  const shown = sorted.slice(0, 3);
  const rest = cars.length - shown.length;

  return (
    <section aria-labelledby="member-garage">
      <SectionHeader
        id="member-garage"
        title={t("memberHome.garage.title")}
        to="/garagem"
        linkLabel={rest > 0 ? t("memberHome.garage.more", { count: rest }) : t("memberHome.garage.seeAll")}
      />
      {cars.length === 0 ? (
        <EmptyState
          icon={<Car size={22} aria-hidden="true" />}
          title={t("memberHome.garage.emptyTitle")}
          body={t("memberHome.garage.emptyBody")}
        >
          <Link to="/garagem" className={`${linkPrimary} w-full shrink-0 sm:w-auto`}>
            <Plus size={17} aria-hidden="true" />
            {t("memberHome.garage.addCta")}
          </Link>
        </EmptyState>
      ) : (
        <div className={railClass}>
          {shown.map((car) => (
            <CarTile key={car.id} car={car} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------- serviços ---- */

function ProviderBox({ listings }) {
  const { t } = useTranslation();
  const approved = listings.some((listing) => listing.approved);
  // Monta depois que os anúncios chegaram, então `approved` não muda aqui.
  // Sem a migration de orçamentos a leitura falha e a caixa mostra o vazio.
  const read = useRead(() => (approved ? fetchOpenQuoteInbox() : Promise.resolve([])), []);
  const inbox = read?.failed ? { items: [] } : read;
  const count = inbox?.items.length || 0;
  const first = inbox?.items.slice(0, 2) || [];

  return (
    <div className="engine-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
          <Inbox size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--engine-text)]">{t("memberHome.services.inboxTitle")}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--engine-text-muted)]">
            {!approved
              ? t("memberHome.services.pending")
              : !inbox
                ? "…"
                : count > 0
                  ? t("memberHome.services.inboxCount", { count })
                  : t("memberHome.services.inboxEmpty")}
          </p>
        </div>
      </div>
      {approved && first.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {first.map((request) => (
            <li key={request.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--engine-surface-2)] px-3 py-2 text-[12.5px]">
              <span className="min-w-0 truncate font-semibold text-[var(--engine-text)]">
                {getServiceCategoryLabel(request.category, t)}
              </span>
              <span className="shrink-0 text-[var(--engine-text-muted)]">
                {[request.city, request.state].filter(Boolean).join(" · ") || t(`quotes.urgencyShort.${request.urgency}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {approved && (
          <Link to="/services/orcamentos?tab=inbox" className={`${linkPrimary} w-full sm:w-auto`}>
            {t("memberHome.services.inboxCta")}
          </Link>
        )}
        <Link to="/services" className={`${linkSecondary} w-full sm:w-auto`}>
          <Store size={16} aria-hidden="true" />
          {t("memberHome.services.monthCta")}
        </Link>
      </div>
    </div>
  );
}

function CustomerBox() {
  const { t } = useTranslation();
  return (
    <Link to="/services/orcamentos?new=1" className="engine-card engine-card-hover flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
        <MessageSquareQuote size={20} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[var(--engine-text)]">{t("visitorHome.services.customerTitle")}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--engine-text-muted)]">
          {t("visitorHome.services.customerBody")}
        </span>
      </span>
      <span className="hidden shrink-0 text-[13px] font-semibold text-[var(--engine-text)] sm:inline">
        {t("visitorHome.services.customerCta")}
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--engine-text-muted)]" />
    </Link>
  );
}

function Services({ userId }) {
  const { t } = useTranslation();
  const { region } = useRegion();
  const mine = useRead(() => fetchMyListings(userId), [userId]);
  const isProvider = Boolean(mine?.items.length);
  const listings = useRead(() => fetchApprovedListings(), []);

  const shown = useMemo(
    () =>
      applyRegionFilter(listings?.items || [], region, (listing) => ({
        country: listing.country,
        state: listing.state,
        city: listing.city,
      }))
        .items.filter((listing) => listing.ownerId !== userId)
        .slice(0, 3),
    [listings, region, userId],
  );

  return (
    <section aria-labelledby="member-services" className="space-y-4">
      <SectionHeader
        id="member-services"
        title={t("memberHome.services.title")}
        to="/services"
        linkLabel={t("visitorHome.services.seeAll")}
      />
      {isProvider ? <ProviderBox listings={mine.items} /> : <CustomerBox />}

      {!listings ? (
        <SkeletonRail />
      ) : listings.failed ? (
        <LoadError />
      ) : shown.length > 0 ? (
        <div className={railClass}>
          {shown.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------- comunidade --- */

function Community() {
  const { t } = useTranslation();
  const { region } = useRegion();
  const posts = useRead(() => fetchRecentPosts(), []);
  const events = useRead(() => fetchUpcomingEvents(), []);

  const postsShown = (posts?.items || []).filter((post) => post.image || post.images?.length).slice(0, 3);
  const eventsShown = useMemo(
    () =>
      applyRegionFilter(events?.items || [], region, (event) => ({ country: event.country, state: event.state }), {
        minVisible: 2,
      }).items.slice(0, 2),
    [events, region],
  );

  return (
    <section aria-labelledby="member-community" className="space-y-6">
      <div>
        <SectionHeader
          id="member-community"
          title={t("memberHome.community.title")}
          to="/community"
          linkLabel={t("visitorHome.community.seeAll")}
        />
        {!posts ? (
          <SkeletonRail />
        ) : posts.failed ? (
          <LoadError />
        ) : postsShown.length === 0 ? (
          <EmptyState icon={<Users size={22} aria-hidden="true" />} title={t("memberHome.community.title")} body={t("memberHome.community.emptyPosts")} />
        ) : (
          <div className={railClass}>
            {postsShown.map((post) => (post.kind === "post" ? <PostCard key={post.id} post={post} /> : <GoalCard key={post.id} post={post} />))}
          </div>
        )}
      </div>

      <div>
        <SectionHeader title={t("visitorHome.events.title")} to="/events" linkLabel={t("visitorHome.events.seeAll")} />
        {!events ? (
          <div className="engine-card h-[84px] motion-safe:animate-pulse" aria-hidden="true" />
        ) : events.failed ? (
          <LoadError />
        ) : eventsShown.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} aria-hidden="true" />}
            title={t("visitorHome.events.emptyTitle")}
            body={t("visitorHome.events.emptyBody")}
          >
            <Link to="/events" className={`${linkSecondary} w-full shrink-0 sm:w-auto`}>
              {t("visitorHome.events.emptyCta")}
            </Link>
          </EmptyState>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {eventsShown.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function MemberHome({ user, cars = [], settings }) {
  const name = settings?.profile?.displayName || user?.displayName || "";
  return (
    <div className="flex flex-col gap-8 pb-4 pt-1 sm:gap-10 sm:pt-2">
      <Greeting name={name} />
      <Reminders cars={cars} />
      <Garage cars={cars} />
      <Services userId={user?.uid} />
      <Community />
      <AdSlot slot="home-footer" format="horizontal" className="mx-auto w-full max-w-4xl" />
    </div>
  );
}
