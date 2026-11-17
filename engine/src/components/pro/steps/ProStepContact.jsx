import { useTranslation } from "react-i18next";
import { countries } from "../../../services/locations";
import { maskPhone } from "../../../services/masks";
import { SelectField, TextField, Toggle } from "../ProUi";

// Os mesmos códigos de país do resto do app, em ordem alfabética de país.
const DDIs = [...countries].sort((a, b) => a.name.localeCompare(b.name));

/**
 * Passo 2 — como falam com você. WhatsApp é o que vai no botão verde dos
 * anúncios; "esconder contato" é o "não mostrar contato" do Instagram: só
 * sobra o chat do Engine.
 *
 * Até 14/11/2026 este era o ÚNICO telefone do app sem máscara: o campo
 * aceitava "16997996509", "16 99799 6509" ou "(16)997996509", e o WhatsApp da
 * oficina ficava gravado do jeito que a pessoa digitou. O código do país era
 * uma caixa de texto livre, enquanto em todas as outras telas é um seletor.
 */
export function ProStepContact({ value, onChange }) {
  const { t } = useTranslation();
  const data = value.data || {};
  const setData = (key, next) => onChange({ ...value, data: { ...data, [key]: next } });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
        <SelectField
          id="pro-wa-country"
          label={t("pro.fields.countryCode")}
          value={data.whatsappCountry || "+55"}
          onChange={(next) => setData("whatsappCountry", next)}
          options={DDIs.map((pais) => ({ value: pais.dial, label: `${pais.code} ${pais.dial}` }))}
        />
        <TextField
          id="pro-wa"
          label={t("pro.fields.whatsapp")}
          value={maskPhone(data.whatsappCountry || "+55", data.whatsapp)}
          onChange={(next) => setData("whatsapp", maskPhone(data.whatsappCountry || "+55", next))}
          maxLength={24}
          inputMode="tel"
          placeholder="(16) 99999-0000"
        />
      </div>
      <TextField id="pro-email" label={t("pro.fields.email")} value={data.email} onChange={(next) => setData("email", next)} type="email" optional maxLength={120} />
      <TextField id="pro-instagram" label="Instagram" value={data.instagram} onChange={(next) => setData("instagram", next.replace(/^@/, ""))} optional maxLength={40} placeholder="@" />
      <TextField
        id="pro-site"
        label={t("pro.fields.website")}
        value={data.website}
        onChange={(next) => setData("website", next)}
        optional
        maxLength={160}
        placeholder="https://"
        hint={t("pro.hints.website")}
      />
      <Toggle
        id="pro-hide-contact"
        label={t("pro.fields.hideContact")}
        hint={t("pro.hints.hideContact")}
        checked={data.hideContact}
        onChange={(next) => setData("hideContact", next)}
      />
    </div>
  );
}
