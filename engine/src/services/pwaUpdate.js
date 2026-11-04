/**
 * Versão nova do app instalado: descobrir, avisar e deixar atualizar na mão.
 *
 * O app instalado abre do cache do service worker. O navegador até procura
 * versão nova sozinho, mas só na navegação — e um PWA que fica semanas aberto
 * na tela inicial pode não navegar nenhuma vez. Era o que acontecia aqui: o
 * aviso existia e nunca aparecia, porque ninguém nunca perguntava ao servidor.
 *
 * Então três gatilhos, nesta ordem de importância:
 *   1. ao voltar para o app (a pessoa abriu de novo: é o momento certo),
 *   2. de hora em hora enquanto está aberto,
 *   3. o botão em Configurações, para quando ela quiser forçar.
 *
 * Mora num módulo, e não no hook, porque Configurações precisa alcançar o
 * mesmo registro que o aviso do topo usa — dois registros seriam dois
 * service workers disputando quem assume.
 */

const DE_HORA_EM_HORA = 60 * 60 * 1000;

let registration = null;
let applyUpdate = null;
let updateReady = false;
let started = false;
const listeners = new Set();

const announce = () => {
  for (const listener of listeners) listener(updateReady);
};

/** Pergunta ao servidor se há versão nova. Silencioso: offline não é erro. */
export async function checkForUpdate() {
  try {
    await registration?.update();
  } catch {
    // Sem rede, ou servidor fora: a próxima chance resolve.
  }
  return updateReady;
}

/** Aplica a versão que está esperando. Recarrega a página. */
export function applyPendingUpdate() {
  applyUpdate?.();
}

export function subscribeToUpdates(listener) {
  listeners.add(listener);
  listener(updateReady);
  return () => listeners.delete(listener);
}

/**
 * Registra o service worker uma vez por sessão. Chamado pelo hook, que o App
 * monta no começo.
 */
export function startPwaUpdates() {
  if (started) return;
  started = true;

  // Import dinâmico: o módulo virtual só existe no build com o plugin PWA.
  // No `npm run dev` ele não é gerado, e um import estático quebraria a tela.
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      const update = registerSW({
        immediate: true,
        onNeedRefresh() {
          updateReady = true;
          announce();
        },
        onRegisteredSW(_url, reg) {
          registration = reg || null;
          if (!registration) return;
          window.setInterval(checkForUpdate, DE_HORA_EM_HORA);
        },
      });
      applyUpdate = () => update(true);
    })
    .catch(() => {
      // Sem service worker (dev ou navegador sem suporte): segue a vida.
    });

  // Voltar para o app é quando mais vale perguntar: é a hora em que a pessoa
  // vai usar, e é o único gatilho que alcança o app que nunca navega.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
  window.addEventListener("online", checkForUpdate);
}
