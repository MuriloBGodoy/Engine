import { useEffect, useState } from "react";
import { Loader2, VideoOff } from "lucide-react";
import { chatMediaUrl } from "../../services/chatMedia";

/**
 * O vídeo de uma mensagem.
 *
 * O arquivo mora num bucket FECHADO (migration 20261107130000), então não há
 * endereço fixo para pôr no `src`: é preciso pedir uma URL assinada, que
 * vence. Daí o estado aqui — e daí também a altura reservada antes de o
 * endereço chegar: sem ela a conversa pula para cima quando o player nasce,
 * bem na hora em que a pessoa está lendo.
 *
 * `preload="metadata"` de propósito: numa conversa com vários vídeos, baixar
 * todos de uma vez é gastar o 4G de quem só queria ler o texto.
 */
export function ChatVideo({ video, mine, t }) {
  // Um estado só, carimbado com o caminho que o gerou: trocar de vídeo no
  // mesmo balão não mostra o endereço do anterior por um quadro, e nada
  // precisa ser zerado dentro do efeito (o que dispararia outro render).
  const [pronto, setPronto] = useState({ path: "", url: "", erro: false });
  const path = video?.path || "";

  useEffect(() => {
    if (!path) return undefined;
    let vivo = true;
    chatMediaUrl(path)
      .then((url) => vivo && setPronto({ path, url, erro: !url }))
      .catch(() => vivo && setPronto({ path, url: "", erro: true }));
    return () => {
      vivo = false;
    };
  }, [path]);

  const src = pronto.path === path ? pronto.url : "";
  const falhou = pronto.path === path && pronto.erro;

  // Em pé ou deitado, o balão segura a proporção do arquivo — com teto, para
  // um vídeo 9:16 não virar uma coluna de tela inteira.
  const proporcao =
    video?.width && video?.height ? `${video.width} / ${video.height}` : "4 / 3";

  return (
    <div
      className="mb-2 overflow-hidden rounded-lg bg-black/60"
      style={{ aspectRatio: proporcao, maxHeight: "22rem" }}
    >
      {src ? (
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          aria-label={t("socialPosts.messages.sentVideo")}
          className="h-full w-full object-contain"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center ${
            mine ? "text-white/70" : "text-[var(--engine-text-subtle)]"
          }`}
        >
          {falhou ? <VideoOff size={20} /> : <Loader2 size={18} className="animate-spin" />}
        </div>
      )}
    </div>
  );
}
