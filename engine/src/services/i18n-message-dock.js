import i18n from "./i18n";

/**
 * Texto da dica de colar foto (07/11/2026).
 *
 * Fora do i18n.js pelo mesmo motivo dos outros módulos: aquele arquivo é
 * mexido por várias frentes e colide. Entra por `addResourceBundle` com
 * deep merge.
 */

const ptBR = {
  // Dica do botão de foto, nos três compositores que aceitam colar: chat,
  // janelinha e post. Só no title — a aba não se explica, e o campo também
  // não (R42).
  pasteImage: { hint: "Foto — ou cole com Ctrl+V" },
};

const enUS = {
  pasteImage: { hint: "Photo — or paste with Ctrl+V" },
};

const esES = {
  pasteImage: { hint: "Foto — o pega con Ctrl+V" },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
