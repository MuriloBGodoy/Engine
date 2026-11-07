import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { serviceCategories } from "../../../services/serviceListingDisplay";
import { PRO_HANDLE_PATTERN, checkHandle, cleanHandle } from "../../../services/proProfiles";
import { SelectField, TextAreaField, TextField } from "../ProUi";
import { ProfileLogo } from "../../shop/ShopPrimitives";
import { handleFromName, profileInitials } from "../../../services/shopFormat";
import { MediaPickerButton } from "../../MediaPickerButton";

/**
 * Passo 1 — quem é. Página: @ próprio (com "está livre?" enquanto digita),
 * nome, categoria, bio, logo e capa. Pessoa: nome profissional, categoria e
 * bio (o @ e a foto são os do perfil, como no Instagram).
 *
 * `value` = { kind, handle, name, data }. `onUpload(file, field)` sobe a foto
 * limpa (EXIF fora) e grava a URL em data[field].
 */
export function ProStepIdentity({ value, onChange, onUpload, uploading = "", editing = false }) {
  const { t } = useTranslation();
  const isPage = value.kind === "page";
  const data = value.data || {};
  const setData = (key, next) => onChange({ ...value, data: { ...data, [key]: next } });
  const [handleState, setHandleState] = useState({ handle: "", status: "" });
  const handle = cleanHandle(value.handle);

  useEffect(() => {
    if (!isPage || editing || !PRO_HANDLE_PATTERN.test(handle)) return undefined;
    let alive = true;
    const timer = setTimeout(async () => {
      const status = await checkHandle(handle);
      if (alive) setHandleState({ handle, status: status || "" });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [handle, isPage, editing]);

  const status = !handle
    ? ""
    : !PRO_HANDLE_PATTERN.test(handle)
      ? "invalid"
      : handleState.handle === handle
        ? handleState.status
        : "checking";

  return (
    <div className="space-y-4">
      <TextField
        id="pro-name"
        label={isPage ? t("pro.fields.pageName") : t("pro.fields.proName")}
        value={value.name}
        onChange={(next) =>
          onChange({
            ...value,
            name: next,
            // Página nova: o @ acompanha o nome até a pessoa mexer nele.
            handle: isPage && !editing && (!value.handle || value.handle === handleFromName(value.name)) ? handleFromName(next) : value.handle,
          })
        }
        maxLength={80}
        hint={isPage ? "" : t("pro.hints.proName")}
      />
      {isPage && (
        <div>
          <TextField
            id="pro-handle"
            label={t("pro.fields.handle")}
            value={value.handle}
            onChange={(next) => onChange({ ...value, handle: cleanHandle(next) })}
            maxLength={25}
            disabled={editing}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            hint={editing ? t("pro.hints.handleFixed") : t("pro.hints.handle")}
          />
          {!editing && status && (
            <p
              aria-live="polite"
              className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${
                status === "available" || status === "checking" ? "text-[var(--engine-text-muted)]" : "text-[var(--engine-accent)]"
              }`}
            >
              {status === "checking" ? (
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              ) : status === "available" ? (
                <CheckCircle2 size={13} aria-hidden="true" />
              ) : (
                <XCircle size={13} aria-hidden="true" />
              )}
              {t(`pro.handleStatus.${status}`, { handle: `@${handle}` })}
            </p>
          )}
        </div>
      )}

      {isPage && (
        <div className="grid grid-cols-2 gap-2.5">
          <PhotoTile busy={uploading === "logo"} onFile={(file) => onUpload(file, "logo")} label={data.logo ? t("shop.page.logoChange") : t("shop.page.logo")}>
            <ProfileLogo src={data.logo} initials={profileInitials(value.name)} className="h-11 w-11 rounded-xl text-[13px]" />
          </PhotoTile>
          <PhotoTile busy={uploading === "cover"} onFile={(file) => onUpload(file, "cover")} label={data.cover ? t("shop.page.coverChange") : t("shop.page.coverUpload")}>
            <span className="block h-11 w-full overflow-hidden rounded-xl bg-[var(--engine-surface-2)]">
              {data.cover && <img src={data.cover} alt="" className="h-full w-full object-cover" />}
            </span>
          </PhotoTile>
        </div>
      )}
      <SelectField
        id="pro-category"
        label={t("pro.fields.category")}
        value={data.category}
        onChange={(next) => setData("category", next)}
        options={[
          { value: "", label: t("pro.fields.categoryPick") },
          { value: "shop", label: t("pro.categories.shop") },
          ...serviceCategories.map((category) => ({ value: category.value, label: t(category.labelKey) })),
        ]}
      />
      <TextAreaField
        id="pro-bio"
        label={t("pro.fields.bio")}
        value={data.bio}
        onChange={(next) => setData("bio", next)}
        maxLength={500}
        optional
        placeholder={t("pro.placeholders.bio")}
      />
    </div>
  );
}

/** Tile tracejado de enviar logo/capa, com a miniatura do que já foi. */
function PhotoTile({ label, busy, onFile, children }) {
  // Mesma casca de antes; no celular o MediaPickerButton pergunta se a foto
  // e nova ou da galeria (07/11/2026).
  return (
    <MediaPickerButton
      accept="image/*"
      onFiles={(files) => onFile(files[0])}
      disabled={busy}
      title={label}
      className="flex min-h-24 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[var(--engine-border-strong)] bg-[var(--engine-surface)] px-3 py-3 text-[13px] font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-text-muted)] disabled:opacity-60"
    >
      {busy ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : children}
      {label}
    </MediaPickerButton>
  );
}

