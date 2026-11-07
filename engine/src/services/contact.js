/**
 * Os endereços de e-mail do Engine — um lugar só.
 *
 * Até 07/11/2026 o Gmail pessoal do Murilo (`muxdtuber@gmail.com`) estava
 * escrito à mão em SEIS lugares públicos: o rodapé, os Termos, a Política de
 * privacidade, Configurações › Sobre, a página /anuncie e o `billing.js`.
 * Trocar o e-mail do app era caçar string, e esquecer um deixava o endereço
 * antigo no ar para sempre.
 *
 * Agora é aqui. E a virada para o domínio é UMA linha: `DOMINIO_NO_AR`.
 *
 * Por que não trocar logo: enquanto o MX de `enginegarage.com.br` não estiver
 * respondendo, publicar `contato@enginegarage.com.br` nos Termos é publicar um
 * endereço que devolve erro — pior do que um Gmail pessoal. O dia em que o
 * encaminhamento entregar o primeiro e-mail de teste, este `false` vira
 * `true` e os seis lugares mudam juntos.
 *
 * Ver SETUP-EMAILS.md para quem entrega o quê (receber: Cloudflare Email
 * Routing; enviar: Resend).
 */

/** Vira `true` quando o e-mail do domínio entregar o primeiro teste. */
const DOMINIO_NO_AR = false;

/** O Gmail da marca, dono das contas (Stripe, Supabase, Netlify, redes). */
export const ENGINE_GMAIL = "enginegarage.app@gmail.com";

/** Endereço provisório: o Gmail pessoal, que é o que está publicado hoje. */
const PROVISORIO = "muxdtuber@gmail.com";

const noDominio = (caixa) => (DOMINIO_NO_AR ? `${caixa}@enginegarage.com.br` : PROVISORIO);

/** Contato geral: rodapé, Termos, /anuncie, chave Pix. */
export const CONTACT_EMAIL = noDominio("contato");

/** Atendimento do app: cobrança, arrependimento, problema de conta. */
export const SUPPORT_EMAIL = noDominio("suporte");

/** Canal do titular de dados (LGPD) — citado na Política de privacidade. */
export const PRIVACY_EMAIL = noDominio("privacidade");

/** Comercial: pacotes de anúncio, patrocínio, parceria. */
export const ADS_EMAIL = noDominio("anuncie");

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
export const PRIVACY_MAILTO = `mailto:${PRIVACY_EMAIL}`;
