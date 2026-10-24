import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Copy, Database, Handshake, HeartHandshake, Server, Sparkles, Wrench } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/ToastProvider";
import { OFFERS, SUPPORT_PIX_KEY, formatPrice } from "../services/billing";

/**
 * Apoie o Engine.
 *
 * Dois caminhos, e só dois (pesquisa do Han, 24/10/2026, §2.2):
 *  - o Premium É o apoio — quem quer algo em troca assina;
 *  - Pix avulso SEM benefício nenhum. Doação com selo ou vantagem deixa de ser
 *    doação e vira venda (LC 214/2025, art. 6º, VIII), então aqui não há
 *    contrapartida, nem prometida.
 *
 * Sem AdSense nesta página: a política do AdSense proíbe ligar "ajude-nos" a
 * anúncio, e uma página de apoio com bloco de anúncio é exatamente isso.
 */
export function Support() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const keyRef = useRef(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_PIX_KEY);
      setCopied(true);
      toast(t("billing.support.pix.copied"));
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Sem permissão de área de transferência: seleciona o texto para a
      // pessoa copiar na mão.
      const node = keyRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      toast(t("billing.support.pix.copyFallback"), "info");
    }
  };

  const destinations = [
    { key: "servers", icon: Server },
    { key: "data", icon: Database },
    { key: "development", icon: Wrench },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl pb-6">
      <PageHeader
        eyebrow={t("billing.support.eyebrow")}
        title={t("billing.support.title")}
        subtitle={t("billing.support.subtitle")}
      />

      {/* Caminho principal: o Premium. */}
      <section className="engine-card p-5 outline-2 -outline-offset-1 outline-[var(--engine-accent)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
            <Sparkles size={21} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--engine-text)]">{t("billing.support.premium.title")}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--engine-text-muted)]">
              {t("billing.support.premium.body", {
                price: formatPrice(OFFERS.premium_yearly.amount.BRL, i18n.language),
              })}
            </p>
          </div>
        </div>
        <Link
          to="/planos"
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--engine-accent)] text-[13px] font-semibold text-white shadow-[0_2px_10px_var(--engine-accent-soft)] transition hover:brightness-95 sm:h-10 sm:w-auto sm:px-5"
        >
          {t("billing.support.premium.cta")}
          <ArrowRight size={16} />
        </Link>
      </section>

      {/* Para onde vai o dinheiro. */}
      <section className="mt-8">
        <h2 className="text-base font-bold text-[var(--engine-text)]">{t("billing.support.where.title")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--engine-text-muted)]">
          {t("billing.support.where.subtitle")}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {destinations.map((item) => (
            <div key={item.key} className="engine-card p-4">
              <item.icon size={19} className="text-[var(--engine-accent)]" />
              <h3 className="mt-3 text-sm font-bold text-[var(--engine-text)]">
                {t(`billing.support.where.${item.key}.title`)}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
                {t(`billing.support.where.${item.key}.body`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pix de doação — só existe com a chave configurada. */}
      {SUPPORT_PIX_KEY && (
        <section className="engine-card mt-8 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-surface-2)] text-[var(--engine-text)]">
              <HeartHandshake size={21} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[var(--engine-text)]">{t("billing.support.pix.title")}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--engine-text-muted)]">
                {t("billing.support.pix.body")}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <div className="min-w-0 flex-1 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
                {t("billing.support.pix.keyLabel")}
              </p>
              <p ref={keyRef} className="mt-1 break-all font-mono text-[15px] font-semibold text-[var(--engine-text)] select-all">
                {SUPPORT_PIX_KEY}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border-strong)] px-5 text-[13px] font-semibold text-[var(--engine-text)] transition-colors hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:h-auto"
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}
              {copied ? t("billing.support.pix.copiedShort") : t("billing.support.pix.copy")}
            </button>
          </div>

          <ul className="mt-4 space-y-1.5 text-xs leading-relaxed text-[var(--engine-text-muted)]">
            <li>{t("billing.support.pix.noReward")}</li>
            <li>{t("billing.support.pix.checkName")}</li>
          </ul>
        </section>
      )}

      {/* Patrocínio — para empresas. */}
      <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-dashed border-[var(--engine-border-strong)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <Handshake size={21} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--engine-text)]">{t("billing.support.sponsor.title")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--engine-text-muted)]">
              {t("billing.support.sponsor.body")}
            </p>
          </div>
        </div>
        <Link
          to="/anuncie"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--engine-border-strong)] px-5 text-[13px] font-semibold text-[var(--engine-text-muted)] transition-colors hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:h-10"
        >
          {t("billing.support.sponsor.cta")}
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
