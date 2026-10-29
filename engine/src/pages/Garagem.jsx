import { useEffect, useState } from "react";
import { CloudOff, Plus, RefreshCw, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GarageReminders } from "../components/reminders/GarageReminders";
import { ReminderSettingsModal } from "../components/reminders/ReminderSettingsModal";
import { syncGarageReminders } from "../services/remindersSync";
import { CarCard } from "../components/CarCard";
import { CAR_TYPE_OWNED } from "../services/db";
import { PageHeader } from "../components/PageHeader";
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
  onSaveReminders,
}) {
  const { t } = useTranslation();
  // Id, não o objeto: depois de salvar, o carro novo vem da lista recarregada.
  const [remindersCarId, setRemindersCarId] = useState(null);
  const remindersCar = cars.find((car) => car.id === remindersCarId) || null;

  // Leva as datas firmes ao servidor (o job diário do sino). Só reenvia o carro
  // cujo conteúdo mudou — ver remindersSync.js. Efeito sem setState.
  useEffect(() => {
    if (userId && cars.length) syncGarageReminders(userId, cars);
  }, [userId, cars]);

  const sortedCars = sortCars(cars, defaultSort);
  const goalCars = sortedCars.filter((car) => car.type !== CAR_TYPE_OWNED);
  const ownedCars = sortedCars.filter((car) => car.type === CAR_TYPE_OWNED);

  return (
    <section>
      <PageHeader
        title={t("garage.title")}
        subtitle={t("garage.subtitle")}
        actions={
          <Button className="w-full sm:w-auto" onClick={() => onOpenModal()}>
            <Plus size={17} />
            {t("garage.addCar")}
          </Button>
        }
      />

      {onSaveReminders && (
        <GarageReminders cars={cars} onOpenCar={(car) => setRemindersCarId(car.id)} />
      )}

      {/* Duas listas quando os dois tipos existem: sonho e realidade não se
          comparam lado a lado, e misturar deixa a garagem confusa. Com um tipo
          só, a seção some e vira grade simples. */}
      {ownedCars.length > 0 && goalCars.length > 0 && (
        <h2 className="mb-3 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
          {t("garage.sectionGoals")}
        </h2>
      )}

      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
        {goalCars.map((car) => (
          <div
            key={car.id}
            onClick={() => onOpenModal(car)}
            className="cursor-pointer transition-transform active:scale-95"
          >
            <CarCard
              car={car}
              hideValues={hideValues}
              onOpenOwnership={onOpenOwnership}
              onAddContribution={onAddContribution}
              onMarkAchieved={onMarkAchieved}
              onOpenSpecs={onOpenSpecs}
              onDelete={(event) => {
                event.stopPropagation();
                onOpenDelete(car);
              }}
            />
          </div>
        ))}

        {/* Leitura que falhou NAO e garagem vazia. Enquanto isso aqui dizia
            "adicione seu primeiro carro" para quem tem sete, nao havia como
            saber se o carro tinha sumido ou se o app e que nao tinha
            conseguido ler. Erro tem cara de erro e tem botao. */}
        {cars.length === 0 && loadError && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-[var(--engine-accent)]/40 bg-[var(--engine-accent-soft)] p-8 text-center sm:p-16">
            <CloudOff className="mb-4 text-[var(--engine-accent)]" size={40} />
            <p className="font-bold text-[var(--engine-text)]">
              {t("garage.loadFailedTitle")}
            </p>
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
          <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--engine-border)] bg-[var(--engine-surface)] p-8 text-center sm:p-16">
            <Target className="mb-4 text-[var(--engine-accent)]" size={40} />
            <p className="font-semibold text-[var(--engine-text-muted)]">
              {t("garage.empty")}
            </p>
            {/*
              Garagem vazia de verdade nao prova que a pessoa nao tem carro:
              prova que ESTA conta nao tem. Em 28/08/2026 o dono de sete carros
              passou dois dias achando que tinha perdido tudo porque entrou com
              o outro Google dele; os carros estavam intactos na outra conta.
              Vazio sem identidade e um beco sem saida — com o e-mail na tela,
              a pessoa se localiza sozinha.
            */}
            {accountEmail && (
              <>
                <p className="mt-3 text-sm font-bold text-[var(--engine-text)]">
                  {t("garage.emptyAccount", { account: accountEmail })}
                </p>
                <p className="mt-1 max-w-sm text-xs font-medium text-[var(--engine-text-subtle)]">
                  {t("garage.emptyAccountHint")}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {ownedCars.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
            {t("garage.sectionOwned")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ownedCars.map((car) => (
              <div
                key={car.id}
                onClick={() => onOpenModal(car)}
                className="cursor-pointer transition-transform active:scale-95"
              >
                <CarCard
                  car={car}
                  hideValues={hideValues}
                  onOpenOwnership={onOpenOwnership}
                  onAddExpense={onAddExpense}
                  onOpenSpecs={onOpenSpecs}
                  onOpenReminders={onSaveReminders ? (item) => setRemindersCarId(item.id) : undefined}
                  onDelete={(event) => {
                    event.stopPropagation();
                    onOpenDelete(car);
                  }}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {remindersCar && (
        <ReminderSettingsModal
          car={remindersCar}
          onClose={() => setRemindersCarId(null)}
          onSave={onSaveReminders}
        />
      )}
    </section>
  );
}
