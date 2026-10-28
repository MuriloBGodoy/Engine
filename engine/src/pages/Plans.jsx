import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Clock3,
  Globe,
  Info,
  LogIn,
  Settings as SettingsIcon,
  Sparkles,
  Wrench,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { useIsPremium } from "../hooks/useIsPremium";
import { useBillingCountry } from "../hooks/useBillingCountry";
import {
  FOUNDER_SLOTS,
  OFFERS,
  PRO_TRIAL_DAYS,
  STRIPE_PUBLISHABLE_KEY,
  SUPPORT_EMAIL,
  formatLongDate,
  formatPrice,
} from "../services/billing";
import { ADSENSE_ENABLED } from "../services/consent";
import { authPath } from "../services/authRedirect";

const lazyNamed = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })));
const CheckoutSheet = lazyNamed(() => import("../components/billing/CheckoutSheet"), "CheckoutSheet");

// O que já existe no app e é grátis para sempre. Todos com status "available".
const FREE_FEATURES = ["garage", "specs", "simulator", "community", "clubsEvents", "services"];

// Benefícios do mapa do Premium (23/10/2026). Só "sem anúncios" existe hoje;
// o resto aparece marcado como "Em breve" até existir de verdade no app.
// "Sem anúncios" só é benefício quando o site TEM anúncio. Sem AdSense
// configurado, a produção não mostra nenhum (AdSlot não desenha), e vender o
// Premium por isso seria cobrar para tirar o que não existe (auditoria geral,
// 25/10/2026). Decisão do plano: a venda do Premium não abre agora.
const PREMIUM_FEATURES = [
  { key: "noAds", available: ADSENSE_ENABLED },
  { key: "fipeAlert", available: false },
  { key: "maintenance", available: false },
  { key: "totalCost", available: false },
  { key: "comparator", available: false },
  { key: "resale", available: false },
  { key: "supporterBadge", available: false },
];

const PRO_FEATURES = [
  { key: "allPremium", available: ADSENSE_ENABLED },
  { key: "monthlyMetrics", available: false },
  { key: "monthlyReport", available: false },
  { key: "quotes", available: false },
  { key: "coupon", available: false },
  { key: "reviews", available: false },
];

const PREMIUM_OPTIONS = ["premium_yearly", "premium_pass_3m", "premium_pass_1m"];

/** "peso mexicano", "libra esterlina"… no idioma da tela; o código, se o navegador não souber. */
function currencyName(currency, language) {
  try {
    return new Intl.DisplayNames([language], { type: "currency" }).of(currency) || currency;
  } catch {
    return currency;
  }
}

function FeatureList({ items, t, base }) {
  return (
    <ul className="space-y-2.5">
      {items.map(({ key, available }) => (
        <li key={key} className="flex items-start gap-2.5 text-sm leading-snug">
          {available ? (
            <Check size={17} strokeWidth={2.6} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
          ) : (
            <Clock3 size={16} className="mt-0.5 shrink-0 text-[var(--engine-text-muted)]" />
          )}
          <span
            className={`min-w-0 flex-1 ${
              available ? "text-[var(--engine-text)]" : "text-[var(--engine-text-muted)]"
            }`}
          >
            {t(`${base}.${key}`)}
            {!available && (
              <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full border border-[var(--engine-border-strong)] px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
                {t("billing.plans.soon")}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PlanCard({ tone = "default", badge, eyebrow, name, audience, price, priceNote, children, footer }) {
  const highlighted = tone === "highlight";
  return (
    <article
      className={`engine-card relative flex flex-col p-5 sm:p-6 ${
        // O .engine-card fica fora de layer e vence `border-*` do Tailwind; o
        // destaque vai por outline, que ele não define.
        highlighted ? "outline-2 -outline-offset-1 outline-[var(--engine-accent)]" : ""
      }`}
    >
      {badge && (
        <span className="absolute -top-3 left-5 rounded-full bg-[var(--engine-accent)] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
          {badge}
        </span>
      )}
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--engine-accent)]">{eyebrow}</p>
      <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight text-[var(--engine-text)]">{name}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">{audience}</p>
      <div className="mt-4">{price}</div>
      {priceNote && <div className="mt-1.5 text-xs leading-relaxed text-[var(--engine-text-muted)]">{priceNote}</div>}
      <div className="mt-5 flex-1 border-t border-[var(--engine-border)] pt-5">{children}</div>
      {footer && <div className="mt-6">{footer}</div>}
    </article>
  );
}

function BigPrice({ value, suffix }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className="font-display text-[2rem] font-extrabold leading-none tracking-tight text-[var(--engine-text)]">
        {value}
      </span>
      {suffix && <span className="text-sm font-medium text-[var(--engine-text-muted)]">{suffix}</span>}
    </p>
  );
}

function CurrentBadge({ children }) {
  return (
    <p className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--engine-border-strong)] text-[13px] font-semibold text-[var(--engine-text)] sm:h-10">
      <BadgeCheck size={17} className="text-[var(--engine-accent)]" />
      {children}
    </p>
  );
}

/**
 * Planos — Grátis, Premium (dono do carro) e Pro (prestador).
 *
 * Regra que manda nesta tela: nunca prometer o que o produto não entrega.
 * Tudo o que existe hoje é grátis e fica grátis; dos benefícios pagos, só
 * "sem anúncios" existe, e o resto aparece como "Em breve". Os avisos que a
 * lei pede antes do pagamento (renovação, primeira cobrança, cancelamento,
 * arrependimento) ficam visíveis aqui e de novo no resumo da compra.
 */
export function Plans({ user }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { plan, subscription, loading: planLoading } = useIsPremium(user?.uid);
  // País e moeda de quem olha: perfil, depois região (a mesma conta do servidor).
  const { country, currency, sellable, loading: countryLoading } = useBillingCountry(user?.uid);
  const loading = planLoading || countryLoading;
  const [premiumOffer, setPremiumOffer] = useState("premium_yearly");
  const [checkoutOffer, setCheckoutOffer] = useState(null);

  const isGuest = !user;
  // À venda só quando houver chave do Stripe E algo a entregar (anúncio).
  const billingOpen = Boolean(STRIPE_PUBLISHABLE_KEY) && ADSENSE_ENABLED;
  const hasSubscription = plan !== "free" && subscription?.kind === "subscription";
  const hasPass = plan === "premium" && subscription?.kind === "pass";
  const trialUsed = Boolean(subscription?.trialEnd);
  const money = (amount) => formatPrice(amount, lang, currency);
  const price = (id) => money(OFFERS[id].amount[currency]);
  const founderPrice = money(OFFERS.pro_monthly.founderAmount[currency]);

  const planName = plan === "pro" ? "Engine Pro" : plan === "premium" ? "Engine Premium" : "";

  /** Botão de compra de uma oferta, com os estados que não podem quebrar. */
  const buyButton = (offerId, label) => {
    if (loading && !isGuest) {
      return (
        <Button disabled className="w-full">
          {t("common.loading")}
        </Button>
      );
    }
    if (!billingOpen) {
      return (
        <Button disabled className="w-full">
          {t("billing.plans.cta.soon")}
        </Button>
      );
    }
    if (!sellable) {
      // Fora dos países à venda: o preço fica como informação, sem botão.
      return (
        <p className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--engine-surface-2)] px-3 py-2.5 text-center text-xs leading-relaxed text-[var(--engine-text-muted)]">
          <Globe size={15} className="shrink-0" aria-hidden="true" />
          {t("billing.plans.cta.notSellable")}
        </p>
      );
    }
    if (isGuest) {
      return (
        <Link
          to={authPath("/login", "/planos")}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--engine-accent)] text-[13px] font-semibold text-white transition hover:brightness-95 sm:h-10"
        >
          <LogIn size={16} />
          {t("billing.plans.cta.login")}
        </Link>
      );
    }
    return (
      <Button className="w-full" onClick={() => setCheckoutOffer(offerId)}>
        {label}
        <ArrowRight size={16} />
      </Button>
    );
  };

  const manageLink = (
    <Link
      to="/settings"
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--engine-border-strong)] text-[13px] font-semibold text-[var(--engine-text-muted)] transition-colors hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:h-10"
    >
      <SettingsIcon size={16} />
      {t("billing.plans.cta.manage")}
    </Link>
  );

  // --- Rodapé de cada cartão -------------------------------------------------

  let freeFooter;
  if (isGuest) {
    freeFooter = (
      <Link
        to={authPath("/register", "/planos")}
        className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-[var(--engine-border-strong)] text-[13px] font-semibold text-[var(--engine-text-muted)] transition-colors hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] sm:h-10"
      >
        {t("billing.plans.cta.register")}
      </Link>
    );
  } else if (plan === "free" && !loading) {
    freeFooter = <CurrentBadge>{t("billing.plans.cta.current")}</CurrentBadge>;
  } else {
    freeFooter = (
      <p className="text-center text-xs text-[var(--engine-text-muted)]">{t("billing.plans.free.always")}</p>
    );
  }

  let premiumFooter;
  if (plan === "pro") {
    premiumFooter = <CurrentBadge>{t("billing.plans.cta.includedInPro")}</CurrentBadge>;
  } else if (plan === "premium" && hasSubscription) {
    premiumFooter = (
      <div className="space-y-2">
        <CurrentBadge>{t("billing.plans.cta.current")}</CurrentBadge>
        {manageLink}
      </div>
    );
  } else if (hasPass && premiumOffer === "premium_yearly") {
    // Assinar o anual com passe valendo pagaria o mesmo período duas vezes.
    premiumFooter = (
      <p className="rounded-lg bg-[var(--engine-surface-2)] px-3 py-2.5 text-center text-xs leading-relaxed text-[var(--engine-text-muted)]">
        {t("billing.plans.cta.passActiveYearly", {
          date: formatLongDate(subscription.currentPeriodEnd, lang),
        })}
      </p>
    );
  } else {
    premiumFooter = buyButton(
      premiumOffer,
      premiumOffer === "premium_yearly" ? t("billing.plans.cta.subscribePremium") : t("billing.plans.cta.buyPass"),
    );
  }

  let proFooter;
  if (plan === "pro") {
    proFooter = (
      <div className="space-y-2">
        <CurrentBadge>{t("billing.plans.cta.current")}</CurrentBadge>
        {manageLink}
      </div>
    );
  } else if (hasSubscription) {
    // Já assina o Premium: duas assinaturas ao mesmo tempo seria cobrança em
    // dobro. A troca passa por Configurações.
    proFooter = (
      <div className="space-y-2">
        <p className="text-center text-xs leading-relaxed text-[var(--engine-text-muted)]">
          {t("billing.plans.cta.switchHint")}
        </p>
        {manageLink}
      </div>
    );
  } else {
    proFooter = buyButton(
      "pro_monthly",
      trialUsed ? t("billing.plans.cta.subscribePro") : t("billing.plans.cta.startTrial", { days: PRO_TRIAL_DAYS }),
    );
  }

  const premiumOptionText = (id) => {
    return t(`billing.plans.premium.option.${id}`, { price: price(id) });
  };

  return (
    <div className="pb-6">
      <PageHeader
        eyebrow={t("billing.plans.eyebrow")}
        title={t("billing.plans.title")}
        subtitle={t("billing.plans.subtitle")}
      />

      {/* Plano atual de quem já paga, com o caminho para gerenciar. */}
      {!isGuest && !loading && plan !== "free" && (
        <div className="engine-card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
              <Sparkles size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--engine-text)]">
                {t("billing.plans.currentTitle", { plan: planName })}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
                {t("billing.plans.currentHint")}
              </p>
            </div>
          </div>
          <div className="sm:w-56">{manageLink}</div>
        </div>
      )}

      {!billingOpen && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-dashed border-[var(--engine-border-strong)] px-4 py-3.5 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
          <Info size={17} className="mt-0.5 shrink-0" />
          <p>{t(ADSENSE_ENABLED ? "billing.plans.notOpen" : "billing.plans.notOpenNoAds")}</p>
        </div>
      )}

      {billingOpen && !sellable && !loading && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-dashed border-[var(--engine-border-strong)] px-4 py-3.5 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
          <Globe size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold text-[var(--engine-text)]">{t("billing.plans.notSellable.title")}</span>{" "}
            {t("billing.plans.notSellable.body", { currency: currencyName(currency, lang) })}
          </p>
        </div>
      )}

      <div className="grid gap-5 pt-3 lg:grid-cols-3 lg:items-stretch">
        {/* Grátis — longo de propósito: é a maior parte do Engine. */}
        <PlanCard
          eyebrow={t("billing.plans.free.eyebrow")}
          name={t("billing.plans.free.name")}
          audience={t("billing.plans.free.audience")}
          price={<BigPrice value={money(0)} suffix={t("billing.plans.free.forever")} />}
          footer={freeFooter}
        >
          <FeatureList
            t={t}
            base="billing.features.free"
            items={FREE_FEATURES.map((key) => ({ key, available: true }))}
          />
        </PlanCard>

        {/* Premium — dono do carro. */}
        <PlanCard
          tone="highlight"
          badge={t("billing.plans.premium.badge")}
          eyebrow={t("billing.plans.premium.eyebrow")}
          name="Engine Premium"
          audience={t("billing.plans.premium.audience")}
          price={
            premiumOffer === "premium_yearly" ? (
              <BigPrice value={price("premium_yearly")} suffix={t("billing.plans.perYear")} />
            ) : (
              <BigPrice value={price(premiumOffer)} suffix={t("billing.plans.oneTime")} />
            )
          }
          priceNote={
            premiumOffer === "premium_yearly"
              ? t("billing.plans.premium.yearlyNote", {
                  monthly: money(Math.round(OFFERS.premium_yearly.amount[currency] / 12)),
                })
              : t(`billing.plans.premium.passNote.${premiumOffer}`)
          }
          footer={premiumFooter}
        >
          <fieldset className="mb-5">
            <legend className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
              {t("billing.plans.premium.chooseLabel")}
            </legend>
            <div className="space-y-2">
              {PREMIUM_OPTIONS.map((id) => {
                const selected = premiumOffer === id;
                return (
                  <label
                    key={id}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      selected
                        ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-text)]"
                        : "border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-border-strong)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="premium-offer"
                      value={id}
                      checked={selected}
                      onChange={() => setPremiumOffer(id)}
                      className="h-4 w-4 shrink-0 accent-[var(--engine-accent)]"
                    />
                    <span className="min-w-0 flex-1 font-semibold">{premiumOptionText(id)}</span>
                    {id === "premium_yearly" && (
                      <span className="shrink-0 text-[11px] font-semibold text-[var(--engine-text-muted)]">
                        {t("billing.plans.premium.renews")}
                      </span>
                    )}
                    {id !== "premium_yearly" && (
                      <span className="shrink-0 text-[11px] font-semibold text-[var(--engine-text-muted)]">
                        {t("billing.plans.premium.noRenew")}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className="mb-4 text-xs leading-relaxed text-[var(--engine-text-muted)]">
            {t(ADSENSE_ENABLED ? "billing.plans.premium.honest" : "billing.plans.premium.honestNoAds")}
          </p>
          <FeatureList t={t} base="billing.features.premium" items={PREMIUM_FEATURES} />
        </PlanCard>

        {/* Pro — prestador de serviço. */}
        <PlanCard
          eyebrow={t("billing.plans.pro.eyebrow")}
          name="Engine Pro"
          audience={t("billing.plans.pro.audience")}
          price={<BigPrice value={price("pro_monthly")} suffix={t("billing.plans.perMonth")} />}
          priceNote={
            trialUsed
              ? t("billing.plans.pro.trialUsed")
              : t("billing.plans.pro.trialNote", { days: PRO_TRIAL_DAYS })
          }
          footer={proFooter}
        >
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3">
            <Wrench size={17} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
            <p className="text-[13px] leading-relaxed text-[var(--engine-text)]">
              {t("billing.plans.pro.founder", {
                founderPrice,
                slots: FOUNDER_SLOTS,
                price: price("pro_monthly"),
              })}
            </p>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-[var(--engine-text-muted)]">
            {t(ADSENSE_ENABLED ? "billing.plans.pro.honest" : "billing.plans.pro.honestNoAds")}
          </p>
          <FeatureList t={t} base="billing.features.pro" items={PRO_FEATURES} />
        </PlanCard>
      </div>

      {/* Antes de assinar — visível antes de qualquer clique em pagar. */}
      <section aria-labelledby="plans-legal-title" className="engine-card mt-8 p-5 sm:p-6">
        <h2 id="plans-legal-title" className="text-base font-bold text-[var(--engine-text)]">
          {t("billing.legal.title")}
        </h2>
        <ul className="mt-4 grid gap-4 text-[13px] leading-relaxed text-[var(--engine-text-muted)] md:grid-cols-2">
          {["renewal", "trial", "pass", "cancel", "refund", "founder"].map((key) => (
            <li key={key} className="min-w-0">
              <p className="font-semibold text-[var(--engine-text)]">{t(`billing.legal.${key}.title`)}</p>
              <p className="mt-1">
                {t(`billing.legal.${key}.body`, {
                  days: PRO_TRIAL_DAYS,
                  email: SUPPORT_EMAIL,
                  slots: FOUNDER_SLOTS,
                  founderPrice,
                  price: price("pro_monthly"),
                })}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-5 border-t border-[var(--engine-border)] pt-4 text-xs leading-relaxed text-[var(--engine-text-muted)]">
          <Trans
            i18nKey="billing.legal.links"
            components={{
              terms: <Link to="/termos" className="font-semibold text-[var(--engine-text)] underline underline-offset-2" />,
              privacy: <Link to="/privacidade" className="font-semibold text-[var(--engine-text)] underline underline-offset-2" />,
            }}
          />
        </p>
      </section>

      <p className="mt-6 text-center text-[13px] text-[var(--engine-text-muted)]">
        <Trans
          i18nKey="billing.plans.supportLink"
          components={{
            support: <Link to="/apoie" className="font-semibold text-[var(--engine-accent)] hover:underline" />,
          }}
        />
      </p>

      {checkoutOffer && (
        <Suspense fallback={null}>
          <CheckoutSheet
            offerId={checkoutOffer}
            country={country}
            currency={currency}
            subscription={subscription}
            onClose={() => setCheckoutOffer(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
