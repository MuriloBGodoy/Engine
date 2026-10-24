import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { AlertTriangle } from "lucide-react";
import { STRIPE_PUBLISHABLE_KEY } from "../../services/billing";

/**
 * Checkout embutido do Stripe (sessão `ui_mode: "embedded_page"`, criada pela
 * função subscription-create).
 *
 * Este arquivo é carregado sob demanda: o `loadStripe` abaixo injeta o
 * script de js.stripe.com, e isso só pode acontecer quando a pessoa já pediu
 * para pagar — não para todo mundo que abre a tela de Planos.
 *
 * As versões de @stripe/stripe-js (9.x, trem "dahlia") e
 * @stripe/react-stripe-js (6.x) estão fixadas no package.json para casar com a
 * API 2026-07-29.dahlia do pacote `stripe` do servidor. A 10.x já é o trem
 * seguinte; subir uma sem a outra quebra o checkout.
 */
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

export function StripeEmbeddedCheckout({ clientSecret }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(!stripePromise);

  // Bloqueador de anúncio e rede ruim derrubam o script do Stripe; sem isso a
  // folha ficaria em branco para sempre.
  useEffect(() => {
    if (!stripePromise) return undefined;
    let active = true;
    stripePromise
      .then((stripe) => {
        if (active && !stripe) setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // O segredo já veio da função; o provider pede uma função que o devolva, e
  // ela não pode mudar de identidade depois de montada.
  const options = useMemo(
    () => ({ fetchClientSecret: () => Promise.resolve(clientSecret) }),
    [clientSecret],
  );

  if (failed) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4 text-sm text-[var(--engine-text-muted)]">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
        <p>{t("billing.checkout.stripeFailed")}</p>
      </div>
    );
  }

  return (
    <EmbeddedCheckoutProvider key={clientSecret} stripe={stripePromise} options={options}>
      <EmbeddedCheckout className="min-h-[28rem] w-full" />
    </EmbeddedCheckoutProvider>
  );
}
