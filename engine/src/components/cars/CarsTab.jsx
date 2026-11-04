import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Search, X } from "lucide-react";
import { listShowcase, showcaseBrands } from "../../services/carShowcase";
import "../../services/i18n-cars";

/**
 * Atalhos de busca: o que esse público procura primeiro.
 *
 * Não são filtros — cada um escreve a palavra no campo. O banco entende o
 * que ela significa (um carro marcado como Stage 1 responde a "stage 1" sem
 * o dono ter escrito isso em lugar nenhum), então o atalho e a digitação
 * levam ao mesmo lugar. É o que impede a tela de ter dois mecanismos
 * fazendo a mesma coisa.
 */
const SUGGESTIONS = ["stage1", "turbo", "suspension", "wheels", "sound"];

/**
 * "Encontrar carros": o acervo dos carros do Engine.
 *
 * O feed é momento; isto é catálogo. São mentalidades diferentes e por isso
 * são abas diferentes — misturar as duas é o que deixa rede social confusa.
 *
 * Nasceu com duas tiras de etiquetas (stage e modificação) que num celular
 * rolavam para fora da tela: quem queria "stage 1" tinha que descobrir que
 * existia uma etiqueta com esse nome e alcançá-la rolando. Viraram busca em
 * 04/11/2026. A marca — lista curta e fechada — é a única etiqueta que
 * sobrou, e só aparece quando há mais de uma.
 */
export function CarsTab({ region }) {
  const { t } = useTranslation();
  const [cars, setCars] = useState(null);
  const [brands, setBrands] = useState([]);
  const [term, setTerm] = useState("");
  const [brand, setBrand] = useState("");
  const [nearMe, setNearMe] = useState(false);

  const state = region?.state && region.state !== "all" ? region.state : "";

  useEffect(() => {
    showcaseBrands()
      .then(setBrands)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () => {
        listShowcase({ term, brand, state: nearMe ? state : "" })
          .then((list) => {
            if (alive) setCars(list);
          })
          .catch(() => {
            if (alive) setCars([]);
          });
      },
      term ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term, brand, nearMe, state]);

  /** O atalho acrescenta a palavra à busca; tocar de novo tira. */
  const toggleWord = (word) => {
    const label = t(`cars.suggestions.${word}`);
    setTerm((current) => {
      const parts = current.split(/\s+/).filter(Boolean);
      const at = parts.findIndex((part) => part.toLowerCase() === label.toLowerCase());
      if (at >= 0) parts.splice(at, 1);
      else parts.push(label);
      return parts.join(" ");
    });
  };

  const inTerm = (word) =>
    term.toLowerCase().includes(t(`cars.suggestions.${word}`).toLowerCase());

  const chip = (selected) =>
    `min-h-9 shrink-0 rounded-full px-3 text-[12.5px] font-bold transition-colors ${
      selected
        ? "bg-[var(--engine-accent)] text-white"
        : "bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]"
    }`;

  const searching = Boolean(term || brand || nearMe);
  const empty = useMemo(() => cars !== null && cars.length === 0, [cars]);

  return (
    <div className="space-y-3">
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3">
        <Search size={17} className="shrink-0 text-[var(--engine-text-muted)]" aria-hidden="true" />
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("cars.searchPlaceholder")}
          aria-label={t("cars.searchPlaceholder")}
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-[var(--engine-text)] outline-none placeholder:font-medium placeholder:text-[var(--engine-text-muted)]"
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm("")}
            aria-label={t("cars.clearSearch")}
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--engine-text-subtle)]"
          >
            <X size={15} />
          </button>
        )}
      </label>

      <p className="text-[12px] font-medium text-[var(--engine-text-muted)]">
        {t("cars.searchHint")}
      </p>

      <div className="engine-scroll-x flex gap-1.5 overflow-x-auto pb-1">
        {SUGGESTIONS.map((word) => (
          <button
            key={word}
            type="button"
            onClick={() => toggleWord(word)}
            className={chip(inTerm(word))}
          >
            {t(`cars.suggestions.${word}`)}
          </button>
        ))}
        {state && (
          <button type="button" onClick={() => setNearMe((value) => !value)} className={chip(nearMe)}>
            {t("cars.nearMe", { state })}
          </button>
        )}
      </div>

      {brands.length > 1 && (
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
      )}

      {cars === null && (
        <p className="py-8 text-center text-sm font-medium text-[var(--engine-text-muted)]">
          {t("cars.loading")}
        </p>
      )}

      {empty && (
        <div className="rounded-2xl border border-dashed border-[var(--engine-border)] p-8 text-center">
          <p className="text-sm font-bold text-[var(--engine-text)]">
            {searching ? t("cars.noMatchTitle") : t("cars.emptyTitle")}
          </p>
          <p className="mt-1 text-[13px] text-[var(--engine-text-muted)]">
            {searching ? t("cars.noMatchHint") : t("cars.emptyHint")}
          </p>
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
