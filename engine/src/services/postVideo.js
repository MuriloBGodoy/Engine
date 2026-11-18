import { must, supabase } from "./supabase";
import { uploadToStorage } from "./photos";
import { captureError } from "./observability";
import { podeRecodificar, precisaRecodificar, recodificarTrecho } from "./videoEncode";

/**
 * Vídeo enviado no post (não só link do YouTube).
 *
 * Tudo no navegador, sem transcodificar no servidor:
 *   - quando o aparelho sabe (ver `videoEncode.js`), o trecho escolhido é
 *     RECODIFICADO antes de subir: 720p, só o pedaço, com o som. 120 MB de
 *     1080p viram uns 20 MB. Quando não sabe, o arquivo sobe como veio e o
 *     corte continua sendo só metadado — o player toca o trecho certo.
 *   - "sem som" e capa seguem sendo metadados do post.
 *   - a capa é um quadro do vídeo desenhado num canvas e salvo como JPEG no
 *     bucket de fotos (passa pela mesma limpeza das fotos).
 *
 * O banco confere caminho e números (`community_goals_social_stamp`,
 * migration 20261102150000): vídeo fora da pasta do dono some do post.
 */

export const VIDEO_BUCKET = "videos";
export const VIDEO_LIMITS = {
  // O bucket recusa acima disso (file_size_limit da migration). 120 MB é o
  // que faz caber a promessa da tela: 60 s gravados em 1080p por um celular
  // Android dão 100–130 MB, e com o teto antigo de 50 MB quase nenhum vídeo
  // de carro passava — a tela pedia "grave em resolução menor", que ninguém
  // faz. Migration 20261113200000.
  maxBytes: 120 * 1024 * 1024,
  // O teto só vale para quem vai subir o arquivo COMO ESTÁ. Quem recodifica
  // no aparelho (`videoEncode.js`) manda um arquivo de 15–25 MB no lugar, e
  // aí recusar o original por tamanho seria recusar um vídeo que caberia.
  // 400 MB é onde isso para de valer a pena: é 3 minutos de 4K, que é o
  // limite de duração da origem de qualquer forma.
  maxSourceBytes: 400 * 1024 * 1024,
  // Arquivo de origem: mais que isso seria guardar minutos para tocar 60 s.
  maxSourceSeconds: 180,
  maxClipSeconds: 60,
  minClipSeconds: 1,
};
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const UPLOAD_TIMEOUT_MS = 180000;

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error("video-upload-timeout")), ms)),
  ]);

const videoError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

/** Código de erro (`socialPosts.videoErrors.*`) ou "" se o arquivo serve. */
export const videoFileProblem = (file) => {
  if (!file) return "notVideo";
  const type = String(file.type || "").toLowerCase();
  // Alguns Androids mandam o tipo vazio: a extensão decide.
  const byName = /\.(mp4|m4v|mov|webm)$/i.test(file.name || "");
  if (type && !VIDEO_TYPES.includes(type) && !(type.startsWith("video/") && byName)) return "format";
  if (!type && !byName) return "notVideo";
  const teto = podeRecodificar() ? VIDEO_LIMITS.maxSourceBytes : VIDEO_LIMITS.maxBytes;
  if (file.size > teto) return "tooBig";
  return "";
};

const contentTypeFor = (file) => {
  const type = String(file.type || "").toLowerCase();
  if (VIDEO_TYPES.includes(type)) return type;
  if (/\.mov$/i.test(file.name || "")) return "video/quicktime";
  if (/\.webm$/i.test(file.name || "")) return "video/webm";
  return "video/mp4";
};

const extensionFor = (contentType) =>
  contentType === "video/quicktime" ? "mov" : contentType === "video/webm" ? "webm" : "mp4";

/**
 * Duração e tamanho lidos pelo próprio navegador. Rejeita o que ele não
 * consegue abrir (HEVC num Chrome sem suporte, arquivo corrompido): se quem
 * envia não consegue tocar, quem assiste provavelmente também não.
 */
export const probeVideo = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      fn(value);
    };
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      finish(reject, videoError("unreadable"));
    }, 15000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      if (!Number.isFinite(duration) || duration <= 0) {
        URL.revokeObjectURL(url);
        finish(reject, videoError("unreadable"));
        return;
      }
      finish(resolve, {
        url,
        duration,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      finish(reject, videoError("unreadable"));
    };
    video.src = url;
  });

/** Espera o `<video>` chegar no tempo pedido (com teto, para não travar). */
export const seekTo = (video, time) =>
  new Promise((resolve) => {
    if (!video) {
      resolve();
      return;
    }
    if (Math.abs(video.currentTime - time) < 0.01 && video.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => {
      video.removeEventListener("seeked", done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, 3000);
    video.addEventListener("seeked", done);
    video.currentTime = time;
  });

/** Quadro atual do `<video>` como JPEG (lado maior até 1080 px). */
export const captureFrame = async (video, maxSide = 1080) => {
  const width = video?.videoWidth || 0;
  const height = video?.videoHeight || 0;
  if (!width || !height) return null;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82));
};

/** Recorte válido: dentro do vídeo, entre 1 e 60 s. */
export const clampTrim = (duration, start, end) => {
  const total = Math.max(0, Number(duration) || 0);
  let trimStart = Math.max(0, Math.min(Number(start) || 0, total));
  let trimEnd = Math.max(0, Math.min(Number(end) || total, total));
  if (trimEnd - trimStart < VIDEO_LIMITS.minClipSeconds) {
    trimEnd = Math.min(total, trimStart + VIDEO_LIMITS.minClipSeconds);
    trimStart = Math.max(0, trimEnd - VIDEO_LIMITS.minClipSeconds);
  }
  if (trimEnd - trimStart > VIDEO_LIMITS.maxClipSeconds) trimEnd = trimStart + VIDEO_LIMITS.maxClipSeconds;
  return { trimStart: Math.round(trimStart * 100) / 100, trimEnd: Math.round(trimEnd * 100) / 100 };
};

/**
 * Sobe o vídeo e a capa e devolve o objeto que vai no post
 * (`data.video`). `edit` = { duration, trimStart, trimEnd, muted, width,
 * height, posterBlob }.
 */
export const uploadPostVideo = async (file, edit, { userId, onEncodeProgress } = {}) => {
  if (!userId) throw videoError("signedOut");
  const problem = videoFileProblem(file);
  if (problem) throw videoError(problem);

  const pedido = clampTrim(edit.duration, edit.trimStart, edit.trimEnd);
  let corpo = file;
  let recodificado = null;

  // A recodificação é tentativa, não etapa: falhou, o original sobe.
  if (precisaRecodificar(file, { ...edit, duration: edit.duration }, pedido)) {
    recodificado = await recodificarTrecho(file, {
      trimStart: pedido.trimStart,
      trimEnd: pedido.trimEnd,
      muted: edit.muted,
      onProgress: onEncodeProgress,
    }).catch(() => null);
    if (recodificado) corpo = recodificado.blob;
  }

  // Original grande demais E a recodificação não rolou: aí é tooBig de
  // verdade, e é melhor dizer agora do que gastar o 4G da pessoa para o
  // bucket recusar no fim.
  if (!recodificado && corpo.size > VIDEO_LIMITS.maxBytes) throw videoError("tooBig");

  // Fim do preparo, inclusive quando não houve recodificação nenhuma: é este
  // aviso que faz a tela trocar "preparando" por "enviando".
  onEncodeProgress?.(1);

  const contentType = recodificado ? recodificado.type : contentTypeFor(file);
  const stamp = `${Date.now()}-${crypto.randomUUID()}`;
  const path = `users/${userId}/posts/${stamp}.${extensionFor(contentType)}`;
  /* O ENVIO DO VÍDEO NUNCA CHEGOU AO FIM EM PRODUÇÃO.
   *
   * Em 17/11/2026 o bucket `videos` estava vazio — nenhum vídeo, de ninguém,
   * desde que o recurso existe (a migration 20261113200000 já dizia o mesmo
   * em 13/11). A capa, que sobe logo DEPOIS desta linha, estava lá: ou seja,
   * a tentativa passa por aqui e o arquivo não fica.
   *
   * Sem o erro do aparelho de quem postou não dá para saber onde quebra —
   * política do Storage, tipo recusado, tempo esgotado no 4G, recodificação
   * que devolve um blob vazio. Então o erro passa a ser RELATADO com o que
   * importa para distinguir esses casos, em vez de virar só "upload" na tela.
   *
   * Nada aqui muda o que a pessoa vê: o erro continua subindo como antes. */
  const envio = await withTimeout(
    supabase.storage.from(VIDEO_BUCKET).upload(path, corpo, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    }),
    UPLOAD_TIMEOUT_MS,
  ).catch((erro) => {
    captureError(erro, {
      passo: "upload-video",
      bucket: VIDEO_BUCKET,
      contentType,
      bytes: corpo?.size || 0,
      recodificado: Boolean(recodificado),
    });
    throw erro;
  });

  if (envio?.error) {
    captureError(envio.error, {
      passo: "upload-video-recusado",
      bucket: VIDEO_BUCKET,
      contentType,
      bytes: corpo?.size || 0,
      recodificado: Boolean(recodificado),
      status: envio.error.statusCode || envio.error.status || "",
    });
  }
  must(envio);

  let posterPath = "";
  if (edit.posterBlob) {
    try {
      posterPath = `users/${userId}/posts/${stamp}-cover.jpg`;
      await uploadToStorage(posterPath, edit.posterBlob);
    } catch (error) {
      // Sem capa o player mostra o primeiro quadro: não vale perder o post.
      console.warn("[vídeo] capa não subiu.", error);
      posterPath = "";
    }
  }

  // Recodificado, o arquivo JÁ é o trecho: o corte volta para 0..duração e o
  // tamanho é o de destino. Sem isso o player cortaria de novo o que já
  // estava cortado e tocaria os primeiros segundos do trecho só.
  if (recodificado) {
    return {
      path,
      ...(posterPath ? { posterPath } : {}),
      duration: recodificado.duration,
      trimStart: 0,
      trimEnd: recodificado.duration,
      muted: Boolean(edit.muted),
      width: recodificado.width,
      height: recodificado.height,
    };
  }

  const { trimStart, trimEnd } = pedido;
  return {
    path,
    ...(posterPath ? { posterPath } : {}),
    duration: Math.round((Number(edit.duration) || 0) * 100) / 100,
    trimStart,
    trimEnd,
    muted: Boolean(edit.muted),
    width: Math.round(Number(edit.width) || 0),
    height: Math.round(Number(edit.height) || 0),
  };
};

const publicUrl = (bucket, path) =>
  path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : "";

/**
 * O vídeo do post pronto para a tela: caminhos viram URLs. Qualquer coisa
 * fora do formato vira `null` (post sem vídeo), nunca um player quebrado.
 */
export const normalizePostVideo = (video) => {
  if (!video || typeof video !== "object" || !video.path) return null;
  const duration = Number(video.duration) || 0;
  const trimStart = Math.max(0, Number(video.trimStart) || 0);
  const trimEnd = Number(video.trimEnd) > trimStart ? Number(video.trimEnd) : duration || trimStart + VIDEO_LIMITS.maxClipSeconds;
  return {
    path: String(video.path),
    posterPath: String(video.posterPath || ""),
    url: publicUrl(VIDEO_BUCKET, String(video.path)),
    poster: publicUrl("photos", String(video.posterPath || "")),
    duration,
    trimStart,
    trimEnd,
    muted: Boolean(video.muted),
    width: Number(video.width) || 0,
    height: Number(video.height) || 0,
  };
};

/** Apagar o post leva o arquivo junto (melhor esforço: o post já saiu). */
export const removePostVideoFiles = async (video) => {
  if (!video?.path) return;
  await supabase.storage.from(VIDEO_BUCKET).remove([video.path]).catch(() => {});
  if (video.posterPath) await supabase.storage.from("photos").remove([video.posterPath]).catch(() => {});
};
