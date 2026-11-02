/**
 * Contas puras do visual da Loja, da página profissional e do Anunciar.
 *
 * Só o que os componentes de `components/shop/` precisam. Casar peça com
 * carro, formatar preço de produto e o rótulo do "serve em" são do
 * `services/shops.js` (Han) — aqui não se duplica isso.
 */

/**
 * Sugere o @ a partir do nome: "Garagem 47 Performance" vira
 * "garagem47performance", cortado em 24. A pessoa pode trocar.
 */
export function handleFromName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

/**
 * Iniciais do logo quando não há imagem: duas palavras, número entra inteiro
 * (até 2 dígitos). "Garagem 47 Performance" vira "G47".
 */
export function profileInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => (/^\d+$/.test(word) ? word.slice(0, 2) : word[0].toUpperCase()))
    .join("");
}

/**
 * Mensagem pronta do contato (Engine ou WhatsApp), no texto aprovado no
 * protótipo: produto pergunta se ainda está disponível (com o preço, se
 * houver); serviço pede orçamento (com o carro, se houver); sem anúncio, só
 * se apresenta.
 */
export function prefilledMessage({ kind, title, price, carName } = {}, t) {
  const name = String(title || "").trim();
  if (kind === "product" && name) {
    return price ? t("shop.message.productPrice", { title: name, price }) : t("shop.message.product", { title: name });
  }
  if (kind === "service" && name) {
    return carName ? t("shop.message.serviceCar", { title: name, car: carName }) : t("shop.message.service", { title: name });
  }
  return t("shop.message.page");
}

/** Link do WhatsApp com a mensagem; undefined sem número válido. */
export function whatsAppLink(phone, message) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message || "")}`;
}

/** Máscara brasileira do campo de WhatsApp: (11) 98765-4321 */
export function maskBrPhone(value) {
  const n = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (n.length > 6) return `(${n.slice(0, 2)}) ${n.slice(2, n.length - 4)}-${n.slice(-4)}`;
  if (n.length > 2) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return n;
}

/** 1200 -> "1,2 mil" no pt-BR, "1.2K" no en-US. */
export function compactCount(value, locale = "pt-BR") {
  const n = Number(value) || 0;
  try {
    return n.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 });
  } catch {
    return String(n);
  }
}
