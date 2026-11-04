import { useEffect, useState } from "react";
import { fetchEnginePresence } from "../services/mentions";

/**
 * Carrega a presença da pessoa no Engine.
 *
 * Mora fora do componente porque quem desenha o perfil precisa saber se há
 * algo aqui *antes* de decidir mostrar a aba: uma aba que abre vazia é pior
 * que aba nenhuma.
 */
export function useEnginePresence(userId) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!userId) return undefined;
    fetchEnginePresence(userId).then((result) => alive && setData(result));
    return () => {
      alive = false;
    };
  }, [userId]);

  const empty =
    !data ||
    data.hidden ||
    !((data.clubs || []).length + (data.pages || []).length + (data.events || []).length);

  return { data, hasPresence: !empty };
}
