import { useTranslation } from "react-i18next";
import { formatProductPrice } from "../../services/shops";
import { ProductCard as ShopCard } from "../shop/ProductCard";

/**
 * Cartão do produto na vitrine (Lojas, página do perfil) e na prévia ao vivo
 * do formulário. Primeira foto = capa. `fitsCar` = o carro da garagem do
 * visitante em que a peça serve ("Serve no seu Golf").
 *
 * O desenho é o `components/shop/ProductCard` (protótipo aprovado em
 * 01/11/2026): preço embaixo da foto, condição e "1/N" sobre a foto.
 */
export function ProductCard({ product, fitsCar = null, onOpen = null, footer = null, preview = false, seller = null }) {
  const { t, i18n } = useTranslation();
  const sold = product.saleStatus === "sold";
  const hasPrice = !product.priceNegotiable && product.priceAmount != null && product.priceAmount !== "";
  const card = (
    <ShopCard
      placeholder={preview}
      photo={product.photos?.[0] || ""}
      photoCount={product.photos?.length || 0}
      tag={sold ? t("shop.card.sold") : t(`shops.condition.${product.condition}`)}
      title={product.title}
      price={preview && !hasPrice && !product.priceNegotiable ? "" : formatProductPrice(product, t, i18n.language)}
      fitsCar={fitsCar ? String(fitsCar.model || fitsCar.brand || "").split(/\s+/)[0] : ""}
      seller={seller === false ? "" : seller || [product.providerName, product.city].filter(Boolean).join(" · ")}
      sold={sold}
      onClick={onOpen ? () => onOpen(product) : undefined}
    />
  );
  if (!footer) return card;
  return (
    <div className="flex flex-col gap-1">
      {card}
      {footer}
    </div>
  );
}
