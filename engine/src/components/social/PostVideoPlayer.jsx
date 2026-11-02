import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Volume2, VolumeX } from "lucide-react";

// Som ligado vale para a sessão inteira, como no Instagram: quem ligou o som
// num vídeo não quer religar em cada um ao rolar.
let sessionSound = false;
const soundListeners = new Set();
const setSessionSound = (value) => {
  sessionSound = value;
  soundListeners.forEach((fn) => fn(value));
};

const saveData = () =>
  typeof navigator !== "undefined" && Boolean(navigator.connection?.saveData);
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Vídeo enviado no post, tocando só o trecho escolhido no editor.
 *
 * - `#t=início,fim` na URL faz o navegador já abrir no começo do corte; o
 *   `timeupdate` volta ao início ao passar do fim (laço).
 * - Começa sem som (regra dos navegadores para tocar sozinho). "Sem som" do
 *   autor é definitivo: o botão de som some.
 * - `autoPlay`: toca quando 60% dele está na tela e para ao sair. Com
 *   economia de dados ou "reduzir movimento", só toca com toque.
 * - `active` (Reels): quem manda é a lista, que sabe qual está na tela.
 *
 * O clique não sobe para o cartão (que abriria o post).
 */
export function PostVideoPlayer({ video, mode = "inline", active, autoPlay = true, className = "" }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(sessionSound);
  const [failed, setFailed] = useState(false);
  const start = Number(video?.trimStart) || 0;
  const end = Number(video?.trimEnd) || 0;
  const forcedMute = Boolean(video?.muted);
  const canAutoplay = autoPlay && !saveData() && !reducedMotion();

  useEffect(() => {
    soundListeners.add(setSound);
    return () => soundListeners.delete(setSound);
  }, []);

  // No feed, a visibilidade decide; nos Reels, a lista decide (`active`).
  useEffect(() => {
    if (active !== undefined) return undefined;
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.6),
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);

  const shouldPlay = active !== undefined ? active : canAutoplay && visible;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (shouldPlay) {
      if (element.currentTime < start || (end && element.currentTime >= end)) element.currentTime = start;
      element.play().catch(() => setPlaying(false));
    } else {
      element.pause();
    }
  }, [shouldPlay, start, end]);

  const onTimeUpdate = (event) => {
    const element = event.currentTarget;
    if (end && element.currentTime >= end - 0.05) {
      element.currentTime = start;
      if (!shouldPlay) element.pause();
    }
  };

  const toggle = (event) => {
    event.stopPropagation();
    const element = ref.current;
    if (!element) return;
    if (element.paused) {
      if (element.currentTime < start || (end && element.currentTime >= end)) element.currentTime = start;
      element.play().catch(() => setPlaying(false));
    } else {
      element.pause();
    }
  };

  const toggleSound = (event) => {
    event.stopPropagation();
    setSessionSound(!sound);
  };

  if (!video?.url) return null;

  const fragment = end ? `#t=${start},${end}` : start ? `#t=${start}` : "";
  const isReel = mode === "reel";
  // No feed, a mesma moldura das fotos: proporção do vídeo presa entre 4:5
  // (em pé) e 1,91:1 (deitado), preenchida com corte central — sem tarja
  // preta no vídeo vertical do celular. Nos Reels o vídeo é a tela inteira e
  // aparece inteiro.
  const ratio =
    video.width > 0 && video.height > 0 ? Math.min(Math.max(video.width / video.height, 4 / 5), 1.91) : 4 / 5;

  return (
    <div
      ref={wrapRef}
      onClick={(event) => event.stopPropagation()}
      className={`relative overflow-hidden bg-black ${isReel ? "h-full w-full" : "w-full"} ${className}`}
      style={isReel ? undefined : { aspectRatio: ratio }}
    >
      <video
        ref={ref}
        src={`${video.url}${fragment}`}
        poster={video.poster || undefined}
        muted={forcedMute || !sound}
        playsInline
        loop={false}
        preload={isReel || shouldPlay ? "auto" : "metadata"}
        onTimeUpdate={onTimeUpdate}
        onEnded={(event) => {
          event.currentTarget.currentTime = start;
          if (shouldPlay) event.currentTarget.play().catch(() => {});
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
        className={isReel ? "h-full w-full object-contain" : "h-full w-full object-cover"}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t("socialPosts.video.pause") : t("socialPosts.video.play")}
        className="absolute inset-0 flex items-center justify-center"
      >
        {!playing && !failed && (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white">
            <Play size={26} fill="currentColor" />
          </span>
        )}
        {failed && (
          <span className="mx-6 rounded-xl bg-black/70 px-3 py-2 text-xs font-semibold text-white">
            {t("socialPosts.video.cantPlay")}
          </span>
        )}
      </button>

      {forcedMute ? (
        <span
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
          title={t("socialPosts.video.noSound")}
          aria-label={t("socialPosts.video.noSound")}
        >
          <VolumeX size={16} />
        </span>
      ) : (
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={sound}
          aria-label={sound ? t("socialPosts.video.mute") : t("socialPosts.video.unmute")}
          className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"
        >
          {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
      )}
    </div>
  );
}
