import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * QR em SVG, desenhado em módulos de 1×1 — sem canvas, sem imagem.
 *
 * Vetor de propósito: a carteira e o adesivo são feitos para virarem print e
 * para serem impressos, e um QR em bitmap esborrata nos dois. Em SVG o código
 * é nítido em qualquer tamanho, e `shape-rendering="crispEdges"` impede o
 * navegador de suavizar a borda dos módulos (suavizar é o que faz leitor
 * ruim errar).
 *
 * Correção de erro H (30%): o código continua legível com um pedaço coberto —
 * dedo, risco, fita, reflexo no vidro do carro.
 *
 * `margem` é a zona de silêncio. O padrão manda 4 módulos; 2 é o mínimo que
 * ainda funciona com fundo claro em volta, e é o que cabe num cartão.
 */
export function QrCode({ valor, margem = 2, className = "", titulo = "QR" }) {
  const { caminho, lado } = useMemo(() => {
    if (!valor) return { caminho: "", lado: 0 };
    try {
      const qr = qrcode(0, "H");
      qr.addData(valor);
      qr.make();
      const n = qr.getModuleCount();
      let d = "";
      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
          if (qr.isDark(y, x)) d += `M${x + margem} ${y + margem}h1v1h-1z`;
        }
      }
      return { caminho: d, lado: n + margem * 2 };
    } catch {
      // QR não é essencial para a carteira existir: falhou, não desenha.
      return { caminho: "", lado: 0 };
    }
  }, [valor, margem]);

  if (!caminho) return null;

  return (
    <svg
      viewBox={`0 0 ${lado} ${lado}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={titulo}
      className={className}
    >
      <rect width={lado} height={lado} fill="#fff" />
      <path d={caminho} fill="#000" />
    </svg>
  );
}
