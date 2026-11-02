import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { mentionPath, parseSocialText, tagPath } from "../../services/socialText";

/**
 * Legenda e comentário com #tag, @pessoa e link clicáveis.
 *
 * Só estrutura: herda fonte e cor de quem envolve, e marca os trechos com
 * `font-semibold` + a cor de destaque. Quem redesenhar o cartão troca a
 * aparência por `linkClassName` sem mexer na regra de leitura (que mora em
 * services/socialText.js, a mesma do banco).
 *
 * Os links são `<a>`: o cartão do feed ignora clique em `a`, então tocar numa
 * tag não abre o post por baixo.
 */
export function RichText({
  text = "",
  as = "span",
  className = "",
  linkClassName = "font-semibold text-[var(--engine-accent)] hover:underline",
}) {
  const Wrapper = as;
  const parts = useMemo(() => parseSocialText(text), [text]);
  const stop = (event) => event.stopPropagation();

  return (
    <Wrapper className={className}>
      {parts.map((part, index) => {
        if (part.type === "hashtag") {
          return (
            <Link key={index} to={tagPath(part.tag)} onClick={stop} className={linkClassName}>
              {part.value}
            </Link>
          );
        }
        if (part.type === "mention") {
          return (
            <Link key={index} to={mentionPath(part.username)} onClick={stop} className={linkClassName}>
              {part.value}
            </Link>
          );
        }
        if (part.type === "url") {
          return (
            <a
              key={index}
              href={part.value}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              onClick={stop}
              className={`${linkClassName} break-all`}
            >
              {part.value.replace(/^https?:\/\//, "")}
            </a>
          );
        }
        return <Fragment key={index}>{part.value}</Fragment>;
      })}
    </Wrapper>
  );
}
