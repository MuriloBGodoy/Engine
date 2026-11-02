import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search, X } from "lucide-react";
import { Chip, FieldBox, SwitchRow, fieldInputClass } from "./ShopPrimitives";
import "../../services/i18n-shop";

/**
 * Passo "Serve em quais carros?": interruptor de universal, busca de modelo
 * e os escolhidos em pílulas. Os modelos vêm do catálogo FIPE da Garagem
 * (quem busca é a tela); aqui `suggestions` e `selected` já chegam como
 * [{ key, label }], e o banco guarda até 5 (`product_clean_data`).
 */
export function FitsPicker({
  universal,
  onUniversal,
  query,
  onQuery,
  suggestions = [],
  selected = [],
  onAdd,
  onRemove,
  max = 5,
  loading = false,
}) {
  const { t } = useTranslation();
  const id = useId();
  const full = selected.length >= max;
  return (
    <>
      <SwitchRow checked={universal} onChange={onUniversal} title={t("shop.fits.universal")} hint={t("shop.fits.universalHint")} />
      {!universal && (
        <div>
          <FieldBox label={t("shop.fits.model")} htmlFor={id} prefix={<Search size={18} aria-hidden="true" />}>
            <input
              id={id}
              value={query}
              onChange={(event) => onQuery?.(event.target.value)}
              placeholder={t("shop.fits.modelPlaceholder")}
              autoComplete="off"
              disabled={full}
              className={fieldInputClass}
            />
          </FieldBox>
          {selected.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {selected.map((item) => (
                <Chip key={item.key} selected onClick={() => onRemove?.(item.key)}>
                  <span>{item.label}</span>
                  <X size={14} aria-label={t("shop.fits.remove", { name: item.label })} />
                </Chip>
              ))}
            </div>
          )}
          {full ? (
            <p className="mt-2 text-[13px] font-semibold text-[var(--engine-text-muted)]">{t("shop.fits.max", { max })}</p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5" aria-live="polite">
              {suggestions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onAdd?.(item)}
                  aria-label={t("shop.fits.add", { name: item.label })}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] border border-[var(--engine-border)] bg-[var(--engine-surface)] px-4 text-left text-sm font-semibold text-[var(--engine-text)] hover:border-[var(--engine-border-strong)]"
                >
                  {item.label}
                  <Plus size={18} aria-hidden="true" />
                </button>
              ))}
              {!loading && query?.trim() && suggestions.length === 0 && (
                <p className="mt-1 text-[13px] text-[var(--engine-text-muted)]">{t("shop.fits.none", { query: query.trim() })}</p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
