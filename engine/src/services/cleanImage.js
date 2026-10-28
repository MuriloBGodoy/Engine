import { isJpegBytes, stripJpegMetadata } from "./jpegMetadata.js";

/**
 * A única porta de foto do usuário para fora do aparelho.
 *
 * Toda imagem que sobe (garagem, post, avatar e capa, anúncio, evento, foto em
 * DM) passa por aqui: é desenhada num canvas — já na orientação certa — e
 * re-codificada em JPEG, o que descarta o EXIF (GPS, aparelho, data). A saída
 * ainda passa pelo filtro puro de services/jpegMetadata.js, para a garantia
 * não depender do navegador.
 *
 * Até 28/10/2026 o upload pulava a recompressão de JPEG pequeno (< 500 KB) e
 * subia o arquivo original, com a coordenada de onde a foto foi tirada.
 *
 * Orientação: `createImageBitmap(..., { imageOrientation: "from-image" })`
 * aplica o giro do EXIF antes de desenhar. Navegador sem esse suporte cai
 * para <img>, que nos navegadores atuais também desenha já girado (é o
 * `image-orientation: from-image`, padrão do CSS). O EXIF só some depois de
 * aplicado — nunca antes.
 */

// Blobs que já saíram daqui. Evita recomprimir (e perder qualidade) a mesma
// foto duas vezes, como no recorte da garagem seguido do upload.
const cleanBlobs = new WeakSet();
const markClean = (blob) => {
  cleanBlobs.add(blob);
  return blob;
};
export const isCleanImage = (blob) => Boolean(blob) && cleanBlobs.has(blob);

const toBlob = async (source) => {
  if (typeof source === "string") return (await fetch(source)).blob();
  return source;
};

const loadImageElement = (blob) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Imagem inválida."));
    };
    img.src = url;
  });

/** Decodifica já na orientação do EXIF. `close()` libera a memória. */
export async function decodeImage(source) {
  const blob = await toBlob(source);
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch {
      // Opção não suportada ou formato que só o <img> abre: tenta por ele.
    }
  }
  const img = await loadImageElement(blob);
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
}

/** Cabe na caixa sem distorcer e sem ampliar. */
export const fitWithin = (width, height, maxWidth, maxHeight = maxWidth) => {
  if (!width || !height) return { width: 0, height: 0 };
  const factor = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
};

/** Canvas do tamanho pedido, fundo branco (PNG transparente não vira preto). */
export function drawToCanvas(decoded, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(decoded.image, 0, 0, width, height);
  return canvas;
}

/**
 * Canvas → JPEG limpo. Os pixels do canvas já estão girados, então nenhuma
 * orientação é mantida (manter giraria a foto duas vezes).
 */
export function encodeCanvas(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("Não foi possível comprimir a imagem."));
          return;
        }
        try {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          resolve(markClean(new Blob([stripJpegMetadata(bytes, { keepOrientation: false })], { type: "image/jpeg" })));
        } catch (error) {
          reject(error);
        }
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * O caminho normal: decodifica girado, reduz para caber em
 * `maxWidth`×`maxHeight` e re-codifica em JPEG sem metadados.
 */
export async function reencodeImage(source, { maxWidth, maxHeight = maxWidth, quality }) {
  const decoded = await decodeImage(source);
  try {
    const size = fitWithin(decoded.width, decoded.height, maxWidth, maxHeight);
    return await encodeCanvas(drawToCanvas(decoded, size.width, size.height), quality);
  } finally {
    decoded.close();
  }
}

/**
 * Só tira os metadados, sem recomprimir — para JPEG que não passa pelo
 * canvas. Mantém a orientação num EXIF mínimo. Lança se não for JPEG.
 */
export async function stripJpegFile(source) {
  const blob = await toBlob(source);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isJpegBytes(bytes)) throw new Error("not-a-jpeg");
  return markClean(new Blob([stripJpegMetadata(bytes)], { type: "image/jpeg" }));
}

/**
 * Arquivo com nome a partir de um blob que JÁ saiu daqui (o recorte da
 * garagem). Blob de fora é recusado: marcar como limpo sem limpar seria furar
 * a garantia.
 */
export const cleanFileFrom = (blob, name) => {
  if (!isCleanImage(blob)) throw new Error("blob não passou pela limpeza");
  return markClean(new File([blob], name, { type: "image/jpeg" }));
};

export const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(blob);
  });

/**
 * Garantia final antes do Storage: o que não saiu daqui é limpo agora. JPEG
 * perde só os metadados; qualquer outro formato é redesenhado.
 */
export async function ensureCleanImage(payload, fallback = { maxWidth: 1600, quality: 0.82 }) {
  if (isCleanImage(payload)) return payload;
  try {
    return await stripJpegFile(payload);
  } catch {
    return reencodeImage(payload, fallback);
  }
}
