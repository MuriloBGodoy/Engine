/**
 * A foto que veio da área de transferência (Ctrl+V).
 *
 * Até 07/11/2026 o único caminho para mandar uma imagem — no chat e no
 * compositor de post — era o seletor de arquivo. Quem tira um print, recorta
 * algo ou copia uma foto de outra aba tem a imagem na mão e nenhum arquivo
 * para apontar: tinha que salvar no disco primeiro. Todo app de mensagem
 * resolve isso há anos com o colar.
 *
 * Duas armadilhas, e é por elas que isto é um módulo e não três linhas
 * repetidas em cada campo:
 *
 *  1. Nem todo navegador preenche `clipboardData.files`. O Safari costuma
 *     entregar só `items` com `kind === "file"`. Ler os dois e juntar é o
 *     que faz o colar funcionar no iPhone também.
 *
 *  2. Copiar texto de uma página traz junto um `text/html`, e nenhum arquivo.
 *     Mas copiar uma IMAGEM de uma página traz o arquivo e o `text/html` da
 *     tag — sem `text/plain`. Então a regra é: só tratamos como foto quando
 *     NÃO há texto puro no clipboard. Assim colar texto continua sendo colar
 *     texto, sempre, e nunca engolimos o que a pessoa queria escrever.
 */

const isImage = (file) => Boolean(file?.type?.startsWith("image/"));

/** Assinatura barata para não contar a mesma foto duas vezes (files + items). */
const fingerprint = (file) => `${file.name || ""}:${file.size}:${file.type}:${file.lastModified || 0}`;

/**
 * As imagens de um evento de colar, em ordem, no máximo `max`.
 * Devolve `[]` quando o que foi colado é texto — aí o navegador segue normal.
 */
export function imagesFromPaste(event, { max = 1 } = {}) {
  const data = event?.clipboardData;
  if (!data) return [];

  // Colou texto: isto não é nosso. Sai antes de qualquer outra coisa.
  const types = Array.from(data.types || []);
  if (types.includes("text/plain")) return [];

  const found = [];
  const seen = new Set();
  const take = (file) => {
    if (!isImage(file)) return;
    const key = fingerprint(file);
    if (seen.has(key)) return;
    seen.add(key);
    found.push(file);
  };

  Array.from(data.files || []).forEach(take);
  Array.from(data.items || []).forEach((item) => {
    if (item.kind === "file") take(item.getAsFile());
  });

  return found.slice(0, max);
}
