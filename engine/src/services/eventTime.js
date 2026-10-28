/**
 * Data e hora de evento no fuso de quem cria.
 *
 * Até 25/10/2026 o formulário gravava `${data}T${hora}:00Z`: o 20:00 digitado
 * em Brasília virava 20:00 UTC (17:00 local), o evento saía da lista de
 * próximos 3 h antes de começar e o encontro de 00:00–02:59 aparecia com a
 * data do dia anterior.
 *
 * Agora:
 *   - `eventDate` é o instante certo (a data e a hora digitadas, lidas no
 *     fuso do aparelho);
 *   - `timeZone` guarda esse fuso (padrão America/Sao_Paulo), e a tela mostra
 *     o dia no fuso do EVENTO — quem vê de outro fuso enxerga o dia do
 *     encontro, não o dia convertido;
 *   - evento antigo (sem `timeZone`) foi gravado com a hora digitada como se
 *     fosse UTC, então é mostrado em UTC, que devolve o dia digitado;
 *   - `endDate` é só uma data ("2026-11-01"), sem hora: lida ao meio-dia UTC,
 *     nunca escorrega para o dia anterior.
 */

export const DEFAULT_EVENT_TIME_ZONE = "America/Sao_Paulo";

export const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_EVENT_TIME_ZONE;
  } catch {
    return DEFAULT_EVENT_TIME_ZONE;
  }
};

/** "2026-11-01" + "20:00" no fuso do aparelho → ISO em UTC. */
export const eventInstantFromLocal = (date, time = "") => {
  const [hh = "00", mm = "00"] = String(time || "00:00").split(":");
  const instant = new Date(`${date}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:00`);
  return Number.isNaN(instant.getTime()) ? "" : instant.toISOString();
};

const eventZone = (event) => event?.timeZone || "UTC";

/** Dia do evento, no fuso dele. */
export const formatEventDay = (event, locale, options) => {
  const date = new Date(event?.eventDate);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleDateString(locale, { ...options, timeZone: eventZone(event) });
  } catch {
    return date.toLocaleDateString(locale, options);
  }
};

/** Data final (só dia). */
export const formatEventEndDay = (endDate, locale, options) => {
  if (!endDate) return "";
  const date = new Date(`${String(endDate).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, { ...options, timeZone: "UTC" });
};

/**
 * Corte da lista de "próximos": o evento continua aparecendo nas 6 h depois
 * do início (está acontecendo), em vez de sumir no minuto em que começa.
 */
export const upcomingCutoffIso = (now = Date.now()) => new Date(now - 6 * 60 * 60 * 1000).toISOString();
