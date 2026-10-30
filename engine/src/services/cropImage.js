/**
 * Recorte com rotação, do jeito que o react-easy-crop mede.
 *
 * O `croppedAreaPixels` que o Cropper devolve NÃO está nas coordenadas da
 * foto original: está nas coordenadas da caixa que envolve a foto JÁ GIRADA
 * (a 90° ela vira de pé, e x/y contam a partir do canto dessa caixa). Até
 * 30/10/2026 o ImageCropper recortava a foto original com esses números e só
 * depois girava o resultado em volta do centro — a 90°/270° num quadro 16:9 a
 * foto saía deitada, cortada nas pontas e com faixas pretas; a 180° pegava o
 * pedaço do lado oposto ao que o preview mostrava. Garagem e Clubes usam o
 * mesmo componente, então os dois sofriam.
 *
 * Aqui o recorte é uma transformação só, sem canvas intermediário do tamanho
 * da foto girada (uma foto de 12 MP girada em ângulo livre pediria ~100 MB):
 *
 *   saída = escala · translada(-área) · translada(centro da caixa) · gira · translada(-centro da foto)
 *
 * Orientação EXIF: a imagem passada deve ser carregada pelo MESMO caminho do
 * preview (um <img>), cujo naturalWidth/Height já vem girado pelo
 * `image-orientation: from-image` do navegador — e o drawImage desenha
 * girado igual. Assim o que o Cropper mediu e o que é desenhado concordam
 * em qualquer navegador, tenha ele aplicado o EXIF ou não.
 *
 * Sem React e sem DOM além do canvas que recebe: dá para testar no navegador
 * sem subir o app.
 */

const toRadians = (deg) => (deg * Math.PI) / 180;

/** Caixa que envolve um retângulo w×h girado `deg` graus (mesma fórmula do react-easy-crop). */
export function rotatedBoundingBox(width, height, deg) {
  const rad = toRadians(deg);
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

/** Tamanho final: o da área, reduzido para caber em `maxSize` no lado maior. */
export function croppedOutputSize(area, maxSize = 1600) {
  const scale = Math.min(1, maxSize / Math.max(area.width, area.height));
  return {
    width: Math.max(1, Math.round(area.width * scale)),
    height: Math.max(1, Math.round(area.height * scale)),
    scale,
  };
}

/**
 * Desenha em `canvas` exatamente a área do preview.
 * `image` é um <img> (ou bitmap) de `imageWidth`×`imageHeight`; `area` é o
 * croppedAreaPixels do Cropper; `rotation` em graus, qualquer valor.
 * Fora da foto (com restrictPosition={false} dá para afastar) fica preto,
 * que é o fundo do preview.
 */
export function drawCroppedImage(canvas, image, imageWidth, imageHeight, area, rotation = 0, maxSize = 1600) {
  const { width, height, scale } = croppedOutputSize(area, maxSize);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";

  const box = rotatedBoundingBox(imageWidth, imageHeight, rotation);
  ctx.scale(width / area.width, height / area.height);
  ctx.translate(-area.x, -area.y);
  ctx.translate(box.width / 2, box.height / 2);
  ctx.rotate(toRadians(rotation));
  ctx.translate(-imageWidth / 2, -imageHeight / 2);
  ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return { width, height, scale };
}
