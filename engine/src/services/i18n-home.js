import i18n from "./i18n";

/**
 * Textos da Home do visitante (o que aparece em "/" para quem não entrou).
 *
 * Mora fora do i18n.js pelo mesmo motivo dos outros pacotes: aquele arquivo é
 * editado por várias frentes ao mesmo tempo. Entra por `addResourceBundle`
 * com deep merge.
 *
 * Regra destes textos: nada que o app não entregue. O simulador só responde
 * para carros no Brasil, e a Home diz isso; nenhum número de exemplo é
 * inventado aqui — a conta de verdade só aparece com o carro de verdade.
 */

const ptBR = {
  visitorHome: {
    eyebrow: "Garagem · custo real · comunidade · serviços",
    title: "Descubra quanto seu carro custa de verdade.",
    subtitle:
      "Guarde seus carros, veja o custo do mês com IPVA, seguro, combustível e manutenção, encontre serviços automotivos perto de você e acompanhe quem curte carro.",
    ctaRegister: "Criar conta grátis",
    ctaServices: "Explorar serviços",
    haveAccount: "Já tem conta?",
    signIn: "Entrar",
    pillars: {
      label: "O que dá para fazer no Engine",
      open: "Aberto a todos",
      withAccount: "Grátis, com conta",
      garage: { title: "Garagem", desc: "Seus carros e metas, com a ficha técnica da versão." },
      cost: { title: "Custo real", desc: "Quanto o carro pesa no mês, somando tudo." },
      community: { title: "Comunidade", desc: "Posts, clubes e encontros de quem curte carro." },
      services: { title: "Serviços", desc: "Estética, mecânica e mais, perto de você." },
    },
    cost: {
      eyebrow: "Simulador de custo real",
      title: "O preço do carro é só o começo.",
      body: "Antes de comprar, veja quanto ele custa por mês e quanto de renda isso pede.",
      items: {
        ipva: "IPVA da alíquota do seu estado",
        insurance: "Seguro pela sua faixa de idade",
        fuel: "Combustível pelo preço médio da ANP",
        maintenance: "Manutenção pela idade e pela rodagem",
        financing: "Parcela do financiamento",
        depreciation: "Depreciação, o custo que não aparece",
      },
      note: "Estimativas para planejar, não cotações. Por enquanto, só para carros no Brasil.",
      cta: "Simular meu carro",
    },
    services: {
      title: "Serviços perto de você",
      seeAll: "Ver todos",
      widened: "{{region}}: ainda sem anúncios. Mostrando os de outras regiões.",
      emptyTitle: "Os primeiros anúncios estão chegando",
      emptyBody:
        "Estética, mecânica, guincho e outros serviços aparecem aqui depois de uma revisão da equipe.",
      providerTitle: "Presta serviço automotivo?",
      providerBody: "Anuncie para quem tem carro na sua cidade.",
      providerCta: "Anunciar meu serviço",
      rating: "Nota {{avg}} de 5, {{count}} avaliações",
      noRating: "Novo no Engine",
    },
    community: {
      title: "Da comunidade",
      seeAll: "Ver comunidade",
      goal: "Meta",
      goalProgress: "Meta · {{progress}}%",
      post: "Post",
      emptyTitle: "A comunidade está começando",
      emptyBody:
        "Quem tem conta publica o carro, a meta de compra e as fotos do rolê. Seja um dos primeiros.",
    },
    events: {
      title: "Próximos encontros",
      seeAll: "Ver eventos",
      going_one: "{{count}} confirmado",
      going_other: "{{count}} confirmados",
      emptyTitle: "Nenhum encontro marcado por enquanto",
      emptyBody:
        "Cars & Coffee, rolês e track days aparecem aqui assim que alguém marcar. Que tal organizar o primeiro da sua cidade?",
      emptyCta: "Ver eventos",
    },
    loadError: "Não deu para carregar agora. Tente de novo em instantes.",
    final: {
      title: "Comece pela sua garagem.",
      body: "A conta é grátis. Cadastre o carro que você tem, ou o que quer ter, e veja quanto ele custa de verdade.",
      cta: "Criar conta grátis",
      signIn: "Já tenho conta",
    },
  },
};

const enUS = {
  visitorHome: {
    eyebrow: "Garage · real cost · community · services",
    title: "Find out what your car really costs.",
    subtitle:
      "Keep your cars in one place, see the monthly cost with taxes, insurance, fuel and maintenance, find car services near you and follow people who love cars.",
    ctaRegister: "Create a free account",
    ctaServices: "Explore services",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    pillars: {
      label: "What you can do on Engine",
      open: "Open to everyone",
      withAccount: "Free, with an account",
      garage: { title: "Garage", desc: "Your cars and goals, with the spec sheet of each trim." },
      cost: { title: "Real cost", desc: "What the car costs you per month, all in." },
      community: { title: "Community", desc: "Posts, clubs and meets from people who love cars." },
      services: { title: "Services", desc: "Detailing, mechanics and more, near you." },
    },
    cost: {
      eyebrow: "Real cost simulator",
      title: "The price tag is only the beginning.",
      body: "Before you buy, see what it costs per month and how much income that takes.",
      items: {
        ipva: "Vehicle tax (IPVA) at your state's rate",
        insurance: "Insurance for your age group",
        fuel: "Fuel at the ANP average price",
        maintenance: "Maintenance by age and mileage",
        financing: "Loan payment",
        depreciation: "Depreciation, the cost you don't see",
      },
      note: "Planning estimates, not quotes. For now, only for cars in Brazil.",
      cta: "Simulate my car",
    },
    services: {
      title: "Services near you",
      seeAll: "See all",
      widened: "{{region}}: no listings yet. Showing other regions.",
      emptyTitle: "The first listings are on their way",
      emptyBody:
        "Detailing, mechanics, towing and other services show up here after a review by our team.",
      providerTitle: "Do you offer car services?",
      providerBody: "List them for car owners in your city.",
      providerCta: "List my service",
      rating: "Rated {{avg}} out of 5, {{count}} reviews",
      noRating: "New on Engine",
    },
    community: {
      title: "From the community",
      seeAll: "See community",
      goal: "Goal",
      goalProgress: "Goal · {{progress}}%",
      post: "Post",
      emptyTitle: "The community is just getting started",
      emptyBody:
        "Members post their car, their purchase goal and photos from their drives. Be one of the first.",
    },
    events: {
      title: "Upcoming meets",
      seeAll: "See events",
      going_one: "{{count}} going",
      going_other: "{{count}} going",
      emptyTitle: "No meets scheduled yet",
      emptyBody:
        "Cars & Coffee, cruises and track days show up here as soon as someone schedules one. Why not organize the first one in your city?",
      emptyCta: "See events",
    },
    loadError: "We couldn't load this right now. Try again in a moment.",
    final: {
      title: "Start with your garage.",
      body: "Your account is free. Add the car you own, or the one you want, and see what it really costs.",
      cta: "Create a free account",
      signIn: "I have an account",
    },
  },
};

const esES = {
  visitorHome: {
    eyebrow: "Garaje · coste real · comunidad · servicios",
    title: "Descubre cuánto te cuesta tu coche de verdad.",
    subtitle:
      "Guarda tus coches, mira el coste del mes con impuestos, seguro, combustible y mantenimiento, encuentra servicios para tu coche cerca de ti y sigue a quien le gustan los coches.",
    ctaRegister: "Crear cuenta gratis",
    ctaServices: "Explorar servicios",
    haveAccount: "¿Ya tienes cuenta?",
    signIn: "Entrar",
    pillars: {
      label: "Qué puedes hacer en Engine",
      open: "Abierto a todos",
      withAccount: "Gratis, con cuenta",
      garage: { title: "Garaje", desc: "Tus coches y metas, con la ficha técnica de la versión." },
      cost: { title: "Coste real", desc: "Cuánto te cuesta el coche al mes, sumándolo todo." },
      community: { title: "Comunidad", desc: "Posts, clubes y quedadas de gente a la que le gustan los coches." },
      services: { title: "Servicios", desc: "Estética, mecánica y más, cerca de ti." },
    },
    cost: {
      eyebrow: "Simulador de coste real",
      title: "El precio del coche es solo el principio.",
      body: "Antes de comprar, mira cuánto cuesta al mes y cuántos ingresos necesitas para ello.",
      items: {
        ipva: "Impuesto del vehículo (IPVA) según tu estado",
        insurance: "Seguro según tu franja de edad",
        fuel: "Combustible al precio medio de la ANP",
        maintenance: "Mantenimiento según la edad y el kilometraje",
        financing: "Cuota de la financiación",
        depreciation: "Depreciación, el coste que no se ve",
      },
      note: "Estimaciones para planificar, no presupuestos. Por ahora, solo para coches en Brasil.",
      cta: "Simular mi coche",
    },
    services: {
      title: "Servicios cerca de ti",
      seeAll: "Ver todos",
      widened: "{{region}}: aún sin anuncios. Mostrando los de otras regiones.",
      emptyTitle: "Los primeros anuncios están llegando",
      emptyBody:
        "Estética, mecánica, grúa y otros servicios aparecen aquí después de una revisión del equipo.",
      providerTitle: "¿Ofreces servicios para coches?",
      providerBody: "Anúnciate a quienes tienen coche en tu ciudad.",
      providerCta: "Anunciar mi servicio",
      rating: "Nota {{avg}} de 5, {{count}} valoraciones",
      noRating: "Nuevo en Engine",
    },
    community: {
      title: "De la comunidad",
      seeAll: "Ver comunidad",
      goal: "Meta",
      goalProgress: "Meta · {{progress}}%",
      post: "Post",
      emptyTitle: "La comunidad está empezando",
      emptyBody:
        "Quien tiene cuenta publica su coche, su meta de compra y las fotos de sus salidas. Sé de los primeros.",
    },
    events: {
      title: "Próximas quedadas",
      seeAll: "Ver eventos",
      going_one: "{{count}} confirmado",
      going_other: "{{count}} confirmados",
      emptyTitle: "Todavía no hay quedadas programadas",
      emptyBody:
        "Cars & Coffee, rutas y track days aparecen aquí en cuanto alguien programe uno. ¿Por qué no organizas el primero de tu ciudad?",
      emptyCta: "Ver eventos",
    },
    loadError: "No hemos podido cargarlo ahora. Inténtalo de nuevo en un momento.",
    final: {
      title: "Empieza por tu garaje.",
      body: "La cuenta es gratis. Añade el coche que tienes, o el que quieres tener, y mira cuánto cuesta de verdad.",
      cta: "Crear cuenta gratis",
      signIn: "Ya tengo cuenta",
    },
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);
