import i18n from "./i18n";

/**
 * Textos da página pública do anúncio (/servicos/<slug>), do compartilhar e
 * do painel "Seu mês" do prestador.
 *
 * Fora do i18n.js pelo mesmo motivo do i18n-billing.js: entram por
 * `addResourceBundle` com deep merge. pt-PT, en-GB, es-MX e es-AR apontam
 * para os objetos de pt-BR, en-US e es-ES, e o resto cai no en-US.
 *
 * Regra destes textos: nenhum número sem contexto. A contagem por dia
 * começou em 24/10/2026, e o painel diz isso com todas as letras em vez de
 * mostrar um zero que parece fracasso.
 */

const ptBR = {
  services: {
    cardActions: { chat: "WhatsApp", email: "E-mail", map: "Mapa" },
    share: {
      action: "Compartilhar",
      ownerText: "Conheça meu trabalho: {{title}}",
      visitorText: "Olha esse serviço no Engine: {{title}}",
      copied: "Link copiado.",
      copiedOwner: "Link copiado. Agora é só colar na bio do Instagram.",
      copiedShort: "Copiado",
      copyFailed: "Não deu para copiar. Segure o link para copiar: {{url}}",
      copyMyLink: "Copiar meu link",
      bioTitle: "Seu link para a bio",
      bioHint:
        "Cole na bio do Instagram ou do TikTok e mande no status do WhatsApp. Quem tocar cai direto no seu anúncio, com fotos e o botão do WhatsApp.",
      pendingHint:
        "Este é o seu link. Ele começa a abrir para os clientes quando o anúncio for aprovado — aí é só colar na bio.",
      openPage: "Abrir página do anúncio",
      openMyPage: "Ver minha página como o cliente vê",
      viewListing: "Ver anúncio",
    },
    month: {
      eyebrow: "Seu mês",
      openShort: "Seu mês e link",
      onlyYou: "Só você vê",
      notApproved:
        "Os números começam a contar quando o anúncio for aprovado e aparecer na vitrine.",
      countingSince: "Começamos a contar em {{since}}. O que aconteceu antes disso não foi registrado.",
      noLastMonth: "Sem mês passado para comparar: começamos a contar em {{since}}.",
      lastMonthPartial: "Em {{month}} (contado desde {{since}}): {{value}}.",
      lastMonthValue: "Em {{month}}: {{value}}.",
      sameAsLast: "Igual ao mesmo período do mês passado.",
      up: "{{value}}% a mais que no mesmo período do mês passado.",
      down: "{{value}}% a menos que no mesmo período do mês passado.",
      pickMetric: "Escolha qual número ver no gráfico",
      metrics: {
        view: { label: "Apareceu na busca", short: "Apareceu na busca" },
        detail: { label: "Abriram o anúncio", short: "Abriram o anúncio" },
        whatsapp: { label: "Chamaram no WhatsApp", short: "Chamaram no WhatsApp" },
      },
      chartLabel: "{{metric}} por dia neste mês: {{total}} no total; dia mais movimentado: {{busiest}}.",
      notCounted: "antes de começarmos a contar",
      emptyTitle: "Ninguém por aqui ainda este mês",
      emptyCopy:
        "É normal no começo. Cole seu link na bio e mande no status do WhatsApp: cada visita aparece aqui no mesmo dia.",
      sourcesTitle: "De onde vieram",
      sources: {
        search: "Busca do Engine",
        link: "Seu link (bio, WhatsApp)",
        profile: "Seu perfil no Engine",
        community: "Comunidade",
        direct: "Outros caminhos",
      },
      sourceLine: "{{opened}} abriram · {{contacts}} no WhatsApp",
      sourceViews: "{{value}} viram na busca",
      lifetime:
        "Desde a publicação: {{opened}} aberturas e {{contacts}} contatos no WhatsApp. Contagem aproximada.",
      loadError: "Não deu para carregar seus números agora.",
      retry: "Tentar de novo",
    },
    publicPage: {
      photos: "{{count}} fotos do serviço",
      ownerApproved: "Esta é a página que seus clientes veem. Cole o link na bio do Instagram.",
      ownerPending:
        "Só você está vendo esta página: o anúncio ainda está em análise. Quando for aprovado, o link passa a abrir para todo mundo.",
      missingTitle: "Este anúncio não está disponível",
      missingCopy: "Ele pode ter sido removido pelo prestador ou ainda estar em análise.",
      errorTitle: "Não deu para abrir o anúncio",
      errorCopy: "Confira sua conexão e tente de novo em instantes.",
      seeServices: "Ver serviços no Engine",
      advertiseFree: "Anuncie seu serviço grátis",
      whatsappMessage: "Olá! Vi seu anúncio \"{{title}}\" no Engine e queria um orçamento.",
      noContact: "O prestador não deixou contato direto neste anúncio.",
      about: "Sobre o serviço",
      serviceArea: "Área de atendimento",
      where: "Onde fica",
      portfolio: "Trabalhos e redes",
      footer: "Anúncio publicado no Engine. Publicar o seu é grátis.",
    },
  },
};

const enUS = {
  services: {
    cardActions: { chat: "Chat", email: "Email", map: "Map" },
    share: {
      action: "Share",
      ownerText: "Check out my work: {{title}}",
      visitorText: "Check out this service on Engine: {{title}}",
      copied: "Link copied.",
      copiedOwner: "Link copied. Now paste it in your Instagram bio.",
      copiedShort: "Copied",
      copyFailed: "Couldn't copy. Press and hold the link to copy it: {{url}}",
      copyMyLink: "Copy my link",
      bioTitle: "Your link for the bio",
      bioHint:
        "Paste it in your Instagram or TikTok bio and post it on your WhatsApp status. Whoever taps it lands right on your listing, with photos and the WhatsApp button.",
      pendingHint:
        "This is your link. It starts opening for customers once the listing is approved — then just paste it in your bio.",
      openPage: "Open listing page",
      openMyPage: "See my page as customers see it",
      viewListing: "View listing",
    },
    month: {
      eyebrow: "Your month",
      openShort: "Your month & link",
      onlyYou: "Only you see this",
      notApproved: "Numbers start counting once the listing is approved and shows up in the marketplace.",
      countingSince: "We started counting on {{since}}. Anything before that wasn't recorded.",
      noLastMonth: "No previous month to compare: we started counting on {{since}}.",
      lastMonthPartial: "In {{month}} (counted since {{since}}): {{value}}.",
      lastMonthValue: "In {{month}}: {{value}}.",
      sameAsLast: "Same as the same period last month.",
      up: "{{value}}% more than the same period last month.",
      down: "{{value}}% less than the same period last month.",
      pickMetric: "Choose which number to chart",
      metrics: {
        view: { label: "Showed up in search", short: "Showed up in search" },
        detail: { label: "Opened your listing", short: "Opened your listing" },
        whatsapp: { label: "Reached out on WhatsApp", short: "Reached out on WhatsApp" },
      },
      chartLabel: "{{metric}} per day this month: {{total}} in total; busiest day: {{busiest}}.",
      notCounted: "before we started counting",
      emptyTitle: "Nobody yet this month",
      emptyCopy:
        "That's normal at first. Paste your link in your bio and on your WhatsApp status: every visit shows up here the same day.",
      sourcesTitle: "Where they came from",
      sources: {
        search: "Engine search",
        link: "Your link (bio, WhatsApp)",
        profile: "Your Engine profile",
        community: "Community",
        direct: "Other ways",
      },
      sourceLine: "{{opened}} opened · {{contacts}} on WhatsApp",
      sourceViews: "{{value}} saw it in search",
      lifetime:
        "Since publishing: {{opened}} opens and {{contacts}} WhatsApp contacts. Approximate count.",
      loadError: "Couldn't load your numbers right now.",
      retry: "Try again",
    },
    publicPage: {
      photos: "{{count}} photos of the service",
      ownerApproved: "This is the page your customers see. Paste the link in your Instagram bio.",
      ownerPending:
        "Only you can see this page: the listing is still under review. Once approved, the link opens for everyone.",
      missingTitle: "This listing isn't available",
      missingCopy: "It may have been removed by the provider or still be under review.",
      errorTitle: "Couldn't open the listing",
      errorCopy: "Check your connection and try again in a moment.",
      seeServices: "See services on Engine",
      advertiseFree: "List your service for free",
      whatsappMessage: "Hi! I saw your listing \"{{title}}\" on Engine and would like a quote.",
      noContact: "The provider didn't leave direct contact details on this listing.",
      about: "About the service",
      serviceArea: "Service area",
      where: "Where it is",
      portfolio: "Work and social",
      footer: "Listing published on Engine. Publishing yours is free.",
    },
  },
};

const esES = {
  services: {
    cardActions: { chat: "WhatsApp", email: "Correo", map: "Mapa" },
    share: {
      action: "Compartir",
      ownerText: "Conoce mi trabajo: {{title}}",
      visitorText: "Mira este servicio en Engine: {{title}}",
      copied: "Enlace copiado.",
      copiedOwner: "Enlace copiado. Ahora pégalo en la bio de Instagram.",
      copiedShort: "Copiado",
      copyFailed: "No se pudo copiar. Mantén pulsado el enlace para copiarlo: {{url}}",
      copyMyLink: "Copiar mi enlace",
      bioTitle: "Tu enlace para la bio",
      bioHint:
        "Pégalo en la bio de Instagram o TikTok y compártelo en tu estado de WhatsApp. Quien lo toque llega directo a tu anuncio, con fotos y el botón de WhatsApp.",
      pendingHint:
        "Este es tu enlace. Empieza a abrirse para los clientes cuando el anuncio sea aprobado; entonces solo tienes que pegarlo en la bio.",
      openPage: "Abrir página del anuncio",
      openMyPage: "Ver mi página como la ve el cliente",
      viewListing: "Ver anuncio",
    },
    month: {
      eyebrow: "Tu mes",
      openShort: "Tu mes y enlace",
      onlyYou: "Solo tú lo ves",
      notApproved: "Los números empiezan a contar cuando el anuncio sea aprobado y aparezca en el escaparate.",
      countingSince: "Empezamos a contar el {{since}}. Lo anterior no quedó registrado.",
      noLastMonth: "Sin mes anterior para comparar: empezamos a contar el {{since}}.",
      lastMonthPartial: "En {{month}} (contado desde el {{since}}): {{value}}.",
      lastMonthValue: "En {{month}}: {{value}}.",
      sameAsLast: "Igual que en el mismo periodo del mes pasado.",
      up: "{{value}}% más que en el mismo periodo del mes pasado.",
      down: "{{value}}% menos que en el mismo periodo del mes pasado.",
      pickMetric: "Elige qué número ver en el gráfico",
      metrics: {
        view: { label: "Apareció en la búsqueda", short: "Apareció en la búsqueda" },
        detail: { label: "Abrieron el anuncio", short: "Abrieron el anuncio" },
        whatsapp: { label: "Escribieron por WhatsApp", short: "Escribieron por WhatsApp" },
      },
      chartLabel: "{{metric}} por día este mes: {{total}} en total; día con más movimiento: {{busiest}}.",
      notCounted: "antes de empezar a contar",
      emptyTitle: "Nadie todavía este mes",
      emptyCopy:
        "Es normal al principio. Pega tu enlace en la bio y compártelo en tu estado de WhatsApp: cada visita aparece aquí el mismo día.",
      sourcesTitle: "De dónde vinieron",
      sources: {
        search: "Búsqueda de Engine",
        link: "Tu enlace (bio, WhatsApp)",
        profile: "Tu perfil en Engine",
        community: "Comunidad",
        direct: "Otros caminos",
      },
      sourceLine: "{{opened}} abrieron · {{contacts}} por WhatsApp",
      sourceViews: "{{value}} lo vieron en la búsqueda",
      lifetime:
        "Desde la publicación: {{opened}} aperturas y {{contacts}} contactos por WhatsApp. Conteo aproximado.",
      loadError: "No se pudieron cargar tus números ahora.",
      retry: "Intentar de nuevo",
    },
    publicPage: {
      photos: "{{count}} fotos del servicio",
      ownerApproved: "Esta es la página que ven tus clientes. Pega el enlace en tu bio de Instagram.",
      ownerPending:
        "Solo tú ves esta página: el anuncio aún está en revisión. Cuando sea aprobado, el enlace se abrirá para todos.",
      missingTitle: "Este anuncio no está disponible",
      missingCopy: "Puede que el proveedor lo haya eliminado o que siga en revisión.",
      errorTitle: "No se pudo abrir el anuncio",
      errorCopy: "Revisa tu conexión e inténtalo de nuevo en un momento.",
      seeServices: "Ver servicios en Engine",
      advertiseFree: "Anuncia tu servicio gratis",
      whatsappMessage: "¡Hola! Vi tu anuncio \"{{title}}\" en Engine y quería un presupuesto.",
      noContact: "El proveedor no dejó un contacto directo en este anuncio.",
      about: "Sobre el servicio",
      serviceArea: "Zona de atención",
      where: "Dónde está",
      portfolio: "Trabajos y redes",
      footer: "Anuncio publicado en Engine. Publicar el tuyo es gratis.",
    },
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
