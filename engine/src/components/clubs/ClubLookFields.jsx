import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { ClubEmblem, ClubIconGlyph } from "./ClubEmblem";
import {
  CLUB_ICON_GROUPS,
  CLUB_PALETTE,
  CLUB_SHAPE_VALUES,
  DEFAULT_CLUB_COLOR_SECONDARY,
  clubColorLabel,
  clubIconLabel,
  clubShapeLabel,
} from "../../services/clubStyles";

const labelClass =
  "ml-0.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]";

/**
 * Forma, símbolo e as duas cores do clube. O mesmo bloco na fundação e no
 * "Personalizar": duas cópias do seletor iam divergir no primeiro ajuste.
 *
 * `club` é o rascunho inteiro (para a miniatura do emblema); `onEmblem` e
 * `onColors` recebem só o pedaço que mudou.
 */
export function ClubLookFields({ club, onEmblem, onColors }) {
  const { t } = useTranslation();
  const emblem = club.emblem || {};
  const colors = club.colors || {};
  // A miniatura é sempre o emblema GERADO: com logo, ela esconderia o que a
  // pessoa está escolhendo (e o gerado é o reserva da logo).
  const generated = { ...club, logoUrl: "" };

  return (
    <div className="grid gap-3.5">
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
              <ClubEmblem club={{ ...generated, emblem: { ...emblem, shape } }} size={40} forceGenerated />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className={labelClass}>{t("clubs.form.icon")}</span>
        {/* Rolagem própria: são ~75 símbolos e o formulário não pode virar
            um corredor. 6 colunas a 360px dão botões de 44px. */}
        <div className="engine-scroll max-h-[264px] overflow-y-auto rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-2">
          {CLUB_ICON_GROUPS.map((group) => (
            <div key={group.id} className="mb-2 last:mb-0">
              <p className="mb-1.5 ml-0.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
                {t(`clubs.custom.iconGroups.${group.id}`)}
              </p>
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
                {group.icons.map((icon) => {
                  const active = (emblem.icon || "wheel") === icon;
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
        label={t("clubs.form.color")}
        value={colors.primary}
        onPick={(id) => onColors({ primary: id })}
      />
      <ColorRow
        label={t("clubs.custom.secondaryColor")}
        value={colors.secondary || DEFAULT_CLUB_COLOR_SECONDARY}
        onPick={(id) => onColors({ secondary: id })}
      />
      <p className="-mt-2 ml-0.5 text-[11.5px] text-[var(--engine-text-muted)]">
        {t("clubs.form.colorHint")}
      </p>
    </div>
  );
}

function ColorRow({ label, value, onPick }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <span className={labelClass}>{label}</span>
      <div className="flex flex-wrap gap-2">
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
              <Check
                size={16}
                className={color.light ? "text-[#18202c]" : "text-white drop-shadow"}
              />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
