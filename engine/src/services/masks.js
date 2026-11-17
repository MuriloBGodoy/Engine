// As máscaras do app, num lugar só.
//
// POR QUE ESTE ARQUIVO EXISTE. A formatação de telefone estava escrita duas
// vezes, em dois arquivos, com regras levemente diferentes — e o editor da
// conta profissional não tinha máscara nenhuma: o WhatsApp da oficina entrava
// como a pessoa digitasse. Campo que aceita qualquer forma vira dado que
// nenhuma busca acha e nenhum link abre.
//
// O QUE ENTRA AQUI: formato de coisa que tem formato oficial — telefone, CEP,
// placa, CPF, CNPJ. Número de dinheiro NÃO entra: ele depende de idioma e
// moeda e já é resolvido por `toLocaleString` nas telas que usam.
//
// Toda máscara aqui é "progressiva": formata enquanto a pessoa digita, sem
// nunca empurrar o cursor para trás nem recusar tecla. A validação é separada
// da máscara de propósito — um campo pela metade não é um campo errado, é um
// campo que ainda está sendo preenchido.

// Extensão explícita: assim `scripts/check-masks.mjs` roda este módulo no
// Node puro, sem o Vite no meio.
export { maskPhone, isPhoneValid, isPhoneValueValid, splitPhone } from "./phone.js";

export const onlyDigits = (valor = "") => String(valor).replace(/\D/g, "");

/** CEP: 01234-567. */
export function maskCEP(valor = "") {
  const d = onlyDigits(valor).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export const isCEPValid = (valor = "") => onlyDigits(valor).length === 8;

/** CPF: 123.456.789-09. */
export function maskCPF(valor = "") {
  const d = onlyDigits(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * CPF válido de verdade: confere os dois dígitos verificadores.
 *
 * Sem isto a máscara deixa passar "111.111.111-11", que tem a cara certa e
 * não é CPF de ninguém — é o erro clássico de quem só mascara.
 */
export function isCPFValid(valor = "") {
  const d = onlyDigits(valor);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // 000…, 111…, 222…
  for (let casa = 9; casa <= 10; casa += 1) {
    let soma = 0;
    for (let i = 0; i < casa; i += 1) soma += Number(d[i]) * (casa + 1 - i);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(d[casa])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// CNPJ
//
// Desde julho de 2026 o CNPJ pode ter LETRAS. Continuam 14 posições, mas as
// 12 primeiras são alfanuméricas e só os 2 dígitos verificadores seguem
// sendo número. Os CNPJs antigos, todos numéricos, continuam valendo.
//
// Isso muda a conta do dígito: cada posição vale o código ASCII do caractere
// menos 48 (então "0" = 0, "9" = 9, "A" = 17, "Z" = 42), e o módulo 11 roda
// em cima disso. Uma validação só-numérica reprovaria empresa aberta de 2026
// em diante — por isso está escrito assim desde já.
// ---------------------------------------------------------------------------

const limparCNPJ = (valor = "") =>
  String(valor).toUpperCase().replace(/[^0-9A-Z]/g, "");

/** CNPJ: 12.ABC.345/0001-99 — aceita letras nas 12 primeiras posições. */
export function maskCNPJ(valor = "") {
  const bruto = limparCNPJ(valor).slice(0, 14);
  // As duas últimas posições são sempre numéricas.
  const base = bruto.slice(0, 12);
  const dv = onlyDigits(bruto.slice(12)).slice(0, 2);
  const partes = [base.slice(0, 2), base.slice(2, 5), base.slice(5, 8), base.slice(8, 12)];
  let saida = partes[0];
  if (partes[1]) saida += `.${partes[1]}`;
  if (partes[2]) saida += `.${partes[2]}`;
  if (partes[3]) saida += `/${partes[3]}`;
  if (dv) saida += `-${dv}`;
  return saida;
}

/** O valor de uma posição no cálculo do dígito: ASCII menos 48. */
const pesoDoCaractere = (c) => c.charCodeAt(0) - 48;

export function isCNPJValid(valor = "") {
  const v = limparCNPJ(valor);
  if (v.length !== 14) return false;
  if (!/^[0-9A-Z]{12}\d{2}$/.test(v)) return false;
  if (/^(.)\1{13}$/.test(v)) return false;

  for (let casa = 12; casa <= 13; casa += 1) {
    let peso = 2;
    let soma = 0;
    for (let i = casa - 1; i >= 0; i -= 1) {
      soma += pesoDoCaractere(v[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    const digito = resto < 2 ? 0 : 11 - resto;
    if (digito !== Number(v[casa])) return false;
  }
  return true;
}

/** CPF ou CNPJ no mesmo campo, decidido pelo tamanho do que já foi digitado. */
export function maskCpfCnpj(valor = "") {
  const limpo = limparCNPJ(valor);
  const soNumeros = /^\d*$/.test(limpo);
  return soNumeros && limpo.length <= 11 ? maskCPF(limpo) : maskCNPJ(limpo);
}

// ---------------------------------------------------------------------------
// Placa
//
// Dois formatos convivem no Brasil e vão conviver por décadas: o antigo
// ABC-1234 e o Mercosul ABC1D23 (a quarta posição é número, a quinta é
// LETRA). O campo decide sozinho pelo que foi digitado na quinta tecla, em
// vez de pedir para a pessoa escolher o formato antes — ninguém sabe
// responder isso, mas todo mundo sabe digitar a própria placa.
// ---------------------------------------------------------------------------
export function maskPlate(valor = "") {
  const bruto = String(valor).toUpperCase().replace(/[^0-9A-Z]/g, "");
  // Lido POSIÇÃO a posição, e não em fatias: cada casa da placa só aceita um
  // tipo, então um dedo errado (um número onde vai letra) é ignorado em vez
  // de empurrar tudo o que vem depois para a casa errada.
  const casas = [];
  for (const c of bruto) {
    const pos = casas.length;
    if (pos >= 7) break;
    const letra = /[A-Z]/.test(c);
    if (pos < 3) {
      if (letra) casas.push(c); // as três primeiras são letras nos dois formatos
    } else if (pos === 3) {
      if (!letra) casas.push(c); // a quarta é número nos dois formatos
    } else if (pos === 4) {
      casas.push(c); // a quinta decide: letra = Mercosul, número = placa antiga
    } else if (!letra) {
      casas.push(c);
    }
  }
  const v = casas.join("");
  if (v.length <= 3) return v;
  const mercosul = v.length >= 5 && /[A-Z]/.test(v[4]);
  return mercosul ? v : `${v.slice(0, 3)}-${v.slice(3)}`;
}

export const isPlateValid = (valor = "") => {
  const v = String(valor).toUpperCase().replace(/[^0-9A-Z]/g, "");
  return /^[A-Z]{3}\d{4}$/.test(v) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(v);
};
