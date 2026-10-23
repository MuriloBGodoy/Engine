import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Car, ImagePlus, Info, Loader2, Trash2, Video, X } from "lucide-react";
import { auth } from "../services/supabase";
import { engineDB } from "../services/db";
import { isFileTooBig, isImageFile, uploadUserPhoto } from "../services/photos";
import { trackEvent } from "../services/observability";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";

const MAX_PHOTOS = 3;
const MAX_TEXT = 1000;

/**
 * Compositor de post do feed.
 *
 * O aviso de nicho fica visível enquanto a pessoa escreve, e não escondido
 * numa página de regras: o feed é sobre carro, e dizer isso na hora da escrita
 * evita a maior parte do desvio antes de virar trabalho de moderação.
 *
 * Três fotos, e não seis como na garagem, porque sem o Storage ligado a imagem
 * vai em base64 dentro do documento e o Firestore corta em 1 MiB.
 */
export function CreateFeedPostModal({ open, cars = [], club = null, onClose, onCreated }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [carId, setCarId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  // Voltar no Android fecha o compositor em vez de sair da comunidade.
  useHistoryDismiss(open, onClose);

  if (!open) return null;

  const reset = () => {
    setText("");
    setPhotos([]);
    setVideoUrl("");
    setCarId("");
    setError("");
  };

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    setBusy(true);
    setError("");
    try {
      for (const file of files.slice(0, MAX_PHOTOS - photos.length)) {
        if (!isImageFile(file)) throw new Error(t("feedPost.notAnImage"));
        if (isFileTooBig(file)) throw new Error(t("feedPost.tooBig"));

        const url = await uploadUserPhoto(file, {
          userId: auth.currentUser?.uid,
          folder: "posts",
        });
        setPhotos((current) => [...current, url].slice(0, MAX_PHOTOS));
      }
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const car = cars.find((item) => String(item.id) === carId) || null;
      // O carimbo do clube vem do objeto buscado por id, nunca da URL.
      await engineDB.createCommunityPost({
        text,
        images: photos,
        videoUrl,
        car,
        clubId: club?.id || "",
        clubTag: club?.tag || "",
      });
      trackEvent("post_publicado", { comFoto: photos.length > 0, comCarro: Boolean(car) });
      reset();
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="engine-modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("feedPost.title")}
        className="engine-modal-panel engine-pop sm:max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--engine-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-black text-[var(--engine-text)]">
              {t("feedPost.title")}
            </h2>
            {/* Publicar no mural sem enxergar em qual clube é publicar no
                escuro: o post sai com a sigla e aparece no feed de todo
                mundo. */}
            {club?.tag && (
              <p className="truncate text-[11px] text-[var(--engine-text-subtle)]">
                {t("feedPost.toClub", { club: `[${club.tag}] ${club.name || ""}`.trim() })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            /* 44x44: media 36x36; a margem negativa segura o X no lugar. */
            className="-m-1 flex h-11 w-11 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={18} />
          </button>
        </header>

        {/* `engine-modal-body` em vez de `max-h-[70vh]`: no celular o painel
            é a tela inteira e o formulário parava a 70% dela (13/09/2026). */}
        <form
          onSubmit={submit}
          className="engine-modal-body engine-scroll engine-safe-bottom space-y-4 px-5 py-5"
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT))}
            rows={4}
            placeholder={t("feedPost.placeholder")}
            className="w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-3 text-sm text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]"
          />

          <p className="flex items-start gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--engine-text-muted)]">
            <Info size={14} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
            {t("feedPost.nicheNotice")}
          </p>

          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <div
                  key={photo}
                  className="relative overflow-hidden rounded-xl border border-[var(--engine-border)]"
                >
                  <img src={photo} alt="" className="h-24 w-full object-cover" />
                  {/* Alvo de 44x44 com o círculo visual de 28px dentro: o
                      botão media 28x28 (13/09/2026). */}
                  <button
                    type="button"
                    onClick={() => setPhotos((current) => current.filter((item) => item !== photo))}
                    aria-label={t("common.delete")}
                    className="group absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition group-hover:bg-[var(--engine-accent)]">
                      <Trash2 size={13} />
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy || photos.length >= MAX_PHOTOS}
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] text-xs font-black uppercase tracking-wide text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-50"
            >
              <ImagePlus size={15} />
              {t("feedPost.addPhoto", { count: photos.length, max: MAX_PHOTOS })}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
            />

            {cars.length > 0 && (
              <label className="engine-field relative flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-3">
                <Car size={15} className="shrink-0 text-[var(--engine-text-muted)]" />
                <select
                  value={carId}
                  onChange={(event) => setCarId(event.target.value)}
                  className="w-full bg-transparent text-xs font-bold text-[var(--engine-text)] outline-none"
                >
                  <option value="">{t("feedPost.noCar")}</option>
                  {cars.map((car) => (
                    <option key={car.id} value={car.id}>
                      {car.brand} {car.model}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="engine-field flex items-center gap-2 rounded-xl border border-[var(--engine-border)] px-3">
            <Video size={15} className="shrink-0 text-[var(--engine-text-muted)]" />
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder={t("feedPost.videoPlaceholder")}
              className="min-h-11 w-full bg-transparent text-xs text-[var(--engine-text)] outline-none"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-[var(--engine-accent)]/40 bg-[var(--engine-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--engine-accent)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] text-sm font-black uppercase tracking-widest text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : null}
            {t("feedPost.publish")}
          </button>
        </form>
      </div>
    </div>
  );
}
