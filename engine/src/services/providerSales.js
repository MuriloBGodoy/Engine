import { must, supabase } from "./supabase";

/**
 * "Quanto eu vendi com o Engine?" — migration 20261123130000_provider_sales.
 *
 * Duas metades que nunca se misturam, e é de propósito:
 *
 *   `fetchProviderResults` — O QUE O ENGINE MEDIU. Aparição, abertura,
 *   contato, orçamento respondido e orçamento ganho. Vem do banco, não dá
 *   para editar, e é a parte em que o prestador pode confiar sem conferir.
 *
 *   `listSales` e companhia — O QUE O PRESTADOR REGISTROU. O Engine não
 *   processa o pagamento do serviço: não existe aqui nenhum número que
 *   signifique "esta oficina faturou tanto". Então o valor fechado é digitado
 *   por quem fechou. Chamar isso de "faturamento do Engine" seria mentira —
 *   e mentira que o dono descobre na primeira conferência com o caixa.
 *
 * Quem lê e escreve é dono ou admin do perfil profissional. Nem editor da
 * equipe, nem a moderação: venda é dado de caixa.
 */

const PERIODOS = {
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

/** AAAA-MM-DD no fuso de São Paulo — o "hoje" do prestador brasileiro. */
export const isoDay = (data) => {
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
};

/** Primeiro dia do período. "all" volta a 2000: antes do Engine existir. */
export const periodStart = (periodo = "30d", hoje = new Date()) => {
  const dias = PERIODOS[periodo];
  if (!dias) return "2000-01-01";
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - (dias - 1));
  return isoDay(inicio);
};

export const PERIOD_OPTIONS = ["30d", "90d", "12m", "all"];

export const saleFromRow = (row = {}) => ({
  id: row.id,
  profileId: row.profile_id,
  registeredBy: row.registered_by,
  listingId: row.listing_id || "",
  quoteRequestId: row.quote_request_id || null,
  amount: Number(row.amount) || 0,
  currency: row.currency || "BRL",
  soldOn: row.sold_on,
  label: row.label || "",
  note: row.note || "",
  createdAt: row.created_at,
});

/**
 * O painel inteiro numa pergunta só: medido, registrado, mês a mês e os
 * orçamentos ganhos que ainda não viraram venda.
 */
export const fetchProviderResults = async (profileId, { from, to } = {}) =>
  must(
    await supabase.rpc("provider_results", {
      p_profile: profileId,
      p_from: from || periodStart("30d"),
      ...(to ? { p_to: to } : {}),
    }),
  );

/** O caderno, da venda mais recente para a mais antiga. */
export const listSales = async (profileId, { from, to, limit = 200 } = {}) => {
  let pedido = supabase
    .from("provider_sales")
    .select("*")
    .eq("profile_id", profileId)
    .order("sold_on", { ascending: false })
    .limit(limit);
  if (from) pedido = pedido.gte("sold_on", from);
  if (to) pedido = pedido.lte("sold_on", to);
  return (must(await pedido) || []).map(saleFromRow);
};

const limparVenda = (venda) => ({
  amount: Math.max(0, Math.round((Number(venda.amount) || 0) * 100) / 100),
  currency: String(venda.currency || "BRL").slice(0, 3).toUpperCase(),
  sold_on: venda.soldOn || isoDay(new Date()),
  label: String(venda.label || "").trim().slice(0, 120),
  note: String(venda.note || "").trim().slice(0, 500),
  listing_id: venda.listingId || null,
  quote_request_id: venda.quoteRequestId || null,
});

export const addSale = async (profileId, venda) =>
  saleFromRow(
    must(
      await supabase
        .from("provider_sales")
        // `registered_by` NÃO vai daqui: quem carimba é o trigger, com
        // `auth.uid()`. A política confere a linha depois do trigger, então
        // mandar o campo só daria a chance de mandar errado.
        .insert({ profile_id: profileId, ...limparVenda(venda) })
        .select("*")
        .single(),
    ),
  );

export const updateSale = async (saleId, venda) =>
  saleFromRow(
    must(
      await supabase.from("provider_sales").update(limparVenda(venda)).eq("id", saleId).select("*").single(),
    ),
  );

export const deleteSale = async (saleId) =>
  must(await supabase.from("provider_sales").delete().eq("id", saleId).select("id"));

/** Dinheiro na moeda da venda, no idioma de quem está lendo. */
export const formatMoney = (valor, locale = "pt-BR", currency = "BRL") => {
  const numero = Number(valor) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: numero % 1 === 0 ? 0 : 2,
    }).format(numero);
  } catch {
    return `R$ ${numero.toFixed(2)}`;
  }
};

/**
 * De "1.250,90" ou "1250.90" para 1250.9. O prestador digita como fala, e
 * cada país fala diferente — não dá para confiar no `type="number"` sozinho.
 */
export const parseMoney = (bruto) => {
  const texto = String(bruto ?? "").trim();
  if (!texto) return null;
  const limpo = texto.replace(/[^\d.,-]/g, "");
  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");
  let normalizado = limpo;
  if (temVirgula && temPonto) {
    // O último separador é o decimal: "1.250,90" e "1,250.90" dão o mesmo.
    normalizado =
      limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
        ? limpo.replace(/\./g, "").replace(",", ".")
        : limpo.replace(/,/g, "");
  } else if (temVirgula) {
    normalizado = limpo.replace(",", ".");
  }
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? Math.round(valor * 100) / 100 : null;
};
