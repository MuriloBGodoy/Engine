/**
 * O guia do Engine: o tour de chegada e a ajuda de cada tela.
 *
 * O problema que ele resolve é o de sempre num app com quatro pilares
 * (garagem, comunidade, serviços, eventos): quem chega vê um menu com seis
 * nomes e nenhuma frase dizendo o que fazer primeiro. A Central de Ajuda
 * (/ajuda) responde perguntas de quem JÁ sabe o nome do que procura; o tour
 * responde a de quem ainda não sabe.
 *
 * Três decisões:
 *
 *  - **O catálogo é dado, não tela.** Aqui só moram ids, seletores e a ordem.
 *    O texto vem do i18n (services/i18n-tour.js) e o desenho do
 *    components/tour/. Trocar a ordem de um passo não encosta em componente.
 *
 *  - **O alvo é um `data-tour`, nunca uma classe.** Classe de Tailwind muda
 *    quando o visual muda, e um tour que aponta para o lugar errado é pior
 *    que nenhum. `data-tour` existe só para isto e aparece na busca do
 *    projeto quando alguém for mexer no elemento.
 *
 *  - **Passo sem alvo na tela não quebra o tour.** Vira cartão no meio, com
 *    o mesmo texto. Metade dos alvos é do menu, que no celular é a barra de
 *    baixo e no computador a lateral — e nenhum dos dois existe em todas as
 *    larguras ao mesmo tempo.
 *
 * `media` em cada passo está pronto para receber um GIF ou print gerado do
 * app (`/public/tour/*.webp`). Enquanto não existir, o passo é só texto — e
 * texto que já basta, em vez de um retângulo vazio esperando arte.
 */

/** O `data-tour` de cada item do menu, a partir da rota. */
export const navTourId = (path) =>
  ({
    "/": "nav-home",
    "/buscar": "nav-search",
    "/dashboard": "nav-dashboard",
    "/garagem": "nav-garage",
    "/community": "nav-community",
    "/services": "nav-services",
    "/events": "nav-events",
    "/settings": "nav-settings",
    "/planos": "nav-plans",
  })[path] || "";

const alvo = (id) => `[data-tour="${id}"]`;

/**
 * As seções do app, na ordem em que fazem sentido para quem chegou.
 *
 * `match` responde "a pessoa está nesta tela agora?" — é o que faz o botão
 * de ajuda no topo abrir a dúvida DAQUELA tela, e não um índice genérico.
 * `bullets` é quantos itens o i18n tem em `tour.sections.<id>.bullets`.
 */
export const TOUR_SECTIONS = [
  {
    id: "home",
    icon: "home",
    path: "/",
    match: (pathname) => pathname === "/",
    bullets: 4,
    steps: [
      { key: "home-nav", target: alvo("nav-home") },
      { key: "home-garage", target: alvo("nav-garage") },
      { key: "home-community", target: alvo("nav-community") },
      { key: "home-help", target: alvo("help-button") },
    ],
  },
  {
    id: "garage",
    icon: "car",
    path: "/garagem",
    match: (pathname) => pathname.startsWith("/garagem"),
    bullets: 5,
    steps: [
      { key: "garage-add", target: alvo("garage-add") },
      { key: "garage-card", target: alvo("garage-list") },
      { key: "garage-costs", target: alvo("garage-list") },
    ],
  },
  {
    id: "community",
    icon: "users",
    path: "/community",
    match: (pathname) => pathname.startsWith("/community") || pathname.startsWith("/clubes"),
    bullets: 4,
    steps: [
      { key: "community-post", target: alvo("community-post") },
      { key: "community-feed", target: alvo("community-feed") },
    ],
  },
  {
    id: "services",
    icon: "briefcase",
    path: "/services",
    match: (pathname) => pathname.startsWith("/services") || pathname.startsWith("/servicos"),
    bullets: 5,
    steps: [
      { key: "services-tabs", target: alvo("services-tabs") },
      { key: "services-quote", target: alvo("services-quote") },
      { key: "services-publish", target: alvo("services-publish") },
    ],
  },
  {
    id: "events",
    icon: "calendar",
    path: "/events",
    match: (pathname) => pathname.startsWith("/events"),
    bullets: 4,
    steps: [
      { key: "events-create", target: alvo("events-create") },
      { key: "events-card", target: alvo("events-list") },
    ],
  },
  {
    id: "search",
    icon: "search",
    path: "/buscar",
    match: (pathname) => pathname.startsWith("/buscar"),
    bullets: 3,
    steps: [],
  },
  {
    id: "dashboard",
    icon: "chart",
    path: "/dashboard",
    match: (pathname) => pathname.startsWith("/dashboard"),
    bullets: 3,
    steps: [],
  },
  {
    id: "messages",
    icon: "message",
    path: "/messages",
    match: (pathname) => pathname.startsWith("/messages"),
    bullets: 3,
    steps: [],
  },
  {
    id: "profile",
    icon: "user",
    path: "",
    match: (pathname) => /^\/community\/@/.test(pathname),
    bullets: 4,
    steps: [],
  },
  {
    id: "settings",
    icon: "settings",
    path: "/settings",
    match: (pathname) => pathname.startsWith("/settings"),
    bullets: 3,
    steps: [],
  },
  {
    id: "plans",
    icon: "sparkles",
    path: "/planos",
    match: (pathname) => pathname.startsWith("/planos"),
    bullets: 3,
    steps: [],
  },
];

/** A seção da tela aberta. O perfil vem antes da comunidade de propósito. */
export const sectionForPath = (pathname = "/") => {
  const caminho = String(pathname || "/");
  const perfil = TOUR_SECTIONS.find((secao) => secao.id === "profile");
  if (perfil?.match(caminho)) return perfil;
  return TOUR_SECTIONS.find((secao) => secao.match(caminho)) || TOUR_SECTIONS[0];
};

export const sectionById = (id) => TOUR_SECTIONS.find((secao) => secao.id === id) || null;

/* --------------------------------------------------------------- jornada --
 *
 * O guia completo: a volta pela plataforma inteira, em ordem, levando a
 * pessoa de tela em tela como o tutorial de um jogo.
 *
 * A diferença entre isto e o tour de uma seção não é o tamanho, é o VERBO:
 * a jornada NAVEGA. Cada passo tem um endereço e o guia leva a pessoa até
 * lá antes de falar — porque "a garagem fica no menu" ensina menos que
 * estar na garagem com o botão de cadastrar aceso.
 *
 * Quatro regras que o desenho obedece:
 *
 *  - **Nada é obrigatório.** Nenhum passo espera clique no alvo para
 *    liberar o seguinte. Onde a ação é o ponto (cadastrar o carro,
 *    publicar), o passo oferece um atalho (`cta`) e segue a vida se a
 *    pessoa ignorar. Tutorial que tranca a tela até a pessoa acertar o
 *    clique é o que faz gente desinstalar app.
 *
 *  - **Garagem e comunidade com calma; serviços, crews e eventos de
 *    passagem.** Quem chega precisa cadastrar um carro, não pedir
 *    orçamento. Os de passagem ganham um ou dois passos: a pessoa fica
 *    sabendo que existem e volta quando a necessidade aparecer.
 *
 *  - **Capítulo é a unidade de desistência.** Dá para pular o capítulo sem
 *    pular o guia — é o jeito honesto de atender "não quero saber de
 *    serviços agora" sem tirar os eventos junto.
 *
 *  - **Visitante não é levado para tela com cadeado.** Garagem, painel,
 *    perfil e ajustes pedem conta; para quem não entrou esses passos somem
 *    e no lugar entra o convite. Guia que começa num beco sem saída é pior
 *    que guia nenhum.
 *
 * O progresso fica gravado (ver `journeyProgress` no fim do arquivo): sair
 * no meio não é perder o guia, é pausar. O botão de ajuda devolve de onde
 * parou — e é isso que faz o atalho "fazer agora" ser seguro de oferecer.
 */

/**
 * `@perfil` é resolvido na hora pelo TourProvider: o endereço do perfil
 * depende do @ de quem está logado, e o catálogo não tem como saber.
 */
export const ROTA_DO_PERFIL = "@perfil";

export const JOURNEY_CHAPTERS = [
  {
    id: "start",
    icon: "home",
    steps: [
      { key: "j-hello", path: "/", target: "" },
      { key: "j-menu", path: "/", target: alvo("nav-home") },
      { key: "j-home", path: "/", target: "" },
    ],
  },
  {
    id: "garage",
    icon: "car",
    steps: [
      { key: "j-garage-guest", path: "/", target: alvo("nav-garage"), guest: true },
      { key: "j-garage-add", path: "/garagem", target: alvo("garage-add"), auth: true, cta: "click" },
      { key: "j-garage-card", path: "/garagem", target: alvo("garage-list"), auth: true },
      { key: "j-garage-costs", path: "/garagem", target: alvo("garage-list"), auth: true },
      { key: "j-dashboard", path: "/dashboard", target: alvo("dashboard-top"), auth: true },
    ],
  },
  {
    id: "community",
    icon: "users",
    steps: [
      { key: "j-community-feed", path: "/community", target: alvo("community-feed") },
      { key: "j-community-post", path: "/community", target: alvo("community-post"), auth: true, cta: "click" },
      { key: "j-community-clubs", path: "/community", target: alvo("community-tab-clubes") },
    ],
  },
  {
    id: "services",
    icon: "briefcase",
    steps: [
      { key: "j-services", path: "/services", target: alvo("services-tabs") },
      { key: "j-services-quote", path: "/services", target: alvo("services-quote") },
    ],
  },
  {
    id: "events",
    icon: "calendar",
    steps: [{ key: "j-events", path: "/events", target: alvo("events-filters") }],
  },
  {
    id: "search",
    icon: "search",
    steps: [{ key: "j-search", path: "/buscar", target: alvo("search-input") }],
  },
  {
    id: "profile",
    icon: "user",
    steps: [
      { key: "j-profile", path: ROTA_DO_PERFIL, target: alvo("profile-tabs"), auth: true },
      { key: "j-wallet", path: ROTA_DO_PERFIL, target: alvo("profile-wallet"), auth: true },
    ],
  },
  {
    id: "finish",
    icon: "sparkles",
    steps: [
      { key: "j-settings", path: "/settings", target: alvo("settings-privacy"), auth: true },
      { key: "j-account", path: "/", target: "", guest: true },
      { key: "j-help", path: "/", target: alvo("help-button") },
      { key: "j-done", path: "/", target: "" },
    ],
  },
];

/**
 * A jornada desta pessoa, já achatada em passos e numerada por capítulo.
 *
 * Achatar aqui, e não na tela, é o que deixa o cartão simples: ele recebe
 * uma lista e um índice, como no tour de seção, e cada passo já carrega o
 * capítulo a que pertence. Capítulo que ficou sem passo (visitante na
 * Garagem, por exemplo) desaparece da contagem — "capítulo 4 de 8" tem que
 * bater com os capítulos que a pessoa vai ver de verdade.
 */
export const buildJourney = ({ logado = false, profilePath = "" } = {}) => {
  const capitulos = JOURNEY_CHAPTERS.map((capitulo) => ({
    ...capitulo,
    steps: capitulo.steps.filter((passo) => {
      if (passo.auth && !logado) return false;
      if (passo.guest && logado) return false;
      // Perfil sem @ resolvido: o passo não tem para onde levar.
      if (passo.path === ROTA_DO_PERFIL && !profilePath) return false;
      return true;
    }),
  })).filter((capitulo) => capitulo.steps.length > 0);

  const passos = [];
  capitulos.forEach((capitulo, indice) => {
    capitulo.steps.forEach((passo) => {
      passos.push({
        ...passo,
        path: passo.path === ROTA_DO_PERFIL ? profilePath : passo.path,
        chapter: capitulo.id,
        chapterIcon: capitulo.icon,
        chapterNumber: indice + 1,
        chapterCount: capitulos.length,
      });
    });
  });
  return passos;
};

/** O primeiro passo do capítulo seguinte ao do índice dado (-1 se acabou). */
export const nextChapterIndex = (passos = [], indice = 0) => {
  const atual = passos[indice]?.chapter;
  for (let i = indice + 1; i < passos.length; i += 1) {
    if (passos[i].chapter !== atual) return i;
  }
  return -1;
};

/* ------------------------------------------------------------------ visto --
 *
 * Fica no aparelho, não no servidor: "já vi o tour" não é dado de conta, é
 * preferência deste navegador — e gravar no banco custaria uma escrita no
 * primeiro segundo de uso de todo mundo. Por conta, para que a pessoa que
 * entra na conta do irmão no mesmo computador também veja o guia.
 */

const chave = (userId) => `engine.tour.seen:${userId || "guest"}`;

export const tourSeen = (userId) => {
  try {
    return window.localStorage.getItem(chave(userId)) === "1";
  } catch {
    // Armazenamento bloqueado: não insiste. Melhor não mostrar o tour do que
    // mostrá-lo a cada carregamento.
    return true;
  }
};

export const markTourSeen = (userId) => {
  try {
    window.localStorage.setItem(chave(userId), "1");
  } catch {
    // vale só esta visita
  }
};

export const forgetTourSeen = (userId) => {
  try {
    window.localStorage.removeItem(chave(userId));
  } catch {
    // nada a fazer
  }
};

/* -------------------------------------------------------------- progresso --
 *
 * Onde a pessoa parou no guia completo. Guarda a CHAVE do passo, não o
 * índice: índice é posição numa lista que muda (entrar na conta libera os
 * capítulos de garagem e perfil, e tudo desanda uma casa). A chave sobrevive
 * a isso, e se o passo deixar de existir numa versão nova o guia recomeça do
 * zero em vez de abrir no lugar errado.
 */

const chaveJornada = (userId) => `engine.tour.journey:${userId || "guest"}`;

export const journeyProgress = (userId) => {
  try {
    return window.localStorage.getItem(chaveJornada(userId)) || "";
  } catch {
    return "";
  }
};

export const saveJourneyProgress = (userId, stepKey) => {
  try {
    if (stepKey) window.localStorage.setItem(chaveJornada(userId), stepKey);
  } catch {
    // vale só esta visita
  }
};

export const clearJourneyProgress = (userId) => {
  try {
    window.localStorage.removeItem(chaveJornada(userId));
  } catch {
    // nada a fazer
  }
};
