import { useEffect, useState } from "react";
import { fetchTrendingHashtags } from "../services/socialPosts";

/** Tags em alta (7 dias, por número de autores). `[]` enquanto carrega ou se falhar. */
export function useTrendingTags({ limit = 10, enabled = true } = {}) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchTrendingHashtags({ limit }).then((list) => alive && setItems(list));
    return () => {
      alive = false;
    };
  }, [limit, enabled]);
  return items;
}
