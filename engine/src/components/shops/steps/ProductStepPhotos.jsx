import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Star, X } from "lucide-react";
import { PRODUCT_MAX_PHOTOS } from "../../../services/shops";
import { PhotoPickButton } from "../../pro/ProUi";

/**
 * Passo 1 — fotos (até 10). A primeira é a capa; dá para mudar a ordem.
 * O upload (com a limpeza de EXIF) é de quem chama: `onAddFiles(files)`.
 */
export function ProductStepPhotos({ value, onChange, onAddFiles, uploading = false }) {
  const { t } = useTranslation();
  const photos = value.photos || [];
  const move = (index, delta) => {
    const next = [...photos];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...value, photos: next });
  };
  const remove = (photo) => onChange({ ...value, photos: photos.filter((item) => item !== photo) });

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
        {t("shops.form.photosHint", { max: PRODUCT_MAX_PHOTOS })}
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((photo, index) => (
          <div key={photo} className="relative aspect-square overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)]">
            <img src={photo} alt="" className="h-full w-full object-cover" />
            {index === 0 && (
              <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-[var(--engine-accent)] px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
                <Star size={10} aria-hidden="true" />
                {t("shops.form.cover")}
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(photo)}
              aria-label={t("shops.form.removePhoto")}
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X size={14} />
            </button>
            <div className="absolute inset-x-1 bottom-1 flex justify-between">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t("shops.form.moveLeft")} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30">
                <ArrowLeft size={13} />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === photos.length - 1} aria-label={t("shops.form.moveRight")} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30">
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {photos.length < PRODUCT_MAX_PHOTOS && (
        <PhotoPickButton id="product-photos" label={t("shops.form.addPhotos")} busy={uploading} multiple onFiles={onAddFiles} />
      )}
    </div>
  );
}
