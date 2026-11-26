import i18n from "./i18n";

/**
 * Textos do seletor de GIF (gifPicker.*).
 *
 * Arquivo próprio, carregado pelo componente, como o do guia: o seletor é
 * uma peça só, usada no chat, e ninguém mais precisa carregar estes textos.
 */

const ptBR = {
  gifPicker: {
    title: "GIF",
    search: "Pesquisar GIF",
    trending: "Em alta",
    results: "Resultados",
    empty: "Nada encontrado para “{{term}}”.",
    error: "Não deu para carregar os GIFs. Tenta de novo.",
    unavailable: "A busca de GIF não está ligada neste aparelho.",
    retry: "Tentar de novo",
    credit: "via GIPHY",
  },
};

const enUS = {
  gifPicker: {
    title: "GIF",
    search: "Search GIFs",
    trending: "Trending",
    results: "Results",
    empty: "Nothing found for “{{term}}”.",
    error: "Could not load GIFs. Try again.",
    unavailable: "GIF search is not switched on here.",
    retry: "Try again",
    credit: "via GIPHY",
  },
};

const esES = {
  gifPicker: {
    title: "GIF",
    search: "Buscar GIF",
    trending: "En tendencia",
    results: "Resultados",
    empty: "No hay nada para “{{term}}”.",
    error: "No se pudieron cargar los GIF. Inténtalo de nuevo.",
    unavailable: "La búsqueda de GIF no está activada aquí.",
    retry: "Intentar de nuevo",
    credit: "via GIPHY",
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
