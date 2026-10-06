import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Calculator, Check, ChevronRight, Trophy } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { useIsDark } from "../hooks/useIsDark";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { estimateOwnership, isSimulatorAvailable } from "../services/ownership";
import { CAR_TYPE_OWNED } from "../services/db";
import { formatCarName } from "../services/carDisplay";

export function DashboardPage({ cars = [], settings, onOpenOwnership }) {
  const { i18n, t } = useTranslation();
  const isDark = useIsDark();
  // No celular o gráfico horizontal do ECharts não cabe (o rótulo do carro
  // sozinho comeria a largura da barra), então mostramos a mesma informação
  // como lista de progresso — mais legível e sem carregar o canvas.
  const isCompact = useMediaQuery("(max-width: 639px)");
  const hideValues = Boolean(settings?.privacy?.lockSensitiveValues);

  // Comparador de custo real: para carros já simulados usa os inputs salvos;
  // para os demais, estima com os padrões e a localização do perfil.
  const comparison = useMemo(
    () =>
      cars
        .filter((car) => Number(car.targetValue) > 0)
        .map((car) => {
          const hasSim = Boolean(car.ownership);
          const location = hasSim
            ? car.ownership
            : {
                country: settings?.profile?.country,
                state: settings?.profile?.state,
              };
          // Fora do Brasil o simulador não responde — sem linha no comparador.
          if (!isSimulatorAvailable(location.country)) return null;
          const result = estimateOwnership(car, car.ownership || {}, location);
          return {
            car,
            hasSim,
            monthlyTotal: result.totals.monthlyTotal,
            requiredIncome: result.recommendations.requiredIncomeTotal,
            idealDown: result.recommendations.recommendedDownPayment,
            downGap: result.recommendations.downPaymentGap,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.monthlyTotal - b.monthlyTotal),
    [cars, settings],
  );

  const money = (value) =>
    hideValues
      ? "R$ --"
      : new Intl.NumberFormat(i18n.language, {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0,
        }).format(value || 0);

  // Só metas: carro que a pessoa já tem entraria sempre em 100% e encheria o
  // gráfico de barras cheias que não dizem nada. No comparador de custo acima
  // ele continua, porque comparar o que se tem com o que se quer é o ponto.
  const chartData = useMemo(
    () =>
      cars
        .filter((car) => car.type !== CAR_TYPE_OWNED)
        .map((car) => ({
          name: formatCarName(car),
          value: car.targetValue
            ? Math.round((car.savedValue / car.targetValue) * 100)
            : 0,
        }))
        .sort((a, b) => a.value - b.value),
    [cars],
  );

  const axisColor = isDark ? "#f4f6fa" : "#0b0e14";
  const mutedColor = isDark ? "#6b7480" : "#8a93a3";
  const accentColor = isDark ? "#ff3b47" : "#e11d2a";

  // Altura acompanha a quantidade de carros: 500px fixos deixavam um vazio
  // enorme com 1 ou 2 metas e apertava tudo com muitas.
  const chartHeight = Math.min(
    560,
    Math.max(260, chartData.length * 52 + 60),
  );

  const option = {
    backgroundColor: "transparent",
    grid: { top: 10, bottom: 30, left: 170, right: 70, containLabel: false },
    xAxis: {
      max: 100,
      splitLine: { show: false },
      axisLabel: { color: mutedColor },
    },
    yAxis: {
      type: "category",
      data: chartData.map((d) => d.name),
      inverse: true,
      animationDuration: 300,
      animationDurationUpdate: 300,
      axisLabel: {
        color: axisColor,
        fontSize: 13,
        fontWeight: "bold",
        width: 156,
        overflow: "truncate",
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        realtimeSort: true,
        name: t("dashboard.progress"),
        type: "bar",
        data: chartData.map((d) => d.value),
        label: {
          show: true,
          position: "right",
          valueAnimation: true,
          color: axisColor,
          fontWeight: "bold",
          formatter: "{c}%",
        },
        itemStyle: {
          color(params) {
            return params.value >= 100 ? "#22c55e" : accentColor;
          },
          borderRadius: [0, 10, 10, 0],
        },
      },
    ],
    animationDuration: 2000,
    animationDurationUpdate: 2000,
    animationEasing: "linear",
    animationEasingUpdate: "linear",
  };

  return (
    <div>
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      <div className="engine-card relative overflow-hidden p-4 sm:p-8">
        {chartData.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-center text-sm font-medium text-[var(--engine-text-subtle)] sm:h-[420px]">
            {/* A corrida só tem metas (carro próprio ficaria sempre em 100%).
                Com carro próprio e sem meta, "nenhum carro na garagem" era
                mentira na mesma tela que listava o carro logo abaixo. */}
            {cars.length ? t("dashboard.emptyGoals") : t("dashboard.empty")}
          </div>
        ) : isCompact ? (
          <ul className="space-y-4">
            {[...chartData].reverse().map((item) => (
              <li key={item.name}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-bold text-[var(--engine-text)]">
                    {item.name}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-extrabold tabular-nums ${
                      item.value >= 100
                        ? "text-emerald-500"
                        : "text-[var(--engine-accent)]"
                    }`}
                  >
                    {item.value}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--engine-surface-2)]">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      item.value >= 100
                        ? "bg-emerald-500"
                        : "bg-[var(--engine-accent)]"
                    }`}
                    style={{ width: `${Math.min(item.value, 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ReactECharts option={option} style={{ height: `${chartHeight}px` }} />
        )}
      </div>

      {comparison.length > 0 && (
        <div className="engine-card mt-6 p-4 sm:p-6">
          <div className="mb-4">
            <h2 className="text-base font-extrabold tracking-tight text-[var(--engine-text)]">
              {t("dashboard.compareTitle")}
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--engine-text-muted)]">
              {t("dashboard.compareSubtitle")}
            </p>
          </div>

          {/* Mobile: cartões. Uma tabela de 5 colunas viraria rolagem lateral
              dentro da página, que é o pior padrão possível no celular. */}
          <ul className="space-y-3 sm:hidden">
            {comparison.map((row, index) => (
              <li key={row.car.id}>
                <button
                  type="button"
                  onClick={() => onOpenOwnership?.(row.car)}
                  className="w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3.5 text-left transition-colors active:border-[var(--engine-accent)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--engine-text)]">
                        {formatCarName(row.car)}
                      </p>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--engine-text-subtle)]">
                        <Calculator size={11} />
                        {row.hasSim
                          ? t("dashboard.simulated")
                          : t("dashboard.estimated")}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {index === 0 && comparison.length > 1 && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          <Trophy size={11} />
                          {t("dashboard.mostAffordable")}
                        </span>
                      )}
                      <ChevronRight
                        size={16}
                        className="text-[var(--engine-text-subtle)]"
                      />
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--engine-border)] pt-3">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-subtle)]">
                        {t("dashboard.colMonthly")}
                      </dt>
                      <dd className="text-sm font-extrabold tabular-nums text-[var(--engine-text)]">
                        {money(row.monthlyTotal)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-subtle)]">
                        {t("dashboard.colIncome")}
                      </dt>
                      <dd className="text-sm font-semibold tabular-nums text-[var(--engine-text-muted)]">
                        {money(row.requiredIncome)}
                      </dd>
                    </div>
                    {/* Entrada é coisa de quem vai comprar. O carro que a pessoa
                        já tem fica no comparador (comparar o que se tem com o
                        que se quer é o ponto), mas sem "entrada ideal" nem
                        "entrada pronta" — que não queriam dizer nada ali. */}
                    {row.car.type === CAR_TYPE_OWNED ? (
                      <div className="col-span-2 text-[11px] font-semibold text-[var(--engine-text-subtle)]">
                        {t("dashboard.ownedRow")}
                      </div>
                    ) : (
                    <>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-subtle)]">
                        {t("dashboard.colIdealDown")}
                      </dt>
                      <dd className="text-sm font-semibold tabular-nums text-[var(--engine-text-muted)]">
                        {money(row.idealDown)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-subtle)]">
                        {t("dashboard.colDownGap")}
                      </dt>
                      <dd className="text-sm font-semibold tabular-nums">
                        {row.downGap > 0 ? (
                          <span className="text-[var(--engine-accent)]">
                            {money(row.downGap)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Check size={14} />
                            {t("dashboard.downReady")}
                          </span>
                        )}
                      </dd>
                    </div>
                    </>
                    )}
                  </dl>
                </button>
              </li>
            ))}
          </ul>

          <div className="engine-scroll hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--engine-border)] text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                  <th className="py-2.5 pr-4">{t("dashboard.colCar")}</th>
                  <th className="py-2.5 pr-4 text-right">{t("dashboard.colMonthly")}</th>
                  <th className="py-2.5 pr-4 text-right">{t("dashboard.colIncome")}</th>
                  <th className="py-2.5 pr-4 text-right">{t("dashboard.colIdealDown")}</th>
                  <th className="py-2.5 text-right">{t("dashboard.colDownGap")}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, index) => (
                  <tr
                    key={row.car.id}
                    onClick={() => onOpenOwnership?.(row.car)}
                    className="cursor-pointer border-b border-[var(--engine-border)] transition-colors last:border-0 hover:bg-[var(--engine-surface-2)]"
                    title={t("dashboard.compareOpenHint")}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--engine-text)]">
                          {formatCarName(row.car)}
                        </span>
                        {index === 0 && comparison.length > 1 && (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            <Trophy size={11} />
                            {t("dashboard.mostAffordable")}
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--engine-text-subtle)]">
                        <Calculator size={11} />
                        {row.hasSim
                          ? t("dashboard.simulated")
                          : t("dashboard.estimated")}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-extrabold tabular-nums text-[var(--engine-text)]">
                      {money(row.monthlyTotal)}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums text-[var(--engine-text-muted)]">
                      {money(row.requiredIncome)}
                    </td>
                    {row.car.type === CAR_TYPE_OWNED ? (
                      <td
                        colSpan={2}
                        className="py-3 text-right text-[11px] font-semibold text-[var(--engine-text-subtle)]"
                      >
                        {t("dashboard.ownedRow")}
                      </td>
                    ) : (
                    <>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums text-[var(--engine-text-muted)]">
                      {money(row.idealDown)}
                    </td>
                    <td className="py-3 text-right font-semibold tabular-nums">
                      {row.downGap > 0 ? (
                        <span className="text-[var(--engine-accent)]">
                          {money(row.downGap)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <Check size={14} />
                          {t("dashboard.downReady")}
                        </span>
                      )}
                    </td>
                    </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] text-[var(--engine-text-subtle)]">
            {t("dashboard.compareNote")}
          </p>
        </div>
      )}
    </div>
  );
}
