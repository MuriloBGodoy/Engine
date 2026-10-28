import i18n from "./i18n";

/**
 * Textos da venda por país e do aviso de idioma nas páginas legais
 * (28/10/2026).
 *
 * Fora do i18n.js pelo mesmo motivo do i18n-billing.js: entram por
 * `addResourceBundle` com deep merge, sem sobrescrever nada que já exista.
 * Só os três idiomas oferecidos (services/languages.js).
 */

const ptBR = {
  billing: {
    plans: {
      notSellable: {
        title: "Assinaturas ainda não disponíveis no seu país — em breve.",
        body: "Os preços abaixo, em {{currency}}, são informativos: é o que vai valer quando a venda abrir aí.",
      },
      cta: {
        notSellable: "Ainda não disponível no seu país — em breve",
      },
    },
  },
  legal: {
    languageNotice: {
      title: "Este texto está em português.",
      body: "O Engine é oferecido a partir do Brasil, e estes termos seguem a lei brasileira (Código de Defesa do Consumidor e LGPD), onde quer que você esteja. A tradução está a caminho; até lá, vale o texto em português.",
    },
  },
};

const enUS = {
  billing: {
    plans: {
      notSellable: {
        title: "Subscriptions aren't available in your country yet — coming soon.",
        body: "The prices below, in {{currency}}, are for reference: they're what will apply once sales open where you are.",
      },
      cta: {
        notSellable: "Not available in your country yet — coming soon",
      },
    },
  },
  legal: {
    languageNotice: {
      title: "This text is in Portuguese.",
      body: "Engine is offered from Brazil, and this text follows Brazilian law (the Consumer Protection Code and the LGPD data protection law), wherever you are. A translation is on the way; until then, the Portuguese text applies.",
    },
  },
};

const esES = {
  billing: {
    plans: {
      notSellable: {
        title: "Las suscripciones aún no están disponibles en tu país — próximamente.",
        body: "Los precios de abajo, en {{currency}}, son informativos: son los que valdrán cuando la venta abra donde estás.",
      },
      cta: {
        notSellable: "Aún no disponible en tu país — próximamente",
      },
    },
  },
  legal: {
    languageNotice: {
      title: "Este texto está en portugués.",
      body: "Engine se ofrece desde Brasil, y este texto se rige por la ley brasileña (el Código de Defensa del Consumidor y la ley de protección de datos LGPD), estés donde estés. La traducción está en camino; hasta entonces, vale el texto en portugués.",
    },
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, false);
i18n.addResourceBundle("en-US", "translation", enUS, true, false);
i18n.addResourceBundle("es-ES", "translation", esES, true, false);

export default i18n;
