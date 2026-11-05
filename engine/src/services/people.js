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

/**
 * O caminho do perfil de alguém, resolvido pelo uid.
 *
 * O @ guardado junto de um comentário, de um post ou de uma conversa é uma
 * cópia do dia em que aquilo foi escrito. Quem troca de @ deixa cópias velhas
 * espalhadas pelo app, e cada uma delas vira um link para uma página que não
 * existe. O uid não muda: quando ele está à mão, é ele que manda.
 *
 * O @ guardado continua servindo de rede: conta apagada não tem perfil para
 * consultar, e aí é melhor tentar o endereço antigo do que não ir a lugar
 * nenhum.
 */
export async function resolveProfilePath(userId, fallbackUsername = "", getProfile) {
  if (userId && typeof getProfile === "function") {
    try {
      const perfil = await getProfile(userId);
      const atual = profilePath(perfil?.username);
      if (atual) return atual;
    } catch {
      // Sem rede ou perfil sumido: cai no @ guardado.
    }
  }
  return profilePath(fallbackUsername);
}

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
