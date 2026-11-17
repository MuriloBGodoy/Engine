// O APELIDO DO CARRO E O ENDEREÇO QUE SAI DELE.
//
// Muita gente que usa o Engine já tem conta de TikTok e de Instagram com o
// nome que deu ao carro, não com o próprio nome. O carro tem público antes de
// ter página. Então o endereço público dele deixou de ser uma montagem da
// máquina ("/carro/chevrolet-corsa-wind-2002") e passou a ser escolhido:
// "/carro/bruxa", o mesmo @ que a pessoa já divulga.
//
// DUAS COISAS DIFERENTES, e vale não confundir:
//
//   apelido ("Bruxa", "Corsinha da vó")  — nome de exibição. Livre, com
//       acento, espaço e maiúscula. Não é único: dois carros podem se chamar
//       Bruxa, como duas pessoas podem se chamar João.
//   endereço ("bruxa")  — o @ do carro. Único no app inteiro, minúsculo, sem
//       acento. Quem garante a unicidade é o banco (`set_car_slug`).
//
// É a mesma divisão de "nome" e "@" do Instagram, e pelo mesmo motivo: o nome
// é para ler, o @ é para digitar e para caber num link.
//
// As regras de formato aqui são a CÓPIA das do banco
// (`car_slug_ok`, em 20261114120000_car_nickname.sql). Elas existem dos dois
// lados de propósito: aqui para a pessoa saber do erro enquanto digita, lá
// porque validação que só roda no navegador não é validação.

/** O apelido limpo, do jeito que vai ser guardado e mostrado. */
export function limparApelido(valor = "") {
  return String(valor)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

const SEM_ACENTO = (valor = "") =>
  String(valor)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * O endereço sugerido a partir de um apelido: "Corsinha da Vó" → "corsinha-da-vo".
 *
 * Mesma conta do `slugify_text` do banco, para a sugestão que a tela mostra
 * ser exatamente o que o banco vai gravar.
 */
export function enderecoDeApelido(apelido = "") {
  return SEM_ACENTO(apelido)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

/**
 * O que a pessoa digita no campo de endereço, filtrado tecla a tecla.
 *
 * Deixa o alfabeto passar e barra o resto, sem reordenar nem apagar o que já
 * está escrito — inclusive pontuação no fim, que é estado legítimo de quem
 * está no meio de "food.truck". A recusa de pontuação solta é da validação,
 * não daqui: campo que apaga a tecla recém-digitada parece travado.
 */
export function mascaraEndereco(valor = "") {
  return SEM_ACENTO(valor)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 30);
}

/** Nomes que um carro não pode tomar — ver o porquê na migração. */
export const ENDERECOS_RESERVADOS = [
  "engine",
  "enginegarage",
  "engine-garage",
  "garage",
  "garagem",
  "admin",
  "administrador",
  "moderacao",
  "moderation",
  "suporte",
  "support",
  "oficial",
  "official",
  "ajuda",
  "help",
  "api",
  "carro",
  "car",
  "novo",
  "new",
];

// 3 a 30, começa e termina em letra ou número, pontuação sempre entre dois
// caracteres do alfabeto (nada de ".bruxa", "bruxa-" nem "bru--xa").
const FORMATO = /^[a-z0-9](?:[a-z0-9]|[._-](?![._-]))*[a-z0-9]$/;

/**
 * O endereço serve? Devolve `""` quando serve, ou o id do problema:
 * "short" | "long" | "chars" | "letters" | "edges" | "reserved".
 *
 * Devolve o MOTIVO, e não `false`, porque "endereço inválido" não ajuda
 * ninguém a consertar — a tela precisa poder dizer qual é a regra que falhou.
 */
export function problemaDoEndereco(valor = "") {
  const v = String(valor || "").trim();
  if (v.length < 3) return "short";
  if (v.length > 30) return "long";
  if (/[^a-z0-9._-]/.test(v)) return "chars";
  if (!/[a-z]/.test(v)) return "letters";
  if (!FORMATO.test(v)) return "edges";
  if (ENDERECOS_RESERVADOS.includes(v)) return "reserved";
  return "";
}

export const enderecoValido = (valor = "") => problemaDoEndereco(valor) === "";
