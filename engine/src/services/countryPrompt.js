/**
 * Marca de "já perguntamos o país" (ver components/CountryPrompt.jsx).
 * Vale a do servidor (`preferences.countryAskedAt`) ou a deste aparelho.
 */
const askedKey = (uid) => `engine.countryAsked:${uid}`;

export function readCountryAsked(uid, settings) {
  if (settings?.preferences?.countryAskedAt) return true;
  try {
    return Boolean(window.localStorage.getItem(askedKey(uid)));
  } catch {
    // Sem armazenamento, não insiste: melhor não perguntar que perguntar sempre.
    return true;
  }
}

export function markCountryAsked(uid) {
  try {
    window.localStorage.setItem(askedKey(uid), "1");
  } catch {
    // sem armazenamento: vale a marca do servidor, se gravou
  }
}
