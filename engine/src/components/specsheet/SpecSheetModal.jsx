import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { canEditSpecSheet, resolveVehicleSpecSheet } from "../../services/carSpecSheet";
import { SpecSheetEditor } from "./SpecSheetEditor";
import { SpecSheetView } from "./SpecSheetView";
import { formatFipeYear } from "../../services/carDisplay";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";

/**
 * A ficha tecnica, nas tres entradas.
 *
 * Garagem, cadastro de veiculo e post da Comunidade abrem ESTE modal. O que
 * muda entre eles nao e o componente, e de quem e o carro:
 *
 *   - carro proprio e possuido  -> le e edita, camadas 1, 2 e 3;
 *   - carro proprio que e meta  -> le a camada 1; ficha de exemplar nao existe
 *                                 para carro que a pessoa ainda nao tem;
 *   - carro de outra pessoa     -> le a camada 1 (derivada de marca/modelo/ano,
 *                                 que ja sao publicos) mais o que o dono
 *                                 declarou, sempre etiquetado.
 */
export function SpecSheetModal({ car, onClose, onSave }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [focusVersion, setFocusVersion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [highlightUnlock, setHighlightUnlock] = useState(false);

  const resolved = useMemo(() => (car ? resolveVehicleSpecSheet(car) : null), [car]);

  // Voltar no Android fecha a ficha em vez de sair da Garagem (ou do app, no
  // PWA). Era o único modal da Garagem sem isso (auditoria de 25/10/2026).
  const close = useCallback(() => onClose?.(), [onClose]);
  useHistoryDismiss(Boolean(car), close);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!car || !resolved) return null;

  const canEdit = canEditSpecSheet(car) && Boolean(onSave);
  const versionString = `${car.brand || ""} ${car.model || ""}`.trim();

  const submit = async (sheet) => {
    setSaving(true);
    setError("");
    try {
      const before = resolved.unlockedBy.length;
      const result = await onSave(sheet);
      if (result && result.ok === false) {
        setError(result.message || t("specSheet.editor.saveError"));
        return;
      }
      setEditing(false);
      setFocusVersion(false);
      // O destaque do destrave e um momento, nao um estado: quem abre a ficha
      // amanha ve o credito discreto, quem acabou de destravar ve a faixa
      // acesa. Sem o `before` a faixa acenderia de novo a cada save.
      setHighlightUnlock(before === 0);
    } catch (saveError) {
      setError(saveError?.message || t("specSheet.editor.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="engine-modal-overlay"
      /* O `stopPropagation` no fundo existe por causa da Comunidade: la o card
         inteiro e um link para a publicacao, e sem isto fechar o modal abriria
         o post por baixo dele. */
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("specSheet.title")}
        className="engine-modal-panel engine-pop sm:max-w-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--engine-accent)]">
              {editing ? t("specSheet.editor.title") : t("specSheet.title")}
            </p>
            {/* Aqui o nome da versao cabe inteiro, e e por isso que o bloco de
                identidade do CarCard pode parar de truncar: a ficha virou o
                lugar onde a string da FIPE se le por completo. */}
            <h2 className="mt-0.5 text-[15px] font-extrabold italic leading-snug text-[var(--engine-text)]">
              {versionString}
            </h2>
            {car.year ? (
              <p className="text-[11.5px] font-semibold text-[var(--engine-text-muted)]">
                {formatFipeYear(car.year, t("car.zeroKm"))}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("specSheet.close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--engine-border)] text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="engine-modal-body px-4 py-4 sm:px-6">
          {editing ? (
            <SpecSheetEditor
              car={car}
              resolved={resolved}
              focusVersion={focusVersion}
              saving={saving}
              error={error}
              onCancel={() => {
                setEditing(false);
                setFocusVersion(false);
                setError("");
              }}
              onSave={submit}
            />
          ) : (
            <SpecSheetView
              resolved={resolved}
              versionString={versionString}
              canEdit={canEdit}
              highlightUnlock={highlightUnlock}
              onEdit={() => {
                setHighlightUnlock(false);
                setEditing(true);
              }}
              onCorrectVersion={() => {
                setHighlightUnlock(false);
                setFocusVersion(true);
                setEditing(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
