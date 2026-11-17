import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2 } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { PlateHider } from "./PlateHider";
import { pixelarRegioes } from "../services/pixelar";
import { cleanFileFrom, encodeCanvas } from "../services/cleanImage";
import { entregarArquivo, nomeDeArquivo } from "../services/imagemDeTela";
import { useToast } from "./ToastProvider";
import "../services/i18n-editing";

/**
 * Esconder a placa numa foto que NÃO passa pelo recortador — a foto da
 * publicação do feed.
 *
 * A foto da garagem é cortada antes de subir, e lá o passo da placa mora
 * dentro do próprio recortador. No feed a foto vai como a pessoa escolheu, e
 * é justamente a foto mais pública do app: ela aparece para quem não tem
 * conta. Então o passo existe aqui também, em folha própria.
 *
 * O arquivo devolvido é um JPEG novo e limpo (`cleanFileFrom`), com a tarja
 * já queimada nos pixels — ver `services/pixelar.js` para o porquê de pixelar
 * em vez de borrar.
 */
export function PlateHiderSheet({ open, onClose, file, onApply }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [src, setSrc] = useState("");
  const [regioes, setRegioes] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const base = useRef(null);

  useEffect(() => {
    if (!open || !file) return;
    setRegioes([]);
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  /** A foto com as tarjas, no tamanho original. */
  const montar = () =>
    new Promise((resolve) => {
      const img = base.current;
      if (!img) {
        resolve(null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      pixelarRegioes(canvas, regioes);
      resolve(canvas);
    });

  // A imagem em tamanho cheio é carregada à parte da prévia: a prévia tem
  // teto de 1200 px (é só para olhar) e o arquivo final precisa do original.
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      base.current = img;
    };
    img.src = src;
  }, [src]);

  const aplicar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      const canvas = await montar();
      const blob = canvas ? await encodeCanvas(canvas, 0.85) : null;
      if (!blob) throw new Error("sem-imagem");
      await onApply(cleanFileFrom(blob, `sem-placa-${Date.now()}.jpg`));
      onClose();
    } catch (erro) {
      console.warn("[placa] não deu para aplicar.", erro);
      showToast(t("plateHider.downloadError"), "error");
    } finally {
      setSalvando(false);
    }
  };

  const baixar = async () => {
    try {
      const canvas = await montar();
      const blob = canvas ? await encodeCanvas(canvas, 0.9) : null;
      if (!blob) throw new Error("sem-imagem");
      const fim = await entregarArquivo(blob, nomeDeArquivo("engine", "foto", Date.now()));
      if (fim === "baixado") showToast(t("plateHider.downloaded"), "success");
    } catch (erro) {
      console.warn("[placa] não deu para baixar.", erro);
      showToast(t("plateHider.downloadError"), "error");
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t("plateHider.tab")} className="sm:max-w-xl">
      <div className="grid gap-3">
        <PlateHider src={src} regioes={regioes} onChange={setRegioes} />
        {regioes.length > 0 && (
          <p className="text-[11.5px] leading-4 text-[var(--engine-text-muted)]">{t("plateHider.done")}</p>
        )}
        <button
          type="button"
          onClick={baixar}
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface)]"
        >
          <Download size={16} />
          {t("plateHider.download")}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-[var(--engine-border-strong)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={aplicar}
            disabled={salvando || regioes.length === 0}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--engine-accent)] px-4 text-[13px] font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {salvando && <Loader2 size={15} className="animate-spin" />}
            {t("editing.save")}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
