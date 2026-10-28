import { reencodeImage } from "./cleanImage.js";

/**
 * Foto da conversa (DM): reduzida e re-codificada pela limpeza comum de
 * services/cleanImage.js — girada certo e sem EXIF (GPS). Fica no registro da
 * mensagem como data URL.
 *
 * GIF enviado pela pessoa segue como veio: redesenhar mataria a animação, e
 * GIF não carrega EXIF.
 */
export async function compressImage(imageUrl, maxWidth = 1600, quality = 0.8, isGif = false) {
  if (isGif) return (await fetch(imageUrl)).blob();
  return reencodeImage(imageUrl, { maxWidth, quality });
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
