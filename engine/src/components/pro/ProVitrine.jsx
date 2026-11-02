import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Store } from "lucide-react";
import { getServiceCategoryLabel } from "../../services/serviceListingDisplay";
import { serviceListingPath } from "../../services/serviceListingPublic";
import { fittingCar, productFromRow, productPath } from "../../services/shops";
import { ChoiceChips } from "./ProUi";
import { ProductCard } from "../shops/ProductCard";

/**
 * Vitrine do perfil: grade dos serviços e produtos dele. `rows` são linhas
 * cruas de `service_listings` (a RLS já entregou só o que esta pessoa vê:
 * aprovados para todos, e os pendentes para a equipe). Para a equipe, o que
 * não está no ar leva o selo do status.
 */
export function ProVitrine({ rows = [], cars = [], showStatus = false }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("all");
  const items = useMemo(
    () =>
      rows
        .filter((row) => row.data?.active !== false)
        .map((row) => (row.kind === "product" ? { kind: "product", product: productFromRow(row), row } : { kind: "service", row })),
    [rows],
  );
  const services = items.filter((item) => item.kind === "service").length;
  const products = items.length - services;
  const shown = items.filter((item) => tab === "all" || item.kind === tab);

  if (!items.length) {
    return (
      <div className="engine-card flex flex-col items-center gap-2 p-8 text-center">
        <Store size={26} className="text-[var(--engine-text-subtle)]" aria-hidden="true" />
        <p className="text-sm font-bold text-[var(--engine-text)]">{t("pro.vitrine.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {services > 0 && products > 0 && (
        <ChoiceChips
          label={t("pro.vitrine.title")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: t("pro.vitrine.all", { count: items.length }) },
            { value: "service", label: t("pro.vitrine.services", { count: services }) },
            { value: "product", label: t("pro.vitrine.products", { count: products }) },
          ]}
        />
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((item) => {
          const status = item.row.moderation_status;
          const badge = showStatus && status !== "approved" && (
            <p className="px-3 pb-3 text-[10px] font-black uppercase tracking-wider text-amber-600">
              {t(`services.status.${status === "changes_requested" ? "changesRequested" : status}`, { defaultValue: status })}
            </p>
          );
          if (item.kind === "product") {
            return (
              <Link key={item.row.id} to={productPath(item.product)} className="block">
                <ProductCard product={item.product} fitsCar={fittingCar(item.product, cars)} footer={badge} />
              </Link>
            );
          }
          const data = item.row.data || {};
          return (
            <Link key={item.row.id} to={serviceListingPath({ slug: item.row.slug, id: item.row.id })} className="engine-card flex flex-col overflow-hidden">
              <div className="aspect-square w-full bg-[var(--engine-surface-2)]">
                {data.photos?.[0] ? (
                  <img src={data.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[var(--engine-text-subtle)]">
                    <Store size={30} aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-[var(--engine-accent)]">
                  {t("pro.vitrine.serviceTag")} · {getServiceCategoryLabel(data.category, t)}
                </p>
                <p className="line-clamp-2 text-sm font-bold leading-5 text-[var(--engine-text)]">{data.title}</p>
                {data.price && (
                  <p className="text-sm font-extrabold text-[var(--engine-text)]">
                    {data.priceFrom ? `${t("pro.priceFrom")} ` : ""}
                    {data.price}
                  </p>
                )}
              </div>
              {badge}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
