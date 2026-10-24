import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { CalendarDays, CheckCircle2, Loader2, MapPin, Megaphone, Send, ShieldCheck, Store } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { useToast } from "../components/ToastProvider";
import {
  SPONSOR_FORMATS,
  SPONSOR_LIMITS,
  SUPPORT_EMAIL,
  fetchSponsorStats,
  submitSponsorLead,
} from "../services/billing";
import { captureError } from "../services/observability";

const fieldClass =
  "w-full min-h-12 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3 text-[15px] text-[var(--engine-text)] outline-none transition-colors placeholder:text-[var(--engine-text-muted)] focus:border-[var(--engine-accent)]";
const labelClass =
  "mb-1.5 ml-0.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--engine-text-muted)]";

const EMPTY_FORM = {
  name: "",
  company: "",
  email: "",
  whatsapp: "",
  city: "",
  state: "",
  format: "city",
  message: "",
  consent: false,
  // Isca para robô: campo escondido que gente de verdade não preenche.
  website: "",
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const FORMAT_CARDS = [
  { key: "city", icon: MapPin },
  { key: "event", icon: CalendarDays },
  { key: "featured", icon: Store },
];

function Field({ id, label, optional, children, hint }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelClass}>
        {label}
        {optional && (
          <span className="ml-1.5 font-semibold normal-case tracking-normal">({optional})</span>
        )}
      </label>
      {children}
      {hint && <p className="mt-1.5 ml-0.5 text-xs text-[var(--engine-text-muted)]">{hint}</p>}
    </div>
  );
}

/**
 * Anuncie no Engine — formatos de patrocínio e o formulário de contato.
 *
 * Sem preço publicado: com o tamanho de hoje, a única coisa honesta é
 * conversar. Os "números do Engine" saem de contagem no banco na hora
 * (fetchSponsorStats); o que falhar ou der zero não aparece. Nada aqui é
 * digitado à mão, pela mesma regra do simulador: nunca inventar número.
 */
export function Advertise({ user }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, email: user?.email || "" }));
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let active = true;
    fetchSponsorStats()
      .then((result) => {
        if (active) setStats(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const update = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: "" }));
  };

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = t("billing.advertise.form.errors.name");
    if (!form.company.trim()) next.company = t("billing.advertise.form.errors.company");
    if (!EMAIL_PATTERN.test(form.email.trim())) next.email = t("billing.advertise.form.errors.email");
    if (form.city.trim().length < 2) next.city = t("billing.advertise.form.errors.city");
    if (!form.consent) next.consent = t("billing.advertise.form.errors.consent");
    return next;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      document.getElementById(`lead-${first}`)?.focus();
      return;
    }

    // Robô preencheu a isca: finge que deu certo e não grava nada.
    if (form.website) {
      setSent(true);
      return;
    }

    setSending(true);
    try {
      await submitSponsorLead(form, i18n.language);
      setSent(true);
    } catch (error) {
      captureError(error, { action: "submitSponsorLead" });
      toast(t("billing.advertise.form.sendError", { email: SUPPORT_EMAIL }), "error");
    } finally {
      setSending(false);
    }
  };

  const statItems = stats
    ? [
        { key: "profiles", value: stats.profiles },
        { key: "services", value: stats.services },
        { key: "events", value: stats.events },
      ].filter((item) => typeof item.value === "number" && item.value > 0)
    : [];

  const numberFormat = new Intl.NumberFormat(i18n.language);
  const errorText = (key) =>
    errors[key] ? (
      <p id={`lead-${key}-error`} role="alert" className="mt-1.5 ml-0.5 text-xs font-semibold text-[var(--engine-accent)]">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `lead-${key}-error` } : {});

  return (
    <div className="mx-auto w-full max-w-4xl pb-6">
      <PageHeader
        eyebrow={t("billing.advertise.eyebrow")}
        title={t("billing.advertise.title")}
        subtitle={t("billing.advertise.subtitle")}
      />

      {/* Formatos */}
      <section aria-labelledby="advertise-formats" className="space-y-3">
        <h2 id="advertise-formats" className="text-base font-bold text-[var(--engine-text)]">
          {t("billing.advertise.formats.title")}
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {FORMAT_CARDS.map((item) => (
            <article key={item.key} className="engine-card flex flex-col p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
                <item.icon size={19} />
              </span>
              <h3 className="mt-4 text-sm font-bold text-[var(--engine-text)]">
                {t(`billing.advertise.formats.${item.key}.title`)}
              </h3>
              <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
                {t(`billing.advertise.formats.${item.key}.body`)}
              </p>
              <p className="mt-4 rounded-lg bg-[var(--engine-surface-2)] px-3 py-2 text-xs leading-relaxed text-[var(--engine-text-muted)]">
                {t(`billing.advertise.formats.${item.key}.rule`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Como fazemos */}
      <section className="engine-card mt-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--engine-text)]">{t("billing.advertise.rules.title")}</h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
              {["labeled", "organic", "checked", "price"].map((key) => (
                <li key={key} className="flex gap-2">
                  <span aria-hidden="true" className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-[var(--engine-text-muted)]" />
                  <span className="min-w-0">{t(`billing.advertise.rules.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Números do Engine — só o que o banco conta agora. */}
      {statItems.length > 0 && (
        <section aria-labelledby="advertise-stats" className="mt-6">
          <h2 id="advertise-stats" className="text-base font-bold text-[var(--engine-text)]">
            {t("billing.advertise.stats.title")}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {statItems.map((item) => (
              <div key={item.key} className="engine-card p-4">
                <p className="font-display text-2xl font-extrabold tracking-tight text-[var(--engine-text)]">
                  {numberFormat.format(item.value)}
                </p>
                <p className="mt-1 text-[13px] text-[var(--engine-text-muted)]">
                  {t(`billing.advertise.stats.${item.key}`)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--engine-text-muted)]">{t("billing.advertise.stats.note")}</p>
        </section>
      )}

      {/* Formulário */}
      <section aria-labelledby="advertise-form" className="engine-card mt-8 p-5 sm:p-6">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
              <CheckCircle2 size={24} />
            </span>
            <h2 id="advertise-form" className="text-lg font-bold text-[var(--engine-text)]">
              {t("billing.advertise.form.sentTitle")}
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-[var(--engine-text-muted)]">
              {t("billing.advertise.form.sentBody", { email: form.email.trim() })}
            </p>
            <Button
              variant="secondary"
              className="mt-2"
              onClick={() => {
                setForm({ ...EMPTY_FORM, email: user?.email || "" });
                setSent(false);
              }}
            >
              {t("billing.advertise.form.sendAnother")}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Megaphone size={20} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
              <div className="min-w-0">
                <h2 id="advertise-form" className="text-base font-bold text-[var(--engine-text)]">
                  {t("billing.advertise.form.title")}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--engine-text-muted)]">
                  {t("billing.advertise.form.subtitle")}
                </p>
              </div>
            </div>

            <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="lead-name" label={t("billing.advertise.form.name")}>
                  <input
                    id="lead-name"
                    type="text"
                    autoComplete="name"
                    maxLength={SPONSOR_LIMITS.name}
                    value={form.name}
                    onChange={update("name")}
                    className={fieldClass}
                    {...invalid("name")}
                  />
                  {errorText("name")}
                </Field>
                <Field id="lead-company" label={t("billing.advertise.form.company")}>
                  <input
                    id="lead-company"
                    type="text"
                    autoComplete="organization"
                    maxLength={SPONSOR_LIMITS.company}
                    value={form.company}
                    onChange={update("company")}
                    className={fieldClass}
                    {...invalid("company")}
                  />
                  {errorText("company")}
                </Field>
                <Field id="lead-email" label={t("billing.advertise.form.email")}>
                  <input
                    id="lead-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    maxLength={SPONSOR_LIMITS.email}
                    value={form.email}
                    onChange={update("email")}
                    className={fieldClass}
                    {...invalid("email")}
                  />
                  {errorText("email")}
                </Field>
                <Field
                  id="lead-whatsapp"
                  label={t("billing.advertise.form.whatsapp")}
                  optional={t("billing.advertise.form.optional")}
                >
                  <input
                    id="lead-whatsapp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={SPONSOR_LIMITS.whatsapp}
                    value={form.whatsapp}
                    onChange={update("whatsapp")}
                    className={fieldClass}
                  />
                </Field>
                <Field id="lead-city" label={t("billing.advertise.form.city")}>
                  <input
                    id="lead-city"
                    type="text"
                    autoComplete="address-level2"
                    maxLength={SPONSOR_LIMITS.city}
                    value={form.city}
                    onChange={update("city")}
                    className={fieldClass}
                    {...invalid("city")}
                  />
                  {errorText("city")}
                </Field>
                <Field
                  id="lead-state"
                  label={t("billing.advertise.form.state")}
                  optional={t("billing.advertise.form.optional")}
                >
                  <input
                    id="lead-state"
                    type="text"
                    autoComplete="address-level1"
                    maxLength={SPONSOR_LIMITS.state}
                    value={form.state}
                    onChange={update("state")}
                    className={fieldClass}
                  />
                </Field>
              </div>

              <Field id="lead-format" label={t("billing.advertise.form.format")}>
                <select
                  id="lead-format"
                  value={form.format}
                  onChange={update("format")}
                  className={fieldClass}
                >
                  {SPONSOR_FORMATS.map((key) => (
                    <option key={key} value={key}>
                      {t(`billing.advertise.form.formats.${key}`)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                id="lead-message"
                label={t("billing.advertise.form.message")}
                optional={t("billing.advertise.form.optional")}
                hint={t("billing.advertise.form.messageHint")}
              >
                <textarea
                  id="lead-message"
                  rows={4}
                  maxLength={SPONSOR_LIMITS.message}
                  value={form.message}
                  onChange={update("message")}
                  className={`${fieldClass} resize-y`}
                />
              </Field>

              {/* Isca: fora da tela e fora da ordem de tabulação. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label htmlFor="lead-website">Website</label>
                <input
                  id="lead-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={update("website")}
                />
              </div>

              <div>
                <label
                  htmlFor="lead-consent"
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3.5 text-[13px] leading-relaxed text-[var(--engine-text)]"
                >
                  <input
                    id="lead-consent"
                    type="checkbox"
                    checked={form.consent}
                    onChange={update("consent")}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--engine-accent)]"
                    {...invalid("consent")}
                  />
                  <span className="min-w-0">
                    <Trans
                      i18nKey="billing.advertise.form.consent"
                      components={{
                        privacy: (
                          <Link
                            to="/privacidade"
                            target="_blank"
                            className="font-semibold underline underline-offset-2"
                          />
                        ),
                      }}
                    />
                  </span>
                </label>
                {errorText("consent")}
              </div>

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-[var(--engine-text-muted)]">
                  {t("billing.advertise.form.emailAlt", { email: SUPPORT_EMAIL })}
                </p>
                <Button type="submit" size="lg" disabled={sending} className="w-full shrink-0 sm:w-auto">
                  {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                  {t("billing.advertise.form.submit")}
                </Button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
