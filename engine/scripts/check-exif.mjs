/**
 * Trava da limpeza de metadados das fotos.
 *
 *   npm run check:exif
 *
 * Por que existe: até 28/10/2026 o upload pulava a recompressão de JPEG
 * pequeno e subia o arquivo original — com o EXIF, e nele a coordenada GPS de
 * onde a foto foi tirada (quase sempre a garagem de casa). Hoje toda foto é
 * redesenhada no canvas (services/cleanImage.js) e a saída ainda passa pelo
 * filtro puro de services/jpegMetadata.js. É esse filtro que se testa aqui,
 * sem navegador: um JPEG montado com EXIF+GPS, XMP, comentário, índice MPF e
 * uma segunda imagem pendurada depois do fim (como fazem iPhone e Android)
 * entra, e não pode sair nada disso.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const { stripJpegMetadata, describeJpegMetadata, listJpegSegments, isJpegBytes } = await import(
  pathToFileURL(path.join(ROOT, "src/services/jpegMetadata.js")).href
);

let falhas = 0;
const check = (nome, ok, detalhe = "") => {
  if (ok) console.log(`  ok   ${nome}`);
  else {
    falhas += 1;
    console.log(`  FALHA ${nome}${detalhe ? `\n         ${detalhe}` : ""}`);
  }
};

// ---------------------------------------------------------------------------
// Montagem do JPEG de teste
// ---------------------------------------------------------------------------

const bytes = (...parts) => Uint8Array.from(parts.flat());
const text = (value) => [...Buffer.from(value, "latin1")];
const u16be = (value) => [(value >> 8) & 0xff, value & 0xff];
const u32be = (value) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const u16le = (value) => [value & 0xff, (value >> 8) & 0xff];
const u32le = (value) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
const segment = (marker, payload) => [0xff, marker, ...u16be(payload.length + 2), ...payload];

/**
 * APP1 Exif como o de um celular: IFD0 com fabricante, modelo, orientação e
 * ponteiro para o bloco GPS; o bloco GPS com latitude e longitude.
 */
const exifApp1 = ({ little = false, orientation = 6 } = {}) => {
  const w16 = little ? u16le : u16be;
  const w32 = little ? u32le : u32be;
  const make = text("Apple\0");
  const model = text("iPhone 15 Pro\0");
  // Layout (offsets a partir do início do TIFF):
  //   0   cabeçalho (8)
  //   8   IFD0: 4 entradas (2 + 48 + 4 = 54) -> termina em 62
  //   62  textos (make, model)
  //   ... IFD GPS: 2 entradas (2 + 24 + 4 = 30)
  //   ... rationals de lat/long (2 x 24)
  const ifd0 = 8;
  const textAt = ifd0 + 2 + 4 * 12 + 4;
  const makeAt = textAt;
  const modelAt = makeAt + make.length;
  const gpsAt = modelAt + model.length;
  const ratAt = gpsAt + 2 + 2 * 12 + 4;
  const entry = (tag, type, count, value) => [...w16(tag), ...w16(type), ...w32(count), ...value];
  const short = (value) => [...w16(value), 0, 0];
  const tiff = [
    ...(little ? text("II") : text("MM")), ...w16(42), ...w32(ifd0),
    ...w16(4),
    ...entry(0x010f, 2, make.length, w32(makeAt)),
    ...entry(0x0110, 2, model.length, w32(modelAt)),
    ...entry(0x0112, 3, 1, short(orientation)),
    ...entry(0x8825, 4, 1, w32(gpsAt)),
    ...w32(0),
    ...make, ...model,
    ...w16(2),
    ...entry(0x0002, 5, 3, w32(ratAt)),
    ...entry(0x0004, 5, 3, w32(ratAt + 24)),
    ...w32(0),
    // -23° 33' 1" / -46° 38' 2" (São Paulo): numerador/denominador
    ...w32(23), ...w32(1), ...w32(33), ...w32(1), ...w32(1), ...w32(1),
    ...w32(46), ...w32(1), ...w32(38), ...w32(1), ...w32(2), ...w32(1),
  ];
  return segment(0xe1, [...text("Exif\0\0"), ...tiff]);
};

const jfif = segment(0xe0, [...text("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const xmp = segment(0xe1, text('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>23,33.01S</exif:GPSLatitude></x:xmpmeta>'));
const icc = segment(0xe2, [...text("ICC_PROFILE\0"), 1, 1, ...text("perfil-de-cor")]);
const mpf = segment(0xe2, [...text("MPF\0"), ...text("indice-de-imagens")]);
const photoshop = segment(0xed, text("Photoshop 3.0\0IPTC cidade: Sao Paulo"));
const adobe = segment(0xee, [...text("Adobe"), 0, 100, 0, 0, 0, 0, 1]);
const comment = segment(0xfe, text("tirada na rua X, 123"));
const dqt = segment(0xdb, [0, ...new Array(64).fill(1)]);
const sof = segment(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]);
const dht = segment(0xc4, [0, ...new Array(16).fill(0)]);
const sos = segment(0xda, [1, 1, 0, 0, 63, 0]);
// Varredura com 0xFF escapado (FF 00) e marcadores de reinício (FF D0..D7):
// fazem parte dos dados e não podem cortar o arquivo.
const scan = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0xff, 0x00, 0xff, 0xd7, 0x9a];
const eoi = [0xff, 0xd9];
// O que celular pendura depois do EOI: outra imagem, com EXIF próprio.
const trailer = [0xff, 0xd8, ...exifApp1({ orientation: 1 }), ...eoi];

const phonePhoto = bytes(
  [0xff, 0xd8], jfif, exifApp1(), xmp, icc, mpf, photoshop, adobe, comment,
  dqt, sof, dht, sos, scan, eoi, trailer,
);
const imageOnly = (input) =>
  listJpegSegments(input)
    .filter((s) => [0xdb, 0xc0, 0xc4, 0xda, "scan"].includes(s.marker))
    .map((s) => Buffer.from(input.subarray(s.start, s.end)).toString("hex"))
    .join("|");

// ---------------------------------------------------------------------------

console.log("\nfoto de celular de entrada");
const antes = describeJpegMetadata(phonePhoto);
check("o arquivo de teste tem EXIF com GPS (senão o teste não prova nada)", antes.exif === 1 && antes.gpsPointer, JSON.stringify(antes));
check("e orientação 6 (deitada)", antes.orientation === 6);
check("e XMP, comentário, MPF, Photoshop e imagem pendurada", antes.app1 === 2 && antes.comments === 1 && antes.trailer && antes.otherApp >= 3);

console.log("\ndepois do canvas (keepOrientation: false)");
const canvas = stripJpegMetadata(phonePhoto, { keepOrientation: false });
const dc = describeJpegMetadata(canvas);
check("nenhum APP1 (nem Exif, nem XMP)", dc.app1 === 0, JSON.stringify(dc));
check("nenhum GPS em lugar nenhum do arquivo", !Buffer.from(canvas).includes(Buffer.from([0x88, 0x25])) && !Buffer.from(canvas).includes(Buffer.from("GPSLatitude")));
check("nem fabricante e modelo", !Buffer.from(canvas).includes(Buffer.from("iPhone")) && !Buffer.from(canvas).includes(Buffer.from("Apple")));
check("sem comentário", dc.comments === 0 && !Buffer.from(canvas).includes(Buffer.from("rua X")));
check("sem imagem pendurada depois do fim", !dc.trailer && canvas[canvas.length - 2] === 0xff && canvas[canvas.length - 1] === 0xd9);
check("sem MPF nem Photoshop/IPTC", !Buffer.from(canvas).includes(Buffer.from("MPF\0")) && !Buffer.from(canvas).includes(Buffer.from("IPTC")));
check("perfil de cor e Adobe ficam", Buffer.from(canvas).includes(Buffer.from("ICC_PROFILE")) && Buffer.from(canvas).includes(Buffer.from("Adobe")));
check("JFIF fica, logo depois do início", dc.markers[0] === 0xd8 && dc.markers[1] === 0xe0);
check("bytes da imagem idênticos (inclusive FF00 e reinícios)", imageOnly(canvas) === imageOnly(phonePhoto));
check("continua JPEG válido", isJpegBytes(canvas) && listJpegSegments(canvas).at(-1).marker === 0xd9);

console.log("\narquivo cru, sem canvas (orientação mantida)");
for (const little of [false, true]) {
  const cru = bytes([0xff, 0xd8], jfif, exifApp1({ little }), comment, dqt, sof, dht, sos, scan, eoi, trailer);
  const limpo = stripJpegMetadata(cru);
  const dl = describeJpegMetadata(limpo);
  const ordem = little ? "little-endian" : "big-endian";
  check(`${ordem}: sobra um EXIF só com a orientação`, dl.exif === 1 && dl.orientation === 6 && dl.exifBytes === 36, JSON.stringify(dl));
  check(`${ordem}: sem GPS, fabricante, modelo nem comentário`,
    !dl.gpsPointer && !Buffer.from(limpo).includes(Buffer.from("iPhone")) && dl.comments === 0 && !dl.trailer);
  check(`${ordem}: imagem idêntica`, imageOnly(limpo) === imageOnly(cru));
}
const reta = stripJpegMetadata(bytes([0xff, 0xd8], jfif, exifApp1({ orientation: 1 }), dqt, sof, dht, sos, scan, eoi));
check("orientação 1 (normal) não precisa de EXIF nenhum", describeJpegMetadata(reta).app1 === 0);
const semJfif = stripJpegMetadata(bytes([0xff, 0xd8], exifApp1(), dqt, sof, dht, sos, scan, eoi));
check("sem JFIF, a orientação entra logo depois do início", describeJpegMetadata(semJfif).markers[1] === 0xe1 && describeJpegMetadata(semJfif).orientation === 6);

console.log("\no que já está limpo não muda");
const jaLimpo = bytes([0xff, 0xd8], jfif, dqt, sof, dht, sos, scan, eoi);
check("JPEG de canvas sai byte a byte igual", Buffer.from(stripJpegMetadata(jaLimpo, { keepOrientation: false })).equals(Buffer.from(jaLimpo)));
const duasPassadas = stripJpegMetadata(stripJpegMetadata(phonePhoto));
check("limpar duas vezes dá o mesmo que uma", Buffer.from(duasPassadas).equals(Buffer.from(stripJpegMetadata(phonePhoto))));

console.log("\narquivo que não é JPEG não passa calado");
const lanca = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
check("PNG é recusado (quem chama redesenha em vez de subir cru)", lanca(() => stripJpegMetadata(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))));
check("JPEG cortado no meio é recusado", lanca(() => stripJpegMetadata(phonePhoto.subarray(0, 40))));
check("JPEG sem fim (varredura truncada) é recusado", lanca(() => stripJpegMetadata(bytes([0xff, 0xd8], jfif, sos, scan))));

console.log(falhas ? `\n${falhas} falha(s)\n` : "\ntudo verde\n");
process.exit(falhas ? 1 : 0);
