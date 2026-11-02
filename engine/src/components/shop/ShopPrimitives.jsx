import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Plus, X } from "lucide-react";
import "../../services/i18n-shop";

/**
 * Peças pequenas do fluxo Anunciar e da Loja, no visual aprovado em
 * 01/11/2026 (ui designs/2026-11-01-anunciar-e-pagina-profissional). Só
 * desenham: quem guarda o estado e fala com o banco é a tela do Han.
 */

const surface = "border border-[var(--engine-border)] bg-[var(--engine-surface)]";

/** Cartão de escolha grande ("Como você" / "Criar página", "Produto" / "Serviço"). */
export function ChoiceCard({ selected, onClick, icon, title, hint, vertical = false }) {
  return (
    <button
      type="button"
      aria-pressed={Boolean(selected)}
      onClick={onClick}
      className={`flex w-full gap-3.5 rounded-2xl border-[1.5px] bg-[var(--engine-surface)] p-4 text-left transition ${
        vertical ? "flex-col items-start gap-1" : "items-center"
      } ${
        selected
          ? "border-[var(--engine-text)] shadow-[0_0_0_1px_var(--engine-text)]"
          : "border-[var(--engine-border)] hover:border-[var(--engine-border-strong)]"
      }`}
    >
      {icon && (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[var(--engine-surface-2)] text-[var(--engine-text)]">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] font-bold text-[var(--engine-text)]">{title}</b>
        {hint && <span className="mt-0.5 block text-[13px] text-[var(--engine-text-muted)]">{hint}</span>}
      </span>
    </button>
  );
}

/** Interruptor visual. O papel de switch fica no botão que o contém. */
export function SwitchKnob({ on, disabled = false }) {
  return (
    <span
      aria-hidden="true"
      className={`relative h-7 w-[46px] shrink-0 rounded-full transition-colors ${
        on ? "bg-[var(--engine-accent)]" : "bg-[var(--engine-border-strong)]"
      } ${disabled ? "opacity-55" : ""}`}
    >
      <span
        className={`absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[18px]" : ""
        }`}
      />
    </span>
  );
}

/** Linha com título, dica e interruptor. Sem onChange vira só leitura (sempre ligado). */
export function SwitchRow({ checked, onChange, title, hint, disabled = false, icon }) {
  const readOnly = !onChange || disabled;
  const Tag = readOnly ? "div" : "button";
  return (
    <Tag
      {...(readOnly ? {} : { type: "button", onClick: () => onChange(!checked) })}
      role="switch"
      aria-checked={Boolean(checked)}
      aria-disabled={readOnly || undefined}
      className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-[14px] px-4 py-2 text-left ${surface}`}
    >
      {icon && <span className="text-[var(--engine-text)]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] font-bold text-[var(--engine-text)]">{title}</b>
        {hint && <small className="mt-0.5 block text-xs font-medium text-[var(--engine-text-muted)]">{hint}</small>}
      </span>
      <SwitchKnob on={checked} disabled={readOnly} />
    </Tag>
  );
}

/** Pílula de filtro/categoria. */
export function Chip({ selected, onClick, children, icon, className = "" }) {
  return (
    <button
      type="button"
      aria-pressed={Boolean(selected)}
      onClick={onClick}
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition ${
        selected
          ? "border-[var(--engine-text)] bg-[var(--engine-text)] text-[var(--engine-bg)]"
          : "border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[var(--engine-text)] hover:border-[var(--engine-text-muted)]"
      } ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

/** Fileira de pílulas que rola de lado no celular. */
export function ChipRow({ children, className = "", label }) {
  return (
    <div
      role={label ? "group" : undefined}
      aria-label={label}
      className={`flex gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}

/** Rótulo + moldura de campo (o foco pinta a moldura, como o `.engine-field`). */
export function FieldBox({ label, htmlFor, optional, children, hint, prefix, multiline = false }) {
  return (
    <div>
      {label && (
        <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-bold text-[var(--engine-text)]">
          {label} {optional && <span className="font-medium text-[var(--engine-text-muted)]">{optional}</span>}
        </label>
      )}
      <div
        className={`engine-field flex min-h-[52px] gap-2 rounded-[14px] border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 text-[var(--engine-text)] ${
          multiline ? "items-start" : "items-center"
        }`}
      >
        {prefix && <span className="shrink-0 font-bold text-[var(--engine-text-muted)]">{prefix}</span>}
        {children}
      </div>
      {hint}
    </div>
  );
}

/** Classe do <input> que vai dentro do FieldBox: 16px pra não dar zoom no iOS. */
export const fieldInputClass =
  "min-w-0 flex-1 border-0 bg-transparent text-base font-semibold text-[var(--engine-text)] outline-none placeholder:font-medium placeholder:text-[var(--engine-text-muted)]";

/**
 * Preço grande no centro ("Quanto?"). `value` em número (ou null); o campo
 * mostra com separador de milhar e devolve só os dígitos.
 */
export function BigPriceInput({ value, onChange, currencySymbol = "R$", label, locale = "pt-BR" }) {
  const id = useId();
  const shown = value === null || value === undefined || value === "" ? "" : Number(value).toLocaleString(locale);
  return (
    <label htmlFor={id} className="flex items-baseline justify-center gap-1.5 pb-1 pt-5 font-display font-extrabold tracking-[-0.03em]">
      <span className="text-2xl text-[var(--engine-text-muted)]">{currencySymbol}</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        value={shown}
        placeholder="0"
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
          onChange(digits ? Number(digits) : null);
        }}
        // `!`: a regra global de 16px nos campos (index.css, fora de layer)
        // venceria a utilitária; aqui o número é grande de propósito e o
        // zoom do iOS só acontece abaixo de 16px.
        className="w-[6.4ch] border-0 bg-transparent font-display text-[44px]! font-extrabold text-[var(--engine-text)] outline-none placeholder:text-[var(--engine-border-strong)]"
      />
    </label>
  );
}

/**
 * Grade de fotos do anúncio: a primeira é a capa (2x2), X em cada uma, tile
 * "Mais" até o limite. `photos` = [{ id, url }]. `onAdd(files)` recebe os
 * arquivos do seletor; comprimir e subir é com a tela.
 */
export function PhotoGrid({ photos = [], max = 10, onAdd, onRemove, onMakeCover, busy = false }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const open = () => inputRef.current?.click();
  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      onChange={(event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (files.length) onAdd?.(files);
      }}
    />
  );

  if (!photos.length) {
    return (
      <>
        {picker}
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className="flex min-h-[200px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[13px] font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-text-muted)]"
        >
          <Camera size={22} aria-hidden="true" />
          <span className="text-[15px] text-[var(--engine-text)]">{t("shop.photos.pick")}</span>
          <span className="font-medium">{t("shop.photos.pickHint")}</span>
        </button>
      </>
    );
  }

  return (
    <div>
      {picker}
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <div
            key={photo.id || photo.url}
            className={`relative aspect-square overflow-hidden rounded-xl bg-[var(--engine-surface-2)] ${
              index === 0 ? "col-span-2 row-span-2" : ""
            }`}
          >
            {onMakeCover && index > 0 ? (
              <button type="button" onClick={() => onMakeCover(index)} aria-label={t("shop.photos.makeCover")} className="block h-full w-full">
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
              </button>
            ) : (
              <img src={photo.url} alt="" className="h-full w-full object-cover" />
            )}
            {index === 0 && <PhotoTag>{t("shop.photos.cover")}</PhotoTag>}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={t("shop.photos.remove", { n: index + 1 })}
                className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white backdrop-blur"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {photos.length < max && (
          <button
            type="button"
            onClick={open}
            disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[13px] font-bold text-[var(--engine-text-muted)]"
          >
            <Plus size={20} aria-hidden="true" />
            {t("shop.photos.more")}
          </button>
        )}
      </div>
      <p className="mt-3 text-[13px] font-semibold text-[var(--engine-text-muted)]">
        {t("shop.photos.count", { count: photos.length, max })}
      </p>
    </div>
  );
}

/** Etiqueta escura em cima da foto ("Usado", "Capa", "1/5"). */
export function PhotoTag({ children, side = "left" }) {
  return (
    <span
      className={`absolute top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur ${
        side === "left" ? "left-2" : "right-2"
      }`}
    >
      {children}
    </span>
  );
}

/** Balão da mensagem pronta. */
export function MessageBubble({ children }) {
  return (
    <div className="rounded-2xl rounded-bl-[4px] bg-[var(--engine-surface-2)] px-3.5 py-3 text-sm leading-relaxed text-[var(--engine-text)]">
      {children}
    </div>
  );
}

/** Logo da página: imagem ou iniciais. Tamanhos em classe Tailwind. */
export function ProfileLogo({ src, initials, className = "h-12 w-12 rounded-[14px] text-sm", ring = "" }) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden bg-[var(--engine-text)] font-display font-extrabold text-[var(--engine-bg)] ${className} ${ring}`}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials || "·"}
    </span>
  );
}
