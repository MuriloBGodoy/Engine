import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { ClubEmblem, ClubIconGlyph } from "./ClubEmblem";
import {
  CLUB_ICON_GROUPS,
  CLUB_PALETTE,
  CLUB_SHAPE_VALUES,
  CLUB_SYMBOL_BACKINGS,
  CLUB_SYMBOL_POSITIONS,
  DEFAULT_CLUB_COLOR_SECONDARY,
  clubColorLabel,
  clubIconLabel,
  clubShapeLabel,
  normalizeEmblem,
} from "../../services/clubStyles";

const labelClass =
  "ml-0.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]";

// Os tamanhos em que o emblema aparece de verdade: topo da página, card,
// prévia/lista e a linha de ranking.
const REAL_SIZES = [84, 64, 40, 28];

/**
 * Forma, símbolo, cores e borda do emblema — e, quando o clube tem logo, o
 * símbolo por cima da foto. O mesmo bloco na fundação e no "Personalizar":
 * duas cópias do seletor iam divergir no primeiro ajuste.
 *
 * `club` é o rascunho inteiro, com `logoUrl` quando há foto (a prévia usa a
 * foto de verdade); `onEmblem` e `onColors` recebem só o pedaço que mudou.
 */
export function ClubLookFields({ club, onEmblem, onColors }) {
  const { t } = useTranslation();
  const emblem = normalizeEmblem(club.emblem);
  const colors = club.colors || {};
  const hasPhoto = Boolean(club.logoUrl);

  return (
    <div className="grid gap-4">
      {/* Prévia nos tamanhos reais: o que fica bom a 84px pode sumir a 28. */}
      <div className="space-y-2">
        <span className={labelClass}>{t("clubs.custom.realSizes")}</span>
        <div className="flex items-end gap-4 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-3 py-2.5">
          {REAL_SIZES.map((size) => (
            <div key={size} className="flex flex-col items-center gap-1">
              <ClubEmblem club={club} size={size} />
              <span className="text-[10px] font-semibold tabular-nums text-[var(--engine-text-muted)]">{size}px</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className={labelClass}>{t("clubs.form.shape")}</span>
        <div className="flex flex-wrap gap-2">
          {CLUB_SHAPE_VALUES.map((shape) => (
            <button
              key={shape}
              type="button"
              onClick={() => onEmblem({ shape })}
              aria-pressed={emblem.shape === shape}
              aria-label={clubShapeLabel(t, shape)}
              className={`grid h-14 w-14 place-items-center rounded-xl border transition ${
                emblem.shape === shape
                  ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)]"
                  : "border-[var(--engine-border)] bg-[var(--engine-surface-2)]"
              }`}
            >
              <ClubEmblem club={{ ...club, emblem: { ...emblem, shape } }} size={40} />
            </button>
          ))}
        </div>
        {hasPhoto ? (
          <p className="ml-0.5 text-[11.5px] text-[var(--engine-text-muted)]">{t("clubs.custom.shapeClipsPhoto")}</p>
        ) : null}
      </div>

      {hasPhoto ? (
        <div className="space-y-2.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3">
          <button
            type="button"
            role="switch"
            aria-checked={emblem.showSymbolOnPhoto}
            onClick={() => onEmblem({ showSymbolOnPhoto: !emblem.showSymbolOnPhoto })}
            className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
          >
            <span className="text-[13.5px] font-bold text-[var(--engine-text)]">{t("clubs.custom.symbolOnPhoto")}</span>
            <span
              aria-hidden="true"
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                emblem.showSymbolOnPhoto ? "bg-[var(--engine-accent)]" : "bg-[var(--engine-border-strong)]"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  emblem.showSymbolOnPhoto ? "left-6" : "left-1"
                }`}
              />
            </span>
          </button>
          {emblem.showSymbolOnPhoto ? (
            <>
              <Segmented
                label={t("clubs.custom.symbolPosition")}
                value={emblem.symbolPosition}
                options={CLUB_SYMBOL_POSITIONS.map((id) => ({ id, label: t(`clubs.custom.positions.${id}`) }))}
                onPick={(symbolPosition) => onEmblem({ symbolPosition })}
              />
              <Segmented
                label={t("clubs.custom.symbolBacking")}
                value={emblem.symbolBacking}
                options={CLUB_SYMBOL_BACKINGS.map((id) => ({ id, label: t(`clubs.custom.backings.${id}`) }))}
                onPick={(symbolBacking) => onEmblem({ symbolBacking })}
              />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <span className={labelClass}>{t("clubs.form.icon")}</span>
        {/* Rolagem própria: são 78 símbolos e o formulário não pode virar
            um corredor. 6 colunas a 360px dão botões de 46px. */}
        <div className="engine-scroll max-h-[264px] overflow-y-auto rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-2">
          {CLUB_ICON_GROUPS.map((group) => (
            <div key={group.id} className="mb-2 last:mb-0">
              <p className="mb-1.5 ml-0.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
                {t(`clubs.custom.iconGroups.${group.id}`)}
              </p>
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
                {group.icons.map((icon) => {
                  const active = emblem.icon === icon;
                  return (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => onEmblem({ icon })}
                      aria-pressed={active}
                      aria-label={clubIconLabel(t, icon)}
                      title={clubIconLabel(t, icon)}
                      className={`grid aspect-square min-h-11 place-items-center rounded-lg border transition ${
                        active
                          ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                          : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                      }`}
                    >
                      {icon === "none" ? (
                        <span className="text-[12px] font-bold">—</span>
                      ) : (
                        <ClubIconGlyph icon={icon} size={20} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ColorRow
        label={t("clubs.custom.symbolColor")}
        value={emblem.symbolColor}
        extras={[{ id: "", label: t("clubs.custom.symbolColorAuto") }]}
        onPick={(symbolColor) => onEmblem({ symbolColor })}
        hint={t("clubs.custom.symbolColorHint")}
      />
      <ColorRow
        label={t("clubs.form.color")}
        value={colors.primary}
        onPick={(id) => onColors({ primary: id })}
      />
      <ColorRow
        label={t("clubs.custom.secondaryColor")}
        value={colors.secondary || DEFAULT_CLUB_COLOR_SECONDARY}
        onPick={(id) => onColors({ secondary: id })}
        hint={t("clubs.form.colorHint")}
      />
      <ColorRow
        label={t("clubs.custom.borderColor")}
        value={emblem.borderColor}
        extras={[
          { id: "", label: t("clubs.custom.borderDefault") },
          { id: "none", label: t("clubs.custom.borderNone") },
        ]}
        onPick={(borderColor) => onEmblem({ borderColor })}
      />
    </div>
  );
}

function Segmented({ label, value, options, onPick }) {
  return (
    <div className="space-y-1.5">
      <span className={labelClass}>{label}</span>
      <div className="flex gap-1.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onPick(option.id)}
            aria-pressed={value === option.id}
            className={`min-h-10 flex-1 rounded-lg px-2 text-[12.5px] font-bold transition ${
              value === option.id
                ? "bg-[var(--engine-elevated)] text-[var(--engine-text)] shadow-[var(--engine-shadow-sm)]"
                : "text-[var(--engine-text-muted)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorRow({ label, value, onPick, extras = [], hint = "" }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <span className={labelClass}>{label}</span>
      <div className="flex flex-wrap gap-2">
        {extras.map((extra) => (
          <button
            key={extra.id || "default"}
            type="button"
            onClick={() => onPick(extra.id)}
            aria-pressed={value === extra.id}
            className={`min-h-11 rounded-xl border-2 px-3 text-[12.5px] font-bold transition ${
              value === extra.id
                ? "border-[var(--engine-text)] text-[var(--engine-text)]"
                : "border-[var(--engine-border)] text-[var(--engine-text-muted)]"
            }`}
          >
            {extra.label}
          </button>
        ))}
        {CLUB_PALETTE.map((color) => (
          <button
            key={color.id}
            type="button"
            onClick={() => onPick(color.id)}
            aria-pressed={value === color.id}
            aria-label={clubColorLabel(t, color.id)}
            title={clubColorLabel(t, color.id)}
            style={{ background: color.hex }}
            className={`grid h-11 w-11 place-items-center rounded-xl border-2 transition ${
              value === color.id ? "border-[var(--engine-text)]" : "border-transparent"
            }`}
          >
            {value === color.id ? (
              <Check size={16} className={color.light ? "text-[#18202c]" : "text-white drop-shadow"} />
            ) : null}
          </button>
        ))}
      </div>
      {hint ? <p className="ml-0.5 text-[11.5px] text-[var(--engine-text-muted)]">{hint}</p> : null}
    </div>
  );
}
