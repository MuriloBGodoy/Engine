/**
 * Geometria pura do editor de foto do chat (components/ImageEditor.jsx).
 *
 * Até 30/10/2026 o botão de girar desenhava a foto girada dentro do MESMO
 * canvas: a 90°/270° uma foto deitada 3:2 era espremida num quadro 3:2 de pé
 * trocado — saía achatada no preview e na imagem exportada. Agora o canvas
 * troca largura e altura junto com a foto, e o que já foi desenhado (traços e
 * textos) gira com ela.
 */

/** Ângulo normalizado em 0, 90, 180 ou 270. */
export const normalizeQuarterTurn = (deg) => ((Math.round(deg / 90) * 90) % 360 + 360) % 360;

/** A foto fica de lado (largura e altura trocadas) nesse ângulo? */
export const isSideways = (deg) => normalizeQuarterTurn(deg) % 180 !== 0;

/**
 * Tamanho do canvas para a foto `imageWidth`×`imageHeight` girada `rotation`,
 * cabendo em `maxWidth`×`maxHeight` sem distorcer. Inteiro, porque canvas.width
 * trunca: o tamanho guardado no estado tem que ser o mesmo do canvas.
 */
export function fitEditorCanvas(imageWidth, imageHeight, rotation, maxWidth, maxHeight) {
  const sideways = isSideways(rotation);
  const w = sideways ? imageHeight : imageWidth;
  const h = sideways ? imageWidth : imageHeight;
  const factor = Math.min(maxWidth / w, maxHeight / h);
  return {
    width: Math.max(1, Math.round(w * factor)),
    height: Math.max(1, Math.round(h * factor)),
  };
}

/**
 * Leva um ponto do canvas antigo (`from`, antes do giro de 90° horário) para o
 * canvas novo (`to`). Normaliza antes de girar, então a mudança de escala do
 * novo encaixe na tela já vem junto.
 */
export function rotatePointClockwise(x, y, from, to) {
  const nx = x / from.width;
  const ny = y / from.height;
  return { x: (1 - ny) * to.width, y: nx * to.height };
}

/** Fator de escala entre o canvas antigo e o novo depois de 90°. */
export const quarterTurnScale = (from, to) => to.width / from.height;
