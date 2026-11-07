import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Wrench, X } from "lucide-react";
import { auth } from "../../services/supabase";
import { uploadUserPhoto } from "../../services/photos";
import { useToast } from "../ToastProvider";
import { MediaPickerButton } from "../MediaPickerButton";
import { EVENT_MAX_PHOTOS } from "../../services/events";

/**
 * As fotos do evento — as mesmas na hora de criar e na de editar.
 *
 * Saiu de dentro do CreateEventForm em 07/11/2026, quando o evento passou a
 * poder ser editado: duas cópias desta grade divergiriam no primeiro ajuste
 * que só uma das duas recebesse. E a subida ganhou a câmera junto
 * (MediaPickerButton): quem está montando o rolê quer fotografar o ponto de
 * encontro agora, não procurar na galeria.
 */
export function EventPhotoField({ photos = [], onChange, disabled = false }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [uploading, setUploading] = useState(false);

  const receber = async (files) => {
    setUploading(true);
    try {
      let atuais = photos;
      for (const file of files) {
        if (atuais.length >= EVENT_MAX_PHOTOS) break;
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 5 * 1024 * 1024) {
          showToast(t("events.toast.photoTooBig", { name: file.name }), "error");
          continue;
        }
        const url = await uploadUserPhoto(file, {
          userId: auth.currentUser?.uid,
          folder: "events",
        });
        atuais = [...atuais, url];
        onChange(atuais);
      }
    } catch {
      showToast(t("events.toast.uploadError"), "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
      {photos.map((photo) => (
        <div
          key={photo}
          className="relative overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)]"
        >
          <img src={photo} alt="" className="h-36 w-full object-cover sm:h-32" />
          <button
            type="button"
            onClick={() => onChange(photos.filter((item) => item !== photo))}
            disabled={disabled}
            aria-label={t("common.delete")}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-[var(--engine-accent)]"
          >
            <X size={15} />
          </button>
        </div>
      ))}

      {photos.length < EVENT_MAX_PHOTOS && (
        <MediaPickerButton
          accept="image/*"
          multiple
          onFiles={receber}
          disabled={disabled || uploading}
          title={t("events.form.addPhoto")}
          className="flex min-h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4 text-center transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-60"
        >
          {uploading ? (
            <Wrench className="mb-2 animate-spin text-[var(--engine-accent)]" size={24} />
          ) : (
            <ImagePlus className="mb-2 text-[var(--engine-accent)]" size={24} />
          )}
          <span className="text-xs font-black uppercase tracking-widest">
            {uploading ? t("events.form.uploading") : t("events.form.addPhoto")}
          </span>
          <span className="mt-1 text-[11px] font-bold text-[var(--engine-text-subtle)]">
            {t("events.form.photoMax", { max: EVENT_MAX_PHOTOS })}
          </span>
        </MediaPickerButton>
      )}
    </div>
  );
}
