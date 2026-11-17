#!/usr/bin/env node

/**
 * Verificação das máscaras (src/services/masks.js).
 *
 * Máscara é código que ninguém olha de novo e que todo mundo confia. Os dois
 * lados estão fixados aqui: o que tem que passar e o que tem que reprovar —
 * porque o erro clássico de máscara é deixar entrar "111.111.111-11", que tem
 * a cara certa e não é documento de ninguém.
 *
 * O caso do CNPJ com letra não é teoria: desde julho de 2026 o CNPJ novo é
 * alfanumérico nas 12 primeiras posições. Uma validação só-numérica reprovaria
 * empresa aberta de lá para cá.
 *
 * Uso:
 *   node scripts/check-masks.mjs
 */

import {
  isCEPValid,
  isCNPJValid,
  isCPFValid,
  isPlateValid,
  maskCEP,
  maskCNPJ,
  maskCPF,
  maskCpfCnpj,
  maskPhone,
  maskPlate,
} from "../src/services/masks.js";

let falhas = 0;
const check = (rotulo, obtido, esperado) => {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) {
    console.log(`OK      ${rotulo}`);
    return;
  }
  falhas += 1;
  console.error(
    `FALHOU  ${rotulo}\n        esperado ${JSON.stringify(esperado)}\n        obtido   ${JSON.stringify(obtido)}`,
  );
};

// --- CEP ---
check("CEP a meio caminho não inventa traço", maskCEP("1480"), "1480");
check("CEP completo", maskCEP("14801360"), "14801-360");
check("CEP já formatado não duplica", maskCEP("14801-360"), "14801-360");
check("CEP curto é inválido", isCEPValid("1480"), false);

// --- CPF ---
check("CPF formatado", maskCPF("52998224725"), "529.982.247-25");
check("CPF válido passa", isCPFValid("529.982.247-25"), true);
check("CPF de dígito errado reprova", isCPFValid("529.982.247-26"), false);
check("CPF repetido reprova", isCPFValid("111.111.111-11"), false);
check("CPF incompleto reprova", isCPFValid("529.982.247"), false);

// --- CNPJ numérico (o de sempre) ---
check("CNPJ formatado", maskCNPJ("11222333000181"), "11.222.333/0001-81");
check("CNPJ válido passa", isCNPJValid("11.222.333/0001-81"), true);
check("CNPJ de dígito errado reprova", isCNPJValid("11.222.333/0001-82"), false);
check("CNPJ repetido reprova", isCNPJValid("11.111.111/1111-11"), false);

// --- CNPJ alfanumérico (julho/2026 em diante) ---
check("CNPJ com letra mantém a máscara", maskCNPJ("12ABC34501DE35"), "12.ABC.345/01DE-35");
check("letra minúscula vira maiúscula", maskCNPJ("12abc34501de35"), "12.ABC.345/01DE-35");
check(
  "o dígito verificador continua numérico",
  maskCNPJ("12ABC34501DEAB"),
  "12.ABC.345/01DE",
);

// --- CPF ou CNPJ no mesmo campo ---
check("campo único: 11 dígitos = CPF", maskCpfCnpj("52998224725"), "529.982.247-25");
check("campo único: 14 dígitos = CNPJ", maskCpfCnpj("11222333000181"), "11.222.333/0001-81");
check("campo único: com letra = CNPJ", maskCpfCnpj("12ABC345"), "12.ABC.345");

// --- Placa ---
check("placa antiga ganha traço", maskPlate("abc1234"), "ABC-1234");
check("placa Mercosul NÃO ganha traço", maskPlate("abc1d23"), "ABC1D23");
check("só as letras ainda", maskPlate("abc"), "ABC");
check("número no lugar de letra é ignorado", maskPlate("1abc234"), "ABC-234");
check("placa antiga válida", isPlateValid("ABC-1234"), true);
check("placa Mercosul válida", isPlateValid("ABC1D23"), true);
check("placa curta reprova", isPlateValid("AB1234"), false);

// --- Telefone ---
check("telefone BR com 11 dígitos", maskPhone("+55", "16997996509"), "(16) 99799-6509");
check("telefone BR fixo (10 dígitos)", maskPhone("+55", "1633334444"), "(16) 3333-4444");
check("DDD sozinho não fecha o parêntese", maskPhone("+55", "16"), "(16");
// A regra dos EUA morava numa segunda máscara dentro de pages/Services.jsx.
// Ela subiu para cá quando as duas viraram uma — este caso é o que garante
// que unificar não piorou para quem anuncia de fora.
check("telefone EUA", maskPhone("+1", "5551234567"), "(555) 123-4567");
check("telefone EUA parcial", maskPhone("+1", "555123"), "(555) 123");
check("telefone de país sem regra agrupa em três", maskPhone("+351", "912345678"), "912 345 678");

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\ntudo verde");
