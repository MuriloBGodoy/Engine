import { fipeService } from "./fipeService";
import { localISODate } from "./reminders";

/**
 * Alerta de FIPE: o preço do carro mudou desde a última vez que a gente olhou.
 *
 * A FIPE republica a tabela UMA vez por mês. Então nada aqui precisa ser
 * rápido, frequente ou automático — e três escolhas saem disso:
 *
 *  1. **Roda no navegador, quando a pessoa abre a Garagem.** Não existe
 *     servidor nosso consultando FIPE de madrugada (o backend Java só sobe na
 *     máquina de quem desenvolve; em produção o navegador fala direto com a
 *     API pública — ver `fipeService`). Conferir na abertura da tela é o que
 *     dá para fazer sem infraestrutura nova, e é suficiente: a notícia "subiu
 *     R$ 900" não tem pressa de horas.
 *  2. **No máximo um carro por abertura, e no máximo um por mês.** A API é
 *     grátis e de terceiro; abrir a Garagem com seis carros e disparar seis
 *     consultas é abusar de quem paga a conta e deixar a tela lenta por uma
 *     informação que não é urgente. Um por vez, o mais atrasado primeiro, dá
 *     a volta na garagem inteira em menos de uma semana de uso.
 *  3. **Nunca escreve o preço novo sozinho.** Em uma meta, `targetValue` é o
 *     alvo da poupança da pessoa: mexer nele por conta própria muda a conta
 *     de quanto falta, e ela nunca pediu isso. O alerta mostra e oferece o
 *     botão; quem decide é ela.
 */

/** Um mês da FIPE, com folga: conferir no dia 31 não acha tabela nova. */
const DIAS_ENTRE_CONFERIDAS = 28;

const CHAVE_AVISADOS = "engine:fipe:avisados";

const diasEntre = (isoA, isoB) => {
  const a = Date.parse(`${isoA}T12:00:00`);
  const b = Date.parse(`${isoB}T12:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round(Math.abs(b - a) / 86400000);
};

/** "R$ 20.041,00" → 20041. Mesma conta do cadastro de carro. */
export const precoParaNumero = (texto) => {
  const centavos = Number(String(texto || "").replace(/\D/g, ""));
  return centavos ? centavos / 100 : 0;
};

/**
 * Este carro pode ser conferido?
 *
 * Precisa dos três códigos da FIPE (sem eles não há o que consultar), e o
 * preço guardado precisa ter VINDO da FIPE: quem digitou o valor na mão
 * declarou um preço próprio — "a FIPE discorda de você" não é alerta, é
 * atrevimento.
 */
export const podeConferir = (car = {}) =>
  Boolean(
    car?.fipe?.brandCode &&
      car?.fipe?.modelCode &&
      car?.fipe?.yearCode &&
      car?.priceSource === "fipe" &&
      car?.pricedAt &&
      Number(car?.targetValue) > 0,
  );

/** Já passou do mês desde a última consulta? */
export const estaVencido = (car = {}, hoje = localISODate()) =>
  podeConferir(car) && diasEntre(car.pricedAt, hoje) >= DIAS_ENTRE_CONFERIDAS;

/**
 * O carro a conferir agora: o mais atrasado de todos, ou nada.
 *
 * Um só, de propósito — ver a nota 2 no topo.
 */
export const proximoAConferir = (cars = [], hoje = localISODate()) =>
  cars
    .filter((car) => estaVencido(car, hoje))
    .sort((a, b) => String(a.pricedAt).localeCompare(String(b.pricedAt)))[0] || null;

/** O que mudou, em reais e em porcentagem. */
export const variacao = (antes, agora) => {
  const de = Number(antes) || 0;
  const para = Number(agora) || 0;
  const delta = para - de;
  return {
    de,
    para,
    delta,
    // Porcentagem com uma casa: a FIPE mexe de 0,3% a 3% por mês, e
    // arredondar para inteiro apagaria metade dos meses.
    pct: de > 0 ? Math.round((delta / de) * 1000) / 10 : 0,
    direcao: delta > 0 ? "up" : delta < 0 ? "down" : "same",
  };
};

/**
 * Consulta a FIPE deste carro. Devolve `{ valor, codigo }` ou null.
 *
 * Nunca estoura: é uma gentileza de fundo, e API de terceiro cai. Falhar em
 * silêncio deixa a Garagem exatamente como estava.
 */
export async function conferirPreco(car = {}) {
  if (!podeConferir(car)) return null;
  try {
    const veiculo = await fipeService.getVehicle(car.fipe.brandCode, car.fipe.modelCode, car.fipe.yearCode);
    const valor = precoParaNumero(veiculo?.Valor);
    if (!valor) return null;
    return { valor, codigo: veiculo?.CodigoFipe || car.fipe.code || "" };
  } catch (erro) {
    console.warn("[fipe] não deu para conferir o preço agora.", erro);
    return null;
  }
}

/* ------------------------------------------------- o que já foi avisado -- */

/*
 * O alerta é dispensável, e dispensado tem de ficar dispensado.
 *
 * Guardado no aparelho e não no servidor: é preferência de quem está olhando
 * a tela, não dado da conta. Vem com try/catch porque janela privada e
 * armazenamento bloqueado existem — e aí o alerta aparece de novo, que é o
 * pior defeito possível desta função e nenhum problema de verdade.
 */
const lerAvisados = () => {
  try {
    const cru = window.localStorage.getItem(CHAVE_AVISADOS);
    const dados = cru ? JSON.parse(cru) : null;
    return dados && typeof dados === "object" ? dados : {};
  } catch {
    return {};
  }
};

/** A marca é o VALOR avisado, não o carro: se mexer de novo, avisa de novo. */
export const jaAvisado = (carId, valor) => lerAvisados()[String(carId)] === Number(valor);

export const marcarAvisado = (carId, valor) => {
  try {
    const dados = lerAvisados();
    dados[String(carId)] = Number(valor);
    window.localStorage.setItem(CHAVE_AVISADOS, JSON.stringify(dados));
  } catch {
    // Sem armazenamento o alerta volta na próxima abertura. Aceitável.
  }
};
