import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Search, SlidersHorizontal } from "lucide-react";
import { listShowcase, showcaseBrands } from "../../services/carShowcase";
import { STAGES } from "../../services/carSpecSheet";
import "../../services/i18n-cars";

/** As modificações que esse público procura primeiro. O resto fica na ficha. */
const MOD_FILTERS = ["turbo", "suspension", "wheels", "exhaust", "sound"];

/**
 * "Encontrar carros": o acervo dos carros do Engine, com filtro.
 *
 * O feed é momento; isto é catálogo. São mentalidades diferentes e por isso
 * são abas diferentes — misturar as duas é o que deixa rede social confusa.
 */
export function CarsTab({ region }) {
  const { t } = useTranslation();
  const [cars, setCars] = useState(null);
  const [brands, setBrands] = useState([]);
  const [term, setTerm] = useState("");
  const [brand, setBrand] = useState("");
  const [stage, setStage] = useState("");
  const [mods, setMods] = useState([]);
  const [nearMe, setNearMe] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const state = region?.state && region.state !== "all" ? region.state : "";
  const activeFilters =
    (brand ? 1 : 0) + (stage ? 1 : 0) + mods.length + (nearMe && state ? 1 : 0);

  useEffect(() => {
    showcaseBrands()
      .then(setBrands)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      listShowcase({ term, brand, stage, mods, state: nearMe ? state : "" })
        .then((list) => {
          if (alive) setCars(list);
        })
        .catch(() => {
          if (alive) setCars([]);
        });
    }, term ? 300 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term, brand, stage, mods, nearMe, state]);

  const toggleMod = (id) =>
    setMods((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const chip = (selected) =>
    `min-h-9 shrink-0 rounded-full px-3 text-[12.5px] font-bold transition-colors ${
      selected
        ? "bg-[var(--engine-accent)] text-white"
        : "bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]"
    }`;

  const empty = useMemo(() => cars !== null && cars.length === 0, [cars]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3">
          <Search size={17} className="shrink-0 text-[var(--engine-text-muted)]" aria-hidden="true" />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t("cars.searchPlaceholder")}
            aria-label={t("cars.searchPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-[var(--engine-text)] outline-none placeholder:font-medium placeholder:text-[var(--engine-text-muted)]"
          />
        </label>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-3 text-[13px] font-bold text-[var(--engine-text)] lg:hidden"
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {activeFilters > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--engine-accent)] px-1.5 text-[11px] font-black text-white">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      <div className={`space-y-2 ${filtersOpen ? "" : "hidden lg:block"}`}>
        <div className="engine-scroll-x flex gap-1.5 overflow-x-auto pb-1">
          <button type="button" onClick={() => setBrand("")} className={chip(!brand)}>
            {t("cars.allBrands")}
          </button>
          {brands.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setBrand(brand === item ? "" : item)}
              className={chip(brand === item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="engine-scroll-x flex gap-1.5 overflow-x-auto pb-1">
          {STAGES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStage(stage === item ? "" : item)}
              className={chip(stage === item)}
            >
              {t(`cars.stage.${item}`)}
            </button>
          ))}
          {MOD_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => toggleMod(item)}
              className={chip(mods.includes(item))}
            >
              {t(`cars.mods.${item}`)}
            </button>
          ))}
          {state && (
            <button
              type="button"
              onClick={() => setNearMe((value) => !value)}
              className={chip(nearMe)}
            >
              {t("cars.nearMe", { state })}
            </button>
          )}
        </div>
      </div>

      {cars === null && (
        <p className="py-8 text-center text-sm font-medium text-[var(--engine-text-muted)]">
          {t("cars.loading")}
        </p>
      )}

      {empty && (
        <div className="rounded-2xl border border-dashed border-[var(--engine-border)] p-8 text-center">
          <p className="text-sm font-bold text-[var(--engine-text)]">{t("cars.emptyTitle")}</p>
          <p className="mt-1 text-[13px] text-[var(--engine-text-muted)]">{t("cars.emptyHint")}</p>
        </div>
      )}

      {cars !== null && cars.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {cars.map((car) => (
            <Link
              key={car.id}
              to={`/carro/${car.slug}`}
              className="group overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)]"
            >
              <span className="block aspect-[4/5] overflow-hidden bg-[var(--engine-surface-2)]">
                {car.image ? (
                  <img
                    src={car.image}
                    alt={car.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                ) : null}
              </span>
              <span className="block p-2.5">
                <span className="block truncate text-[13px] font-extrabold text-[var(--engine-text)]">
                  {car.title}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--engine-text-muted)]">
                  <span className="truncate">
                    {[car.year, car.city].filter(Boolean).join(" · ")}
                  </span>
                  {car.likeCount > 0 && (
                    <span className="ml-auto flex shrink-0 items-center gap-0.5">
                      <Heart size={12} /> {car.likeCount}
                    </span>
                  )}
                </span>
                {car.stage && car.stage !== "stock" && (
                  <span className="mt-1.5 inline-block rounded-full bg-[var(--engine-surface-2)] px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide text-[var(--engine-accent-text)]">
                    {t(`cars.stage.${car.stage}`)}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
