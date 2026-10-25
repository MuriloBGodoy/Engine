import { must, supabase } from "./supabase";

/**
 * Upload de fotos do usuário.
 *
 * A foto vai para o Storage do Supabase (bucket `photos`, leitura pública,
 * cada pessoa escreve só em `users/<uid>/...`) e só a URL fica no banco.
 * Foto em base64 dentro do registro era o que deixava o feed pesado no
 * Firebase — 172 KB por abertura com seis usuários.
 *
 * Se a subida falhar (rede caindo no meio), cai para uma versão comprimida em
 * data URL — pequena o suficiente para caber no registro.
 */
const BUCKET = "photos";
const UPLOAD_TIMEOUT_MS = 20000;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
// Foto que VAI para o Storage: redimensionada e reencodada para JPEG. O
// arquivo cru do celular (3–6 MB) esgotaria 1 GB grátis em ~250 fotos;
// a 1600px/0.82 uma foto nítida fica em ~150–300 KB e cabem dezenas de
// milhares. Também deixa o carregamento no mobile muito mais leve.
const UPLOAD_MAX_SIZE = 1600;
const UPLOAD_QUALITY = 0.82;
// Fallback (subida falhou): a foto cai comprimida DENTRO do registro, e o
// app corta o registro em ~1 MiB. Com até 4 fotos por carro, cada uma
// precisa ficar na casa das dezenas de KB — daí ser bem menor/mais agressivo.
const FALLBACK_MAX_SIZE = 900;
const FALLBACK_QUALITY = 0.6;

const withUploadTimeout = (promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(
        () => reject(new Error("upload demorou demais")),
        UPLOAD_TIMEOUT_MS,
      );
    }),
  ]);

// Desenha o arquivo num canvas redimensionado e entrega o resultado no
// formato pedido: "blob" (para upload no Storage) ou "dataURL" (fallback no
// registro). Centraliza a leitura/redimensionamento das duas rotas.
const renderCompressed = (file, { maxSize, quality, output }) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Imagem inválida."));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Não foi possível preparar a imagem."));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        if (output === "blob") {
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(new Error("Não foi possível comprimir a imagem.")),
            "image/jpeg",
            quality,
          );
          return;
        }

        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

// Fallback pequeno para caber no registro (data URL base64).
export const compressImageFile = (file) =>
  renderCompressed(file, {
    maxSize: FALLBACK_MAX_SIZE,
    quality: FALLBACK_QUALITY,
    output: "dataURL",
  });

/**
 * A foto como ela deve subir para o Storage: no máximo 1600px, JPEG 0.82
 * (~150–300 KB). Sempre, mesmo quando o arquivo já é pequeno — foto crua de
 * celular (3–6 MB) no 4G é o que fazia o envio estourar o tempo.
 */
export const compressPhotoForUpload = (file) =>
  renderCompressed(file, {
    maxSize: UPLOAD_MAX_SIZE,
    quality: UPLOAD_QUALITY,
    output: "blob",
  });

export const isImageFile = (file) => Boolean(file?.type?.startsWith("image/"));
export const isFileTooBig = (file) => (file?.size || 0) > MAX_FILE_BYTES;

/**
 * Sobe um arquivo (ou Blob) para o bucket de fotos e devolve a URL pública.
 * O caminho tem que começar por `users/<uid do logado>/` — é a única pasta em
 * que o banco deixa cada pessoa escrever.
 */
export const uploadToStorage = async (path, payload, contentType) => {
  must(
    await supabase.storage.from(BUCKET).upload(path, payload, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    }),
  );
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
};

/**
 * Imagem que já foi reduzida no navegador (data URI, como o avatar e a capa do
 * perfil) vai para o Storage e volta como URL. Se a subida falhar, devolve o
 * próprio data URI: a foto ainda funciona, só pesa mais no banco.
 */
export const storeDataUri = async (dataUri, { userId, folder }) => {
  if (!userId || !String(dataUri || "").startsWith("data:image/")) return dataUri;
  try {
    const blob = await (await fetch(dataUri)).blob();
    const path = `users/${userId}/${folder}/${Date.now()}-${crypto.randomUUID()}.jpg`;
    return await withUploadTimeout(uploadToStorage(path, blob, blob.type || "image/jpeg"));
  } catch (error) {
    console.warn("[photos] Storage indisponível, mantendo a imagem no registro.", error);
    return dataUri;
  }
};

export const uploadUserPhoto = async (file, { userId, folder }) => {
  if (!isImageFile(file)) throw new Error("Arquivo não é uma imagem.");
  if (isFileTooBig(file)) throw new Error("Imagem maior que 6 MB.");

  if (userId) {
    const safeName = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `users/${userId}/${folder}/${Date.now()}-${crypto.randomUUID()}-${safeName}.jpg`;

    try {
      let payload = file;
      let contentType = file.type;
      const isSmallJpeg = file.type === "image/jpeg" && file.size < 500 * 1024;

      if (!isSmallJpeg) {
        try {
          payload = await renderCompressed(file, {
            maxSize: UPLOAD_MAX_SIZE,
            quality: UPLOAD_QUALITY,
            output: "blob",
          });
          contentType = "image/jpeg";
        } catch (compressError) {
          console.warn(
            "[photos] Falha ao comprimir, subindo original.",
            compressError,
          );
        }
      }

      return await withUploadTimeout(uploadToStorage(path, payload, contentType));
    } catch (error) {
      console.warn("[photos] Storage indisponível, comprimindo local.", error);
    }
  }

  return compressImageFile(file);
};
