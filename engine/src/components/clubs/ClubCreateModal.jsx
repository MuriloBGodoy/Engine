import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2 } from "lucide-react";
import { ClubTag } from "./ClubEmblem";
import { ClubLookFields } from "./ClubLookFields";
import { ClubCard } from "./ClubCard";
import { checkTagAvailable } from "./clubsDataSource";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { getStates } from "../../services/locations";
import { useIsDark } from "../../hooks/useIsDark";
import {
  CLUB_NAME_MAX,
  CLUB_MOTTO_MAX,
  CLUB_STYLE_VALUES,
  clubColorVars,
  clubStyleLabel,
  emptyClubDraft,
  isValidClubTag,
  normalizeClubTag,
} from "../../services/clubStyles";

/**
 * Fundar um clube, com prévia ao vivo.
 *
 * Esta tela é a resposta ao "nem parece personalizável": a prévia à direita
 * (embaixo, no celular) é o MESMO `ClubCard` da descoberta, e ele muda a cada
 * tecla. E não mostra só o card — mostra a sigla ao lado do seu nome no feed
 * e no card de encontro, que é o que faz a sigla valer a pena.
 *
 * O emblema é montado por composição. Logo e capa próprias entram depois, no
 * "Personalizar" da página do clube: a pasta do Storage é do clube, e antes
 * de fundar ele ainda não existe.
 */
export function ClubCreateModal({ isOpen, onClose, onCreate, loading = false }) {
  // A paleta tem uma tinta por tema; sem passar isDark o componente
  // usava sempre a do tema claro, e cor escura sumia no fundo escuro.
  const isDark = useIsDark();
  const { t } = useTranslation();
  const [draft, setDraft] = useState(emptyClubDraft);
  const [errors, setErrors] = useState({});
  const [tagState, setTagState] = useState("idle"); // idle | checking | free | taken
  const tagTimer = useRef(null);

  useHistoryDismiss(isOpen, onClose);

  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const setEmblem = (patch) =>
    setDraft((prev) => ({ ...prev, emblem: { ...prev.emblem, ...patch } }));
  const setColors = (patch) =>
    setDraft((prev) => ({ ...prev, colors: { ...prev.colors, ...patch } }));
  const setFocus = (patch) =>
    setDraft((prev) => ({ ...prev, focus: { ...prev.focus, ...patch } }));

  // A sigla é única no app, então a pergunta vai ao servidor — com respiro,
  // senão são cinco consultas para escrever "CVC". A checagem mora no
  // handler, e não num efeito: `react-hooks/set-state-in-effect` é regra da
  // casa, e digitar já é o evento que deve disparar a pergunta.
  const handleTagChange = (value) => {
    const tag = normalizeClubTag(value);
    set({ tag });
    clearTimeout(tagTimer.current);
    if (!isValidClubTag(tag)) {
      setTagState("idle");
      return;
    }
    setTagState("checking");
    tagTimer.current = setTimeout(async () => {
      try {
        const free = await checkTagAvailable(tag);
        setTagState(free ? "free" : "taken");
      } catch {
        setTagState("idle");
      }
    }, 450);
  };

  // Só a limpeza fica no efeito: um timer pendente depois do modal fechado
  // chamaria setState num componente desmontado.
  useEffect(() => () => clearTimeout(tagTimer.current), []);

  const states = useMemo(() => getStates(draft.country), [draft.country]);

  // O clube da prévia é o rascunho com os campos que o card espera. Os
  // valores de exibição caem em placeholder para a prévia nunca ficar vazia.
  const previewClub = {
    id: "preview",
    ...draft,
    name: draft.name || t("clubs.form.placeholderName"),
    tag: draft.tag || t("clubs.form.placeholderTag"),
    memberCount: 1,
    myRole: null,
    nextMeetup: null,
    official: false,
  };

  if (!isOpen) return null;

  const toggleStyle = (style) => {
    const current = draft.focus.styles || [];
    setFocus({
      styles: current.includes(style)
        ? current.filter((item) => item !== style)
        : [...current, style].slice(0, 3),
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!draft.name.trim()) next.name = t("clubs.errors.nameRequired");
    if (!draft.tag) next.tag = t("clubs.errors.tagRequired");
    else if (!isValidClubTag(draft.tag)) next.tag = t("clubs.errors.tagInvalid");
    else if (tagState === "taken") next.tag = t("clubs.errors.tagTaken");
    const hasFocus =
      draft.focus.styles?.length || draft.focus.brands?.length || draft.focus.models?.length;
    if (!hasFocus) next.focus = t("clubs.errors.focusRequired");
    setErrors(next);
    if (Object.keys(next).length) return;

    await onCreate({
      ...draft,
      foundedYear: draft.foundedYear ? Number(draft.foundedYear) : "",
    });
  };

  const fieldClass =
    "w-full min-h-11 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-2.5 text-base text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]";
  const labelClass =
    "ml-0.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]";

  return (
    <div className="engine-modal-overlay">
      <div
        style={clubColorVars(previewClub, isDark)}
        className="engine-modal-panel engine-pop sm:max-w-5xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:pb-4 sm:pt-5">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-extrabold tracking-tight text-[var(--engine-text)] sm:text-xl">
              {t("clubs.form.title")}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--engine-text-muted)]">
              {t("clubs.form.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)]"
          >
            <X size={20} />
          </button>
        </div>

        <form
          id="engine-club-form"
          onSubmit={handleSubmit}
          className="engine-modal-body engine-scroll grid content-start gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:grid-cols-[1fr_360px] lg:items-start lg:gap-x-7"
        >
          <div className="grid content-start gap-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="club-name">
                  {t("clubs.form.name")}
                </label>
                <input
                  id="club-name"
                  value={draft.name}
                  maxLength={CLUB_NAME_MAX}
                  onChange={(event) => set({ name: event.target.value })}
                  placeholder={t("clubs.form.namePlaceholder")}
                  className={fieldClass}
                />
                <p className="ml-0.5 text-[11.5px] text-[var(--engine-text-muted)]">
                  {errors.name || t("clubs.form.charsLeft", { count: CLUB_NAME_MAX - draft.name.length })}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="club-tag">
                  {t("clubs.form.tag")}
                </label>
                <input
                  id="club-tag"
                  value={draft.tag}
                  onChange={(event) => handleTagChange(event.target.value)}
                  placeholder="CVC"
                  className={`${fieldClass} font-mono font-extrabold uppercase tracking-[0.14em] ${
                    errors.tag || tagState === "taken"
                      ? "border-[var(--engine-accent)]"
                      : ""
                  }`}
                />
                <p
                  className={`ml-0.5 text-[11.5px] ${
                    tagState === "free"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : errors.tag || tagState === "taken"
                        ? "text-[var(--engine-accent)]"
                        : "text-[var(--engine-text-muted)]"
                  }`}
                >
                  {tagState === "checking"
                    ? t("clubs.form.tagChecking")
                    : tagState === "free"
                      ? t("clubs.form.tagFree", { tag: draft.tag })
                      : tagState === "taken"
                        ? t("clubs.form.tagTaken", { tag: draft.tag })
                        : errors.tag || t("clubs.form.tagHint")}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="club-motto">
                {t("clubs.form.motto")}
              </label>
              <input
                id="club-motto"
                value={draft.motto}
                maxLength={CLUB_MOTTO_MAX}
                onChange={(event) => set({ motto: event.target.value })}
                placeholder={t("clubs.form.mottoPlaceholder")}
                className={fieldClass}
              />
            </div>

            <ClubLookFields club={previewClub} onEmblem={setEmblem} onColors={setColors} />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="club-city">
                  {t("clubs.form.city")}
                </label>
                <input
                  id="club-city"
                  value={draft.city}
                  onChange={(event) => set({ city: event.target.value })}
                  placeholder="Campinas"
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="club-state">
                  {t("clubs.form.state")}
                </label>
                <select
                  id="club-state"
                  value={draft.state}
                  onChange={(event) => set({ state: event.target.value })}
                  className={fieldClass}
                >
                  <option value="">{t("clubs.form.stateAll")}</option>
                  {states.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="club-founded">
                  {t("clubs.form.foundedYear")}
                </label>
                <input
                  id="club-founded"
                  inputMode="numeric"
                  maxLength={4}
                  value={draft.foundedYear}
                  onChange={(event) =>
                    set({ foundedYear: event.target.value.replace(/\D/g, "").slice(0, 4) })
                  }
                  placeholder="2011"
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <span className={labelClass}>{t("clubs.form.joinPolicy")}</span>
                <div className="flex gap-1.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-1">
                  {["open", "approval"].map((policy) => (
                    <button
                      key={policy}
                      type="button"
                      onClick={() => set({ joinPolicy: policy })}
                      aria-pressed={draft.joinPolicy === policy}
                      className={`min-h-10 flex-1 rounded-lg px-2 text-[12.5px] font-bold transition ${
                        draft.joinPolicy === policy
                          ? "bg-[var(--engine-elevated)] text-[var(--engine-text)] shadow-[var(--engine-shadow-sm)]"
                          : "text-[var(--engine-text-muted)]"
                      }`}
                    >
                      {t(policy === "open" ? "clubs.form.joinOpen" : "clubs.form.joinApproval")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="club-meetup">
                {t("clubs.form.meetupSchedule")}
              </label>
              <input
                id="club-meetup"
                value={draft.meetupSchedule}
                onChange={(event) => set({ meetupSchedule: event.target.value })}
                placeholder={t("clubs.form.meetupPlaceholder")}
                className={fieldClass}
              />
            </div>

            <div className="space-y-2">
              <span className={labelClass}>{t("clubs.form.focus")}</span>
              <div className="flex flex-wrap gap-2">
                {CLUB_STYLE_VALUES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => toggleStyle(style)}
                    aria-pressed={draft.focus.styles?.includes(style)}
                    className={`min-h-10 rounded-full border px-3.5 text-[12.5px] font-semibold transition ${
                      draft.focus.styles?.includes(style)
                        ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                        : "border-[var(--engine-border-strong)] text-[var(--engine-text)]"
                    }`}
                  >
                    {clubStyleLabel(t, style)}
                  </button>
                ))}
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="club-brand">
                    {t("clubs.form.brand")}
                  </label>
                  <input
                    id="club-brand"
                    value={draft.focus.brands?.[0] || ""}
                    onChange={(event) =>
                      setFocus({ brands: event.target.value ? [event.target.value] : [] })
                    }
                    placeholder={t("clubs.form.brandPlaceholder")}
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="club-model">
                    {t("clubs.form.model")}
                  </label>
                  <input
                    id="club-model"
                    value={draft.focus.models?.[0] || ""}
                    onChange={(event) =>
                      setFocus({ models: event.target.value ? [event.target.value] : [] })
                    }
                    placeholder={t("clubs.form.modelPlaceholder")}
                    className={fieldClass}
                  />
                </div>
              </div>
              <p className="ml-0.5 text-[11.5px] text-[var(--engine-text-muted)]">
                {errors.focus ? (
                  <span className="text-[var(--engine-accent)]">{errors.focus}</span>
                ) : (
                  t("clubs.form.focusHint")
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="club-description">
                {t("clubs.form.description")}
              </label>
              <textarea
                id="club-description"
                rows={3}
                value={draft.description}
                onChange={(event) => set({ description: event.target.value })}
                className={`${fieldClass} resize-y`}
              />
            </div>
          </div>

          {/* ------------------------- prévia ao vivo ------------------------- */}
          <aside className="grid content-start gap-2.5 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] p-3.5 lg:sticky lg:top-0">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--engine-text-muted)]">
              {t("clubs.form.preview")}
            </span>
            <ClubCard club={previewClub} />

            <span className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--engine-text-muted)]">
              {t("clubs.form.previewFeed")}
            </span>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface-2)] py-1.5 pl-1.5 pr-3 text-[12px] font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--engine-border-strong)] text-[10px] font-extrabold text-white">
                EU
              </span>
              {t("clubs.roles.founder")}
              <ClubTag tag={previewClub.tag} />
            </div>

            <span className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--engine-text-muted)]">
              {t("clubs.form.previewEvent")}
            </span>
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-2">
              <div className="w-11 shrink-0 rounded-lg border border-[color-mix(in_srgb,var(--club)_34%,transparent)] bg-[color-mix(in_srgb,var(--club)_13%,transparent)] py-1 text-center">
                <span className="block font-display text-[15px] font-extrabold leading-none text-[var(--club-ink)]">
                  05
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-bold text-[var(--engine-text)]">
                  {t("clubs.form.previewEventTitle", { tag: previewClub.tag })}
                </p>
                <p className="truncate text-[11px] text-[var(--engine-text-muted)]">
                  {draft.city || t("clubs.form.previewCity")}
                </p>
              </div>
            </div>

            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--engine-text-muted)]">
              {t("clubs.form.previewNote")} {t("clubs.custom.photosLater")}
            </p>
          </aside>
        </form>

        <div className="engine-safe-bottom shrink-0 border-t border-[var(--engine-border)] bg-[var(--engine-elevated)] px-4 pt-3 sm:px-6">
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 flex-1 rounded-xl border border-[var(--engine-border-strong)] px-4 text-[14.5px] font-bold text-[var(--engine-text)] sm:flex-none"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              form="engine-club-form"
              disabled={loading}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-[14.5px] font-bold text-white transition disabled:opacity-60 sm:flex-none"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : null}
              {loading ? t("clubs.form.submitting") : t("clubs.form.submit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
