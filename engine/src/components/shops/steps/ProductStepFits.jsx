import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { fipeService } from "../../../services/fipeService";
import { PRODUCT_MAX_FITS, fitLabel, modelFamily } from "../../../services/shops";
import { GhostButton, SelectField, TextField } from "../../pro/ProUi";

/**
 * Passo 4 — "serve em" (opcional). Marca e modelo vêm do MESMO catálogo da
 * Garagem (FIPE): o código da marca fica gravado, e o modelo é a família
 * ("Golf", não "Golf Comfortline 1.4 TSI") — é por ela que a Loja casa a peça
 * com o carro de quem está olhando. Faixa de anos opcional.
 */
export function ProductStepFits({ value, onChange }) {
  const { t } = useTranslation();
  const fits = value.fits || [];
  const [brands, setBrands] = useState([]);
  const [brandError, setBrandError] = useState(false);
  const [draft, setDraft] = useState({ brandCode: "", brand: "", model: "", yearFrom: "", yearTo: "" });
  const [models, setModels] = useState({ brandCode: "", list: [] });

  useEffect(() => {
    let alive = true;
    fipeService
      .getBrands()
      .then((list) => alive && setBrands(Array.isArray(list) ? list : []))
      .catch(() => alive && setBrandError(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!draft.brandCode) return undefined;
    let alive = true;
    fipeService
      .getModels(draft.brandCode)
      .then((list) => alive && setModels({ brandCode: draft.brandCode, list: Array.isArray(list) ? list : [] }))
      .catch(() => alive && setModels({ brandCode: draft.brandCode, list: [] }));
    return () => {
      alive = false;
    };
  }, [draft.brandCode]);

  // Versões da FIPE -> famílias ("Golf", "Polo"), sem repetir.
  const families = useMemo(() => {
    if (models.brandCode !== draft.brandCode) return [];
    const seen = new Map();
    for (const model of models.list) {
      const name = String(model.nome || "").trim();
      const key = modelFamily(name);
      if (key && !seen.has(key)) seen.set(key, name.split(/[\s/-]+/)[0]);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [models, draft.brandCode]);

  const add = () => {
    if (!draft.brandCode) return;
    onChange({ ...value, fits: [...fits, { ...draft }].slice(0, PRODUCT_MAX_FITS) });
    setDraft({ brandCode: "", brand: "", model: "", yearFrom: "", yearTo: "" });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium leading-5 text-[var(--engine-text-muted)]">{t("shops.fits.hint")}</p>
      {fits.length > 0 && (
        <ul className="space-y-2">
          {fits.map((fit, index) => (
            <li key={`${fit.brandCode}-${fit.model}-${index}`} className="flex items-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--engine-text)]">
                {fitLabel(fit) || fit.brand}
                {!fit.model && <span className="ml-1 font-medium text-[var(--engine-text-subtle)]">({t("shops.fits.anyModel")})</span>}
              </span>
              <button
                type="button"
                onClick={() => onChange({ ...value, fits: fits.filter((_, i) => i !== index) })}
                aria-label={t("shops.fits.remove")}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--engine-text-muted)] hover:text-red-500"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {fits.length < PRODUCT_MAX_FITS && (
        <div className="space-y-3 rounded-xl border border-[var(--engine-border)] p-3">
          {brandError && <p className="text-xs font-bold text-red-500">{t("shops.fits.catalogError")}</p>}
          <SelectField
            id="fit-brand"
            label={t("shops.fits.brand")}
            value={draft.brandCode}
            onChange={(code) =>
              setDraft({ ...draft, brandCode: code, brand: brands.find((brand) => String(brand.codigo) === code)?.nome || "", model: "" })
            }
            options={[{ value: "", label: "—" }, ...brands.map((brand) => ({ value: String(brand.codigo), label: brand.nome }))]}
          />
          {draft.brandCode && (
            <SelectField
              id="fit-model"
              label={t("shops.fits.model")}
              value={draft.model}
              onChange={(model) => setDraft({ ...draft, model })}
              options={[{ value: "", label: t("shops.fits.anyModel") }, ...families.map((name) => ({ value: name, label: name }))]}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <TextField id="fit-from" label={t("shops.fits.yearFrom")} value={draft.yearFrom} onChange={(next) => setDraft({ ...draft, yearFrom: next.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" optional />
            <TextField id="fit-to" label={t("shops.fits.yearTo")} value={draft.yearTo} onChange={(next) => setDraft({ ...draft, yearTo: next.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" optional />
          </div>
          <GhostButton onClick={add} disabled={!draft.brandCode} className="w-full">
            <Plus size={16} aria-hidden="true" />
            {t("shops.fits.add")}
          </GhostButton>
        </div>
      )}
    </div>
  );
}
