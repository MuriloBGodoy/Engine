import { useMediaPicker } from "../hooks/useMediaPicker";

/**
 * O botão de escolher mídia. Toda a lógica (câmera x galeria) mora no
 * `useMediaPicker` — aqui é só a casca, para o botão continuar com a mesma
 * aparência que tinha em cada tela.
 */
export function MediaPickerButton({
  accept = "image/*",
  multiple = false,
  capture = "environment",
  onFiles,
  disabled = false,
  className = "",
  title,
  ariaLabel,
  children,
}) {
  const { open, elementos, perguntaAberta } = useMediaPicker({
    accept,
    multiple,
    capture,
    onFiles,
    title,
  });

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel || title}
        aria-haspopup="dialog"
        aria-expanded={perguntaAberta}
        className={className}
      >
        {children}
      </button>
      {elementos}
    </>
  );
}
