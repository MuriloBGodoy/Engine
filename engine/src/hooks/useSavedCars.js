import { useCallback, useSyncExternalStore } from "react";
import { listSavedCarIds, setCarSaved } from "../services/savedCars";

// Um estado só para a tela inteira, como em `useSavedPosts`: o mesmo carro
// aparece na grade e na página dele, e os dois marcadores têm que virar
// juntos.
const store = { userId: "", ids: new Set(), loadedFor: "" };
const listeners = new Set();
const EMPTY = new Set();
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
  listSavedCarIds(userId)
    .then((ids) => {
      if (store.userId !== userId) return;
      store.ids = new Set(ids);
      emit();
    })
    .catch(() => {});
};

/**
 * `isSaved(carId)` e `toggleSaved(carId)` para o marcador do carro.
 *
 * Sem conta nada fica salvo (`isSaved` é sempre falso) — quem chama manda
 * para o login. A troca é otimista: o ícone muda na hora e volta se a escrita
 * falhar.
 */
export function useSavedCars(userId) {
  ensureLoaded(userId);
  const ids = useSyncExternalStore(subscribe, () => (userId ? store.ids : EMPTY));

  const isSaved = useCallback((carId) => ids.has(carId), [ids]);

  const toggleSaved = useCallback(
    async (carId) => {
      if (!userId || !carId) return;
      const next = !store.ids.has(carId);
      const apply = (on) => {
        const copy = new Set(store.ids);
        if (on) copy.add(carId);
        else copy.delete(carId);
        store.ids = copy;
        emit();
      };
      apply(next);
      try {
        await setCarSaved(userId, carId, next);
      } catch {
        apply(!next);
      }
    },
    [userId],
  );

  return { isSaved, toggleSaved };
}
