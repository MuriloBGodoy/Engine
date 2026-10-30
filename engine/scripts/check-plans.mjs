/**
 * Confere a tabela de preços (netlify/functions/lib/plans.js):
 *   - toda oferta tem preço em toda moeda de CURRENCIES;
 *   - todo valor é inteiro e passa o mínimo de cobrança do Stripe
 *     (STRIPE_MIN_CHARGE) — inclusive o de fundador;
 *   - o fundador custa menos que o preço cheio;
 *   - COP e ARS (duas casas no Stripe, vitrine inteira) não levam centavos.
 *
 *   node scripts/check-plans.mjs
 */
import {
  CURRENCIES,
  OFFERS,
  STRIPE_MIN_CHARGE,
} from "../netlify/functions/lib/plans.js";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FALHA ${name}${detail ? `\n         ${detail}` : ""}`);
  }
};

console.log("\ntabela de preços\n");

check(
  "toda moeda tem mínimo do Stripe",
  CURRENCIES.every((c) => Number.isInteger(STRIPE_MIN_CHARGE[c]) && STRIPE_MIN_CHARGE[c] > 0),
  CURRENCIES.filter((c) => !STRIPE_MIN_CHARGE[c]).join(", "),
);

for (const [id, offer] of Object.entries(OFFERS)) {
  for (const field of ["amount", "founderAmount"]) {
    const table = offer[field];
    if (!table) continue;
    const bad = [];
    for (const currency of CURRENCIES) {
      const value = table[currency];
      if (!Number.isInteger(value)) bad.push(`${currency}: sem valor inteiro`);
      else if (value < STRIPE_MIN_CHARGE[currency]) bad.push(`${currency}: ${value} < mínimo ${STRIPE_MIN_CHARGE[currency]}`);
      else if (["COP", "ARS"].includes(currency) && value % 100 !== 0) {
        bad.push(`${currency}: ${value} tem centavos`);
      }
    }
    check(`${id}.${field} completo e acima do mínimo do Stripe`, bad.length === 0, bad.join("; "));
  }
  if (offer.founderAmount) {
    const worse = CURRENCIES.filter((c) => offer.founderAmount[c] >= offer.amount[c]);
    check(`${id}: fundador mais barato que o cheio`, worse.length === 0, worse.join(", "));
  }
}

console.log(failures ? `\n${failures} falha(s)\n` : "\ntudo certo\n");
process.exit(failures ? 1 : 0);
