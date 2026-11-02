import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CarFront, Plus, Search } from "lucide-react";
import { engineDB } from "../../services/db";
import {
  PRODUCT_CATEGORIES,
  fittingCar,
  fitLabel,
  productCategoryLabel,
  productPath,
  subscribeProducts,
} from "../../services/shops";
import { Chip, ChipRow, SwitchKnob } from "../shop/ShopPrimitives";
import { ProductGrid, ShopEmpty } from "../shop/ProductCard";
import "../../services/i18n-shop";
import { ProductCard } from "./ProductCard";

const fold = (text = "") =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Aba "Lojas" de Serviços: a vitrine de produtos aprovados. Filtro por texto,
 * categoria, condição e "o que serve no meu carro" (cruza o "serve em" do
 * produto com os carros da garagem de quem olha — mesmo catálogo FIPE).
 */
export function ShopsTab({ user, region, onNewProduct }) {
  const { t } = useTranslation();
  const regionState = region?.state || "";
  const navigate = useNavigate();
  const [products, setProducts] = useState(null);
  const [cars, setCars] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [condition, setCondition] = useState("all");
  const [onlyMyCar, setOnlyMyCar] = useState(false);
  const [onlyRegion, setOnlyRegion] = useState(true);

  useEffect(() => subscribeProducts((list) => setProducts(list)), []);
  useEffect(() => {
    if (!user?.uid) return undefined;
    let alive = true;
    engineDB
      .getCars()
      .then((list) => alive && setCars(Array.isArray(list) ? list : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.uid]);

  const shown = useMemo(() => {
    const clean = fold(query.trim());
    const list = (products || []).filter((product) => {
      if (category !== "all" && product.category !== category) return false;
      if (condition !== "all" && product.condition !== condition) return false;
      if (onlyMyCar && !fittingCar(product, cars)) return false;
      if (!clean) return true;
      return fold([product.title, product.description, product.providerName, product.city, ...product.fits.map(fitLabel)].join(" ")).includes(clean);
    });
    // Região: mostra o estado da pessoa primeiro; nunca esconde tudo.
    if (!onlyRegion || !regionState) return list;
    const local = list.filter((product) => !product.state || product.state === regionState);
    return local.length ? local : list;
  }, [products, query, category, condition, onlyMyCar, cars, onlyRegion, regionState]);

  const carName = cars.length === 1 ? [cars[0].model || cars[0].brand, cars[0].year].filter(Boolean).join(" ") : "";
  const sellerOf = (product) => [product.providerName, product.city].filter(Boolean).join(" · ");

  return (
    <div className="space-y-1">
      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="engine-field flex min-h-[52px] items-center gap-2 rounded-[14px] lg:flex-1 border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5">
          <Search size={18} className="shrink-0 text-[var(--engine-text-muted)]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("shop.browse.searchShops")}
            aria-label={t("shops.searchPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-base font-semibold text-[var(--engine-text)] outline-none placeholder:font-medium placeholder:text-[var(--engine-text-muted)]"
          />
        </label>
        {cars.length > 0 && (
          <button
            type="button"
            role="switch"
            aria-checked={onlyMyCar}
            onClick={() => setOnlyMyCar((value) => !value)}
            className="flex items-center gap-2.5 rounded-[14px] border border-[var(--engine-border)] bg-[var(--engine-surface)] px-3 py-2.5 text-left lg:w-[340px]"
          >
            <CarFront size={20} aria-hidden="true" className="shrink-0 text-[var(--engine-text)]" />
            <span className="min-w-0 flex-1">
              {carName ? (
                <>
                  <small className="block text-xs font-semibold text-[var(--engine-text-muted)]">{t("shop.browse.fitsLabel")}</small>
                  <b className="block truncate text-sm text-[var(--engine-text)]">{carName}</b>
                </>
              ) : (
                <b className="block truncate text-sm text-[var(--engine-text)]">{t("shops.onlyMyCar")}</b>
              )}
            </span>
            <SwitchKnob on={onlyMyCar} />
          </button>
        )}
        <button
          type="button"
          onClick={onNewProduct}
          className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[14px] bg-[var(--engine-accent)] px-4 text-[15px] font-bold text-white"
        >
          <Plus size={18} aria-hidden="true" />
          {t("shop.browse.advertise")}
        </button>
      </div>

      <ChipRow className="pt-2" label={t("shop.browse.categories")}>
        {[{ value: "all", label: t("shop.browse.all") }, ...PRODUCT_CATEGORIES.map((id) => ({ value: id, label: productCategoryLabel(id, t) }))].map((option) => (
          <Chip key={option.value} selected={category === option.value} onClick={() => setCategory(option.value)}>
            {option.label}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow>
        {[
          { value: "all", label: t("shops.anyCondition") },
          { value: "new", label: t("shops.condition.new") },
          { value: "used", label: t("shops.condition.used") },
        ].map((option) => (
          <Chip key={option.value} selected={condition === option.value} onClick={() => setCondition(option.value)}>
            {option.label}
          </Chip>
        ))}
        {region?.state && region.state !== "all" && (
          <Chip selected={onlyRegion} onClick={() => setOnlyRegion((value) => !value)}>
            {t("shops.nearMe", { state: region.state })}
          </Chip>
        )}
      </ChipRow>

      <div className="flex items-baseline justify-between gap-3 pb-3 pt-5">
        <h2 className="font-display text-lg font-bold text-[var(--engine-text)]">
          {onlyMyCar && carName ? t("shop.browse.fitsYour", { car: carName.split(" ")[0] }) : t("shop.browse.latest")}
        </h2>
        {products !== null && shown.length > 0 && (
          <span className="text-[13px] font-semibold text-[var(--engine-text-muted)]">{t("shop.browse.count", { count: shown.length })}</span>
        )}
      </div>

      {products === null ? (
        <ProductGrid>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2" aria-hidden="true">
              <div className="aspect-square animate-pulse rounded-[14px] bg-[var(--engine-surface-2)]" />
              <div className="h-3 w-4/5 rounded-md bg-[var(--engine-surface-2)]" />
              <div className="h-4 w-2/5 rounded-md bg-[var(--engine-surface-2)]" />
            </div>
          ))}
        </ProductGrid>
      ) : shown.length ? (
        <ProductGrid>
          {shown.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              fitsCar={fittingCar(product, cars)}
              seller={sellerOf(product)}
              onOpen={() => {
                engineDB.trackServiceListingMetric(product.id, "detail", "search");
                navigate(productPath(product));
              }}
            />
          ))}
        </ProductGrid>
      ) : (
        <ShopEmpty
          title={products.length ? t("shops.emptyFiltered") : t("shop.browse.emptyAll")}
          body={t("shop.browse.emptyBody")}
          actionLabel={category !== "all" ? t("shop.browse.allCategories") : undefined}
          onAction={() => setCategory("all")}
        />
      )}
    </div>
  );
}
