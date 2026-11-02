import { useTranslation } from "react-i18next";
import { CarFront, Package } from "lucide-react";
import { fitLabel, formatProductPrice, productCategoryLabel } from "../../services/shops";

/**
 * Cartão do produto na vitrine (Lojas, página do perfil) e na prévia ao vivo
 * do formulário. Primeira foto = capa. `fitsCar` = o carro da garagem do
 * visitante em que a peça serve ("Serve no seu Golf").
 */
export function ProductCard({ product, fitsCar = null, onOpen = null, footer = null, preview = false }) {
  const { t, i18n } = useTranslation();
  const cover = product.photos?.[0] || "";
  const sold = product.saleStatus === "sold";
  const Wrapper = onOpen ? "button" : "div";
  return (
    <article className="engine-card flex flex-col overflow-hidden">
      <Wrapper
        {...(onOpen ? { type: "button", onClick: () => onOpen(product) } : {})}
        className="flex flex-1 flex-col text-left"
      >
        <div className="relative aspect-square w-full bg-[var(--engine-surface-2)]">
          {cover ? (
            <img src={cover} alt="" loading="lazy" className={`h-full w-full object-cover ${sold ? "opacity-60" : ""}`} />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[var(--engine-text-subtle)]">
              <Package size={32} aria-hidden="true" />
            </span>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
            {t(`shops.condition.${product.condition}`)}
          </span>
          {sold && (
            <span className="absolute right-2 top-2 rounded-full bg-[var(--engine-surface)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--engine-text)]">
              {t("shops.status.sold")}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-[var(--engine-accent)]">
            {product.category ? productCategoryLabel(product.category, t) : t("shops.categoryPick")}
          </p>
          <p className="line-clamp-2 text-sm font-bold leading-5 text-[var(--engine-text)]">
            {product.title || (preview ? t("shops.previewTitle") : "")}
          </p>
          <p className="font-display text-base font-extrabold text-[var(--engine-text)]">
            {formatProductPrice(product, t, i18n.language)}
            {product.acceptsOffers && !product.priceNegotiable && (
              <span className="ml-1.5 align-middle text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-subtle)]">
                {t("shops.price.offers")}
              </span>
            )}
          </p>
          {fitsCar ? (
            <p className="mt-auto flex items-center gap-1 text-[11px] font-bold text-emerald-600">
              <CarFront size={13} aria-hidden="true" />
              <span className="truncate">{t("shops.fitsYour", { car: fitsCar.model || fitsCar.brand || "" })}</span>
            </p>
          ) : product.fits?.length ? (
            <p className="mt-auto truncate text-[11px] font-semibold text-[var(--engine-text-muted)]">
              {t("shops.fitsShort", { list: product.fits.map(fitLabel).slice(0, 2).join(", ") })}
            </p>
          ) : null}
          {(product.city || product.providerName) && (
            <p className="truncate text-[11px] font-medium text-[var(--engine-text-subtle)]">
              {[product.providerName, product.city].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </Wrapper>
      {footer}
    </article>
  );
}
