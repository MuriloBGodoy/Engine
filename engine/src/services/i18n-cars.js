/**
 * Textos da vitrine de carros ("Encontrar carros").
 *
 * Os nomes das modificações e dos stages são os ids de `carSpecSheet.js` —
 * aqui eles ganham a palavra que a pessoa usa, em cada idioma. "Stage" fica
 * como está nos três: é como o meio fala, traduzir viraria outra coisa.
 */
import i18n from "./i18n";

const pt = {
  cars: {
    tab: "Carros",
    searchPlaceholder: "Buscar por marca ou modelo…",
    allBrands: "Todas as marcas",
    nearMe: "Em {{state}}",
    loading: "Carregando carros…",
    emptyTitle: "Nenhum carro por aqui ainda",
    emptyHint: "Mostre o seu: na Garagem, abra o carro e ligue “Mostrar na comunidade”.",
    stage: {
      stock: "Original",
      stage1: "Stage 1",
      stage2: "Stage 2",
      stage3: "Stage 3",
      custom: "Preparação própria",
    },
    mods: {
      turbo: "Turbo",
      suspension: "Suspensão",
      wheels: "Rodas",
      exhaust: "Escape",
      sound: "Som",
    },
    show: "Mostrar na comunidade",
    showHint: "Seu carro ganha página própria e entra na busca. Gastos e metas continuam só seus.",
    published: "Carro publicado na comunidade.",
    unpublished: "Carro fora da comunidade.",
    viewPublic: "Ver a página do carro",
    ownerSince: "Na garagem de",
    setup: "Preparação",
    noSetup: "O dono ainda não contou a preparação.",
    likes_one: "{{count}} curtida",
    likes_other: "{{count}} curtidas",
    notFound: "Este carro não está mais na comunidade.",
    comments_one: "{{count}} comentário",
    comments_other: "{{count}} comentários",
    commentPlaceholder: "Escreva um comentário",
    send: "Enviar",
    signInToComment: "Entre para comentar.",
  },
};

const en = {
  cars: {
    tab: "Cars",
    searchPlaceholder: "Search by make or model…",
    allBrands: "All makes",
    nearMe: "In {{state}}",
    loading: "Loading cars…",
    emptyTitle: "No cars here yet",
    emptyHint: "Show yours: open the car in your Garage and turn on “Show in the community”.",
    stage: {
      stock: "Stock",
      stage1: "Stage 1",
      stage2: "Stage 2",
      stage3: "Stage 3",
      custom: "Custom build",
    },
    mods: {
      turbo: "Turbo",
      suspension: "Suspension",
      wheels: "Wheels",
      exhaust: "Exhaust",
      sound: "Audio",
    },
    show: "Show in the community",
    showHint: "Your car gets its own page and shows up in search. Costs and goals stay yours.",
    published: "Car published to the community.",
    unpublished: "Car removed from the community.",
    viewPublic: "See the car page",
    ownerSince: "In the garage of",
    setup: "Build",
    noSetup: "The owner hasn't described the build yet.",
    likes_one: "{{count}} like",
    likes_other: "{{count}} likes",
    notFound: "This car is no longer in the community.",
    comments_one: "{{count}} comment",
    comments_other: "{{count}} comments",
    commentPlaceholder: "Write a comment",
    send: "Send",
    signInToComment: "Sign in to comment.",
  },
};

const es = {
  cars: {
    tab: "Coches",
    searchPlaceholder: "Buscar por marca o modelo…",
    allBrands: "Todas las marcas",
    nearMe: "En {{state}}",
    loading: "Cargando coches…",
    emptyTitle: "Aún no hay coches aquí",
    emptyHint: "Muestra el tuyo: abre el coche en tu Garaje y activa «Mostrar en la comunidad».",
    stage: {
      stock: "Original",
      stage1: "Stage 1",
      stage2: "Stage 2",
      stage3: "Stage 3",
      custom: "Preparación propia",
    },
    mods: {
      turbo: "Turbo",
      suspension: "Suspensión",
      wheels: "Llantas",
      exhaust: "Escape",
      sound: "Audio",
    },
    show: "Mostrar en la comunidad",
    showHint: "Tu coche gana página propia y entra en la búsqueda. Gastos y metas siguen siendo tuyos.",
    published: "Coche publicado en la comunidad.",
    unpublished: "Coche fuera de la comunidad.",
    viewPublic: "Ver la página del coche",
    ownerSince: "En el garaje de",
    setup: "Preparación",
    noSetup: "El dueño aún no ha contado la preparación.",
    likes_one: "{{count}} me gusta",
    likes_other: "{{count}} me gusta",
    notFound: "Este coche ya no está en la comunidad.",
    comments_one: "{{count}} comentario",
    comments_other: "{{count}} comentarios",
    commentPlaceholder: "Escribe un comentario",
    send: "Enviar",
    signInToComment: "Entra para comentar.",
  },
};

i18n.addResourceBundle("pt-BR", "translation", pt, true, true);
i18n.addResourceBundle("en-US", "translation", en, true, true);
i18n.addResourceBundle("es-ES", "translation", es, true, true);
