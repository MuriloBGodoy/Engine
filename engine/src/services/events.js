import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, firestore } from "./firebase";
import { grantOwn, grantSeries } from "./achievements";

const EVENTS_COLLECTION = "events";

/**
 * Quem vai ao evento mora numa SUBCOLEÇÃO, um documento por pessoa, com o uid
 * como id: `events/{eventId}/participants/{uid}`.
 *
 * Antes era um array `participants` no próprio documento do evento. O problema
 * não era o array: era que confirmar presença é escrita no documento de OUTRA
 * pessoa. Como `cancelRsvp` reescrevia o array inteiro, nenhuma regra
 * conseguia provar QUEM tinha entrado ou saído — o melhor que dava para fazer
 * era limitar a mudança a um item por escrita, e um usuário logado ainda podia
 * apagar a presença de outro.
 *
 * Com um documento por pessoa a regra fica trivial e forte: você só escreve no
 * doc cujo id é o seu uid. Não existe mais escrita de terceiro.
 *
 * O contador também saiu do documento do evento. Contador desnormalizado
 * precisava ser escrito por quem confirma — de novo, escrita no doc alheio — e
 * ainda podia sair de sincronia com a lista. Agora o número vem de
 * `getCountFromServer` na subcoleção: uma agregação, sem leitura de documento,
 * e sempre igual à verdade.
 */
const PARTICIPANTS_SUBCOLLECTION = "participants";

const participantsRef = (eventId) =>
  collection(firestore, EVENTS_COLLECTION, eventId, PARTICIPANTS_SUBCOLLECTION);

const participantRef = (eventId, uid) =>
  doc(firestore, EVENTS_COLLECTION, eventId, PARTICIPANTS_SUBCOLLECTION, uid);

/** Conta quem confirmou, direto da subcoleção. */
const contarParticipantes = async (eventId) => {
  try {
    const snapshot = await getCountFromServer(participantsRef(eventId));
    return snapshot.data().count;
  } catch {
    // Contagem é enfeite: se falhar, a tela mostra zero em vez de quebrar.
    return 0;
  }
};

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
  // isso é a regra do Firestore (um `get` no doc de membro), não esta função.
  clubId: String(event.clubId || "").trim(),
  clubTag: String(event.clubTag || "").trim().toUpperCase().slice(0, 5),
  clubName: String(event.clubName || "").trim().slice(0, 40),

  // Metadata
  createdBy: String(event.createdBy || ""),
  createdAt: event.createdAt || serverTimestamp(),
  updatedAt: event.updatedAt || serverTimestamp(),
});

export const engineEvents = {
  async createEvent(eventData) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");

    const normalized = normalizeEvent({
      ...eventData,
      createdBy: auth.currentUser.uid,
    });

    const docRef = await addDoc(collection(firestore, EVENTS_COLLECTION), normalized);
    grantOwn("event_organizer");
    return { id: docRef.id, ...normalized };
  },

  async getEventById(eventId) {
    const docRef = doc(firestore, EVENTS_COLLECTION, eventId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      throw new Error("Evento não encontrado.");
    }

    return { id: snapshot.id, ...snapshot.data() };
  },

  async getUpcomingEvents(filters = {}) {
    const { type, state, limit: resultLimit = 20 } = filters;

    let queryConstraints = [
      where("eventDate", ">=", new Date().toISOString()),
      orderBy("eventDate", "asc"),
    ];

    if (type && type !== "all") {
      queryConstraints.push(where("type", "==", type));
    }

    if (state) {
      queryConstraints.push(where("state", "==", state.toUpperCase()));
    }

    const q = query(
      collection(firestore, EVENTS_COLLECTION),
      ...queryConstraints.slice(0, 10)
    );

    const snapshot = await getDocs(q);
    const eventos = snapshot.docs.slice(0, resultLimit).map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    // O contador nao mora mais no documento; vem da subcolecao. Uma agregacao
    // por evento, em paralelo — nao le documento nenhum, so conta.
    const contagens = await Promise.all(eventos.map((e) => contarParticipantes(e.id)));
    return eventos.map((evento, i) => ({ ...evento, participantCount: contagens[i] }));
  },

  /**
   * "Meus eventos": os que eu criei e os próximos em que confirmei presença.
   *
   * Duas leituras de propósito, nenhuma delas consulta de grupo. A presença
   * mora em `events/{id}/participants/{uid}`, e uma `collectionGroup` sobre
   * `participants` não passa pela regra aninhada sem regra própria e índice
   * de grupo — foi isso que custou um deploy em agosto. Então: os criados vêm
   * por `createdBy` (campo único, índice automático; a data é filtrada aqui
   * para não pedir índice composto), e os que vou vêm dos próximos eventos
   * já listados, conferindo o MEU documento na subcoleção de cada um — leitura
   * direta, que a regra permite. São no máximo `limit` getDocs em paralelo.
   */
  async getMyEvents({ limit: resultLimit = 50 } = {}) {
    if (!auth.currentUser) return [];
    const uid = auth.currentUser.uid;
    const agora = new Date().toISOString();

    const [criadosSnap, proximos] = await Promise.all([
      getDocs(query(collection(firestore, EVENTS_COLLECTION), where("createdBy", "==", uid))),
      this.getUpcomingEvents({ limit: resultLimit }),
    ]);

    const criados = criadosSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((e) => String(e.eventDate || "") >= agora);

    const presencas = await Promise.all(
      proximos.map((e) => getDoc(participantRef(e.id, uid)).then((d) => d.exists()).catch(() => false)),
    );
    const vou = proximos.filter((_, i) => presencas[i]);

    const porId = new Map();
    for (const e of [...criados, ...vou]) porId.set(e.id, { ...porId.get(e.id), ...e });

    const lista = [...porId.values()].sort((a, b) =>
      String(a.eventDate).localeCompare(String(b.eventDate)),
    );
    const contagens = await Promise.all(
      lista.map((e) => (e.participantCount == null ? contarParticipantes(e.id) : e.participantCount)),
    );
    return lista.map((e, i) => ({ ...e, participantCount: contagens[i] }));
  },

  async updateEvent(eventId, updates) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");

    const event = await this.getEventById(eventId);
    if (event.createdBy !== auth.currentUser.uid) {
      throw new Error("Permissão negada. Apenas o criador pode editar.");
    }

    const normalized = normalizeEvent({ ...event, ...updates });
    const docRef = doc(firestore, EVENTS_COLLECTION, eventId);
    await updateDoc(docRef, { ...normalized, updatedAt: serverTimestamp() });

    return { id: eventId, ...normalized };
  },

  async deleteEvent(eventId) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");

    const event = await this.getEventById(eventId);
    if (event.createdBy !== auth.currentUser.uid) {
      throw new Error("Permissão negada. Apenas o criador pode deletar.");
    }

    const docRef = doc(firestore, EVENTS_COLLECTION, eventId);
    await deleteDoc(docRef);
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
      rsvpDate: serverTimestamp(),
    };

    const eventSnap = await getDoc(doc(firestore, EVENTS_COLLECTION, eventId));
    if (!eventSnap.exists()) throw new Error("Evento não encontrado.");

    const meuDoc = await getDoc(participantRef(eventId, uid));
    if (meuDoc.exists()) {
      throw new Error("Você já confirmou presença neste evento.");
    }

    // O limite de vagas continua sendo checado aqui, no cliente, como já era.
    // Regra do Firestore não consegue contar uma subcoleção, então duas pessoas
    // confirmando no mesmo instante ainda podem estourar o teto por um. Quem
    // precisar de teto duro precisa de Cloud Function.
    const maxParticipants = eventSnap.data().maxParticipants || 0;
    if (maxParticipants > 0 && (await contarParticipantes(eventId)) >= maxParticipants) {
      throw new Error("Evento lotado. Desculpe!");
    }

    await setDoc(participantRef(eventId, uid), participantData);

    grantOwn("event_rsvp");
    // "Seu evento com N confirmados", para quem organizou. Conta a
    // subcoleção de participantes — o mesmo número que decide a lotação.
    const organizer = eventSnap.data().createdBy;
    if (organizer) {
      contarParticipantes(eventId)
        .then((total) => grantSeries(String(organizer), "event_attendees", total))
        .catch(() => {});
    }
    return participantData;
  },

  async cancelRsvp(eventId) {
    if (!auth.currentUser) throw new Error("Usuário não autenticado.");

    const uid = auth.currentUser.uid;
    const meuDoc = await getDoc(participantRef(eventId, uid));
    if (!meuDoc.exists()) {
      throw new Error("Você não confirmou presença neste evento.");
    }

    await deleteDoc(participantRef(eventId, uid));
  },

  async getEventParticipants(eventId) {
    const snapshot = await getDocs(participantsRef(eventId));
    return snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }));
  },

  /** Quantos confirmaram. Vem da subcoleção, então não sai de sincronia. */
  async countParticipants(eventId) {
    return contarParticipantes(eventId);
  },

  async isUserRsvped(eventId) {
    if (!auth.currentUser) return false;

    try {
      const meuDoc = await getDoc(participantRef(eventId, auth.currentUser.uid));
      return meuDoc.exists();
    } catch {
      return false;
    }
  },
};
