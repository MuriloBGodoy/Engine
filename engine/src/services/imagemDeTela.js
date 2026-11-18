// VIRAR UM PEDAÇO DA TELA EM IMAGEM — e entregar essa imagem para a pessoa.
//
// Serve à Carteira de Garagem e ao adesivo do carro: dois desenhos feitos em
// HTML, para serem vistos fora do app (print, story, gráfica). Até aqui a
// única saída era o print do celular, que vem com a barra de status, o teclado
// às vezes, e no tamanho da tela.
//
// POR QUE UMA BIBLIOTECA. Navegador não transforma DOM em imagem. O truque
// conhecido (serializar o HTML dentro de um `<foreignObject>` de SVG e
// desenhar no canvas) funciona, mas quebra justamente onde este app vive: as
// fontes. Sora, Inter e Caveat são carregadas de fora, e dentro do
// `foreignObject` elas simplesmente não existem — o cartão sairia em Times
// New Roman, o que num desenho que imita documento é o defeito inteiro.
// `modern-screenshot` resolve isso embutindo a fonte em base64 antes de
// desenhar. São ~60 kB, carregados SÓ quando alguém clica em baixar.
//
// POR QUE COMPARTILHAR ANTES DE BAIXAR. No celular — que é onde isto vai ser
// usado — "baixar" joga o arquivo numa pasta de downloads que ninguém abre. O
// que a pessoa quer é mandar no grupo ou pôr no story. Então, quando o
// aparelho tem a folha de compartilhamento do sistema, é ela que abre (e a
// opção "Salvar imagem" está lá dentro). No computador, onde ela não existe,
// baixa.

/** Lazy: a biblioteca só entra no ar quando alguém pede uma imagem. */
const carregar = () => import("modern-screenshot");

/**
 * O elemento virado PNG.
 *
 * `escala` 3 num cartão de ~520 px dá ~1560 px de largura — nítido no feed do
 * Instagram e suficiente para imprimir um adesivo de 5 cm a 300 dpi.
 *
 * `fundo` importa: o cartão e o adesivo têm cantos arredondados, e PNG sem
 * fundo fica com os cantos transparentes — que viram preto em alguns
 * aplicativos de mensagem. Passar a cor do próprio desenho resolve.
 */
export async function elementoParaPng(elemento, { escala = 3, fundo = null } = {}) {
  if (!elemento) return null;
  const { domToBlob } = await carregar();
  return domToBlob(elemento, {
    scale: escala,
    type: "image/png",
    backgroundColor: fundo,
    /* A FOTO SUMIA DA IMAGEM EXPORTADA (17/11/2026).
     *
     * Para desenhar uma imagem de outro domínio, a biblioteca precisa LER os
     * bytes dela, e para isso refaz o download com CORS. Só que o padrão dela
     * é `cache: "force-cache"` — e a foto já estava no cache do navegador,
     * baixada pela própria tela como `<img>` comum, sem CORS. O navegador
     * devolve aquela cópia, que é opaca: dá para desenhar na tela, não dá para
     * ler. A leitura falha, a biblioteca troca a foto por um pixel
     * transparente (é o `placeholderImage` padrão dela) e não avisa ninguém —
     * o cartão sai inteiro, com um retângulo vazio no lugar do rosto.
     *
     * O Storage do Supabase responde `Access-Control-Allow-Origin: *` e manda
     * `max-age` de um ano, então sem isto a cópia errada ficaria valendo por
     * um ano. Pedir sem cache custa um download a mais no momento de exportar,
     * e só nele. */
    fetch: {
      requestInit: { mode: "cors", cache: "no-cache" },
      bypassingCache: true,
    },
    // A folha de estilo do app inteiro não precisa entrar no SVG: só o que
    // afeta este pedaço. Sem isto, o desenho de 500 px carrega 200 kB de CSS
    // de telas que ele não usa.
    filter: (no) => !(no instanceof HTMLElement && no.dataset?.foraDaImagem === "1"),
  });
}

/**
 * Entrega o arquivo: folha de compartilhamento do sistema quando existe,
 * download quando não.
 *
 * Devolve "compartilhado" | "baixado" | "cancelado", porque a tela precisa
 * saber o que dizer — "Imagem salva" depois de alguém cancelar a folha é
 * mentira, e mentira pequena é a que faz a pessoa procurar um arquivo que não
 * existe.
 */
export async function entregarArquivo(blob, nome, { titulo = "", texto = "" } = {}) {
  if (!blob) return "cancelado";
  const arquivo = new File([blob], nome, { type: blob.type || "image/png" });

  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: titulo, text: texto });
      return "compartilhado";
    } catch (erro) {
      // `AbortError` é a pessoa fechando a folha: não é falha, e não cai no
      // download — ela acabou de dizer que não quer.
      if (erro?.name === "AbortError") return "cancelado";
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revogar na hora cancela o download no Safari; um instante depois, não.
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "baixado";
}

/** Nome de arquivo seguro em qualquer sistema: sem acento, sem barra. */
export function nomeDeArquivo(...partes) {
  const base = partes
    .filter(Boolean)
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "engine"}.png`;
}
