import { useTranslation } from "react-i18next";
import { ChoiceChips, FieldLabel, TextField, Toggle } from "../../pro/ProUi";

/**
 * Passo 3 — preço e status. Preço em número (a tela formata na moeda), ou
 * "a combinar". "Aceito proposta" vai como selo. Disponível/vendido é campo
 * leve: muda sem tirar o anúncio do ar.
 */
export function ProductStepPrice({ value, onChange }) {
  const { t } = useTranslation();
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <Toggle
        id="product-negotiable"
        label={t("shops.price.negotiable")}
        hint={t("shops.form.negotiableHint")}
        checked={value.priceNegotiable}
        onChange={(next) => set({ priceNegotiable: next })}
      />
      {!value.priceNegotiable && (
        <TextField
          id="product-price"
          label={t("shops.form.price", { currency: value.currency || "BRL" })}
          value={value.priceAmount ?? ""}
          onChange={(next) => set({ priceAmount: next.replace(/[^\d.,]/g, "").replace(",", ".") })}
          inputMode="decimal"
          maxLength={12}
          placeholder="1500"
        />
      )}
      <Toggle
        id="product-offers"
        label={t("shops.form.acceptsOffers")}
        hint={t("shops.form.acceptsOffersHint")}
        checked={value.acceptsOffers}
        onChange={(next) => set({ acceptsOffers: next })}
      />
      <FieldLabel label={t("shops.form.status")}>
        <ChoiceChips
          label={t("shops.form.status")}
          value={value.saleStatus}
          onChange={(next) => set({ saleStatus: next })}
          options={[
            { value: "available", label: t("shops.status.available") },
            { value: "sold", label: t("shops.status.sold") },
          ]}
        />
      </FieldLabel>
    </div>
  );
}
