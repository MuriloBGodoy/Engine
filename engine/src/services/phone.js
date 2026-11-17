// Máscara e validação de telefone. O código do país (dial, ex.: +55) fica
// separado do número nacional para o seletor de país funcionar bem.
import { countries } from "./locations.js";

// Dial mais longo primeiro para casar "+351" antes de "+3"/"+1".
const DIALS_BY_LENGTH = [...countries].sort((a, b) => b.dial.length - a.dial.length);

/** Separa "+55 (11) 91234-5678" em { dial: "+55", number: "(11) 91234-5678" }. */
export function splitPhone(value, defaultDial = "+55") {
  const v = String(value || "").trim();
  if (v.startsWith("+")) {
    const match = DIALS_BY_LENGTH.find((c) => v.startsWith(c.dial));
    if (match) return { dial: match.dial, number: v.slice(match.dial.length).trim() };
  }
  return { dial: defaultDial, number: v };
}

/** Formata o número nacional conforme o país (dial). BR ganha (XX) XXXXX-XXXX. */
export function maskPhone(dial, raw = "") {
  const digits = String(raw).replace(/\D/g, "").slice(0, 15);

  if (dial === "+55") {
    const d = digits.slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
  }

  if (dial === "+1") {
    // Veio da cópia que existia em `pages/Services.jsx`: ao unificar as duas
    // máscaras de telefone, a regra dos EUA tinha que subir para cá, senão
    // unificar seria piorar para quem anuncia de fora.
    const d = digits.slice(0, 10);
    if (d.length <= 3) return d ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  }

  // Internacional genérico: agrupa em blocos para leitura, sem regra rígida.
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

/** Só conta como válido com dígitos suficientes (BR = 10 ou 11; resto ≥ 6). */
export function isPhoneValid(dial, masked = "") {
  const digits = String(masked).replace(/\D/g, "");
  if (dial === "+55") return digits.length === 10 || digits.length === 11;
  return digits.length >= 6 && digits.length <= 15;
}

/** Valida a string combinada "+55 (11) …" de uma vez. */
export function isPhoneValueValid(value, defaultDial = "+55") {
  const { dial, number } = splitPhone(value, defaultDial);
  return isPhoneValid(dial, number);
}
