import { useEffect } from "react";
import { CloudOff, KeyRound, Plus, RefreshCw, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { syncGarageReminders } from "../services/remindersSync";
import { carPath } from "../services/garageSummary";
import { CarCard } from "../components/CarCard";
import { GarageSummary } from "../components/garage/GarageSummary";
import { CAR_TYPE_GOAL, CAR_TYPE_OWNED } from "../services/db";
import { Button } from "../components/Button";

const sortCars = (cars, sortMode) => {
  const getProgress = (car) => {
    if (!car.targetValue) return 0;
    return car.savedValue / car.targetValue;
  };

  return [...cars].sort((a, b) => {
    switch (sortMode) {
      case "progress-asc":
        return getProgress(a) - getProgress(b);
      case "target-desc":
        return b.targetValue - a.targetValue;
      case "name-asc":
        return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
      case "progress-desc":
      default:
        return getProgress(b) - getProgress(a);
    }
  });
};

/**
 * Garagem 2.0 (aprovada em 01/11/2026). Resumo no topo, o carro que a pessoa
 * TEM antes das metas, e cada card abre a página do carro (/garagem/:id).
 *
 * A lista "Próximos vencimentos" que abria a tela foi para a aba Lembretes
 * de cada carro: no celular ela ocupava a primeira tela inteira. Aqui ficou
 * o mais urgente (no resumo e no card) e o convite para configurar virou item
 * da lista "o que falta" do card.
 */
export function Garagem({
  cars,
  onOpenModal,
  onOpenDelete,
  onOpenOwnership,
  onAddContribution,
  onAddExpense,
  onMarkAchieved,
  onOpenSpecs,
  defaultSort = "progress-desc",
  hideValues = false,
  loadError = null,
  onRetry,
  accountEmail = "",
  userId = "",
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Leva as datas firmes ao servidor (o job diário do sino). Só reenvia o carro
  // cujo conteúdo mudou — ver remindersSync.js. Efeito sem setState.
  useEffect(() => {
    if (userId && cars.length) syncGarageReminders(userId, cars);
  }, [userId, cars]);

  const sortedCars = sortCars(cars, defaultSort);
  const ownedCars = sortedCars.filter((car) => car.type === CAR_TYPE_OWNED);
  const goalCars = sortedCars.filter((car) => car.type !== CAR_TYPE_OWNED);

  const cardProps = (car) => ({
    car,
    hideValues,
    onOpen: (item) => navigate(carPath(item)),
    onEdit: (item) => onOpenModal(item),
    onDelete: (item) => onOpenDelete(item),
    onOpenSpecs,
    onOpenOwnership,
  });

  const section = (title, count, list, extra) =>
    list.length > 0 && (
      <section className="mb-7">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-extrabold text-[var(--engine-text)]">{title}</h2>
          <span className="text-xs font-semibold text-[var(--engine-text-muted)]">{count}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {list.map((car) => (
            <CarCard key={car.id} {...cardProps(car)} {...extra(car)} />
          ))}
        </div>
      </section>
    );

  return (
    <section>
      <header className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--engine-text)] sm:text-[26px]">
          {t("garage.title")}
        </h1>
        {cars.length > 0 && (
          <Button onClick={() => onOpenModal()} aria-label={t("garage.addCar")}>
            <Plus size={17} />
            <span className="max-sm:hidden">{t("garage.addCar")}</span>
            <span className="sm:hidden">{t("garageV2.add")}</span>
          </Button>
        )}
      </header>

      {cars.length > 0 && (
        <GarageSummary
          cars={cars}
          hideValues={hideValues}
          onOpenCar={(car, tab) => navigate(carPath(car, tab))}
        />
      )}

      {section(t("garageV2.sectionOwned"), t("garageV2.countCars", { count: ownedCars.length }), ownedCars, () => ({
        onAddExpense,
        onOpenReminders: (item) => navigate(carPath(item, "reminders")),
      }))}

      {section(t("garageV2.sectionGoals"), t("garageV2.countGoals", { count: goalCars.length }), goalCars, () => ({
        onAddContribution,
        onMarkAchieved,
      }))}

      {/* Leitura que falhou NÃO é garagem vazia. Enquanto isso aqui dizia
          "adicione seu primeiro carro" para quem tem sete, não havia como
          saber se o carro tinha sumido ou se o app é que não tinha
          conseguido ler. Erro tem cara de erro e tem botão. */}
      {cars.length === 0 && loadError && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--engine-accent)]/40 bg-[var(--engine-accent-soft)] p-8 text-center sm:p-12">
          <CloudOff className="mb-4 text-[var(--engine-accent)]" size={36} />
          <p className="font-bold text-[var(--engine-text)]">{t("garage.loadFailedTitle")}</p>
          <p className="mt-2 max-w-md text-sm font-medium text-[var(--engine-text-muted)]">
            {t("garage.loadFailedBody")}
          </p>
          {onRetry && (
            <Button className="mt-5" onClick={onRetry}>
              <RefreshCw size={16} />
              {t("garage.retry")}
            </Button>
          )}
        </div>
      )}

      {cars.length === 0 && !loadError && (
        <div>
          <p className="mb-4 max-w-xl text-sm font-medium leading-relaxed text-[var(--engine-text-muted)]">
            {t("garageV2.empty.lead")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { type: CAR_TYPE_OWNED, Icon: KeyRound, key: "owned", primary: true },
              { type: CAR_TYPE_GOAL, Icon: Target, key: "goal", primary: false },
            ].map((door) => (
              <button
                key={door.key}
                type="button"
                onClick={() => onOpenModal(null, { type: door.type })}
                className="engine-card engine-card-hover flex flex-col items-start gap-2 p-4 text-left"
              >
                <door.Icon size={20} className="text-[var(--engine-accent)]" aria-hidden="true" />
                <span className="text-base font-extrabold text-[var(--engine-text)]">
                  {t(`garageV2.empty.${door.key}Title`)}
                </span>
                <span className="text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
                  {t(`garageV2.empty.${door.key}Body`)}
                </span>
                <span
                  className={`mt-1 inline-flex min-h-10 items-center rounded-lg px-3.5 text-[13px] font-bold ${
                    door.primary
                      ? "bg-[var(--engine-accent)] text-white"
                      : "border border-[var(--engine-border-strong)] text-[var(--engine-text)]"
                  }`}
                >
                  {t(`garageV2.empty.${door.key}Cta`)}
                </span>
              </button>
            ))}
          </div>
          {/*
            Garagem vazia de verdade não prova que a pessoa não tem carro:
            prova que ESTA conta não tem. Em 28/08/2026 o dono de sete carros
            passou dois dias achando que tinha perdido tudo porque entrou com
            o outro Google dele. Com o e-mail na tela, a pessoa se localiza.
          */}
          {accountEmail && (
            <p className="mt-4 text-xs font-medium text-[var(--engine-text-muted)]">
              <span className="font-bold text-[var(--engine-text)]">
                {t("garage.emptyAccount", { account: accountEmail })}
              </span>{" "}
              {t("garage.emptyAccountHint")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
