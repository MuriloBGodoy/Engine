import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMyProProfiles } from "../services/proProfiles";

/**
 * Meus perfis profissionais: o pessoal (se liguei), as páginas em que estou
 * na equipe e os convites pendentes. `publishable` = onde posso anunciar.
 */
export function useMyPro(userId) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(Boolean(userId));

  const reload = useCallback(async () => {
    if (!userId) {
      setEntries([]);
      setLoading(false);
      return [];
    }
    try {
      const list = await fetchMyProProfiles(userId);
      setEntries(list);
      return list;
    } catch (error) {
      console.warn("[pro] fetchMyProProfiles", error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return useMemo(() => {
    const active = entries.filter((entry) => entry.status === "active");
    return {
      loading,
      reload,
      entries,
      personal: active.find((entry) => entry.profile.kind === "person") || null,
      pages: active.filter((entry) => entry.profile.kind === "page"),
      invites: entries.filter((entry) => entry.status === "invited"),
      publishable: active,
    };
  }, [entries, loading, reload]);
}
