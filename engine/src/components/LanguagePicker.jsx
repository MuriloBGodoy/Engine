import { useState } from "react";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { languageOptions } from "../services/languages";
import { chooseLanguage, explicitLanguage } from "../services/languageChoice";

/**
 * Seletor de idioma para quem não tem conta (rodapé). Configurações fica
 * atrás de login, e até 25/10/2026 o visitante não tinha como trocar.
 * "Idioma do navegador" volta a seguir a detecção automática.
 */
export function LanguagePicker({ className = "" }) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState(explicitLanguage);

  const handleChange = async (event) => {
    const value = event.target.value;
    setChoice(value);
    await chooseLanguage(value);
  };

  return (
    <label className={`relative inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-[var(--engine-text-muted)] lg:min-h-0 ${className}`}>
      <Globe size={16} aria-hidden="true" className="shrink-0" />
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={choice}
        onChange={handleChange}
        className="max-w-[13rem] cursor-pointer truncate rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] py-2 pl-3 pr-8 text-base font-semibold text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)] sm:text-[13px]"
      >
        <option value="">{t("language.auto")}</option>
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
