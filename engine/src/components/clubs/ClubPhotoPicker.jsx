import { useImperativeHandle, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Camera, Loader2 } from "lucide-react";
import { ClubEmblem } from "./ClubEmblem";
import { ImageCropper } from "../ImageCropper";
import { useMediaPicker } from "../../hooks/useMediaPicker";
import { useToast } from "../ToastProvider";
import { isFileTooBig, isImageFile } from "../../services/photos";

/**
 * Escolher e recortar a logo (1:1) ou a capa (3:1) do clube.
 *
 * Input nativo com `accept="image/*"`: no celular ele já oferece galeria e
 * câmera, sem permissão nem tela nossa no meio. Quem chama abre pelo `ref`
 * (`pickerRef.current.open()`) a partir de um clique — o navegador só deixa
 * abrir o seletor de arquivo dentro de um gesto da pessoa.
 *
 * `onCropped(file)` recebe o JPEG já recortado e limpo (sem EXIF/GPS, saído
 * de services/cleanImage.js). Se ele lançar, o recorte mostra a mensagem do
 * erro e continua aberto.
 */
export function ClubPhotoPicker({ ref, kind, onCropped }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [file, setFile] = useState(null);

  const handleChange = (files) => {
    const picked = files?.[0];
    if (!picked) return;
    if (!isImageFile(picked)) {
      showToast(t("clubs.custom.errors.invalidImage"), "error");
      return;
    }
    if (isFileTooBig(picked)) {
      showToast(t("clubs.custom.errors.tooBig"), "error");
      return;
    }
    setFile(picked);
  };

  // No celular, abrir pergunta se é foto nova ou da galeria (07/11/2026).
  const { open, elementos } = useMediaPicker({ accept: "image/*", onFiles: handleChange });
  useImperativeHandle(ref, () => ({ open }), [open]);

  return (
    <>
      {elementos}
      {/* Portal: dentro de um painel com transform/backdrop-filter, o overlay
          fixo do recorte ficaria preso à caixa do painel. */}
      {file
        ? createPortal(
            <ImageCropper
              imageFile={file}
              isOpen
              onClose={() => setFile(null)}
              onSave={onCropped}
              aspect={kind === "cover" ? 3 : 1}
              cropShape="rect"
              title={kind === "cover" ? t("clubs.custom.cropCover") : t("clubs.custom.cropLogo")}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/** O selo de câmera que diz "isto aqui é tocável e troca a foto". */
export function CameraBadge({ busy = false, label = "", className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-flex items-center gap-1 rounded-full border-2 border-[var(--engine-surface)] bg-[var(--engine-text)] px-1.5 py-1 text-[11px] font-bold text-[var(--engine-surface)] shadow-[0_2px_6px_rgba(0,0,0,0.3)] ${className}`}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
      {label ? <span className="pr-0.5">{label}</span> : null}
    </span>
  );
}

/**
 * Capa 3:1 com a logo sobreposta, as duas tocáveis. É a mesma composição do
 * topo da página do clube, usada na fundação e no "Personalizar" para a
 * pessoa ver onde cada foto vai parar.
 */
export function ClubPhotoStage({ club, title, onPickCover, onPickLogo, busy = "" }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)]">
      <button
        type="button"
        onClick={onPickCover}
        aria-label={club.coverUrl ? t("clubs.custom.changeCover") : t("clubs.custom.addCover")}
        className="relative block aspect-[3/1] w-full overflow-hidden bg-[linear-gradient(135deg,var(--club)_0%,var(--club-2)_100%)]"
      >
        {club.coverUrl ? (
          <img src={club.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[12.5px] font-bold text-[var(--club-on)]">
            {t("clubs.custom.addCover")}
          </span>
        )}
        <CameraBadge
          busy={busy === "cover"}
          label={t("clubs.custom.cover")}
          className="absolute bottom-2 right-2"
        />
      </button>
      <div className="relative flex items-end gap-3 px-3 pb-3">
        <button
          type="button"
          onClick={onPickLogo}
          aria-label={club.logoUrl ? t("clubs.custom.changeLogo") : t("clubs.custom.addLogo")}
          className="relative -mt-9 shrink-0 rounded-[22%]"
        >
          <ClubEmblem club={club} size={72} />
          <CameraBadge busy={busy === "logo"} className="absolute -bottom-1 -right-1" />
        </button>
        <div className="min-w-0 flex-1 pb-1">
          <p className="truncate text-[15px] font-extrabold text-[var(--engine-text)]">{title}</p>
          <p className="text-[11.5px] text-[var(--engine-text-muted)]">{t("clubs.custom.tapToChange")}</p>
        </div>
      </div>
    </div>
  );
}
