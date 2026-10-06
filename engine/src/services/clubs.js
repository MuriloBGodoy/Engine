/**
 * Clubes — camada de dados, falando com o Firestore direto.
 *
 * O que este arquivo era até 22/09/2026: um cliente HTTP do backend Java
 * (`clubsRequest` → `VITE_API_URL`). E `.env.production` tem essa variável
 * VAZIA, então em produção toda chamada ia para `undefined/api/clubs` e
 * estourava. Clubes não estava "pouco usado": estava MORTO no site publicado,
 * desde sempre, e a tela mostrava lista vazia — que soa como ausência e não
 * como erro. É o mesmo defeito que a feature de Eventos teve em agosto, pelo
 * mesmo motivo de fundo: caminho de dado que só existe em dev.
 *
 * A forma do que sai daqui é o `CLUBES-CONTRATO.md` §1 e §2, e a razão de cada
 * campo é o `CLUBES-MODELO.md` §2. Três regras de forma valem para tudo:
 *
 *   - data sai como string ISO; `Timestamp` do Firestore não chega em
 *     componente nenhum;
 *   - cor sai como NOME da paleta ("azul-noite"), nunca hex — quem traduz é a
 *     tela, e é isso que permite trocar a paleta inteira sem tocar em dado;
 *   - campo que falta sai como "", [] ou null, nunca `undefined`, para a tela
 *     não precisar de `?.` em toda linha.
 *
 * Duas coisas que NÃO existem aqui, de propósito:
 *
 *   - `collectionGroup`. "Meus clubes" lê o espelho `users/{uid}/clubs`.
 *     Consulta de grupo não passa pela regra aninhada, pede match recursivo e
 *     índice COLLECTION_GROUP — a porta que o override de `members.userId`
 *     deixava aberta no `firestore.indexes.json` e que saiu junto com este
 *     port.
 *   - `postCount`. Contador que ninguém mantém honesto é número inventado com
 *     aparência de dado. Quantos posts o mural tem, se a tela algum dia pedir,
 *     sai de agregação.
 */
import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit as limitTo,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, firestore } from "./firebase";
import { grantAchievement, grantOwn, grantSeries } from "./achievements";
import { engineDB, normalizeCommunityGoal, POST_KIND_POST } from "./db";
import { normalizeFipeBrand } from "./fipeVersion";

const CLUBS = "clubs";
const MEMBERS = "members";
const REQUESTS = "requests";
const CLUB_TAGS = "clubTags";
const USERS = "users";
const USER_CLUBS = "clubs";
const COMMUNITY = "communityGoals";
const EVENTS = "events";

const PAPEIS_DE_CARGO = ["founder", "captain"];

/** Quantos membros a garagem automática varre. Ver CLUBES-CONTRATO.md §5. */
export const GARAGEM_MAX_MEMBROS = 50;

/** Teto do `in` do Firestore: a consulta da garagem vai em lotes deste tamanho. */
const LOTE_IN = 30;

const clubRef = (clubId) => doc(firestore, CLUBS, String(clubId));
const membersRef = (clubId) => collection(firestore, CLUBS, String(clubId), MEMBERS);
const memberRef = (clubId, uid) => doc(firestore, CLUBS, String(clubId), MEMBERS, String(uid));

/**
 * Degraus de "seu clube chegou a N membros", para quem fundou. Conta a
 * SUBCOLEÇÃO de membros, nunca o `memberCount` do clube: aquele é número de
 * vitrine que cada membro incrementa, e empurrá-lo daria o selo sem gente.
 * Sem await em quem chama: falhar aqui não pode desfazer a entrada.
 */
const concederMembrosAoFundador = async (clubId, founderId) => {
  if (!founderId) return;
  try {
    const total = (await getCountFromServer(membersRef(clubId))).data().count;
    await grantSeries(String(founderId), "club_members", total);
  } catch {
    // Conquista é enfeite: a entrada no clube já aconteceu.
  }
};
const requestsRef = (clubId) => collection(firestore, CLUBS, String(clubId), REQUESTS);
const requestRef = (clubId, uid) => doc(firestore, CLUBS, String(clubId), REQUESTS, String(uid));
const tagRef = (tag) => doc(firestore, CLUB_TAGS, String(tag));
const mirrorRef = (uid, clubId) => doc(firestore, USERS, String(uid), USER_CLUBS, String(clubId));

// ---------------------------------------------------------------------------
// Erros
//
// A tela reage DIFERENTE para cada um destes (contrato §4): sigla ocupada
// pinta o campo de vermelho sem perder o formulário, "não é membro" manda
// entrar no clube, "sem cargo" quer dizer que um botão apareceu e não devia.
// Por isso o código é do dado e a frase é do i18n: a mensagem em pt-BR aqui é
// último recurso, quem decide o texto da tela é a Jesse.
// ---------------------------------------------------------------------------

const erroDeClube = (code, mensagem) => {
  const erro = new Error(mensagem);
  erro.code = code;
  return erro;
};

const exigeLogin = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw erroDeClube("not-signed-in", "Entre na sua conta para continuar.");
  return uid;
};

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/** `Timestamp` do Firestore, Date ou string → string ISO. Nunca `undefined`. */
const paraIso = (valor) => {
  if (!valor) return "";
  if (typeof valor === "string") return valor;
  if (typeof valor?.toDate === "function") return valor.toDate().toISOString();
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor?.seconds === "number") return new Date(valor.seconds * 1000).toISOString();
  return "";
};

const texto = (valor, tamanho) => String(valor ?? "").trim().slice(0, tamanho);

const lista = (valor, quantos, tamanho) =>
  (Array.isArray(valor) ? valor : [])
    .map((item) => texto(item, tamanho))
    .filter(Boolean)
    .slice(0, quantos);

/** Hoje em `YYYY-MM-DD`: é assim que `events.eventDate` é gravado e comparado. */
const hojeISO = () => new Date().toISOString().slice(0, 10);

const emDias = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

/**
 * Marca do clube em forma canônica.
 *
 * O casamento de "clubes pro seu carro" é IGUALDADE DE STRING contra o
 * `car.brand` da garagem, e esse campo guarda o rótulo cru da FIPE — literalmente
 * `VW - VolksWagen`, `GM - Chevrolet`. Já o campo de marca do formulário do
 * clube é texto livre: quem funda digita "Volkswagen", "volkswagen" ou "VW".
 * Sem nivelar os dois lados, a seção mais forte da descoberta nunca acha
 * nada — e o pior é que ela falha calada, como uma seção sem clube.
 *
 * `normalizeFipeBrand` já tira o prefixo e resolve os apelidos; o que falta é
 * a caixa, e só da primeira letra de cada palavra — `VolksWagen` e `BMW` têm
 * maiúscula no meio de propósito e não podem ser achatados.
 */
export const canonicalBrand = (valor) => {
  const limpa = normalizeFipeBrand(valor);
  if (!limpa) return "";
  return limpa
    .split(" ")
    .map((palavra) =>
      palavra === palavra.toLowerCase()
        ? palavra.charAt(0).toUpperCase() + palavra.slice(1)
        : palavra,
    )
    .join(" ");
};

export const TAG_REGEX = /^[A-Z0-9]{2,5}$/;

/** Sigla é sempre maiúscula e sem símbolo — o que a pessoa digita é sugestão. */
export const normalizeTag = (tag) =>
  String(tag ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

/**
 * O clube como a tela recebe (contrato §1). Documento antigo, documento do
 * backend Java e documento novo caem todos aqui: o que falta vira "", [] ou
 * null, e nada sai como `undefined`.
 */
const normalizeClub = (id, dados = {}, derivados = {}) => ({
  id: String(id),
  name: texto(dados.name, 40),
  nameLower: texto(dados.nameLower || dados.name, 40).toLowerCase(),
  tag: normalizeTag(dados.tag),
  motto: texto(dados.motto, 60),
  description: texto(dados.description, 500),
  emblem: {
    shape: texto(dados.emblem?.shape, 12) || "plate",
    icon: texto(dados.emblem?.icon, 24) || "wheel",
  },
  // NOME da paleta, nunca hex: o hex mora no tema, em clubStyles.js. É o que
  // permite trocar a paleta inteira depois sem tocar em dado nenhum. O padrão
  // é o mesmo `DEFAULT_CLUB_COLOR` de lá — nome de cor fora da paleta não
  // quebra a tela (ela cai numa cor qualquer), e por isso passaria batido.
  colors: {
    primary: texto(dados.colors?.primary, 32) || "azul-mercosul",
    secondary: texto(dados.colors?.secondary, 32),
  },
  cover: String(dados.cover ?? ""),
  country: texto(dados.country, 4) || "BR",
  state: texto(dados.state, 8),
  city: texto(dados.city, 60),
  foundedYear: Number(dados.foundedYear) || 0,
  meetupSchedule: texto(dados.meetupSchedule, 80),
  focus: {
    brands: lista(dados.focus?.brands, 3, 40),
    models: lista(dados.focus?.models, 3, 40),
    styles: lista(dados.focus?.styles, 3, 24),
  },
  rules: lista(dados.rules, 5, 120),
  links: {
    instagram: texto(dados.links?.instagram, 60),
    whatsapp: texto(dados.links?.whatsapp, 200),
    facebook: texto(dados.links?.facebook, 200),
    website: texto(dados.links?.website, 200),
  },
  joinPolicy: dados.joinPolicy === "approval" ? "approval" : "open",
  contentVisibility: dados.contentVisibility === "members" ? "members" : "public",
  founderId: texto(dados.founderId, 64),
  // VITRINE. Serve para a grade, onde contar clube a clube seria uma agregação
  // por card. O número em destaque da página do clube é `memberCountLive`.
  memberCount: Math.max(Number(dados.memberCount) || 0, 0),
  official: Boolean(dados.official),
  archived: Boolean(dados.archived),
  createdAt: paraIso(dados.createdAt),
  updatedAt: paraIso(dados.updatedAt),

  // Derivados: não moram no documento, quem consulta preenche.
  myRole: null,
  myRequestPending: false,
  nextMeetup: null,
  ...derivados,
});

const normalizeMember = (uid, dados = {}) => ({
  uid: String(uid),
  role: PAPEIS_DE_CARGO.includes(dados.role) ? dados.role : "member",
  joinedAt: paraIso(dados.joinedAt),
  displayName: texto(dados.displayName, 60) || "Usuário Engine",
  username: texto(dados.username, 32),
  avatar: String(dados.avatar ?? ""),
});

/**
 * Valida e apara o formulário antes de escrever. Os limites são os do modelo
 * §2.1, não sugestão de UI: nome de clube real é curto ("FuscaPoços",
 * "Air Cooled BH") e 40 caracteres cabem no card sem truncar.
 */
const normalizeClubParaEscrita = (form = {}) => {
  const name = texto(form.name, 40);
  if (name.length < 3) {
    throw erroDeClube("name-invalid", "O nome do clube precisa de 3 a 40 caracteres.");
  }

  const tag = normalizeTag(form.tag);
  if (!TAG_REGEX.test(tag)) {
    throw erroDeClube("tag-invalid", "A sigla tem de 2 a 5 letras ou números.");
  }

  const focus = {
    // Gravada já canônica: é o único jeito de "Honda" digitado por um e
    // "honda" digitado por outro caírem no mesmo clube na descoberta.
    brands: lista(form.focus?.brands, 3, 40).map(canonicalBrand).filter(Boolean),
    models: lista(form.focus?.models, 3, 40).map((item) => item.toUpperCase()),
    styles: lista(form.focus?.styles, 3, 24),
  };
  // Pelo menos um eixo de foco. Um clube sem foco nenhum não entra em seção
  // nenhuma da descoberta — nasceria invisível.
  if (!focus.brands.length && !focus.models.length && !focus.styles.length) {
    throw erroDeClube("focus-empty", "Escolha ao menos uma marca, modelo ou estilo.");
  }

  const anoAtual = new Date().getFullYear();
  const ano = Number(form.foundedYear) || 0;

  return {
    name,
    // Busca por prefixo precisa de um campo já em minúsculas: o Firestore não
    // tem comparação que ignore caixa.
    nameLower: name.toLowerCase(),
    tag,
    motto: texto(form.motto, 60),
    description: texto(form.description, 500),
    emblem: {
      shape: texto(form.emblem?.shape, 12) || "plate",
      icon: texto(form.emblem?.icon, 24) || "wheel",
    },
    colors: {
      primary: texto(form.colors?.primary, 32) || "azul-mercosul",
      secondary: texto(form.colors?.secondary, 32),
    },
    cover: String(form.cover ?? ""),
    country: texto(form.country, 4).toUpperCase() || "BR",
    state: texto(form.state, 8).toUpperCase(),
    city: texto(form.city, 60),
    // Fundação pode ser MUITO anterior ao Engine: Civic Club Brasil diz "desde
    // 1972", Fusca Clube do Brasil, 1985.
    foundedYear: ano >= 1950 && ano <= anoAtual ? ano : 0,
    meetupSchedule: texto(form.meetupSchedule, 80),
    focus,
    rules: lista(form.rules, 5, 120),
    links: {
      instagram: texto(form.links?.instagram, 60).replace(/^@+/, ""),
      whatsapp: texto(form.links?.whatsapp, 200),
      facebook: texto(form.links?.facebook, 200),
      website: texto(form.links?.website, 200),
    },
    // `invite` é fase 2: sem tela de convite, um clube assim ficaria sem
    // NENHUMA porta de entrada.
    joinPolicy: form.joinPolicy === "approval" ? "approval" : "open",
    contentVisibility: form.contentVisibility === "members" ? "members" : "public",
  };
};

/** Campos que o capitão pode editar. Identidade é do fundador (modelo §2.4). */
const CAMPOS_DO_CAPITAO = ["description", "rules", "links", "meetupSchedule", "cover"];

/**
 * Nome, @ e avatar viajam junto do doc de membro, como já acontece em
 * `followers`: sem isso, montar a lista de 50 membros seria 50 leituras de
 * perfil.
 */
const perfilDoUsuario = async () => {
  try {
    const settings = await engineDB.getSettings();
    const perfil = settings?.profile || {};
    return {
      displayName:
        texto(perfil.displayName || auth.currentUser?.displayName, 60) || "Usuário Engine",
      username: texto(perfil.username, 32),
      avatar: String(perfil.avatar ?? ""),
    };
  } catch {
    return {
      displayName: texto(auth.currentUser?.displayName, 60) || "Usuário Engine",
      username: "",
      avatar: "",
    };
  }
};

/**
 * Consulta que depende de índice composto. Enquanto o índice não estiver
 * publicado, o Firestore devolve `failed-precondition` — e aí a tela tem que
 * mostrar seção vazia, não quebrar. O aviso no console nomeia o índice para
 * quem for investigar não concluir "não tem clube" quando é "falta índice".
 */
const tentarConsulta = async (nomeDoIndice, executar) => {
  try {
    return await executar();
  } catch (erro) {
    if (erro?.code === "failed-precondition") {
      console.warn(
        `[clubes] consulta sem índice publicado (${nomeDoIndice}). ` +
          "Veja firestore.indexes.json — precisa de deploy.",
        erro?.message || "",
      );
      return null;
    }
    if (erro?.code === "permission-denied") return null;
    throw erro;
  }
};

const docsParaClubes = (snapshot) =>
  snapshot.docs.map((item) => normalizeClub(item.id, item.data()));

/**
 * Clube oficial do Engine é semente: ele enche a grade no dia 1 e ensina pelo
 * exemplo o que é um clube bem preenchido. Mas ele não compete com clube de
 * gente — por isso vai para o fim de cada seção (modelo §5).
 */
const ordenarPorVitrine = (clubes) =>
  [...clubes].sort((a, b) => {
    if (a.official !== b.official) return a.official ? 1 : -1;
    return (b.memberCount || 0) - (a.memberCount || 0);
  });

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** Sigla livre? `false` também para sigla malformada — o formato a tela valida. */
export async function checkTagAvailable(tag) {
  const limpa = normalizeTag(tag);
  if (!TAG_REGEX.test(limpa)) return false;
  try {
    const snapshot = await getDoc(tagRef(limpa));
    return !snapshot.exists();
  } catch {
    // Ler `clubTags` exige login. Sem conseguir ler, é mais honesto deixar o
    // formulário seguir e falhar na criação (com `tag-taken`) do que pintar de
    // vermelho uma sigla que pode estar livre.
    return true;
  }
}

/** O próximo encontro datado do clube. Índice: `events` clubId + eventDate. */
const proximoEncontro = async (clubId) => {
  const snapshot = await tentarConsulta("events: clubId asc, eventDate asc", () =>
    getDocs(
      query(
        collection(firestore, EVENTS),
        where("clubId", "==", String(clubId)),
        where("eventDate", ">=", hojeISO()),
        orderBy("eventDate", "asc"),
        limitTo(1),
      ),
    ),
  );
  const primeiro = snapshot?.docs?.[0];
  if (!primeiro) return null;
  const dados = primeiro.data();
  return {
    id: primeiro.id,
    title: texto(dados.title, 120),
    eventDate: texto(dados.eventDate, 32),
    city: texto(dados.location, 120),
  };
};

export async function getClub(clubId) {
  if (!clubId) throw erroDeClube("not-found", "Clube não encontrado.");
  const snapshot = await getDoc(clubRef(clubId));
  if (!snapshot.exists()) throw erroDeClube("not-found", "Clube não encontrado.");

  const uid = auth.currentUser?.uid || null;

  // Em clube `contentVisibility: members`, quem não é membro tem a leitura do
  // próprio doc de membro NEGADA pela regra — o que é a resposta certa, não um
  // erro de tela. Por isso cada uma destas leituras cai em null sozinha.
  const [meuDoc, meuPedido, encontro, contagem, realizados] = await Promise.all([
    uid ? getDoc(memberRef(clubId, uid)).catch(() => null) : Promise.resolve(null),
    uid ? getDoc(requestRef(clubId, uid)).catch(() => null) : Promise.resolve(null),
    proximoEncontro(clubId),
    getCountFromServer(membersRef(clubId))
      .then((item) => item.data().count)
      .catch(() => null),
    tentarConsulta("events: clubId asc, eventDate asc", () =>
      getCountFromServer(
        query(
          collection(firestore, EVENTS),
          where("clubId", "==", String(clubId)),
          where("eventDate", "<", hojeISO()),
          orderBy("eventDate", "asc"),
        ),
      ).then((item) => item.data().count),
    ),
  ]);

  return normalizeClub(snapshot.id, snapshot.data(), {
    myRole: meuDoc?.exists() ? normalizeMember(uid, meuDoc.data()).role : null,
    myRequestPending: Boolean(meuPedido?.exists()),
    nextMeetup: encontro,
    // O número em DESTAQUE da página é agregação, não vitrine: é uma tela só,
    // e vitrine é forjável em ±1 por escrita. `null` = não deu para contar
    // (clube fechado visto de fora); aí a tela cai no `memberCount`.
    memberCountLive: contagem,
    meetupsHeld: realizados ?? 0,
  });
}

/**
 * Meus clubes: lê o espelho `users/{uid}/clubs` e hidrata os documentos. Uma
 * leitura da lista + N leituras diretas, nenhuma consulta de grupo.
 */
export async function getMyClubs() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const espelho = await getDocs(collection(firestore, USERS, uid, USER_CLUBS));
  if (espelho.empty) return [];

  const clubes = await Promise.all(
    espelho.docs.map(async (item) => {
      const snapshot = await getDoc(clubRef(item.id)).catch(() => null);
      if (!snapshot?.exists()) return null;
      return normalizeClub(snapshot.id, snapshot.data(), {
        myRole: normalizeMember(uid, item.data()).role,
      });
    }),
  );

  return clubes
    .filter((club) => club && !club.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const clubesPorIds = async (ids) => {
  const unicos = [...new Set(ids.filter(Boolean))];
  const docs = await Promise.all(unicos.map((id) => getDoc(clubRef(id)).catch(() => null)));
  return docs
    .filter((item) => item?.exists())
    .map((item) => normalizeClub(item.id, item.data()))
    .filter((club) => !club.archived);
};

/**
 * Descoberta (contrato §3). Quatro seções, e seção vazia simplesmente não
 * aparece — "Nenhum clube perto de você" ocupando espaço é pior que nada.
 *
 * Limite conhecido e deliberado: só UM eixo vai para o servidor. Estilo e
 * marca são `array-contains`, e o Firestore aceita um por consulta; combinar
 * estilo com estado exigiria um índice por combinação (estado × estilo ×
 * marca), então quando há filtro de estilo/marca o recorte de região é feito
 * aqui, sobre o resultado. Modelo §5.
 */
export async function discoverClubs(filtros = {}) {
  const {
    country = "",
    state = "",
    style = "",
    brand = "",
    search = "",
    limit: teto = 24,
  } = filtros;

  const secoes = { forYourCar: [], trending: [], nearby: [], all: [] };
  const jaVistos = new Set();
  const semRepetir = (clubes) => {
    const novos = clubes.filter((club) => !jaVistos.has(club.id));
    novos.forEach((club) => jaVistos.add(club.id));
    return novos;
  };

  const busca = texto(search, 40).toLowerCase();

  // Busca é excludente: quem digitou quer o que digitou, não quatro trilhos.
  if (busca) {
    const [porNome, porSigla] = await Promise.all([
      tentarConsulta("clubs: archived asc, nameLower asc", () =>
        getDocs(
          query(
            collection(firestore, CLUBS),
            where("archived", "==", false),
            where("nameLower", ">=", busca),
            where("nameLower", "<=", `${busca}`),
            orderBy("nameLower"),
            limitTo(teto),
          ),
        ),
      ),
      getDocs(
        query(collection(firestore, CLUBS), where("tag", "==", normalizeTag(busca)), limitTo(5)),
      ).catch(() => null),
    ]);

    const achados = [
      ...(porSigla ? docsParaClubes(porSigla) : []),
      ...(porNome ? docsParaClubes(porNome) : []),
    ].filter((club) => !club.archived);
    secoes.all = semRepetir(achados);
    return secoes;
  }

  // "Pro seu carro": o gancho mais forte que existe aqui, e nenhum app de crew
  // pesquisado faz isso — só o Engine tem a garagem com vocabulário FIPE, e aí
  // é igualdade de string, sem parser. Modelo §2.2.
  if (auth.currentUser) {
    const carros = await engineDB.getCars().catch(() => []);
    const marcas = [
      ...new Set(carros.map((carro) => texto(carro.brand, 40)).filter(Boolean)),
    ].slice(0, 3);
    const porMarca = await Promise.all(
      marcas.map((marca) =>
        tentarConsulta("clubs: archived asc, focus.brands contains, memberCount desc", () =>
          getDocs(
            query(
              collection(firestore, CLUBS),
              where("archived", "==", false),
              // Os dois lados: o rótulo cru da FIPE (`VW - VolksWagen`), que é
              // o que clube antigo e seed podem ter gravado, e a forma
              // canônica, que é o que o formulário grava agora.
              // `array-contains-any` usa o MESMO índice do `array-contains`.
              where(
                "focus.brands",
                "array-contains-any",
                [...new Set([marca, canonicalBrand(marca)].filter(Boolean))],
              ),
              orderBy("memberCount", "desc"),
              limitTo(8),
            ),
          ),
        ),
      ),
    );
    const achados = porMarca.filter(Boolean).flatMap(docsParaClubes);
    secoes.forYourCar = semRepetir(ordenarPorVitrine(achados)).slice(0, teto);
  }

  // "Em alta" = clube com ENCONTRO MARCADO nos próximos 30 dias. Uma coisa só,
  // verificável, e que ninguém precisa forjar: o dado vem de `events`. Não é
  // "engajamento" nem contagem de post — clube com encontro marcado está vivo
  // por definição.
  const agenda = await tentarConsulta("events: eventDate (campo único)", () =>
    getDocs(
      query(
        collection(firestore, EVENTS),
        where("eventDate", ">=", hojeISO()),
        where("eventDate", "<=", emDias(30)),
        orderBy("eventDate", "asc"),
        limitTo(60),
      ),
    ),
  );
  if (agenda) {
    const idsComEncontro = agenda.docs
      .map((item) => texto(item.data().clubId, 64))
      .filter(Boolean);
    const comEncontro = await clubesPorIds(idsComEncontro.slice(0, 12));
    // A ordem é a do encontro mais próximo, que é a ordem em que a consulta já
    // veio; o desempate é a vitrine.
    const posicao = new Map(idsComEncontro.map((id, i) => [id, i]));
    secoes.trending = semRepetir(
      [...comEncontro].sort((a, b) => {
        if (a.official !== b.official) return a.official ? 1 : -1;
        return (posicao.get(a.id) ?? 99) - (posicao.get(b.id) ?? 99);
      }),
    ).slice(0, teto);
  }

  const filtroDeEixo = texto(style, 24) || texto(brand, 40);
  let resto = [];

  if (filtroDeEixo) {
    const campo = style ? "focus.styles" : "focus.brands";
    // Chip de estilo vai como está (vocabulário fechado); marca vai canônica,
    // pelo mesmo motivo do "pro seu carro".
    const valorDoEixo = style ? filtroDeEixo : canonicalBrand(filtroDeEixo);
    const snapshot = await tentarConsulta(
      `clubs: archived asc, ${campo} contains, memberCount desc`,
      () =>
        getDocs(
          query(
            collection(firestore, CLUBS),
            where("archived", "==", false),
            where(campo, "array-contains", valorDoEixo),
            orderBy("memberCount", "desc"),
            limitTo(teto * 2),
          ),
        ),
    );
    resto = snapshot ? docsParaClubes(snapshot) : [];
    // Região vira filtro de cliente aqui. Clube sem estado é NACIONAL e nunca
    // é escondido — mesma leniência do `matchesRegion` da pílula de região.
    if (state) resto = resto.filter((club) => !club.state || club.state === state);
    if (country) resto = resto.filter((club) => !club.country || club.country === country);
  } else {
    const perto =
      state || country
        ? await tentarConsulta(
            "clubs: archived asc, country asc, state asc, memberCount desc",
            () =>
              getDocs(
                query(
                  collection(firestore, CLUBS),
                  where("archived", "==", false),
                  ...(country ? [where("country", "==", country)] : []),
                  ...(state ? [where("state", "==", state)] : []),
                  orderBy("memberCount", "desc"),
                  limitTo(teto),
                ),
              ),
          )
        : null;
    if (perto) secoes.nearby = semRepetir(ordenarPorVitrine(docsParaClubes(perto))).slice(0, teto);

    const todos = await tentarConsulta("clubs: archived asc, memberCount desc", () =>
      getDocs(
        query(
          collection(firestore, CLUBS),
          where("archived", "==", false),
          orderBy("memberCount", "desc"),
          limitTo(teto * 2),
        ),
      ),
    );
    resto = todos ? docsParaClubes(todos) : [];
  }

  secoes.all = semRepetir(ordenarPorVitrine(resto)).slice(0, teto);
  return secoes;
}

/** Membros: fundador primeiro, depois capitães, depois o resto por entrada. */
export async function getClubMembers(clubId, { limit: teto = 50 } = {}) {
  if (!clubId) return [];
  const snapshot = await tentarConsulta("members: joinedAt (campo único)", () =>
    getDocs(query(membersRef(clubId), orderBy("joinedAt", "asc"), limitTo(teto))),
  );
  if (!snapshot) return [];

  const peso = { founder: 0, captain: 1, member: 2 };
  return snapshot.docs
    .map((item) => normalizeMember(item.id, item.data()))
    .sort((a, b) => (peso[a.role] ?? 2) - (peso[b.role] ?? 2));
}

/**
 * Mural: é `communityGoals` carimbado com `clubId`, não coleção nova. Ganha de
 * graça card, curtida em subcoleção, comentário, denúncia e bloqueio — e o
 * post aparece no feed geral com o chip `[TAG]`, que é propaganda do clube.
 */
export async function getClubPosts(clubId, { limit: teto = 20 } = {}) {
  if (!clubId) return [];
  const snapshot = await tentarConsulta("communityGoals: clubId asc, createdAt desc", () =>
    getDocs(
      query(
        collection(firestore, COMMUNITY),
        where("clubId", "==", String(clubId)),
        orderBy("createdAt", "desc"),
        limitTo(teto),
      ),
    ),
  );
  if (!snapshot) return [];
  return snapshot.docs.map((item) => normalizeCommunityGoal({ id: item.id, ...item.data() }));
}

/** Encontros do clube. `past: true` traz os que já foram, do mais recente. */
export async function getClubEvents(clubId, { past = false, limit: teto = 20 } = {}) {
  if (!clubId) return [];
  const hoje = hojeISO();
  const snapshot = await tentarConsulta("events: clubId asc, eventDate asc", () =>
    getDocs(
      query(
        collection(firestore, EVENTS),
        where("clubId", "==", String(clubId)),
        where("eventDate", past ? "<" : ">=", hoje),
        orderBy("eventDate", past ? "desc" : "asc"),
        limitTo(teto),
      ),
    ),
  );
  if (!snapshot) return [];
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

/**
 * Garagem do clube, fase 1: DERIVADA, sem escrita nova e sem contador.
 *
 * `users/{uid}/cars` é privado por regra — ninguém além do dono lê a garagem
 * de alguém. A única representação pública de um carro é a meta publicada na
 * Comunidade, onde o dono já escolheu o que expor. Então a garagem do clube é
 * a meta publicada de quem é membro.
 *
 * Duas decisões que não são óbvias:
 *
 *   - a consulta NÃO filtra `kind == "goal"` no servidor. Publicação de meta
 *     anterior aos posts livres não tem o campo `kind` — "sem kind é meta" é a
 *     regra do `normalizeCommunityGoal`. Filtrar no servidor apagaria da
 *     garagem justamente os carros mais antigos do app. O post livre sai aqui,
 *     no cliente, e com isso nenhum índice composto é preciso.
 *   - o limite é honesto e a tela deve dizê-lo: varre até 50 membros, em lotes
 *     de 30 (teto do `in`). Não é "todos os carros do clube", é a vitrine.
 */
export async function getClubGarage(clubId, { limit: teto = 24 } = {}) {
  if (!clubId) return [];

  const membros = await getClubMembers(clubId, { limit: GARAGEM_MAX_MEMBROS });
  const uids = membros.map((membro) => membro.uid);
  if (!uids.length) return [];

  const lotes = [];
  for (let i = 0; i < uids.length; i += LOTE_IN) lotes.push(uids.slice(i, i + LOTE_IN));

  const [resultados, snapshotDoClube] = await Promise.all([
    Promise.all(
      lotes.map((lote) =>
        getDocs(query(collection(firestore, COMMUNITY), where("ownerId", "in", lote))).catch(
          () => null,
        ),
      ),
    ),
    getDoc(clubRef(clubId)).catch(() => null),
  ]);

  const foco = snapshotDoClube?.exists()
    ? normalizeClub(snapshotDoClube.id, snapshotDoClube.data()).focus
    : { brands: [], models: [], styles: [] };
  const marcas = new Set(foco.brands.map((item) => canonicalBrand(item).toUpperCase()));
  const modelos = foco.models.map((item) => item.toUpperCase());

  const carros = resultados
    .filter(Boolean)
    .flatMap((snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    .filter((goal) => goal.kind !== POST_KIND_POST)
    .filter((goal) => goal.brand || goal.model)
    .map((goal) => ({
      goalId: String(goal.id),
      ownerId: texto(goal.ownerId, 64),
      ownerName: texto(goal.author, 60) || "Usuário Engine",
      ownerTag: texto(goal.username, 32),
      name: texto(goal.title, 80) || `${goal.brand || ""} ${goal.model || ""}`.trim(),
      image: String(goal.image ?? ""),
      brand: texto(goal.brand, 40),
      model: texto(goal.model, 80),
      year: String(goal.year ?? ""),
      createdAt: paraIso(goal.createdAt),
    }));

  // Carro que casa com o foco do clube primeiro: é o que faz a grade parecer a
  // garagem DAQUELE clube e não uma amostra aleatória.
  const casaComFoco = (carro) =>
    marcas.has(canonicalBrand(carro.brand).toUpperCase()) ||
    modelos.some((modelo) => carro.model.toUpperCase().startsWith(modelo));

  return carros
    .sort((a, b) => {
      const pesoA = casaComFoco(a) ? 0 : 1;
      const pesoB = casaComFoco(b) ? 0 : 1;
      if (pesoA !== pesoB) return pesoA - pesoB;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    })
    .slice(0, teto);
}

/** Pedidos pendentes. Só capitão e fundador leem — quem garante é a regra. */
export async function listRequests(clubId) {
  if (!clubId) return [];
  const snapshot = await getDocs(requestsRef(clubId)).catch(() => null);
  if (!snapshot) throw erroDeClube("not-allowed", "Só a direção do clube vê os pedidos.");
  return snapshot.docs.map((item) => ({
    uid: item.id,
    displayName: texto(item.data().displayName, 60) || "Usuário Engine",
    username: texto(item.data().username, 32),
    avatar: String(item.data().avatar ?? ""),
    message: texto(item.data().message, 200),
    createdAt: paraIso(item.data().createdAt),
  }));
}

export async function getMembershipStatus(clubId) {
  const uid = auth.currentUser?.uid;
  if (!uid || !clubId) return "none";
  const [membro, pedido] = await Promise.all([
    getDoc(memberRef(clubId, uid)).catch(() => null),
    getDoc(requestRef(clubId, uid)).catch(() => null),
  ]);
  if (membro?.exists()) return normalizeMember(uid, membro.data()).role;
  if (pedido?.exists()) return "pending";
  return "none";
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/**
 * Criação do clube: UM lote, quatro documentos, tudo ou nada.
 *
 *   clubs/{id} + clubTags/{TAG} + clubs/{id}/members/{uid} + users/{uid}/clubs/{id}
 *
 * A unicidade da sigla vem do registro `clubTags/{TAG}`, não de uma consulta:
 * consulta lê um instante, e dois formulários enviados no mesmo segundo
 * passariam os dois. No registro, o segundo lote bate num documento que já
 * existe e a regra (`update: if false`) derruba o lote inteiro — inclusive o
 * clube. É o mesmo mecanismo de `usernames/`.
 */
export async function createClub(form) {
  const uid = exigeLogin();
  const dados = normalizeClubParaEscrita(form);

  // Checagem otimista, só para dar erro bom antes de montar o lote. Quem
  // decide de verdade é a regra, logo abaixo.
  if (!(await checkTagAvailable(dados.tag))) {
    throw erroDeClube("tag-taken", `A sigla ${dados.tag} já está em uso.`);
  }

  const perfil = await perfilDoUsuario();
  const ref = doc(collection(firestore, CLUBS));
  const agora = serverTimestamp();

  const lote = writeBatch(firestore);
  lote.set(ref, {
    ...dados,
    founderId: uid,
    memberCount: 1,
    official: false,
    archived: false,
    createdAt: agora,
    updatedAt: agora,
  });
  lote.set(tagRef(dados.tag), { clubId: ref.id, createdBy: uid, createdAt: agora });
  lote.set(memberRef(ref.id, uid), { uid, role: "founder", joinedAt: agora, ...perfil });
  lote.set(mirrorRef(uid, ref.id), {
    clubId: ref.id,
    role: "founder",
    joinedAt: agora,
    tag: dados.tag,
    name: dados.name,
  });

  try {
    await lote.commit();
  } catch (erro) {
    // Lote atômico falha inteiro: o erro não diz QUAL escrita foi negada. A
    // sigla é de longe a causa mais provável e é a única que a tela sabe
    // tratar, então vale reconferir antes de repassar o erro cru.
    if (erro?.code === "permission-denied" && !(await checkTagAvailable(dados.tag))) {
      throw erroDeClube("tag-taken", `A sigla ${dados.tag} já está em uso.`);
    }
    throw erro;
  }

  // Fundou e, por consequência, entrou. Sem await: conquista é enfeite e não
  // pode atrasar a criação.
  grantOwn("club_founder");
  grantOwn("club_joined");

  const criado = await getDoc(ref).catch(() => null);
  return criado?.exists()
    ? normalizeClub(ref.id, criado.data(), { myRole: "founder" })
    : normalizeClub(ref.id, { ...dados, founderId: uid, memberCount: 1 }, { myRole: "founder" });
}

/**
 * Entrar. Clube aberto entra na hora (membro + espelho + vitrine, num lote);
 * clube de aprovação cria o pedido e espera.
 */
export async function joinClub(clubId) {
  const uid = exigeLogin();
  const snapshot = await getDoc(clubRef(clubId));
  if (!snapshot.exists()) throw erroDeClube("not-found", "Clube não encontrado.");

  const club = normalizeClub(snapshot.id, snapshot.data());
  if (club.archived) throw erroDeClube("club-archived", "Este clube foi arquivado.");

  const jaSou = await getDoc(memberRef(clubId, uid)).catch(() => null);
  if (jaSou?.exists()) return normalizeMember(uid, jaSou.data()).role;

  const perfil = await perfilDoUsuario();

  if (club.joinPolicy === "approval") {
    const pedido = await getDoc(requestRef(clubId, uid)).catch(() => null);
    if (pedido?.exists()) {
      throw erroDeClube("already-requested", "Seu pedido já está na fila.");
    }
    await setDoc(requestRef(clubId, uid), {
      uid,
      message: "",
      createdAt: serverTimestamp(),
      ...perfil,
    });
    return "pending";
  }

  const lote = writeBatch(firestore);
  const agora = serverTimestamp();
  lote.set(memberRef(clubId, uid), { uid, role: "member", joinedAt: agora, ...perfil });
  lote.set(mirrorRef(uid, clubId), {
    clubId: String(clubId),
    role: "member",
    joinedAt: agora,
    tag: club.tag,
    name: club.name,
  });
  // Vitrine: passo de 1, e a regra confere que quem soma virou membro NESTE
  // lote (`existsAfter`). `increment` em vez de ler-e-escrever porque duas
  // pessoas entrando ao mesmo tempo não podem gravar o mesmo número.
  lote.update(clubRef(clubId), { memberCount: increment(1), updatedAt: agora });
  await lote.commit();

  grantOwn("club_joined");
  concederMembrosAoFundador(clubId, club.founderId);
  return "member";
}

/** Sair. Fundador não sai: ele transfere (fase 2) ou arquiva. */
export async function leaveClub(clubId) {
  const uid = exigeLogin();
  const meuDoc = await getDoc(memberRef(clubId, uid)).catch(() => null);
  if (!meuDoc?.exists()) throw erroDeClube("not-member", "Você não é membro deste clube.");

  if (normalizeMember(uid, meuDoc.data()).role === "founder") {
    throw erroDeClube(
      "founder-cannot-leave",
      "Fundador não sai do clube: transfira a fundação ou arquive o clube.",
    );
  }

  const lote = writeBatch(firestore);
  lote.delete(memberRef(clubId, uid));
  lote.delete(mirrorRef(uid, clubId));
  lote.update(clubRef(clubId), { memberCount: increment(-1), updatedAt: serverTimestamp() });
  await lote.commit();
  return "none";
}

const exigeCargo = async (clubId, cargos = PAPEIS_DE_CARGO) => {
  const uid = exigeLogin();
  const meuDoc = await getDoc(memberRef(clubId, uid)).catch(() => null);
  if (!meuDoc?.exists()) throw erroDeClube("not-member", "Você não é membro deste clube.");
  const role = normalizeMember(uid, meuDoc.data()).role;
  if (!cargos.includes(role)) {
    throw erroDeClube("not-allowed", "Esta ação é da direção do clube.");
  }
  return { uid, role };
};

/**
 * Aprovar pedido: o CAPITÃO escreve o doc de membro de outra pessoa — é o
 * único ponto de escrita alheia do modelo, e a regra o prende a dois fatos:
 * existir um pedido daquele uid, e quem escreve ter cargo. O espelho de "meus
 * clubes" do aprovado entra no mesmo lote, senão ele só descobriria que entrou
 * tropeçando no clube de novo.
 */
export async function approveRequest(clubId, alvoUid) {
  await exigeCargo(clubId);
  const pedido = await getDoc(requestRef(clubId, alvoUid));
  if (!pedido.exists()) throw erroDeClube("not-found", "Pedido não encontrado.");

  const snapshot = await getDoc(clubRef(clubId));
  const club = normalizeClub(snapshot.id, snapshot.data());
  const dados = pedido.data();
  const agora = serverTimestamp();

  const lote = writeBatch(firestore);
  lote.set(memberRef(clubId, alvoUid), {
    uid: String(alvoUid),
    role: "member",
    joinedAt: agora,
    displayName: texto(dados.displayName, 60) || "Usuário Engine",
    username: texto(dados.username, 32),
    avatar: String(dados.avatar ?? ""),
  });
  lote.set(mirrorRef(alvoUid, clubId), {
    clubId: String(clubId),
    role: "member",
    joinedAt: agora,
    tag: club.tag,
    name: club.name,
  });
  lote.delete(requestRef(clubId, alvoUid));
  lote.update(clubRef(clubId), { memberCount: increment(1), updatedAt: agora });
  await lote.commit();

  // Quem aprova concede a quem entrou — é escrita no perfil alheio, que a
  // regra permite só para ids da lista fechada.
  grantAchievement(alvoUid, "club_joined").catch(() => false);
  concederMembrosAoFundador(clubId, club.founderId);
}

export async function rejectRequest(clubId, alvoUid) {
  await exigeCargo(clubId);
  await deleteDoc(requestRef(clubId, alvoUid));
}

/**
 * Promover e rebaixar são só do fundador: com três papéis, capitão mexendo em
 * cargo é o mesmo que não haver papel nenhum.
 */
export async function setMemberRole(clubId, alvoUid, role) {
  await exigeCargo(clubId, ["founder"]);
  if (!["captain", "member"].includes(role)) {
    throw erroDeClube("not-allowed", "Cargo inválido.");
  }
  await updateDoc(memberRef(clubId, alvoUid), { role });
}

export async function removeMember(clubId, alvoUid) {
  const { uid } = await exigeCargo(clubId);
  if (String(alvoUid) === uid) throw erroDeClube("not-allowed", "Use sair do clube.");

  const lote = writeBatch(firestore);
  lote.delete(memberRef(clubId, alvoUid));
  lote.delete(mirrorRef(alvoUid, clubId));
  lote.update(clubRef(clubId), { memberCount: increment(-1), updatedAt: serverTimestamp() });
  await lote.commit();
}

/**
 * Editar. O que cada cargo pode mudar é filtrado AQUI e conferido na regra —
 * filtrar só aqui seria checagem que existe em React, e checagem que só existe
 * em React não é checagem.
 */
export async function updateClub(clubId, parcial = {}) {
  const { role } = await exigeCargo(clubId);
  const atual = await getDoc(clubRef(clubId));
  if (!atual.exists()) throw erroDeClube("not-found", "Clube não encontrado.");

  const completo = normalizeClubParaEscrita({
    ...normalizeClub(clubId, atual.data()),
    ...parcial,
  });

  // Sigla não muda na fase 1: o registro em `clubTags` ficaria apontando para
  // o nada, e mudar sigla é mudar identidade.
  const permitidos =
    role === "founder" ? Object.keys(completo).filter((campo) => campo !== "tag") : CAMPOS_DO_CAPITAO;

  const mudancas = {};
  for (const campo of permitidos) {
    if (campo in parcial) mudancas[campo] = completo[campo];
  }
  // Nome e busca por prefixo andam juntos: `nameLower` sem `name` é índice
  // apontando para um nome que não existe mais.
  if ("name" in mudancas) mudancas.nameLower = completo.nameLower;

  if (!Object.keys(mudancas).length) {
    throw erroDeClube("not-allowed", "Nada que você possa editar foi alterado.");
  }

  await updateDoc(clubRef(clubId), { ...mudancas, updatedAt: serverTimestamp() });
  return getClub(clubId);
}

/**
 * Arquivar em vez de apagar: sem Cloud Function, o delete deixaria membros,
 * pedidos e a sigla registrada órfãos. Mesmo limite já documentado em eventos.
 */
export async function archiveClub(clubId) {
  await exigeCargo(clubId, ["founder"]);
  await updateDoc(clubRef(clubId), { archived: true, updatedAt: serverTimestamp() });
}

/**
 * Post no mural. Passa pelo MESMO caminho de escrita do feed
 * (`engineDB.createCommunityPost`), que já trata perfil, teto de 1 MiB do
 * documento e limite de fotos. Um segundo caminho de escrita para a mesma
 * coleção é como se ganham seis bugs num dia.
 */
export async function createClubPost(clubId, { text, images = [], videoUrl = "", car = null }) {
  const snapshot = await getDoc(clubRef(clubId));
  if (!snapshot.exists()) throw erroDeClube("not-found", "Clube não encontrado.");
  const club = normalizeClub(snapshot.id, snapshot.data());

  const status = await getMembershipStatus(clubId);
  if (!["founder", "captain", "member"].includes(status)) {
    throw erroDeClube("not-member", "Entre no clube para postar no mural.");
  }

  const id = await engineDB.createCommunityPost({
    text,
    images,
    videoUrl,
    car,
    clubId: String(clubId),
    clubTag: club.tag,
  });
  grantOwn("club_first_post");
  return id;
}

// ---------------------------------------------------------------------------
// Hooks
//
// Mesmos nomes de antes, de propósito: o diff fica legível e a tela troca o
// miolo sem caçar import. O que mudou é o formato do que eles devolvem.
// ---------------------------------------------------------------------------

const useConsulta = (executar, inicial) => {
  const [dados, setDados] = useState(inicial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const resultado = await executar(...args);
        setDados(resultado);
        return resultado;
      } catch (erro) {
        setError(erro.message);
        return inicial;
      } finally {
        setLoading(false);
      }
    },
    // `inicial` é constante por hook; entrar na lista faria o fetch mudar de
    // identidade a cada render e o useEffect da tela viraria laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [executar],
  );

  return { dados, loading, error, fetch };
};

export const useMyClubs = () => {
  const executar = useCallback(() => getMyClubs(), []);
  const { dados, loading, error, fetch } = useConsulta(executar, []);
  return { clubs: dados, loading, error, fetch };
};

export const useDiscoverClubs = () => {
  const executar = useCallback((filtros = {}) => discoverClubs(filtros), []);
  const { dados, loading, error, fetch } = useConsulta(executar, {
    forYourCar: [],
    trending: [],
    nearby: [],
    all: [],
  });
  // `clubs` é a lista achatada, para a tela de hoje continuar de pé enquanto a
  // nova não entra. Sai quando as seções forem ligadas.
  const clubs = [...dados.forYourCar, ...dados.trending, ...dados.nearby, ...dados.all];
  return { sections: dados, clubs, loading, error, fetch };
};

export const useClubDetail = (clubId) => {
  const executar = useCallback(() => (clubId ? getClub(clubId) : null), [clubId]);
  const { dados, loading, error, fetch } = useConsulta(executar, null);
  return { club: dados, isMember: Boolean(dados?.myRole), loading, error, fetch };
};

export const useClubMembers = (clubId) => {
  const executar = useCallback(
    // Aceita `{ limit }` (contrato) e o `(limit, offset)` antigo, para a tela
    // de hoje não quebrar antes de ser trocada.
    (opcoes = {}) =>
      clubId
        ? getClubMembers(clubId, typeof opcoes === "number" ? { limit: opcoes } : opcoes)
        : [],
    [clubId],
  );
  const { dados, loading, error, fetch } = useConsulta(executar, []);
  return { members: dados, hasMore: false, loading, error, fetch };
};

export const useClubPosts = (clubId) => {
  const executar = useCallback(
    (opcoes = {}) =>
      clubId ? getClubPosts(clubId, typeof opcoes === "number" ? { limit: opcoes } : opcoes) : [],
    [clubId],
  );
  const { dados, loading, error, fetch } = useConsulta(executar, []);
  return { posts: dados, hasMore: false, loading, error, fetch };
};

export const useClubEvents = (clubId, { past = false } = {}) => {
  const executar = useCallback(
    (opcoes = {}) => (clubId ? getClubEvents(clubId, { past, ...opcoes }) : []),
    [clubId, past],
  );
  const { dados, loading, error, fetch } = useConsulta(executar, []);
  return { events: dados, loading, error, fetch };
};

export const useClubGarage = (clubId) => {
  const executar = useCallback(
    (opcoes = {}) => (clubId ? getClubGarage(clubId, opcoes) : []),
    [clubId],
  );
  const { dados, loading, error, fetch } = useConsulta(executar, []);
  return { cars: dados, loading, error, fetch };
};

export const useCreateClub = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const create = useCallback(async (form) => {
    setLoading(true);
    setError(null);
    try {
      return await createClub(form);
    } catch (erro) {
      setError(erro.message);
      throw erro;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
};

export const useClubMembership = (clubId) => {
  const [status, setStatus] = useState("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!clubId) return "none";
    const atual = await getMembershipStatus(clubId).catch(() => "none");
    setStatus(atual);
    return atual;
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const agir = useCallback(async (acao) => {
    setLoading(true);
    setError(null);
    try {
      const novo = await acao();
      setStatus(novo);
      return novo;
    } catch (erro) {
      setError(erro.message);
      throw erro;
    } finally {
      setLoading(false);
    }
  }, []);

  const join = useCallback(() => agir(() => joinClub(clubId)), [agir, clubId]);
  const leave = useCallback(() => agir(() => leaveClub(clubId)), [agir, clubId]);

  return { join, leave, refresh, status, loading, error };
};

export const useClubAdmin = (clubId) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const correr = useCallback(async (acao) => {
    setLoading(true);
    setError(null);
    try {
      return await acao();
    } catch (erro) {
      setError(erro.message);
      throw erro;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    updateClub: useCallback(
      (parcial) => correr(() => updateClub(clubId, parcial)),
      [correr, clubId],
    ),
    listRequests: useCallback(() => correr(() => listRequests(clubId)), [correr, clubId]),
    approveRequest: useCallback(
      (uid) => correr(() => approveRequest(clubId, uid)),
      [correr, clubId],
    ),
    rejectRequest: useCallback(
      (uid) => correr(() => rejectRequest(clubId, uid)),
      [correr, clubId],
    ),
    promote: useCallback(
      (uid) => correr(() => setMemberRole(clubId, uid, "captain")),
      [correr, clubId],
    ),
    demote: useCallback(
      (uid) => correr(() => setMemberRole(clubId, uid, "member")),
      [correr, clubId],
    ),
    removeMember: useCallback((uid) => correr(() => removeMember(clubId, uid)), [correr, clubId]),
    archiveClub: useCallback(() => correr(() => archiveClub(clubId)), [correr, clubId]),
  };
};

// ---------------------------------------------------------------------------
// Ponte com a tela ANTIGA.
//
// Os componentes de clube de hoje importam `api.clubs.*` e dois hooks que o
// contrato não tem (`useCreatePost`, `useToggleClubMembership`). Eles estão
// sendo reescritos contra o §2; até o novo entrar, remover estes nomes
// quebraria o `npm run build` de todo mundo. Some quando a tela nova subir —
// não é API para código novo usar.
// ---------------------------------------------------------------------------

export const api = {
  clubs: {
    getMyClubs,
    discoverClubs,
    getClubById: getClub,
    createClub,
    updateClub,
    joinClub,
    leaveClub,
    getClubMembers,
    getClubPosts,
    createPost: (clubId, postData = {}) =>
      createClubPost(clubId, {
        text: postData.text ?? postData.content ?? "",
        images: postData.images || [],
        videoUrl: postData.videoUrl || "",
      }),
    // O mural é `communityGoals`: curtir e apagar post de clube é curtir e
    // apagar publicação da Comunidade, pelo caminho que já existe.
    likePost: (_clubId, postId) => engineDB.toggleCommunityLike(postId, true),
    unlikePost: (_clubId, postId) => engineDB.toggleCommunityLike(postId, false),
    deletePost: (_clubId, postId) => engineDB.deleteCommunityGoal({ id: postId }),
    deleteClub: archiveClub,
  },
};

export const useCreatePost = (clubId) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const create = useCallback(
    async (postData = {}) => {
      setLoading(true);
      setError(null);
      try {
        return await createClubPost(clubId, {
          text: postData.text ?? postData.content ?? "",
          images: postData.images || [],
          videoUrl: postData.videoUrl || "",
        });
      } catch (erro) {
        setError(erro.message);
        throw erro;
      } finally {
        setLoading(false);
      }
    },
    [clubId],
  );

  return { create, loading, error };
};

export const useToggleClubMembership = (clubId) => {
  const { join, leave, loading, error } = useClubMembership(clubId);
  const toggle = useCallback((souMembro) => (souMembro ? leave() : join()), [join, leave]);
  return { toggle, loading, error };
};
