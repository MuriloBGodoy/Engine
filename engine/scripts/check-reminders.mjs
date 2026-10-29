/**
 * Trava da lógica dos lembretes da garagem (IPVA, licenciamento, revisão,
 * seguro): datas, dia útil, status, o que vai ao servidor e a regra de
 * de-duplicação do job.
 *
 *   npm run check:reminders
 *
 * Tudo com "hoje" fixo — nada aqui depende do relógio.
 */
import {
  addMonths,
  carReminders,
  garageUpcoming,
  isBusinessDay,
  markInsuranceRenewed,
  markIpvaPaid,
  markIpvaYearPaid,
  markLicensingPaid,
  markRevisionDone,
  mostUrgent,
  nextBusinessDay,
  normalizeReminderSettings,
  serverRows,
  shouldSend,
  statusFor,
} from "../src/services/reminders.js";
import { CALENDARS, COVERED_UFS, nationalHolidays } from "../src/services/reminderCalendars.js";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FALHA ${name}${detail ? `\n         ${detail}` : ""}`);
  }
};
const car = (reminders, extra = {}) => ({ id: "c1", type: "owned", brand: "Chevrolet", model: "Onix", reminders, ...extra });
const item = (c, kind, today) => carReminders(c, today).find((x) => x.kind === kind);

console.log("\ncalendário e dia útil");
check("carnaval 2026 é 16 e 17/02", nationalHolidays(2026).has("2026-02-16") && nationalHolidays(2026).has("2026-02-17"));
check("sexta-feira santa 2027 é 26/03", nationalHolidays(2027).has("2027-03-26"));
check("20/11 é feriado nacional (Lei 14.759/2023)", nationalHolidays(2026).has("2026-11-20"));
check("sábado não é dia útil", !isBusinessDay("2026-02-14"));
check("SP: 14/02/2026 (sábado) → 18/02 (pula fim de semana e carnaval)", nextBusinessDay("2026-02-14") === "2026-02-18");
check("dia útil fica onde está", nextBusinessDay("2026-01-12") === "2026-01-12");
check("31/01 + 1 mês = 28/02", addMonths("2026-01-31", 1) === "2026-02-28");
check("29/02/2028 + 12 meses = 28/02/2029", addMonths("2028-02-29", 12) === "2029-02-28");

// Integridade dos dados: toda UF coberta tem os dez finais, datas válidas e
// em ordem, fonte e nível. Um final faltando vira "sem lembrete" calado.
for (const uf of COVERED_UFS) {
  for (const [year, block] of Object.entries(CALENDARS[uf])) {
    for (const kind of ["ipva", "licensing"]) {
      const cal = block[kind];
      if (!cal) continue;
      const finals = Object.keys(cal.byFinal).sort().join("");
      const dates = Object.values(cal.byFinal).flatMap((v) => (Array.isArray(v) ? v.map((e) => e.date) : [v]));
      const sameYearish = dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && d.startsWith(year));
      const ordered = Object.values(cal.byFinal).every((v) => !Array.isArray(v) || v.every((e, i) => i === 0 || e.date >= v[i - 1].date));
      check(
        `${uf} ${year} ${kind}: 10 finais, datas válidas do ano, em ordem, com fonte`,
        finals === "0123456789" && sameYearish && ordered && cal.source && ["official", "press", "thirdParty"].includes(cal.level),
        `${finals} ${sameYearish} ${ordered}`,
      );
    }
  }
}
// Datas conferidas à mão contra a tabela publicada.
const ipvaDates = (uf, d) => CALENDARS[uf][2026].ipva.byFinal[d].map((e) => e.date);
check("RJ final 8: 02/02, 04/03, 08/04 (Res. 837/2025)", ipvaDates("RJ", "8").join() === "2026-02-02,2026-03-04,2026-04-08");
check("BA final 0: 15% em 10/02, depois 31/07 … 30/11", ipvaDates("BA", "0")[0] === "2026-02-10" && ipvaDates("BA", "0").at(-1) === "2026-11-30");
check("SC final 0: 10/10, 31/10, 10/11, 10/12", ipvaDates("SC", "0").join() === "2026-10-10,2026-10-31,2026-11-10,2026-12-10");
check("SC final 1: licenciamento 31/03", CALENDARS.SC[2026].licensing.byFinal["1"] === "2026-03-31");
check("GO final 1: 9 parcelas; final 3: 10", ipvaDates("GO", "1").length === 9 && ipvaDates("GO", "3").length === 10);

console.log("\nIPVA");
let it = item(car({ uf: "SP", plateDigit: "4" }), "ipva", "2026-02-10");
check("SP final 4 em 10/02: próxima é a 2ª (15/02 domingo → 16/02 carnaval → 18/02)", it.dueDate === "2026-02-18" && it.n === 2 && it.single === "full", JSON.stringify(it));
it = item(car({ uf: "SP", plateDigit: "1" }), "ipva", "2026-01-12");
check("vence hoje", it.status === "today" && it.daysLeft === 0);
it = item(car({ uf: "BA", plateDigit: "9" }), "ipva", "2026-10-28");
check("BA final 9 em 28/10: 4ª cota amanhã (29/10)", it.dueDate === "2026-10-29" && it.n === 4 && it.status === "soon" && it.daysLeft === 1);
it = item(car({ uf: "SP", plateDigit: "1" }), "ipva", "2026-10-28");
check("SP depois de maio: 2027 ainda não publicado (nunca uma data inventada)", it.state === "calendarPending" && it.year === 2027 && !it.dueDate);
it = item(car({ uf: "AM", plateDigit: "1" }), "ipva", "2026-10-28");
check("UF não coberta pede data manual", it.state === "notCovered" && !it.dueDate);
it = item(car({ uf: "AM", plateDigit: "1", ipva: { manualDate: "2027-01-20" } }), "ipva", "2026-10-28");
check("data manual aparece com a origem dela", it.origin === "manual" && it.dueDate === "2027-01-20" && it.status === "ok");
it = item(car({ uf: "AM", plateDigit: "1", ipva: { manualDate: "2026-10-01" } }), "ipva", "2026-10-28");
check("data manual passada sem 'paguei' = vencido", it.status === "overdue" && it.daysLeft === -27);
it = item(car({ uf: "SP" }), "ipva", "2026-10-28");
check("sem final de placa pede o final", it.state === "needsPlate");
// Paguei a parcela → próxima; quitei o ano → pendente.
let s = normalizeReminderSettings({ uf: "BA", plateDigit: "9" });
const ba = item(car(s), "ipva", "2026-10-28");
s = markIpvaPaid(s, ba);
it = item(car(s), "ipva", "2026-10-28");
check("'paguei esta' passa para a 5ª (27/11)", it.dueDate === "2026-11-27" && it.n === 5, JSON.stringify(it));
s = markIpvaYearPaid(s, 2026);
check("'quitei 2026' → aguardando 2027", item(car(s), "ipva", "2026-10-28").state === "calendarPending");
check("parcela passada sem 'paguei' não vira 'vencido' (não sabemos)", item(car({ uf: "BA", plateDigit: "1" }), "ipva", "2026-10-28").status !== "overdue");

console.log("\nlicenciamento");
it = item(car({ uf: "SP", plateDigit: "9" }), "licensing", "2026-10-28");
check("SP final 9: 30/11/2026", it.dueDate === "2026-11-30" && it.daysLeft === 33 && it.status === "ok");
it = item(car({ uf: "SP", plateDigit: "8" }), "licensing", "2026-10-28");
check("SP final 8: 31/10 é sábado e fica 31/10 (a fonte não manda rolar: a data mais cedo)", it.dueDate === "2026-10-31");
it = item(car({ uf: "SP", plateDigit: "1" }), "licensing", "2026-10-28");
check("SP final 1 depois de julho: 2027 pendente", it.state === "calendarPending" && it.year === 2027);
it = item(car(markLicensingPaid({ uf: "DF", plateDigit: "0" }, 2026)), "licensing", "2026-10-28");
check("licenciei 2026 → aguardando 2027", it.state === "calendarPending" && it.year === 2027);
it = item(car({ uf: "RS", plateDigit: "1" }), "licensing", "2026-10-28");
check("RS sem calendário de licenciamento → manual", it.state === "notCovered");

console.log("\nrevisão");
const expenses = [
  { date: "2026-08-01", odometer: 40000, category: "fuel", amount: 200 },
  { date: "2026-10-01", odometer: 43000, category: "fuel", amount: 200 },
];
it = item(car({ revision: { intervalMonths: 12, lastDate: "2025-11-15" } }), "revision", "2026-10-28");
check("por meses: 15/11/2026, faltam 18 dias", it.dueDate === "2026-11-15" && it.daysLeft === 18 && it.status === "soon");
it = item(car({ revision: { intervalKm: 10000, lastKm: 35000 } }, { expenses }), "revision", "2026-10-28");
check("por km: faltam 2.000 km, data é ESTIMATIVA pelo ritmo (3.000 km / 61 dias)", it.km.kmLeft === 2000 && it.estimated === true && it.dueDate === "2026-12-08", JSON.stringify(it));
it = item(car({ revision: { intervalKm: 5000, lastKm: 35000 } }, { expenses }), "revision", "2026-10-28");
check("passou do km = vencida mesmo sem data", it.status === "overdue" && it.reason === "km");
it = item(car({ revision: { intervalKm: 10000, lastKm: 35000 } }), "revision", "2026-10-28");
check("km sem odômetro lançado: não inventa quanto falta", it.status === "kmOnly" && it.km.kmLeft === null);
it = item(car({ revision: { intervalMonths: 6 } }), "revision", "2026-10-28");
check("intervalo sem a última revisão pede a última", it.state === "needsLast");
s = markRevisionDone({ revision: { intervalMonths: 6, lastDate: "2026-01-01" } }, { expenses }, "2026-10-28");
check("'fiz a revisão' grava hoje e o odômetro", s.revision.lastDate === "2026-10-28" && s.revision.lastKm === 43000);

console.log("\nseguro e status");
it = item(car({ insurance: { renewalDate: "2026-10-20" } }), "insurance", "2026-10-28");
check("seguro passado = vencido", it.status === "overdue");
check("'renovei' soma um ano", markInsuranceRenewed({ insurance: { renewalDate: "2026-10-20" } }).insurance.renewalDate === "2027-10-20");
check("status: >30 em dia, 1-30 em breve, 0 hoje, <0 vencido",
  statusFor(31) === "ok" && statusFor(30) === "soon" && statusFor(0) === "today" && statusFor(-1) === "overdue");
check("carro meta não tem lembrete", carReminders({ type: "goal", reminders: { uf: "SP", plateDigit: "1" } }, "2026-10-28").length === 0);
check("só o último dígito da placa é guardado",
  normalizeReminderSettings({ plateDigit: "ABC1D23" }).plateDigit === "" && normalizeReminderSettings({ plateDigit: 3 }).plateDigit === "3");
check("UF inválida não passa", normalizeReminderSettings({ uf: "São Paulo" }).uf === "");
check("data impossível não passa", normalizeReminderSettings({ insurance: { renewalDate: "2026-02-30" } }).insurance.renewalDate === null);
const cars = [
  car({ insurance: { renewalDate: "2026-11-30" } }, { id: "a" }),
  car({ insurance: { renewalDate: "2026-10-01" } }, { id: "b" }),
  car({ uf: "BA", plateDigit: "9" }, { id: "c" }),
];
const up = garageUpcoming(cars, "2026-10-28");
check("lista da garagem: vencido primeiro, depois o mais próximo", up[0].carId === "b" && up[1].carId === "c" && up[1].kind === "ipva");
check("selo do card: só até 30 dias", mostUrgent(cars[0], "2026-10-28") === null && mostUrgent(cars[2], "2026-10-28")?.kind === "ipva");

console.log("\no que vai ao servidor");
const rows = serverRows(car({ uf: "BA", plateDigit: "0", insurance: { renewalDate: "2027-01-10" }, revision: { intervalKm: 10000, lastKm: 35000 } }, { expenses }), "2026-10-28");
check("BA final 0 em 28/10: 4ª e 5ª cotas + seguro; estimativa por km NÃO vai",
  rows.map((r) => `${r.kind}:${r.due_date}`).join() === "ipva:2026-10-30,ipva:2026-11-30,insurance:2027-01-10", JSON.stringify(rows));
const rowsSp = serverRows(car({ uf: "SP", plateDigit: "0" }), "2026-10-28");
check("SP final 0: licenciamento 31/12 e nada de IPVA 2027 inventado", rowsSp.map((r) => `${r.kind}:${r.due_date}`).join() === "licensing:2026-12-31");
check("carro meta não manda nada", serverRows({ type: "goal", reminders: { insurance: { renewalDate: "2027-01-01" } } }, "2026-10-28").length === 0);
check("no máximo 24 linhas", serverRows(car({ uf: "GO", plateDigit: "3" }), "2026-01-01").length <= 24);

console.log("\nde-duplicação do job (espelho do SQL)");
check("31 dias: nada", shouldSend(31, []) === null);
check("30 dias: estágio 30", shouldSend(30, []) === 30);
check("5 dias, nada enviado: só o de 7 (não 30 e 7)", shouldSend(5, []) === 7);
check("5 dias, 7 já enviado: nada", shouldSend(5, [30, 7]) === null);
check("1 dia: estágio 1", shouldSend(1, [30, 7]) === 1);
check("no dia: estágio 0", shouldSend(0, [30, 7, 1]) === 0);
check("no dia, já enviado: nada", shouldSend(0, [0]) === null);
check("vencido: nunca", shouldSend(-1, []) === null);

console.log(failures ? `\n${failures} falha(s)\n` : "\ntudo verde\n");
process.exit(failures ? 1 : 0);
