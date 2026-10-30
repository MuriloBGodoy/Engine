import i18n from "./i18n";

/**
 * Textos do feed no jeito do Instagram (30/10/2026): prévia de comentários no
 * cartão, folha de comentários e a grade de publicações do perfil, que abre
 * num feed vertical da pessoa.
 *
 * Arquivo próprio pelo mesmo motivo do i18n-social-fixes.js: o i18n.js é
 * editado por várias frentes ao mesmo tempo. É importado pelas telas que usam
 * as chaves (Community e UserProfile), não pelo main.jsx.
 */

const ptBR = {
  socialFeed: {
    viewAllComments_one: "Ver 1 comentário",
    viewAllComments_other: "Ver todos os {{count}} comentários",
    closeComments: "Fechar comentários",
    postsTab: "Publicações",
    postsTitle: "Publicações",
    backToProfile: "Voltar ao perfil",
    multiplePhotos: "Várias fotos",
    video: "Vídeo",
    tileStats: "{{likes}} curtidas, {{comments}} comentários",
  },
};

const enUS = {
  socialFeed: {
    viewAllComments_one: "View 1 comment",
    viewAllComments_other: "View all {{count}} comments",
    closeComments: "Close comments",
    postsTab: "Posts",
    postsTitle: "Posts",
    backToProfile: "Back to profile",
    multiplePhotos: "Multiple photos",
    video: "Video",
    tileStats: "{{likes}} likes, {{comments}} comments",
  },
};

const esES = {
  socialFeed: {
    viewAllComments_one: "Ver 1 comentario",
    viewAllComments_other: "Ver los {{count}} comentarios",
    closeComments: "Cerrar comentarios",
    postsTab: "Publicaciones",
    postsTitle: "Publicaciones",
    backToProfile: "Volver al perfil",
    multiplePhotos: "Varias fotos",
    video: "Vídeo",
    tileStats: "{{likes}} me gusta, {{comments}} comentarios",
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
