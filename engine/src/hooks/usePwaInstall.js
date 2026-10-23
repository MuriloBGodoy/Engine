import { useSyncExternalStore } from "react";

const DISMISSED_KEY = "engine_install_dismissed_at";
const VISITS_KEY = "engine_visits";
const VISIT_COUNTED_KEY = "engine_visit_counted";
// Instalar é o fim do funil, não a porta de entrada: primeiro a pessoa usa e
// gosta, depois a gente convida. Antes da segunda visita, o convite automático
// nem aparece. O botão "Instalar app" (InstallButton) ignora essa regra: quem
// procura o botão já decidiu.
const MIN_VISITS = 2;
const DISMISS_DAYS = 30;

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  // Safari no iOS não implementa display-mode; usa esta propriedade própria.
  window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;

const dismissedRecently = () => {
  const at = Number(window.localStorage.getItem(DISMISSED_KEY) || 0);
  if (!at) return false;
  return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
};

/**
 * Uma visita é uma sessão, não uma montagem do componente — a marca fica no
 * sessionStorage pra remontagem (e o duplo render do StrictMode) não inflar a
 * conta e adiantar o convite.
 */
const countVisit = () => {
  if (!window.sessionStorage.getItem(VISIT_COUNTED_KEY)) {
    const visits = Number(window.localStorage.getItem(VISITS_KEY) || 0) + 1;
    window.localStorage.setItem(VISITS_KEY, String(visits));
    window.sessionStorage.setItem(VISIT_COUNTED_KEY, "1");
  }
  return Number(window.localStorage.getItem(VISITS_KEY) || 0);
};

/*
 * Estado único, no nível do módulo, compartilhado pelo convite automático
 * (InstallPrompt) e pelo botão (InstallButton). Fica fora do React de propósito:
 * o `beforeinstallprompt` pode disparar antes de qualquer componente montar, e
 * um listener registrado num useEffect perdia esse evento.
 */
let deferredPrompt = null;
const listeners = new Set();

const createInitialState = () => {
  if (typeof window === "undefined" || isStandalone()) {
    return { autoEligible: false, canInstall: false, visible: false, needsIOSInstructions: false };
  }
  const autoEligible = countVisit() >= MIN_VISITS && !dismissedRecently();
  // No iPhone não existe `beforeinstallprompt`: instalar é ação manual no menu
  // de compartilhar do Safari, então o convite já entra em modo instrução.
  const ios = isIOS();
  return {
    autoEligible,
    canInstall: ios,
    visible: autoEligible && ios,
    needsIOSInstructions: ios,
  };
};

let state = createInitialState();

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Sem isto o Chrome mostra o próprio banner, na hora que ele quiser.
    event.preventDefault();
    deferredPrompt = event;
    setState({ canInstall: true, visible: state.visible || state.autoEligible });
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    setState({ canInstall: false, visible: false });
  });
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => state;

/** Abre o prompt nativo do navegador. Devolve true se a pessoa aceitou. */
const install = async () => {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  // O mesmo evento não pode ser usado duas vezes; se a pessoa recusar, o
  // navegador dispara outro `beforeinstallprompt` mais tarde e o botão volta.
  deferredPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  setState({ canInstall: false, visible: false });
  return outcome === "accepted";
};

const dismiss = () => {
  window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  setState({ visible: false, autoEligible: false });
};

/** Decide se cabe convidar a pessoa a instalar o Engine, e instala. */
export function usePwaInstall() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    // Convite automático do rodapé.
    visible: current.visible,
    // Dá para instalar agora (Chrome/Edge com o prompt guardado, ou iPhone).
    canInstall: current.canInstall,
    needsIOSInstructions: current.needsIOSInstructions,
    install,
    dismiss,
  };
}
