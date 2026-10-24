import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { auth } from "../services/supabase";
import { useIsPremium } from "../hooks/useIsPremium";
import { useAdsConsent } from "../services/consent";

/**
 * Espaço de anúncio do Engine. Discreto por princípio (âncora/rodapé/nativo,
 * nunca pop-up) e provider-agnostic: hoje o motor é o Google AdSense, amanhã
 * pode virar Ad Manager ou venda direta sem tocar nas páginas.
 *
 * Padrão inspirado nos marketplaces automotivos (Webmotors & cia.):
 *  - "horizontal" — banner âncora (topo/rodapé).
 *  - "rectangle"  — retângulo de lateral (300x250) no trilho direito.
 *  - "native"     — card patrocinado que VESTE o formato dos cards do feed,
 *                   entrando no fluxo da grade em vez de um banner solto.
 *
 * Regras:
 *  - Premium não vê anúncio (nem o espaço em branco).
 *  - Sem AdSense configurado (dev/homologação), mostra um "house ad" que
 *    convida ao Premium — assim o layout é validado antes da conta existir.
 *  - O AdSense só carrega depois do "Aceitar" no aviso de cookies
 *    (ConsentBanner). Sem escolha, ou com "Rejeitar", o espaço some.
 *  - Todo espaço leva o rótulo "Anúncio" (CDC art. 36, CONAR, regra do AdSense).
 *
 * Uso: <AdSlot slot="community-feed" format="native" user={user} />
 */

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || "";
const ADSENSE_SLOT_DEFAULT = import.meta.env.VITE_ADSENSE_SLOT_DEFAULT || "";
const ADSENSE_SRC = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

let scriptRequested = false;

/** Injeta o script do AdSense uma única vez por sessão. */
function ensureAdSenseScript() {
  if (scriptRequested || typeof document === "undefined") return;
  scriptRequested = true;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `${ADSENSE_SRC}?client=${ADSENSE_CLIENT}`;
  document.head.appendChild(script);
}

const FORMAT = {
  // in-feed real (fluid) exige unidade "in-feed" própria + layout key; por ora
  // o slot padrão renderiza responsivo e o house ad já valida o visual nativo.
  horizontal: { box: "min-h-[90px]", adFormat: "horizontal" },
  rectangle: { box: "min-h-[250px]", adFormat: "rectangle" },
  native: { box: "min-h-[112px]", adFormat: "auto" },
};

function HouseAd({ format }) {
  const { t } = useTranslation();
  const isRectangle = format === "rectangle";
  return (
    <Link
      to="/planos"
      className={`engine-card engine-card-hover group flex overflow-hidden p-4 text-left ${
        isRectangle
          ? "min-h-[250px] flex-col items-center justify-center gap-3 text-center"
          : "items-center gap-4"
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
        <Sparkles size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[var(--engine-text)]">
          {t("ads.house.title")}
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
          {t("ads.house.desc")}
        </span>
      </span>
      <span className="shrink-0 rounded-lg bg-[var(--engine-accent)] px-3 py-1.5 text-[12px] font-bold text-white transition group-hover:brightness-95">
        {t("ads.house.cta")}
      </span>
    </Link>
  );
}

export function AdSlot({ slot = "default", format = "horizontal", user, className = "" }) {
  const { t } = useTranslation();
  const userId = user?.uid ?? auth.currentUser?.uid ?? null;
  const { isPremium, loading } = useIsPremium(userId);
  // Sem "Aceitar" no aviso de cookies, nenhum script do Google carrega.
  const consent = useAdsConsent();
  const insRef = useRef(null);

  const spec = FORMAT[format] || FORMAT.horizontal;
  const adSlotId = ADSENSE_SLOT_DEFAULT;
  const adsenseReady = Boolean(ADSENSE_CLIENT && adSlotId) && consent === "granted";

  useEffect(() => {
    if (!adsenseReady || isPremium || loading) return;
    ensureAdSenseScript();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // adsbygoogle ainda não carregou; o push acontece quando o script chegar.
    }
  }, [adsenseReady, isPremium, loading, slot]);

  // Premium não vê nada; enquanto carrega o plano, não reserva espaço.
  if (isPremium || loading) return null;

  // Sem AdSense, o convite ao Premium existe para validar o layout em DEV —
  // é o que diz o cabeçalho deste arquivo. Até 25/09/2026 ele aparecia também
  // em produção, que não tem AdSense (ROADMAP §7), com o rótulo "ANÚNCIO" e a
  // promessa "navegue sem anúncios e desbloqueie os Serviços" — sem anúncio
  // nenhum no app e com os Serviços abertos. Era a primeira coisa que um
  // usuário novo via depois de se cadastrar.
  if (!adsenseReady && !import.meta.env.DEV) return null;
  // Em DEV com AdSense configurado mas sem aceite, também não mostra nada.
  if (!adsenseReady && ADSENSE_CLIENT) return null;

  return (
    <div className={`w-full ${className}`}>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--engine-text-subtle)]">
        {t("ads.label")}
      </p>
      {adsenseReady ? (
        <ins
          key={slot}
          ref={insRef}
          className={`adsbygoogle block w-full ${spec.box}`}
          style={{ display: "block" }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={adSlotId}
          data-ad-format={spec.adFormat}
          data-full-width-responsive="true"
        />
      ) : (
        <HouseAd format={format} />
      )}
    </div>
  );
}
