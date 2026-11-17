import { useState, useCallback, useEffect, useRef } from "react";
import { Crop, Download, EyeOff, X, ZoomIn, ZoomOut, RotateCw, RotateCcw, Save } from "lucide-react";
import Cropper from "react-easy-crop";
import { useTranslation } from "react-i18next";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { cleanFileFrom, encodeCanvas } from "../services/cleanImage";
import { drawCroppedImage } from "../services/cropImage";
import { pixelarRegioes } from "../services/pixelar";
import { entregarArquivo, nomeDeArquivo } from "../services/imagemDeTela";
import { PlateHider } from "./PlateHider";
import { DragHandle } from "./DragHandle";
import "../services/i18n-editing";

/**
 * `aspect` e `cropShape` são opcionais: o padrão (16:9, retângulo) é o da foto
 * da garagem. O clube usa 1:1 para a logo e 3:1 para a capa.
 */
export function ImageCropper({ imageFile, isOpen, onClose, onSave, aspect = 16 / 9, cropShape = "rect", title = "" }) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);
  const [error, setError] = useState("");
  // "cortar" | "placa". O segundo passo trabalha em cima do resultado do
  // primeiro, por isso são passos e não dois controles na mesma tela.
  const [modo, setModo] = useState("cortar");
  // Retângulos pixelados, em coordenadas normalizadas do recorte FINAL.
  const [regioes, setRegioes] = useState([]);
  const [previa, setPrevia] = useState("");
  const [baixando, setBaixando] = useState(false);
  const [avisoCorte, setAvisoCorte] = useState(false);
  // A assinatura do recorte de quando as regiões foram desenhadas. Se o
  // recorte mudar, as tarjas não valem mais: elas estariam marcando outro
  // pedaço da foto.
  const corteDasRegioes = useRef("");

  // Read image file and set as src

  const handleCropComplete = useCallback((croppedArea, croppedAreaPixelsData) => {
    setCroppedAreaPixels(croppedAreaPixelsData);
  }, []);

  const handleZoomChange = (e) => {
    setZoom(Number(e.target.value));
  };

  const handleRotate = (degrees) => {
    setRotation((prev) => (((prev + degrees) % 360) + 360) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setCrop({ x: 0, y: 0 });
    setRegioes([]);
    setPrevia("");
    setModo("cortar");
    setAvisoCorte(false);
    corteDasRegioes.current = "";
  };

  /** O recorte de agora, em texto: serve para saber se ele mudou. */
  const assinaturaDoCorte = () =>
    croppedAreaPixels
      ? [
          Math.round(croppedAreaPixels.x),
          Math.round(croppedAreaPixels.y),
          Math.round(croppedAreaPixels.width),
          Math.round(croppedAreaPixels.height),
          rotation,
        ].join(":")
      : "";

  // A geometria do recorte girado mora em services/cropImage.js (ver lá o bug
  // de rotação que existia aqui até 30/10/2026). A foto é recarregada por um
  // <img>, o mesmo caminho do preview, para o EXIF ser aplicado igual nos dois.
  /**
   * O canvas do recorte, com as tarjas já aplicadas.
   *
   * Um caminho só para a prévia do passo da placa, para o salvar e para o
   * baixar: é o que garante que o que a pessoa viu é o que sobe e o que ela
   * guarda no celular.
   */
  const montarCanvas = (comTarjas = true) =>
    new Promise((resolve) => {
      if (!imageSrc || !croppedAreaPixels) {
        resolve(null);
        return;
      }
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        drawCroppedImage(canvas, image, image.naturalWidth, image.naturalHeight, croppedAreaPixels, rotation);
        if (comTarjas) pixelarRegioes(canvas, regioes);
        resolve(canvas);
      };
      image.onerror = () => resolve(null);
      image.src = imageSrc;
    });

  const generateCroppedImage = async () => {
    const canvas = await montarCanvas(true);
    if (!canvas) return null;
    // Mesma codificação de toda foto que sobe: JPEG sem metadados.
    return encodeCanvas(canvas, 0.82).catch(() => null);
  };

  /**
   * Entra no passo da placa: a prévia é o recorte SEM tarja (o componente
   * desenha as tarjas por cima, ao vivo).
   */
  const abrirPlaca = async () => {
    const assinatura = assinaturaDoCorte();
    // Mexeu no corte depois de ter escondido: as tarjas marcavam outro
    // pedaço da foto. Apaga e diz por quê, em vez de salvar um mosaico em
    // cima do capô.
    if (regioes.length && corteDasRegioes.current && corteDasRegioes.current !== assinatura) {
      setRegioes([]);
      setAvisoCorte(true);
    }
    const canvas = await montarCanvas(false);
    if (!canvas) return;
    corteDasRegioes.current = assinatura;
    setPrevia(canvas.toDataURL("image/jpeg", 0.9));
    setModo("placa");
  };

  /**
   * Baixar a foto que está sendo editada — com corte, rotação e tarja.
   *
   * Pedido do dono em 13/11/2026: "um download ao editar". O ponto é poder
   * guardar no celular a versão TRATADA, que é a que a pessoa quer mandar
   * para alguém — a original ela já tem na galeria.
   */
  const baixar = async () => {
    if (baixando) return;
    setBaixando(true);
    try {
      const blob = await generateCroppedImage();
      if (!blob) throw new Error("sem-imagem");
      await entregarArquivo(blob, nomeDeArquivo("engine", "foto", Date.now()), {
        titulo: t("plateHider.download"),
      });
    } catch (erro) {
      console.warn("[foto] não deu para baixar.", erro);
      setError(t("plateHider.downloadError"));
    } finally {
      setBaixando(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const croppedBlob = await generateCroppedImage();

      if (!croppedBlob) {
        const errorMsg = t("imageCropper.error") || "Erro ao cortar imagem. Tente novamente.";
        console.error("[ImageCropper] Blob não foi criado");
        setError(errorMsg);
        setSaving(false);
        return;
      }

      // Valida tamanho do blob
      if (croppedBlob.size === 0) {
        const errorMsg = t("imageCropper.emptyError") || "Imagem vazia. Tente novamente.";
        console.error("[ImageCropper] Blob vazio:", croppedBlob.size);
        setError(errorMsg);
        setSaving(false);
        return;
      }

      // Cria um File object a partir do blob para compatibilidade com uploadUserPhoto
      const fileName = `cropped-${Date.now()}.jpg`;
      // Marcado como limpo: o upload não recomprime de novo.
      const file = cleanFileFrom(croppedBlob, fileName);

      const result = await onSave(file);

      if (result === false) {
        const errorMsg = t("modalCar.imageError") || "Erro ao fazer upload da imagem.";
        console.error("[ImageCropper] Upload falhou");
        setError(errorMsg);
      } else {
        handleReset();
        onClose();
      }
    } catch (err) {
      console.error("[ImageCropper] Erro:", err);
      const errorMsg = err.message || t("imageCropper.error") || "Erro ao cortar imagem.";
      setError(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  // Voltar no Android fecha o recorte e volta ao cadastro, não à garagem.
  useHistoryDismiss(isOpen, onClose);

  // Initialize image when component mounts with a new file
  useEffect(() => {
    if (!imageFile || !isOpen) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target.result);
      handleReset();
    };
    reader.readAsDataURL(imageFile);
  }, [imageFile, isOpen]);

  if (!isOpen || !imageSrc) return null;

  return (
    <div className="engine-modal-overlay">
      <div className="engine-modal-panel engine-pop sm:max-w-3xl">
        <DragHandle onClose={onClose} />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--engine-border)] px-5 py-4 sm:px-7">
          <h2 className="text-lg font-extrabold tracking-tight text-[var(--engine-text)]">
            {title || t("imageCropper.title") || "Cortar imagem"}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("common.cancel")}
            /* 44x44: media 40x40. */
            className="-m-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-subtle)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="engine-modal-body engine-scroll engine-safe-bottom flex flex-col gap-4 px-5 pt-5 sm:px-7 sm:pt-6 pb-5">
          {/* Dois passos, e não dois controles: esconder a placa trabalha em
              cima do recorte pronto. */}
          <div className="flex gap-2">
            {[
              ["cortar", t("plateHider.cropTab"), <Crop key="c" size={15} />],
              ["placa", t("plateHider.tab"), <EyeOff key="p" size={15} />],
            ].map(([id, rotulo, icone]) => (
              <button
                key={id}
                type="button"
                onClick={() => (id === "placa" ? abrirPlaca() : setModo("cortar"))}
                aria-pressed={modo === id}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-[13px] font-bold transition ${
                  modo === id
                    ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                    : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                }`}
              >
                {icone}
                {rotulo}
                {id === "placa" && regioes.length > 0 ? ` (${regioes.length})` : ""}
              </button>
            ))}
          </div>

          {modo === "placa" ? (
            <div className="space-y-3">
              <PlateHider src={previa} regioes={regioes} onChange={setRegioes} />
              {avisoCorte && (
                <p className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2 text-[11.5px] leading-4 text-[var(--engine-text-muted)]">
                  {t("plateHider.reCrop")}
                </p>
              )}
              {regioes.length > 0 && (
                <p className="text-[11.5px] leading-4 text-[var(--engine-text-muted)]">{t("plateHider.done")}</p>
              )}
            </div>
          ) : (
          <>
          {/* Crop Preview */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--engine-border)] bg-black">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              cropShape={cropShape}
              showGrid
              onCropChange={setCrop}
              onCropComplete={handleCropComplete}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              restrictPosition={false}
            />
          </div>

          {/* Controls */}
          <div className="space-y-4">
            {/* Zoom Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                  {t("imageCropper.zoom") || "Zoom"}
                </label>
                <span className="text-xs font-semibold text-[var(--engine-text)]">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <ZoomOut size={16} className="text-[var(--engine-text-subtle)]" />
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={zoom}
                  onChange={handleZoomChange}
                  className="flex-1 h-2 bg-[var(--engine-surface-2)] rounded-full outline-none appearance-none cursor-pointer accent-[var(--engine-accent)]"
                />
                <ZoomIn size={16} className="text-[var(--engine-text-subtle)]" />
              </div>
            </div>

            {/* Rotation Control */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                {t("imageCropper.rotate") || "Rotação"}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[0, 90, 180, 270].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => {
                      const diff = (deg - rotation) % 360;
                      handleRotate(diff);
                    }}
                    /* min-h-11: mediam 36px de altura (16/09/2026). */
                    className={`flex min-h-11 items-center justify-center rounded-lg border py-2.5 text-xs font-bold uppercase transition-colors ${
                      rotation === deg
                        ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                        : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-subtle)] hover:border-[var(--engine-accent)]"
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>

            {/* Reset Button */}
            <button
              type="button"
              onClick={handleReset}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--engine-text)] transition-colors hover:border-[var(--engine-border-strong)] hover:bg-[var(--engine-surface)]"
            >
              <RotateCcw size={16} />
              {t("imageCropper.reset") || "Redefinir"}
            </button>
          </div>
          </>
          )}

          {/* Baixar a foto tratada. Fora dos dois passos porque vale para os
              dois: o que se baixa é sempre o resultado final. */}
          <button
            type="button"
            onClick={baixar}
            disabled={baixando}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--engine-text)] transition-colors hover:border-[var(--engine-border-strong)] hover:bg-[var(--engine-surface)] disabled:opacity-60"
          >
            <Download size={16} />
            {t("plateHider.download")}
          </button>
        </div>

        {error && (
          <div className="border-t border-[var(--engine-border)] bg-red-500/10 px-5 py-3 sm:px-7 flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                {error}
              </p>
            </div>
            <button
              onClick={() => setError("")}
              aria-label={t("common.cancel")}
              className="flex-shrink-0 text-red-600/60 hover:text-red-600 dark:text-red-400/60 dark:hover:text-red-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="border-t border-[var(--engine-border)] bg-[var(--engine-surface)] px-5 py-4 sm:px-7 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-4 py-3 font-semibold text-[var(--engine-text)] transition-colors hover:bg-[var(--engine-surface-2)]"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 py-3 font-semibold text-white shadow-[0_2px_10px_var(--engine-accent-soft)] transition-colors hover:brightness-95 disabled:opacity-50"
          >
            <Save size={16} />
            {t("imageCropper.save") || "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
