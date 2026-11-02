import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Image as ImageIcon, Loader2, Play, Scissors, Volume2, VolumeX, X } from "lucide-react";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { VIDEO_LIMITS, captureFrame, clampTrim, seekTo } from "../../services/postVideo";

const fmt = (seconds) => {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const rest = total - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
};

/**
 * Edição básica antes de publicar: cortar início e fim (até 60 s), tirar o
 * som e escolher o quadro de capa.
 *
 * Duas barras simples (início e fim) em vez de uma barra de duas alças: alça
 * dupla em `input range` não existe nativa, e a feita à mão briga com o
 * rolar da página no celular. As barras nativas funcionam no Safari e no
 * Chrome com o dedo, com leitor de tela e com teclado.
 *
 * Nada é recodificado: o resultado é `{ trimStart, trimEnd, muted, coverTime,
 * posterBlob }`, que o player respeita. O aviso do "sem som" diz isso.
 */
export function VideoEditor({ source, initial = null, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const duration = source.duration;
  const first = clampTrim(duration, initial?.trimStart ?? 0, initial?.trimEnd ?? Math.min(duration, VIDEO_LIMITS.maxClipSeconds));
  const [trimStart, setTrimStart] = useState(first.trimStart);
  const [trimEnd, setTrimEnd] = useState(first.trimEnd);
  const [muted, setMuted] = useState(Boolean(initial?.muted));
  const [coverTime, setCoverTime] = useState(initial?.coverTime ?? first.trimStart);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("trim");

  useHistoryDismiss(true, onCancel);

  // O trecho toca em laço enquanto se edita, como no Instagram.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const onTime = () => {
      if (mode !== "trim") return;
      if (video.currentTime >= trimEnd - 0.05 || video.currentTime < trimStart - 0.25) {
        video.currentTime = trimStart;
      }
    };
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [trimStart, trimEnd, mode]);

  const pause = () => {
    videoRef.current?.pause();
    setPlaying(false);
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      pause();
      return;
    }
    if (video.currentTime < trimStart || video.currentTime >= trimEnd) video.currentTime = trimStart;
    try {
      await video.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const changeStart = (value) => {
    const next = clampTrim(duration, value, Math.max(trimEnd, Number(value) + VIDEO_LIMITS.minClipSeconds));
    // Andar o início não pode deixar o trecho com mais de 60 s: o fim acompanha.
    setTrimStart(next.trimStart);
    setTrimEnd(Math.min(next.trimEnd, next.trimStart + VIDEO_LIMITS.maxClipSeconds));
    setCoverTime((current) => Math.min(Math.max(current, next.trimStart), next.trimEnd));
    pause();
    if (videoRef.current) videoRef.current.currentTime = next.trimStart;
  };

  const changeEnd = (value) => {
    const end = Number(value);
    const start = end - trimStart > VIDEO_LIMITS.maxClipSeconds ? end - VIDEO_LIMITS.maxClipSeconds : trimStart;
    const next = clampTrim(duration, start, end);
    setTrimStart(next.trimStart);
    setTrimEnd(next.trimEnd);
    setCoverTime((current) => Math.min(Math.max(current, next.trimStart), next.trimEnd));
    pause();
    if (videoRef.current) videoRef.current.currentTime = Math.max(next.trimStart, next.trimEnd - 0.1);
  };

  const changeCover = (value) => {
    const time = Number(value);
    setCoverTime(time);
    pause();
    if (videoRef.current) videoRef.current.currentTime = time;
  };

  const confirm = async () => {
    setBusy(true);
    pause();
    let posterBlob = null;
    try {
      await seekTo(videoRef.current, coverTime);
      posterBlob = await captureFrame(videoRef.current);
    } catch (error) {
      // Safari às vezes nega o quadro (vídeo ainda sem dados): sem capa, o
      // player mostra o primeiro quadro do trecho.
      console.warn("[vídeo] capa não capturada.", error);
    }
    setBusy(false);
    onConfirm({
      duration,
      trimStart,
      trimEnd,
      muted,
      coverTime,
      width: source.width,
      height: source.height,
      posterBlob,
    });
  };

  const clip = trimEnd - trimStart;
  const rangeClass =
    "h-11 w-full cursor-pointer accent-[var(--engine-accent)]";

  return createPortal(
    <div className="engine-modal-overlay" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("socialPosts.video.editTitle")}
        className="engine-modal-panel engine-pop sm:max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-3">
          <h2 className="text-base font-black text-[var(--engine-text)]">{t("socialPosts.video.editTitle")}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("common.cancel")}
            className="-m-1 flex h-11 w-11 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="engine-modal-body engine-scroll space-y-4 px-4 py-4">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              src={`${source.url}#t=${first.trimStart || 0.001}`}
              muted={muted}
              playsInline
              preload="auto"
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onLoadedData={(event) => {
                if (event.currentTarget.currentTime < trimStart) event.currentTarget.currentTime = trimStart;
              }}
              className="mx-auto max-h-[45dvh] w-full object-contain"
            />
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? t("socialPosts.video.pause") : t("socialPosts.video.play")}
              className="absolute inset-0 flex items-center justify-center"
            >
              {!playing && (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white">
                  <Play size={26} fill="currentColor" />
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMuted((value) => !value)}
              aria-pressed={muted}
              aria-label={muted ? t("socialPosts.video.unmute") : t("socialPosts.video.mute")}
              className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>

          <div role="tablist" className="flex gap-1 rounded-full bg-[var(--engine-surface-2)] p-1">
            {[
              { key: "trim", Icon: Scissors, label: t("socialPosts.video.trim") },
              { key: "cover", Icon: ImageIcon, label: t("socialPosts.video.cover") },
            ].map(({ key, Icon, label }) => {
              const TabIcon = Icon;
              return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => {
                  setMode(key);
                  pause();
                  if (videoRef.current) videoRef.current.currentTime = key === "cover" ? coverTime : trimStart;
                }}
                className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-bold ${
                  mode === key
                    ? "bg-[var(--engine-surface)] text-[var(--engine-accent)] shadow-[var(--engine-shadow-sm)]"
                    : "text-[var(--engine-text-muted)]"
                }`}
              >
                <TabIcon size={14} />
                {label}
              </button>
              );
            })}
          </div>

          {mode === "trim" ? (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-[var(--engine-text-muted)]">
                {t("socialPosts.video.start")} <span className="tabular-nums">{fmt(trimStart)}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, duration - VIDEO_LIMITS.minClipSeconds)}
                  step={0.1}
                  value={trimStart}
                  onChange={(event) => changeStart(event.target.value)}
                  className={rangeClass}
                />
              </label>
              <label className="block text-xs font-bold text-[var(--engine-text-muted)]">
                {t("socialPosts.video.end")} <span className="tabular-nums">{fmt(trimEnd)}</span>
                <input
                  type="range"
                  min={Math.min(duration, VIDEO_LIMITS.minClipSeconds)}
                  max={duration}
                  step={0.1}
                  value={trimEnd}
                  onChange={(event) => changeEnd(event.target.value)}
                  className={rangeClass}
                />
              </label>
              <p className="text-[11px] font-semibold tabular-nums text-[var(--engine-text-subtle)]">
                {t("socialPosts.video.clipLength", { length: fmt(clip), max: VIDEO_LIMITS.maxClipSeconds })}
              </p>
            </div>
          ) : (
            <label className="block text-xs font-bold text-[var(--engine-text-muted)]">
              {t("socialPosts.video.coverHint")} <span className="tabular-nums">{fmt(coverTime)}</span>
              <input
                type="range"
                min={trimStart}
                max={trimEnd}
                step={0.1}
                value={coverTime}
                onChange={(event) => changeCover(event.target.value)}
                className={rangeClass}
              />
            </label>
          )}

          {muted && (
            <p className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--engine-text-muted)]">
              {t("socialPosts.video.muteNotice")}
            </p>
          )}
        </div>

        <div className="engine-safe-bottom flex shrink-0 items-center justify-end gap-2 border-t border-[var(--engine-border)] p-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-full px-4 text-xs font-black uppercase tracking-widest text-[var(--engine-text-muted)]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--engine-accent)] px-5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {t("socialPosts.video.useVideo")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

