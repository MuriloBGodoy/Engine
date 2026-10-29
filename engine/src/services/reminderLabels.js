/**
 * Textos dos lembretes, fora dos componentes (regra do fast refresh) e
 * compartilhados entre a Garagem, o card e o sino.
 */

/** Data curta no idioma de quem lê: "27/11" ou "27 nov. 2027" quando é outro ano. */
export const formatDueDate = (iso, locale, today) => {
  if (!iso) return "";
  const date = new Date(`${iso}T12:00:00`);
  const sameYear = today && iso.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
};

/** "IPVA · 4ª parcela", "IPVA · cota única com desconto", "Licenciamento 2026". */
export const reminderTitle = (t, item) => {
  const kind = t(`reminders.kinds.${item.kind}`);
  if (item.kind === "ipva" && item.origin === "calendar") {
    const parts = [];
    if (item.n) parts.push(t("reminders.installment", { n: item.n }));
    if (item.single === "discount") parts.push(t("reminders.singleDiscount"));
    if (item.single === "full") parts.push(t("reminders.singleFull"));
    return parts.length ? `${kind} · ${parts.join(` ${t("reminders.or")} `)}` : kind;
  }
  if (item.kind === "licensing" && item.year) return `${kind} ${item.year}`;
  return kind;
};

/** "Vence em 12 dias", "Vence hoje", "Vencido há 3 dias", "Em dia". */
export const reminderStatusText = (t, item) => {
  if (item.status === "overdue") {
    if (item.reason === "km" && item.km?.kmLeft !== null && item.km?.kmLeft !== undefined) {
      return t("reminders.status.overKm", { km: Math.abs(item.km.kmLeft).toLocaleString() });
    }
    return t("reminders.status.overdue", { count: Math.abs(item.daysLeft ?? 0) });
  }
  if (item.status === "today") return t("reminders.status.today");
  if (item.status === "soon") return t("reminders.status.soon", { count: item.daysLeft });
  if (item.status === "kmOnly") return t("reminders.status.kmOnly");
  return t("reminders.status.ok");
};

/** O que falta para o item ter data. */
export const reminderStateText = (t, item) => {
  switch (item.state) {
    case "needsPlate":
      return t("reminders.state.needsPlate");
    case "notCovered":
      return t("reminders.state.notCovered", { uf: item.uf });
    case "calendarPending":
      return t("reminders.state.calendarPending", { uf: item.uf, year: item.year });
    case "needsLast":
      return t("reminders.state.needsLast");
    case "notSet":
      return t(`reminders.state.notSet_${item.kind}`);
    default:
      return "";
  }
};

/** Chip de status: tokens do Engine + paleta do Tailwind, nunca cor solta. */
export const reminderTone = (item) => {
  if (item.status === "overdue") return "bg-red-500/10 text-red-500 border-red-500/30";
  if (item.status === "today" || (item.status === "soon" && item.daysLeft <= 7)) {
    return "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400";
  }
  // 8 a 30 dias: neutro. O acento do Engine é vermelho e vermelho é "vencido".
  if (item.status === "soon") return "bg-[var(--engine-surface-2)] text-[var(--engine-text)] border-[var(--engine-border-strong)]";
  return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400";
};

/** Copy do aviso no sino: quando, calculado na hora em que a pessoa LÊ. */
export const reminderNotificationCopy = (notification, t, locale, today) => {
  const item = {
    kind: notification.kind,
    origin: notification.detail?.origin,
    n: notification.detail?.n,
    single: notification.detail?.single,
    year: notification.detail?.year,
  };
  const due = notification.dueDate || "";
  const days = due && today ? Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) : null;
  const when =
    days === null
      ? ""
      : days < 0
        ? t("reminders.when.past", { date: formatDueDate(due, locale, today) })
        : days === 0
          ? t("reminders.when.today")
          : t("reminders.when.inDays", { count: days });
  return {
    title: t("notifications.types.garage_reminder.title", { item: reminderTitle(t, item), when }),
    body: t("notifications.types.garage_reminder.body", {
      car: notification.carName || t("reminders.yourCar"),
      date: formatDueDate(due, locale, today),
    }),
  };
};
