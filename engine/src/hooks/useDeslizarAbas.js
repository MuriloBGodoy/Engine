import { useCallback, useRef } from "react";

/**
 * Passar de aba arrastando o dedo — o gesto que todo app de celular tem.
 *
 * Tocar numa tira de abas é mira: o alvo tem 13px de altura, fica no topo da
 * tela e exige levar o polegar até lá. O dedo deslizando sobre o CONTEÚDO é o
 * jeito que Instagram, X e WhatsApp resolvem isso, e é o que a mão já tenta
 * sozinha antes de aprender que aqui não funcionava.
 *
 * Um gesto só, num lugar só, usado por todas as telas de aba: profile,
 * comunidade, serviços, garagem. Se cada tela escrever o seu, elas divergem
 * no primeiro ajuste — uma passa com 40px, outra com 90px, e a mão nunca
 * aprende qual é.
 *
 * TRÊS COISAS QUE ELE NÃO PODE ATRAPALHAR
 *
 *  1. **Rolar a página.** Por isso nada de `preventDefault`: o navegador rola
 *     normalmente, e a decisão de trocar de aba só é tomada quando o dedo
 *     sai — comparando o quanto andou na horizontal com o quanto andou na
 *     vertical. Movimento mais vertical que horizontal é rolagem, e fica
 *     sendo rolagem.
 *  2. **O que já rola de lado.** Carrossel de fotos do post, tira de abas,
 *     lista de categorias: se o toque nasceu dentro de algo que rola na
 *     horizontal, o gesto é daquilo, não nosso. É a diferença entre "passei
 *     para a segunda foto" e "saí da aba sem querer".
 *  3. **O gesto de voltar do sistema.** Esse nasce na borda da tela e o
 *     navegador o captura antes de chegar aqui — por isso ele não aparece
 *     nesta conta. Nada a fazer, e nada a desfazer.
 */

/** Distância mínima na horizontal. Menos que isto é tremida de dedo. */
const DISTANCIA = 56;
/** Quanto o movimento precisa ser mais horizontal que vertical. */
const PROPORCAO = 1.6;
/** Acima disto já não é gesto, é o dedo parado na tela. */
const TEMPO_MAXIMO = 800;

/**
 * O toque nasceu dentro de algo que rola na horizontal?
 *
 * Sobe pelos pais até o limite (o container das abas). `scrollWidth` maior
 * que `clientWidth` é "tem mais coisa do que cabe"; a folha de estilo diz se
 * esse excesso rola ou está escondido.
 */
const dentroDeRolagemHorizontal = (alvo, limite) => {
  let no = alvo instanceof Element ? alvo : null;
  while (no && no !== limite) {
    if (no.scrollWidth - no.clientWidth > 8) {
      const estilo = window.getComputedStyle(no);
      if (/(auto|scroll)/.test(estilo.overflowX)) return true;
    }
    no = no.parentElement;
  }
  return false;
};

/**
 * @param ordem    Lista de ids das abas, na ordem em que aparecem na tira.
 * @param atual    Id da aba de agora.
 * @param aoTrocar Recebe o id da aba de destino.
 * @param ativo    Desliga o gesto sem tirar a chamada do hook (ex.: no
 *                 computador, onde não há dedo e existe o clique).
 */
export function useDeslizarAbas({ ordem, atual, aoTrocar, ativo = true }) {
  const inicio = useRef(null);

  const onTouchStart = useCallback((evento) => {
    // Dois dedos é pinça (zoom na foto), nunca troca de aba.
    if (evento.touches.length !== 1) {
      inicio.current = null;
      return;
    }
    const toque = evento.touches[0];
    inicio.current = {
      x: toque.clientX,
      y: toque.clientY,
      quando: Date.now(),
      recusado: dentroDeRolagemHorizontal(evento.target, evento.currentTarget),
    };
  }, []);

  const onTouchEnd = useCallback(
    (evento) => {
      const partida = inicio.current;
      inicio.current = null;
      if (!partida || partida.recusado) return;

      const toque = evento.changedTouches?.[0];
      if (!toque) return;

      const dx = toque.clientX - partida.x;
      const dy = toque.clientY - partida.y;
      if (Date.now() - partida.quando > TEMPO_MAXIMO) return;
      if (Math.abs(dx) < DISTANCIA) return;
      if (Math.abs(dx) < Math.abs(dy) * PROPORCAO) return;

      const onde = ordem.indexOf(atual);
      if (onde < 0) return;
      // Dedo para a ESQUERDA leva à aba da direita: o conteúdo é que anda,
      // como uma folha sendo empurrada para fora da tela.
      const destino = dx < 0 ? onde + 1 : onde - 1;
      // Sem dar a volta: na primeira aba, arrastar para a direita não faz
      // nada — é o que todo app faz, e é como a pessoa percebe que chegou ao
      // fim da fila.
      if (destino < 0 || destino >= ordem.length) return;
      aoTrocar(ordem[destino]);
    },
    [ordem, atual, aoTrocar],
  );

  if (!ativo) return {};
  return { onTouchStart, onTouchEnd };
}
