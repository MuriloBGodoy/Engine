/**
 * O mínimo que toda tela precisa para desenhar uma pessoa e chegar ao perfil
 * dela.
 *
 * Nasceu em 04/11/2026: o nome e o retrato de alguém apareciam em uma dúzia
 * de telas (comentário, mural do clube, lista de membros, cabeçalho da
 * conversa, ranking) e em quase nenhuma dava para tocar e abrir o perfil.
 * Cada tela tinha sua cópia de "tira o @", "isto é uma URL ou são iniciais?".
 * Agora é uma regra só — e `profilePath` é o único lugar que sabe o endereço
 * de um perfil.
 */

/** "@ana" e "ana" viram "ana". */
export const withoutAt = (value = "") => String(value || "").replace(/^@+/, "");

/** Iniciais para quando não há retrato. */
export const getInitials = (name = "U") =>
  String(name || "U")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

/** Retrato de verdade (http/data) ou iniciais escritas à mão. */
export const isImageUrl = (value) =>
  typeof value === "string" && /^(https?:|data:image\/|blob:)/.test(value);

/**
 * O endereço do perfil de alguém, ou "" quando não dá para chegar lá.
 *
 * O perfil resolve por @, não por uid: sem @ (conta apagada, semente antiga)
 * não existe página para abrir, e quem chama precisa saber disso para não
 * oferecer um toque que não leva a lugar nenhum.
 */
export const profilePath = (username = "") => {
  const handle = withoutAt(username).trim();
  return handle ? `/community/@${handle}` : "";
};
