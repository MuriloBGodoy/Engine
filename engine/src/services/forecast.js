/**
 * Previsão de quando a meta é alcançada, a partir do ritmo real de aportes.
 *
 * É a recompensa de registrar aporte: sem isso o histórico é só uma lista. A
 * data mudar quando a pessoa guarda mais é o que faz valer a pena voltar.
 */

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Ritmo mensal médio.
 *
 * Divide o total aportado pelos meses decorridos desde o primeiro aporte, em
 * vez de tirar a média por lançamento: quem aporta três vezes num mês e some
 * nos dois seguintes não tem ritmo de três, tem de um. O piso de 1 mês evita
 * projetar um futuro fantasioso a partir do primeiro aporte, feito hoje.
 */
export function monthlyPace(contributions = []) {
  if (!contributions.length) return 0;

  const total = contributions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const dates = contributions.map((item) => new Date(item.date).getTime()).filter(Boolean);
  if (!dates.length) return 0;

  const first = Math.min(...dates);
  const months = Math.max((Date.now() - first) / MONTH_MS, 1);

  return total / months;
}

/**
 * Quando a meta é atingida no ritmo atual.
 *
 * Devolve `null` quando não dá pra dizer — sem aporte, ou meta já batida.
 * Melhor não mostrar previsão do que mostrar uma inventada.
 */
export function forecastCompletion(car) {
  const target = Number(car?.targetValue) || 0;
  const saved = Number(car?.savedValue) || 0;
  const remaining = target - saved;

  if (!target || remaining <= 0) return null;

  return forecastAtPace(car, monthlyPace(car?.contributions));
}

/**
 * A mesma conta do `forecastCompletion`, com o ritmo dado de fora: é o "e se
 * eu guardar R$ X por mês" da página da meta. Mesma fórmula, mesmo teto —
 * a data que o controle mostra no ritmo atual é a mesma do card.
 */
export function forecastAtPace(car, pace) {
  const target = Number(car?.targetValue) || 0;
  const saved = Number(car?.savedValue) || 0;
  const remaining = target - saved;

  if (!target || remaining <= 0) return null;
  if (!(pace > 0)) return null;

  const months = Math.ceil(remaining / pace);
  // Acima de 50 anos a conta deixa de significar coisa alguma.
  if (!Number.isFinite(months) || months > 600) return null;

  const date = new Date();
  date.setMonth(date.getMonth() + months);

  return { months, date, pace, remaining };
}
