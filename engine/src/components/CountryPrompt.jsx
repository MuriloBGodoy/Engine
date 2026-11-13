import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Globe2, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRegion } from "../hooks/RegionProvider";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { engineDB } from "../services/db";
import { countries } from "../services/locations";
import { captureError } from "../services/observability";
import { markCountryAsked } from "../services/countryPrompt";
import { Select } from "./ui/Select";

/**
 * "Em que país você está?" — perguntado UMA vez por conta (30/10/2026).
 *
 * Por quê: o perfil nasce com `country: "BR"` (defaultSettings em db.js) e o
 * primeiro salvamento de qualquer ajuste grava esse BR. Como o país do perfil
 * vence a região na cobrança (subscription-create e useBillingCountry), quem
 * mora fora ficava com preço e moeda do Brasil sem nunca ter escolhido.
 *
 * - Pré-seleciona o país detectado: a região de navegação, que já é a cascata
 *   escolha salva → geo-IP (/api/geo) → idioma do navegador. Sem região, o
 *   país que estiver no perfil.
 * - Confirmar grava `profile.country`; pular não mexe no país. Os dois gravam
 *   `preferences.countryAskedAt` (vai junto no JSON de `user_private`, sem
 *   migration) e uma marca local, para nunca mais aparecer — nem quando o
 *   salvamento no servidor falha.
 */
function useCountryNames(language) {
  return useMemo(() => {
    let names = null;
    try {
      names = new Intl.DisplayNames([language], { type: "region" });
    } catch {
      names = null;
    }
    return countries
      .map((country) => ({
        ...country,
        label: (names && names.of(country.code)) || country.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, language));
  }, [language]);
}

export function CountryPrompt({ user, settings, onSettingsUpdate, onDone }) {
  const { t, i18n } = useTranslation();
  const { region } = useRegion();
  const options = useCountryNames(i18n.language || "pt-BR");
  const detected = region?.country && region.country !== "all" ? region.country : "";
  // Enquanto a pessoa não mexe, segue o detectado (a geo-IP pode chegar
  // depois da abertura).
  const [picked, setPicked] = useState("");
  const country = picked || detected || settings?.profile?.country || "BR";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const uid = user?.uid;

  const persist = useCallback(
    async (chosen) => {
      // Relê antes de gravar: o documento inteiro vai junto, e uma cópia
      // velha apagaria o que mudou em outra aba.
      const fresh = (await engineDB.getSettings().catch(() => null)) || settings;
      const profile = { ...fresh.profile };
      if (chosen && chosen !== profile.country) {
        profile.country = chosen;
        profile.state = ""; // o estado era do país anterior
      }
      const next = {
        ...fresh,
        profile,
        preferences: { ...fresh.preferences, countryAskedAt: new Date().toISOString() },
      };
      const saved = await engineDB.saveSettings(next, uid);
      onSettingsUpdate(saved);
    },
    [settings, uid, onSettingsUpdate],
  );

  const skip = useCallback(() => {
    markCountryAsked(uid);
    onDone();
    // Pular também fica registrado no servidor (outros aparelhos), em silêncio.
    persist("").catch((caught) => captureError(caught, { action: "countryPromptSkip" }));
  }, [uid, onDone, persist]);

  useHistoryDismiss(true, skip);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !saving) skip();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [skip, saving]);

  const confirm = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await persist(country);
      markCountryAsked(uid);
      onDone();
    } catch (caught) {
      captureError(caught, { action: "countryPromptSave" });
      setError(t("countryPrompt.error"));
      setSaving(false);
    }
  };

  return createPortal(
    <div className="engine-modal-overlay" onClick={saving ? undefined : skip}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="country-prompt-title"
        aria-describedby="country-prompt-body"
        onSubmit={confirm}
        onClick={(event) => event.stopPropagation()}
        className="engine-pop relative w-full rounded-t-2xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-5 shadow-[var(--engine-shadow-lg)] sm:max-w-md sm:rounded-2xl sm:pb-6"
      >
        <button
          type="button"
          onClick={skip}
          disabled={saving}
          aria-label={t("countryPrompt.skip")}
          title={t("countryPrompt.skip")}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] disabled:opacity-40"
        >
          <X size={20} />
        </button>

        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
          <Globe2 size={20} aria-hidden="true" />
        </span>
        <h2 id="country-prompt-title" className="mt-3 pr-10 font-display text-xl font-extrabold tracking-tight">
          {t("countryPrompt.title")}
        </h2>
        <p id="country-prompt-body" className="mt-1.5 text-sm leading-relaxed text-[var(--engine-text-muted)]">
          {t("countryPrompt.body")}
        </p>

        <label htmlFor="country-prompt-select" className="mb-1.5 mt-5 block text-[13px] font-semibold">
          {t("countryPrompt.label")}
        </label>
        <Select
          id="country-prompt-select"
          value={country}
          disabled={saving}
          onChange={(event) => setPicked(event.target.value)}
          className="h-12 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 text-base text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]"
        >
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </Select>
        {detected && detected === country && (
          <p className="mt-1.5 text-xs text-[var(--engine-text-muted)]">{t("countryPrompt.detected")}</p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] px-3.5 py-2.5 text-sm font-semibold">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={skip}
            disabled={saving}
            className="flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-[var(--engine-text-muted)] transition-colors hover:text-[var(--engine-text)] disabled:opacity-40"
          >
            {t("countryPrompt.skip")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-[15px] font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 size={18} className="animate-spin" />}
            {t("countryPrompt.confirm")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
