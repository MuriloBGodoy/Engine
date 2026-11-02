import { useTranslation } from "react-i18next";
import { TextField, Toggle } from "../ProUi";

/**
 * Passo 2 — como falam com você. WhatsApp é o que vai no botão verde dos
 * anúncios; "esconder contato" é o "não mostrar contato" do Instagram: só
 * sobra o chat do Engine.
 */
export function ProStepContact({ value, onChange }) {
  const { t } = useTranslation();
  const data = value.data || {};
  const setData = (key, next) => onChange({ ...value, data: { ...data, [key]: next } });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
        <TextField
          id="pro-wa-country"
          label={t("pro.fields.countryCode")}
          value={data.whatsappCountry}
          onChange={(next) => setData("whatsappCountry", next.replace(/[^\d+]/g, "").slice(0, 6))}
          maxLength={6}
          inputMode="tel"
        />
        <TextField
          id="pro-wa"
          label={t("pro.fields.whatsapp")}
          value={data.whatsapp}
          onChange={(next) => setData("whatsapp", next.replace(/[^\d\s()+-]/g, ""))}
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
