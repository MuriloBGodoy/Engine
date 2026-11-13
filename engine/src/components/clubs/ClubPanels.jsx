import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Calendar, ChevronLeft, ChevronRight, Lock, MapPin, Link2, Loader2, Pin, X } from "lucide-react";
// O ícone do Instagram saiu do lucide-react (marcas foram removidas na v1);
// o projeto já usa `react-icons` para o WhatsApp pelo mesmo motivo.
import { FaInstagram } from "react-icons/fa6";
import { ClubTag } from "./ClubEmblem";
import { ClubRoleBadge } from "./ClubRoleBadge";
import { assignableRoles, canManageMember, roleLabel } from "../../services/clubRoles";
import { ClubEmptyState } from "./ClubHeader";
import { clubPlaceLabel, clubStyleLabel } from "../../services/clubStyles";
import { formatFipeYear } from "../../services/carDisplay";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { PersonLink } from "../social/PersonLink";
import { Select } from "../ui/Select";

/**
 * Link digitado pela direção vira `href` só se for http(s). Sem isso um
 * `javascript:` no campo "site" era um link clicável na página do clube.
 */
const safeHref = (value) => (/^https?:\/\//i.test(String(value || "").trim()) ? String(value).trim() : "");

/**
 * Os quatro painéis internos da página do clube — mural, garagem, encontros,
 * membros e sobre. Todos são de apresentação pura: recebem lista e callbacks,
 * não falam com dado nenhum. Isso é o que deixa ligar a camada do Han
 * trocando só quem chama.
 */

const Avatar = ({ name, avatar, size = 36, ring = false }) => {
  const initials = String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return avatar ? (
    <img
      src={avatar}
      alt=""
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full object-cover ${
        ring ? "ring-2 ring-[var(--club)] ring-offset-2 ring-offset-[var(--engine-surface)]" : ""
      }`}
    />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className={`grid shrink-0 place-items-center rounded-full bg-[var(--engine-border-strong)] font-extrabold text-white ${
        ring ? "ring-2 ring-[var(--club)] ring-offset-2 ring-offset-[var(--engine-surface)]" : ""
      }`}
    >
      {initials}
    </span>
  );
};

const Loading = () => (
  <div className="flex justify-center py-10 text-[var(--engine-text-muted)]">
    <Loader2 size={18} className="animate-spin" />
  </div>
);

/* ------------------------------- Mural ------------------------------- */
export function ClubWall({ club, posts, loading, canPost, onCreatePost, canPin = false, onTogglePin }) {
  const { t, i18n } = useTranslation();
  if (loading && !posts.length) return <Loading />;

  return (
    <div className="space-y-3">
      {canPost ? (
        <button
          type="button"
          onClick={onCreatePost}
          className="flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--club)] px-4 text-[14px] font-bold text-[var(--club-on)] transition hover:opacity-95"
        >
          {t("clubs.wall.post")}
        </button>
      ) : null}

      {!posts.length ? (
        <ClubEmptyState
          title={t("clubs.wall.emptyTitle")}
          copy={t("clubs.wall.emptyCopy")}
        />
      ) : (
        posts.map((post) => (
          <article
            key={post.id}
            className={`rounded-2xl border p-3.5 ${
              post.pinned
                ? "border-[color-mix(in_srgb,var(--club)_46%,transparent)] bg-[color-mix(in_srgb,var(--club)_7%,var(--engine-surface))]"
                : "border-[var(--engine-border)] bg-[var(--engine-surface)]"
            }`}
          >
            <header className="flex items-center gap-2.5">
              {/* O post do mural é o da Comunidade: o nome vem em `author`.
                  `authorName` ficou do contrato antigo e saía vazio. */}
              <PersonLink username={post.username} title={post.authorName || post.author}>
                <Avatar
                  name={post.authorName || post.author}
                  avatar={/^(https?:|data:image\/)/.test(post.authorAvatar || post.avatar || "") ? post.authorAvatar || post.avatar : ""}
                  ring={post.pinned}
                />
              </PersonLink>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-bold text-[var(--engine-text)]">
                  <PersonLink username={post.username} className="hover:text-[var(--engine-accent)]">
                    {post.authorName || post.author}
                  </PersonLink>
                  <ClubTag tag={club?.tag} />
                </p>
                <p className="text-[11.5px] text-[var(--engine-text-muted)]">
                  {post.pinned ? (
                    <span className="mr-1.5 inline-flex items-center gap-1 font-semibold text-[var(--club-ink)]">
                      <Pin size={11} />
                      {t("clubs.wall.pinned")}
                    </span>
                  ) : null}
                  {post.createdAt
                    ? new Date(post.createdAt).toLocaleDateString(i18n.language || "pt-BR", {
                        day: "numeric",
                        month: "short",
                      })
                    : ""}
                </p>
              </div>
              {/* Fixar aviso: quem tem post_announcements (o banco confere). */}
              {canPin ? (
                <button
                  type="button"
                  onClick={() => onTogglePin?.(post)}
                  aria-pressed={Boolean(post.pinned)}
                  title={post.pinned ? t("clubRoles.wall.unpin") : t("clubRoles.wall.pin")}
                  aria-label={post.pinned ? t("clubRoles.wall.unpin") : t("clubRoles.wall.pin")}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
                    post.pinned
                      ? "text-[var(--club-ink)]"
                      : "text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                  }`}
                >
                  <Pin size={15} aria-hidden="true" />
                </button>
              ) : null}
            </header>
            {post.image ? (
              <img
                src={post.image}
                alt=""
                className="mt-2.5 h-44 w-full rounded-xl object-cover"
              />
            ) : null}
            {post.note ? (
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--engine-text)]">
                {post.note}
              </p>
            ) : null}
          </article>
        ))
      )}

      <p className="text-[12px] leading-relaxed text-[var(--engine-text-muted)]">
        {t("clubs.wall.note")}
      </p>
    </div>
  );
}

/* ------------------------------- Fotos ------------------------------- */
/**
 * A galeria do clube: as fotos das publicações do mural, sem upload próprio.
 * Quem posta no mural já é membro (regra do banco), a foto já passou pela
 * limpeza de EXIF e já tem denúncia e moderação — uma segunda porta de foto
 * teria de reinventar as três.
 */
export function ClubGallery({ posts, loading }) {
  const { t } = useTranslation();
  const [openAt, setOpenAt] = useState(-1);
  const photos = [];
  for (const post of posts || []) {
    const list = post.images?.length ? post.images : post.image ? [post.image] : [];
    for (const src of list) {
      if (/^(https?:|data:image\/)/.test(src) && !photos.some((photo) => photo.src === src)) {
        photos.push({ src, author: post.author || post.authorName || "", postId: post.id });
      }
    }
  }
  if (loading && !photos.length) return <Loading />;

  return (
    <div className="space-y-3">
      {!photos.length ? (
        <ClubEmptyState title={t("clubs.custom.gallery.emptyTitle")} copy={t("clubs.custom.gallery.emptyCopy")} />
      ) : (
        <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl sm:grid-cols-4 sm:gap-1.5">
          {photos.map((photo, index) => (
            <button
              key={photo.src}
              type="button"
              onClick={() => setOpenAt(index)}
              aria-label={t("clubs.custom.gallery.open", { name: photo.author })}
              className="relative aspect-square overflow-hidden bg-[var(--engine-surface-2)]"
            >
              <img src={photo.src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <p className="text-[12px] leading-relaxed text-[var(--engine-text-muted)]">{t("clubs.custom.gallery.note")}</p>
      {openAt >= 0 && photos[openAt] ? (
        <GalleryViewer photos={photos} index={openAt} onIndex={setOpenAt} onClose={() => setOpenAt(-1)} />
      ) : null}
    </div>
  );
}

function GalleryViewer({ photos, index, onIndex, onClose }) {
  const { t } = useTranslation();
  useHistoryDismiss(true, onClose);
  const photo = photos[index];
  const go = (step) => onIndex((index + step + photos.length) % photos.length);
  const navButton =
    "absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/75";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("clubs.clubTabs.photos")}
      className="fixed inset-0 z-[120] flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white">
        <p className="min-w-0 truncate text-[13px] font-semibold">
          {photo.author} · {index + 1}/{photos.length}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("clubs.custom.gallery.close")}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
        >
          <X size={20} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <img
          src={photo.src}
          alt=""
          onClick={(event) => event.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                go(-1);
              }}
              aria-label={t("clubs.custom.gallery.previous")}
              className={`${navButton} left-2`}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                go(1);
              }}
              aria-label={t("clubs.custom.gallery.next")}
              className={`${navButton} right-2`}
            >
              <ChevronRight size={22} />
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------ Garagem ------------------------------ */
export function ClubGarage({ cars, loading, isMember, hasOwnCar, onPublish }) {
  const { t } = useTranslation();
  if (loading && !cars.length) return <Loading />;

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-relaxed text-[var(--engine-text-muted)]">
        {t("clubs.garage.hint")}
      </p>

      {!cars.length ? (
        <ClubEmptyState
          title={t("clubs.garage.emptyTitle")}
          copy={t("clubs.garage.emptyCopy")}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {cars.map((car) => (
            <article
              key={car.goalId}
              className="overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)]"
            >
              <div className="relative h-24 bg-[var(--engine-surface-2)]">
                {car.image ? (
                  <img src={car.image} alt="" className="h-full w-full object-cover" />
                ) : null}
                {car.matchesFocus ? (
                  <span className="absolute left-1.5 top-1.5 rounded bg-[var(--club)] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[var(--club-on)]">
                    {car.matchLabel || car.brand}
                  </span>
                ) : null}
              </div>
              <div className="p-2.5">
                <p className="text-[12.5px] font-bold leading-tight text-[var(--engine-text)]">
                  {car.name || `${car.brand} ${car.model}`}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--engine-text-muted)]">{formatFipeYear(car.year, t("car.zeroKm"))}</p>
                <PersonLink
                  username={car.ownerTag}
                  className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)]"
                  title={car.ownerName}
                >
                  <Avatar name={car.ownerName} avatar={car.ownerAvatar} size={20} />
                  <span className="truncate">{car.ownerName}</span>
                </PersonLink>
              </div>
            </article>
          ))}
        </div>
      )}

      {cars.length >= 30 ? (
        <p className="text-[11.5px] text-[var(--engine-text-muted)]">{t("clubs.garage.limit")}</p>
      ) : null}

      {isMember && !hasOwnCar ? (
        <ClubEmptyState
          title={t("clubs.garage.mineMissing")}
          action={t("clubs.garage.publish")}
          onAction={onPublish}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------- Encontros ----------------------------- */
function EventRow({ event, past }) {
  const { i18n } = useTranslation();
  const date = event.eventDate ? new Date(event.eventDate) : null;
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-2.5 ${
        past ? "opacity-70" : ""
      }`}
    >
      <div className="w-[52px] shrink-0 rounded-lg border border-[color-mix(in_srgb,var(--club)_34%,transparent)] bg-[color-mix(in_srgb,var(--club)_13%,transparent)] py-1.5 text-center">
        <span className="block font-display text-[18px] font-extrabold leading-none text-[var(--club-ink)]">
          {date ? date.toLocaleDateString(i18n.language || "pt-BR", { day: "2-digit" }) : "--"}
        </span>
        <span className="block text-[10px] font-extrabold uppercase tracking-wide text-[var(--club-ink)]">
          {date ? date.toLocaleDateString(i18n.language || "pt-BR", { month: "short" }) : ""}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold text-[var(--engine-text)]">{event.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-[var(--engine-text-muted)]">
          <MapPin size={12} />
          {[event.location, event.city].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}

export function ClubMeetups({ club, events, pastEvents, loading, canCreate, onCreate }) {
  const { t } = useTranslation();
  if (loading && !events.length && !pastEvents.length) return <Loading />;

  return (
    <div className="space-y-3">
      {club?.meetupSchedule ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3">
          <Calendar size={17} className="shrink-0 text-[var(--club-ink)]" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[var(--engine-text)]">
              {t("clubs.meetups.fixed")}
            </p>
            <p className="text-[12.5px] text-[var(--engine-text-muted)]">
              {club.meetupSchedule}
            </p>
          </div>
        </div>
      ) : null}

      {canCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--engine-border-strong)] px-4 text-[14px] font-bold text-[var(--engine-text)] transition-colors hover:border-[var(--club)]"
        >
          {t("clubs.meetups.create")}
        </button>
      ) : null}

      {!events.length && !pastEvents.length ? (
        <ClubEmptyState
          title={t("clubs.meetups.emptyTitle")}
          copy={t("clubs.meetups.emptyCopy")}
        />
      ) : null}

      {events.length ? (
        <>
          <h4 className="text-[13px] font-extrabold uppercase tracking-wide text-[var(--engine-text-muted)]">
            {t("clubs.meetups.next")}
          </h4>
          <div className="space-y-2">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </>
      ) : null}

      {pastEvents.length ? (
        <>
          <h4 className="pt-1 text-[13px] font-extrabold uppercase tracking-wide text-[var(--engine-text-muted)]">
            {t("clubs.meetups.past")}
          </h4>
          <div className="space-y-2">
            {pastEvents.map((event) => (
              <EventRow key={event.id} event={event} past />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------ Membros ------------------------------ */
/**
 * A lista em ordem de hierarquia, com o selo do cargo. Quem tem
 * manage_members vê, em quem está abaixo dele, a troca de cargo (só os
 * cargos que ele pode dar) e o remover. Quem decide é o banco.
 */
export function ClubMemberList({ club, members, total, loading, roles = [], myRole = null, myUid = "", onAssign, onRemove }) {
  const { t } = useTranslation();
  if (loading && !members.length) return <Loading />;
  if (!members.length) return <ClubEmptyState title={t("clubs.members.emptyTitle")} />;
  const options = assignableRoles(roles, myRole);

  return (
    <div className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-3.5">
      {members.map((member) => {
        const role = member.roleInfo;
        const manageable = canManageMember(myRole, myUid, member, role);
        const choices = manageable
          ? options.some((option) => option.id === member.roleId)
            ? options
            : [...(role ? [role] : []), ...options]
          : [];
        return (
          <div
            key={member.uid}
            className="flex flex-wrap items-center gap-2.5 border-b border-[var(--engine-border)] py-2.5 last:border-b-0"
          >
            <PersonLink username={member.username} title={member.displayName}>
              <Avatar name={member.displayName} avatar={member.avatar} ring={member.roleId === "founder"} />
            </PersonLink>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-bold text-[var(--engine-text)]">
                <PersonLink username={member.username} className="hover:text-[var(--engine-accent)]">
                  {member.displayName}
                </PersonLink>
                <ClubTag tag={club?.tag} />
                <ClubRoleBadge role={role} />
              </p>
              <p className="truncate text-[11.5px] text-[var(--engine-text-muted)]">
                {[member.username, member.carLabel].filter(Boolean).join(" · ")}
              </p>
            </div>
            {manageable ? (
              <div className="flex shrink-0 items-center gap-1">
                <label className="sr-only" htmlFor={`role-${member.uid}`}>
                  {t("clubRoles.assignLabel", { name: member.displayName })}
                </label>
                <Select
                  id={`role-${member.uid}`}
                  value={member.roleId}
                  onChange={(event) => onAssign?.(member, event.target.value)}
                  className="min-h-9 max-w-[9.5rem] rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-2 text-[12px] font-semibold text-[var(--engine-text)]"
                >
                  {choices.map((option) => (
                    <option key={option.id} value={option.id}>
                      {roleLabel(t, option)}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => onRemove?.(member)}
                  aria-label={t("clubs.captain.remove")}
                  title={t("clubs.captain.remove")}
                  className="grid min-h-9 min-w-9 place-items-center rounded-lg px-2 text-[13px] font-semibold text-[var(--engine-accent)]"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
      {total && total > members.length ? (
        <p className="py-2.5 text-[12px] text-[var(--engine-text-muted)]">
          {t("clubs.members.showing", { shown: members.length, total })}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------- Sobre ------------------------------- */
const AboutCard = ({ title, children }) => (
  <section className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3.5">
    <h4 className="text-[14px] font-extrabold text-[var(--engine-text)]">{title}</h4>
    <div className="mt-2">{children}</div>
  </section>
);

const AboutRow = ({ label, value }) => (
  <div className="flex justify-between gap-3 text-[13px]">
    <span className="text-[var(--engine-text-muted)]">{label}</span>
    <span className="text-right font-semibold text-[var(--engine-text)]">{value}</span>
  </div>
);

export function ClubAbout({ club, isMember }) {
  const { t } = useTranslation();
  if (!club) return null;

  const focus = [
    ...(club.focus?.brands || []),
    ...(club.focus?.models || []),
    ...(club.focus?.styles || []).map((style) => clubStyleLabel(t, style)),
  ].join(" · ");

  return (
    <div className="space-y-3">
      <AboutCard title={t("clubs.about.description")}>
        <p className="text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
          {club.description || t("clubs.about.empty")}
        </p>
      </AboutCard>

      {club.rules?.length ? (
        <AboutCard title={t("clubs.about.rules")}>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-[var(--engine-text)]">
            {club.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </AboutCard>
      ) : null}

      <AboutCard title={t("clubs.about.sheet")}>
        <div className="space-y-1.5">
          {club.foundedYear ? (
            <AboutRow label={t("clubs.about.founded")} value={club.foundedYear} />
          ) : null}
          <AboutRow label={t("clubs.about.city")} value={clubPlaceLabel(club, t)} />
          {club.meetupSchedule ? (
            <AboutRow label={t("clubs.about.meetup")} value={club.meetupSchedule} />
          ) : null}
          <AboutRow
            label={t("clubs.about.entry")}
            value={t(`clubs.form.join${club.joinPolicy === "approval" ? "Approval" : "Open"}`)}
          />
          {focus ? <AboutRow label={t("clubs.about.focus")} value={focus} /> : null}
        </div>
      </AboutCard>

      {club.links?.instagram || club.links?.whatsapp || club.links?.website ? (
        <AboutCard title={t("clubs.about.links")}>
          <div className="space-y-2">
            {club.links.instagram ? (
              <a
                href={`https://instagram.com/${encodeURIComponent(club.links.instagram)}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-[var(--club-ink)]"
              >
                <FaInstagram size={15} />@{club.links.instagram}
              </a>
            ) : null}
            {safeHref(club.links.whatsapp) ? (
              isMember ? (
                <a
                  href={safeHref(club.links.whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-[var(--club-ink)]"
                >
                  <Link2 size={15} />
                  {t("clubs.about.openWhatsapp")}
                </a>
              ) : (
                // Link de grupo em página pública é convite para bot: só membro vê.
                <p className="flex min-h-11 items-center gap-2 text-[13px] text-[var(--engine-text-muted)]">
                  <Lock size={15} />
                  {t("clubs.about.whatsappLocked")}
                </p>
              )
            ) : null}
            {safeHref(club.links.website) ? (
              <a
                href={safeHref(club.links.website)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-[var(--club-ink)]"
              >
                <Link2 size={15} />
                {club.links.website}
              </a>
            ) : null}
          </div>
        </AboutCard>
      ) : null}
    </div>
  );
}
