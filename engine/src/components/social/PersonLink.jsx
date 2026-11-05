import { Link } from "react-router-dom";
import { profilePath } from "../../services/people";

/**
 * O nome (e o retrato) de alguém como caminho para o perfil dela.
 *
 * Regra da casa desde 04/11/2026: em toda tela onde uma pessoa aparece,
 * tocar nela abre o perfil — é o que qualquer rede social faz, e o que o
 * Engine só fazia no feed e na busca. Antes disso, o nome no mural do clube,
 * na lista de membros e no comentário de um carro era texto morto.
 *
 * Sem @ (conta apagada, semente antiga) não existe página para abrir: aí sai
 * um `<span>`, não um link quebrado. Quem chama não precisa checar.
 *
 * O clique para de subir: estes nomes vivem dentro de cartões que têm a ação
 * deles própria (abrir o post, abrir o carro).
 */
export function PersonLink({ username, className = "", title, children }) {
  const path = profilePath(username);

  if (!path) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link
      to={path}
      title={title}
      onClick={(event) => event.stopPropagation()}
      className={className}
    >
      {children}
    </Link>
  );
}
