import { auth, must, nowIso, supabase } from "./supabase";
import { grantOwn, grantSeries } from "./achievements";

/**
 * Quem vai ao evento é uma linha por pessoa em `event_participants` (evento +
 * pessoa). Confirmar presença nunca é escrita no evento de OUTRA pessoa, e
 * cada um só escreve na própria linha.
 *
 * O número de confirmados vem de contagem, não de contador guardado no
 * evento — sempre igual à verdade. E a lotação é conferida pelo BANCO dentro
 * da escrita, com o evento travado: duas confirmações no mesmo instante não
 * estouram mais o teto (no Firestore estouravam por um).
 */

/** Conta quem confirmou. */
const contarParticipantes = async (eventId) => {
  try {
    const { count, error } = await supabase
      .from("event_participants")
      .select("*", { count: "exact", head: true })
      .eq("event_id", String(eventId));
    if (error) throw error;
    return count || 0;
  } catch {
    // Contagem é enfeite: se falhar, a tela mostra zero em vez de quebrar.
    return 0;
  }
};

const EVENT_COLUMN_KEYS = ["id", "createdBy", "clubId", "eventDate", "type", "state", "createdAt", "updatedAt"];

export const eventFromRow = (row) => ({
  ...(row.data || {}),
  id: row.id,
  createdBy: row.created_by,
  clubId: row.club_id,
  eventDate: row.event_date,
  type: row.type,
  state: row.state,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const eventToRow = (event) => ({
  created_by: event.createdBy,
  club_id: event.clubId,
  event_date: event.eventDate,
  type: event.type,
  state: event.state,
  data: JSON.parse(
    JSON.stringify(
      Object.fromEntries(Object.entries(event).filter(([key]) => !EVENT_COLUMN_KEYS.includes(key))),
    ),
  ),
});

const normalizeEvent = (event) => ({
  title: String(event.title || "").trim().slice(0, 120),
  description: String(event.description || "").trim().slice(0, 1000),
  type: String(event.type || "casual").trim(),
  eventDate: String(event.eventDate || ""),
  endDate: String(event.endDate || "").trim(), // opcional
  startTime: String(event.startTime || "").trim(), // HH:mm
  endTime: String(event.endTime || "").trim(), // HH:mm (opcional)
  location: String(event.location || "").trim().slice(0, 120),
  state: String(event.state || "").trim().slice(0, 8),
  country: String(event.country || "BR").trim().slice(0, 4),
  image: String(event.image || "").trim(),
  isPaid: Boolean(event.isPaid),
  ticketPrice: Math.max(Number(event.ticketPrice) || 0, 0),
  maxParticipants: Math.max(Number(event.maxParticipants) || 0, 0),

  // Links de comunidade
  communityLinks: {
    whatsappGroup: String(event.communityLinks?.whatsappGroup || "").trim(),
    facebookGroup: String(event.communityLinks?.facebookGroup || "").trim(),
  },

  // Encontro de clube. Campos NOVOS e OPCIONAIS: evento fora de clube continua
  // sendo criado sem eles, e por isso não existe subcoleção `clubs/{id}/events`
  // — seria uma segunda coleção de evento, com segunda regra e segundo RSVP,
  // exatamente o erro que o feed evitou ao pôr meta e post na mesma coleção.
  //
  // `clubTag` e `clubName` são desnormalizados de propósito: o card do evento
  // mostra `[CVC] Civic Campinas` sem uma leitura extra por card. Ficam "" em
  // vez de ausentes porque a aba Encontros consulta por igualdade em `clubId`.
  //
  // Quem pode criar evento COM `clubId` é capitão ou fundador, e quem decide
  // isso é o banco (política de `events`), não esta função.
  clubId: String(event.clubId || "").trim(),
  clubTag: String(event.clubTag || "").trim().toUpperCase().slice(0, 5),
  clubName: String(event.clubName || "").trim().slice(0, 40),

  // Metadata
  createdBy: String(event.createdBy || ""),
  createdAt: event.createdAt || nowIso(),
  updatedAt: event.updatedAt || nowIso(),
});

export const engineEvents = {
  async createEvent(eventData) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");

    const normalized = normalizeEvent({
      ...eventData,
      createdBy: auth.currentUser.uid,
    });

    const row = must(await supabase.from("events").insert(eventToRow(normalized)).select("id").single());
    grantOwn("event_organizer");
    return { id: row.id, ...normalized };
  },

  async getEventById(eventId) {
    const row = must(await supabase.from("events").select("*").eq("id", String(eventId)).maybeSingle());

    if (!row) {
      throw new Error("Evento não encontrado.");
    }

    return eventFromRow(row);
  },

  async getUpcomingEvents(filters = {}) {
    const { type, state, limit: resultLimit = 20 } = filters;

    let request = supabase
      .from("events")
      .select("*")
      .gte("event_date", new Date().toISOString())
      .order("event_date", { ascending: true })
      .limit(resultLimit);

    if (type && type !== "all") request = request.eq("type", type);
    if (state) request = request.eq("state", state.toUpperCase());

    const eventos = must(await request).map(eventFromRow);

    // O contador nao mora no evento; vem da contagem. Uma por evento, em
    // paralelo — nao le linha nenhuma, so conta.
    const contagens = await Promise.all(eventos.map((e) => contarParticipantes(e.id)));
    return eventos.map((evento, i) => ({ ...evento, participantCount: contagens[i] }));
  },

  /**
   * "Meus eventos": os que eu criei e os próximos em que confirmei presença.
   * A presença vem junto do evento numa leitura só (a chave estrangeira
   * `event_participants.event_id` é o que deixa o banco fazer a junção).
   */
  async getMyEvents({ limit: resultLimit = 50 } = {}) {
    if (!auth.currentUser) return [];
    const uid = auth.currentUser.uid;
    const agora = new Date().toISOString();

    const [criados, presencas] = await Promise.all([
      supabase.from("events").select("*").eq("created_by", uid).gte("event_date", agora).then(must),
      supabase.from("event_participants").select("events(*)").eq("uid", uid).then(must),
    ]);

    const vou = presencas
      .map((item) => item.events)
      .filter((event) => event && String(event.event_date || "") >= agora);

    const porId = new Map();
    for (const row of [...criados, ...vou]) porId.set(row.id, eventFromRow(row));

    const lista = [...porId.values()]
      .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)))
      .slice(0, resultLimit);
    const contagens = await Promise.all(lista.map((e) => contarParticipantes(e.id)));
    return lista.map((e, i) => ({ ...e, participantCount: contagens[i] }));
  },

  async updateEvent(eventId, updates) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");

    const event = await this.getEventById(eventId);
    if (event.createdBy !== auth.currentUser.uid) {
      throw new Error("Permissão negada. Apenas o criador pode editar.");
    }

    const normalized = normalizeEvent({ ...event, ...updates });
    must(await supabase.from("events").update(eventToRow(normalized)).eq("id", String(eventId)));

    return { id: eventId, ...normalized };
  },

  async deleteEvent(eventId) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");

    const event = await this.getEventById(eventId);
    if (event.createdBy !== auth.currentUser.uid) {
      throw new Error("Permissão negada. Apenas o criador pode deletar.");
    }

    // A lista de presença sai junto, em cascata no banco.
    must(await supabase.from("events").delete().eq("id", String(eventId)));
  },

  async rsvpEvent(eventId, carDetails = {}) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");

    const uid = auth.currentUser.uid;
    const participantData = {
      uid,
      displayName: auth.currentUser.displayName || "Anônimo",
      carDetails: {
        brand: String(carDetails.brand || "").trim(),
        model: String(carDetails.model || "").trim(),
        year: String(carDetails.year || "").trim(),
      },
      rsvpDate: nowIso(),
    };

    const event = await this.getEventById(eventId);

    const { error } = await supabase.from("event_participants").insert({
      event_id: String(eventId),
      uid,
      data: { displayName: participantData.displayName, carDetails: participantData.carDetails },
    });
    if (error) {
      if (error.code === "23505") throw new Error("Você já confirmou presença neste evento.");
      if (error.message === "event-full") throw new Error("Evento lotado. Desculpe!");
      throw error;
    }

    grantOwn("event_rsvp");
    // "Seu evento com N confirmados", para quem organizou. Conta as linhas de
    // presença — o mesmo número que decide a lotação.
    const organizer = event.createdBy;
    if (organizer) {
      contarParticipantes(eventId)
        .then((total) => grantSeries(String(organizer), "event_attendees", total))
        .catch(() => {});
    }
    return participantData;
  },

  async cancelRsvp(eventId) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");

    const removed = must(
      await supabase
        .from("event_participants")
        .delete()
        .eq("event_id", String(eventId))
        .eq("uid", auth.currentUser.uid)
        .select("uid"),
    );
    if (!removed.length) {
      throw new Error("Você não confirmou presença neste evento.");
    }
  },

  async getEventParticipants(eventId) {
    const rows = must(
      await supabase.from("event_participants").select("*").eq("event_id", String(eventId)),
    );
    return rows.map((row) => ({ ...(row.data || {}), uid: row.uid, rsvpDate: row.rsvp_date }));
  },

  /** Quantos confirmaram. Vem da contagem, então não sai de sincronia. */
  async countParticipants(eventId) {
    return contarParticipantes(eventId);
  },

  async isUserRsvped(eventId) {
    if (!auth.currentUser) return false;

    try {
      const row = must(
        await supabase
          .from("event_participants")
          .select("uid")
          .eq("event_id", String(eventId))
          .eq("uid", auth.currentUser.uid)
          .maybeSingle(),
      );
      return Boolean(row);
    } catch {
      return false;
    }
  },
};
