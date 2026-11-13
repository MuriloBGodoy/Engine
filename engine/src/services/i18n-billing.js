import i18n from "./i18n";

/**
 * Textos de Planos (/planos), Apoie (/apoie) e Anuncie (/anuncie).
 *
 * Moram fora do i18n.js de propósito: aquele arquivo tem 6 mil linhas e é
 * editado por várias frentes ao mesmo tempo. Aqui eles entram por
 * `addResourceBundle` com deep merge, sem sobrescrever nada que já exista.
 *
 * pt-PT, en-GB, es-MX e es-AR apontam para o mesmo objeto de pt-BR, en-US e
 * es-ES (ver o fim do i18n.js), e os outros idiomas caem no en-US pelo
 * fallbackLng — então os três blocos abaixo cobrem os 15.
 *
 * Regra destes textos: nada que o app não entregue. O que não existe está
 * escrito como "Em breve" e o resumo de compra diz isso com todas as letras.
 */

const ptBR = {
  countryPrompt: {
    title: "Em que país você está?",
    body: "Usamos o país para cobrar na sua moeda e mostrar o que está perto de você. Dá para mudar depois, ao editar o perfil.",
    label: "País",
    detected: "Detectado pela sua conexão. Confira se está certo.",
    confirm: "Confirmar",
    skip: "Agora não",
    error: "Não deu para salvar agora. Tente de novo ou pule — dá para mudar depois no perfil.",
  },
  nav: { plans: "Planos" },
  footer: {
    company: {
      plans: "Planos",
      support: "Apoie o Engine",
      advertise: "Anuncie",
    },
  },
  billing: {
    offers: {
      pro_monthly: {
        name: "Engine Premium — mensal",
        what: "Assinatura mensal do Engine Premium, para quem presta serviço. Inclui tudo do Pro.",
      },
      premium_monthly: {
        name: "Engine Pro — mensal",
        what: "Assinatura mensal do Engine Pro, para o dono do carro.",
      },
      premium_yearly: {
        name: "Engine Pro — anual",
        what: "Assinatura anual do Engine Pro, para o dono do carro.",
      },
      premium_pass_1m: {
        name: "Engine Pro — passe de 1 mês",
        what: "Passe de 1 mês do Engine Pro. Pagamento único.",
      },
      premium_pass_3m: {
        name: "Engine Pro — passe de 3 meses",
        what: "Passe de 3 meses do Engine Pro. Pagamento único.",
      },
    },
    plans: {
      eyebrow: "Planos",
      title: "O Engine é grátis. Os planos só acrescentam.",
      subtitle:
        "Tudo o que existe hoje no app é grátis e continua grátis. Quem assina ganha o que vem a mais — e banca o Engine para todo mundo.",
      soon: "Em breve",
      perYear: "por ano",
      perMonth: "por mês",
      oneTime: "pagamento único",
      currentTitle: "Seu plano: {{plan}}",
      currentHint: "Datas, cobrança e cancelamento ficam em Configurações › Seu plano.",
      notOpen:
        "As assinaturas ainda não estão abertas. Os preços abaixo são os que vão valer quando abrirem.",
      supportLink: "Quer apoiar sem assinar? Veja <support>outras formas de apoiar o Engine</support>.",
      cta: {
        soon: "Assinatura em breve",
          notify: "Me avise quando abrir",
        login: "Entre para assinar",
        manage: "Configurações › Seu plano",
        register: "Criar conta grátis",
        current: "Seu plano atual",
        includedInPro: "Incluído no seu Premium",
        passActiveYearly:
          "Seu passe vale até {{date}}. Para não pagar o mesmo período duas vezes, o anual fica disponível quando ele acabar — ou estenda com outro passe.",
        subscribePremium: "Assinar o Pro",
        buyPass: "Comprar passe",
        switchHint: "Você já tem uma assinatura. Para trocar de plano, cancele a atual primeiro.",
        subscribePro: "Assinar o Premium",
        startTrial: "Começar {{days}} dias grátis",
      },
      free: {
        eyebrow: "Para todo mundo",
        name: "Grátis",
        audience: "Tudo o que o Engine tem hoje. Sem prazo e sem cartão.",
        forever: "para sempre",
        always: "Continua com você em qualquer plano.",
      },
        building: {
          label: "Em construção:",
          entry: "alerta e histórico da FIPE do seu carro, caderneta de manutenção e custo projetado em 3 e 5 anos. Você não paga nada a mais quando saírem.",
          provider: "As ferramentas de quem vive disso: de onde veio cada cliente, relatório mensal, cupom rastreável e destaque na vitrine.",
          providerWhy: "Ainda não está à venda, e o motivo é honesto: medir audiência só vale quando há audiência para medir. Abre quando a vitrine tiver movimento — e quem entrar primeiro paga preço de fundador.",
        },
      premium: {
        badge: "Para o dono do carro",
        eyebrow: "Pro",
        audience: "Para quem tem carro ou está decidindo qual comprar.",
        yearlyNote: "Cobrado {{yearly}} uma vez por ano — {{percent}}% abaixo de pagar mês a mês. Renova todo ano até você cancelar.",
        monthlyNote: "Renova todo mês até você cancelar. Cancele quando quiser.",
        passNote: {
          premium_pass_1m: "Vale 1 mês. Não renova e não guarda cartão.",
          premium_pass_3m: "Vale 3 meses. Não renova e não guarda cartão.",
        },
        chooseLabel: "Escolha como pagar",
        option: {
          premium_monthly: "Mensal · {{price}}",
          premium_yearly: "Anual · {{price}}",
          premium_pass_3m: "Passe de 3 meses · {{price}}",
          premium_pass_1m: "Passe de 1 mês · {{price}}",
        },
        save: "−{{percent}}%",
        renews: "renova",
        noRenew: "não renova",
        honest:
          "Hoje o Pro tira os anúncios. Os outros itens ainda não existem no app: estão marcados como “Em breve”. Assine pelo que ele já entrega.",
      },
      pro: {
        eyebrow: "Premium",
        audience: "Para quem presta serviço: oficina, estética, funilaria, mecânico.",
        trialNote: "{{days}} dias grátis para começar. Depois, cobrança mensal até você cancelar.",
        trialUsed: "Você já usou o teste grátis: a cobrança começa no dia da assinatura.",
        founder:
          "Preço de fundador: os {{slots}} primeiros assinantes pagam {{founderPrice}}/mês em vez de {{price}}, enquanto a assinatura continuar ativa. Se ainda houver vaga, o checkout já mostra o valor menor.",
        honest:
          "Publicar serviço e ver as métricas básicas já é grátis. As ferramentas do Premium ainda não existem no app: estão marcadas como “Em breve”. Hoje o Premium entrega o mesmo que o Pro.",
      },
    },
    features: {
      free: {
        garage: "Garagem com seus carros e metas de compra",
        specs: "Ficha técnica da versão do seu carro",
        simulator: "Simulador de custo real, com os juros totais do financiamento",
        maintenance: "Manutenção programada e lembretes de IPVA e licenciamento",
        quotes: "Pedir e receber orçamento",
        reviews: "Avaliar e ser avaliado",
        community: "Comunidade, Mensagens, Clubes e Eventos",
        services: "Publicar seu serviço",
      },
      founder: {
        supporterBadge: "Selo de Apoiador no seu perfil",
        priceLock: "Este preço travado para sempre, mesmo quando subir",
        earlyAccess: "Tudo que sair, assim que sair, sem pagar a mais",
      },
      premium: {
        noAds: "Sem anúncios",
        fipeAlert: "Alerta e histórico da FIPE do seu carro",
        maintenance: "Manutenção programada e caderneta",
        totalCost: "Custo total em 3 e 5 anos",
        comparator: "Comparador detalhado entre carros",
        resale: "Dossiê de revenda",
        supporterBadge: "Selo de Apoiador no perfil",
      },
      pro: {
        allPremium: "Tudo do Pro",
        monthlyMetrics: "Métricas mês a mês e de onde veio cada cliente",
        monthlyReport: "Relatório mensal",
        quotes: "Pedidos de orçamento",
        coupon: "Cupom rastreável",
        reviews: "Ferramentas de avaliação",
      },
    },
    legal: {
      title: "Antes de assinar",
      renewal: {
        title: "Renovação automática",
        body: "As assinaturas — Premium e Pro, mensal ou anual — renovam sozinhas no fim de cada período, no mesmo cartão, até você cancelar. Os passes não renovam.",
      },
      trial: {
        title: "Teste grátis do Premium",
        body: "{{days}} dias grátis, uma vez por pessoa. Durante o teste nada é cobrado; a primeira cobrança é no dia em que ele acaba, e avisamos por e-mail antes. Cancelou durante o teste? Não paga nada.",
      },
      pass: {
        title: "Passes de 1 e 3 meses",
        body: "Pagamento único: não renovam e não guardam cartão para cobrança futura. No fim, sua conta volta ao Grátis sem perder nada. Comprar outro passe com um ainda valendo soma os meses.",
      },
      cancel: {
        title: "Como cancelar",
        body: "Em Configurações › Seu plano › Gerenciar ou cancelar, a qualquer momento, sem falar com ninguém. O acesso pago continua até o fim do período já pago.",
      },
      refund: {
        title: "Direito de arrependimento",
        body: "Desistiu? Devolvemos o valor integral se você pedir em até 7 dias da contratação. No Premium, vale também até 7 dias depois da primeira cobrança após o teste. Vale para assinaturas e passes. Para pedir, escreva para {{email}}.",
      },
      founder: {
        title: "Preço de fundador",
        body: "Os {{slots}} primeiros assinantes do Premium pagam {{founderPrice}}/mês depois do teste, em vez de {{price}}, enquanto a assinatura continuar ativa. A vaga é conferida no checkout, que mostra o valor exato antes de você pagar.",
      },
      links: "Ao assinar, valem os <terms>Termos de Uso</terms> e a <privacy>Política de Privacidade</privacy>.",
    },
    checkout: {
      stepSummary: "Resumo da compra",
      stepPay: "Pagamento",
      intro: "Confira o que você está contratando. Nada é cobrado nesta tela.",
      labelWhat: "O que é",
      labelToday: "O que inclui hoje",
      labelPrice: "Preço",
      labelRenewal: "Renovação",
      labelFirstCharge: "Cobrança",
      labelCancel: "Cancelar",
      labelRefund: "Arrependimento",
      todayPremium:
        "Selo de Apoiador no seu perfil, este preço travado para sempre e tudo que sair incluído, sem pagar a mais. Alerta de FIPE, caderneta de manutenção e custo projetado estão em construção.",
      todayPro:
        "As ferramentas de quem presta serviço ainda estão em construção — de onde veio cada cliente, relatório mensal e cupom rastreável.",
      priceMonthly: "{{price}} por mês ({{founderPrice}} por mês no preço de fundador, se ainda houver vaga).",
      priceYearly: "{{price}} por ano.",
      pricePass: "{{price}}, pagamento único.",
      renewalMonthly: "Renova automaticamente todo mês até você cancelar.",
      renewalYearly: "Renova automaticamente todo ano até você cancelar.",
      renewalPass: {
        premium_pass_1m: "Não renova. Vale até {{end}} e depois sua conta volta ao Grátis, sem perder nada.",
        premium_pass_3m: "Não renova. Vale até {{end}} e depois sua conta volta ao Grátis, sem perder nada.",
      },
      firstChargeTrial:
        "Hoje: nada. Primeira cobrança em {{date}}, quando acabam os {{days}} dias grátis. Avisamos por e-mail antes.",
      firstChargeTrialUsed: "Você já usou o teste grátis: a primeira cobrança é hoje.",
      firstChargeToday: "Hoje, ao confirmar o pagamento.",
      cancelSubscription:
        "Quando quiser, em Configurações › Seu plano › Gerenciar ou cancelar. O acesso continua até o fim do período pago.",
      cancelPass: "Não há o que cancelar: o passe termina sozinho.",
      refundPlain: "Reembolso integral se pedir em até 7 dias da compra. Escreva para {{email}}.",
      refundTrial:
        "Reembolso integral se pedir em até 7 dias da contratação, e também em até 7 dias depois da primeira cobrança após o teste. Escreva para {{email}}.",
      currencyNote:
        "Valores em reais para o Brasil. Fora do Brasil, a cobrança é na moeda do seu país, e a próxima tela mostra o valor exato antes de você pagar.",
      agree: "Ao continuar, você concorda com os <terms>Termos de Uso</terms> e a <privacy>Política de Privacidade</privacy>.",
      back: "Voltar",
      backToSummary: "Voltar ao resumo",
      continue: "Continuar para o pagamento",
      redirecting: "Abrindo o pagamento…",
      genericError: "Não foi possível abrir o pagamento. Tente de novo.",
      stripeFailed:
        "O pagamento não carregou. Um bloqueador de anúncios ou a conexão pode estar impedindo. Tente de novo em instantes.",
    },
    support: {
      eyebrow: "Apoie o Engine",
      title: "Quem mantém o Engine de pé é quem usa",
      subtitle:
        "O Engine é grátis e vai continuar grátis. Se ele te ajuda, dá para ajudar de volta — de dois jeitos.",
      premium: {
        title: "O jeito principal: assinar o Pro",
        body: "Assinar o Pro (a partir de {{price}} por mês) é a forma de apoio que paga as contas todo mês. Você entra com o preço travado para sempre e recebe tudo que sair, assim que sair.",
        cta: "Ver os planos",
      },
      where: {
        title: "Para onde vai o dinheiro",
        subtitle: "Sem mistério: são três contas.",
        servers: {
          title: "Servidores",
          body: "Banco de dados, login, fotos e hospedagem do app, que crescem com cada pessoa que entra.",
        },
        data: {
          title: "Dados",
          body: "Manter atualizados os preços de combustível, a tabela FIPE e os juros que o simulador usa.",
        },
        development: {
          title: "Desenvolvimento",
          body: "Corrigir o que quebra e construir o que está marcado como “Em breve”.",
        },
      },
      pix: {
        title: "Doação por Pix",
        body: "Uma contribuição voluntária, de qualquer valor, para apoiar o projeto, manter os servidores no ar e acelerar o desenvolvimento do Engine.",
        keyLabel: "Chave Pix",
        copy: "Copiar chave",
        copied: "Chave Pix copiada.",
        copiedShort: "Copiada",
        copyFallback: "Não deu para copiar sozinho. A chave ficou selecionada: copie com o menu do aparelho.",
        noReward: "Apoio voluntário e espontâneo (não vinculado a planos pagos ou selos).",
        checkName: "Confira os dados do recebedor no app do seu banco antes de confirmar.",
      },
      sponsor: {
        title: "Tem uma empresa?",
        body: "Oficinas, autopeças, seguradoras, marcas e organizadores de evento podem patrocinar o Engine.",
        cta: "Patrocine",
      },
    },
    advertise: {
      eyebrow: "Anuncie no Engine",
      title: "Sua marca perto de quem cuida de carro",
      subtitle:
        "Para oficinas, autopeças, seguradoras, marcas e organizadores de eventos. Patrocínio local, rotulado e sem bagunçar o que o usuário veio ver.",
      formats: {
        title: "Formatos",
        // Nenhum destes é autoatendimento: não existe botão de comprar, nem
        // painel. Cada patrocínio é montado com a marca, um a um. Dizer isso
        // aqui é o que impede a página de parecer um catálogo que já roda
        // sozinho. (06/11/2026)
        note: "Nada aqui é autoatendimento: cada patrocínio é combinado e montado junto com a marca, um a um.",
        city: {
          title: "Cota por cidade",
          body: "“Serviços em [cidade] oferecido por [sua marca]”. Sua marca acompanha a busca de serviços de uma cidade inteira.",
          rule: "Uma marca por cidade, rotulada como patrocínio.",
        },
        event: {
          title: "Encontro ou evento de clube",
          body: "Patrocine um encontro do Engine ou o evento de um clube da comunidade.",
          rule: "Só com o aceite do fundador do clube, e sempre rotulado como patrocinado.",
        },
        featured: {
          title: "Destaque regional em Serviços",
          body: "Seu serviço numa faixa de destaque na aba Serviços da sua região.",
          rule: "Faixa separada, com o rótulo “Patrocinado”. Nunca muda a ordem da lista normal.",
        },
      },
      rules: {
        title: "Como a gente faz",
        labeled: "Todo conteúdo pago aparece rotulado como patrocinado. Ninguém confunde anúncio com recomendação.",
        organic: "Patrocínio não compra posição na lista de serviços: ela continua na ordem de sempre.",
        checked: "Conferimos quem anuncia antes de publicar.",
        price: "Não temos tabela de preço publicada: o valor depende da cidade e do formato. Fale com a gente.",
      },
      stats: {
        title: "O Engine hoje",
        profiles: "perfis públicos",
        services: "serviços publicados",
        events: "eventos criados",
        note: "Contados agora no banco do Engine, sem arredondar.",
      },
      form: {
        title: "Fale com a gente",
        subtitle: "Conte o que você procura. Respondemos por e-mail.",
        name: "Seu nome",
        company: "Empresa",
        email: "E-mail",
        whatsapp: "WhatsApp",
        optional: "opcional",
        city: "Cidade",
        state: "Estado",
        format: "Formato de interesse",
        formats: {
          city: "Cota por cidade",
          event: "Encontro ou evento de clube",
          featured: "Destaque regional em Serviços",
          other: "Outro / ainda não sei",
        },
        message: "Mensagem",
        messageHint: "Período, orçamento, público que quer alcançar — o que ajudar.",
        consent:
          "Concordo que o Engine use estes dados só para responder minha proposta. Veja a <privacy>Política de Privacidade</privacy>.",
        emailAlt: "Prefere e-mail? {{email}}",
        submit: "Enviar proposta",
        sendError: "Não deu para enviar agora. Tente de novo ou escreva para {{email}}.",
        sentTitle: "Recebemos sua proposta",
        sentBody: "Vamos responder em {{email}}. Obrigado pelo interesse no Engine.",
        sendAnother: "Enviar outra",
        errors: {
          name: "Diga seu nome.",
          company: "Diga o nome da empresa.",
          email: "Confira o e-mail.",
          city: "Diga a cidade.",
          consent: "Precisamos do seu aceite para guardar os dados.",
        },
      },
    },
  },
};

const enUS = {
  countryPrompt: {
    title: "Which country are you in?",
    body: "We use your country to charge in your currency and show what's near you. You can change it later when editing your profile.",
    label: "Country",
    detected: "Detected from your connection. Please check it's right.",
    confirm: "Confirm",
    skip: "Not now",
    error: "Couldn't save right now. Try again or skip — you can change it later in your profile.",
  },
  nav: { plans: "Plans" },
  footer: {
    company: {
      plans: "Plans",
      support: "Support Engine",
      advertise: "Advertise",
    },
  },
  billing: {
    offers: {
      pro_monthly: {
        name: "Engine Premium — monthly",
        what: "Monthly Engine Premium subscription, for service providers. Includes everything in Pro.",
      },
      premium_monthly: {
        name: "Engine Pro — monthly",
        what: "Monthly Engine Pro subscription, for car owners.",
      },
      premium_yearly: {
        name: "Engine Pro — yearly",
        what: "Yearly Engine Pro subscription, for car owners.",
      },
      premium_pass_1m: {
        name: "Engine Pro — 1-month pass",
        what: "1-month Engine Pro pass. One-time payment.",
      },
      premium_pass_3m: {
        name: "Engine Pro — 3-month pass",
        what: "3-month Engine Pro pass. One-time payment.",
      },
    },
    plans: {
      eyebrow: "Plans",
      title: "Engine is free. Plans only add to it.",
      subtitle:
        "Everything the app has today is free and stays free. Subscribers get the extras — and keep Engine running for everyone.",
      soon: "Coming soon",
      perYear: "per year",
      perMonth: "per month",
      oneTime: "one-time payment",
      currentTitle: "Your plan: {{plan}}",
      currentHint: "Dates, billing and cancellation live in Settings › Your plan.",
      notOpen: "Subscriptions are not open yet. The prices below are the ones that will apply when they open.",
      supportLink: "Want to help without subscribing? See <support>other ways to support Engine</support>.",
      cta: {
        soon: "Subscriptions coming soon",
          notify: "Tell me when it opens",
        login: "Sign in to subscribe",
        manage: "Settings › Your plan",
        register: "Create a free account",
        current: "Your current plan",
        includedInPro: "Included in your Premium",
        passActiveYearly:
          "Your pass is valid until {{date}}. So you don't pay twice for the same period, the yearly plan opens up when it ends — or extend it with another pass.",
        subscribePremium: "Subscribe to Pro",
        buyPass: "Buy pass",
        switchHint: "You already have a subscription. To switch plans, cancel the current one first.",
        subscribePro: "Subscribe to Premium",
        startTrial: "Start {{days}} days free",
      },
      free: {
        eyebrow: "For everyone",
        name: "Free",
        audience: "Everything Engine has today. No time limit, no card.",
        forever: "forever",
        always: "Stays with you on any plan.",
      },
        building: {
          label: "Being built:",
          entry: "FIPE price alerts and history for your car, a maintenance logbook and projected cost over 3 and 5 years. You pay nothing extra when they ship.",
          provider: "The tools for people who live off this: where each customer came from, a monthly report, a trackable coupon and featured placement.",
          providerWhy: "Not on sale yet, and the reason is honest: measuring an audience only matters once there is an audience to measure. It opens when the marketplace has traffic — and whoever joins first pays the founder price.",
        },
      premium: {
        badge: "For car owners",
        eyebrow: "Pro",
        audience: "For people who own a car or are deciding which one to buy.",
        yearlyNote: "Billed {{yearly}} once a year — {{percent}}% less than paying monthly. Renews every year until you cancel.",
        monthlyNote: "Renews every month until you cancel. Cancel anytime.",
        passNote: {
          premium_pass_1m: "Lasts 1 month. Does not renew and keeps no card on file.",
          premium_pass_3m: "Lasts 3 months. Does not renew and keeps no card on file.",
        },
        chooseLabel: "Choose how to pay",
        option: {
          premium_monthly: "Monthly · {{price}}",
          premium_yearly: "Yearly · {{price}}",
          premium_pass_3m: "3-month pass · {{price}}",
          premium_pass_1m: "1-month pass · {{price}}",
        },
        save: "−{{percent}}%",
        renews: "renews",
        noRenew: "no renewal",
        honest:
          "Today Pro removes ads. The other items don't exist in the app yet: they are marked “Coming soon”. Subscribe for what it already delivers.",
      },
      pro: {
        eyebrow: "Premium",
        audience: "For service providers: repair shops, detailing, body shops, mechanics.",
        trialNote: "{{days}} days free to start. Then billed monthly until you cancel.",
        trialUsed: "You have already used the free trial: billing starts on the day you subscribe.",
        founder:
          "Founder price: the first {{slots}} subscribers pay {{founderPrice}}/month instead of {{price}}, as long as the subscription stays active. If a spot is still open, checkout already shows the lower price.",
        honest:
          "Listing a service and seeing basic metrics is already free. The Premium tools don't exist in the app yet: they are marked “Coming soon”. Today Premium delivers the same as Pro.",
      },
    },
    features: {
      free: {
        garage: "Garage with your cars and buying goals",
        specs: "Spec sheet for your exact trim",
        simulator: "Real cost simulator, with the full financing interest",
        maintenance: "Scheduled maintenance and tax reminders",
        quotes: "Request and receive quotes",
        reviews: "Review and be reviewed",
        community: "Community, Messages, Clubs and Events",
        services: "List your service",
      },
      founder: {
        supporterBadge: "Supporter badge on your profile",
        priceLock: "This price locked forever, even when it goes up",
        earlyAccess: "Everything that ships, the day it ships, at no extra cost",
      },
      premium: {
        noAds: "No ads",
        fipeAlert: "FIPE price alerts and history for your car",
        maintenance: "Scheduled maintenance and service log",
        totalCost: "Total cost over 3 and 5 years",
        comparator: "Detailed car comparison",
        resale: "Resale dossier",
        supporterBadge: "Supporter badge on your profile",
      },
      pro: {
        allPremium: "Everything in Pro",
        monthlyMetrics: "Month-by-month metrics and where each customer came from",
        monthlyReport: "Monthly report",
        quotes: "Quote requests",
        coupon: "Trackable coupon",
        reviews: "Review tools",
      },
    },
    legal: {
      title: "Before you subscribe",
      renewal: {
        title: "Automatic renewal",
        body: "Subscriptions — Premium and Pro, monthly or yearly — renew automatically at the end of each period, on the same card, until you cancel. Passes do not renew.",
      },
      trial: {
        title: "Premium free trial",
        body: "{{days}} days free, once per person. Nothing is charged during the trial; the first charge happens the day it ends, and we email you beforehand. Cancel during the trial and you pay nothing.",
      },
      pass: {
        title: "1- and 3-month passes",
        body: "One-time payment: they don't renew and keep no card for future charges. When a pass ends, your account goes back to Free without losing anything. Buying another pass while one is active adds the months.",
      },
      cancel: {
        title: "How to cancel",
        body: "In Settings › Your plan › Manage or cancel, anytime, without talking to anyone. Paid access continues until the end of the period you already paid for.",
      },
      refund: {
        title: "Right of withdrawal",
        body: "Changed your mind? We refund the full amount if you ask within 7 days of subscribing. For Premium, this also applies within 7 days of the first charge after the trial. It covers subscriptions and passes. To ask, email {{email}}.",
      },
      founder: {
        title: "Founder price",
        body: "The first {{slots}} Premium subscribers pay {{founderPrice}}/month after the trial instead of {{price}}, as long as the subscription stays active. The spot is checked at checkout, which shows the exact amount before you pay.",
      },
      links: "Subscriptions are governed by the <terms>Terms of Use</terms> and the <privacy>Privacy Policy</privacy>.",
    },
    checkout: {
      stepSummary: "Order summary",
      stepPay: "Payment",
      intro: "Check what you are signing up for. Nothing is charged on this screen.",
      labelWhat: "What it is",
      labelToday: "What it includes today",
      labelPrice: "Price",
      labelRenewal: "Renewal",
      labelFirstCharge: "Billing",
      labelCancel: "Cancel",
      labelRefund: "Withdrawal",
      todayPremium:
        "Supporter badge on your profile, this price locked forever and everything that ships included, at no extra cost. FIPE alerts, the maintenance logbook and projected cost are being built.",
      todayPro:
        "The tools for service providers are still being built — where each customer came from, a monthly report and a trackable coupon.",
      priceMonthly: "{{price}} per month ({{founderPrice}} per month at the founder price, if a spot is still open).",
      priceYearly: "{{price}} per year.",
      pricePass: "{{price}}, one-time payment.",
      renewalMonthly: "Renews automatically every month until you cancel.",
      renewalYearly: "Renews automatically every year until you cancel.",
      renewalPass: {
        premium_pass_1m: "Does not renew. Valid until {{end}}, then your account goes back to Free without losing anything.",
        premium_pass_3m: "Does not renew. Valid until {{end}}, then your account goes back to Free without losing anything.",
      },
      firstChargeTrial:
        "Today: nothing. First charge on {{date}}, when the {{days}} free days end. We email you beforehand.",
      firstChargeTrialUsed: "You have already used the free trial: the first charge is today.",
      firstChargeToday: "Today, when you confirm the payment.",
      cancelSubscription:
        "Anytime, in Settings › Your plan › Manage or cancel. Access continues until the end of the paid period.",
      cancelPass: "Nothing to cancel: the pass ends on its own.",
      refundPlain: "Full refund if you ask within 7 days of purchase. Email {{email}}.",
      refundTrial:
        "Full refund if you ask within 7 days of subscribing, and also within 7 days of the first charge after the trial. Email {{email}}.",
      currencyNote:
        "Prices in Brazilian reais apply in Brazil. Elsewhere you are charged in your country's currency, and the next screen shows the exact amount before you pay.",
      agree: "By continuing, you agree to the <terms>Terms of Use</terms> and the <privacy>Privacy Policy</privacy>.",
      back: "Back",
      backToSummary: "Back to summary",
      continue: "Continue to payment",
      redirecting: "Opening payment…",
      genericError: "We couldn't open the payment. Please try again.",
      stripeFailed:
        "The payment form didn't load. An ad blocker or your connection may be blocking it. Try again in a moment.",
    },
    support: {
      eyebrow: "Support Engine",
      title: "Engine is kept running by the people who use it",
      subtitle: "Engine is free and will stay free. If it helps you, you can help back — in two ways.",
      premium: {
        title: "The main way: subscribe to Pro",
        body: "Subscribing to Pro (from {{price}} a month) is the kind of support that pays the bills every month. You lock this price forever and get everything that ships, the day it ships.",
        cta: "See plans",
      },
      where: {
        title: "Where the money goes",
        subtitle: "No mystery: three bills.",
        servers: {
          title: "Servers",
          body: "Database, sign-in, photos and app hosting, which grow with every new person.",
        },
        data: {
          title: "Data",
          body: "Keeping fuel prices, the FIPE table and the interest rates the simulator uses up to date.",
        },
        development: {
          title: "Development",
          body: "Fixing what breaks and building what is marked “Coming soon”.",
        },
      },
      pix: {
        title: "Donate via Pix",
        body: "A voluntary contribution of any amount to support the project, keep servers running, and accelerate Engine's development.",
        keyLabel: "Pix key",
        copy: "Copy key",
        copied: "Pix key copied.",
        copiedShort: "Copied",
        copyFallback: "We couldn't copy it automatically. The key is selected: copy it with your device menu.",
        noReward: "Voluntary support (not tied to paid plans, features, or badges).",
        checkName: "Check the recipient details in your banking app before confirming.",
      },
      sponsor: {
        title: "Run a business?",
        body: "Repair shops, parts stores, insurers, brands and event organizers can sponsor Engine.",
        cta: "Sponsor",
      },
    },
    advertise: {
      eyebrow: "Advertise on Engine",
      title: "Your brand close to people who care for cars",
      subtitle:
        "For repair shops, parts stores, insurers, brands and event organizers. Local sponsorship, clearly labeled, without getting in the way of what users came for.",
      formats: {
        title: "Formats",
        note: "None of this is self-serve: every sponsorship is agreed and set up with the brand, one at a time.",
        city: {
          title: "City sponsorship",
          body: "“Services in [city] brought to you by [your brand]”. Your brand appears alongside service search for an entire city.",
          rule: "One brand per city, labeled as sponsorship.",
        },
        event: {
          title: "Meetup or club event",
          body: "Sponsor an Engine meetup or a community club's event.",
          rule: "Only with the club founder's approval, and always labeled as sponsored.",
        },
        featured: {
          title: "Regional highlight in Services",
          body: "Your service in a featured strip on the Services tab for your region.",
          rule: "A separate strip labeled “Sponsored”. It never changes the order of the regular list.",
        },
      },
      rules: {
        title: "How we do it",
        labeled: "All paid content is labeled as sponsored. Nobody mistakes an ad for a recommendation.",
        organic: "Sponsorship doesn't buy a position in the services list: it keeps its usual order.",
        checked: "We check who is advertising before anything goes live.",
        price: "We don't publish a price list: it depends on the city and format. Get in touch.",
      },
      stats: {
        title: "Engine today",
        profiles: "public profiles",
        services: "published services",
        events: "events created",
        note: "Counted live from Engine's database, not rounded.",
      },
      form: {
        title: "Get in touch",
        subtitle: "Tell us what you are looking for. We reply by email.",
        name: "Your name",
        company: "Company",
        email: "Email",
        whatsapp: "WhatsApp",
        optional: "optional",
        city: "City",
        state: "State",
        format: "Format you're interested in",
        formats: {
          city: "City sponsorship",
          event: "Meetup or club event",
          featured: "Regional highlight in Services",
          other: "Other / not sure yet",
        },
        message: "Message",
        messageHint: "Timing, budget, audience you want to reach — whatever helps.",
        consent:
          "I agree that Engine may use this data only to reply to my proposal. See the <privacy>Privacy Policy</privacy>.",
        emailAlt: "Prefer email? {{email}}",
        submit: "Send proposal",
        sendError: "We couldn't send it right now. Try again or email {{email}}.",
        sentTitle: "We got your proposal",
        sentBody: "We'll reply to {{email}}. Thanks for your interest in Engine.",
        sendAnother: "Send another",
        errors: {
          name: "Tell us your name.",
          company: "Tell us the company name.",
          email: "Check the email address.",
          city: "Tell us the city.",
          consent: "We need your consent to store this data.",
        },
      },
    },
  },
};

const esES = {
  countryPrompt: {
    title: "¿En qué país estás?",
    body: "Usamos el país para cobrarte en tu moneda y mostrarte lo que está cerca de ti. Puedes cambiarlo después al editar tu perfil.",
    label: "País",
    detected: "Detectado por tu conexión. Comprueba que sea correcto.",
    confirm: "Confirmar",
    skip: "Ahora no",
    error: "No se pudo guardar ahora. Inténtalo de nuevo o sáltalo — puedes cambiarlo después en tu perfil.",
  },
  nav: { plans: "Planes" },
  footer: {
    company: {
      plans: "Planes",
      support: "Apoya a Engine",
      advertise: "Anúnciate",
    },
  },
  billing: {
    offers: {
      pro_monthly: {
        name: "Engine Premium — mensual",
        what: "Suscripción mensual de Engine Premium, para quien presta servicios. Incluye todo lo de Pro.",
      },
      premium_monthly: {
        name: "Engine Pro — mensual",
        what: "Suscripción mensual de Engine Pro, para el dueño del coche.",
      },
      premium_yearly: {
        name: "Engine Pro — anual",
        what: "Suscripción anual de Engine Pro, para el dueño del coche.",
      },
      premium_pass_1m: {
        name: "Engine Pro — pase de 1 mes",
        what: "Pase de 1 mes de Engine Pro. Pago único.",
      },
      premium_pass_3m: {
        name: "Engine Pro — pase de 3 meses",
        what: "Pase de 3 meses de Engine Pro. Pago único.",
      },
    },
    plans: {
      eyebrow: "Planes",
      title: "Engine es gratis. Los planes solo suman.",
      subtitle:
        "Todo lo que la app tiene hoy es gratis y seguirá siéndolo. Quien se suscribe recibe lo extra — y mantiene Engine para todos.",
      soon: "Próximamente",
      perYear: "al año",
      perMonth: "al mes",
      oneTime: "pago único",
      currentTitle: "Tu plan: {{plan}}",
      currentHint: "Fechas, cobros y cancelación están en Configuración › Tu plan.",
      notOpen: "Las suscripciones aún no están abiertas. Los precios de abajo son los que valdrán cuando abran.",
      supportLink: "¿Quieres apoyar sin suscribirte? Mira <support>otras formas de apoyar a Engine</support>.",
      cta: {
        soon: "Suscripción próximamente",
          notify: "Avísame cuando abra",
        login: "Inicia sesión para suscribirte",
        manage: "Configuración › Tu plan",
        register: "Crear cuenta gratis",
        current: "Tu plan actual",
        includedInPro: "Incluido en tu Premium",
        passActiveYearly:
          "Tu pase vale hasta el {{date}}. Para no pagar dos veces el mismo periodo, el anual estará disponible cuando termine — o amplíalo con otro pase.",
        subscribePremium: "Suscribirme a Pro",
        buyPass: "Comprar pase",
        switchHint: "Ya tienes una suscripción. Para cambiar de plan, cancela primero la actual.",
        subscribePro: "Suscribirme a Premium",
        startTrial: "Empezar {{days}} días gratis",
      },
      free: {
        eyebrow: "Para todos",
        name: "Gratis",
        audience: "Todo lo que Engine tiene hoy. Sin plazo y sin tarjeta.",
        forever: "para siempre",
        always: "Sigue contigo en cualquier plan.",
      },
        building: {
          label: "En construcción:",
          entry: "alertas e historial de precio de tu coche, libreta de mantenimiento y coste proyectado a 3 y 5 años. No pagas nada más cuando salgan.",
          provider: "Las herramientas de quien vive de esto: de dónde vino cada cliente, informe mensual, cupón rastreable y destaque en el escaparate.",
          providerWhy: "Todavía no está a la venta, y el motivo es honesto: medir audiencia solo vale cuando hay audiencia que medir. Abre cuando el escaparate tenga movimiento — y quien entre primero paga precio de fundador.",
        },
      premium: {
        badge: "Para el dueño del coche",
        eyebrow: "Pro",
        audience: "Para quien tiene coche o está decidiendo cuál comprar.",
        yearlyNote: "Se cobra {{yearly}} una vez al año — {{percent}}% menos que pagar mes a mes. Se renueva cada año hasta que canceles.",
        monthlyNote: "Se renueva cada mes hasta que canceles. Cancela cuando quieras.",
        passNote: {
          premium_pass_1m: "Vale 1 mes. No se renueva y no guarda la tarjeta.",
          premium_pass_3m: "Vale 3 meses. No se renueva y no guarda la tarjeta.",
        },
        chooseLabel: "Elige cómo pagar",
        option: {
          premium_monthly: "Mensual · {{price}}",
          premium_yearly: "Anual · {{price}}",
          premium_pass_3m: "Pase de 3 meses · {{price}}",
          premium_pass_1m: "Pase de 1 mes · {{price}}",
        },
        save: "−{{percent}}%",
        renews: "se renueva",
        noRenew: "no se renueva",
        honest:
          "Hoy Pro quita los anuncios. Los demás elementos aún no existen en la app: están marcados como “Próximamente”. Suscríbete por lo que ya ofrece.",
      },
      pro: {
        eyebrow: "Premium",
        audience: "Para quien presta servicios: talleres, detailing, chapa y pintura, mecánicos.",
        trialNote: "{{days}} días gratis para empezar. Después, cobro mensual hasta que canceles.",
        trialUsed: "Ya usaste la prueba gratis: el cobro empieza el día de la suscripción.",
        founder:
          "Precio de fundador: los primeros {{slots}} suscriptores pagan {{founderPrice}}/mes en lugar de {{price}}, mientras la suscripción siga activa. Si aún hay plaza, el pago ya muestra el precio menor.",
        honest:
          "Publicar un servicio y ver las métricas básicas ya es gratis. Las herramientas de Premium aún no existen en la app: están marcadas como “Próximamente”. Hoy Premium ofrece lo mismo que Pro.",
      },
    },
    features: {
      free: {
        garage: "Garaje con tus coches y metas de compra",
        specs: "Ficha técnica de la versión de tu coche",
        simulator: "Simulador de coste real, con los intereses totales de la financiación",
        maintenance: "Mantenimiento programado y recordatorios de impuestos",
        quotes: "Pedir y recibir presupuestos",
        reviews: "Valorar y ser valorado",
        community: "Comunidad, Mensajes, Clubes y Eventos",
        services: "Publicar tu servicio",
      },
      founder: {
        supporterBadge: "Distintivo de Apoyo en tu perfil",
        priceLock: "Este precio congelado para siempre, aunque suba",
        earlyAccess: "Todo lo que salga, en cuanto salga, sin pagar de más",
      },
      premium: {
        noAds: "Sin anuncios",
        fipeAlert: "Alerta e historial FIPE de tu coche",
        maintenance: "Mantenimiento programado y libreta",
        totalCost: "Coste total a 3 y 5 años",
        comparator: "Comparador detallado de coches",
        resale: "Dosier de reventa",
        supporterBadge: "Insignia de Apoyo en el perfil",
      },
      pro: {
        allPremium: "Todo lo de Pro",
        monthlyMetrics: "Métricas mes a mes y de dónde vino cada cliente",
        monthlyReport: "Informe mensual",
        quotes: "Solicitudes de presupuesto",
        coupon: "Cupón rastreable",
        reviews: "Herramientas de reseñas",
      },
    },
    legal: {
      title: "Antes de suscribirte",
      renewal: {
        title: "Renovación automática",
        body: "Las suscripciones — Premium y Pro, mensual o anual — se renuevan solas al final de cada periodo, con la misma tarjeta, hasta que canceles. Los pases no se renuevan.",
      },
      trial: {
        title: "Prueba gratis de Premium",
        body: "{{days}} días gratis, una vez por persona. Durante la prueba no se cobra nada; el primer cobro es el día en que termina, y te avisamos por correo antes. ¿Cancelas durante la prueba? No pagas nada.",
      },
      pass: {
        title: "Pases de 1 y 3 meses",
        body: "Pago único: no se renuevan y no guardan la tarjeta para cobros futuros. Al terminar, tu cuenta vuelve a Gratis sin perder nada. Comprar otro pase con uno vigente suma los meses.",
      },
      cancel: {
        title: "Cómo cancelar",
        body: "En Configuración › Tu plan › Gestionar o cancelar, cuando quieras, sin hablar con nadie. El acceso de pago sigue hasta el final del periodo ya pagado.",
      },
      refund: {
        title: "Derecho de desistimiento",
        body: "¿Te arrepientes? Devolvemos el importe íntegro si lo pides en un plazo de 7 días desde la contratación. En Premium, también hasta 7 días después del primer cobro tras la prueba. Vale para suscripciones y pases. Para pedirlo, escribe a {{email}}.",
      },
      founder: {
        title: "Precio de fundador",
        body: "Los primeros {{slots}} suscriptores de Premium pagan {{founderPrice}}/mes tras la prueba, en lugar de {{price}}, mientras la suscripción siga activa. La plaza se comprueba en el pago, que muestra el importe exacto antes de pagar.",
      },
      links: "Al suscribirte, rigen los <terms>Términos de uso</terms> y la <privacy>Política de privacidad</privacy>.",
    },
    checkout: {
      stepSummary: "Resumen de la compra",
      stepPay: "Pago",
      intro: "Revisa lo que contratas. En esta pantalla no se cobra nada.",
      labelWhat: "Qué es",
      labelToday: "Qué incluye hoy",
      labelPrice: "Precio",
      labelRenewal: "Renovación",
      labelFirstCharge: "Cobro",
      labelCancel: "Cancelar",
      labelRefund: "Desistimiento",
      todayPremium:
        "Distintivo de Apoyo en tu perfil, este precio congelado para siempre y todo lo que salga incluido, sin pagar de más. Las alertas de precio, la libreta de mantenimiento y el coste proyectado están en construcción.",
      todayPro:
        "Las herramientas de quien presta servicios aún están en construcción — de dónde vino cada cliente, informe mensual y cupón rastreable.",
      priceMonthly: "{{price}} al mes ({{founderPrice}} al mes con precio de fundador, si aún hay plaza).",
      priceYearly: "{{price}} al año.",
      pricePass: "{{price}}, pago único.",
      renewalMonthly: "Se renueva automáticamente cada mes hasta que canceles.",
      renewalYearly: "Se renueva automáticamente cada año hasta que canceles.",
      renewalPass: {
        premium_pass_1m: "No se renueva. Vale hasta el {{end}} y después tu cuenta vuelve a Gratis, sin perder nada.",
        premium_pass_3m: "No se renueva. Vale hasta el {{end}} y después tu cuenta vuelve a Gratis, sin perder nada.",
      },
      firstChargeTrial:
        "Hoy: nada. Primer cobro el {{date}}, cuando terminan los {{days}} días gratis. Te avisamos por correo antes.",
      firstChargeTrialUsed: "Ya usaste la prueba gratis: el primer cobro es hoy.",
      firstChargeToday: "Hoy, al confirmar el pago.",
      cancelSubscription:
        "Cuando quieras, en Configuración › Tu plan › Gestionar o cancelar. El acceso sigue hasta el final del periodo pagado.",
      cancelPass: "No hay nada que cancelar: el pase termina solo.",
      refundPlain: "Reembolso íntegro si lo pides en un plazo de 7 días desde la compra. Escribe a {{email}}.",
      refundTrial:
        "Reembolso íntegro si lo pides en un plazo de 7 días desde la contratación, y también hasta 7 días después del primer cobro tras la prueba. Escribe a {{email}}.",
      currencyNote:
        "Precios en reales para Brasil. Fuera de Brasil, el cobro es en la moneda de tu país, y la siguiente pantalla muestra el importe exacto antes de pagar.",
      agree: "Al continuar, aceptas los <terms>Términos de uso</terms> y la <privacy>Política de privacidad</privacy>.",
      back: "Volver",
      backToSummary: "Volver al resumen",
      continue: "Continuar al pago",
      redirecting: "Abriendo el pago…",
      genericError: "No se pudo abrir el pago. Inténtalo de nuevo.",
      stripeFailed:
        "El pago no se cargó. Un bloqueador de anuncios o la conexión pueden estar impidiéndolo. Inténtalo de nuevo en un momento.",
    },
    support: {
      eyebrow: "Apoya a Engine",
      title: "A Engine lo mantienen en pie quienes lo usan",
      subtitle: "Engine es gratis y seguirá siéndolo. Si te ayuda, puedes ayudar de vuelta — de dos formas.",
      premium: {
        title: "La forma principal: suscribirte a Pro",
        body: "Suscribirte a Pro (desde {{price}} al mes) es el apoyo que paga las cuentas cada mes. Entras con el precio congelado para siempre y recibes todo lo que salga, en cuanto salga.",
        cta: "Ver los planes",
      },
      where: {
        title: "A dónde va el dinero",
        subtitle: "Sin misterio: son tres cuentas.",
        servers: {
          title: "Servidores",
          body: "Base de datos, inicio de sesión, fotos y alojamiento de la app, que crecen con cada persona nueva.",
        },
        data: {
          title: "Datos",
          body: "Mantener al día los precios del combustible, la tabla FIPE y los intereses que usa el simulador.",
        },
        development: {
          title: "Desarrollo",
          body: "Arreglar lo que falla y construir lo que está marcado como “Próximamente”.",
        },
      },
      pix: {
        title: "Donación por Pix",
        body: "Una contribución voluntaria, de cualquier importe, para apoyar el proyecto, mantener los servidores activos y acelerar el desarrollo de Engine.",
        keyLabel: "Clave Pix",
        copy: "Copiar clave",
        copied: "Clave Pix copiada.",
        copiedShort: "Copiada",
        copyFallback: "No se pudo copiar automáticamente. La clave quedó seleccionada: cópiala con el menú del dispositivo.",
        noReward: "Apoyo voluntario (no vinculado a planes de pago, funciones o insignias).",
        checkName: "Comprueba los datos del destinatario en la app de tu banco antes de confirmar.",
      },
      sponsor: {
        title: "¿Tienes una empresa?",
        body: "Talleres, recambios, aseguradoras, marcas y organizadores de eventos pueden patrocinar Engine.",
        cta: "Patrocina",
      },
    },
    advertise: {
      eyebrow: "Anúnciate en Engine",
      title: "Tu marca cerca de quien cuida su coche",
      subtitle:
        "Para talleres, recambios, aseguradoras, marcas y organizadores de eventos. Patrocinio local, identificado y sin estorbar lo que el usuario vino a ver.",
      formats: {
        title: "Formatos",
        note: "Nada de esto es autoservicio: cada patrocinio se acuerda y se monta junto a la marca, uno a uno.",
        city: {
          title: "Patrocinio por ciudad",
          body: "“Servicios en [ciudad] ofrecido por [tu marca]”. Tu marca acompaña la búsqueda de servicios de toda una ciudad.",
          rule: "Una marca por ciudad, identificada como patrocinio.",
        },
        event: {
          title: "Quedada o evento de club",
          body: "Patrocina una quedada de Engine o el evento de un club de la comunidad.",
          rule: "Solo con la aprobación del fundador del club, y siempre identificado como patrocinado.",
        },
        featured: {
          title: "Destacado regional en Servicios",
          body: "Tu servicio en una franja destacada de la pestaña Servicios de tu región.",
          rule: "Franja separada con la etiqueta “Patrocinado”. Nunca cambia el orden de la lista normal.",
        },
      },
      rules: {
        title: "Cómo lo hacemos",
        labeled: "Todo contenido pagado aparece identificado como patrocinado. Nadie confunde un anuncio con una recomendación.",
        organic: "El patrocinio no compra posición en la lista de servicios: mantiene su orden de siempre.",
        checked: "Comprobamos quién se anuncia antes de publicar.",
        price: "No publicamos tarifas: el precio depende de la ciudad y del formato. Escríbenos.",
      },
      stats: {
        title: "Engine hoy",
        profiles: "perfiles públicos",
        services: "servicios publicados",
        events: "eventos creados",
        note: "Contados ahora en la base de datos de Engine, sin redondear.",
      },
      form: {
        title: "Escríbenos",
        subtitle: "Cuéntanos qué buscas. Respondemos por correo.",
        name: "Tu nombre",
        company: "Empresa",
        email: "Correo",
        whatsapp: "WhatsApp",
        optional: "opcional",
        city: "Ciudad",
        state: "Provincia / estado",
        format: "Formato de interés",
        formats: {
          city: "Patrocinio por ciudad",
          event: "Quedada o evento de club",
          featured: "Destacado regional en Servicios",
          other: "Otro / aún no lo sé",
        },
        message: "Mensaje",
        messageHint: "Fechas, presupuesto, público al que quieres llegar — lo que ayude.",
        consent:
          "Acepto que Engine use estos datos solo para responder a mi propuesta. Consulta la <privacy>Política de privacidad</privacy>.",
        emailAlt: "¿Prefieres correo? {{email}}",
        submit: "Enviar propuesta",
        sendError: "No se pudo enviar ahora. Inténtalo de nuevo o escribe a {{email}}.",
        sentTitle: "Recibimos tu propuesta",
        sentBody: "Responderemos a {{email}}. Gracias por tu interés en Engine.",
        sendAnother: "Enviar otra",
        errors: {
          name: "Dinos tu nombre.",
          company: "Dinos el nombre de la empresa.",
          email: "Revisa el correo.",
          city: "Dinos la ciudad.",
          consent: "Necesitamos tu consentimiento para guardar los datos.",
        },
      },
    },
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
