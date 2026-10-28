/**
 * Metadados de JPEG, sem navegador — a parte pura da limpeza de fotos.
 *
 * Foto de celular carrega EXIF: modelo do aparelho, data e hora, e quase
 * sempre a coordenada GPS de onde foi tirada (a casa de quem posta o carro na
 * garagem). O caminho normal (services/cleanImage.js) redesenha a foto num
 * canvas, e o JPEG que sai do canvas já não tem EXIF; ainda assim a saída
 * passa por aqui, para a garantia não depender do navegador. Quando o canvas
 * falha, este arquivo é o único filtro entre o arquivo cru e o Storage.
 *
 * O que sai:
 *   - APP1 (Exif e XMP — onde mora o GPS);
 *   - APP3 a APP13 e APP15 (Meta, Photoshop/IPTC, fabricantes);
 *   - APP2 que não seja perfil de cor (o MPF, índice de imagens extras);
 *   - comentários (COM);
 *   - tudo depois do fim da imagem (EOI): iPhone e Android penduram ali
 *     miniatura, mapa de profundidade e "gain map", cada um um JPEG com o
 *     próprio EXIF — inclusive GPS.
 *
 * O que fica: APP0 (JFIF), APP2 ICC_PROFILE (cor), APP14 Adobe (sem ele um
 * JPEG CMYK decodifica com as cores trocadas) e tudo o que é imagem.
 *
 * Orientação: a foto de celular costuma vir "deitada" com uma etiqueta EXIF
 * dizendo para girar. Quem redesenha no canvas já aplicou o giro e pede
 * `keepOrientation: false`. Quem só limpa o arquivo cru mantém a orientação
 * num EXIF mínimo, com essa única etiqueta — sem ela a foto subiria de lado.
 */

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const COM = 0xfe;
const TAG_ORIENTATION = 0x0112;

const ascii = (bytes, start, text) => {
  for (let k = 0; k < text.length; k += 1) {
    if (bytes[start + k] !== text.charCodeAt(k)) return false;
  }
  return true;
};

export const isJpegBytes = (bytes) =>
  Boolean(bytes) && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === SOI;

const isStandalone = (marker) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

/**
 * Lista os segmentos do arquivo, na ordem. Cada um: `{ marker, start, end }`
 * (o intervalo inclui o 0xFF do marcador). Dados de varredura (entre um SOS e
 * o marcador seguinte) viram `{ marker: "scan" }`. O que vem depois do EOI
 * vira `{ marker: "trailer" }`.
 */
export function listJpegSegments(bytes) {
  if (!isJpegBytes(bytes)) throw new Error("not-a-jpeg");
  const n = bytes.length;
  const segments = [{ marker: SOI, start: 0, end: 2 }];
  let i = 2;
  while (i < n) {
    if (bytes[i] !== 0xff) throw new Error("jpeg-malformed");
    // Bytes 0xFF repetidos antes de um marcador são enchimento.
    let m = i + 1;
    while (m < n && bytes[m] === 0xff) m += 1;
    if (m >= n) throw new Error("jpeg-malformed");
    const marker = bytes[m];
    const start = m - 1;

    if (marker === EOI) {
      segments.push({ marker, start, end: m + 1 });
      if (m + 1 < n) segments.push({ marker: "trailer", start: m + 1, end: n });
      return segments;
    }
    if (isStandalone(marker)) {
      segments.push({ marker, start, end: m + 1 });
      i = m + 1;
      continue;
    }
    if (m + 2 >= n) throw new Error("jpeg-malformed");
    const length = (bytes[m + 1] << 8) | bytes[m + 2];
    const end = m + 1 + length;
    if (length < 2 || end > n) throw new Error("jpeg-malformed");
    segments.push({ marker, start, end });
    i = end;

    if (marker === SOS) {
      // Dados comprimidos até o próximo marcador de verdade: 0xFF00 é um 0xFF
      // escapado e 0xFFD0–D7 são reinícios, ambos fazem parte da varredura.
      let j = i;
      while (j < n) {
        if (bytes[j] === 0xff && j + 1 < n) {
          const next = bytes[j + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            j += 2;
            continue;
          }
          if (next === 0xff) {
            j += 1;
            continue;
          }
          break;
        }
        j += 1;
      }
      if (j >= n) throw new Error("jpeg-malformed");
      segments.push({ marker: "scan", start: i, end: j });
      i = j;
    }
  }
  throw new Error("jpeg-malformed");
}

const payloadStart = (segment) => segment.start + 4;

const isExifApp1 = (bytes, segment) =>
  segment.marker === APP1 && ascii(bytes, payloadStart(segment), "Exif\0\0");

/** Orientação EXIF (1–8) de um APP1 Exif, ou null. */
function readOrientation(bytes, segment) {
  const tiff = payloadStart(segment) + 6;
  if (tiff + 8 > segment.end) return null;
  const little = ascii(bytes, tiff, "II");
  if (!little && !ascii(bytes, tiff, "MM")) return null;
  const u16 = (at) => (little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
  const u32 = (at) =>
    little
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
      : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  if (u16(tiff + 2) !== 42) return null;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > segment.end) return null;
  const count = u16(ifd);
  for (let k = 0; k < count; k += 1) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > segment.end) return null;
    if (u16(entry) === TAG_ORIENTATION) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** APP1 Exif com uma etiqueta só: a orientação. 36 bytes no arquivo. */
function orientationOnlyApp1(orientation) {
  return Uint8Array.from([
    0xff, APP1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF big-endian, IFD0 em 8
    0x00, 0x01, // uma entrada
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // sem próximo IFD
  ]);
}

const keepSegment = (bytes, segment) => {
  const { marker } = segment;
  if (marker === "trailer") return false;
  if (marker === COM) return false;
  if (marker === APP2) return ascii(bytes, payloadStart(segment), "ICC_PROFILE\0");
  if (marker === APP14) return ascii(bytes, payloadStart(segment), "Adobe");
  if (typeof marker === "number" && marker >= APP1 && marker <= 0xef) return false;
  return true;
};

/**
 * O mesmo JPEG sem metadados. Não decodifica nem recomprime: os bytes da
 * imagem saem idênticos. Lança se o arquivo não for JPEG válido — quem chama
 * não deve subir o original nesse caso.
 */
export function stripJpegMetadata(bytes, { keepOrientation = true } = {}) {
  const segments = listJpegSegments(bytes);
  let orientation = null;
  if (keepOrientation) {
    const exif = segments.find((segment) => isExifApp1(bytes, segment));
    orientation = exif ? readOrientation(bytes, exif) : null;
  }

  const parts = [];
  for (const segment of segments) {
    if (!keepSegment(bytes, segment)) continue;
    parts.push(bytes.subarray(segment.start, segment.end));
    // A orientação entra logo depois do JFIF (ou do início, se não houver).
    if (orientation && orientation !== 1 && (segment.marker === APP0 || (segment.marker === SOI && segments[1]?.marker !== APP0))) {
      parts.push(orientationOnlyApp1(orientation));
      orientation = null;
    }
  }

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Resumo para testes e diagnóstico: o que de metadado o arquivo carrega. */
export function describeJpegMetadata(bytes) {
  const segments = listJpegSegments(bytes);
  const exif = segments.filter((segment) => isExifApp1(bytes, segment));
  const hasTag = (segment, hi, lo) => {
    for (let k = segment.start; k < segment.end - 1; k += 1) {
      if ((bytes[k] === hi && bytes[k + 1] === lo) || (bytes[k] === lo && bytes[k + 1] === hi)) return true;
    }
    return false;
  };
  return {
    app1: segments.filter((segment) => segment.marker === APP1).length,
    exif: exif.length,
    exifBytes: exif.reduce((sum, segment) => sum + segment.end - segment.start, 0),
    // 0x8825 = ponteiro para o bloco GPS.
    gpsPointer: exif.some((segment) => hasTag(segment, 0x88, 0x25)),
    orientation: exif.length ? readOrientation(bytes, exif[0]) : null,
    comments: segments.filter((segment) => segment.marker === COM).length,
    otherApp: segments.filter((segment) => typeof segment.marker === "number" && segment.marker > APP1 && segment.marker <= 0xef).length,
    trailer: segments.some((segment) => segment.marker === "trailer"),
    markers: segments.map((segment) => segment.marker),
  };
}
