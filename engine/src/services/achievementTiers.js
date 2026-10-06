/**
 * A régua das conquistas: catálogo, ids, degraus e as regras de qual selo
 * aparece.
 *
 * Separado de `achievements.js` de propósito, e sem NENHUMA importação: assim a
 * lógica que decide o que a tela mostra pode ser testada em Node direto, sem
 * arrastar o Firebase junto. (`achievements.js` importa `./firebase` sem
 * extensão — o Vite resolve, o Node não.)
 *
 * A LISTA DE IDS AQUI ESPELHA A REGRA DO FIRESTORE. Se mudar um, mude o outro —
 * id fora da lista é negado pelo servidor. `npm run check:achievements` compara
 * as duas e fica vermelho se divergirem.
 *
 * Catálogo ampliado em 06/10/2026 (10 → 37). O Murilo achou as conquistas
 * "vazias e simples", e eram: quatro marcos e uma escada de curtidas que
 * começava em 1.000 — com 11 curtidas reais, a pessoa via "1/4" e uma barra
 * parada por meses. Nada do que o app ganhou depois (clubes, eventos, diário
 * de gastos, aportes, simulador) virava conquista. Os dez ids antigos
 * continuam iguais: quem já tinha, continua tendo.
 */

/**
 * Categorias, na ordem em que a aba mostra. Cada item é um MARCO (acontece uma
 * vez, `id`) ou uma SÉRIE com degraus (`series` + `tiers`, ids
 * `${series}_${degrau}`). A série mostra os degraus batidos e só UM à frente.
 */
export const ACHIEVEMENT_CATALOG = [
  {
    key: "garage",
    items: [
      { id: "first_goal" },
      { id: "owned_car" },
      { id: "first_contribution" },
      { id: "halfway" },
      { id: "first_conquest" },
      // Meses SEGUIDOS com pelo menos um aporte — o hábito que a meta precisa.
      { series: "streak", tiers: [3, 6, 12] },
    ],
  },
  {
    key: "logbook",
    items: [
      { id: "first_expense" },
      { series: "expenses", tiers: [10, 50, 100] },
      // Abastecimentos suficientes para o app medir o km/l real do carro.
      { id: "measured_consumption" },
    ],
  },
  {
    key: "community",
    items: [
      { id: "first_post" },
      { id: "first_comment" },
      // Curtidas recebidas somando todos os posts. A escada antiga começava
      // em 1.000; os quatro degraus pequenos dão o primeiro passo a quem
      // acabou de chegar.
      { series: "likes", tiers: [10, 50, 100, 500, 1000, 10000, 50000, 100000, 500000, 1000000] },
      { series: "followers", tiers: [10, 100, 1000] },
    ],
  },
  {
    key: "clubs",
    items: [
      { id: "club_joined" },
      { id: "club_founder" },
      { id: "club_first_post" },
      // Para quem fundou: o clube dele chegou a N membros.
      { series: "club_members", tiers: [10, 50] },
    ],
  },
  {
    key: "events",
    items: [
      { id: "event_rsvp" },
      { id: "event_organizer" },
      // Para quem organizou: um evento dele com N presenças confirmadas.
      { series: "event_attendees", tiers: [10] },
    ],
  },
  {
    key: "simulator",
    items: [{ id: "first_simulation" }],
  },
];

export const seriesTierId = (series, tier) => `${series}_${tier}`;

const idsOfItem = (item) =>
  item.id ? [item.id] : item.tiers.map((tier) => seriesTierId(item.series, tier));

/** Todos os ids, na ordem do catálogo. É esta lista que a regra espelha. */
export const ACHIEVEMENT_IDS = ACHIEVEMENT_CATALOG.flatMap((category) =>
  category.items.flatMap(idsOfItem),
);

/** Id conhecido pela regra do Firestore? Fora da lista, o servidor nega. */
export const isAchievementId = (id) => ACHIEVEMENT_IDS.includes(id);

const CATEGORY_OF = Object.fromEntries(
  ACHIEVEMENT_CATALOG.flatMap((category) =>
    category.items.flatMap(idsOfItem).map((id) => [id, category.key]),
  ),
);

/** A categoria de um id ("garage", "community"...). Decide a celebração. */
export const categoryOf = (id) => CATEGORY_OF[id] || null;

/** A série de um id de degrau ("likes_1000" -> { series: "likes", tier: 1000 }). */
export const seriesOf = (id) => {
  for (const category of ACHIEVEMENT_CATALOG) {
    for (const item of category.items) {
      if (!item.series) continue;
      const tier = item.tiers.find((t) => seriesTierId(item.series, t) === id);
      if (tier !== undefined) return { series: item.series, tier };
    }
  }
  return null;
};

/** Degraus de uma série. */
export const tiersOf = (series) =>
  ACHIEVEMENT_CATALOG.flatMap((c) => c.items).find((item) => item.series === series)?.tiers || [];

/**
 * Quais degraus a tela deve mostrar: os já batidos, mais UM à frente.
 *
 * Mostrar a escada inteira no primeiro dia anunciaria um alcance que o produto
 * não tem — quem tem 20 curtidas não precisa ver o degrau de 1 milhão. Quem
 * tem zero vê o primeiro, para a série nunca aparecer vazia.
 */
export const visibleTiers = (tiers, value = 0) => {
  const batidos = tiers.filter((tier) => value >= tier);
  const proximo = tiers.find((tier) => value < tier);
  return proximo ? [...batidos, proximo] : batidos;
};

/** Degraus efetivamente cruzados por um valor. */
export const earnedTiers = (tiers, value = 0) => tiers.filter((tier) => value >= tier);

// ---------------------------------------------------------------------------
// O que a garagem da própria pessoa já dá
// ---------------------------------------------------------------------------

const monthKey = (date) => String(date || "").slice(0, 7); // "2026-10"

/** Maior sequência de meses SEGUIDOS presentes num conjunto de "AAAA-MM". */
export const longestMonthStreak = (months = []) => {
  const index = (key) => {
    const [y, m] = key.split("-").map(Number);
    return y * 12 + (m - 1);
  };
  const sorted = [...new Set(months.filter((k) => /^\d{4}-\d{2}$/.test(k)))]
    .map(index)
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
};

/**
 * Ids que os carros da pessoa justificam. Puro: recebe os carros e um fato
 * que depende de outro módulo (`hasMeasuredConsumption`, calculado com o
 * `realConsumption` de expenses.js), e devolve a lista. Quem grava é o
 * achievements.js.
 *
 * `ownedType` é o valor de `car.type` para carro que a pessoa já tem.
 */
export const garageAchievementIds = (cars = [], { ownedType = "owned", hasMeasuredConsumption = false } = {}) => {
  const ids = [];
  const goals = cars.filter((car) => car.type !== ownedType);
  const target = (car) => Number(car.targetValue) || 0;
  const saved = (car) => Number(car.savedValue) || 0;

  if (goals.length) ids.push("first_goal");
  if (cars.some((car) => car.type === ownedType)) ids.push("owned_car");
  if (cars.some((car) => target(car) > 0 && saved(car) >= target(car))) ids.push("first_conquest");
  if (goals.some((car) => target(car) > 0 && saved(car) >= target(car) / 2)) ids.push("halfway");

  const contributions = cars.flatMap((car) => car.contributions || []);
  if (contributions.length) ids.push("first_contribution");
  const streak = longestMonthStreak(contributions.map((c) => monthKey(c.date)));
  for (const tier of earnedTiers(tiersOf("streak"), streak)) ids.push(seriesTierId("streak", tier));

  const expenses = cars.reduce((sum, car) => sum + (car.expenses || []).length, 0);
  if (expenses > 0) ids.push("first_expense");
  for (const tier of earnedTiers(tiersOf("expenses"), expenses)) ids.push(seriesTierId("expenses", tier));
  if (hasMeasuredConsumption) ids.push("measured_consumption");

  if (cars.some((car) => car.ownership)) ids.push("first_simulation");
  return ids;
};

// ---------------------------------------------------------------------------
// Nomes antigos, mantidos: o resto do app importa estes.
// ---------------------------------------------------------------------------

/** Degraus de curtidas recebidas, somando todos os posts da pessoa. */
export const LIKE_TIERS = tiersOf("likes");
export const FOLLOWER_TIERS = tiersOf("followers");
export const likeTierId = (tier) => seriesTierId("likes", tier);
export const visibleLikeTiers = (likesReceived = 0) => visibleTiers(LIKE_TIERS, likesReceived);
export const earnedLikeTiers = (likesReceived = 0) => earnedTiers(LIKE_TIERS, likesReceived);

/** Marcos únicos (não são degrau de série). */
export const MILESTONE_IDS = ACHIEVEMENT_CATALOG.flatMap((c) =>
  c.items.filter((item) => item.id).map((item) => item.id),
);

/**
 * A faixa que um POST exibe: só a mais alta que ele bateu sozinho — e só a
 * partir de 1.000. Os degraus pequenos (10, 50...) são do PERFIL: num post,
 * uma faixa de "10 curtidas" seria ruído em metade do feed.
 */
export const POST_BADGE_TIERS = LIKE_TIERS.filter((tier) => tier >= 1000);
export const postBadgeTier = (postLikes = 0) => {
  const cruzados = POST_BADGE_TIERS.filter((tier) => postLikes >= tier);
  return cruzados.length ? cruzados[cruzados.length - 1] : null;
};
