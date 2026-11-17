import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, TrendingDown, TrendingUp, X } from "lucide-react";
import { engineDB } from "../../services/db";
import { carTitle } from "../../services/carDisplay";
import { localISODate } from "../../services/reminders";
import {
  conferirPreco,
  jaAvisado,
  marcarAvisado,
  proximoAConferir,
  variacao,
} from "../../services/fipeWatch";
import "../../services/i18n-fipe-alert";

/**
 * "A FIPE do seu carro mudou."
 *
 * Aparece na Garagem quando a tabela nova discorda do preço guardado. Um
 * carro por abertura de tela, no máximo um por mês por carro — o porquê de
 * cada limite está em `services/fipeWatch.js`.
 *
 * O botão de atualizar grava o preço novo e a data da consulta; o de fechar
 * marca ESTE valor como já avisado, e ele não volta a aparecer. Nenhum dos
 * dois faz nada escondido: sem toque, o preço guardado fica como está.
 */
export function FipeAlert({ cars = [], onApplied }) {
  const { t, i18n } = useTranslation();
  const [achado, setAchado] = useState(null);
  const [salvando, setSalvando] = useState(false);
  // Uma conferida por montagem da tela. Sem isto, toda mudança na lista de
  // carros (salvar, contribuir, trocar a ordem) dispararia outra consulta.
  const jaConferiu = useRef(false);

  useEffect(() => {
    if (jaConferiu.current || !cars.length) return;
    const alvo = proximoAConferir(cars);
    if (!alvo) return;
    jaConferiu.current = true;

    let vivo = true;
    conferirPreco(alvo).then((resposta) => {
      if (!vivo || !resposta) return;
      const mudou = variacao(alvo.targetValue, resposta.valor);
      if (mudou.direcao === "same") {
        // Mesmo preço: nada para dizer, mas a consulta de hoje valeu — sem
        // gravar a data, a mesma conferida aconteceria a cada abertura.
        engineDB
          .saveCar({ ...alvo, pricedAt: localISODate(), fipe: { ...alvo.fipe, code: resposta.codigo } })
          .catch(() => {});
        return;
      }
      if (jaAvisado(alvo.id, resposta.valor)) return;
      setAchado({ car: alvo, mudou, codigo: resposta.codigo });
    });
    return () => {
      vivo = false;
    };
  }, [cars]);

  if (!achado) return null;

  const { car, mudou, codigo } = achado;
  const subiu = mudou.direcao === "up";
  const dinheiro = (valor) =>
    valor.toLocaleString(i18n.language || "pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });

  const fechar = () => {
    marcarAvisado(car.id, mudou.para);
    setAchado(null);
  };

  const atualizar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      await engineDB.saveCar({
        ...car,
        targetValue: mudou.para,
        priceSource: "fipe",
        pricedAt: localISODate(),
        fipe: { ...car.fipe, code: codigo || car.fipe?.code || "" },
      });
      marcarAvisado(car.id, mudou.para);
      setAchado(null);
      await onApplied?.();
    } catch (erro) {
      console.warn("[fipe] não deu para gravar o preço novo.", erro);
      setSalvando(false);
    }
  };

  return (
    <section
      role="status"
      className="engine-card flex items-start gap-3 border-[var(--engine-accent)]/30 bg-[var(--engine-accent-soft)] p-4"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-bg)] text-[var(--engine-accent)]">
        {subiu ? <TrendingUp size={18} aria-hidden="true" /> : <TrendingDown size={18} aria-hidden="true" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--engine-text)]">
          {t(subiu ? "fipeAlert.up" : "fipeAlert.down", {
            car: carTitle(car),
            amount: dinheiro(Math.abs(mudou.delta)),
          })}
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-[var(--engine-text-muted)]">
          {t("fipeAlert.detail", {
            from: dinheiro(mudou.de),
            to: dinheiro(mudou.para),
            pct: Math.abs(mudou.pct).toLocaleString(i18n.language || "pt-BR", { maximumFractionDigits: 1 }),
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={atualizar}
            disabled={salvando}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-[var(--engine-accent)] px-4 text-[13px] font-bold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {salvando && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {t("fipeAlert.apply")}
          </button>
          <button
            type="button"
            onClick={fechar}
            className="flex min-h-11 items-center rounded-lg border border-[var(--engine-border-strong)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]"
          >
            {t("fipeAlert.keep")}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={fechar}
        aria-label={t("fipeAlert.dismiss")}
        className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)]"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </section>
  );
}
