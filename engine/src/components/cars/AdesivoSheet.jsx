import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { BottomSheet } from "../BottomSheet";
import { Adesivo } from "./Adesivo";
import { SaveImageButton } from "../ui/SaveImageButton";
import "../../services/i18n-car-handle";

/** Os dois botões de escolha, iguais aos da folha da carteira. */
function Escolha({ titulo, opcoes, valor, onChange }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
        {titulo}
      </p>
      <div className="flex gap-2">
        {opcoes.map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={valor === id}
            className={`min-h-11 flex-1 rounded-xl border px-3 text-[13px] font-bold transition ${
              valor === id
                ? "border-[var(--engine-accent)] bg-[var(--engine-accent)] text-white"
                : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A folha do adesivo.
 *
 * Mesma forma da folha da carteira (a coisa primeiro, as escolhas depois),
 * por consistência: são os dois objetos "para olhar e tirar print" do app.
 *
 * Duas saídas, porque são dois caminhos diferentes para o vidro do carro:
 *
 *   - **Salvar imagem** é para mandar para a gráfica (ou para o amigo que faz
 *     adesivo). PNG em 3x, com fundo sólido.
 *   - **Imprimir** é para quem tem papel adesivo em casa, e existe separado
 *     porque aí o que importa é o TAMANHO FÍSICO sair certo: a regra
 *     `@media print` fixa 50 mm reais. Tamanho errado num adesivo é o defeito
 *     que só aparece depois de pagar a impressão.
 */
export function AdesivoSheet({ open, onClose, slug, nickname = "" }) {
  const { t } = useTranslation();
  const [tema, setTema] = useState("claro");
  const [forma, setForma] = useState("quadrado");
  const alvo = useRef(null);

  // A marca no body é o que faz a impressão sair só com o adesivo. Sai junto
  // com a folha — se ficasse para trás, a próxima impressão de qualquer
  // outra tela do app sairia em branco.
  useEffect(() => {
    if (!open) return;
    return () => document.body.classList.remove("engine-print-adesivo");
  }, [open]);

  const imprimir = () => {
    document.body.classList.add("engine-print-adesivo");
    // O navegador só pinta depois do frame; sem esperar, a classe entra
    // junto com o diálogo de impressão e às vezes não vale para a folha.
    requestAnimationFrame(() => {
      window.print();
      document.body.classList.remove("engine-print-adesivo");
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t("adesivo.title")} className="sm:max-w-xl">
      <div className="grid gap-4">
        <div className="flex justify-center py-1">
          {/* A ref vive num `div` em volta, e não no adesivo: assim o PNG sai
              com exatamente o quadrado do adesivo, sem o espaçamento da
              folha em volta. */}
          <div ref={alvo} className="inline-flex">
            <Adesivo slug={slug} nickname={nickname} tema={tema} forma={forma} />
          </div>
        </div>

        <p className="text-center text-xs font-semibold text-[var(--engine-text-muted)]">
          {t("adesivo.hint")}
        </p>

        <Escolha
          titulo={t("adesivo.theme")}
          valor={tema}
          onChange={setTema}
          opcoes={[
            ["claro", t("adesivo.themeLight")],
            ["escuro", t("adesivo.themeDark")],
          ]}
        />
        <Escolha
          titulo={t("adesivo.shape")}
          valor={forma}
          onChange={setForma}
          opcoes={[
            ["quadrado", t("adesivo.shapeSquare")],
            ["redondo", t("adesivo.shapeRound")],
          ]}
        />

        <SaveImageButton
          alvo={alvo}
          nome={["adesivo", nickname || slug]}
          fundo={tema === "escuro" ? "#0d0f14" : "#ffffff"}
          titulo={t("adesivo.title")}
          textos={{
            label: t("adesivo.download"),
            busy: t("adesivo.downloading"),
            saved: t("adesivo.savedImage"),
            shared: t("adesivo.sharedImage"),
            error: t("adesivo.imageError"),
          }}
        />

        <button
          type="button"
          onClick={imprimir}
          data-fora-da-imagem="1"
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--engine-border-strong)] bg-[var(--engine-surface)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]"
        >
          <Printer size={16} />
          {t("adesivo.print")}
        </button>
      </div>
    </BottomSheet>
  );
}
