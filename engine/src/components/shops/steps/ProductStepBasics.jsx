import { useTranslation } from "react-i18next";
import { PRODUCT_CATEGORIES, PRODUCT_CONDITIONS, productCategoryLabel } from "../../../services/shops";
import { ChoiceChips, FieldLabel, TextAreaField, TextField } from "../../pro/ProUi";

/** Passo 2 — o que é: título, categoria, condição e descrição. */
export function ProductStepBasics({ value, onChange }) {
  const { t } = useTranslation();
  const set = (key, next) => onChange({ ...value, [key]: next });
  return (
    <div className="space-y-4">
      <TextField
        id="product-title"
        label={t("shops.form.title")}
        value={value.title}
        onChange={(next) => set("title", next)}
        maxLength={90}
        placeholder={t("shops.form.titlePlaceholder")}
      />
      <FieldLabel label={t("shops.form.category")}>
        <ChoiceChips
          label={t("shops.form.category")}
          value={value.category}
          onChange={(next) => set("category", next)}
          options={PRODUCT_CATEGORIES.map((id) => ({ value: id, label: productCategoryLabel(id, t) }))}
        />
      </FieldLabel>
      <FieldLabel label={t("shops.form.condition")}>
        <ChoiceChips
          label={t("shops.form.condition")}
          value={value.condition}
          onChange={(next) => set("condition", next)}
          options={PRODUCT_CONDITIONS.map((id) => ({ value: id, label: t(`shops.condition.${id}`) }))}
        />
      </FieldLabel>
      <TextAreaField
        id="product-description"
        label={t("shops.form.description")}
        value={value.description}
        onChange={(next) => set("description", next)}
        maxLength={1500}
        rows={5}
        optional
        placeholder={t("shops.form.descriptionPlaceholder")}
      />
    </div>
  );
}
