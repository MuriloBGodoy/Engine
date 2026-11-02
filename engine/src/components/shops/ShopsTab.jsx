import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CarFront, Package, Plus, Search } from "lucide-react";
import { engineDB } from "../../services/db";
import {
  PRODUCT_CATEGORIES,
  fittingCar,
  fitLabel,
  productCategoryLabel,
  productPath,
  subscribeProducts,
} from "../../services/shops";
import { ChoiceChips } from "../pro/ProUi";
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

  return (
    <div className="space-y-4">
      <div className="engine-card space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3">
            <Search size={16} className="shrink-0 text-[var(--engine-text-subtle)]" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("shops.searchPlaceholder")}
              aria-label={t("shops.searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--engine-text)] outline-none"
            />
          </label>
          <button
            type="button"
            onClick={onNewProduct}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white transition hover:brightness-95"
          >
            <Plus size={16} aria-hidden="true" />
            {t("shops.sell")}
          </button>
        </div>
        <div className="engine-chip-scroll -mx-1 overflow-x-auto px-1 pb-1">
          <ChoiceChips
            label={t("shops.form.category")}
            value={category}
            onChange={setCategory}
            options={[{ value: "all", label: t("shops.all") }, ...PRODUCT_CATEGORIES.map((id) => ({ value: id, label: productCategoryLabel(id, t) }))]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <ChoiceChips
            label={t("shops.form.condition")}
            value={condition}
            onChange={setCondition}
            options={[
              { value: "all", label: t("shops.anyCondition") },
              { value: "new", label: t("shops.condition.new") },
              { value: "used", label: t("shops.condition.used") },
            ]}
          />
          {cars.length > 0 && (
            <button
              type="button"
              aria-pressed={onlyMyCar}
              onClick={() => setOnlyMyCar((value) => !value)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition ${
                onlyMyCar
                  ? "border-emerald-600 bg-emerald-500/10 text-emerald-600"
                  : "border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-emerald-600"
              }`}
            >
              <CarFront size={14} aria-hidden="true" />
              {t("shops.onlyMyCar")}
            </button>
          )}
          {region?.state && (
            <button
              type="button"
              aria-pressed={onlyRegion}
              onClick={() => setOnlyRegion((value) => !value)}
              className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-xs font-bold transition ${
                onlyRegion
                  ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                  : "border-[var(--engine-border)] text-[var(--engine-text-muted)]"
              }`}
            >
              {t("shops.nearMe", { state: region.state })}
            </button>
          )}
        </div>
      </div>

      {products === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="engine-card aspect-[3/4] animate-pulse" />
          ))}
        </div>
      ) : shown.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              fitsCar={fittingCar(product, cars)}
              onOpen={() => {
                engineDB.trackServiceListingMetric(product.id, "detail", "search");
                navigate(productPath(product));
              }}
            />
          ))}
        </div>
      ) : (
        <div className="engine-card flex flex-col items-center gap-3 p-8 text-center">
          <Package size={28} className="text-[var(--engine-text-subtle)]" aria-hidden="true" />
          <p className="text-sm font-bold text-[var(--engine-text)]">{t(products.length ? "shops.emptyFiltered" : "shops.empty")}</p>
          <p className="max-w-sm text-xs font-medium leading-5 text-[var(--engine-text-muted)]">{t("shops.emptyHint")}</p>
        </div>
      )}
    </div>
  );
}
