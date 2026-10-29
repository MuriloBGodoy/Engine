import { supabase, must } from "./supabase";
import { CALENDARS_VERSION } from "./reminderCalendars";
import { localISODate, serverRows } from "./reminders";

/**
 * Leva ao servidor as datas firmes de cada carro (tabela `garage_reminders`),
 * para o job diário avisar no sino mesmo com o app fechado.
 *
 * Só reenvia quando o que DETERMINA as datas mudou: o tipo do carro, o que a
 * pessoa configurou e a versão dos calendários (um 2027 novo no
 * reminderCalendars.js faz todo aparelho reenviar). A assinatura fica no
 * aparelho; outro aparelho reenvia uma vez e é só isso — a troca é idempotente.
 *
 * Linha de data passada que sobra no servidor é inofensiva: o job só olha os
 * próximos 30 dias.
 */

const signatureKey = (userId, carId) => `engine_reminders_sig:${userId}:${carId}`;
// O mês entra para reenviar ao menos uma vez por mês: barato, e cobre o que
// muda só com o tempo (o "próximo" de cada coisa).
const signatureOf = (car) =>
  JSON.stringify({
    v: CALENDARS_VERSION,
    m: localISODate().slice(0, 7),
    type: car?.type || "",
    r: car?.reminders || null,
  });

const readSignature = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeSignature = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento (aba anônima cheia): reenvia na próxima vez, só isso.
  }
};

export const syncCarReminders = async (userId, car, { force = false } = {}) => {
  if (!userId || !car?.id) return false;
  const key = signatureKey(userId, car.id);
  const signature = signatureOf(car);
  const previous = readSignature(key);
  if (!force && previous === signature) return false;

  const rows = serverRows(car, localISODate()).map((row) => ({
    user_id: userId,
    car_id: String(car.id),
    kind: row.kind,
    due_date: row.due_date,
    detail: row.detail,
  }));

  // Carro sem nada a lembrar e que este aparelho nunca enviou (a meta, quase
  // sempre): não há o que apagar. O job ignora carro que não é `owned` de
  // qualquer jeito, então uma sobra de outro aparelho não vira aviso.
  if (!rows.length && previous === null && !car.reminders) {
    writeSignature(key, signature);
    return false;
  }

  must(await supabase.from("garage_reminders").delete().eq("user_id", userId).eq("car_id", String(car.id)));
  if (rows.length) must(await supabase.from("garage_reminders").insert(rows));
  writeSignature(key, signature);
  return true;
};

/** Todos os carros, um de cada vez; falha de um não trava os outros. */
export const syncGarageReminders = async (userId, cars = []) => {
  for (const car of cars) {
    try {
      await syncCarReminders(userId, car);
    } catch (error) {
      console.warn("syncCarReminders", car?.id, error);
    }
  }
};
