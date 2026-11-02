import { useTranslation } from "react-i18next";
import { Car, ChevronRight, Plus, Search, Star } from "lucide-react";
import { ProfileLogo, SwitchKnob } from "./ShopPrimitives";
import "../../services/i18n-shop";

/**
 * A aba Serviços | Lojas: título + Anunciar, o segmento, a busca e o "Mostrar
 * o que serve no Civic Touring 2019" (a ideia veio do "products that fit:
 * Mercedes E Class" da referência 07). Em Serviços, no lugar do carro vai o
 * "Perto de" (`nearSlot`), que é da tela.
 */
export function ShopBrowseHeader({
  segment,
  onSegment,
  query,
  onQuery,
  carName,
  fitOnly,
  onFitOnly,
  onAdvertise,
  nearSlot,
}) {
  const { t } = useTranslation();
  const shops = segment === "shops";
  return (
    <div className="px-4 pb-1 pt-3.5 lg:px-12 lg:pt-7">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[24px] font-bold tracking-[-0.02em] text-[var(--engine-text)] lg:text-[26px]">
          {shops ? t("shop.browse.shops") : t("shop.browse.services")}
        </h1>
        {onAdvertise && (
          <button
            type="button"
            onClick={onAdvertise}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] bg-[var(--engine-accent)] px-3.5 text-sm font-bold text-white"
          >
            <Plus size={18} aria-hidden="true" />
            {t("shop.browse.advertise")}
          </button>
        )}
      </div>
      <ShopSegment value={segment} onChange={onSegment} />
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <label className="engine-field flex min-h-[52px] items-center gap-2 rounded-[14px] border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5">
          <Search size={18} aria-hidden="true" className="text-[var(--engine-text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery?.(event.target.value)}
            aria-label={t("shop.browse.search")}
            placeholder={shops ? t("shop.browse.searchShops") : t("shop.browse.searchServices")}
            className="min-w-0 flex-1 border-0 bg-transparent text-base font-semibold text-[var(--engine-text)] outline-none placeholder:font-medium placeholder:text-[var(--engine-text-muted)]"
          />
        </label>
        {shops && carName ? (
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(fitOnly)}
            onClick={() => onFitOnly?.(!fitOnly)}
            className="flex items-center gap-2.5 rounded-[14px] border border-[var(--engine-border)] bg-[var(--engine-surface)] px-3 py-2.5 text-left"
          >
            <Car size={20} aria-hidden="true" className="text-[var(--engine-text)]" />
            <span className="min-w-0 flex-1">
              <small className="block text-xs font-semibold text-[var(--engine-text-muted)]">{t("shop.browse.fitsLabel")}</small>
              <b className="block truncate text-sm text-[var(--engine-text)]">{carName}</b>
            </span>
            <SwitchKnob on={fitOnly} />
          </button>
        ) : (
          !shops && nearSlot
        )}
      </div>
    </div>
  );
}

/** Serviços | Lojas. */
export function ShopSegment({ value, onChange }) {
  const { t } = useTranslation();
  const options = [
    ["services", t("shop.browse.services")],
    ["shops", t("shop.browse.shops")],
  ];
  return (
    <div
      role="tablist"
      aria-label={t("shop.browse.segment")}
      className="mt-3 grid grid-flow-col auto-cols-fr rounded-[14px] border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-1 lg:max-w-[360px]"
    >
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange?.(id)}
          className={`min-h-10 rounded-[10px] text-sm font-bold transition ${
            value === id
              ? "bg-[var(--engine-surface)] text-[var(--engine-text)] shadow-[var(--engine-shadow-sm)] ring-1 ring-[var(--engine-border-strong)]"
              : "text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Título de seção com o link/contador à direita. */
export function ShopSection({ title, aside, children, flush = false }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-5 lg:px-12">
        <h2 className="font-display text-lg font-bold text-[var(--engine-text)]">{title}</h2>
        {aside && <span className="text-[13px] font-semibold text-[var(--engine-text-muted)]">{aside}</span>}
      </div>
      <div className={flush ? "" : "px-4 lg:px-12"}>{children}</div>
    </section>
  );
}

/** Fileira de lojas que rola de lado. */
export function StoreRow({ children }) {
  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1 pt-0.5 [scrollbar-width:none] lg:px-12 [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

/** Card de loja: faixa da capa, logo, nome, nota · bairro. */
export function StoreCard({ name, cover, logo, initials, rating, place, onClick }) {
  return (
    <button type="button" onClick={onClick} className="engine-card w-[220px] shrink-0 overflow-hidden text-left">
      <div className="h-16 bg-[var(--engine-surface-2)]">{cover && <img src={cover} alt="" className="h-full w-full object-cover" />}</div>
      <div className="px-3 pb-3">
        <ProfileLogo
          src={logo}
          initials={initials}
          className="-mt-6 h-12 w-12 rounded-[14px] text-sm"
          ring="relative border-[3px] border-[var(--engine-surface)]"
        />
        <b className="mt-1.5 block truncate text-sm text-[var(--engine-text)]">{name}</b>
        <span className="flex items-center gap-1 truncate text-xs font-semibold text-[var(--engine-text-muted)]">
          {rating && (
            <>
              <Star size={12} aria-hidden="true" />
              {rating} ·
            </>
          )}{" "}
          {place}
        </span>
      </div>
    </button>
  );
}

/** Linha de serviço (vitrine da página e lista de Serviços). */
export function ServiceRow({ photo, title, meta, price, actionLabel, onAction, onClick }) {
  const inner = (
    <>
      <span className="aspect-square w-[76px] shrink-0 overflow-hidden rounded-xl bg-[var(--engine-surface-2)]">
        {photo && <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] text-[var(--engine-text)]">{title}</b>
        {meta && <span className="block truncate text-[13px] font-semibold text-[var(--engine-text-muted)]">{meta}</span>}
        {price && <span className="mt-1.5 block font-display text-[15px] font-bold text-[var(--engine-text)]">{price}</span>}
      </span>
    </>
  );
  if (onAction) {
    return (
      <div className="engine-card flex items-center gap-3.5 p-3.5">
        {inner}
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-11 shrink-0 items-center rounded-[14px] border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] px-3.5 text-[13px] font-bold text-[var(--engine-text)]"
        >
          {actionLabel}
        </button>
      </div>
    );
  }
  return (
    <button type="button" onClick={onClick} className="engine-card flex w-full items-center gap-3.5 p-3.5 text-left">
      {inner}
      <ChevronRight size={18} aria-hidden="true" className="text-[var(--engine-text-muted)]" />
    </button>
  );
}
