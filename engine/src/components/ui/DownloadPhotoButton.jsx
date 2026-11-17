import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2 } from "lucide-react";
import { entregarArquivo, nomeDeArquivo } from "../../services/imagemDeTela";
import { useToast } from "../ToastProvider";
import "../../services/i18n-editing";

/**
 * Baixar uma foto PÚBLICA do Engine.
 *
 * Onde entra: foto de publicação, de carro na vitrine, de anúncio, de evento,
 * de clube. Onde NÃO entra: foto de perfil — decisão do dono do produto, e
 * ela se sustenta: avatar é o rosto da pessoa, não conteúdo que ela publicou
 * para ser levado embora. Um botão de baixar embaixo da cara de alguém é um
 * convite a outra coisa.
 *
 * Isto NÃO é controle de acesso, e não finge ser: a foto já está num endereço
 * público, e quem quiser salva com dois toques no navegador. O botão existe
 * porque o caminho do navegador no celular é ruim (segurar, menu, "abrir em
 * nova aba", segurar de novo) e porque a folha de compartilhamento do sistema
 * — que é o que a pessoa realmente quer, para mandar no grupo — não aparece
 * ali de jeito nenhum.
 */
export function DownloadPhotoButton({ url, nome = "", className = "", label = false }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [ocupado, setOcupado] = useState(false);

  const baixar = async () => {
    if (ocupado || !url) return;
    setOcupado(true);
    try {
      const resposta = await fetch(url, { mode: "cors" });
      if (!resposta.ok) throw new Error(`http-${resposta.status}`);
      const blob = await resposta.blob();
      const fim = await entregarArquivo(blob, nomeDeArquivo("engine", nome || "foto"), {
        titulo: nome || "",
      });
      if (fim === "baixado") showToast(t("plateHider.downloaded"), "success");
    } catch (erro) {
      // Buscar a imagem pode falhar por CORS, por rede, por cache estranho.
      // Em vez de dizer "não deu", abre a foto numa aba: ali a pessoa salva
      // pelo caminho do próprio navegador. É pior, mas resolve.
      console.warn("[foto] baixar falhou, abrindo em outra aba.", erro);
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <button
      type="button"
      onClick={baixar}
      disabled={ocupado}
      title={t("plateHider.download")}
      aria-label={t("plateHider.download")}
      className={className}
    >
      {ocupado ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
      {label && <span className="text-[13px] font-bold">{t("plateHider.download")}</span>}
    </button>
  );
}
