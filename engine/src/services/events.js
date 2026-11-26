import { auth, must, nowIso, supabase } from "./supabase";
import { grantOwn } from "./achievements";
import { upcomingCutoffIso } from "./eventTime";

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

/**
 * Quantos confirmaram, para vários eventos numa ida só. Vem de uma função do
 * banco porque a LISTA de presença (nome e carro) é só para quem tem conta —
 * o visitante vê o total, não quem vai estar onde.
 */
const contarVarios = async (eventIds) => {
  const ids = [...new Set(eventIds.map(String))].filter(Boolean);
  if (!ids.length) return new Map();
  try {
    const rows = must(await supabase.rpc("event_participant_counts", { p_event_ids: ids }));
    return new Map(rows.map((row) => [String(row.event_id), Number(row.total) || 0]));
  } catch {
    // Contagem é enfeite: se falhar, a tela mostra zero em vez de quebrar.
    return new Map();
  }
};

const contarParticipantes = async (eventId) => (await contarVarios([eventId])).get(String(eventId)) || 0;

/**
 * Quantos curtiram, para vários eventos numa ida só. Mesma forma da presença
 * e pelo mesmo motivo: a LISTA de quem curtiu é de quem tem conta, o TOTAL é
 * de todo mundo — e um visitante tem de ver o número sem ler linha nenhuma.
 */
const contarCurtidasVarias = async (eventIds) => {
  const ids = [...new Set(eventIds.map(String))].filter(Boolean);
  if (!ids.length) return new Map();
  try {
    const rows = must(await supabase.rpc("event_like_counts", { p_event_ids: ids }));
    return new Map(rows.map((row) => [String(row.event_id), Number(row.total) || 0]));
  } catch {
    return new Map();
  }
};

const EVENT_COLUMN_KEYS = [
  "id",
  "createdBy",
  "clubId",
  "eventDate",
  "type",
  "state",
  "createdAt",
  "updatedAt",
  // Colunas de 20261123120000: comentário é coluna do evento, não campo do
  // `data`. Sem estes nomes aqui, salvar o evento copiaria a lista inteira
  // de comentários para dentro do `data` a cada edição.
  "comments",
  "commentCount",
];

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
  comments: Array.isArray(row.comments) ? row.comments : [],
  commentCount: Number(row.comment_count) || 0,
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

export const EVENT_MAX_PHOTOS = 4;

const normalizeEvent = (event) => ({
  title: String(event.title || "").trim().slice(0, 120),
  description: String(event.description || "").trim().slice(0, 1000),
  type: String(event.type || "casual").trim(),
  eventDate: String(event.eventDate || ""),
  endDate: String(event.endDate || "").trim(), // opcional
  startTime: String(event.startTime || "").trim(), // HH:mm
  // Fuso em que data e hora foram digitadas (ver services/eventTime.js).
  timeZone: String(event.timeZone || "").trim().slice(0, 64),
  endTime: String(event.endTime || "").trim(), // HH:mm (opcional)
  location: String(event.location || "").trim().slice(0, 120),
  state: String(event.state || "").trim().slice(0, 8),
  country: String(event.country || "BR").trim().slice(0, 4),
  // Fotos do evento. O formulário sempre deixou somar até quatro, mas só a
  // primeira era guardada (`image`): as outras três sumiam no salvar.
  // `image` continua existindo porque é o que os cartões já leem — agora
  // sempre a primeira da lista. (07/11/2026)
  photos: (Array.isArray(event.photos) ? event.photos : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, EVENT_MAX_PHOTOS),
  image: String(
    (Array.isArray(event.photos) && event.photos[0]) || event.image || "",
  ).trim(),
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
      .gte("event_date", upcomingCutoffIso())
      .order("event_date", { ascending: true })
      .limit(resultLimit);

    if (type && type !== "all") request = request.eq("type", type);
    if (state) request = request.eq("state", state.toUpperCase());

    const eventos = must(await request).map(eventFromRow);

    // O contador nao mora no evento; vem da contagem. Uma por evento, em
    // paralelo — nao le linha nenhuma, so conta.
    const ids = eventos.map((e) => e.id);
    const [contagens, curtidas] = await Promise.all([contarVarios(ids), contarCurtidasVarias(ids)]);
    return eventos.map((evento) => ({
      ...evento,
      participantCount: contagens.get(String(evento.id)) || 0,
      likeCount: curtidas.get(String(evento.id)) || 0,
    }));
  },

  /**
   * "Meus eventos": os que eu criei e os próximos em que confirmei presença.
   * A presença vem junto do evento numa leitura só (a chave estrangeira
   * `event_participants.event_id` é o que deixa o banco fazer a junção).
   */
  async getMyEvents({ limit: resultLimit = 50 } = {}) {
    if (!auth.currentUser) return [];
    const uid = auth.currentUser.uid;
    const agora = upcomingCutoffIso();

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
    const ids = lista.map((e) => e.id);
    const [contagens, curtidas] = await Promise.all([contarVarios(ids), contarCurtidasVarias(ids)]);
    return lista.map((e) => ({
      ...e,
      participantCount: contagens.get(String(e.id)) || 0,
      likeCount: curtidas.get(String(e.id)) || 0,
    }));
  },

  async updateEvent(eventId, updates) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");

    // Quem pode editar é o banco que decide (20261101150000): quem criou,
    // co-organizador e, em encontro de clube, a direção com manage_events.
    // `createdBy` e o clube não mudam por aqui.
    const event = await this.getEventById(eventId);
    const normalized = normalizeEvent({ ...event, ...updates, createdBy: event.createdBy, clubId: event.clubId });
    const rows = must(
      await supabase.from("events").update(eventToRow(normalized)).eq("id", String(eventId)).select("id"),
    );
    if (!rows.length) throw new Error("Permissão negada. Só a organização do evento edita.");

    return { id: eventId, ...normalized };
  },

  /**
   * Equipe do evento: co-organizador (edita), staff e convidado (selo).
   * Lista para quem tem conta, como a de presença. O cartão (nome, foto)
   * vem do perfil público.
   */
  async getEventTeam(eventId) {
    if (!auth.currentUser) return [];
    const { data, error } = await supabase
      .from("event_team")
      .select("uid, role, created_at")
      .eq("event_id", String(eventId))
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data || []).map((row) => ({ uid: row.uid, role: row.role }));
  },

  async setEventTeamRole(eventId, uid, role) {
    const { error } = await supabase.rpc("event_team_set", {
      p_event: String(eventId),
      p_uid: String(uid),
      p_role: role,
    });
    if (error) throw Object.assign(new Error(error.message), { code: error.message });
  },

  async removeFromEventTeam(eventId, uid) {
    const { error } = await supabase.rpc("event_team_remove", { p_event: String(eventId), p_uid: String(uid) });
    if (error) throw Object.assign(new Error(error.message), { code: error.message });
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

    // Evento inexistente: erro claro antes de tentar confirmar.
    await this.getEventById(eventId);

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
    // "Seu evento com N confirmados" (para quem organizou) sai do banco.
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

  /* --------------------------------------------------- curtir e comentar ---
   *
   * Confirmar presença é a resposta cara (eu apareço no sábado). Curtir e
   * comentar são o degrau de baixo — e é por ele que a maioria entra: quem
   * pergunta "tem estacionamento?" no comentário é quem talvez confirme
   * depois. Ver 20261123120000_event_likes_and_comments.sql.
   */

  /** Quantos curtiram. Contagem, como a de confirmados — nunca sai do lugar. */
  async countLikes(eventId) {
    return (await contarCurtidasVarias([eventId])).get(String(eventId)) || 0;
  },

  async hasLiked(eventId) {
    if (!auth.currentUser) return false;
    try {
      const row = must(
        await supabase
          .from("event_likes")
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

  /**
   * Curtir é um botão só: liga e desliga. Devolve o estado NOVO para a tela
   * não ter de perguntar de novo.
   */
  async toggleLike(eventId, curtido) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");
    const uid = auth.currentUser.uid;

    if (curtido) {
      must(
        await supabase
          .from("event_likes")
          .delete()
          .eq("event_id", String(eventId))
          .eq("uid", uid)
          .select("uid"),
      );
      return false;
    }

    const { error } = await supabase
      .from("event_likes")
      .insert({ event_id: String(eventId), uid });
    // 23505 é "já curtiu": dois toques rápidos não viram erro na cara da
    // pessoa, viram o estado que ela já esperava.
    if (error && error.code !== "23505") throw error;
    return true;
  },

  /**
   * Os comentários moram no próprio evento (coluna `comments`), então eles já
   * chegam em `getEventById`. Esta função existe para RECARREGAR a lista
   * depois de escrever, sem puxar o evento inteiro de novo.
   */
  async getComments(eventId) {
    const row = must(
      await supabase.from("events").select("comments").eq("id", String(eventId)).maybeSingle(),
    );
    return Array.isArray(row?.comments) ? row.comments : [];
  },

  /** O autor é carimbado pelo banco: daqui vai só o texto. */
  async addComment(eventId, text) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");
    const limpo = String(text || "").trim();
    if (!limpo) throw new Error("Escreva alguma coisa antes de enviar.");

    return must(
      await supabase.rpc("add_event_comment", {
        p_event_id: String(eventId),
        p_comment: { text: limpo.slice(0, 300) },
      }),
    );
  },

  async deleteComment(eventId, commentId) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");
    must(
      await supabase.rpc("delete_event_comment", {
        p_event_id: String(eventId),
        p_comment_id: String(commentId),
      }),
    );
  },
};
