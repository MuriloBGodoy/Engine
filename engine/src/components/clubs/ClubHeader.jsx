import { useTranslation } from "react-i18next";
import { Loader2, Palette, Share2, Star } from "lucide-react";
import { ClubEmblem } from "./ClubEmblem";
import { GhostCar } from "./GhostCar";
import { CameraBadge } from "./ClubPhotoPicker";
import { clubPlaceLabel, clubStyleLabel } from "../../services/clubStyles";

/**
 * O cabeçalho da página do clube: capa (a foto da direção, ou a cor do
 * clube), logo ou emblema sobreposto, sigla,
 * lema, a linha "desde · cidade · encontro fixo", três números e o CTA.
 *
 * Os três números são os do contrato §6 — membros por agregação (é uma tela
 * só, e número em destaque tem de ser verdade), carros pelo tamanho da lista
 * que a garagem devolveu, encontros por count. Quem passa cada um é a página;
 * este componente não conta nada, só mostra.
 */
export function ClubHeader({
  club,
  memberCount,
  carCount,
  meetupCount,
  onJoin,
  onLeave,
  onShare,
  onCustomize = null,
  onPickLogo = null,
  onPickCover = null,
  photoBusy = "",
  actionLoading = false,
}) {
  const { t } = useTranslation();
  if (!club) return null;

  const role = club.myRole;
  const isMember = Boolean(role);
  const place = clubPlaceLabel(club, t);
  const chips = [
    ...(club.focus?.brands || []),
    ...(club.focus?.models || []),
    ...(club.focus?.styles || []).map((style) => clubStyleLabel(t, style)),
  ].slice(0, 4);
  const line = [
    club.foundedYear ? t("clubs.since", { year: club.foundedYear }) : "",
    place,
    club.meetupSchedule,
  ]
    .filter(Boolean)
    .join(" · ");

  const joinLabel = club.myRequestPending
    ? t("clubs.join.pending")
    : club.joinPolicy === "approval"
      ? t("clubs.join.approval")
      : t("clubs.join.open");

  const numbers = [
    { key: "members", label: t("clubs.clubTabs.members"), value: memberCount },
    { key: "cars", label: t("clubs.clubTabs.garage"), value: carCount },
    { key: "meetups", label: t("clubs.clubTabs.meetups"), value: meetupCount },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)]">
      <div className="relative h-32 overflow-hidden bg-[linear-gradient(135deg,var(--club)_0%,var(--club-2)_62%,color-mix(in_srgb,var(--club-2)_60%,#000)_100%)] sm:h-44">
        {club.coverUrl ? (
          <img
            src={club.coverUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <>
            <GhostCar className="absolute -bottom-2.5 right-3 w-[210px] opacity-30" />
            <span className="absolute inset-0 bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.10)_0_2px,transparent_2px_26px)]" />
          </>
        )}
        {onPickCover ? (
          // Para a direção, a capa inteira é o botão de trocar a capa. Fica
          // por baixo do "Personalizar" e do selo, que vêm depois no DOM.
          <button
            type="button"
            onClick={onPickCover}
            aria-label={club.coverUrl ? t("clubs.custom.changeCover") : t("clubs.custom.addCover")}
            className="absolute inset-0"
          >
            <CameraBadge
              busy={photoBusy === "cover"}
              label={club.coverUrl ? t("clubs.custom.cover") : t("clubs.custom.addCover")}
              className="absolute bottom-2.5 right-2.5"
            />
          </button>
        ) : null}
        {onCustomize ? (
          // Sobre a capa, em vidro escuro: legível em cima de qualquer foto e
          // de qualquer cor da paleta, nos dois temas.
          <button
            type="button"
            onClick={onCustomize}
            className="absolute right-2.5 top-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-black/55 px-3.5 text-[12.5px] font-bold text-white transition hover:bg-black/70"
          >
            <Palette size={15} aria-hidden="true" />
            {t("clubs.custom.open")}
          </button>
        ) : null}
        {club.official ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">
            <Star size={11} className="fill-current" />
            {t("clubs.official")}
          </span>
        ) : null}
      </div>

      <div className="px-3.5 pb-3.5 sm:px-5 sm:pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            {/* Só o emblema sobe para a capa. Subir o bloco de texto junto
                jogava a linha da sigla atrás da faixa colorida. */}
            {/* `relative` é obrigatório: as listras da capa são um elemento
                posicionado, e sem contexto próprio o emblema (estático) é
                pintado ANTES delas — a metade de cima do emblema sumia. */}
            <div className="relative flex items-start gap-3 pt-2.5 sm:gap-4">
              {onPickLogo ? (
                // Tocar no emblema abre direto a galeria/câmera para a logo.
                <button
                  type="button"
                  onClick={onPickLogo}
                  aria-label={club.logoUrl ? t("clubs.custom.changeLogo") : t("clubs.custom.addLogo")}
                  className="relative -mt-10 shrink-0 rounded-[22%] sm:-mt-12"
                >
                  <ClubEmblem club={club} size={84} />
                  <CameraBadge busy={photoBusy === "logo"} className="absolute -bottom-1 -right-1" />
                </button>
              ) : (
                <ClubEmblem club={club} size={84} className="-mt-10 sm:-mt-12" />
              )}
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-[color-mix(in_srgb,var(--club)_42%,transparent)] bg-[color-mix(in_srgb,var(--club)_18%,transparent)] px-1.5 py-0.5 font-mono text-[11px] font-extrabold tracking-wide text-[var(--club-ink)]">
                    [{club.tag}]
                  </span>
                  {role ? (
                    <span className="rounded bg-[color-mix(in_srgb,var(--club)_16%,transparent)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--club-ink)]">
                      {t(`clubs.roles.${role}`)}
                    </span>
                  ) : null}
                </div>
                <h1 className="mt-1 font-display text-[21px] font-extrabold leading-tight tracking-tight text-[var(--engine-text)] sm:text-[26px]">
                  {club.name}
                </h1>
                {club.motto ? (
                  <p className="mt-1 text-[13px] italic text-[var(--engine-text-muted)]">
                    “{club.motto}”
                  </p>
                ) : null}
              </div>
            </div>

            {line ? (
              <p className="mt-2 text-[12.5px] text-[var(--engine-text-muted)]">{line}</p>
            ) : null}

            {chips.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-[var(--engine-surface-2)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--engine-text-muted)]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-2.5 lg:min-w-[330px]">
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-border)]">
              {numbers.map((item) => (
                <div key={item.key} className="bg-[var(--engine-surface)] px-2.5 py-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--engine-text-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-0.5 font-display text-[17px] font-extrabold tabular-nums text-[var(--engine-text)]">
                    {typeof item.value === "number" ? item.value : "—"}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              {isMember ? (
                <>
                  <span className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[var(--engine-border-strong)] px-4 text-[14px] font-bold text-[var(--engine-text)] lg:flex-none lg:min-w-[130px]">
                    ✓ {t("clubs.join.member")}
                  </span>
                  {role !== "founder" ? (
                    <button
                      type="button"
                      onClick={onLeave}
                      disabled={actionLoading}
                      className="flex min-h-11 items-center justify-center rounded-xl px-4 text-[13px] font-semibold text-[var(--engine-text-muted)] transition-colors hover:text-[var(--engine-text)] disabled:opacity-50"
                    >
                      {t("clubs.join.leave")}
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  onClick={onJoin}
                  disabled={actionLoading || club.myRequestPending}
                  className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--club)] px-4 text-[14px] font-bold text-[var(--club-on)] transition disabled:opacity-60 lg:flex-none lg:min-w-[150px]"
                >
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {joinLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onShare}
                aria-label={t("common.share", { defaultValue: "Compartilhar" })}
                className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-[var(--engine-border-strong)] text-[var(--engine-text-muted)] transition-colors hover:text-[var(--engine-text)]"
              >
                <Share2 size={17} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** As 6 abas da página. Rolável no celular: a 360px "Sobre" fica a um
 *  arrasto, e um rótulo traduzido pode ser mais longo (Encuentros). */
export function ClubTabs({ active, onChange }) {
  const { t } = useTranslation();
  const tabs = ["wall", "photos", "garage", "meetups", "members", "about"];
  return (
    <div
      role="tablist"
      className="engine-chip-scroll flex gap-1 overflow-x-auto border-b border-[var(--engine-border)]"
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2 text-[14px] font-semibold transition ${
            active === tab
              ? "border-[var(--club)] text-[var(--club-ink)]"
              : "border-transparent text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
          }`}
        >
          {t(`clubs.clubTabs.${tab}`)}
        </button>
      ))}
    </div>
  );
}

/** Estado vazio padrão das abas — desenhado, não improvisado. */
export function ClubEmptyState({ title, copy, action, onAction }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--engine-border-strong)] px-4 py-7 text-center">
      <p className="text-[14px] font-bold text-[var(--engine-text)]">{title}</p>
      {copy ? (
        <p className="mx-auto mt-1 max-w-[44ch] text-[12.5px] leading-relaxed text-[var(--engine-text-muted)]">
          {copy}
        </p>
      ) : null}
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border-strong)] px-4 text-[13.5px] font-bold text-[var(--engine-text)] transition-colors hover:border-[var(--club)]"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}
