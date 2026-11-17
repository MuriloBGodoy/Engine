// ESCONDER A PLACA (e qualquer outra coisa) NA FOTO.
//
// Por que pixelar e não borrar: desfoque é reversível. Um `blur` de canvas
// espalha a informação, mas ela continua lá — existe software que recupera
// texto de placa borrada, e já existe gente usando isso. Pixelar com blocos
// grandes JOGA FORA a informação: cada bloco vira a média dos pixels dele, e
// média não tem volta.
//
// E por que isso importa num app de carro: a placa é o identificador do
// veículo e, por tabela, do dono. Com placa e cidade (que o perfil mostra) dá
// para consultar multas, rastrear o carro em grupos de revenda e abrir
// conversa em nome do dono. Quem posta o carro quer mostrar o carro, não
// entregar o documento dele.
//
// A conta roda SEMPRE antes de a foto subir, no canvas que já vai ser
// codificado — o arquivo que chega ao servidor nunca teve a placa. Esconder
// na exibição (uma tarja por cima, no CSS) seria teatro: o arquivo original
// continuaria público para quem abrisse o endereço da imagem.

/** Quantos blocos o lado maior da região ganha. 7 apaga texto de placa. */
const BLOCOS = 7;

/**
 * Pixela as regiões no canvas, no lugar.
 *
 * `regioes` são retângulos em coordenadas NORMALIZADAS (0..1) sobre o canvas,
 * `{ x, y, w, h }`. Normalizadas porque quem desenha é a tela (que mostra a
 * foto reduzida) e quem aplica é o canvas em tamanho cheio — guardar pixel da
 * tela faria a tarja escorregar de lugar no arquivo final.
 */
export function pixelarRegioes(canvas, regioes = []) {
  if (!canvas || !regioes.length) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  for (const regiao of regioes) {
    const x = Math.round(Math.max(0, Math.min(1, regiao.x)) * canvas.width);
    const y = Math.round(Math.max(0, Math.min(1, regiao.y)) * canvas.height);
    const w = Math.round(Math.min(1 - regiao.x, regiao.w) * canvas.width);
    const h = Math.round(Math.min(1 - regiao.y, regiao.h) * canvas.height);
    if (w < 2 || h < 2) continue;

    const lado = Math.max(w, h);
    const bloco = Math.max(2, Math.round(lado / BLOCOS));
    const pw = Math.max(1, Math.round(w / bloco));
    const ph = Math.max(1, Math.round(h / bloco));

    // O caminho de ida e volta: a região encolhe para pw × ph (cada pixel do
    // destino é a média de um bloco, porque a redução É a média) e volta
    // ampliada com a suavização DESLIGADA, o que mantém os blocos quadrados
    // em vez de voltar a parecer um desfoque.
    const aux = document.createElement("canvas");
    aux.width = pw;
    aux.height = ph;
    const auxCtx = aux.getContext("2d");
    if (!auxCtx) continue;
    auxCtx.drawImage(canvas, x, y, w, h, 0, 0, pw, ph);

    const suavizava = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(aux, 0, 0, pw, ph, x, y, w, h);
    ctx.imageSmoothingEnabled = suavizava;
  }
}

/** Região com tamanho de gente: descarta o toque que virou retângulo de 2px. */
export const regiaoVale = (regiao) =>
  Boolean(regiao) && regiao.w >= 0.02 && regiao.h >= 0.015;

/** O retângulo entre dois pontos normalizados, sempre com largura positiva. */
export function regiaoEntre(a, b) {
  const x = Math.max(0, Math.min(a.x, b.x));
  const y = Math.max(0, Math.min(a.y, b.y));
  const w = Math.min(1 - x, Math.abs(a.x - b.x));
  const h = Math.min(1 - y, Math.abs(a.y - b.y));
  return { x, y, w, h };
}

/** O ponto caiu dentro da região? Usado para tocar e apagar. */
export const dentro = (regiao, ponto) =>
  ponto.x >= regiao.x &&
  ponto.x <= regiao.x + regiao.w &&
  ponto.y >= regiao.y &&
  ponto.y <= regiao.y + regiao.h;
