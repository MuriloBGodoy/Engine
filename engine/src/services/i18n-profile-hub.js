import i18n from "./i18n";

/**
 * Textos da arrumação do perfil (06/11/2026).
 *
 * O perfil tinha sete abas e nenhuma hierarquia: Publicações dividia a tira
 * com Seguidores, Seguindo, Salvos e Arquivadas. Duas dessas são listas de
 * gente (que toda rede abre pelo contador) e duas são coisas minhas (que
 * toda rede esconde atrás do "..."). Sobrou espaço para o que faltava:
 * Garagem.
 *
 * Fora do i18n.js pelo mesmo motivo dos outros módulos: aquele arquivo é
 * mexido por várias frentes e colide. Entra por `addResourceBundle` com
 * deep merge.
 */

const ptBR = {
  peopleSheet: {
    followers: "Seguidores",
    following: "Seguindo",
    search: "Buscar",
    close: "Fechar",
    follow: "Seguir",
    options: "Opções",
    removeFollower: "Remover seguidor",
    removeTitle: "Remover seguidor?",
    removeMessage:
      "{{user}} deixa de seguir você. A pessoa não é avisada e pode seguir de novo — para barrar de vez, bloqueie.",
    removeConfirm: "Remover",
    removed: "Seguidor removido.",
    noMatch: "Ninguém com esse nome.",
    emptyFollowers: "Ninguém segue este perfil ainda.",
    emptyFollowing: "Este perfil ainda não segue ninguém.",
    unknown: "Usuário Engine",
  },
  profileHub: {
    menu: "Minhas coisas",
    liked: "Curtidas",
    likedOnlyYou: "Só você vê o que curtiu.",
    likedEmpty: "Você ainda não curtiu nada.",
    settings: "Configurações",
    grid: "Fotos e vídeos",
    texts: "Textos",
    garage: "Garagem",
    garageEmpty: "Nenhum carro na comunidade.",
    garageEmptyMine:
      "Ligue “Mostrar na comunidade” no carro da sua garagem e ele aparece aqui, com página própria e na busca.",
    garageGo: "Ir para a garagem",
    // A diferença que o Murilo pediu para ficar clara, dita onde ela
    // importa: no topo de cada aba, uma linha, sem manual.
    postsHint: "O que você contou — com ou sem carro ligado.",
    postsHintOther: "O que esta pessoa contou — com ou sem carro ligado.",
    garageHint: "Os carros que você abriu para a comunidade achar.",
    garageHintOther: "Os carros que esta pessoa abriu para a comunidade achar.",
  },
};

const enUS = {
  peopleSheet: {
    followers: "Followers",
    following: "Following",
    search: "Search",
    close: "Close",
    follow: "Follow",
    options: "Options",
    removeFollower: "Remove follower",
    removeTitle: "Remove follower?",
    removeMessage:
      "{{user}} stops following you. They are not notified and can follow again — to stop it for good, block them.",
    removeConfirm: "Remove",
    removed: "Follower removed.",
    noMatch: "No one by that name.",
    emptyFollowers: "No one follows this profile yet.",
    emptyFollowing: "This profile doesn't follow anyone yet.",
    unknown: "Engine user",
  },
  profileHub: {
    menu: "My stuff",
    liked: "Liked",
    likedOnlyYou: "Only you see what you liked.",
    likedEmpty: "You haven't liked anything yet.",
    settings: "Settings",
    grid: "Photos and videos",
    texts: "Text",
    garage: "Garage",
    garageEmpty: "No cars in the community.",
    garageEmptyMine:
      "Turn on “Show in the community” on a car in your garage and it shows up here, with its own page and in search.",
    garageGo: "Go to the garage",
    postsHint: "What you told — with or without a car attached.",
    postsHintOther: "What this person told — with or without a car attached.",
    garageHint: "The cars you opened up for the community to find.",
    garageHintOther: "The cars this person opened up for the community to find.",
  },
};

const esES = {
  peopleSheet: {
    followers: "Seguidores",
    following: "Siguiendo",
    search: "Buscar",
    close: "Cerrar",
    follow: "Seguir",
    options: "Opciones",
    removeFollower: "Quitar seguidor",
    removeTitle: "¿Quitar seguidor?",
    removeMessage:
      "{{user}} deja de seguirte. No se le avisa y puede volver a seguirte — para cortarlo de verdad, bloquéalo.",
    removeConfirm: "Quitar",
    removed: "Seguidor quitado.",
    noMatch: "Nadie con ese nombre.",
    emptyFollowers: "Nadie sigue este perfil todavía.",
    emptyFollowing: "Este perfil aún no sigue a nadie.",
    unknown: "Usuario Engine",
  },
  profileHub: {
    menu: "Mis cosas",
    liked: "Me gusta",
    likedOnlyYou: "Solo tú ves lo que te gustó.",
    likedEmpty: "Todavía no te gustó nada.",
    settings: "Ajustes",
    grid: "Fotos y vídeos",
    texts: "Textos",
    garage: "Garaje",
    garageEmpty: "Ningún coche en la comunidad.",
    garageEmptyMine:
      "Activa “Mostrar en la comunidad” en un coche de tu garaje y aparece aquí, con página propia y en la búsqueda.",
    garageGo: "Ir al garaje",
    postsHint: "Lo que contaste — con o sin coche vinculado.",
    postsHintOther: "Lo que contó esta persona — con o sin coche vinculado.",
    garageHint: "Los coches que abriste para que la comunidad los encuentre.",
    garageHintOther: "Los coches que esta persona abrió para que la comunidad los encuentre.",
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
