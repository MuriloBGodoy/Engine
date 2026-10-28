import { Calculator, ChevronRight, Key, PiggyBank, Receipt, Trash2, Trophy, CarFront } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { resolveVehicleSpecSheet } from "../services/carSpecSheet";
import { summaryTokens } from "./specsheet/labels";
import { simulateCar, isSimulatorAvailable } from "../services/ownership";
import { forecastCompletion } from "../services/forecast";
import { expenseInsights } from "../services/expenses";
import { CAR_TYPE_OWNED } from "../services/db";
import { formatCarBrand, formatFipeYear } from "../services/carDisplay";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1598209279122-8541213a0387?q=80&w=600";

/**
 * Barra de progresso em UMA linha: rotulo, porcentagem e o que falta dividem a
 * mesma faixa em vez de virarem tres blocos empilhados. O mesmo conteudo
 * ocupava tres linhas e ~100px na versao anterior do card.
 */
function ProgressStrip({ car, t, percentage, money, hideValues, locale }) {
  // O rótulo diz "Falta", então o número é o que FALTA. Até 25/09/2026 ele
  // mostrava o que já tinha sido juntado: com R$ 5 mil de R$ 118 mil o card
  // dizia "FALTA 4.2%" — quando faltavam 95,8%. A barra continua sendo o
  // progresso (o preenchido é o que já se juntou); o valor em reais ao lado
  // já era o que falta e não mudou.
  const remaining = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    Math.max(0, 100 - Number(percentage)),
  );
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
          {t("car.remaining")}{" "}
          <span className="tabular-nums text-[var(--engine-accent)]">
            {remaining}%
          </span>
        </span>
        <span className="text-base font-extrabold tabular-nums text-[var(--engine-text)]">
          {hideValues ? "R$ --" : money(Math.max(0, car.targetValue - car.savedValue))}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--engine-surface-2)]">
        <div
          className="h-full rounded-full bg-[var(--engine-accent)] transition-all duration-700"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * As duas acoes do rodape lado a lado. Sao acoes de peso diferente — a da
 * esquerda e a do dia a dia (aporte ou gasto), a da direita e o simulador — e
 * empilhadas custavam ~100px de altura. Lado a lado custam 44.
 *
 * Meta batida e o unico caso em que uma acao toma a largura inteira: ali nao
 * ha rotina a alimentar, ha uma conquista a declarar.
 */
function CardActions({
  car,
  t,
  i18n,
  isOwned,
  reachedGoal,
  ownershipTotal,
  forecast,
  spending,
  money,
  hideValues,
  onAddContribution,
  onAddExpense,
  onOpenOwnership,
  onMarkAchieved,
}) {
  if (reachedGoal && onMarkAchieved) {
    return (
      <button
        onClick={(event) => {
          event.stopPropagation();
          onMarkAchieved(car);
        }}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-3 text-[11px] font-black uppercase tracking-wider text-white transition hover:brightness-95"
      >
        <Trophy size={14} />
        {t("car.markAchieved")}
      </button>
    );
  }

  const primary = isOwned
    ? onAddExpense && {
        run: () => onAddExpense(car),
        Icon: Receipt,
        label: t("expenses.cardActionShort"),
        title: t("expenses.cardAction"),
        value:
          spending?.monthlyAverage &&
          (hideValues
            ? "R$ --"
            : t("expenses.perMonth", {
                value: money(spending.monthlyAverage, true),
              })),
      }
    : onAddContribution && {
        run: () => onAddContribution(car),
        Icon: PiggyBank,
        label: t("contribution.cardActionShort"),
        title: t("contribution.cardAction"),
        value:
          forecast &&
          forecast.date.toLocaleDateString(i18n.language, {
            month: "short",
            year: "numeric",
          }),
      };

  if (!primary && !onOpenOwnership) return null;

  return (
    <div className="flex gap-2">
      {primary && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            primary.run();
          }}
          // A coluna de 1280px COM a sidebar da ~294px ao card, e "REGISTRAR
          // APORTE" nao cabe em metade disso: virava "REGISTRAR A...". O
          // rotulo curto cabe; o longo continua acessivel no title.
          title={primary.title}
          className="flex min-h-11 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-[var(--engine-accent)]/30 bg-[var(--engine-accent-soft)] px-3 text-left transition-colors hover:border-[var(--engine-accent)]"
        >
          <primary.Icon size={15} className="shrink-0 text-[var(--engine-accent)]" />
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-bold uppercase text-[var(--engine-accent)]">
              {primary.label}
            </span>
            {primary.value && (
              <span className="block truncate text-[11px] font-semibold tabular-nums text-[var(--engine-text-muted)]">
                {primary.value}
              </span>
            )}
          </span>
        </button>
      )}
      {onOpenOwnership && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onOpenOwnership(car);
          }}
          title={t("ownership.cardMonthly")}
          className="flex min-h-11 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-left transition-colors hover:border-[var(--engine-accent)]"
        >
          <Calculator size={15} className="shrink-0 text-[var(--engine-accent)]" />
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-bold uppercase text-[var(--engine-text-muted)]">
              {t("ownership.cardMonthlyShort")}
            </span>
            <span className="block truncate text-[11px] font-extrabold tabular-nums text-[var(--engine-text)]">
              {ownershipTotal === null
                ? t("ownership.cardSimulate")
                : hideValues
                  ? "R$ --"
                  : money(ownershipTotal, true)}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

export function CarCard({
  car,
  onDelete,
  onOpenOwnership,
  onAddContribution,
  onAddExpense,
  onMarkAchieved,
  onOpenSpecs,
  hideValues = false,
}) {
  const { i18n, t } = useTranslation();
  // Fora do Brasil o simulador não responde: o botão vira só a porta para o
  // "estamos trabalhando nisso", sem número. O número é a manchete do modal
  // (`simulateCar`): o que sai todo mês, sem os boletos anuais — a mesma
  // conta, para o valor não "mudar" ao fechar o simulador.
  const ownershipTotal =
    car.ownership && isSimulatorAvailable(car.ownership.country)
      ? simulateCar(car).headline.monthly
      : null;
  const isOwned = car.type === CAR_TYPE_OWNED;
  // Meta batida mas ainda não confirmada: não faz sentido anunciar "falta
  // R$ 0,00". Vira convite pra pessoa declarar a conquista.
  const reachedGoal =
    !isOwned && car.targetValue > 0 && car.savedValue >= car.targetValue;
  // Data prevista no ritmo dos aportes; some quando ainda não há ritmo.
  const forecast = forecastCompletion(car);
  // Gasto real do mês, quando há histórico suficiente para a média valer.
  const spending = isOwned ? expenseInsights(car) : null;
  // A linha de resumo mostra SO o que o parser garante. Nada de "potencia nao
  // confirmada" aqui: com potencia de fabrica faltando em ~62% dos carros
  // reais, essa ressalva viraria um pedido de desculpas repetido em quase todo
  // card da garagem. A ausencia se explica na ficha, que e onde cabe o porque.
  const specs = useMemo(() => {
    if (!onOpenSpecs) return [];
    try {
      return summaryTokens(t, i18n.language, resolveVehicleSpecSheet(car));
    } catch {
      // Carro antigo com marca/modelo fora do padrao nao pode derrubar a
      // garagem inteira por causa de uma linha de resumo.
      return [];
    }
  }, [car, onOpenSpecs, t, i18n.language]);

  const percentage = Math.min(
    car.targetValue ? (car.savedValue / car.targetValue) * 100 : 0,
    100,
  ).toFixed(1);

  const money = (value, short) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "BRL",
      ...(short ? { maximumFractionDigits: 0 } : {}),
    }).format(value);

  // A identidade do carro vive DENTRO da foto, no degrade que ja existia e nao
  // fazia nada. Antes ela era um bloco proprio abaixo da imagem; aqui divide o
  // espaco com ela e custa zero de altura. E o que derrubou o card de 551px
  // para ~365px no celular sem encolher a foto: a Garagem continua vitrine.
  const identity = (
    <>
      <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
        {formatCarBrand(car.brand).toUpperCase()} · {formatFipeYear(car.year, t("car.zeroKm"))}
      </span>
      {/* Duas linhas, nao truncado: a ficha e o lugar onde o nome completo da
          versao cabe, mas "Onix Hatch LT 1.0 12V Flex 5p M..." na vitrine ainda
          seria a pessoa nao reconhecendo o proprio carro. */}
      <span className="mt-0.5 line-clamp-2 block font-display text-lg font-extrabold italic leading-tight tracking-tight text-white sm:text-xl">
        {car.model}
      </span>
      {specs.length > 0 && (
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-semibold text-white/70">
          {specs.map((token, index) => (
            <span key={token} className="flex items-center gap-1.5">
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className="h-[3px] w-[3px] rounded-full bg-white/40"
                />
              )}
              {token}
            </span>
          ))}
        </span>
      )}
    </>
  );

  return (
    // Nada de altura magica. A de 560px vinha da grade de tres colunas do
    // desktop, onde servia pra alinhar os cards — no celular, que tem UMA
    // coluna, ela nao alinhava nada e o `overflow-hidden` comia o que passasse
    // dela. Com o card mais baixo ela virou o problema oposto: 300px de vazio
    // no desktop. `h-full` resolve os dois: item de grade ja estica ate a
    // altura da linha, entao os cards de uma mesma linha se igualam sozinhos e
    // no celular cada um tem a altura do proprio conteudo.
    <div className="engine-card engine-card-hover group relative flex h-full flex-col overflow-hidden">
      <div className="relative aspect-16/10 w-full overflow-hidden bg-linear-to-br from-[var(--engine-surface-2)] via-[var(--engine-surface-2)]/50 to-[var(--engine-surface)] md:aspect-video">
        {/* Sem foto: o degradê do fundo e a silhueta, e não a imagem de
            banco (que só serve para URL quebrada). Uma foto de outro carro
            no lugar do "seu Pulse" era pior que nenhuma. */}
        {car.image ? (
          <img
            src={car.image}
            alt={car.model}
            loading="lazy"
            onError={(event) => {
              event.target.onerror = null;
              event.target.src = FALLBACK_IMAGE;
              event.target.classList.add("opacity-60");
            }}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center pb-10" aria-hidden="true">
            <CarFront size={56} strokeWidth={1.25} className="text-[var(--engine-text-subtle)] opacity-60" />
          </div>
        )}
        {/* Sem o degrade a identidade branca some numa foto clara. */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/25 to-transparent" />
        <button
          onClick={onDelete}
          title={t("common.delete")}
          aria-label={t("common.delete")}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg bg-black/45 text-white backdrop-blur-sm transition hover:bg-[var(--engine-accent)] focus-visible:opacity-100 max-lg:opacity-100 lg:h-9 lg:w-9 lg:opacity-0 lg:group-hover:opacity-100"
        >
          <Trash2 size={16} />
        </button>

        {/* A identidade E o botao da ficha tecnica — decisao do Murilo, contra
            o terceiro botao no rodape. Sem `onOpenSpecs` ela volta a ser texto:
            o card tambem aparece em tela onde a ficha nao faz sentido, e um
            botao que nao leva a lugar nenhum e pior que nenhum botao.

            O `stopPropagation` nao e detalhe: na Garagem o card INTEIRO ja abre
            a edicao do carro. Sem ele, tocar na identidade abriria os dois. */}
        {onOpenSpecs ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenSpecs(car);
            }}
            aria-label={t("specSheet.cardAction")}
            className="absolute inset-x-0 bottom-0 flex items-end gap-2 p-3 text-left sm:p-4"
          >
            <span className="min-w-0 flex-1">{identity}</span>
            <ChevronRight
              size={18}
              aria-hidden="true"
              className="mb-1 shrink-0 text-white/75 transition group-hover:translate-x-0.5 group-hover:text-white"
            />
          </button>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 min-w-0 p-3 sm:p-4">
            {identity}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-end gap-3 p-3 sm:p-4">
        {/* Carro que a pessoa ja tem nao tem progresso a exibir: no lugar da
            barra entra o selo de garagem. O ano, que antes vinha ao lado dele,
            agora esta na identidade sobre a foto. */}
        {isOwned ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--engine-accent-soft)] px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-[var(--engine-accent)]">
            <Key size={11} />
            {t("car.owned")}
          </span>
        ) : (
          <ProgressStrip
            car={car}
            t={t}
            percentage={percentage}
            money={money}
            hideValues={hideValues}
            locale={i18n.language}
          />
        )}

        <CardActions
          car={car}
          t={t}
          i18n={i18n}
          isOwned={isOwned}
          reachedGoal={reachedGoal}
          ownershipTotal={ownershipTotal}
          forecast={forecast}
          spending={spending}
          money={money}
          hideValues={hideValues}
          onAddContribution={onAddContribution}
          onAddExpense={onAddExpense}
          onOpenOwnership={onOpenOwnership}
          onMarkAchieved={onMarkAchieved}
        />
      </div>
    </div>
  );
}
