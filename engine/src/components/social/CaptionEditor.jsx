import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { MentionTextarea } from "../mentions/MentionTextarea";
import { captionLimit } from "../../services/db";
import { MAX_HASHTAGS, extractHashtags } from "../../services/socialText";
import "../../services/i18n-social-posts";

const PERSON_ONLY = ["person"];

/**
 * Editar a legenda de uma publicação já no ar — o mesmo modal no feed, na
 * página do post e no feed do perfil (antes só o feed tinha, e com limite de
 * 280 que cortava post livre de até 1000).
 *
 * @ abre a busca de pessoas (o @ entra como texto, `@usuario`); #tag é texto
 * livre, contada contra o limite de 30. "Editado" quem carimba é o banco.
 */
export function CaptionEditor({ goal, onClose, onSave }) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState(goal?.note || "");
  const [mentions, setMentions] = useState([]);
  const [busy, setBusy] = useState(false);
  const max = captionLimit(goal?.kind);
  const tags = extractHashtags(caption).length;
  const tooManyTags = tags > MAX_HASHTAGS;

  useHistoryDismiss(true, onClose);

  const save = async () => {
    if (busy || tooManyTags) return;
    setBusy(true);
    try {
      await onSave(goal, caption);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="engine-modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("community.captionTitle")}
        className="engine-modal-panel engine-pop sm:max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-accent)]">
              {t("community.captionTitle")}
            </p>
            {goal?.title ? (
              <p className="mt-1 truncate text-sm font-bold text-[var(--engine-text)]">{goal.title}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={20} />
          </button>
        </header>

        <div className="engine-modal-body engine-scroll p-4">
          <MentionTextarea
            id={`caption-${goal?.id || "new"}`}
            value={caption}
            mentions={mentions}
            kinds={PERSON_ONLY}
            rows={6}
            autoFocus
            maxLength={max}
            onChange={(text, list) => {
              setCaption(text);
              setMentions(list || []);
            }}
            placeholder={t("community.captionPlaceholder")}
            className="engine-scroll w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2.5 text-sm font-medium text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
          />
          <p className="mt-2 flex justify-between gap-3 text-[11px] font-semibold text-[var(--engine-text-subtle)]">
            <span className={tooManyTags ? "text-[var(--engine-accent)]" : ""}>
              {tooManyTags
                ? t("socialPosts.errors.tooManyHashtags", { max: MAX_HASHTAGS })
                : tags
                  ? t("socialPosts.caption.hashtags", { count: tags, max: MAX_HASHTAGS })
                  : ""}
            </span>
            <span className="tabular-nums">{t("socialPosts.caption.counter", { count: caption.length, max })}</span>
          </p>
        </div>

        <div className="engine-safe-bottom flex shrink-0 items-center gap-2 border-t border-[var(--engine-border)] p-3">
          <button
            type="button"
            onClick={save}
            disabled={busy || tooManyTags}
            className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--engine-accent)] px-5 text-[11px] font-black uppercase tracking-widest text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t("common.save")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full px-3 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)] transition hover:text-[var(--engine-text)]"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
