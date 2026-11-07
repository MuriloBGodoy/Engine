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
  const label = data.author || data.name || "Usuário Engine";
  const source = data.avatar || data.avatarInitials;
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
      {isImage(source) ? (
        <img src={source} alt={label} className="h-full w-full object-cover" />
      ) : (
        source || initialsOf(label)
      )}
    </span>
  );
}
