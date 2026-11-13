import { useTranslation } from "react-i18next";
import { Camera, Check } from "lucide-react";
import { PhotoTag } from "./ShopPrimitives";
import "../../services/i18n-shop";

/**
 * Card da vitrine (página profissional, Lojas, prévia do Anunciar).
 *
 * Foto quadrada com etiqueta de condição e contador, título em até 2 linhas,
 * preço em Sora, selo "Serve no seu Civic" quando casa com o carro do
 * visitante, e o @ de quem vende quando a lista mistura lojas. Preço embaixo
 * da foto, não por cima — foi o que o Murilo aprovou.
 *
 * Props já formatadas (a tela usa `services/shopFormat.js`):
 *   photo        url da capa (ou null)
 *   photoCount   total de fotos (mostra "1/N" se > 1)
 *   tag          "Usado" | "Novo" | "Vendido" (texto pronto)
 *   title, price (texto pronto: "R$ 3.450", "a partir de R$ 450", "A combinar")
 *   fitsCar      nome curto do carro quando serve ("Civic"); vazio = sem selo
 *   seller       "@garagem47" ou vazio
 *   href/onClick um dos dois; sem nenhum vira <div> (prévia)
 *   placeholder  true na prévia: título/preço vazios viram barras cinza
 *   sold         esmaece a foto
 */
export function ProductCard({
  photo,
  photoCount = 0,
  tag,
  title,
  price,
  fitsCar,
  seller,
  onClick,
  href,
  placeholder = false,
  sold = false,
  as: LinkComponent,
  linkProps = {},
}) {
  const { t } = useTranslation();
  const body = (
    <>
      <div className="relative aspect-square overflow-hidden rounded-[14px] bg-[var(--engine-surface-2)]">
        {photo ? (
          <img
            src={photo}
            alt=""
            loading="lazy"
            className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] ${sold ? "opacity-50 grayscale" : ""}`}
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[var(--engine-text-muted)]">
            <Camera size={22} aria-label={t("shop.card.noPhoto")} />
          </span>
        )}
        {tag && <PhotoTag>{tag}</PhotoTag>}
        {photoCount > 1 && <PhotoTag side="right">{t("shop.card.photoCount", { current: 1, total: photoCount })}</PhotoTag>}
      </div>
      {title ? (
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--engine-text)]">{title}</span>
      ) : (
        placeholder && <span className="block h-3 w-4/5 rounded-md bg-[var(--engine-surface-2)]" />
      )}
      {price ? (
        <span className="font-display text-[17px] font-bold tracking-[-0.01em] text-[var(--engine-text)]">{price}</span>
      ) : (
        placeholder && <span className="block h-4 w-2/5 rounded-md bg-[var(--engine-surface-2)]" />
      )}
      {fitsCar && (
        <span className="flex items-center gap-1 text-xs font-bold text-[var(--engine-text)]">
          <Check size={14} aria-hidden="true" />
          {t("shop.card.fitsYour", { car: fitsCar })}
        </span>
      )}
      {seller && <span className="text-xs font-semibold text-[var(--engine-text-muted)]">{seller}</span>}
    </>
  );
  const className = "group flex min-w-0 flex-col gap-2 text-left";
  if (href && LinkComponent) {
    return (
      <LinkComponent to={href} className={className} {...linkProps}>
        {body}
      </LinkComponent>
    );
  }
  if (href) {
    return (
      <a href={href} className={className} {...linkProps}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

/** Grade da vitrine: 2 colunas no celular, 3 no tablet, 4 no desktop. */
export function ProductGrid({ children }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-3 xl:grid-cols-4 xl:gap-x-4 xl:gap-y-6">{children}</div>;
}

/** Estado vazio da vitrine, com uma saída quando há filtro. */
export function ShopEmpty({ title, body, actionLabel, onAction, children }) {
  return (
    <div className="engine-card px-5 py-7 text-center">
      <b className="block text-[15px] text-[var(--engine-text)]">{title}</b>
      {body && <p className="mt-1.5 text-sm text-[var(--engine-text-muted)]">{body}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3.5 inline-flex min-h-11 items-center rounded-[14px] border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] px-4 text-sm font-bold text-[var(--engine-text)]"
        >
          {actionLabel}
        </button>
      )}
      {children}
    </div>
  );
}
