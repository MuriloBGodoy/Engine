import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRegion } from "../hooks/RegionProvider";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { countryDisplayName, regionShortLabel } from "../services/region";
import { countries, getStates } from "../services/locations";
import { BottomSheet } from "./BottomSheet";
import { Select } from "./ui/Select";

/**
 * Pílula de localização no estilo Webmotors/OLX: mostra a região ativa e abre
 * um painel para trocar país/estado. Escreve na mesma fonte (RegionProvider)
 * que os filtros de conteúdo, então a troca reflete no feed na hora.
 *
 * `compact` deixa só o pin + rótulo curto (para o header do mobile).
 *
 * O painel tem duas formas, e isso não é enfeite. No celular ele é a MESMA
 * folha de baixo do resto do app: antes era um cartão flutuante preso no
 * header, que cobria a página sem escurecer nada e abria no topo da tela,
 * longe do polegar — e o campo de país dentro dele abria uma folha de baixo,
 * então a pessoa via dois jeitos de escolher empilhados na mesma tarefa.
 * Acima de 640px continua o balão ancorado, que ali é o gesto certo.
 */

/** Mesmo campo das outras telas (ver EventEditModal/ReminderSettings). */
const campoClasse =
  "min-h-11 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-[14px] font-semibold text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]";

export function RegionPicker({ compact = false, className = "" }) {
  const { t, i18n } = useTranslation();
  const { region, setRegion } = useRegion();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // O mesmo corte que o Select usa para decidir folha x balão: os dois têm
  // de concordar, senão a folha do país abre dentro do balão da região.
  const celular = useMediaQuery("(max-width: 639px)");

  // Voltar no Android fecha o painel, como o toque fora e o Esc.
  const close = useCallback(() => setOpen(false), []);
  useHistoryDismiss(open, close);

  // Toque fora e Esc. No celular quem cuida disso é a própria folha — e o
  // listener daqui atrapalharia: a folha é portada para o <body>, então todo
  // toque dentro dela cairia como "fora" deste `ref` e fecharia na hora.
  useEffect(() => {
    if (!open || celular) return undefined;
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
  }, [open, celular]);

  const label = regionShortLabel(region, i18n.language) || t("region.all");
  const stateList = region.country !== "all" ? getStates(region.country) : [];
  const active = region.country !== "all";

  const campos = (
    <>
      <label className="region-pop-field">
        <span>{t("region.country")}</span>
        <Select
          className={campoClasse}
          aria-label={t("region.country")}
          value={region.country}
          onChange={(event) => setRegion({ country: event.target.value, state: "all" })}
        >
          <option value="all">{t("region.all")}</option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {countryDisplayName(country.code, i18n.language)}
            </option>
          ))}
        </Select>
      </label>

      {stateList.length > 0 && (
        <label className="region-pop-field">
          <span>{t("region.state")}</span>
          <Select
            className={campoClasse}
            aria-label={t("region.state")}
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
          </Select>
        </label>
      )}
    </>
  );

  const limpar = active ? (
    <button
      type="button"
      className="region-pop-clear"
      onClick={() => setRegion({ country: "all", state: "all" })}
    >
      {t("region.clear")}
    </button>
  ) : null;

  return (
    <div ref={ref} className={`region-picker ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`region-pill ${active ? "region-pill-active" : ""}`}
        title={t("region.title")}
        aria-label={t("region.title")}
        aria-expanded={open}
      >
        <MapPin size={15} className="region-pill-pin" />
        {!compact && <span className="region-pill-label">{label}</span>}
        {/* No celular cabia só uma bolinha, e a pílula ficava com cara de
            campo vazio. A sigla ("SP", "BR") ocupa o mesmo espaço e diz
            onde a pessoa está. */}
        {compact && active && (
          <span className="region-pill-label">
            {(region.state && region.state !== "all"
              ? region.state
              : region.country
            ).toUpperCase()}
          </span>
        )}
        <ChevronDown
          size={13}
          className={`region-pill-caret ${open ? "region-pill-caret-open" : ""}`}
        />
      </button>

      {open && celular && (
        <BottomSheet
          open
          onClose={close}
          title={t("region.title")}
          /* "Limpar" no canto do cabeçalho em vez de solto no fim: na folha
             ele ficaria embaixo dos campos, no caminho do polegar que acabou
             de escolher um estado. */
          headerAction={limpar}
        >
          <p className="region-sheet-hint">{t("region.hint")}</p>
          <div className="region-sheet-fields">{campos}</div>
        </BottomSheet>
      )}

      {open && !celular && (
        <div className="region-pop">
          <p className="region-pop-title">{t("region.title")}</p>
          <p className="region-pop-hint">{t("region.hint")}</p>
          {campos}
          {limpar}
        </div>
      )}
    </div>
  );
}
