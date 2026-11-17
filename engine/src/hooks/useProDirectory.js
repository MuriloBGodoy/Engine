import { useEffect, useState } from "react";
import { listProProfiles } from "../services/proProfiles";

/**
 * O diretório "quem atende", lido uma vez e filtrado no navegador.
 *
 * Mesma escolha que a Buscar já faz com serviços e eventos: são poucos
 * registros, então vem a lista e cada letra digitada filtra aqui, sem ida ao
 * servidor por tecla. Quando passar de algumas centenas, o filtro desce para
 * o `listProProfiles` (ele aceita `term`, `category` e `state`).
 *
 * Falha em silêncio e devolve lista vazia: é uma seção entre outras, e um
 * perfil profissional que não carregou não pode derrubar a página inteira.
 */
export function useProDirectory({ limit = 24 } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    listProProfiles({ limit })
      .then((lista) => vivo && setItems(lista || []))
      .catch(() => vivo && setItems([]))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [limit]);

  return { items, loading };
}
