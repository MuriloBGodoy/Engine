/**
 * Enquadrar uma imagem dentro de uma moldura — a conta, sem tela nenhuma.
 *
 * Mora num serviço próprio porque o mesmo problema aparece em vários lugares
 * do Engine (fundo da carteira, capa do perfil, foto do anúncio, capa do
 * clube) e todos eles têm o mesmo atalho a oferecer: **o botão que ajeita
 * sozinho**, para quem não quer arrastar a foto com o dedo até ficar bom.
 *
 * O enquadramento é descrito por três números e nada mais:
 *
 *   escala  1 = a imagem no tamanho em que PREENCHE a moldura
 *   x, y    deslocamento em fração da moldura (0 = centro)
 *
 * Assim o mesmo estado serve para a prévia em CSS e para o canvas que salva,
 * sem conversão no meio — e cabe num jsonb de três campos quando for gravado.
 */

/** O estado neutro: preenchendo e centralizado. */
export const enquadramentoPadrao = () => ({ escala: 1, x: 0, y: 0 });

/**
 * "Preencher": a foto cobre a moldura inteira e o que sobra é cortado.
 *
 * É o que quase todo mundo quer e é o padrão — foto de fundo com faixa branca
 * nas laterais parece erro, não escolha.
 */
export const preencher = () => ({ escala: 1, x: 0, y: 0 });

/**
 * "Caber": a foto inteira aparece, e sobra moldura nas bordas.
 *
 * Precisa das proporções porque o quanto encolher depende de quão diferente
 * a foto é da moldura. Uma foto 1:1 numa moldura 85,6:54 encolhe bastante;
 * uma foto já parecida com a moldura quase não muda.
 */
export function caber({ larguraImagem, alturaImagem, larguraMoldura, alturaMoldura }) {
  const imagem = Number(larguraImagem) / Number(alturaImagem);
  const moldura = Number(larguraMoldura) / Number(alturaMoldura);
  if (!Number.isFinite(imagem) || !Number.isFinite(moldura) || imagem <= 0 || moldura <= 0) {
    return enquadramentoPadrao();
  }
  // Em "preencher", a imagem já está ampliada pelo lado que falta. "Caber" é
  // o inverso dessa ampliação.
  const fator = imagem > moldura ? moldura / imagem : imagem / moldura;
  return { escala: fator, x: 0, y: 0 };
}

/** Centralizar sem mexer no tamanho: o atalho para "me perdi arrastando". */
export const centralizar = (atual = enquadramentoPadrao()) => ({ ...atual, x: 0, y: 0 });

const entre = (valor, minimo, maximo) => Math.max(minimo, Math.min(maximo, valor));

/**
 * Impede que a foto seja arrastada para longe a ponto de aparecer moldura
 * vazia — mas só enquanto ela for maior que a moldura. Em "caber" a foto é
 * MENOR, e aí qualquer posição é legítima: travar ali prenderia a foto no
 * centro sem a pessoa entender por quê.
 */
export function prender(enquadramento, { larguraImagem, alturaImagem, larguraMoldura, alturaMoldura }) {
  const imagem = Number(larguraImagem) / Number(alturaImagem);
  const moldura = Number(larguraMoldura) / Number(alturaMoldura);
  const escala = Number(enquadramento?.escala) || 1;
  if (!Number.isFinite(imagem) || !Number.isFinite(moldura) || escala < 1) {
    return { ...enquadramentoPadrao(), ...enquadramento };
  }
  // Quanto a imagem transborda a moldura, em fração da moldura, de cada lado.
  const largura = (imagem > moldura ? imagem / moldura : 1) * escala;
  const altura = (imagem > moldura ? 1 : moldura / imagem) * escala;
  const folgaX = Math.max(0, (largura - 1) / 2);
  const folgaY = Math.max(0, (altura - 1) / 2);
  return {
    escala,
    x: entre(Number(enquadramento?.x) || 0, -folgaX, folgaX),
    y: entre(Number(enquadramento?.y) || 0, -folgaY, folgaY),
  };
}

/**
 * O `transform` e o `object-fit` que desenham este enquadramento no CSS.
 *
 * A imagem é sempre `object-fit: cover` e o resto é transform: assim
 * "preencher" não precisa de transform nenhum (escala 1, sem deslocamento),
 * que é o caso de quase todo mundo.
 */
export const estiloDoEnquadramento = (enquadramento = enquadramentoPadrao()) => ({
  objectFit: "cover",
  transform: `translate(${(enquadramento.x || 0) * 100}%, ${(enquadramento.y || 0) * 100}%) scale(${
    enquadramento.escala || 1
  })`,
  transformOrigin: "center",
});

/**
 * Desenha a imagem enquadrada num canvas, com a mesma conta da prévia.
 *
 * É este o par que importa: se a prévia e o arquivo salvo divergirem, a
 * pessoa ajeita a foto na tela e recebe outra coisa.
 */
export function desenharEnquadrado(ctx, imagem, enquadramento, { largura, altura }) {
  const escala = Number(enquadramento?.escala) || 1;
  const proporcaoImagem = imagem.naturalWidth / imagem.naturalHeight;
  const proporcaoMoldura = largura / altura;

  // O tamanho de "preencher", antes da escala.
  let base = proporcaoImagem > proporcaoMoldura
    ? { w: altura * proporcaoImagem, h: altura }
    : { w: largura, h: largura / proporcaoImagem };

  const w = base.w * escala;
  const h = base.h * escala;
  const x = (largura - w) / 2 + (Number(enquadramento?.x) || 0) * largura;
  const y = (altura - h) / 2 + (Number(enquadramento?.y) || 0) * altura;
  ctx.drawImage(imagem, x, y, w, h);
}
