import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { ClubEmblem } from "./ClubEmblem";
import { ClubLookFields } from "./ClubLookFields";
import { CAMPOS_DO_CAPITAO, clubErrorMessage, clubImageUrl, useClubAdmin } from "./clubsDataSource";
import { ImageCropper } from "../ImageCropper";
import { useToast } from "../ToastProvider";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { useIsDark } from "../../hooks/useIsDark";
import { getStates } from "../../services/locations";
import { isFileTooBig, isImageFile } from "../../services/photos";
import {
  CLUB_DESCRIPTION_MAX,
  CLUB_FOCUS_MAX,
  CLUB_MEETUP_MAX,
  CLUB_MOTTO_MAX,
  CLUB_NAME_MAX,
  CLUB_RULE_MAX,
  CLUB_RULES_MAX,
  CLUB_STYLE_VALUES,
  DEFAULT_CLUB_COLOR,
  DEFAULT_CLUB_COLOR_SECONDARY,
  DEFAULT_CLUB_ICON,
  DEFAULT_CLUB_SHAPE,
  clubColorVars,
  clubStyleLabel,
} from "../../services/clubStyles";

/**
 * "Personalizar" o clube depois de fundado: logo, capa, cores, símbolo e as
 * informações.
 *
 * Só a direção abre (o botão só aparece para fundador e capitão), e o capitão
 * só vê os campos que o banco deixa ele mudar (`CAMPOS_DO_CAPITAO`, igual ao
 * `update_club`). Esconder o campo é educação; quem barra é o banco.
 *
 * Imagem: escolhe → recorta (1:1 logo, 3:1 capa) → sobe na hora para
 * `clubs/<id>/` → o rascunho guarda o caminho. Salvar grava; cancelar apaga o
 * que subiu e não foi usado, e salvar apaga a imagem antiga que saiu.
 */
const FIELDS = [
  "name", "motto", "description", "city", "state", "foundedYear", "meetupSchedule",
  "focus", "rules", "links", "joinPolicy", "logo", "cover", "colors", "emblem",
];

const fromClub = (club) => ({
  name: club.name || "",
  motto: club.motto || "",
  description: club.description || "",
  city: club.city || "",
  state: club.state || "",
  foundedYear: club.foundedYear ? String(club.foundedYear) : "",
  meetupSchedule: club.meetupSchedule || "",
  focus: {
    brands: club.focus?.brands || [],
    models: club.focus?.models || [],
    styles: club.focus?.styles || [],
  },
  rules: club.rules || [],
  links: {
    instagram: club.links?.instagram || "",
    whatsapp: club.links?.whatsapp || "",
    facebook: club.links?.facebook || "",
    website: club.links?.website || "",
  },
  joinPolicy: club.joinPolicy || "open",
  logo: club.logo || "",
  cover: club.cover || "",
  colors: {
    primary: club.colors?.primary || DEFAULT_CLUB_COLOR,
    secondary: club.colors?.secondary || DEFAULT_CLUB_COLOR_SECONDARY,
  },
  emblem: {
    shape: club.emblem?.shape || DEFAULT_CLUB_SHAPE,
    icon: club.emblem?.icon || DEFAULT_CLUB_ICON,
  },
});

const HTTPS = /^https:\/\/\S+$/i;
const isClubPath = (clubId, value) => String(value || "").startsWith(`clubs/${clubId}/`);

export function ClubEditModal({ club, role, isOpen, onClose, onSaved }) {
  if (!isOpen || !club) return null;
  // Montado só aberto: o rascunho nasce do clube como ele está AGORA, sem
  // efeito de sincronização.
  return createPortal(
    <ClubEditContent club={club} role={role} onClose={onClose} onSaved={onSaved} />,
    document.body,
  );
}

function ClubEditContent({ club, role, onClose, onSaved }) {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const showToast = useToast();
  const { updateClub, uploadImage, removeImage } = useClubAdmin(club.id);
  const isFounder = role === "founder";
  const canEdit = (field) => isFounder || CAMPOS_DO_CAPITAO.includes(field);

  const original = useMemo(() => fromClub(club), [club]);
  const [draft, setDraft] = useState(original);
  const [rulesText, setRulesText] = useState(original.rules.join("\n"));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [crop, setCrop] = useState(null); // { kind, file }
  const [linkError, setLinkError] = useState("");
  // Tudo que subiu nesta sessão: o que não for salvo é apagado ao sair.
  const uploaded = useRef(new Set());
  const coverInput = useRef(null);
  const logoInput = useRef(null);

  const cleanupUnsaved = (keep = []) => {
    for (const path of uploaded.current) {
      if (!keep.includes(path)) removeImage(path);
    }
    uploaded.current.clear();
  };

  const close = () => {
    cleanupUnsaved();
    onClose();
  };
  useHistoryDismiss(true, close);

  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const setLinks = (patch) => setDraft((prev) => ({ ...prev, links: { ...prev.links, ...patch } }));
  const setFocus = (patch) => setDraft((prev) => ({ ...prev, focus: { ...prev.focus, ...patch } }));

  const states = useMemo(() => getStates(club.country || "BR"), [club.country]);

  // O rascunho como o card e o emblema esperam.
  const previewClub = {
    ...club,
    ...draft,
    logoUrl: clubImageUrl(draft.logo),
    coverUrl: clubImageUrl(draft.cover),
  };

  const pickFile = (kind) => (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isImageFile(file)) {
      showToast(t("clubs.custom.errors.invalidImage"), "error");
      return;
    }
    if (isFileTooBig(file)) {
      showToast(t("clubs.custom.errors.tooBig"), "error");
      return;
    }
    setCrop({ kind, file });
  };

  // Erro sai como exceção com a frase pronta: o recorte mostra a mensagem e
  // continua aberto (devolver `false` mostrava "imagem de até 6 MB" para
  // qualquer falha, inclusive conta suspensa).
  const handleCropped = async (file) => {
    const kind = crop?.kind;
    if (!kind) return false;
    setUploading(kind);
    try {
      const path = await uploadImage(kind, file);
      uploaded.current.add(path);
      set({ [kind]: path });
      return true;
    } catch (error) {
      throw new Error(clubErrorMessage(error, t), { cause: error });
    } finally {
      setUploading("");
    }
  };

  const buildPatch = () => {
    const next = {
      ...draft,
      rules: rulesText
        .split("\n")
        .map((line) => line.trim().slice(0, CLUB_RULE_MAX))
        .filter(Boolean)
        .slice(0, CLUB_RULES_MAX),
      links: {
        ...draft.links,
        instagram: draft.links.instagram.trim().replace(/^@+/, ""),
        whatsapp: draft.links.whatsapp.trim(),
        website: draft.links.website.trim(),
      },
    };
    const patch = {};
    for (const field of FIELDS) {
      if (!canEdit(field)) continue;
      if (JSON.stringify(next[field]) !== JSON.stringify(original[field])) patch[field] = next[field];
    }
    return patch;
  };

  const handleSave = async () => {
    const patch = buildPatch();
    if (patch.links) {
      const { whatsapp, website, instagram } = patch.links;
      if ((whatsapp && !HTTPS.test(whatsapp)) || (website && !HTTPS.test(website))) {
        setLinkError(t("clubs.custom.errors.invalidLink"));
        return;
      }
      if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) {
        setLinkError(t("clubs.custom.errors.invalidInstagram"));
        return;
      }
    }
    setLinkError("");
    if (!Object.keys(patch).length) {
      cleanupUnsaved();
      onClose();
      return;
    }
    setSaving(true);
    try {
      const updated = await updateClub(patch);
      // O que saiu de uso: a imagem antiga trocada ou removida, e o que subiu
      // e acabou não ficando.
      for (const kind of ["logo", "cover"]) {
        if (kind in patch && isClubPath(club.id, original[kind])) removeImage(original[kind]);
      }
      cleanupUnsaved([draft.logo, draft.cover]);
      showToast(t("clubs.custom.saved"), "success");
      onSaved?.(updated);
      onClose();
    } catch (error) {
      showToast(clubErrorMessage(error, t), "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleStyle = (style) => {
    const current = draft.focus.styles || [];
    setFocus({
      styles: current.includes(style)
        ? current.filter((item) => item !== style)
        : [...current, style].slice(0, CLUB_FOCUS_MAX),
    });
  };

  const fieldClass =
    "w-full min-h-11 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-2.5 text-base text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]";
  const labelClass =
    "ml-0.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]";
  const sectionTitle = "font-display text-[15px] font-extrabold tracking-tight text-[var(--engine-text)]";
  const ghostButton =
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--engine-border-strong)] px-3.5 text-[13px] font-bold text-[var(--engine-text)] transition-colors hover:border-[var(--club)] disabled:opacity-50";

  const imageButtons = (kind, inputRef) => (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={Boolean(uploading) || saving}
        className={ghostButton}
      >
        {uploading === kind ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
        {uploading === kind
          ? t("clubs.custom.uploading")
          : draft[kind]
            ? t("clubs.custom.replace")
            : t("clubs.custom.upload")}
      </button>
      {draft[kind] ? (
        <button
          type="button"
          onClick={() => set({ [kind]: "" })}
          disabled={Boolean(uploading) || saving}
          className={`${ghostButton} text-[var(--engine-text-muted)]`}
        >
          <Trash2 size={15} />
          {t("clubs.custom.remove")}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="engine-modal-overlay">
      <div style={clubColorVars(previewClub, isDark)} className="engine-modal-panel engine-pop sm:max-w-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:pb-4 sm:pt-5">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-extrabold tracking-tight text-[var(--engine-text)] sm:text-xl">
              {t("clubs.custom.title")}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--engine-text-muted)]">
              {isFounder ? t("clubs.custom.subtitle") : t("clubs.custom.captainNote")}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t("common.cancel")}
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="engine-modal-body engine-scroll grid content-start gap-5 px-4 py-4 sm:px-6 sm:py-5">
          {/* ------------------------------ visual ------------------------------ */}
          <section className="grid gap-3.5">
            <h3 className={sectionTitle}>{t("clubs.custom.sectionLook")}</h3>

            {/* Prévia: capa 3:1 e logo sobreposta, como no topo da página. */}
            <div className="overflow-hidden rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)]">
              <div className="relative aspect-[3/1] bg-[linear-gradient(135deg,var(--club)_0%,var(--club-2)_100%)]">
                {previewClub.coverUrl ? (
                  <img src={previewClub.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="relative flex items-end gap-3 px-3 pb-3">
                <ClubEmblem club={previewClub} size={68} className="-mt-8" />
                <p className="min-w-0 flex-1 truncate pb-1 text-[15px] font-extrabold text-[var(--engine-text)]">
                  {draft.name || club.name}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className={labelClass}>{t("clubs.custom.cover")}</span>
                <p className="ml-0.5 text-[11.5px] text-[var(--engine-text-muted)]">{t("clubs.custom.coverHint")}</p>
                {imageButtons("cover", coverInput)}
              </div>
              <div className="space-y-1.5">
                <span className={labelClass}>{t("clubs.custom.logo")}</span>
                <p className="ml-0.5 text-[11.5px] text-[var(--engine-text-muted)]">{t("clubs.custom.logoHint")}</p>
                {imageButtons("logo", logoInput)}
              </div>
            </div>
            <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={pickFile("cover")} />
            <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={pickFile("logo")} />

            <div className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] p-3">
              <p className="text-[13px] font-bold text-[var(--engine-text)]">{t("clubs.custom.emblemTitle")}</p>
              <p className="mb-3 mt-0.5 text-[11.5px] text-[var(--engine-text-muted)]">{t("clubs.custom.emblemHint")}</p>
              <ClubLookFields
                club={previewClub}
                onEmblem={(patch) => set({ emblem: { ...draft.emblem, ...patch } })}
                onColors={(patch) => set({ colors: { ...draft.colors, ...patch } })}
              />
            </div>
          </section>

          {/* ---------------------------- informações ---------------------------- */}
          <section className="grid gap-3.5">
            <h3 className={sectionTitle}>{t("clubs.custom.sectionInfo")}</h3>

            {isFounder ? (
              <>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="club-edit-name">{t("clubs.form.name")}</label>
                  <input
                    id="club-edit-name"
                    value={draft.name}
                    maxLength={CLUB_NAME_MAX}
                    onChange={(event) => set({ name: event.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="club-edit-motto">{t("clubs.form.motto")}</label>
                  <input
                    id="club-edit-motto"
                    value={draft.motto}
                    maxLength={CLUB_MOTTO_MAX}
                    onChange={(event) => set({ motto: event.target.value })}
                    placeholder={t("clubs.form.mottoPlaceholder")}
                    className={fieldClass}
                  />
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="club-edit-city">{t("clubs.form.city")}</label>
                    <input
                      id="club-edit-city"
                      value={draft.city}
                      maxLength={60}
                      onChange={(event) => set({ city: event.target.value })}
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="club-edit-state">{t("clubs.form.state")}</label>
                    <select
                      id="club-edit-state"
                      value={draft.state}
                      onChange={(event) => set({ state: event.target.value })}
                      className={fieldClass}
                    >
                      <option value="">{t("clubs.form.stateAll")}</option>
                      {states.map((state) => (
                        <option key={state.code} value={state.code}>{state.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="club-edit-founded">{t("clubs.form.foundedYear")}</label>
                    <input
                      id="club-edit-founded"
                      inputMode="numeric"
                      maxLength={4}
                      value={draft.foundedYear}
                      onChange={(event) => set({ foundedYear: event.target.value.replace(/\D/g, "").slice(0, 4) })}
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
                      <label className={labelClass} htmlFor="club-edit-brand">{t("clubs.form.brand")}</label>
                      <input
                        id="club-edit-brand"
                        value={draft.focus.brands?.[0] || ""}
                        onChange={(event) => setFocus({ brands: event.target.value ? [event.target.value] : [] })}
                        placeholder={t("clubs.form.brandPlaceholder")}
                        className={fieldClass}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClass} htmlFor="club-edit-model">{t("clubs.form.model")}</label>
                      <input
                        id="club-edit-model"
                        value={draft.focus.models?.[0] || ""}
                        onChange={(event) => setFocus({ models: event.target.value ? [event.target.value] : [] })}
                        placeholder={t("clubs.form.modelPlaceholder")}
                        className={fieldClass}
                      />
                    </div>
                  </div>
                  <p className="ml-0.5 text-[11.5px] text-[var(--engine-text-muted)]">{t("clubs.form.focusHint")}</p>
                </div>
              </>
            ) : null}

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="club-edit-description">{t("clubs.form.description")}</label>
              <textarea
                id="club-edit-description"
                rows={4}
                maxLength={CLUB_DESCRIPTION_MAX}
                value={draft.description}
                onChange={(event) => set({ description: event.target.value })}
                className={`${fieldClass} resize-y`}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="club-edit-meetup">{t("clubs.form.meetupSchedule")}</label>
              <input
                id="club-edit-meetup"
                value={draft.meetupSchedule}
                maxLength={CLUB_MEETUP_MAX}
                onChange={(event) => set({ meetupSchedule: event.target.value })}
                placeholder={t("clubs.form.meetupPlaceholder")}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="club-edit-rules">{t("clubs.custom.rules")}</label>
              <textarea
                id="club-edit-rules"
                rows={4}
                value={rulesText}
                onChange={(event) => setRulesText(event.target.value)}
                placeholder={t("clubs.custom.rulesPlaceholder")}
                className={`${fieldClass} resize-y`}
              />
              <p className="ml-0.5 text-[11.5px] text-[var(--engine-text-muted)]">
                {t("clubs.custom.rulesHint", { count: CLUB_RULES_MAX })}
              </p>
            </div>
          </section>

          {/* -------------------------------- links -------------------------------- */}
          <section className="grid gap-3.5">
            <h3 className={sectionTitle}>{t("clubs.custom.sectionLinks")}</h3>
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="club-edit-instagram">Instagram</label>
              <input
                id="club-edit-instagram"
                value={draft.links.instagram}
                maxLength={31}
                onChange={(event) => setLinks({ instagram: event.target.value })}
                placeholder="@seuclube"
                autoCapitalize="none"
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="club-edit-whatsapp">{t("clubs.custom.whatsapp")}</label>
              <input
                id="club-edit-whatsapp"
                type="url"
                inputMode="url"
                value={draft.links.whatsapp}
                maxLength={200}
                onChange={(event) => setLinks({ whatsapp: event.target.value })}
                placeholder="https://chat.whatsapp.com/..."
                autoCapitalize="none"
                className={fieldClass}
              />
              <p className="ml-0.5 text-[11.5px] text-[var(--engine-text-muted)]">{t("clubs.custom.whatsappHint")}</p>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="club-edit-website">{t("clubs.custom.website")}</label>
              <input
                id="club-edit-website"
                type="url"
                inputMode="url"
                value={draft.links.website}
                maxLength={200}
                onChange={(event) => setLinks({ website: event.target.value })}
                placeholder="https://"
                autoCapitalize="none"
                className={fieldClass}
              />
            </div>
            {linkError ? (
              <p role="alert" className="ml-0.5 text-[12px] font-semibold text-[var(--engine-accent)]">{linkError}</p>
            ) : null}
          </section>
        </div>

        <div className="engine-safe-bottom shrink-0 border-t border-[var(--engine-border)] bg-[var(--engine-elevated)] px-4 pt-3 sm:px-6">
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={close}
              className="min-h-12 flex-1 rounded-xl border border-[var(--engine-border-strong)] px-4 text-[14.5px] font-bold text-[var(--engine-text)] sm:flex-none"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || Boolean(uploading)}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-[14.5px] font-bold text-white transition disabled:opacity-60 sm:flex-none sm:min-w-[160px]"
            >
              {saving ? <Loader2 size={17} className="animate-spin" /> : null}
              {saving ? t("clubs.custom.saving") : t("clubs.custom.save")}
            </button>
          </div>
        </div>
      </div>

      {/* Portal próprio: dentro do painel (que anima com transform) o
          overlay fixo do recorte ficaria preso à caixa do modal. */}
      {crop
        ? createPortal(
            <ImageCropper
              imageFile={crop.file}
              isOpen
              onClose={() => setCrop(null)}
              onSave={handleCropped}
              aspect={crop.kind === "cover" ? 3 : 1}
              cropShape="rect"
              title={crop.kind === "cover" ? t("clubs.custom.cropCover") : t("clubs.custom.cropLogo")}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
