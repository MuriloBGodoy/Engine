import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Image as ImageIcon, Video } from "lucide-react";
import { useMediaQuery } from "./useMediaQuery";
import { useHistoryDismiss } from "./useHistoryDismiss";
import { BottomSheet } from "../components/BottomSheet";
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
 *
 * A folha é o `BottomSheet` do app, e não um `.engine-modal-overlay` próprio
 * como era até 13/11/2026. Aquele overlay vive na camada 100, e o fluxo
 * Anunciar (serviço e produto) ocupa a tela inteira na 110: a folha abria
 * ATRÁS dele. Quem tocava em "Escolher fotos" no celular via a tela não
 * mudar, e o anúncio não saía do primeiro passo. O `BottomSheet` está na
 * 130, fecha arrastando, fecha no Esc e fecha no voltar do Android — que
 * aqui também era um problema: sem entrada própria no histórico, voltar com
 * a folha aberta fechava o anúncio inteiro.
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

  const fechar = () => setPerguntando(false);
  useHistoryDismiss(perguntando, fechar);

  // Escolhida a origem, a folha sai de cena ANTES de o seletor do sistema
  // abrir. Deixá-la no ar era o que fazia quem desistia do seletor voltar
  // para uma folha pendurada, sem jeito óbvio de sair.
  const pedir = (ref) => {
    setPerguntando(false);
    ref.current?.click();
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

      <BottomSheet
        open={perguntando}
        onClose={fechar}
        title={title || t("mediaPicker.title")}
      >
        <div className="grid gap-1 pb-1">
          <button type="button" className={opcao} onClick={() => pedir(cameraRef)}>
            {video ? (
              <Video size={19} className="shrink-0 text-[var(--engine-accent)]" />
            ) : (
              <Camera size={19} className="shrink-0 text-[var(--engine-accent)]" />
            )}
            {video ? t("mediaPicker.recordNow") : t("mediaPicker.takeNow")}
          </button>
          <button type="button" className={opcao} onClick={() => pedir(galeriaRef)}>
            <ImageIcon size={19} className="shrink-0 text-[var(--engine-text-muted)]" />
            {t("mediaPicker.fromGallery")}
          </button>
        </div>
      </BottomSheet>
    </>
  );

  return { open, elementos, perguntaAberta: perguntando };
}
