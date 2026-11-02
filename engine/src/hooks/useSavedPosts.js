import { useCallback, useSyncExternalStore } from "react";
import { listSavedPostIds, setPostSaved } from "../services/savedPosts";

// Um estado só para a tela inteira: cada cartão do feed pergunta "este post
// está salvo?" e todos precisam mudar juntos quando o mesmo post aparece no
// feed e no modal ao mesmo tempo.
const store = { userId: "", ids: new Set(), loadedFor: "" };
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const ensureLoaded = (userId) => {
  if (!userId || store.loadedFor === userId) return;
  store.loadedFor = userId;
  store.userId = userId;
  store.ids = new Set();
  listSavedPostIds(userId)
    .then((ids) => {
      if (store.userId !== userId) return;
      store.ids = new Set(ids);
      emit();
    })
    .catch(() => {});
};

/**
 * `isSaved(id)` e `toggleSaved(id)` para o marcador do post. Sem conta, nada
 * fica salvo (`isSaved` é sempre falso) — quem chama manda para o login.
 *
 * A troca é otimista: o ícone muda na hora e volta se a escrita falhar.
 */
export function useSavedPosts(userId) {
  ensureLoaded(userId);
  // O snapshot é o próprio Set, trocado a cada mudança: estável entre renders.
  const ids = useSyncExternalStore(subscribe, () => (userId ? store.ids : EMPTY));

  const isSaved = useCallback((postId) => ids.has(postId), [ids]);

  const toggleSaved = useCallback(
    async (postId) => {
      if (!userId || !postId) return;
      const next = !store.ids.has(postId);
      const apply = (on) => {
        const copy = new Set(store.ids);
        if (on) copy.add(postId);
        else copy.delete(postId);
        store.ids = copy;
        emit();
      };
      apply(next);
      try {
        await setPostSaved(userId, postId, next);
      } catch {
        apply(!next);
      }
    },
    [userId],
  );

  return { isSaved, toggleSaved };
}

const EMPTY = new Set();
