import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, Info, MessageCircle, Share2 } from "lucide-react";
import { WhatsAppIcon } from "../services/ListingParts";
import { ProfileLogo } from "./ShopPrimitives";
import "../../services/i18n-shop";

/**
 * Página do produto: foto grande, preço, condição, a caixa "Serve no seu
 * Civic Touring 2019", descrição, quem vende, o aviso de que o Engine não
 * intermedia, e Mensagem/WhatsApp fixos embaixo (no desktop, na coluna).
 *
 *   product { title, price (texto), photos: [url], badges: [texto],
 *             description, fitsLabels: [texto], universal, sold }
 *   fit     true | false | null (null = sem carro na garagem: só a lista)
 *   carName "Civic Touring 2019"
 *   seller  { name, handle, logo, initials, meta }
 *   onBack, onShare, onSeller, onMessage, onWhatsApp (abre a folha de contato)
 *   sellerSlot / messageSlot  trocam o cartão de quem vende e o botão de
 *                             Mensagem pelos da tela (que já sabem buscar o
 *                             perfil e abrir a conversa)
 *   afterNote                 o que vem depois do aviso (ex.: denunciar)
 *   hideContact               a equipe vendo o próprio produto
 */
export function ProductDetail({
  product,
  fit = null,
  carName,
  seller,
  onBack,
  onShare,
  onSeller,
  onMessage,
  onWhatsApp,
  sellerSlot = null,
  messageSlot = null,
  afterNote = null,
  hideContact = false,
}) {
  const { t } = useTranslation();
  const photos = product.photos || [];
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(photos.length - 1, 0));
  const go = (delta) => setIndex((current + delta + photos.length) % photos.length);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-12 lg:py-7">
      <div>
        <div className="relative aspect-square overflow-hidden bg-[var(--engine-surface-2)] lg:rounded-[20px]">
          {photos[current] && (
            <img
              src={photos[current]}
              alt={t("shop.product.photoOf", { n: current + 1, total: photos.length })}
              className={`h-full w-full object-cover ${product.sold ? "opacity-60 grayscale" : ""}`}
            />
          )}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t("shop.profile.back")}
              className="absolute left-2.5 top-[calc(0.625rem+env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white backdrop-blur lg:top-2.5"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
          )}
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              aria-label={t("shop.profile.share")}
              className="absolute right-2.5 top-[calc(0.625rem+env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white backdrop-blur lg:top-2.5"
            >
              <Share2 size={18} aria-hidden="true" />
            </button>
          )}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={t("shop.product.photoOf", { n: ((current - 1 + photos.length) % photos.length) + 1, total: photos.length })}
                className="absolute left-0 top-1/4 h-1/2 w-1/3"
              />
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={t("shop.product.photoOf", { n: ((current + 1) % photos.length) + 1, total: photos.length })}
                className="absolute right-0 top-1/4 grid h-1/2 w-1/3 place-items-center justify-end pr-2 text-white/0 hover:text-white/90"
              >
                <ChevronRight size={28} aria-hidden="true" className="hidden lg:block" />
              </button>
              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden="true">
                {photos.map((photo, i) => (
                  <i key={photo} className={`h-[7px] w-[7px] rounded-full ${i === current ? "bg-white" : "bg-white/50"}`} />
                ))}
              </div>
            </>
          )}
        </div>
        {photos.length > 1 && (
          <div className="mt-2.5 hidden grid-cols-5 gap-2 lg:grid">
            {photos.slice(0, 5).map((photo, i) => (
              <button
                key={photo}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={t("shop.product.photoOf", { n: i + 1, total: photos.length })}
                aria-current={i === current}
                className={`aspect-square overflow-hidden rounded-[10px] bg-[var(--engine-surface-2)] ${
                  i === current ? "outline-2 outline-offset-2 outline-[var(--engine-text)]" : ""
                }`}
              >
                <img src={photo} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 lg:sticky lg:top-6 lg:p-0">
        <p className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-[var(--engine-text)]">{product.price}</p>
        <h1 className="mt-1 font-sans text-lg font-bold leading-snug tracking-normal text-[var(--engine-text)]">{product.title}</h1>
        {product.badges?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {product.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-2.5 py-1 text-xs font-bold text-[var(--engine-text)]"
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {(product.universal || product.fitsLabels?.length > 0) && (
          <div className="mt-4 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3.5">
            {fit === true && carName && (
              <p className="flex items-center gap-2.5 text-sm font-bold text-[var(--engine-text)]">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--engine-text)] text-[var(--engine-bg)]">
                  <Check size={16} aria-hidden="true" />
                </span>
                {t("shop.product.fitsYes", { car: carName })}
              </p>
            )}
            {fit === false && carName && (
              <p className="text-sm font-bold text-[var(--engine-text-muted)]">{t("shop.product.fitsNo", { car: carName })}</p>
            )}
            {fit === null && <p className="text-[13px] font-bold text-[var(--engine-text-muted)]">{t("shop.product.fitsList")}</p>}
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {(product.universal ? [t("shop.product.universal")] : product.fitsLabels).map((label) => (
                <li key={label} className="rounded-lg bg-[var(--engine-surface-2)] px-2.5 py-1 text-[13px] font-semibold text-[var(--engine-text)]">
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {product.description && (
          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-[var(--engine-text)]">{product.description}</p>
        )}

        {sellerSlot && <div className="mt-4">{sellerSlot}</div>}
        {!sellerSlot && seller && (
          <button
            type="button"
            onClick={onSeller}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3 text-left"
          >
            <ProfileLogo src={seller.logo} initials={seller.initials} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm text-[var(--engine-text)]">{seller.name}</b>
              <span className="block truncate text-xs font-semibold text-[var(--engine-text-muted)]">
                @{seller.handle}
                {seller.meta ? ` · ${seller.meta}` : ""}
              </span>
            </span>
            <ChevronRight size={18} aria-hidden="true" className="text-[var(--engine-text-muted)]" />
          </button>
        )}

        <p className="mt-3.5 flex items-start gap-2 text-[13px] text-[var(--engine-text-muted)]">
          <Info size={16} aria-hidden="true" className="mt-px shrink-0" />
          {product.sold ? t("shop.product.soldNote") : t("shop.product.note")}
        </p>

        {afterNote}

        {!product.sold && !hideContact && (
          <div className={`sticky bottom-0 z-10 -mx-4 mt-4 grid ${onWhatsApp ? "grid-cols-2" : "grid-cols-1"} gap-2 border-t border-[var(--engine-border)] bg-[var(--engine-bg)]/90 px-4 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-xl lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none`}>
            {messageSlot || (
              <button
                type="button"
                onClick={onMessage}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-[var(--engine-accent)] px-4 text-[15px] font-bold text-white"
              >
                <MessageCircle size={18} aria-hidden="true" />
                {t("shop.profile.message")}
              </button>
            )}
            {onWhatsApp ? (
              <button
                type="button"
                onClick={onWhatsApp}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] px-4 text-[15px] font-bold text-[var(--engine-text)]"
              >
                <WhatsAppIcon size={18} />
                {t("shop.profile.whatsapp")}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
