/**
 * As redes oficiais do Engine — um lugar só.
 *
 * Isto morava dentro do `LINKS.social` do rodapé, e lá bastava enquanto o
 * rodapé era o único lugar que mostrava rede. Não é mais: no celular, quem
 * tem conta não vê rodapé nenhum (ele some inteiro), então o Instagram só
 * existiria para visitante e para quem abre no computador — justo o contrário
 * de quem a gente quer que siga.
 *
 * Regra que continua valendo: **rede sem endereço não aparece**. String vazia
 * some do rodapé e some de Configurações, sem nenhum outro ajuste. Criar a
 * conta e colar a URL aqui é o que faz o ícone voltar.
 *
 * Instagram no ar desde 17/11/2026 (@enginegarageapp). TikTok, LinkedIn,
 * Facebook, X e YouTube ainda não existem como conta.
 */

export const ENGINE_SOCIAL = {
  instagram: "https://www.instagram.com/enginegarageapp/",
  tiktok: "",
  linkedin: "",
  facebook: "",
  x: "",
  youtube: "",
};

/** O @ como se escreve, para quando o texto precisa dele e não do endereço. */
export const INSTAGRAM_HANDLE = "@enginegarageapp";

export const temRede = (href) => Boolean(href) && href !== "#";

/** Tem pelo menos uma rede no ar? */
export const temAlgumaRede = Object.values(ENGINE_SOCIAL).some(temRede);
