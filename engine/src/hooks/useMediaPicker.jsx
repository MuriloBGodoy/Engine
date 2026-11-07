import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Camera, Image as ImageIcon, Video, X } from "lucide-react";
import { useMediaQuery } from "./useMediaQuery";
import "../services/i18n-editing";

/**
 * Escolher mídia — e, no celular, poder TIRAR na hora.
 *
 * O `<input type="file">` sozinho abre o seletor do sistema, e em boa parte
 * dos aparelhos (principalmente dentro do app instalado) esse seletor cai
 * direto na galeria: quem quer fotografar o carro agora tem que sair do
 * Engine, abrir a câmera, tirar, voltar e procurar o arquivo. O atributo
 * `capture` resolve isso, mas é o contrário do problema — com `capture` SÓ
 * abre a câmera, e aí quem queria a foto de ontem é que se vira.
 *
 * Então são dois campos e uma pergunta: no aparelho de toque, abrir mostra
 * uma folhinha com "tirar agora" e "escolher da galeria". No computador,
 * onde não existe câmera para apontar para o carro e o `capture` é ignorado
 * de qualquer jeito, abre o seletor de uma vez — nada de um passo a mais
 * para quem nunca teria escolha.
 *
 * É um hook, e não só um botão, porque nem todo lugar que precisa disto tem
 * um botão próprio: o recorte do clube, por exemplo, é disparado de fora.
 * `elementos` tem que ser renderizado em algum lugar da árvore.
 */
export function useMediaPicker({
  accept = "image/*",
  multiple = false,
  // "environment" é a câmera de trás (a do carro); "user" é a de selfie.
  capture = "environment",
  onFiles,
  title,
}) {
  const { t } = useTranslation();
  const toque = useMediaQuery("(pointer: coarse)");
  const galeriaRef = useRef(null);
  const cameraRef = useRef(null);
  const [perguntando, setPerguntando] = useState(false);

  const video = accept.includes("video");

  const receber = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setPerguntando(false);
    if (files.length) onFiles?.(files);
  };

  const open = () => {
    if (toque) setPerguntando(true);
    else galeriaRef.current?.click();
  };

  const opcao =
    "flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-[14px] font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]";

  const elementos = (
    <>
      <input
        ref={galeriaRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={receber}
        className="hidden"
        tabIndex={-1}
      />
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture={capture}
        onChange={receber}
        className="hidden"
        tabIndex={-1}
      />

      {perguntando &&
        createPortal(
          <div className="engine-modal-overlay" onClick={() => setPerguntando(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title || t("mediaPicker.title")}
              className="engine-modal-panel engine-pop sm:max-w-xs"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="flex items-center justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-3">
                <h2 className="text-[13px] font-black uppercase tracking-wide text-[var(--engine-text)]">
                  {title || t("mediaPicker.title")}
                </h2>
                <button
                  type="button"
                  onClick={() => setPerguntando(false)}
                  aria-label={t("common.cancel")}
                  className="-mr-1 flex h-10 w-10 items-center justify-center rounded-xl text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)]"
                >
                  <X size={18} />
                </button>
              </header>
              <div className="engine-safe-bottom grid gap-1 p-2">
                <button type="button" className={opcao} onClick={() => cameraRef.current?.click()}>
                  {video ? (
                    <Video size={19} className="shrink-0 text-[var(--engine-accent)]" />
                  ) : (
                    <Camera size={19} className="shrink-0 text-[var(--engine-accent)]" />
                  )}
                  {video ? t("mediaPicker.recordNow") : t("mediaPicker.takeNow")}
                </button>
                <button type="button" className={opcao} onClick={() => galeriaRef.current?.click()}>
                  <ImageIcon size={19} className="shrink-0 text-[var(--engine-text-muted)]" />
                  {t("mediaPicker.fromGallery")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );

  return { open, elementos, perguntaAberta: perguntando };
}
