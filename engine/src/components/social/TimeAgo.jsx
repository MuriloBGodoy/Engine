import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatAbsoluteTime, formatRelativeTime } from "../../services/socialTime";

// Um relógio só para a tela inteira: cada `TimeAgo` com o próprio intervalo
// seriam dezenas de timers num feed comprido.
const listeners = new Set();
let ticker = null;
const subscribe = (fn) => {
  listeners.add(fn);
  if (!ticker) ticker = window.setInterval(() => listeners.forEach((cb) => cb(Date.now())), 60000);
  return () => {
    listeners.delete(fn);
    if (!listeners.size && ticker) {
      window.clearInterval(ticker);
      ticker = null;
    }
  };
};

/**
 * "há 5 min" que se atualiza sozinho, com a data completa ao passar o mouse
 * (`title`) e ao tocar (no celular não existe hover: o toque alterna entre
 * relativo e absoluto). `editedAt` acrescenta " · editado".
 *
 * É um `<button>` de propósito: o cartão do feed abre o post em clique fora
 * de botão/link, e tocar no horário não deve abrir nada.
 */
export function TimeAgo({ value, editedAt = "", className = "", short = false, absolute = false }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language || "pt-BR";
  const [, setTick] = useState(0);
  // `absolute` só define por onde começa; o clique continua alternando.
  const [mostrarData, setMostrarData] = useState(absolute);

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  const relative = formatRelativeTime(value, language, { short });
  if (!relative) return null;
  const full = formatAbsoluteTime(value, language);
  const editedFull = editedAt ? formatAbsoluteTime(editedAt, language) : "";
  const title = editedFull ? `${full} · ${t("community.edited")} ${editedFull}` : full;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setMostrarData((current) => !current);
      }}
      title={title}
      aria-label={title}
      className={`inline-flex min-w-0 items-center whitespace-nowrap text-left ${className}`}
    >
      <time dateTime={new Date(value).toISOString()}>{mostrarData ? full : relative}</time>
      {/* Espaço explícito com white-space: pre: dentro do inline-flex o espaço
          do começo do item era cortado e saía "há 2 h· editado". */}
      {editedAt ? <span className="whitespace-pre">{" "}·{" "}{t("community.edited")}</span> : null}
    </button>
  );
}
