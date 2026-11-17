import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Link2, Loader2, Pencil } from "lucide-react";
import { isCarSlugFree, setCarSlug } from "../../services/carShowcase";
import { enderecoDeApelido, mascaraEndereco, problemaDoEndereco } from "../../services/carHandle";
import { shareUrls } from "../../services/shareLinks";
import { useToast } from "../ToastProvider";
import "../../services/i18n-car-handle";

/**
 * O @ do carro: o endereço público que o dono escolhe.
 *
 * Por que isto existe: muita gente já tem conta de TikTok e de Instagram com
 * o nome que deu ao carro. O endereço montado pela máquina
 * ("/carro/chevrolet-corsa-wind-2002") não serve para quem divulga "@bruxa"
 * em todo lugar.
 *
 * Três decisões de tela:
 *
 *  - **Só aparece depois de publicado.** Endereço de carro que não está na
 *    vitrine não leva a nada; o campo apareceria para configurar o nada.
 *  - **A sugestão vem do apelido**, e é um botão, não um preenchimento
 *    automático: trocar endereço é decisão, não efeito colateral de ter
 *    batizado o carro.
 *  - **O aviso de "o antigo continua valendo" fica à vista**, porque este é
 *    o único campo do app cujo valor a pessoa vai IMPRIMIR e colar no vidro.
 *    Sem o aviso, trocar o apelido parece estragar o adesivo que já está lá.
 */
export function CarAddress({ car, slug, onSlug }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(slug || "");
  const [salvando, setSalvando] = useState(false);
  // null = ainda não perguntou; true/false = resposta do banco para `valor`.
  const [livre, setLivre] = useState(null);
  const [checando, setChecando] = useState(false);
  const pedido = useRef(0);

  const sugestao = enderecoDeApelido(car?.nickname || "");
  const problema = problemaDoEndereco(valor);
  const mudou = valor !== (slug || "");

  // A pergunta "está livre?" é feita enquanto a pessoa digita, mas só quando
  // o formato já passa — perguntar por "ab" seria gastar ida ao banco para
  // receber o que a validação local já sabe. Resposta velha é descartada pelo
  // número do pedido.
  useEffect(() => {
    if (!editando || !mudou || problema) {
      setLivre(null);
      setChecando(false);
      return;
    }
    const meu = pedido.current + 1;
    pedido.current = meu;
    setChecando(true);
    const timer = setTimeout(() => {
      isCarSlugFree(valor)
        .then((ok) => {
          if (pedido.current !== meu) return;
          setLivre(ok);
          setChecando(false);
        })
        .catch(() => {
          if (pedido.current !== meu) return;
          // Falhou a checagem: não diz nada. Quem decide de verdade é o
          // banco no salvar, e um "indisponível" falso faria a pessoa
          // desistir de um endereço que era dela.
          setLivre(null);
          setChecando(false);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [valor, editando, mudou, problema]);

  const abrir = () => {
    setValor(slug || "");
    setLivre(null);
    setEditando(true);
  };

  const salvar = async () => {
    if (salvando || problema || !mudou) return;
    setSalvando(true);
    try {
      const gravado = await setCarSlug(car.id, valor);
      onSlug?.(gravado);
      setEditando(false);
      showToast(t("carHandle.saved"), "success");
    } catch (error) {
      const codigo = String(error?.message || "");
      const frase = codigo.includes("slug-taken")
        ? t("carHandle.error.taken")
        : codigo.includes("too-many-slugs")
          ? t("carHandle.error.tooMany")
          : codigo.includes("car-not-shown")
            ? t("carHandle.error.notShown")
            : codigo.includes("bad-slug")
              ? t("carHandle.error.edges")
              : t("carHandle.error.generic");
      showToast(frase, "error");
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(shareUrls.car(slug));
      showToast(t("carHandle.copied"), "success");
    } catch {
      showToast(t("carHandle.error.generic"), "error");
    }
  };

  return (
    <div className="mt-3 border-t border-[var(--engine-border)] pt-3">
      <p className="text-[12px] font-bold text-[var(--engine-text-muted)]">{t("carHandle.title")}</p>

      {!editando ? (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold text-[var(--engine-text)]">
            <Link2 size={14} aria-hidden="true" className="shrink-0 text-[var(--engine-text-muted)]" />
            <span className="truncate">
              <span className="text-[var(--engine-text-muted)]">enginegarage.com.br/carro/</span>
              {slug}
            </span>
          </span>
          <button
            type="button"
            onClick={copiar}
            aria-label={t("carHandle.copy")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            onClick={abrir}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold text-[var(--engine-accent-text)] transition hover:bg-[var(--engine-surface-2)]"
          >
            <Pencil size={14} />
            {t("carHandle.edit")}
          </button>
        </div>
      ) : (
        <div className="mt-1.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 py-2 focus-within:border-[var(--engine-accent)]">
            <span className="shrink-0 text-[12.5px] text-[var(--engine-text-muted)]">/carro/</span>
            <input
              value={valor}
              onChange={(event) => setValor(mascaraEndereco(event.target.value))}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              inputMode="url"
              maxLength={30}
              aria-label={t("carHandle.title")}
              className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[var(--engine-text)] outline-none"
            />
            {checando && <Loader2 size={14} className="shrink-0 animate-spin text-[var(--engine-text-muted)]" />}
            {!checando && livre === true && (
              <Check size={15} className="shrink-0 text-[var(--engine-accent-text)]" aria-hidden="true" />
            )}
          </div>

          <p
            className={`ml-1 mt-1 text-[11.5px] ${
              problema || livre === false ? "text-[var(--engine-accent-text)]" : "text-[var(--engine-text-muted)]"
            }`}
          >
            {mudou && problema
              ? t(`carHandle.error.${problema}`)
              : livre === false
                ? t("carHandle.error.taken")
                : livre === true
                  ? t("carHandle.free")
                  : t("carHandle.hint")}
          </p>

          {sugestao && sugestao !== valor && !problemaDoEndereco(sugestao) && (
            <button
              type="button"
              onClick={() => setValor(sugestao)}
              className="mt-1 flex min-h-11 items-center text-[12.5px] font-bold text-[var(--engine-accent-text)]"
            >
              {t("carHandle.suggest", { slug: sugestao })}
            </button>
          )}

          <p className="ml-1 mt-1 text-[11.5px] leading-4 text-[var(--engine-text-muted)]">
            {t("carHandle.keepsOld")} {t("carHandle.limitHint")}
          </p>

          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || Boolean(problema) || !mudou}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--engine-accent)] px-4 text-[13px] font-bold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              {salvando && <Loader2 size={15} className="animate-spin" />}
              {salvando ? t("carHandle.saving") : t("carHandle.save")}
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="flex h-11 items-center justify-center rounded-lg border border-[var(--engine-border-strong)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]"
            >
              {t("carHandle.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
