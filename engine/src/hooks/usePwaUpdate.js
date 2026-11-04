import { useEffect, useState } from "react";
import {
  applyPendingUpdate,
  startPwaUpdates,
  subscribeToUpdates,
} from "../services/pwaUpdate";

/**
 * Avisa quando existe versão nova esperando.
 *
 * Um app instalado abre do cache do service worker, então sem este aviso a
 * pessoa pode ficar semanas numa versão antiga sem perceber — inclusive sem
 * correções de bug. O service worker novo fica em espera e só assume quando o
 * usuário aceita, pra não recarregar a página no meio de um formulário.
 *
 * A mecânica toda mora em `services/pwaUpdate`, para Configurações poder
 * mandar procurar atualização usando o mesmo registro.
 */
export function usePwaUpdate() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    startPwaUpdates();
    return subscribeToUpdates(setUpdateReady);
  }, []);

  return { updateReady, applyUpdate: applyPendingUpdate };
}
