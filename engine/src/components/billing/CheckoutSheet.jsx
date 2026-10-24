import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, ShieldCheck, X } from "lucide-react";
import { startCheckout } from "../../services/subscription";
import {
  OFFERS,
  SUPPORT_EMAIL,
  formatLongDate,
  formatPrice,
  trialEndFromNow,
} from "../../services/billing";
import { useRegion } from "../../hooks/RegionProvider";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { Button } from "../Button";
import { useToast } from "../ToastProvider";

const lazyNamed = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })));
const StripeEmbeddedCheckout = lazyNamed(() => import("./StripeEmbeddedCheckout"), "StripeEmbeddedCheckout");

/** Fim de um passe comprado agora — soma ao passe que ainda vale, como o servidor. */
function passEndFrom(months, currentEnd) {
  const now = new Date();
  const base = currentEnd && new Date(currentEnd) > now ? new Date(currentEnd) : now;
  const end = new Date(base);
  end.setMonth(end.getMonth() + months);
  return end;
}

function SummaryRow({ label, children }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed text-[var(--engine-text)]">{children}</dd>
    </div>
  );
}

/**
 * Folha de compra: primeiro o resumo do contrato, depois o pagamento.
 *
 * O resumo não é enfeite. O Decreto 7.962/2013 (art. 4º, I e II) pede o
 * sumário do contrato antes da contratação, com as cláusulas que limitam
 * direitos em destaque, e um jeito de corrigir antes de finalizar — é o
 * "Voltar" daqui. Renovação, data da primeira cobrança, como cancelar e o
 * arrependimento de 7 dias aparecem antes de qualquer campo de cartão.
 */
export function CheckoutSheet({ offerId, subscription, onClose }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { region } = useRegion();
  const [step, setStep] = useState("summary");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");

  const offer = OFFERS[offerId];
  const lang = i18n.language;
  const isPro = offerId === "pro_monthly";
  const isPass = offer?.kind === "pass";
  const trialUsed = Boolean(subscription?.trialEnd);
  const hasTrial = isPro && !trialUsed;
  const activePassEnd =
    subscription?.kind === "pass" && subscription?.currentPeriodEnd ? subscription.currentPeriodEnd : null;

  useHistoryDismiss(true, onClose);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!offer) return null;

  const price = formatPrice(offer.amount.BRL, lang);
  const founderPrice = offer.founderAmount ? formatPrice(offer.founderAmount.BRL, lang) : "";

  const handleContinue = async () => {
    setStep("starting");
    setError("");
    try {
      const country = region?.country && region.country !== "all" ? region.country : undefined;
      const result = await startCheckout(offerId, { country });
      if (result.clientSecret) {
        setClientSecret(result.clientSecret);
        setStep("checkout");
        return;
      }
      // Mercado Pago (AR, MX, CL, CO): o pagamento acontece na página deles.
      setStep("redirecting");
      window.location.href = result.url;
    } catch (caught) {
      const message = caught?.message || t("billing.checkout.genericError");
      setError(message);
      setStep("summary");
      toast(message, "error");
    }
  };

  let priceText;
  if (isPro) priceText = t("billing.checkout.priceMonthly", { price, founderPrice });
  else if (isPass) priceText = t("billing.checkout.pricePass", { price });
  else priceText = t("billing.checkout.priceYearly", { price });

  let renewalText;
  if (isPass) {
    renewalText = t(`billing.checkout.renewalPass.${offerId}`, {
      end: formatLongDate(passEndFrom(offer.months, activePassEnd), lang),
    });
  } else {
    renewalText = t(isPro ? "billing.checkout.renewalMonthly" : "billing.checkout.renewalYearly");
  }

  let firstChargeText;
  if (hasTrial) {
    firstChargeText = t("billing.checkout.firstChargeTrial", {
      date: formatLongDate(trialEndFromNow(offer.trialDays), lang),
      days: offer.trialDays,
    });
  } else if (isPro && trialUsed) {
    firstChargeText = t("billing.checkout.firstChargeTrialUsed");
  } else {
    firstChargeText = t("billing.checkout.firstChargeToday");
  }

  const busy = step === "starting" || step === "redirecting";

  return createPortal(
    <div className="engine-modal-overlay" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-sheet-title"
        className="engine-modal-panel engine-pop sm:max-w-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--engine-border)] px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-2">
          {step === "checkout" ? (
            <button
              type="button"
              onClick={() => setStep("summary")}
              aria-label={t("billing.checkout.backToSummary")}
              title={t("billing.checkout.backToSummary")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--engine-accent)]">
              {step === "checkout" ? t("billing.checkout.stepPay") : t("billing.checkout.stepSummary")}
            </p>
            <h2 id="checkout-sheet-title" className="truncate text-base font-bold text-[var(--engine-text)]">
              {t(`billing.offers.${offerId}.name`)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
            title={t("common.close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </header>

        <div className="engine-modal-body engine-scroll px-4 py-4 sm:px-5">
          {step === "checkout" ? (
            <Suspense
              fallback={
                <div className="flex min-h-[20rem] items-center justify-center" aria-busy="true">
                  <Loader2 size={22} className="animate-spin text-[var(--engine-text-muted)]" />
                </div>
              }
            >
              <StripeEmbeddedCheckout clientSecret={clientSecret} />
            </Suspense>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-[var(--engine-text-muted)]">
                {t("billing.checkout.intro")}
              </p>

              <dl className="engine-card divide-y divide-[var(--engine-border)] overflow-hidden p-0">
                <SummaryRow label={t("billing.checkout.labelWhat")}>
                  {t(`billing.offers.${offerId}.what`)}
                </SummaryRow>
                <SummaryRow label={t("billing.checkout.labelToday")}>
                  {t(isPro ? "billing.checkout.todayPro" : "billing.checkout.todayPremium")}
                </SummaryRow>
                <SummaryRow label={t("billing.checkout.labelPrice")}>{priceText}</SummaryRow>
                <SummaryRow label={t("billing.checkout.labelRenewal")}>
                  <strong className="font-semibold">{renewalText}</strong>
                </SummaryRow>
                <SummaryRow label={t("billing.checkout.labelFirstCharge")}>
                  <strong className="font-semibold">{firstChargeText}</strong>
                </SummaryRow>
                <SummaryRow label={t("billing.checkout.labelCancel")}>
                  {isPass ? t("billing.checkout.cancelPass") : t("billing.checkout.cancelSubscription")}
                </SummaryRow>
                <SummaryRow label={t("billing.checkout.labelRefund")}>
                  {hasTrial
                    ? t("billing.checkout.refundTrial", { email: SUPPORT_EMAIL })
                    : t("billing.checkout.refundPlain", { email: SUPPORT_EMAIL })}
                </SummaryRow>
              </dl>

              <p className="text-xs leading-relaxed text-[var(--engine-text-muted)]">
                {t("billing.checkout.currencyNote")}
              </p>

              {error && (
                <p role="alert" className="rounded-xl border border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] px-3 py-2.5 text-sm text-[var(--engine-text)]">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {step !== "checkout" && (
          <footer className="shrink-0 space-y-3 border-t border-[var(--engine-border)] px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:px-5 sm:pb-4">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--engine-text-muted)]">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" />
              <span>
                <Trans
                  i18nKey="billing.checkout.agree"
                  components={{
                    terms: <Link to="/termos" target="_blank" className="font-semibold text-[var(--engine-text)] underline underline-offset-2" />,
                    privacy: <Link to="/privacidade" target="_blank" className="font-semibold text-[var(--engine-text)] underline underline-offset-2" />,
                  }}
                />
              </span>
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={onClose} disabled={busy} className="w-full sm:w-auto">
                {t("billing.checkout.back")}
              </Button>
              <Button onClick={handleContinue} disabled={busy} className="w-full sm:w-auto">
                {busy && <Loader2 size={16} className="animate-spin" />}
                {step === "redirecting" ? t("billing.checkout.redirecting") : t("billing.checkout.continue")}
              </Button>
            </div>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
