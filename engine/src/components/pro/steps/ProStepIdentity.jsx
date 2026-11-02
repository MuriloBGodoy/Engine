import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { serviceCategories } from "../../../services/serviceListingDisplay";
import { PRO_HANDLE_PATTERN, checkHandle, cleanHandle } from "../../../services/proProfiles";
import { PhotoPickButton, ProAvatar, SelectField, TextAreaField, TextField } from "../ProUi";

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
      {isPage && (
        <div className="overflow-hidden rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)]">
          <div className="relative h-28 bg-[var(--engine-surface)]">
            {data.cover && <img src={data.cover} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="flex flex-wrap items-end gap-3 px-3 pb-3">
            <div className="-mt-8 rounded-2xl border-4 border-[var(--engine-surface-2)]">
              <ProAvatar src={data.logo} name={value.name} size={64} square />
            </div>
            <PhotoPickButton id="pro-logo" label={t("pro.fields.logo")} busy={uploading === "logo"} onFiles={([file]) => onUpload(file, "logo")} />
            <PhotoPickButton id="pro-cover" label={t("pro.fields.cover")} busy={uploading === "cover"} onFiles={([file]) => onUpload(file, "cover")} />
          </div>
        </div>
      )}

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
                status === "available" ? "text-emerald-600" : status === "checking" ? "text-[var(--engine-text-subtle)]" : "text-red-500"
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

      <TextField
        id="pro-name"
        label={isPage ? t("pro.fields.pageName") : t("pro.fields.proName")}
        value={value.name}
        onChange={(next) => onChange({ ...value, name: next })}
        maxLength={80}
        hint={isPage ? "" : t("pro.hints.proName")}
      />
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
