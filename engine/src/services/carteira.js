// Os dados da Carteira de Garagem.
//
// Nada aqui é digitado por ninguém: tudo sai do que a pessoa já fez no
// Engine. É essa a graça — quem quiser mudar o que está na carteira muda a
// própria conta, não a carteira.
//
// **Ela é um documento DA PESSOA, não de um carro** (15/11/2026). Até aqui
// quatro dos seis campos eram de um carro só — combustível, câmbio, potência
// e preparação —, o que obrigava a escolher um carro antes de ver a carteira
// e a escondia inteira de quem não tinha nenhum na vitrine. Era a ficha
// técnica fantasiada de documento. Virou identidade: quanto tempo de casa,
// quantos carros, quanto a comunidade te conhece.
//
// Onde cada campo nasce:
//
//   Número      hash do id da conta (estável, e NÃO é o id)
//   Desde       data em que a conta foi criada
//   Garagem     carros abertos para a comunidade
//   Posts       publicações feitas
//   Seguidores  quem acompanha
//   Conquistas  marcos desbloqueados
//   UF          estado do perfil
//   Classe      a preparação mais alta da garagem — o que a pessoa curte
//
// Campo sem resposta vira "—", nunca palpite.

import { stageLabel } from "../components/specsheet/labels";

/**
 * O número da carteira é a ORDEM DE ENTRADA: nº 1 é quem chegou primeiro.
 *
 * Vem do banco (`my_member_number`, migration 20261115120000), atribuído uma
 * vez e nunca mais mexido — nem quando alguém apaga a conta, senão quem
 * imprimiu a carteira com o nº 7 viraria o 6. Ver a migration para o resto
 * do porquê.
 *
 * Três dígitos no mínimo porque "nº 3" parece erro de carregamento e "nº 003"
 * parece série — e é série mesmo.
 */
export const formatarNumero = (n) => `Nº ${String(Math.max(1, Number(n) || 0)).padStart(3, "0")}`;

/**
 * O número antigo, de reserva: "EG-4821".
 *
 * Fica para quando o banco ainda não respondeu (a carteira abre antes) e
 * para quem abre sem conta. É um hash do id — ninguém volta dele para o id,
 * e colisão não tem consequência (não é chave de nada).
 */
export function numeroDaCarteira(uid = "") {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i += 1) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = (Math.abs(h) % 9999) + 1;
  return `EG-${String(n).padStart(4, "0")}`;
}

const mesAno = (iso, idioma) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(idioma, { month: "2-digit", year: "numeric" });
};

const dia = (iso, idioma) => {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(idioma, { day: "2-digit", month: "2-digit", year: "numeric" });
};

// Da mais parada para a mais preparada. A carteira mostra a MAIOR da
// garagem: é o teto do que a pessoa já mexeu, e é disso que ela fala.
const ORDEM_CLASSE = ["stock", "stage1", "stage2", "stage3", "race"];

const classeDaGaragem = (carros = []) => {
  let melhor = "";
  for (const carro of carros) {
    const stage = carro?.stage || carro?.specs?.stage || "";
    if (ORDEM_CLASSE.indexOf(stage) > ORDEM_CLASSE.indexOf(melhor)) melhor = stage;
  }
  return melhor;
};

/**
 * A assinatura do rodapé. Quem escolhe é a pessoa (`firma`):
 *
 *   "nome"   o primeiro nome — o que estava aqui desde sempre
 *   "handle" o @ sem o arroba — porque muita gente é conhecida pelo @ e não
 *            pelo nome, e assinar como se chama é o ponto de uma assinatura
 */
export function textoDaFirma({ firma = "nome", nome = "", handle = "" }) {
  const arroba = String(handle || "").replace(/^@+/, "").trim();
  if (firma === "handle" && arroba) return arroba;
  const primeiro = String(nome || "").trim().split(/\s+/)[0];
  return primeiro || arroba || "Engine";
}

/**
 * Monta a carteira.
 *
 * `carros` é a garagem pública da pessoa — serve para contar e para dizer a
 * classe, nunca para falar de um carro específico.
 */
export function montarCarteira({
  perfil,
  carros = [],
  criadoEm = "",
  posts = 0,
  seguidores = 0,
  conquistas = 0,
  numero = 0,
  firma = "nome",
  t,
  idioma = "pt-BR",
}) {
  const traco = t("carteira.unknown");
  const classe = classeDaGaragem(carros);
  const nome = perfil?.displayName || perfil?.author || traco;
  const handle = perfil?.username ? `@${String(perfil.username).replace(/^@+/, "")}` : "";

  // A piada do rodapé, agora sobre a pessoa e não sobre um câmbio: quem não
  // abriu carro nenhum ainda está "em exame".
  const restricoes = carros.length
    ? t("carteira.restrictionNone")
    : t("carteira.restrictionLearner");

  return {
    numero: numero > 0 ? formatarNumero(numero) : numeroDaCarteira(perfil?.userId || perfil?.id || ""),
    nome,
    handle,
    cidade: [perfil?.city, perfil?.state].filter(Boolean).join(" · "),
    avatar: perfil?.avatar || perfil?.photoURL || "",
    desde: mesAno(criadoEm, idioma) || traco,
    emissao: dia("", idioma),
    gar: String(carros.length || 0),
    posts: String(posts || 0),
    seguidores: String(seguidores || 0),
    conquistas: String(conquistas || 0),
    uf: perfil?.state || carros.find((carro) => carro?.state)?.state || traco,
    classe: classe ? stageLabel(t, classe) : traco,
    restricoes,
    firma: textoDaFirma({ firma, nome, handle }),
  };
}
