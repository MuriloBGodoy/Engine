import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Car, Clapperboard, ImagePlus, Info, Link2, Loader2, Scissors, Trash2, X } from "lucide-react";
import { auth } from "../services/supabase";
import { engineDB } from "../services/db";
import { isFileTooBig, isImageFile, uploadUserPhoto } from "../services/photos";
import { imagesFromPaste } from "../services/clipboardImage";
import { trackEvent } from "../services/observability";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { MentionTextarea } from "./mentions/MentionTextarea";
import { MediaPickerButton } from "./MediaPickerButton";
import { VideoEditor } from "./social/VideoEditor";
import { VIDEO_LIMITS, probeVideo, uploadPostVideo, videoFileProblem } from "../services/postVideo";
import { MAX_HASHTAGS, extractHashtags } from "../services/socialText";
import "../services/i18n-social-posts";
import "../services/i18n-message-dock";
import "../services/i18n-editing";

const MAX_PHOTOS = 3;
const MAX_TEXT = 1000;
const PERSON_ONLY = ["person"];
const MB = Math.round(VIDEO_LIMITS.maxBytes / (1024 * 1024));
const VIDEO_ERRORS_SHOWN = ["tooBig", "format", "notVideo", "signedOut"];

/**
 * Compositor de post do feed.
 *
 * O aviso de nicho fica visível enquanto a pessoa escreve, e não escondido
 * numa página de regras: o feed é sobre carro, e dizer isso na hora da escrita
 * evita a maior parte do desvio antes de virar trabalho de moderação.
 *
 * Mídia: até três fotos OU um vídeo enviado (com corte, sem som e capa no
 * editor — services/postVideo.js) OU um link do YouTube. O vídeo só sobe ao
 * publicar; desistir antes não deixa arquivo órfão no Storage.
 *
 * Texto: @ abre a busca de pessoas (o @ entra como texto); #tag vira link
 * para a página da hashtag, até 30 por post.
 */
export function CreateFeedPostModal({
  open,
  cars = [],
  club = null,
  // Publicação que já está no ar. Com ela o compositor vira editor: mesmos
  // campos, mesma mídia, mesmos limites — o que muda é o verbo.
  goal = null,
  onClose,
  onCreated,
}) {
  const { t } = useTranslation();
  const editing = Boolean(goal);
  const [text, setText] = useState(() => goal?.note || "");
  const [mentions, setMentions] = useState([]);
  const [photos, setPhotos] = useState(() =>
    goal?.images?.length ? [...goal.images] : goal?.image ? [goal.image] : [],
  );
  const [videoUrl, setVideoUrl] = useState(() => goal?.videoUrl || "");
  // Vídeo enviado: o arquivo, o que o navegador leu dele e a edição.
  const [video, setVideo] = useState(null); // { file, source, edit }
  // Vídeo que JÁ está na publicação. O arquivo original ficou no aparelho de
  // quem publicou, então aqui só dá para mantê-lo ou tirá-lo.
  const [publishedVideo, setPublishedVideo] = useState(() => goal?.video || null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [stage, setStage] = useState("");
  const [carId, setCarId] = useState(() => (goal?.carId ? String(goal.carId) : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [garage, setGarage] = useState(null);

  // Editar vem do menu do post, que não carrega a garagem junto. Sem a lista
  // o seletor de carro sumia na edição e o vínculo se perdia ao salvar.
  const carList = cars.length ? cars : garage || [];
  useEffect(() => {
    if (!open || cars.length || garage) return undefined;
    let alive = true;
    engineDB
      .getCars()
      .then((list) => alive && setGarage(list || []))
      .catch(() => alive && setGarage([]));
    return () => {
      alive = false;
    };
  }, [open, cars.length, garage]);

  // Voltar no Android fecha o compositor em vez de sair da comunidade.
  useHistoryDismiss(open, onClose);

  // O endereço local do vídeo é liberado ao trocar de vídeo ou fechar.
  useEffect(() => () => {
    if (video?.source?.url) URL.revokeObjectURL(video.source.url);
  }, [video?.source?.url]);

  if (!open) return null;

  const hashtagCount = extractHashtags(text).length;
  const tooManyTags = hashtagCount > MAX_HASHTAGS;

  const reset = () => {
    setText("");
    setMentions([]);
    setPhotos([]);
    setVideoUrl("");
    setVideo(null);
    setPublishedVideo(null);
    setEditorOpen(false);
    setStage("");
    setCarId("");
    setError("");
  };

  const addPhotos = async (files) => {
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

  // Ctrl+V em qualquer ponto do compositor entra pelo mesmo caminho do
  // seletor: um print ou uma foto copiada de outra aba vira anexo sem passar
  // pelo disco. Vídeo não — vídeo tem editor e limite próprios.
  const handlePaste = async (event) => {
    if (busy || video || publishedVideo || photos.length >= MAX_PHOTOS) return;
    const files = imagesFromPaste(event, { max: MAX_PHOTOS - photos.length });
    if (!files.length) return;
    event.preventDefault();
    await addPhotos(files);
  };

  const handleVideoFile = async (file) => {
    if (!file) return;
    setError("");
    const problem = videoFileProblem(file);
    if (problem) {
      setError(t(`socialPosts.videoErrors.${problem}`, { mb: MB }));
      return;
    }
    setBusy(true);
    try {
      const source = await probeVideo(file);
      if (source.duration > VIDEO_LIMITS.maxSourceSeconds) {
        URL.revokeObjectURL(source.url);
        setError(t("socialPosts.videoErrors.tooLong", { minutes: VIDEO_LIMITS.maxSourceSeconds / 60 }));
        return;
      }
      // Vídeo e fotos não se misturam no mesmo post (o player ocupa a mídia).
      setPhotos([]);
      setVideoUrl("");
      setPublishedVideo(null);
      setVideo({ file, source, edit: null });
      setEditorOpen(true);
    } catch (probeError) {
      setError(t(`socialPosts.videoErrors.${probeError.code || "unreadable"}`, { mb: MB }));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (tooManyTags || (video && !video.edit)) return;
    setBusy(true);
    setError("");

    try {
      const car = carList.find((item) => String(item.id) === carId) || null;
      let uploaded = null;
      if (video?.edit) {
        setStage("uploading");
        try {
          uploaded = await uploadPostVideo(video.file, video.edit, { userId: auth.currentUser?.uid });
        } catch (uploadError) {
          const code = VIDEO_ERRORS_SHOWN.includes(uploadError?.code) ? uploadError.code : "upload";
          throw new Error(t(`socialPosts.videoErrors.${code}`, { mb: MB }));
        }
      }

      if (editing) {
        await engineDB.updateCommunityPost(goal.id, {
          text,
          images: photos,
          videoUrl,
          // `undefined` mantém o vídeo que já estava lá; `null` tira.
          video: uploaded || (publishedVideo ? undefined : null),
          car,
        });
        trackEvent("post_editado", {
          comFoto: photos.length > 0,
          comCarro: Boolean(car),
          trocouVideo: Boolean(uploaded),
        });
        onCreated?.();
        onClose();
        return;
      }

      // O carimbo do clube vem do objeto buscado por id, nunca da URL.
      await engineDB.createCommunityPost({
        text,
        images: photos,
        videoUrl: uploaded ? "" : videoUrl,
        video: uploaded,
        car,
        clubId: club?.id || "",
        clubTag: club?.tag || "",
      });
      trackEvent("post_publicado", {
        comFoto: photos.length > 0,
        comCarro: Boolean(car),
        comVideo: Boolean(uploaded),
        hashtags: hashtagCount,
      });
      reset();
      onCreated?.();
      onClose();
    } catch (err) {
      setError(
        err.code === "too-many-hashtags"
          ? t("socialPosts.errors.tooManyHashtags", { max: MAX_HASHTAGS })
          : err.message,
      );
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const mediaButton =
    "flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] text-xs font-black uppercase tracking-wide text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-50";

  // Portal: o compositor abre de dentro de telas com `transform` (feed, mural
  // do clube), onde um `position: fixed` ficaria preso ao ancestral.
  return createPortal(
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
              {editing ? t("editing.postTitle") : t("feedPost.title")}
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
          onPaste={handlePaste}
          className="engine-modal-body engine-scroll engine-safe-bottom space-y-4 px-5 py-5"
        >
          <MentionTextarea
            id="feed-post-text"
            value={text}
            mentions={mentions}
            kinds={PERSON_ONLY}
            rows={4}
            maxLength={MAX_TEXT}
            onChange={(next, list) => {
              setText(next.slice(0, MAX_TEXT));
              setMentions(list || []);
            }}
            placeholder={t("feedPost.placeholder")}
            className="w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-3 text-sm text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]"
          />
          {(hashtagCount > 0 || text.length > MAX_TEXT * 0.8) && (
            <p className="-mt-2 flex justify-between gap-3 text-[11px] font-semibold text-[var(--engine-text-subtle)]">
              <span className={tooManyTags ? "text-[var(--engine-accent)]" : ""}>
                {tooManyTags
                  ? t("socialPosts.errors.tooManyHashtags", { max: MAX_HASHTAGS })
                  : hashtagCount
                    ? t("socialPosts.caption.hashtags", { count: hashtagCount, max: MAX_HASHTAGS })
                    : ""}
              </span>
              <span className="tabular-nums">
                {t("socialPosts.caption.counter", { count: text.length, max: MAX_TEXT })}
              </span>
            </p>
          )}

          {/* A regra do nicho se lê na hora de ESCREVER. Repeti-la em cada
              correção de vírgula é sermão. */}
          {!editing && (
            <p className="flex items-start gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--engine-text-muted)]">
              <Info size={14} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
              {t("feedPost.nicheNotice")}
            </p>
          )}

          {/* Vídeo que já está no ar: nem o arquivo nem o corte estão aqui,
              então o cartão só oferece tirar. Tirar e mandar outro continua
              sendo um caminho. */}
          {publishedVideo && !video && (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--engine-border)] p-2">
              <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-black">
                <Clapperboard size={18} className="absolute inset-0 m-auto text-white/70" />
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate font-bold text-[var(--engine-text)]">
                  {t("editing.videoUploaded")}
                </p>
                <p className="mt-0.5 leading-relaxed text-[var(--engine-text-muted)]">
                  {t("editing.videoNoRetrim")}
                </p>
                <button
                  type="button"
                  onClick={() => setPublishedVideo(null)}
                  disabled={busy}
                  className="mt-1 flex min-h-9 items-center gap-1 rounded-lg px-2 font-bold text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)]"
                >
                  <Trash2 size={13} />
                  {t("socialPosts.video.remove")}
                </button>
              </div>
            </div>
          )}

          {video && (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--engine-border)] p-2">
              <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-black">
                {video.edit?.posterBlob ? (
                  <PosterThumb blob={video.edit.posterBlob} />
                ) : (
                  <Clapperboard size={18} className="absolute inset-0 m-auto text-white/70" />
                )}
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate font-bold text-[var(--engine-text)]">{video.file.name}</p>
                {video.edit && (
                  <p className="mt-0.5 tabular-nums text-[var(--engine-text-muted)]">
                    {t("socialPosts.video.clipLength", {
                      length: `${(video.edit.trimEnd - video.edit.trimStart).toFixed(1)} s`,
                      max: VIDEO_LIMITS.maxClipSeconds,
                    })}
                    {video.edit.muted ? ` · ${t("socialPosts.video.noSound")}` : ""}
                  </p>
                )}
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setEditorOpen(true)}
                    disabled={busy}
                    className="flex min-h-9 items-center gap-1 rounded-lg px-2 font-bold text-[var(--engine-accent)] hover:bg-[var(--engine-surface-2)]"
                  >
                    <Scissors size={13} />
                    {t("socialPosts.video.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideo(null)}
                    disabled={busy}
                    className="flex min-h-9 items-center gap-1 rounded-lg px-2 font-bold text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)]"
                  >
                    <Trash2 size={13} />
                    {t("socialPosts.video.remove")}
                  </button>
                </div>
              </div>
            </div>
          )}

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
            <MediaPickerButton
              accept="image/*"
              multiple
              onFiles={addPhotos}
              disabled={busy || photos.length >= MAX_PHOTOS || Boolean(video || publishedVideo)}
              title={t("pasteImage.hint")}
              className={mediaButton}
            >
              <ImagePlus size={15} />
              {t("feedPost.addPhoto", { count: photos.length, max: MAX_PHOTOS })}
            </MediaPickerButton>

            <MediaPickerButton
              accept="video/mp4,video/quicktime,video/webm,video/*"
              onFiles={(files) => handleVideoFile(files[0])}
              disabled={busy || photos.length > 0}
              title={t("socialPosts.video.addHint", { max: VIDEO_LIMITS.maxClipSeconds, mb: MB })}
              className={mediaButton}
            >
              <Clapperboard size={15} />
              {t("socialPosts.video.add")}
            </MediaPickerButton>

            {carList.length > 0 && (
              <label className="engine-field relative flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-3 sm:col-span-2">
                <Car size={15} className="shrink-0 text-[var(--engine-text-muted)]" />
                <select
                  value={carId}
                  onChange={(event) => setCarId(event.target.value)}
                  className="w-full bg-transparent text-xs font-bold text-[var(--engine-text)] outline-none"
                >
                  <option value="">{t("feedPost.noCar")}</option>
                  {carList.map((car) => (
                    <option key={car.id} value={car.id}>
                      {car.brand} {car.model}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Só quando a pessoa liga um carro — e é aí que ela precisa
              saber que isto NÃO publica o carro. (06/11/2026) */}
          {carId && (
            <p className="-mt-1 text-[11.5px] leading-relaxed text-[var(--engine-text-muted)]">
              {t("feedPost.carHint")}
            </p>
          )}

          {!video && !publishedVideo && (
            <label className="engine-field flex items-center gap-2 rounded-xl border border-[var(--engine-border)] px-3">
              <Link2 size={15} className="shrink-0 text-[var(--engine-text-muted)]" />
              <input
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder={t("feedPost.videoPlaceholder")}
                className="min-h-11 w-full bg-transparent text-xs text-[var(--engine-text)] outline-none"
              />
            </label>
          )}

          {error && (
            <p className="rounded-xl border border-[var(--engine-accent)]/40 bg-[var(--engine-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--engine-accent)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || tooManyTags}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] text-sm font-black uppercase tracking-widest text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : null}
            {stage === "uploading"
              ? t("socialPosts.video.uploading")
              : editing
                ? t("editing.save")
                : t("feedPost.publish")}
          </button>
        </form>
      </div>

      {editorOpen && video && (
        <VideoEditor
          source={video.source}
          initial={video.edit}
          onCancel={() => {
            setEditorOpen(false);
            // Desistir da primeira edição desiste do vídeo.
            if (!video.edit) setVideo(null);
          }}
          onConfirm={(edit) => {
            setVideo((current) => (current ? { ...current, edit } : current));
            setEditorOpen(false);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

/** Miniatura da capa escolhida (blob local). */
function PosterThumb({ blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null;
}
