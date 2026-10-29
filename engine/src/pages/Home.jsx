import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowUpRight, Car, LayoutDashboard, Users } from "lucide-react";
import { Button } from "../components/Button";
import { AdSlot } from "../components/AdSlot";
import { VisitorHome } from "../components/home/VisitorHome";

/**
 * "/" mostra duas telas: a vitrine para quem não entrou (VisitorHome) e os
 * atalhos de sempre para quem já tem conta.
 */
export function Home({ user }) {
  if (!user) return <VisitorHome />;
  return <MemberHome />;
}

function MemberHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const shortcuts = [
    { to: "/garagem", icon: Car, title: t("nav.garage"), desc: t("home.links.garage") },
    { to: "/dashboard", icon: LayoutDashboard, title: t("nav.dashboard"), desc: t("home.links.dashboard") },
    { to: "/community", icon: Users, title: t("nav.community"), desc: t("home.links.community") },
  ];

  return (
    <div className="relative flex flex-1 flex-col justify-center overflow-hidden py-6 sm:py-10">
      {/* Glow de acento sutil atrás do título — decorativo, não captura clique */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-[420px] max-w-4xl opacity-70"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, var(--engine-accent-soft), transparent 70%)",
        }}
      />

      <section className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <h1
          className="engine-rise mb-5 font-display font-black uppercase italic leading-[0.9] tracking-tight text-[var(--engine-text)]"
          style={{ fontSize: "clamp(2.75rem, 11vw, 6rem)", animationDelay: "0.06s" }}
        >
          Engine <span className="text-[var(--engine-accent)]">Garage</span>
        </h1>

        <p
          className="engine-rise mb-8 max-w-xl text-balance text-base font-medium leading-relaxed text-[var(--engine-text-muted)] sm:text-lg"
          style={{ animationDelay: "0.12s" }}
        >
          {t("home.subtitle")}
        </p>

        <div
          className="engine-rise flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center"
          style={{ animationDelay: "0.18s" }}
        >
          <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate("/garagem")}>
            {t("home.cta")}
            <ArrowRight size={18} />
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => navigate("/dashboard")}
          >
            {t("home.ctaSecondary")}
          </Button>
        </div>
      </section>

      <section
        className="engine-rise mx-auto mt-12 grid w-full max-w-4xl grid-cols-1 gap-3 sm:mt-16 sm:grid-cols-3 sm:gap-4"
        style={{ animationDelay: "0.24s" }}
      >
        {shortcuts.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="engine-card engine-card-hover group flex items-start gap-3 p-4 text-left sm:flex-col sm:gap-4 sm:p-5"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
              <item.icon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-[var(--engine-text)]">{item.title}</h3>
                <ArrowUpRight
                  size={15}
                  className="shrink-0 text-[var(--engine-text-subtle)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--engine-accent)]"
                />
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
                {item.desc}
              </p>
            </div>
          </Link>
        ))}
      </section>

      {/* Âncora discreta no rodapé — só aparece para quem não é premium. */}
      <AdSlot slot="home-footer" format="horizontal" className="mx-auto mt-12 max-w-4xl" />
    </div>
  );
}
