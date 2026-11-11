import { useState } from "react";

const initialsOf = (name = "") =>
  name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

const isImage = (value) =>
  typeof value === "string" &&
  (value.startsWith("http") || value.startsWith("data:"));

/**
 * Avatar circular usado nas telas de mensagem — aceita URL, base64 ou
 * simplesmente as iniciais do nome.
 */
export function ChatAvatar({ person, size = "md" }) {
  // A conversa pode ainda não ter carregado — o avatar cai nas iniciais.
  const data = person || {};
  /**
   * Foto que não carrega vira iniciais.
   *
   * 10/11/2026: o avatar de quem entrou com Google é uma URL do
   * `lh3.googleusercontent.com`, e ela falha de vez em quando — o Google
   * limita o acesso e devolve uma página de erro, e essas URLs ainda são
   * trocadas de tempos em tempos. Sem plano B, o que aparecia no lugar da
   * foto era o nome da pessoa em texto cru, transbordando do círculo.
   */
  const [fotoQueFalhou, setFotoQueFalhou] = useState(null);
  const label = data.author || data.name || "Usuário Engine";
  const source = data.avatar || data.avatarInitials;
  // Guardar QUAL foto falhou, e não um sim/não, faz a tentativa recomeçar
  // sozinha quando a pessoa troca de foto ou quando é outra conversa.
  const falhou = Boolean(source) && fotoQueFalhou === source;
  const sizeClass =
    size === "xs"
      ? "h-6 w-6 text-[9px]"
      : size === "sm"
        ? "h-8 w-8 text-[10px]"
        : size === "lg"
          ? "h-14 w-14 text-base"
          : "h-11 w-11 text-xs";

  return (
    <span
      className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--engine-accent)] font-black italic text-white`}
      title={label}
    >
      {isImage(source) && !falhou ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFotoQueFalhou(source)}
          className="h-full w-full object-cover"
        />
      ) : (
        (!isImage(source) && source) || initialsOf(label)
      )}
    </span>
  );
}
