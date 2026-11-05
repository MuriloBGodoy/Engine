import { useEffect, useMemo, useState } from "react";
import { engineDB } from "../services/db";

/**
 * O cartão ATUAL (nome, @, retrato) de um punhado de pessoas, pelo uid.
 *
 * Existe por causa de um bug real: a conversa guarda uma cópia do cartão de
 * quem está do outro lado, tirada no dia em que ela começou. Quem troca de @
 * fica com o @ velho pendurado no chat para sempre — e, desde que o nome do
 * cabeçalho virou o caminho para o perfil, esse @ velho leva a uma página que
 * não existe.
 *
 * A cópia guardada não é lixo: ela é o que aparece enquanto o perfil não
 * chegou, e é o que sobra quando a conta é apagada. Por isso isto é uma
 * sobreposição (`overlay`), não uma troca — o que o perfil souber ganha, o
 * resto continua vindo da cópia.
 *
 * Os clubes já faziam assim na lista de membros; a conversa tinha ficado para
 * trás.
 */
export function useLiveProfiles(userIds = []) {
  const [profiles, setProfiles] = useState({});

  // A lista chega nova a cada render de quem chama; o que importa são os ids.
  const key = useMemo(
    () => [...new Set(userIds.filter(Boolean))].sort().join(","),
    [userIds],
  );

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) return undefined;
    let alive = true;
    engineDB
      .getPublicProfilesByIds(ids)
      .then((found) => {
        if (alive) setProfiles((current) => ({ ...current, ...(found || {}) }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);

  return profiles;
}

/**
 * A cópia guardada com o que o perfil souber por cima.
 *
 * Campo vazio no perfil não apaga o que a cópia tinha: perfil pela metade é
 * pior que cartão antigo.
 */
export function withLiveProfile(person = {}, profiles = {}) {
  const live = profiles[person?.userId];
  if (!live) return person;
  return {
    ...person,
    author: live.author || person.author,
    username: live.username || person.username,
    avatar: live.avatar || person.avatar,
    avatarInitials: live.avatarInitials || person.avatarInitials,
  };
}
