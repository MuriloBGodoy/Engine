import { useSyncExternalStore } from "react";

/**
 * Consentimento de cookies de publicidade (AdSense).
 *
 * O guia de cookies da ANPD (2022) pede consentimento para cookie de anúncio,
 * com "Rejeitar" tão fácil quanto "Aceitar". Enquanto a pessoa não escolhe,
 * nenhum script do Google é carregado. Rejeitou: o Engine não carrega o
 * AdSense de jeito nenhum (sem anúncio do Google, sem cookie dele).
 *
 * O que o app precisa para funcionar (sessão, idioma, tema, região) não passa
 * por aqui: é necessário, e a LGPD não exige consentimento para isso.
 *
 * Fica no navegador de propósito: vale para visitante sem conta, que é quem
 * mais vê anúncio.
 */
const KEY = "engine_consent_ads";

/** AdSense configurado neste build? Sem ele não há cookie de anúncio a perguntar. */
export const ADSENSE_ENABLED = Boolean(
  import.meta.env.VITE_ADSENSE_CLIENT && import.meta.env.VITE_ADSENSE_SLOT_DEFAULT,
);
const listeners = new Set();

function read() {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    // Storage bloqueado: trata como "ainda não escolheu" e não carrega anúncio.
    return null;
  }
}

let current = typeof window === "undefined" ? null : read();

/** "granted" | "denied" | null (ainda não escolheu). */
export function getAdsConsent() {
  return current;
}

export function setAdsConsent(value) {
  current = value === "granted" ? "granted" : "denied";
  try {
    window.localStorage.setItem(KEY, current);
  } catch {
    // Sem storage, a escolha vale só para esta visita.
  }
  listeners.forEach((listener) => listener());
}

/** Volta a perguntar (o link "Cookies" do rodapé e Configurações usam isso). */
export function resetAdsConsent() {
  current = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAdsConsent() {
  return useSyncExternalStore(subscribe, getAdsConsent, () => null);
}
