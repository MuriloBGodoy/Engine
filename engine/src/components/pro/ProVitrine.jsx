import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getServiceCategoryLabel } from "../../services/serviceListingDisplay";
import { serviceListingPath } from "../../services/serviceListingPublic";
import { fittingCar, productFromRow, productPath } from "../../services/shops";
import { ProductCard } from "../shops/ProductCard";
import { ProductGrid, ShopEmpty } from "../shop/ProductCard";
import { ProPageBody, ProPageTabs } from "../shop/ProPageHeader";
import { ServiceRow } from "../shop/ShopBrowse";
import { Chip, ChipRow } from "../shop/ShopPrimitives";
import "../../services/i18n-shop";

/**
 * Vitrine do perfil: abas Produtos | Serviços (protótipo aprovado em
 * 01/11/2026), com o "Serve no meu carro" nos produtos. `rows` são linhas
 * cruas de `service_listings` (a RLS já entregou só o que esta pessoa vê:
 * aprovados para todos, e os pendentes para a equipe). Para a equipe, o que
 * não está no ar leva o status embaixo do cartão.
 */
export function ProVitrine({ rows = [], cars = [], showStatus = false, handle = "" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const items = useMemo(
    () =>
      rows
        .filter((row) => row.data?.active !== false)
        .map((row) => (row.kind === "product" ? { kind: "product", product: productFromRow(row), row } : { kind: "service", row })),
    [rows],
  );
  const products = items.filter((item) => item.kind === "product");
  const services = items.filter((item) => item.kind === "service");
  const [picked, setPicked] = useState(null);
  const [fitOnly, setFitOnly] = useState(false);
  const tab = picked || (products.length || !services.length ? "products" : "services");
  const carName = cars.length === 1 ? String(cars[0].model || cars[0].brand || "").split(/\s+/)[0] : "";
  const shownProducts = fitOnly ? products.filter((item) => fittingCar(item.product, cars)) : products;

  const status = (row) =>
    showStatus && row.moderation_status !== "approved" ? (
      <p className="text-xs font-bold text-[var(--engine-text-muted)]">
        {t(`services.status.${row.moderation_status === "changes_requested" ? "changesRequested" : row.moderation_status}`, {
          defaultValue: row.moderation_status,
        })}
      </p>
    ) : null;

  return (
    <>
      <ProPageTabs
        active={tab}
        onChange={setPicked}
        stickyTop="top-14"
        tabs={[
          { id: "products", label: t("shop.profile.tabs.products"), count: products.length },
          { id: "services", label: t("shop.profile.tabs.services"), count: services.length },
        ]}
      />
      <ProPageBody>
        {tab === "products" && (
          <>
            {cars.length > 0 && products.length > 0 && (
              <ChipRow className="mb-4">
                <Chip selected={fitOnly} onClick={() => setFitOnly((value) => !value)}>
                  {carName ? t("shop.profile.fitsMine", { car: carName }) : t("shops.onlyMyCar")}
                </Chip>
              </ChipRow>
            )}
            {shownProducts.length ? (
              <ProductGrid>
                {shownProducts.map((item) => (
                  <ProductCard
                    key={item.row.id}
                    product={item.product}
                    fitsCar={fittingCar(item.product, cars)}
                    seller={false}
                    onOpen={() => navigate(productPath(item.product))}
                    footer={status(item.row)}
                  />
                ))}
              </ProductGrid>
            ) : fitOnly ? (
              <ShopEmpty
                title={t("shop.profile.emptyFit", { car: carName || t("shops.onlyMyCar") })}
                body={t("shop.profile.emptyFitBody")}
                actionLabel={t("shop.profile.clearFilter")}
                onAction={() => setFitOnly(false)}
              />
            ) : (
              <ShopEmpty title={t("shop.profile.emptyProducts")} body={handle ? t("shop.profile.emptyProductsBody", { handle }) : ""} />
            )}
          </>
        )}
        {tab === "services" &&
          (services.length ? (
            <div className="grid gap-2.5 lg:grid-cols-2">
              {services.map(({ row }) => {
                const data = row.data || {};
                return (
                  <div key={row.id}>
                    <ServiceRow
                      photo={data.photos?.[0]}
                      title={data.title}
                      meta={getServiceCategoryLabel(data.category, t)}
                      price={data.price ? `${data.priceFrom ? `${t("pro.priceFrom")} ` : ""}${data.price}` : ""}
                      onClick={() => navigate(serviceListingPath({ slug: row.slug, id: row.id }))}
                    />
                    {status(row)}
                  </div>
                );
              })}
            </div>
          ) : (
            <ShopEmpty title={t("shop.profile.emptyServices")} />
          ))}
      </ProPageBody>
    </>
  );
}
