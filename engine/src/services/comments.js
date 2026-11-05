/**
 * A conversa de um post: a lista plana que o banco guarda vira fios.
 *
 * Mora fora do componente porque a árvore é regra de leitura, não desenho —
 * e porque um arquivo que exporta componentes e funções juntos quebra o
 * recarregamento rápido do Vite.
 */

/**
 * A lista plana do banco vira fios: cada comentário de raiz com as respostas
 * dele, na ordem em que foram escritas.
 *
 * Resposta cujo pai sumiu (comentário apagado) sobe para raiz em vez de
 * desaparecer junto — o que a pessoa escreveu continua valendo.
 */
export function buildThreads(comments = []) {
  const lista = comments.filter(Boolean);
  const ids = new Set(
    lista.map((item) => (typeof item === "string" ? "" : item.id)).filter(Boolean),
  );
  const raizes = [];
  const porPai = new Map();

  lista.forEach((item) => {
    const pai = typeof item === "string" ? "" : item.replyTo || "";
    if (pai && ids.has(pai)) {
      porPai.set(pai, [...(porPai.get(pai) || []), item]);
    } else {
      raizes.push(item);
    }
  });

  return raizes.map((comment) => ({
    comment,
    replies: porPai.get(typeof comment === "string" ? "" : comment.id) || [],
  }));
}
