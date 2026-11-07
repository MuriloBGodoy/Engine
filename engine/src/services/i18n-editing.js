import i18n from "./i18n";

/**
 * Textos de escolher mídia (07/11/2026).
 *
 * Fora do i18n.js pelo mesmo motivo dos outros módulos: aquele arquivo é
 * mexido por várias frentes e colide.
 */

const ptBR = {
  mediaPicker: {
    title: "Adicionar",
    takeNow: "Tirar foto agora",
    recordNow: "Gravar agora",
    fromGallery: "Escolher da galeria",
  },
};

const enUS = {
  mediaPicker: {
    title: "Add",
    takeNow: "Take a photo now",
    recordNow: "Record now",
    fromGallery: "Choose from the gallery",
  },
};

const esES = {
  mediaPicker: {
    title: "Añadir",
    takeNow: "Hacer una foto ahora",
    recordNow: "Grabar ahora",
    fromGallery: "Elegir de la galería",
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
