import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { elementoParaPng, entregarArquivo, nomeDeArquivo } from "../../services/imagemDeTela";
import { useToast } from "../ToastProvider";

/**
 * "Salvar imagem" — o botão que transforma um pedaço da tela em PNG e entrega
 * à pessoa (folha de compartilhamento no celular, download no computador).
 *
 * Usado pela Carteira de Garagem e pelo adesivo do carro. Os textos vêm por
 * prop porque cada um dos dois fala do seu jeito, mas o comportamento é o
 * mesmo — inclusive o detalhe que importa: quando a pessoa FECHA a folha de
 * compartilhamento, nenhum aviso aparece. Dizer "imagem salva" para quem
 * acabou de cancelar faz a pessoa procurar um arquivo que não existe.
 *
 * `alvo` é uma ref para o elemento desenhado. `fundo` é a cor por baixo —
 * ver o porquê em `services/imagemDeTela.js`.
 */
export function SaveImageButton({
  alvo,
  nome,
  fundo = null,
  titulo = "",
  textos,
  className = "",
}) {
  const showToast = useToast();
  const [ocupado, setOcupado] = useState(false);

  const salvar = async () => {
    if (ocupado || !alvo?.current) return;
    setOcupado(true);
    try {
      const blob = await elementoParaPng(alvo.current, { fundo });
      if (!blob) throw new Error("sem-imagem");
      const fim = await entregarArquivo(blob, nomeDeArquivo(...[].concat(nome)), {
        titulo,
      });
      if (fim === "baixado") showToast(textos.saved, "success");
      else if (fim === "compartilhado") showToast(textos.shared, "success");
    } catch (erro) {
      console.warn("[imagem] não deu para gerar.", erro);
      showToast(textos.error, "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <button
      type="button"
      onClick={salvar}
      disabled={ocupado}
      data-fora-da-imagem="1"
      className={`flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)] disabled:opacity-60 ${className}`}
    >
      {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      {ocupado ? textos.busy : textos.label}
    </button>
  );
}
