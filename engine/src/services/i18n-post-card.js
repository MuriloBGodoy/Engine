import i18n from "./i18n";

/**
 * Textos do cartão de post redesenhado (02/11/2026): marcador de salvar,
 * ficha da meta acima da foto e o "mais" da legenda.
 *
 * Arquivo próprio pelo mesmo motivo do i18n-social-feed.js: o i18n.js é
 * editado por várias frentes ao mesmo tempo. Importado pela Community, que é
 * de onde o GoalCard sai para as outras telas.
 */

const ptBR = {
  postCard: {
    save: "Salvar",
    unsave: "Remover dos salvos",
    more: "mais",
    goalSaved: "Guardado",
    goalLeft: "Falta",
    goalTarget: "Meta",
    goalOfTarget: "{{value}}% da meta",
    rate: "Avaliar",
    rating: "Nota {{value}} de 5",
  },
};

const enUS = {
  postCard: {
    save: "Save",
    unsave: "Remove from saved",
    more: "more",
    goalSaved: "Saved",
    goalLeft: "To go",
    goalTarget: "Goal",
    goalOfTarget: "{{value}}% of goal",
    rate: "Rate",
    rating: "Rated {{value}} out of 5",
  },
};

const esES = {
  postCard: {
    save: "Guardar",
    unsave: "Quitar de guardados",
    more: "más",
    goalSaved: "Ahorrado",
    goalLeft: "Falta",
    goalTarget: "Meta",
    goalOfTarget: "{{value}}% de la meta",
    rate: "Valorar",
    rating: "Nota {{value}} de 5",
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
