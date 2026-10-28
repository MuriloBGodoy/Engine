import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authPath } from "../services/authRedirect";

/**
 * Visitante tentou curtir, comentar, avaliar, seguir, denunciar ou criar
 * evento: em vez de um "Comentário salvo" que não gravou nada, vai para o
 * login e volta para a mesma página (`?next=`, só caminho interno — ver
 * services/authRedirect.js).
 *
 * Devolve `requireAccount()`: `true` quando mandou para o login (quem chama
 * para ali), `false` quando a pessoa já tem conta.
 */
export function useRequireAccount(user) {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (next) => {
      if (user?.uid) return false;
      navigate(authPath("/login", next || `${location.pathname}${location.search}`));
      return true;
    },
    [user?.uid, navigate, location.pathname, location.search],
  );
}
