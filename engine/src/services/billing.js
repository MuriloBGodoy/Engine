import { supabase } from "./supabase";
// O catálogo é um só: o mesmo arquivo que a função de checkout usa para
// cobrar. A tela de Planos lê os preços daqui para nunca mostrar um valor e
// cobrar outro.
import {
  FOUNDER_SLOTS,
  OFFERS,
  PRO_TRIAL_DAYS,
  SELLABLE_COUNTRIES,
  currencyForCountry,
  isSellableCountry,
  priceFor,
  toMajorUnits,
} from "../../netlify/functions/lib/plans.js";

export {
  FOUNDER_SLOTS,
  OFFERS,
  PRO_TRIAL_DAYS,
  SELLABLE_COUNTRIES,
  currencyForCountry,
  isSellableCountry,
  priceFor,
};

/** Chave publicável do Stripe. Vazia = assinatura ainda não aberta. */
export const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";

/** Chave Pix para doação. Vazia = a seção do Pix não aparece. */
export const SUPPORT_PIX_KEY = (import.meta.env.VITE_SUPPORT_PIX_KEY || "").trim();

/**
 * Canal de atendimento: arrependimento, dúvida de cobrança, proposta comercial.
 * O mesmo endereço que o rodapé, os Termos e a Privacidade já declaram.
 */
export const SUPPORT_EMAIL = "muxdtuber@gmail.com";

// Moedas em que centavo não aparece na vitrine: "$ 8.900", não "$ 8.900,00".
const WHOLE_UNIT_DISPLAY = ["CLP", "COP", "ARS"];

/**
 * Valor como vai ao Stripe (centavos, ou unidade no CLP) → texto de moeda no
 * idioma da tela: R$ 79,90 · US$ 19,90 · CLP 8.990.
 */
export function formatPrice(amount, language = "pt-BR", currency = "BRL") {
  const whole = WHOLE_UNIT_DISPLAY.includes(currency);
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency,
    ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  }).format(toMajorUnits(amount, currency));
}

/**
 * País salvo no perfil, lido do mesmo lugar e do mesmo jeito que a função de
 * checkout lê (user_private/settings, sem preencher padrão). "" quando a
 * pessoa nunca salvou um país — aí o servidor usa a região de navegação, e a
 * tela também.
 */
export async function fetchProfileCountry(userId) {
  if (!userId) return "";
  const { data, error } = await supabase
    .from("user_private")
    .select("data")
    .eq("user_id", String(userId))
    .eq("doc_id", "settings")
    .maybeSingle();
  if (error) throw error;
  return String(data?.data?.profile?.country || "").trim().toUpperCase();
}

/** Data por extenso no idioma da tela, para "primeira cobrança em …". */
export function formatLongDate(date, language = "pt-BR") {
  return new Date(date).toLocaleDateString(language, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Dia em que o teste grátis do Pro acaba, se começasse agora. */
export function trialEndFromNow(days = PRO_TRIAL_DAYS) {
  const end = new Date();
  end.setDate(end.getDate() + days);
  return end;
}

// --- Anuncie: formatos e pedidos ----------------------------------------------

export const SPONSOR_FORMATS = ["city", "event", "featured", "other"];

/** Limites espelhados dos `check` da tabela `sponsor_leads`. */
export const SPONSOR_LIMITS = {
  name: 120,
  company: 160,
  email: 254,
  whatsapp: 30,
  city: 120,
  state: 60,
  message: 2000,
};

/**
 * Grava um pedido de patrocínio. A tabela aceita insert de visitante e de
 * logado, mas ninguém do público lê de volta — por isso o insert vai sem
 * `.select()` (pedir a linha de volta exigiria permissão de leitura).
 */
export async function submitSponsorLead(lead, language) {
  const clean = (value, max) => String(value || "").trim().slice(0, max);
  const row = {
    name: clean(lead.name, SPONSOR_LIMITS.name),
    company: clean(lead.company, SPONSOR_LIMITS.company),
    email: clean(lead.email, SPONSOR_LIMITS.email).toLowerCase(),
    whatsapp: clean(lead.whatsapp, SPONSOR_LIMITS.whatsapp) || null,
    city: clean(lead.city, SPONSOR_LIMITS.city),
    state: clean(lead.state, SPONSOR_LIMITS.state) || null,
    format: SPONSOR_FORMATS.includes(lead.format) ? lead.format : "other",
    message: clean(lead.message, SPONSOR_LIMITS.message),
    consent: lead.consent === true,
    locale: clean(language, 10) || null,
  };
  const { error } = await supabase.from("sponsor_leads").insert(row);
  if (error) throw error;
}

/**
 * Números do Engine para quem pensa em patrocinar — contados no banco agora,
 * só com o que a RLS já deixa qualquer visitante ler. Nada digitado à mão: o
 * que falhar ou der zero simplesmente não aparece.
 */
export async function fetchSponsorStats() {
  const count = async (query) => {
    const { count: total, error } = await query;
    return error ? null : total;
  };

  const [profiles, services, events] = await Promise.all([
    count(supabase.from("public_profiles").select("*", { count: "exact", head: true })),
    count(
      supabase
        .from("service_listings")
        .select("*", { count: "exact", head: true })
        .eq("moderation_status", "approved"),
    ),
    count(supabase.from("events").select("*", { count: "exact", head: true })),
  ]);

  return { profiles, services, events };
}
