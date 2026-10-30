import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRegion } from "../hooks/RegionProvider";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { countryDisplayName, regionShortLabel } from "../services/region";
import { countries, getStates } from "../services/locations";

/**
 * Pílula de localização no estilo Webmotors/OLX: mostra a região ativa e abre
 * um popover para trocar país/estado. Escreve na mesma fonte (RegionProvider)
 * que os filtros de conteúdo, então a troca reflete no feed na hora.
 *
 * `compact` deixa só o pin + rótulo curto (para o header do mobile).
 */
export function RegionPicker({ compact = false, className = "" }) {
  const { t, i18n } = useTranslation();
  const { region, setRegion } = useRegion();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Voltar no Android fecha o popover, como o toque fora e o Esc.
  const close = useCallback(() => setOpen(false), []);
  useHistoryDismiss(open, close);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = regionShortLabel(region, i18n.language) || t("region.all");
  const stateList = region.country !== "all" ? getStates(region.country) : [];
  const active = region.country !== "all";

  return (
    <div ref={ref} className={`region-picker ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`region-pill ${active ? "region-pill-active" : ""}`}
        title={t("region.title")}
        aria-label={t("region.title")}
      >
        <MapPin size={15} className="region-pill-pin" />
        {!compact && <span className="region-pill-label">{label}</span>}
        {compact && active && <span className="region-pill-dot" />}
        <ChevronDown
          size={13}
          className={`region-pill-caret ${open ? "region-pill-caret-open" : ""}`}
        />
      </button>

      {open && (
        <div className="region-pop">
          <p className="region-pop-title">{t("region.title")}</p>
          <p className="region-pop-hint">{t("region.hint")}</p>

          <label className="region-pop-field">
            <span>{t("region.country")}</span>
            <select
              value={region.country}
              onChange={(event) =>
                setRegion({ country: event.target.value, state: "all" })
              }
            >
              <option value="all">{t("region.all")}</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.flag} {countryDisplayName(country.code, i18n.language)}
                </option>
              ))}
            </select>
          </label>

          {stateList.length > 0 && (
            <label className="region-pop-field">
              <span>{t("region.state")}</span>
              <select
                value={region.state}
                onChange={(event) =>
                  setRegion({ country: region.country, state: event.target.value })
                }
              >
                <option value="all">{t("region.allStates")}</option>
                {stateList.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {active && (
            <button
              type="button"
              className="region-pop-clear"
              onClick={() => setRegion({ country: "all", state: "all" })}
            >
              {t("region.clear")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
