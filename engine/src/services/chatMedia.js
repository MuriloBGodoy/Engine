import { must, supabase } from "./supabase";
import { VIDEO_LIMITS, VIDEO_TYPES, probeVideo } from "./postVideo";

/**
 * Vídeo na conversa.
 *
 * Foto e GIF vão dentro da própria linha de `messages`, como data URL —
 * cabem, e a RLS da conversa já os protege. Vídeo não cabe: um clipe de
 * celular tem dezenas de MB.
 *
 * Então vai para o Storage, num bucket FECHADO e só dele
 * (`chat-media`, migration 20261107130000). O bucket `videos` dos posts é
 * público: usar ele aqui deixaria qualquer um com o endereço assistir a um
 * vídeo de conversa privada. O caminho carrega a conversa
 *
 *     conversations/<id da conversa>/<quem mandou>/<arquivo>
 *
 * e a permissão de ler é a mesma de ler a conversa. Como o bucket é fechado,
 * tocar exige URL ASSINADA, que vence — daí o cache aqui embaixo, para não
 * pedir uma assinatura nova a cada quadro de render.
 *
 * Sem corte e sem editor, ao contrário do post: na conversa o vídeo é recado,
 * não publicação. O limite é o tamanho do arquivo, que é o que o bucket
 * recusa de qualquer jeito.
 */

export const CHAT_MEDIA_BUCKET = "chat-media";

/** Uma hora de validade; o cache renova sozinho bem antes disso. */
const SIGNED_TTL_SECONDS = 3600;
const SIGNED_REUSE_MS = (SIGNED_TTL_SECONDS - 300) * 1000;

const assinadas = new Map(); // path -> { url, em }

const contentTypeFor = (file) => {
  const type = String(file.type || "").toLowerCase();
  if (VIDEO_TYPES.includes(type)) return type;
  if (/\.mov$/i.test(file.name || "")) return "video/quicktime";
  if (/\.webm$/i.test(file.name || "")) return "video/webm";
  return "video/mp4";
};

const extensionFor = (contentType) =>
  contentType === "video/quicktime" ? "mov" : contentType === "video/webm" ? "webm" : "mp4";

/** Código de erro (`socialPosts.videoErrors.*`) ou "" se o arquivo serve. */
export const chatVideoProblem = (file) => {
  if (!file) return "notVideo";
  const type = String(file.type || "").toLowerCase();
  const byName = /\.(mp4|m4v|mov|webm)$/i.test(file.name || "");
  if (type && !VIDEO_TYPES.includes(type) && !(type.startsWith("video/") && byName)) return "format";
  if (!type && !byName) return "notVideo";
  if (file.size > VIDEO_LIMITS.maxBytes) return "tooBig";
  return "";
};

/**
 * Sobe o vídeo e devolve o que a mensagem guarda: caminho, tipo e as medidas
 * que seguram o espaço do player antes de o arquivo chegar (sem elas a
 * conversa pula quando o vídeo carrega).
 */
export async function uploadChatVideo(file, { conversationId, userId }) {
  if (!file || !conversationId || !userId) throw new Error("chat-video-invalid");
  // O caminho é dividido por "/" na política do banco: uma barra no id da
  // conversa deslocaria a pasta e a permissão passaria a olhar outra coisa.
  if (String(conversationId).includes("/")) throw new Error("chat-video-invalid");

  const problema = chatVideoProblem(file);
  if (problema) {
    const erro = new Error(problema);
    erro.code = problema;
    throw erro;
  }

  // Quem envia não consegue abrir? Quem recebe também não. Falha aqui, e não
  // depois de 40 MB subirem.
  let medidas = { duration: 0, width: 0, height: 0 };
  try {
    const source = await probeVideo(file);
    URL.revokeObjectURL(source.url);
    medidas = { duration: source.duration, width: source.width, height: source.height };
  } catch {
    const erro = new Error("unreadable");
    erro.code = "unreadable";
    throw erro;
  }

  const contentType = contentTypeFor(file);
  const path = `conversations/${conversationId}/${userId}/${Date.now()}-${crypto.randomUUID()}.${extensionFor(contentType)}`;
  must(
    await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, file, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    }),
  );

  return {
    path,
    mime: contentType,
    size: file.size,
    duration: Math.round(medidas.duration * 100) / 100,
    width: medidas.width,
    height: medidas.height,
  };
}

/** Endereço tocável do vídeo — assinado, e reaproveitado enquanto vale. */
export async function chatMediaUrl(path) {
  if (!path) return "";
  const guardada = assinadas.get(path);
  if (guardada && Date.now() - guardada.em < SIGNED_REUSE_MS) return guardada.url;

  const { data, error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return "";
  assinadas.set(path, { url: data.signedUrl, em: Date.now() });
  return data.signedUrl;
}

/** O arquivo some junto com a mensagem; falhar aqui não derruba o apagar. */
export async function removeChatMedia(path) {
  if (!path) return;
  assinadas.delete(path);
  try {
    await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([path]);
  } catch (error) {
    console.warn("[chat] removeChatMedia", error);
  }
}
