import i18n from "./i18n";
import { supportedLngs } from "./languages";

/**
 * Idioma: escolha explícita da pessoa × idioma do navegador.
 *
 * Até 25/10/2026 o app forçava pt-BR para todo mundo: o default das
 * configurações era "pt-BR" e o App chamava `changeLanguage` com ele, por cima
 * da detecção do navegador. Quem abria com o Chrome em inglês via tudo em
 * português, e as 2.140 chaves de en/es só apareciam para quem achava a
 * opção em Configurações.
 *
 * Agora: sem escolha salva, vale o navegador. A escolha só existe quando a
 * pessoa troca o idioma (rodapé ou Configurações), e fica marcada em
 * CHOICE_KEY. O cache do detector (`i18nextLng`) não serve de marca: ele
 * também guardava o pt-BR imposto, então é limpo quando não há escolha.
 */
const CHOICE_KEY = "engine.languageChoice";
const DETECTOR_CACHE_KEY = "i18nextLng";

const RTL = new Set(["ar"]);

const readChoice = () => {
  try {
    const value = window.localStorage.getItem(CHOICE_KEY) || "";
    return supportedLngs.includes(value) ? value : "";
  } catch {
    return "";
  }
};

const syncDocumentLanguage = (lng) => {
  if (typeof document === "undefined" || !lng) return;
  document.documentElement.lang = lng;
  document.documentElement.dir = RTL.has(String(lng).split("-")[0]) ? "rtl" : "ltr";
};

/** O idioma que a pessoa escolheu à mão; "" = seguir o navegador. */
export const explicitLanguage = () => readChoice();

/**
 * Troca o idioma por escolha da pessoa. `""` volta a seguir o navegador.
 * Devolve o idioma que ficou valendo.
 */
export async function chooseLanguage(lng) {
  const value = supportedLngs.includes(lng) ? lng : "";
  try {
    if (value) window.localStorage.setItem(CHOICE_KEY, value);
    else {
      window.localStorage.removeItem(CHOICE_KEY);
      window.localStorage.removeItem(DETECTOR_CACHE_KEY);
    }
  } catch {
    // Armazenamento bloqueado: a troca vale para esta visita.
  }
  // Sem argumento, o i18next roda a detecção de novo (navegador).
  await i18n.changeLanguage(value || undefined);
  return i18n.resolvedLanguage || i18n.language;
}

/**
 * Aplica o idioma salvo nas configurações da conta, se a pessoa escolheu um.
 * Vazio (contas novas) = não mexe: continua o do navegador.
 */
export function applySavedLanguage(saved) {
  const value = supportedLngs.includes(saved) ? saved : "";
  if (!value || i18n.language === value) return;
  try {
    window.localStorage.setItem(CHOICE_KEY, value);
  } catch {
    // segue só nesta visita
  }
  i18n.changeLanguage(value);
}

// Na carga: sem escolha explícita, esquece o cache do detector e detecta de
// novo pelo navegador.
if (typeof window !== "undefined" && !readChoice()) {
  try {
    if (window.localStorage.getItem(DETECTOR_CACHE_KEY)) {
      window.localStorage.removeItem(DETECTOR_CACHE_KEY);
      i18n.changeLanguage();
    }
  } catch {
    // armazenamento bloqueado: o detector já usou o navegador
  }
}

syncDocumentLanguage(i18n.language);
i18n.on("languageChanged", syncDocumentLanguage);
