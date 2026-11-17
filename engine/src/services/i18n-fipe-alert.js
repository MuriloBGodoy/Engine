import i18n from "./i18n";

/**
 * Textos do alerta de FIPE (14/11/2026).
 *
 * Arquivo próprio, como os outros `i18n-*`: o `i18n.js` passa de seis mil
 * linhas e cada frente que mexe nele colide com as outras.
 *
 * A frase diz o que mudou e quanto, nessa ordem, porque é o que a pessoa quer
 * saber antes de decidir se toca em algo. Não diz "atualize agora": o preço
 * guardado continua valendo até ela querer.
 */
const ptBR = {
  fipeAlert: {
    up: "A FIPE do {{car}} subiu {{amount}}.",
    down: "A FIPE do {{car}} caiu {{amount}}.",
    detail: "De {{from}} para {{to}}, uma diferença de {{pct}}%. A tabela muda uma vez por mês.",
    apply: "Atualizar o preço",
    keep: "Deixar como está",
    dismiss: "Fechar o aviso",
  },
};

const enUS = {
  fipeAlert: {
    up: "The FIPE price of your {{car}} went up {{amount}}.",
    down: "The FIPE price of your {{car}} went down {{amount}}.",
    detail: "From {{from}} to {{to}}, a {{pct}}% difference. The table changes once a month.",
    apply: "Update the price",
    keep: "Keep it as is",
    dismiss: "Dismiss",
  },
};

const esES = {
  fipeAlert: {
    up: "El precio FIPE de tu {{car}} subió {{amount}}.",
    down: "El precio FIPE de tu {{car}} bajó {{amount}}.",
    detail: "De {{from}} a {{to}}, una diferencia de {{pct}}%. La tabla cambia una vez al mes.",
    apply: "Actualizar el precio",
    keep: "Dejarlo así",
    dismiss: "Cerrar el aviso",
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
