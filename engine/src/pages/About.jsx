import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  Calculator,
  Camera,
  Car,
  Mail,
  Receipt,
  Search,
  Users,
  Wrench,
} from "lucide-react";
import { FaInstagram } from "react-icons/fa6";
import { PageHeader } from "../components/PageHeader";
import { LogoMark } from "../components/Logo";
import { CONTACT_MAILTO } from "../services/contact";
import { ENGINE_SOCIAL, INSTAGRAM_HANDLE, temRede } from "../services/social";
import "../services/i18n-about";

/**
 * /sobre — a página institucional.
 *
 * O rodapé declarava este link desde 25/09/2026 com destino vazio, então o
 * item simplesmente não aparecia. Antes de lançar ele passa a existir, porque
 * é o que falta para quem chega pelo Instagram: o link da bio leva a um app
 * que pede conta, e não havia nenhuma página dizendo o que é isto aqui e
 * quem está por trás.
 *
 * O texto é o manifesto da marca, não uma versão nova: mesma voz do post de
 * lançamento ("Todo sonho precisa de um motor"), para quem vem do Instagram
 * reconhecer onde caiu.
 *
 * A seção "Como o Engine se paga" é de propósito. Todo app gratuito carrega a
 * pergunta de onde vem o dinheiro, e quem não responde deixa a resposta por
 * conta da imaginação de quem lê — normalmente "vendem meus dados". Aqui a
 * conta é dita em duas frases, e ela é verdade: ver ROADMAP.md.
 */

const PROBLEMAS = [
  { key: "lost", Icon: Camera },
  { key: "noise", Icon: Users },
  { key: "word", Icon: Search },
  { key: "cost", Icon: Receipt },
];

const PILARES = [
  { key: "garage", Icon: Car },
  { key: "community", Icon: CalendarDays },
  { key: "services", Icon: Wrench },
  { key: "cost", Icon: Calculator },
];

export function About({ user = null }) {
  const { t } = useTranslation();

  useEffect(() => {
    const anterior = document.title;
    document.title = `${t("about.eyebrow")} · Engine`;
    return () => {
      document.title = anterior;
    };
  }, [t]);

  return (
    <div className="mx-auto w-full max-w-4xl pb-6">
      <PageHeader eyebrow={t("about.eyebrow")} title={t("about.title")} subtitle={t("about.subtitle")} />

      {/* Por que existe */}
      <section aria-labelledby="sobre-porque" className="engine-card p-5 sm:p-6">
        <h2 id="sobre-porque" className="text-base font-bold text-[var(--engine-text)]">
          {t("about.why.title")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--engine-text-muted)]">{t("about.why.lead")}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {PROBLEMAS.map((item) => (
            <article
              key={item.key}
              className="flex gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4"
            >
              <item.Icon size={18} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
              <div className="min-w-0">
                <h3 className="text-[13px] font-bold text-[var(--engine-text)]">
                  {t(`about.why.${item.key}.title`)}
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
                  {t(`about.why.${item.key}.body`)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Os quatro pilares, do mesmo tamanho na tela porque são do mesmo peso
          no produto. Um deles maior já contaria outra história. */}
      <section aria-labelledby="sobre-pilares" className="mt-6">
        <h2 id="sobre-pilares" className="text-base font-bold text-[var(--engine-text)]">
          {t("about.pillars.title")}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
          {t("about.pillars.lead")}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PILARES.map((item) => (
            <article key={item.key} className="engine-card flex flex-col p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
                <item.Icon size={19} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-bold text-[var(--engine-text)]">
                {t(`about.pillars.${item.key}.title`)}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
                {t(`about.pillars.${item.key}.body`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Como se paga */}
      <section aria-labelledby="sobre-dinheiro" className="engine-card mt-6 p-5 sm:p-6">
        <h2 id="sobre-dinheiro" className="text-base font-bold text-[var(--engine-text)]">
          {t("about.money.title")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--engine-text-muted)]">{t("about.money.body")}</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--engine-text-muted)]">{t("about.money.body2")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/planos"
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--engine-border)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
          >
            {t("about.money.plans")}
          </Link>
          <Link
            to="/apoie"
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--engine-border)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
          >
            {t("about.money.support")}
          </Link>
        </div>
      </section>

      {/* Quem faz */}
      <section aria-labelledby="sobre-quem" className="engine-card mt-6 p-5 sm:p-6">
        <h2 id="sobre-quem" className="text-base font-bold text-[var(--engine-text)]">
          {t("about.who.title")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--engine-text-muted)]">{t("about.who.body")}</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--engine-text-muted)]">{t("about.who.body2")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={CONTACT_MAILTO}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
          >
            <Mail size={16} aria-hidden="true" />
            {t("about.who.contact")}
          </a>
          {/* A rede some sozinha enquanto não existir endereço (services/social.js). */}
          {temRede(ENGINE_SOCIAL.instagram) && (
            <a
              href={ENGINE_SOCIAL.instagram}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
            >
              <FaInstagram size={16} aria-hidden="true" />
              {INSTAGRAM_HANDLE}
            </a>
          )}
        </div>
      </section>

      {/* Fechamento. Quem já entrou não precisa de "criar conta": para essa
          pessoa o convite é ir ver a comunidade. */}
      <section className="engine-card mt-6 flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <LogoMark size={34} />
          <div className="min-w-0">
            <p className="font-display text-lg font-extrabold italic uppercase tracking-tight text-[var(--engine-text)]">
              {t("about.cta.title")}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
              {t("about.cta.body")}
            </p>
          </div>
        </div>
        <Link
          to={user ? "/community" : "/register"}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] px-5 text-[13px] font-bold text-white transition hover:brightness-110 sm:w-auto"
        >
          {user ? t("about.cta.secondary") : t("about.cta.primary")}
        </Link>
      </section>
    </div>
  );
}

export default About;
