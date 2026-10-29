/**
 * Lembretes da garagem: IPVA, licenciamento, revisão e seguro.
 *
 * Lógica pura (sem React, sem rede): a tela, o envio ao servidor e o
 * `check:reminders` usam as mesmas funções. Datas são strings `AAAA-MM-DD` no
 * fuso do aparelho — vencimento é dia de calendário, não instante.
 *
 * O princípio é o mesmo do resto da Garagem: o que não se sabe aparece como
 * não sabido. Data de IPVA/licenciamento só sai de calendário publicado
 * (reminderCalendars.js) ou da pessoa; passado de calendário não vira
 * "vencido", porque não sabemos se ela pagou — só o que ELA informou (data
 * manual, revisão, seguro) pode aparecer vencido.
 */
import { CALENDARS, nationalHolidays } from "./reminderCalendars.js";

export const REMINDER_KINDS = ["ipva", "licensing", "revision", "insurance"];
export const NOTIFY_STAGES = [30, 7, 1, 0];
const SOON_DAYS = 30;
const MAX_SERVER_ROWS = 24;
const DAY_MS = 86400000;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value) => {
  if (!ISO_RE.test(String(value || ""))) return false;
  const [y, m, d] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
const isoOrNull = (value) => (isIsoDate(value) && value >= "2000-01-01" && value <= "2100-12-31" ? value : null);
const intIn = (value, min, max) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export const localISODate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const toUTC = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso, days) => fromUTC(toUTC(iso) + days * DAY_MS);
export const daysBetween = (from, to) => Math.round((toUTC(to) - toUTC(from)) / DAY_MS);

/** Soma meses mantendo o dia; 31/01 + 1 mês = 28/02 (ou 29), nunca 03/03. */
export const addMonths = (iso, months) => {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return fromUTC(target.getTime());
};

export const isBusinessDay = (iso) => {
  const weekday = new Date(toUTC(iso)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !nationalHolidays(Number(iso.slice(0, 4))).has(iso);
};

/** Próximo dia útil (o próprio dia, se já for). */
export const nextBusinessDay = (iso) => {
  let day = iso;
  for (let guard = 0; guard < 10 && !isBusinessDay(day); guard += 1) day = addDays(day, 1);
  return day;
};

// ---------------------------------------------------------------------------
// O que fica guardado no carro (`car.reminders`)
// ---------------------------------------------------------------------------

const UF_RE = /^[A-Z]{2}$/;

/**
 * Normaliza o que a pessoa informou. Da placa, SÓ o último dígito: é o que o
 * calendário usa, e a placa inteira identificaria o carro e o dono.
 */
export const normalizeReminderSettings = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const uf = String(raw.uf || "").trim().toUpperCase();
  const digit = String(raw.plateDigit ?? "").trim();
  const out = {
    uf: UF_RE.test(uf) ? uf : "",
    plateDigit: /^[0-9]$/.test(digit) ? digit : "",
    ipva: {
      manualDate: isoOrNull(raw.ipva?.manualDate),
      // Tudo até esta data já está pago (parcela marcada ou ano quitado).
      paidThrough: isoOrNull(raw.ipva?.paidThrough),
    },
    licensing: {
      manualDate: isoOrNull(raw.licensing?.manualDate),
      paidYear: intIn(raw.licensing?.paidYear, 2000, 2100),
    },
    revision: {
      intervalMonths: intIn(raw.revision?.intervalMonths, 1, 60),
      intervalKm: intIn(raw.revision?.intervalKm, 500, 100000),
      lastDate: isoOrNull(raw.revision?.lastDate),
      lastKm: intIn(raw.revision?.lastKm, 0, 2000000),
    },
    insurance: {
      renewalDate: isoOrNull(raw.insurance?.renewalDate),
    },
  };
  return out;
};

export const emptyReminderSettings = () => normalizeReminderSettings({});

const settingsOf = (car) => normalizeReminderSettings(car?.reminders) || emptyReminderSettings();

/** Algo configurado? (A Garagem convida a configurar quando nada está.) */
export const hasAnyReminderSetting = (car) => {
  const s = settingsOf(car);
  return Boolean(
    s.uf || s.plateDigit || s.ipva.manualDate || s.licensing.manualDate ||
      s.revision.intervalMonths || s.revision.intervalKm || s.insurance.renewalDate,
  );
};

// ---------------------------------------------------------------------------
// Calendário
// ---------------------------------------------------------------------------

const calendarBlock = (uf, year, kind) => CALENDARS[uf]?.[year]?.[kind] || null;

/** O vencimento que vale: a data publicada, movida só onde a fonte manda. */
const effectiveDate = (block, date) => (block.roll === "nextBusinessDay" ? nextBusinessDay(date) : date);

/** Todas as datas de IPVA conhecidas para a UF/final, em ordem. */
export const ipvaCalendarEntries = (uf, digit, years) => {
  const out = [];
  for (const year of years) {
    const block = calendarBlock(uf, year, "ipva");
    const list = block?.byFinal?.[digit];
    if (!list) continue;
    for (const entry of list) {
      out.push({
        ...entry,
        published: entry.date,
        date: effectiveDate(block, entry.date),
        year,
        level: block.level,
        source: block.source,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
};

export const licensingCalendarDate = (uf, digit, year) => {
  const block = calendarBlock(uf, year, "licensing");
  const date = block?.byFinal?.[digit];
  if (!date) return null;
  return { date: effectiveDate(block, date), published: date, year, level: block.level, source: block.source };
};

/** O calendário desta UF cobre este tipo em algum ano? */
export const ufCovers = (uf, kind) =>
  Boolean(CALENDARS[uf]) && Object.values(CALENDARS[uf]).some((year) => Boolean(year[kind]));

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** "ok" (em dia, > 30 dias), "soon" (1–30), "today", "overdue". */
export const statusFor = (daysLeft) => {
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "today";
  if (daysLeft <= SOON_DAYS) return "soon";
  return "ok";
};

const dated = (base, dueDate, today) => {
  const daysLeft = daysBetween(today, dueDate);
  return { ...base, dueDate, daysLeft, status: statusFor(daysLeft) };
};

/** Odômetro mais alto lançado nos gastos (qualquer categoria), ou null. */
export const currentOdometer = (car) => {
  const marks = (car?.expenses || []).map((entry) => Number(entry?.odometer) || 0).filter((km) => km > 0);
  return marks.length ? Math.max(...marks) : null;
};

/** Km/dia medido pelo odômetro (≥ 2 marcas e ≥ 14 dias), ou null. */
export const kmPerDay = (car, today) => {
  const marks = (car?.expenses || [])
    .filter((entry) => Number(entry?.odometer) > 0 && isIsoDate(entry?.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer);
  if (marks.length < 2) return null;
  const first = marks[0];
  const last = marks[marks.length - 1];
  const days = daysBetween(first.date, last.date > today ? today : last.date);
  const km = Number(last.odometer) - Number(first.odometer);
  if (km <= 0 || days < 14) return null;
  return km / days;
};

const ipvaItem = (settings, today) => {
  const base = { kind: "ipva" };
  const { uf, plateDigit, ipva } = settings;
  const paidThrough = ipva.paidThrough || "0000-00-00";
  const year = Number(today.slice(0, 4));

  // Data que a pessoa digitou manda enquanto não estiver paga: ela pode estar
  // corrigindo o calendário, ou ser de uma UF que não cobrimos.
  if (ipva.manualDate && ipva.manualDate > paidThrough) {
    return dated({ ...base, origin: "manual" }, ipva.manualDate, today);
  }
  if (!uf || plateDigit === "") return { ...base, state: "needsPlate" };
  if (!ufCovers(uf, "ipva")) return { ...base, state: "notCovered", uf };

  const next = ipvaCalendarEntries(uf, plateDigit, [year, year + 1]).find(
    (entry) => entry.date >= today && entry.date > paidThrough,
  );
  if (next) {
    return dated(
      {
        ...base,
        origin: "calendar",
        uf,
        n: next.n,
        single: next.single,
        year: next.year,
        level: next.level,
        source: next.source,
      },
      next.date,
      today,
    );
  }
  // Ano corrente acabou (ou foi quitado) e o próximo não saiu.
  const pendingYear = calendarBlock(uf, year, "ipva") ? year + 1 : year;
  return { ...base, state: "calendarPending", uf, year: pendingYear };
};

const licensingItem = (settings, today) => {
  const base = { kind: "licensing" };
  const { uf, plateDigit, licensing } = settings;
  const year = Number(today.slice(0, 4));
  const paidYear = licensing.paidYear || 0;

  if (licensing.manualDate && Number(licensing.manualDate.slice(0, 4)) > paidYear) {
    return dated({ ...base, origin: "manual", year: Number(licensing.manualDate.slice(0, 4)) }, licensing.manualDate, today);
  }
  if (!uf || plateDigit === "") return { ...base, state: "needsPlate" };
  if (!ufCovers(uf, "licensing")) return { ...base, state: "notCovered", uf };

  for (const candidate of [year, year + 1]) {
    if (candidate <= paidYear) continue;
    const entry = licensingCalendarDate(uf, plateDigit, candidate);
    if (entry && entry.date >= today) {
      return dated(
        { ...base, origin: "calendar", uf, year: candidate, level: entry.level, source: entry.source },
        entry.date,
        today,
      );
    }
  }
  const pendingYear = Math.max(paidYear + 1, calendarBlock(uf, year, "licensing") ? year + 1 : year);
  return { ...base, state: "calendarPending", uf, year: pendingYear };
};

const revisionItem = (car, settings, today) => {
  const base = { kind: "revision" };
  const { intervalMonths, intervalKm, lastDate, lastKm } = settings.revision;
  if (!intervalMonths && !intervalKm) return { ...base, state: "notSet" };

  const odometer = currentOdometer(car);
  const known = odometer !== null || lastKm !== null ? Math.max(odometer || 0, lastKm || 0) : null;
  const km =
    intervalKm && lastKm !== null
      ? {
          dueKm: lastKm + intervalKm,
          currentKm: odometer !== null ? known : null,
          kmLeft: odometer !== null ? lastKm + intervalKm - known : null,
        }
      : null;

  const byDate = intervalMonths && lastDate ? addMonths(lastDate, intervalMonths) : null;
  if (!byDate && !km) return { ...base, state: "needsLast" };

  // Quando chega pelo km: estimativa pelo ritmo do odômetro. É ESTIMATIVA —
  // aparece como tal e não vira notificação (o servidor só recebe a data).
  let estimate = null;
  if (km?.kmLeft !== null && km?.kmLeft !== undefined && km.kmLeft > 0) {
    const rate = kmPerDay(car, today);
    if (rate) estimate = addDays(today, Math.ceil(km.kmLeft / rate));
  }

  const kmOverdue = km?.kmLeft !== null && km?.kmLeft !== undefined && km.kmLeft <= 0;
  const item = { ...base, origin: "user", km, estimatedDate: estimate, byDate };
  if (byDate) {
    const withDate = dated(item, byDate, today);
    if (kmOverdue && withDate.status !== "overdue") return { ...withDate, status: "overdue", reason: "km" };
    return withDate;
  }
  // Só km.
  if (kmOverdue) return { ...item, status: "overdue", reason: "km", daysLeft: null, dueDate: null };
  if (estimate) {
    const viaKm = dated(item, estimate, today);
    return { ...viaKm, estimated: true };
  }
  return { ...item, status: "kmOnly", daysLeft: null, dueDate: null };
};

const insuranceItem = (settings, today) => {
  const base = { kind: "insurance" };
  const date = settings.insurance.renewalDate;
  if (!date) return { ...base, state: "notSet" };
  return dated({ ...base, origin: "user" }, date, today);
};

/**
 * Os quatro lembretes de UM carro, sempre os quatro (com `state` quando não há
 * data — a tela explica o que falta). Carro que é meta não tem lembrete.
 */
export const carReminders = (car, today = localISODate()) => {
  if (car?.type !== "owned") return [];
  const settings = settingsOf(car);
  return [
    ipvaItem(settings, today),
    licensingItem(settings, today),
    revisionItem(car, settings, today),
    insuranceItem(settings, today),
  ];
};

const urgency = (item) => {
  if (item.status === "overdue") return -100000 + (item.daysLeft ?? 0);
  if (typeof item.daysLeft === "number") return item.daysLeft;
  return Infinity;
};

/** Itens COM data (ou vencidos por km) de todos os carros, mais urgente primeiro. */
export const garageUpcoming = (cars = [], today = localISODate()) =>
  cars
    .flatMap((car) =>
      carReminders(car, today)
        .filter((item) => item.status)
        .map((item) => ({ ...item, carId: car.id, car })),
    )
    .sort((a, b) => urgency(a) - urgency(b));

/** O item mais urgente do carro, para o selo do card (só se for até 30 dias). */
export const mostUrgent = (car, today = localISODate()) => {
  const list = carReminders(car, today).filter((item) => ["overdue", "today", "soon"].includes(item.status));
  return list.sort((a, b) => urgency(a) - urgency(b))[0] || null;
};

// ---------------------------------------------------------------------------
// O que vai para o servidor (tabela garage_reminders)
// ---------------------------------------------------------------------------

/**
 * Linhas para o job diário. Só datas FIRMES de hoje em diante: calendário
 * publicado, data que a pessoa digitou, revisão por meses, renovação do
 * seguro. Estimativa por km não vai — notificação com data inventada é o
 * contrário do que este recurso promete.
 *
 * IPVA vai com TODAS as parcelas futuras do calendário, para o lembrete da
 * 2ª parcela chegar mesmo que a pessoa não abra o app entre uma e outra.
 */
export const serverRows = (car, today = localISODate()) => {
  if (car?.type !== "owned") return [];
  const settings = settingsOf(car);
  const rows = [];
  const year = Number(today.slice(0, 4));

  const ipva = ipvaItem(settings, today);
  if (ipva.origin === "manual" && ipva.dueDate >= today) {
    rows.push({ kind: "ipva", due_date: ipva.dueDate, detail: { origin: "manual" } });
  } else if (ipva.origin === "calendar") {
    const paidThrough = settings.ipva.paidThrough || "0000-00-00";
    for (const entry of ipvaCalendarEntries(settings.uf, settings.plateDigit, [year, year + 1])) {
      if (entry.date < today || entry.date <= paidThrough) continue;
      rows.push({
        kind: "ipva",
        due_date: entry.date,
        detail: { origin: "calendar", uf: settings.uf, year: entry.year, n: entry.n, single: entry.single },
      });
    }
  }

  const licensing = licensingItem(settings, today);
  if (licensing.origin === "manual" && licensing.dueDate >= today) {
    rows.push({ kind: "licensing", due_date: licensing.dueDate, detail: { origin: "manual", year: licensing.year } });
  } else if (licensing.origin === "calendar") {
    for (const candidate of [year, year + 1]) {
      if (candidate <= (settings.licensing.paidYear || 0)) continue;
      const entry = licensingCalendarDate(settings.uf, settings.plateDigit, candidate);
      if (!entry || entry.date < today) continue;
      rows.push({
        kind: "licensing",
        due_date: entry.date,
        detail: { origin: "calendar", uf: settings.uf, year: candidate },
      });
    }
  }

  const revision = revisionItem(car, settings, today);
  if (revision.byDate && revision.byDate >= today) {
    rows.push({ kind: "revision", due_date: revision.byDate, detail: { origin: "user" } });
  }

  const insurance = insuranceItem(settings, today);
  if (insurance.dueDate && insurance.dueDate >= today) {
    rows.push({ kind: "insurance", due_date: insurance.dueDate, detail: { origin: "user" } });
  }

  // Duas fontes podem cair no mesmo dia (cota única = 1ª parcela): uma linha.
  const seen = new Set();
  return rows
    .filter((row) => {
      const key = `${row.kind}|${row.due_date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, MAX_SERVER_ROWS);
};

/**
 * Qual aviso o job manda hoje para um vencimento — espelho, em JS, da regra
 * do SQL (`run_garage_reminders`), testado pelo check:reminders.
 *
 * O estágio é o menor marco que ainda cabe (30, 7, 1, 0). Manda se nenhum
 * estágio igual ou menor já foi enviado: um lembrete criado a 5 dias do
 * vencimento manda o de 7 (com "faltam 5"), não o de 30 e o de 7 juntos; um
 * job que pulou um dia manda o atrasado no dia seguinte.
 */
export const stageFor = (daysLeft) => {
  if (daysLeft < 0 || daysLeft > 30) return null;
  if (daysLeft === 0) return 0;
  if (daysLeft <= 1) return 1;
  if (daysLeft <= 7) return 7;
  return 30;
};

export const shouldSend = (daysLeft, sentStages = []) => {
  const stage = stageFor(daysLeft);
  if (stage === null) return null;
  return sentStages.some((sent) => sent <= stage) ? null : stage;
};

// ---------------------------------------------------------------------------
// Ações rápidas ("paguei", "fiz a revisão")
// ---------------------------------------------------------------------------

export const markIpvaPaid = (settings, item) => {
  const s = normalizeReminderSettings(settings) || emptyReminderSettings();
  if (!item?.dueDate) return s;
  return {
    ...s,
    ipva: {
      manualDate: item.origin === "manual" ? null : s.ipva.manualDate,
      paidThrough: item.dueDate > (s.ipva.paidThrough || "") ? item.dueDate : s.ipva.paidThrough,
    },
  };
};

export const markIpvaYearPaid = (settings, year) => {
  const s = normalizeReminderSettings(settings) || emptyReminderSettings();
  return { ...s, ipva: { manualDate: null, paidThrough: `${year}-12-31` } };
};

export const markLicensingPaid = (settings, year) => {
  const s = normalizeReminderSettings(settings) || emptyReminderSettings();
  return { ...s, licensing: { manualDate: null, paidYear: Math.max(year, s.licensing.paidYear || 0) } };
};

export const markRevisionDone = (settings, car, today = localISODate()) => {
  const s = normalizeReminderSettings(settings) || emptyReminderSettings();
  const km = currentOdometer(car);
  return { ...s, revision: { ...s.revision, lastDate: today, lastKm: km ?? s.revision.lastKm } };
};

export const markInsuranceRenewed = (settings) => {
  const s = normalizeReminderSettings(settings) || emptyReminderSettings();
  if (!s.insurance.renewalDate) return s;
  return { ...s, insurance: { renewalDate: addMonths(s.insurance.renewalDate, 12) } };
};
