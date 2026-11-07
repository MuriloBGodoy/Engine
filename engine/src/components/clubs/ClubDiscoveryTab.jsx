import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Loader2, Plus, Users } from "lucide-react";
import { ClubCard } from "./ClubCard";
import { useDiscoverClubs } from "./clubsDataSource";
import { CLUB_STYLE_VALUES, clubStyleLabel } from "../../services/clubStyles";

/** Uma seção só aparece quando tem conteúdo — seção vazia não ocupa espaço. */
function Section({ title, hint, clubs, onOpen, onJoined }) {
  if (!clubs?.length) return null;
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-extrabold tracking-tight text-[var(--engine-text)]">
          {title}
        </h3>
        {hint ? (
          <span className="text-[12px] text-[var(--engine-text-muted)]">{hint}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clubs.map((club) => (
          <ClubCard key={club.id} club={club} onOpen={onOpen} onJoined={onJoined} />
        ))}
      </div>
    </section>
  );
}

/**
 * O convite grande para fundar um clube: capa na cor do app, ícone, título e
 * o botão largo. Serve à Descobrir sem clube nenhum no app e à "Meus clubes"
 * vazia — as duas eram o mesmo momento ("não tenho crew") com pesos
 * diferentes, e na Meus clubes o convite era um botão miúdo numa caixa
 * tracejada. `children` entra embaixo do botão (o "descobrir clubes").
 */
export function ClubFoundHero({ title, copy, ctaLabel, onCreate, children = null }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)]">
      <div className="relative h-28 bg-[linear-gradient(135deg,var(--engine-accent)_0%,color-mix(in_srgb,var(--engine-accent)_45%,#000)_100%)]">
        <span className="absolute inset-0 bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.10)_0_2px,transparent_2px_26px)]" />
        <span className="absolute -bottom-7 left-4 grid h-14 w-14 place-items-center rounded-2xl border-2 border-[var(--engine-surface)] bg-[var(--engine-elevated)] text-[var(--engine-accent)] shadow-[var(--engine-shadow-sm)]">
          <Users size={26} aria-hidden="true" />
        </span>
      </div>
      <div className="px-4 pb-5 pt-9">
        <h2 className="font-display text-[20px] font-extrabold leading-tight tracking-tight text-[var(--engine-text)]">
          {title}
        </h2>
        <p className="mt-1.5 max-w-[48ch] text-[13.5px] leading-relaxed text-[var(--engine-text-muted)]">
          {copy}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-[15px] font-bold text-white transition hover:opacity-90 sm:w-auto"
          >
            <Plus size={18} />
            {ctaLabel}
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A descoberta, nas quatro seções do contrato (§3): pro seu carro, em alta,
 * perto de você, todos.
 *
 * O anti-tela-vazia é a regra que vem da região (memória
 * `engine-regiao-localidade`): quando a soma de tudo dá menos de três clubes,
 * a tela oferece fundar em vez de mostrar uma grade magra — "muito poucos
 * clubes" era metade da reclamação original.
 */
export function ClubDiscoveryTab({ onSelectClub, onCreate }) {
  const { t } = useTranslation();
  const { sections, loading, error, fetch } = useDiscoverClubs();
  const [style, setStyle] = useState("");
  const [search, setSearch] = useState("");

  // Só depois da primeira resposta dá para dizer "não existe clube": antes
  // disso a lista vazia é só o estado inicial, e o convite piscaria na tela.
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    fetch({ style, search }).then(() => setAnswered(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  const total = useMemo(
    () =>
      ["forYourCar", "trending", "nearby", "all"].reduce(
        (sum, key) => sum + (sections?.[key]?.length || 0),
        0,
      ),
    [sections],
  );

  // Nenhum clube no app (e não é filtro que esvaziou a lista): a tela inteira
  // vira o convite para fundar. Sem isto a pessoa via busca, 17 chips e uma
  // caixinha no pé dizendo "nenhum clube".
  const noClubsAtAll = answered && !loading && !error && total === 0 && !style && !search.trim();

  const sectionProps = {
    onOpen: onSelectClub,
    onJoined: () => fetch({ style, search }),
  };

  if (noClubsAtAll) {
    return (
      <ClubFoundHero
        title={t("clubs.custom.firstTitle")}
        copy={t("clubs.custom.firstCopy")}
        ctaLabel={t("clubs.custom.firstCta")}
        onCreate={onCreate}
      />
    );
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          fetch({ style, search });
        }}
        className="relative"
      >
        <Search
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--engine-text-muted)]"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("clubs.filters.searchPlaceholder")}
          className="min-h-11 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] py-2.5 pl-10 pr-3 text-base text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]"
        />
      </form>

      {/* Faixa rolável: 17 estilos não cabem numa linha de celular, e quebrar
          em várias linhas empurraria os clubes para fora da primeira tela. */}
      <div className="engine-chip-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {["", ...CLUB_STYLE_VALUES].map((value) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setStyle(value)}
            aria-pressed={style === value}
            className={`min-h-10 shrink-0 rounded-full border px-3.5 text-[12.5px] font-semibold transition-colors ${
              style === value
                ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                : "border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text)] hover:border-[var(--engine-text)]"
            }`}
          >
            {value ? clubStyleLabel(t, value) : t("clubs.filters.allStyles")}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {loading && !total ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[var(--engine-text-muted)]">
          <Loader2 size={18} className="animate-spin" />
          {t("clubs.loading")}
        </div>
      ) : (
        <>
          <Section
            title={t("clubs.sections.forYourCar")}
            hint={t("clubs.sections.forYourCarHint")}
            clubs={sections?.forYourCar}
            {...sectionProps}
          />
          <Section
            title={t("clubs.sections.trending")}
            hint={t("clubs.sections.trendingHint")}
            clubs={sections?.trending}
            {...sectionProps}
          />
          <Section
            title={t("clubs.sections.nearby")}
            clubs={sections?.nearby}
            {...sectionProps}
          />
          <Section title={t("clubs.sections.all")} clubs={sections?.all} {...sectionProps} />

          {/* Só quando NÃO achou nada. Com um clube na tela, "Funde o
              primeiro" é mentira, e o convite já tem lugar fixo: o botão
              Criar, no cabeçalho das sub-abas. (07/11/2026) */}
          {total === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--engine-border-strong)] px-4 py-6 text-center">
              <p className="text-[14px] font-bold text-[var(--engine-text)]">
                {t("clubs.found.none")}
              </p>
              <p className="mx-auto mt-1 max-w-[42ch] text-[12.5px] leading-relaxed text-[var(--engine-text-muted)]">
                {t("clubs.found.fewCopy")}
              </p>
              <button
                type="button"
                onClick={onCreate}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-[14px] font-bold text-white transition hover:opacity-90"
              >
                <Plus size={17} />
                {t("clubs.found.foundFirst")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
