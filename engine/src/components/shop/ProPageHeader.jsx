import { useTranslation } from "react-i18next";
import { BadgeCheck, MapPin, MessageCircle, Star, UserPlus, UserCheck } from "lucide-react";
import { WhatsAppIcon } from "../services/ListingParts";
import { ProfileLogo } from "./ShopPrimitives";
import { compactCount } from "../../services/shopFormat";
import "../../services/i18n-shop";

/**
 * Cabeçalho da página profissional (Instagram profissional + TikTok Shop):
 * capa, logo sobreposto, nome com selo, @ · categoria, nota e bairro, números,
 * equipe, e Mensagem (vermelho) + WhatsApp + Seguir.
 *
 * No celular empilha; no desktop o logo fica à esquerda, os dados no meio e
 * os botões à direita, com a capa arredondada.
 *
 *   page   { name, handle, category, logo, cover, verified, rating, ratingCount,
 *            place, productCount, serviceCount, followerCount (número),
 *            team: [{ id, name, avatar?, initials }], initials }
 *   onMessage / whatsappHref / onFollow / following  — sem onMessage, o
 *   WhatsApp vira o botão vermelho; `actions` entra ao lado (ex.: e-mail);
 *   `children` vai embaixo dos números (bio, horário, links).
 */
export function ProPageHeader({ page, onMessage, whatsappHref, onWhatsApp, onFollow, following = false, actions = null, children = null }) {
  const { t, i18n } = useTranslation();
  const team = page.team || [];
  const teamNames = team.slice(0, 3).map((member) => member.name.split(" ")[0]);
  return (
    <div>
      <div className="relative h-[150px] overflow-hidden bg-[var(--engine-surface-2)] lg:mx-6 lg:mt-4 lg:h-[200px] lg:rounded-[20px]">
        {page.cover && <img src={page.cover} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="px-4 lg:grid lg:grid-cols-[auto_1fr_auto] lg:gap-x-5 lg:px-12">
        <ProfileLogo
          src={page.logo}
          initials={page.initials}
          className="relative -mt-10 h-20 w-20 rounded-[22px] text-[22px] lg:row-span-2 lg:-mt-12 lg:h-24 lg:w-24 lg:rounded-[26px] lg:text-[26px]"
          ring="border-4 border-[var(--engine-bg)]"
        />
        <div className="lg:col-start-2 lg:row-span-2 lg:pt-3">
          <h1 className="mt-2.5 flex items-center gap-1.5 font-display text-[21px] font-bold tracking-[-0.02em] text-[var(--engine-text)] lg:mt-0">
            {page.name}
            {page.verified && <BadgeCheck size={18} aria-label={t("shop.profile.verified")} />}
          </h1>
          <p className="mt-0.5 text-sm font-semibold text-[var(--engine-text-muted)]">
            @{page.handle}
            {page.category ? ` · ${page.category}` : ""}
          </p>
          {(page.rating || page.place) && (
            <p className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] font-semibold text-[var(--engine-text)]">
              {page.rating && (
                <span className="inline-flex items-center gap-1">
                  <Star size={15} aria-hidden="true" />
                  {page.rating}
                  {page.ratingCount ? <span className="text-[var(--engine-text-muted)]">({page.ratingCount})</span> : null}
                </span>
              )}
              {page.place && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={15} aria-hidden="true" />
                  {page.place}
                </span>
              )}
            </p>
          )}
          <dl className="mt-3.5 flex gap-5">
            {page.productCount != null && (
              <Stat value={page.productCount} label={t("shop.profile.products", { count: Number(page.productCount) || 0 })} />
            )}
            {page.serviceCount != null && (
              <Stat value={page.serviceCount} label={t("shop.profile.services", { count: Number(page.serviceCount) || 0 })} />
            )}
            {page.followerCount != null && (
              <Stat
                value={compactCount(page.followerCount, i18n.language)}
                label={t("shop.profile.followers", { count: Number(page.followerCount) || 0 })}
              />
            )}
          </dl>
          {team.length > 0 && (
            <p className="mt-3.5 flex items-center gap-2.5 text-[13px] font-semibold text-[var(--engine-text)]">
              <span className="flex">
                {team.slice(0, 3).map((member, i) => (
                  <span
                    key={member.id || member.name}
                    className={`grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 border-[var(--engine-bg)] bg-[var(--engine-text-muted)] text-[10px] font-extrabold text-[var(--engine-bg)] ${i ? "-ml-2" : ""}`}
                  >
                    {member.avatar ? <img src={member.avatar} alt="" className="h-full w-full object-cover" /> : member.initials}
                  </span>
                ))}
              </span>
              <span>
                {new Intl.ListFormat(i18n.language, { style: "long", type: "conjunction" }).format(teamNames)}{" "}
                <span className="text-[var(--engine-text-muted)]">{t("shop.profile.teamSuffix")}</span>
              </span>
            </p>
          )}
          {children}
        </div>
        <div className="mt-4 flex gap-2 lg:col-start-3 lg:row-span-2 lg:mt-3.5 lg:self-start">
          {onMessage && (
            <button
              type="button"
              onClick={onMessage}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[var(--engine-accent)] px-3 text-sm font-bold text-white lg:flex-none lg:px-[18px]"
            >
              <MessageCircle size={18} aria-hidden="true" />
              {t("shop.profile.message")}
            </button>
          )}
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onWhatsApp}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[14px] px-3 text-sm font-bold lg:flex-none lg:px-[18px] ${
                onMessage
                  ? "border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text)]"
                  : "bg-[var(--engine-accent)] text-white"
              }`}
            >
              <WhatsAppIcon size={18} />
              {t("shop.profile.whatsapp")}
            </a>
          )}
          {actions}
          {onFollow && (
            <button
              type="button"
              onClick={onFollow}
              aria-pressed={following}
              aria-label={following ? t("shop.profile.following") : t("shop.profile.follow")}
              className={`grid min-h-11 w-12 shrink-0 place-items-center rounded-[14px] border ${
                following
                  ? "border-[var(--engine-text)] bg-[var(--engine-text)] text-[var(--engine-bg)]"
                  : "border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text)]"
              }`}
            >
              {following ? <UserCheck size={18} aria-hidden="true" /> : <UserPlus size={18} aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs font-semibold text-[var(--engine-text-muted)]">{label}</dt>
      <dd className="font-display text-[17px] font-bold text-[var(--engine-text)]">{value}</dd>
    </div>
  );
}

/**
 * Abas da vitrine (Produtos | Serviços | Avaliações) com contagem. Grudam no
 * topo ao rolar. `tabs` = [{ id, label, count }].
 */
export function ProPageTabs({ tabs, active, onChange, stickyTop = "top-14 lg:top-0" }) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("shop.profile.tabsLabel")}
      className={`sticky z-10 mt-4 flex border-b border-[var(--engine-border)] bg-[var(--engine-bg)] lg:mx-12 lg:mt-6 ${stickyTop}`}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`-mb-px min-h-12 flex-1 border-b-2 text-sm font-bold lg:flex-none lg:px-5 ${
            active === tab.id
              ? "border-[var(--engine-text)] text-[var(--engine-text)]"
              : "border-transparent text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
          }`}
        >
          {tab.label}
          {tab.count != null && <small className="ml-1 font-semibold text-[var(--engine-text-muted)]">{tab.count}</small>}
        </button>
      ))}
    </div>
  );
}

/** Miolo da vitrine, com o mesmo respiro lateral do cabeçalho. */
export function ProPageBody({ children }) {
  return <div className="px-4 pb-7 pt-3.5 lg:px-12 lg:pb-12 lg:pt-5">{children}</div>;
}

/** O cabeçalho em miniatura, pra prévia do passo "Monte sua página". */
export function ProPagePreviewCard({ name, handle, logo, cover, initials }) {
  const { t } = useTranslation();
  return (
    <div className="engine-card overflow-hidden">
      <div className="h-24 bg-[var(--engine-surface-2)]">
        {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="px-3.5 pb-3.5">
        <ProfileLogo
          src={logo}
          initials={initials || "·"}
          className="-mt-8 h-16 w-16 rounded-[18px] text-lg"
          ring="relative border-4 border-[var(--engine-surface)]"
        />
        <p className="mt-2 font-display text-lg font-bold text-[var(--engine-text)]">{name}</p>
        <p className="text-sm font-semibold text-[var(--engine-text-muted)]">@{handle}</p>
        <div className="mt-3 grid grid-cols-2 gap-2" aria-hidden="true">
          <span className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-[var(--engine-accent)] text-[13px] font-bold text-white">
            <MessageCircle size={16} />
            {t("shop.profile.message")}
          </span>
          <span className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[13px] font-bold text-[var(--engine-text)]">
            <WhatsAppIcon size={16} />
            {t("shop.profile.whatsapp")}
          </span>
        </div>
      </div>
    </div>
  );
}
