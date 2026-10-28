/**
 * Deploy novo no meio da sessão: os pedaços do app têm nome com hash, e a
 * Netlify deixa de servir os antigos. Quem ainda roda a versão velha (sem o
 * service worker no controle) pede um arquivo que não existe mais, e o import
 * sob demanda falha. O Vite avisa com `vite:preloadError`.
 *
 * A saída é recarregar UMA vez, para pegar a versão nova. A marca na sessão
 * impede laço: se a falha voltar logo depois do recarregamento, não é deploy
 * — o erro segue para a ErrorBoundary, que mostra texto e o botão Recarregar.
 */
const KEY = "engine.preloadReloadAt";
const WINDOW_MS = 30_000;

export function installPreloadRecovery() {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (event) => {
    let last = 0;
    try {
      last = Number(window.sessionStorage.getItem(KEY)) || 0;
    } catch {
      last = 0;
    }
    if (Date.now() - last < WINDOW_MS) return;
    try {
      window.sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // sem sessionStorage não há como evitar o laço: não recarrega
      return;
    }
    event.preventDefault();
    window.location.reload();
  });
}
