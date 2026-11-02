import { useTranslation } from "react-i18next";
import { countries, getCities, getStates } from "../../../services/locations";
import { SelectField, TextAreaField, TextField } from "../ProUi";

/** Passo 3 — onde e quando: país, estado, cidade, endereço, área e horário. */
export function ProStepPlace({ value, onChange }) {
  const { t } = useTranslation();
  const data = value.data || {};
  const setData = (patch) => onChange({ ...value, data: { ...data, ...patch } });
  const states = getStates(data.country || "BR");
  const cities = getCities(data.country || "BR", data.state);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          id="pro-country"
          label={t("pro.fields.country")}
          value={data.country || "BR"}
          onChange={(next) => setData({ country: next, state: "", city: "" })}
          options={countries.map((country) => ({ value: country.code, label: country.name }))}
        />
        {states.length > 0 && (
          <SelectField
            id="pro-state"
            label={t("pro.fields.state")}
            value={data.state}
            onChange={(next) => setData({ state: next, city: "" })}
            options={[{ value: "", label: "—" }, ...states.map((state) => ({ value: state.code, label: state.name }))]}
          />
        )}
      </div>
      <TextField id="pro-city" label={t("pro.fields.city")} value={data.city} onChange={(next) => setData({ city: next })} maxLength={80} list="pro-city-list" />
      <datalist id="pro-city-list">
        {cities.map((city) => (
          <option key={typeof city === "string" ? city : city.name} value={typeof city === "string" ? city : city.name} />
        ))}
      </datalist>
      <TextField
        id="pro-address"
        label={t("pro.fields.address")}
        value={data.address}
        onChange={(next) => setData({ address: next })}
        optional
        maxLength={160}
        hint={t("pro.hints.address")}
      />
      <TextField
        id="pro-area"
        label={t("pro.fields.serviceArea")}
        value={data.serviceArea}
        onChange={(next) => setData({ serviceArea: next })}
        optional
        maxLength={160}
        placeholder={t("pro.placeholders.serviceArea")}
      />
      <TextAreaField
        id="pro-hours"
        label={t("pro.fields.hours")}
        value={data.hours}
        onChange={(next) => setData({ hours: next })}
        optional
        maxLength={300}
        rows={3}
        placeholder={t("pro.placeholders.hours")}
      />
    </div>
  );
}
