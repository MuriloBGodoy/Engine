/**
 * A capa de uma publicação — a imagem que a representa numa grade.
 *
 * Existe porque a grade do perfil decidia isso sozinha e não conhecia o
 * vídeo de LINK: um post com um vídeo do YouTube não tem `images` nem
 * `video.poster`, então caía no desenho de "post de texto" — um quadrado
 * escuro com a legenda no meio e um ▶ no canto, no meio das fotos.
 * (06/11/2026, o quadradinho que o Murilo circulou.)
 *
 * O YouTube serve a capa num endereço previsível, que é o mesmo que o
 * player do feed já usa. Instagram e TikTok não servem: para esses continua
 * sem capa, e aí o post é mesmo de texto para efeito de grade.
 */

export const youTubeIdFrom = (url = "") =>
  String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
  )?.[1] || "";

/** O endereço da capa, ou "" quando não há imagem nenhuma para mostrar. */
export function postCover(goal = {}) {
  const foto = goal.images?.[0] || goal.image || goal.video?.poster || "";
  if (foto) return foto;
  const id = youTubeIdFrom(goal.videoUrl);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}

/**
 * Esta publicação é de grade?
 *
 * Tem capa, ou é um vídeo enviado (que sempre pode mostrar o primeiro
 * quadro). O resto é texto, e texto se lê em linha.
 */
export const postIsVisual = (goal = {}) => Boolean(postCover(goal) || goal.video);
