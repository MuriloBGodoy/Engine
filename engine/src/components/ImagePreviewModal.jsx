import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Send } from "lucide-react";
import { ImageEditor } from "./ImageEditor";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";

/**
 * Prévia da foto antes de enviar no chat, com legenda e atalho para o editor.
 *
 * Dois níveis de "voltar" no Android (16/09/2026): a prévia inteira é uma
 * entrada de histórico e o editor, quando aberto, empilha outra em cima. O
 * gesto de voltar fecha primeiro o editor (volta à prévia) e só depois
 * cancela a foto — antes saía da conversa nos dois casos.
 */
function ImagePreviewModalContent({
  imageUrl,
  onSend,
  onCancel,
  isLoading = false,
}) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState("");
  const [editedImageUrl, setEditedImageUrl] = useState(imageUrl);
  const [isEditing, setIsEditing] = useState(false);

  const closeEditor = useCallback(() => setIsEditing(false), []);
  useHistoryDismiss(true, onCancel);
  useHistoryDismiss(isEditing, closeEditor);

  const handleImageEditorSave = (dataUrl) => {
    setEditedImageUrl(dataUrl);
    setIsEditing(false);
  };

  const handleSend = async () => {
    if (!editedImageUrl) return;
    await onSend(editedImageUrl, caption, 0);
  };

  if (isEditing) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={closeEditor}
            disabled={isLoading}
            className="-m-0.5 flex h-11 w-11 items-center justify-center rounded-lg text-white transition hover:bg-white/10 disabled:opacity-50"
            aria-label={t("imagePreview.back")}
          >
            <ChevronLeft size={24} />
          </button>
          <h2 className="text-sm font-semibold text-white">{t("imagePreview.editTitle")}</h2>
          <div className="w-10" />
        </header>
        <div className="flex-1 overflow-y-auto">
          <ImageEditor
            imageUrl={editedImageUrl}
            onClose={closeEditor}
            onSave={handleImageEditorSave}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          /* 44x44: media 40x40. */
          className="-m-0.5 flex h-11 w-11 items-center justify-center rounded-lg text-white transition hover:bg-white/10 disabled:opacity-50"
          aria-label={t("imagePreview.close")}
        >
          <ChevronLeft size={24} />
        </button>

        <h2 className="text-sm font-semibold text-white">{t("imagePreview.title")}</h2>

        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex items-center justify-center rounded-2xl bg-black/50">
          <img
            src={editedImageUrl}
            alt=""
            className="max-h-[60vh] max-w-full rounded-2xl"
          />
        </div>
      </div>

      <div className="engine-safe-bottom shrink-0 border-t border-white/10 bg-black/50 p-4 backdrop-blur-sm sm:p-6">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          disabled={isLoading}
          className="mb-4 min-h-11 w-full rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
        >
          ✎ {t("imagePreview.edit")}
        </button>

        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder={t("imagePreview.captionPlaceholder")}
          maxLength={500}
          className="mb-4 w-full resize-none rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/50 outline-none transition focus:border-white/40 focus:bg-white/10"
          rows={3}
        />

        <div className="flex gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="min-h-11 flex-1 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isLoading}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            <Send size={16} />
            {t("imagePreview.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Portal no body: aberto dentro de uma página com ancestral transformado ou com
// backdrop-filter, `fixed` fica preso a ele e o modal abre fora do lugar.
export function ImagePreviewModal(props) {
  return createPortal(<ImagePreviewModalContent {...props} />, document.body);
}
