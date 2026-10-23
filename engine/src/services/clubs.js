/**
 * Clubes — camada de dados, falando com o Supabase direto.
 *
 * A forma do que sai daqui é o `CLUBES-CONTRATO.md` §1 e §2, e a razão de cada
 * campo é o `CLUBES-MODELO.md` §2. Três regras de forma valem para tudo:
 *
 *   - data sai como string ISO;
 *   - cor sai como NOME da paleta ("azul-noite"), nunca hex — quem traduz é a
 *     tela, e é isso que permite trocar a paleta inteira sem tocar em dado;
 *   - campo que falta sai como "", [] ou null, nunca `undefined`, para a tela
 *     não precisar de `?.` em toda linha.
 *
 * O que mudou com o Supabase (16/10/2026), e por que o arquivo encolheu:
 *
 *   - "Meus clubes" é uma consulta em `club_members` com o clube junto. O
 *     espelho `users/{uid}/clubs`, que existia só para fugir da consulta de
 *     grupo do Firestore, deixou de existir.
 *   - A sigla única é restrição da tabela; o registro `clubTags/` acabou.
 *   - `member_count` é mantido pelo banco a partir das linhas de membro.
 *     Entrar e sair não mexem mais em contador nenhum.
 *   - Quem pode o quê (fundador, capitão, membro) é decidido pelas políticas
 *     e funções do banco — ver `supabase/migrations`. A checagem aqui é para
 *     dar o erro certo à tela, não para proteger nada.
 *
 * `postCount` continua não existindo: contador que ninguém mantém honesto é
 * número inventado com aparência de dado.
 */
import { useCallback, useEffect, useState } from "react";
import { auth, must, supabase } from "./supabase";
import { grantAchievement, grantOwn, grantSeries } from "./achievements";
import { engineDB, goalFromRow, isUserId, normalizeCommunityGoal, POST_KIND_POST } from "./db";
import { eventFromRow } from "./events";
import { normalizeFipeBrand } from "./fipeVersion";

const PAPEIS_DE_CARGO = ["founder", "captain"];

/** Quantos membros a garagem automática varre. Ver CLUBES-CONTRATO.md §5. */
export const GARAGEM_MAX_MEMBROS = 50;

/** A linha do banco no formato de documento que `normalizeClub` sempre leu. */
const clubFromRow = (row) => ({
  ...(row.data || {}),
  founderId: row.founder_id || "",
  tag: row.tag,
  nameLower: row.name_lower,
  archived: row.archived,
  official: row.official,
  memberCount: row.member_count,
  country: row.country,
  state: row.state,
  joinPolicy: row.join_policy,
  contentVisibility: row.content_visibility,
  focus: {
    ...(row.data?.focus || {}),
    brands: row.focus_brands || [],
    styles: row.focus_styles || [],
  },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const memberFromRow = (row) => ({
  role: row.role,
  joinedAt: row.joined_at,
  displayName: row.display_name,
  username: row.username,
  avatar: row.avatar,
});

const contar = async (request) => {
  const { count, error } = await request;
  if (error) throw error;
  return count || 0;
};

/**
 * Degraus de "seu clube chegou a N membros", para quem fundou. Conta as
 * linhas de membro, que só o banco escreve com honestidade. Sem await em quem
 * chama: falhar aqui não pode desfazer a entrada.
 */
const concederMembrosAoFundador = async (clubId, founderId) => {
  if (!founderId) return;
  try {
    const total = await contar(
      supabase.from("club_members").select("*", { count: "exact", head: true }).eq("club_id", String(clubId)),
    );
    await grantSeries(String(founderId), "club_members", total);
  } catch {
    // Conquista é enfeite: a entrada no clube já aconteceu.
  }
};

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

/** Date, string ou carimbo antigo do Firestore → string ISO. Nunca `undefined`. */
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
 * O clube como a tela recebe (contrato §1). Linha migrada do Firestore e
 * linha nova caem todas aqui: o que falta vira "", [] ou
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
    // Busca por prefixo num campo já em minúsculas.
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
 * Consulta de leitura que, se falhar, vira seção vazia em vez de tela
 * quebrada. O aviso no console nomeia a consulta para quem for investigar não
 * concluir "não tem clube" quando é "deu erro".
 */
const tentarConsulta = async (nome, executar) => {
  const { data, error } = await executar();
  if (error) {
    console.warn(`[clubes] consulta falhou (${nome}).`, error.message || error);
    return null;
  }
  return data;
};

const rowsParaClubes = (rows) => rows.map((row) => normalizeClub(row.id, clubFromRow(row)));

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
    const row = must(await supabase.from("clubs").select("id").eq("tag", limpa).maybeSingle());
    return !row;
  } catch {
    // Sem conseguir ler, é mais honesto deixar o formulário seguir e falhar na
    // criação (com `tag-taken`) do que pintar de vermelho uma sigla livre.
    return true;
  }
}

/** O próximo encontro datado do clube. */
const proximoEncontro = async (clubId) => {
  const rows = await tentarConsulta("events por clube", () =>
    supabase
      .from("events")
      .select("*")
      .eq("club_id", String(clubId))
      .gte("event_date", hojeISO())
      .order("event_date", { ascending: true })
      .limit(1),
  );
  const primeiro = rows?.[0];
  if (!primeiro) return null;
  const evento = eventFromRow(primeiro);
  return {
    id: evento.id,
    title: texto(evento.title, 120),
    eventDate: texto(evento.eventDate, 32),
    city: texto(evento.location, 120),
  };
};

const minhaLinha = async (tabela, clubId, uid) =>
  uid
    ? supabase
        .from(tabela)
        .select("*")
        .eq("club_id", String(clubId))
        .eq("uid", uid)
        .maybeSingle()
        .then(must)
        .catch(() => null)
    : null;

export async function getClub(clubId) {
  if (!clubId) throw erroDeClube("not-found", "Clube não encontrado.");
  const row = must(await supabase.from("clubs").select("*").eq("id", String(clubId)).maybeSingle());
  if (!row) throw erroDeClube("not-found", "Clube não encontrado.");

  const uid = auth.currentUser?.uid || null;

  const [meuDoc, meuPedido, encontro, contagem, realizados] = await Promise.all([
    minhaLinha("club_members", clubId, uid),
    minhaLinha("club_requests", clubId, uid),
    proximoEncontro(clubId),
    contar(
      supabase.from("club_members").select("*", { count: "exact", head: true }).eq("club_id", String(clubId)),
    ).catch(() => null),
    contar(
      supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("club_id", String(clubId))
        .lt("event_date", hojeISO()),
    ).catch(() => 0),
  ]);

  // Em clube `contentVisibility: members`, quem é de fora não enxerga a lista
  // de membros — e a contagem dela daria só a própria linha. `null` = não deu
  // para contar; aí a tela cai no `memberCount` de vitrine.
  const fechadoParaMim = row.content_visibility === "members" && !meuDoc;

  return normalizeClub(row.id, clubFromRow(row), {
    myRole: meuDoc ? normalizeMember(uid, memberFromRow(meuDoc)).role : null,
    myRequestPending: Boolean(meuPedido),
    nextMeetup: encontro,
    memberCountLive: fechadoParaMim ? null : contagem,
    meetupsHeld: realizados ?? 0,
  });
}

/** Meus clubes: as minhas linhas de membro, com o clube junto. */
export async function getMyClubs() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const rows = must(await supabase.from("club_members").select("role, clubs(*)").eq("uid", uid));

  return rows
    .filter((item) => item.clubs)
    .map((item) =>
      normalizeClub(item.clubs.id, clubFromRow(item.clubs), {
        myRole: normalizeMember(uid, { role: item.role }).role,
      }),
    )
    .filter((club) => !club.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const clubesPorIds = async (ids) => {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return [];
  const rows = must(await supabase.from("clubs").select("*").in("id", unicos));
  return rowsParaClubes(rows).filter((club) => !club.archived);
};

/**
 * Descoberta (contrato §3). Quatro seções, e seção vazia simplesmente não
 * aparece — "Nenhum clube perto de você" ocupando espaço é pior que nada.
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
      tentarConsulta("clubs por nome", () =>
        supabase
          .from("clubs")
          .select("*")
          .eq("archived", false)
          .ilike("name_lower", `${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
          .order("name_lower")
          .limit(teto),
      ),
      tentarConsulta("clubs por sigla", () =>
        supabase.from("clubs").select("*").eq("tag", normalizeTag(busca)).limit(5),
      ),
    ]);

    const achados = [...rowsParaClubes(porSigla || []), ...rowsParaClubes(porNome || [])].filter(
      (club) => !club.archived,
    );
    secoes.all = semRepetir(achados);
    return secoes;
  }

  // "Pro seu carro": o gancho mais forte que existe aqui — só o Engine tem a
  // garagem com vocabulário FIPE. Modelo §2.2.
  if (auth.currentUser) {
    const carros = await engineDB.getCars().catch(() => []);
    const marcas = [
      ...new Set(carros.map((carro) => texto(carro.brand, 40)).filter(Boolean)),
    ].slice(0, 3);
    // Os dois lados: o rótulo cru da FIPE (`VW - VolksWagen`), que clube
    // antigo e seed podem ter gravado, e a forma canônica, que é o que o
    // formulário grava agora.
    const procuradas = [...new Set(marcas.flatMap((marca) => [marca, canonicalBrand(marca)]).filter(Boolean))];
    if (procuradas.length) {
      const rows = await tentarConsulta("clubs por marca", () =>
        supabase
          .from("clubs")
          .select("*")
          .eq("archived", false)
          .overlaps("focus_brands", procuradas)
          .order("member_count", { ascending: false })
          .limit(8 * marcas.length),
      );
      secoes.forYourCar = semRepetir(ordenarPorVitrine(rowsParaClubes(rows || []))).slice(0, teto);
    }
  }

  // "Em alta" = clube com ENCONTRO MARCADO nos próximos 30 dias. Uma coisa só,
  // verificável, e que ninguém precisa forjar: o dado vem de `events`.
  const agenda = await tentarConsulta("events dos próximos 30 dias", () =>
    supabase
      .from("events")
      .select("club_id, event_date")
      .neq("club_id", "")
      .gte("event_date", hojeISO())
      .lte("event_date", emDias(30))
      .order("event_date", { ascending: true })
      .limit(60),
  );
  if (agenda) {
    const idsComEncontro = agenda.map((item) => texto(item.club_id, 64)).filter(Boolean);
    const comEncontro = await clubesPorIds(idsComEncontro.slice(0, 12));
    // A ordem é a do encontro mais próximo; o desempate é a vitrine.
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
    const coluna = style ? "focus_styles" : "focus_brands";
    // Chip de estilo vai como está (vocabulário fechado); marca vai canônica,
    // pelo mesmo motivo do "pro seu carro".
    const valorDoEixo = style ? filtroDeEixo : canonicalBrand(filtroDeEixo);
    const rows = await tentarConsulta(`clubs por ${coluna}`, () =>
      supabase
        .from("clubs")
        .select("*")
        .eq("archived", false)
        .contains(coluna, [valorDoEixo])
        .order("member_count", { ascending: false })
        .limit(teto * 2),
    );
    resto = rowsParaClubes(rows || []);
    // Clube sem estado é NACIONAL e nunca é escondido — mesma leniência do
    // `matchesRegion` da pílula de região.
    if (state) resto = resto.filter((club) => !club.state || club.state === state);
    if (country) resto = resto.filter((club) => !club.country || club.country === country);
  } else {
    if (state || country) {
      const perto = await tentarConsulta("clubs por região", () => {
        let request = supabase.from("clubs").select("*").eq("archived", false);
        if (country) request = request.eq("country", country);
        if (state) request = request.eq("state", state);
        return request.order("member_count", { ascending: false }).limit(teto);
      });
      if (perto) secoes.nearby = semRepetir(ordenarPorVitrine(rowsParaClubes(perto))).slice(0, teto);
    }

    const todos = await tentarConsulta("todos os clubes", () =>
      supabase
        .from("clubs")
        .select("*")
        .eq("archived", false)
        .order("member_count", { ascending: false })
        .limit(teto * 2),
    );
    resto = rowsParaClubes(todos || []);
  }

  secoes.all = semRepetir(ordenarPorVitrine(resto)).slice(0, teto);
  return secoes;
}

/** Membros: fundador primeiro, depois capitães, depois o resto por entrada. */
export async function getClubMembers(clubId, { limit: teto = 50 } = {}) {
  if (!clubId) return [];
  const rows = await tentarConsulta("membros do clube", () =>
    supabase
      .from("club_members")
      .select("*")
      .eq("club_id", String(clubId))
      .order("joined_at", { ascending: true })
      .limit(teto),
  );
  if (!rows) return [];

  const peso = { founder: 0, captain: 1, member: 2 };
  return rows
    .map((row) => normalizeMember(row.uid, memberFromRow(row)))
    .sort((a, b) => (peso[a.role] ?? 2) - (peso[b.role] ?? 2));
}

/**
 * Mural: são as publicações da Comunidade carimbadas com `club_id`. Ganham de
 * graça card, curtida, comentário, denúncia e bloqueio — e o post aparece no
 * feed geral com o chip `[TAG]`, que é propaganda do clube.
 */
export async function getClubPosts(clubId, { limit: teto = 20 } = {}) {
  if (!clubId) return [];
  const rows = await tentarConsulta("mural do clube", () =>
    supabase
      .from("community_goals")
      .select("*")
      .eq("club_id", String(clubId))
      .order("created_at", { ascending: false })
      .limit(teto),
  );
  if (!rows) return [];
  return rows.map((row) => normalizeCommunityGoal(goalFromRow(row)));
}

/** Encontros do clube. `past: true` traz os que já foram, do mais recente. */
export async function getClubEvents(clubId, { past = false, limit: teto = 20 } = {}) {
  if (!clubId) return [];
  const hoje = hojeISO();
  const rows = await tentarConsulta("encontros do clube", () => {
    const base = supabase.from("events").select("*").eq("club_id", String(clubId));
    return (past ? base.lt("event_date", hoje) : base.gte("event_date", hoje))
      .order("event_date", { ascending: !past })
      .limit(teto);
  });
  if (!rows) return [];
  return rows.map(eventFromRow);
}

/**
 * Garagem do clube, fase 1: DERIVADA, sem escrita nova e sem contador.
 *
 * A garagem de cada pessoa é privada. A única representação pública de um
 * carro é a meta publicada na Comunidade, onde o dono já escolheu o que expor.
 * Então a garagem do clube é a meta publicada de quem é membro — até 50
 * membros, e a tela diz isso.
 *
 * O post livre sai aqui, no cliente: publicação de meta anterior aos posts não
 * tem `kind`, e "sem kind é meta" é a regra do `normalizeCommunityGoal`.
 */
export async function getClubGarage(clubId, { limit: teto = 24 } = {}) {
  if (!clubId) return [];

  const membros = await getClubMembers(clubId, { limit: GARAGEM_MAX_MEMBROS });
  const uids = membros.map((membro) => membro.uid).filter(isUserId);
  if (!uids.length) return [];

  const [rows, linhaDoClube] = await Promise.all([
    supabase.from("community_goals").select("*").in("owner_id", uids).then(must).catch(() => []),
    supabase.from("clubs").select("*").eq("id", String(clubId)).maybeSingle().then(must).catch(() => null),
  ]);

  const foco = linhaDoClube
    ? normalizeClub(linhaDoClube.id, clubFromRow(linhaDoClube)).focus
    : { brands: [], models: [], styles: [] };
  const marcas = new Set(foco.brands.map((item) => canonicalBrand(item).toUpperCase()));
  const modelos = foco.models.map((item) => item.toUpperCase());

  const carros = rows
    .map(goalFromRow)
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

/** Pedidos pendentes. Só capitão e fundador leem — quem garante é o banco. */
export async function listRequests(clubId) {
  if (!clubId) return [];
  const papel = await getMembershipStatus(clubId);
  if (!PAPEIS_DE_CARGO.includes(papel)) {
    throw erroDeClube("not-allowed", "Só a direção do clube vê os pedidos.");
  }
  const rows = must(
    await supabase
      .from("club_requests")
      .select("*")
      .eq("club_id", String(clubId))
      .order("created_at", { ascending: true }),
  );
  return rows.map((row) => ({
    uid: row.uid,
    displayName: texto(row.display_name, 60) || "Usuário Engine",
    username: texto(row.username, 32),
    avatar: String(row.avatar ?? ""),
    message: texto(row.message, 200),
    createdAt: paraIso(row.created_at),
  }));
}

export async function getMembershipStatus(clubId) {
  const uid = auth.currentUser?.uid;
  if (!uid || !clubId) return "none";
  const [membro, pedido] = await Promise.all([
    minhaLinha("club_members", clubId, uid),
    minhaLinha("club_requests", clubId, uid),
  ]);
  if (membro) return normalizeMember(uid, memberFromRow(membro)).role;
  if (pedido) return "pending";
  return "none";
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/**
 * Criação do clube: clube + fundador num passo só, tudo ou nada, dentro do
 * banco (`create_club`). A unicidade da sigla é restrição da tabela — dois
 * formulários enviados no mesmo segundo não passam os dois.
 */
export async function createClub(form) {
  const uid = exigeLogin();
  const dados = normalizeClubParaEscrita(form);

  // Checagem otimista, só para dar erro bom antes de enviar. Quem decide de
  // verdade é a restrição única.
  if (!(await checkTagAvailable(dados.tag))) {
    throw erroDeClube("tag-taken", `A sigla ${dados.tag} já está em uso.`);
  }

  const perfil = await perfilDoUsuario();
  let id;
  try {
    id = must(await supabase.rpc("create_club", { p_club: dados, p_member: perfil }));
  } catch (erro) {
    if (erro.code === "tag-taken") {
      throw erroDeClube("tag-taken", `A sigla ${dados.tag} já está em uso.`);
    }
    throw erro;
  }

  // Fundou e, por consequência, entrou. Sem await: conquista é enfeite e não
  // pode atrasar a criação.
  grantOwn("club_founder");
  grantOwn("club_joined");

  const criado = await supabase.from("clubs").select("*").eq("id", id).maybeSingle().then(must).catch(() => null);
  return criado
    ? normalizeClub(id, clubFromRow(criado), { myRole: "founder" })
    : normalizeClub(id, { ...dados, founderId: uid, memberCount: 1 }, { myRole: "founder" });
}

/**
 * Entrar. Clube aberto entra na hora; clube de aprovação cria o pedido e
 * espera. O contador de membros quem soma é o banco.
 */
export async function joinClub(clubId) {
  const uid = exigeLogin();
  const row = must(await supabase.from("clubs").select("*").eq("id", String(clubId)).maybeSingle());
  if (!row) throw erroDeClube("not-found", "Clube não encontrado.");

  const club = normalizeClub(row.id, clubFromRow(row));
  if (club.archived) throw erroDeClube("club-archived", "Este clube foi arquivado.");

  const jaSou = await minhaLinha("club_members", clubId, uid);
  if (jaSou) return normalizeMember(uid, memberFromRow(jaSou)).role;

  const perfil = await perfilDoUsuario();
  const cartao = {
    display_name: perfil.displayName,
    username: perfil.username,
    avatar: perfil.avatar,
  };

  if (club.joinPolicy === "approval") {
    const pedido = await minhaLinha("club_requests", clubId, uid);
    if (pedido) {
      throw erroDeClube("already-requested", "Seu pedido já está na fila.");
    }
    must(await supabase.from("club_requests").insert({ club_id: String(clubId), uid, message: "", ...cartao }));
    return "pending";
  }

  must(await supabase.from("club_members").insert({ club_id: String(clubId), uid, role: "member", ...cartao }));

  grantOwn("club_joined");
  concederMembrosAoFundador(clubId, club.founderId);
  return "member";
}

/** Sair. Fundador não sai: ele transfere (fase 2) ou arquiva. */
export async function leaveClub(clubId) {
  const uid = exigeLogin();
  const meuDoc = await minhaLinha("club_members", clubId, uid);
  if (!meuDoc) throw erroDeClube("not-member", "Você não é membro deste clube.");

  if (normalizeMember(uid, memberFromRow(meuDoc)).role === "founder") {
    throw erroDeClube(
      "founder-cannot-leave",
      "Fundador não sai do clube: transfira a fundação ou arquive o clube.",
    );
  }

  must(await supabase.from("club_members").delete().eq("club_id", String(clubId)).eq("uid", uid));
  return "none";
}

const exigeCargo = async (clubId, cargos = PAPEIS_DE_CARGO) => {
  const uid = exigeLogin();
  const meuDoc = await minhaLinha("club_members", clubId, uid);
  if (!meuDoc) throw erroDeClube("not-member", "Você não é membro deste clube.");
  const role = normalizeMember(uid, memberFromRow(meuDoc)).role;
  if (!cargos.includes(role)) {
    throw erroDeClube("not-allowed", "Esta ação é da direção do clube.");
  }
  return { uid, role };
};

/**
 * Aprovar pedido: a direção cria a linha de membro de outra pessoa — o único
 * ponto de escrita alheia do modelo, e o banco o prende a dois fatos: existir
 * um pedido daquela pessoa, e quem escreve ter cargo. O pedido some sozinho
 * quando a pessoa vira membro.
 */
export async function approveRequest(clubId, alvoUid) {
  await exigeCargo(clubId);
  const pedido = must(
    await supabase
      .from("club_requests")
      .select("*")
      .eq("club_id", String(clubId))
      .eq("uid", String(alvoUid))
      .maybeSingle(),
  );
  if (!pedido) throw erroDeClube("not-found", "Pedido não encontrado.");

  const row = must(await supabase.from("clubs").select("founder_id").eq("id", String(clubId)).single());

  must(
    await supabase.from("club_members").insert({
      club_id: String(clubId),
      uid: String(alvoUid),
      role: "member",
      display_name: texto(pedido.display_name, 60) || "Usuário Engine",
      username: texto(pedido.username, 32),
      avatar: String(pedido.avatar ?? ""),
    }),
  );

  // Quem aprova concede a quem entrou — escrita no perfil alheio, que o banco
  // permite só para ids da lista fechada.
  grantAchievement(alvoUid, "club_joined").catch(() => false);
  concederMembrosAoFundador(clubId, row.founder_id);
}

export async function rejectRequest(clubId, alvoUid) {
  await exigeCargo(clubId);
  must(
    await supabase.from("club_requests").delete().eq("club_id", String(clubId)).eq("uid", String(alvoUid)),
  );
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
  must(
    await supabase
      .from("club_members")
      .update({ role })
      .eq("club_id", String(clubId))
      .eq("uid", String(alvoUid)),
  );
}

export async function removeMember(clubId, alvoUid) {
  const { uid } = await exigeCargo(clubId);
  if (String(alvoUid) === uid) throw erroDeClube("not-allowed", "Use sair do clube.");

  must(
    await supabase.from("club_members").delete().eq("club_id", String(clubId)).eq("uid", String(alvoUid)),
  );
}

/**
 * Editar. O que cada cargo pode mudar é filtrado AQUI e conferido de novo no
 * banco (`update_club`) — filtrar só aqui seria checagem que existe em React.
 */
export async function updateClub(clubId, parcial = {}) {
  const { role } = await exigeCargo(clubId);
  const atual = must(await supabase.from("clubs").select("*").eq("id", String(clubId)).maybeSingle());
  if (!atual) throw erroDeClube("not-found", "Clube não encontrado.");

  const completo = normalizeClubParaEscrita({
    ...normalizeClub(clubId, clubFromRow(atual)),
    ...parcial,
  });

  // Sigla não muda na fase 1: mudar sigla é mudar identidade.
  const permitidos =
    role === "founder" ? Object.keys(completo).filter((campo) => campo !== "tag") : CAMPOS_DO_CAPITAO;

  const mudancas = {};
  for (const campo of permitidos) {
    if (campo in parcial) mudancas[campo] = completo[campo];
  }
  // Nome e busca por prefixo andam juntos.
  if ("name" in mudancas) mudancas.nameLower = completo.nameLower;

  if (!Object.keys(mudancas).length) {
    throw erroDeClube("not-allowed", "Nada que você possa editar foi alterado.");
  }

  must(await supabase.rpc("update_club", { p_club_id: String(clubId), p_patch: mudancas }));
  return getClub(clubId);
}

/** Arquivar em vez de apagar: membros e sigla continuam apontando para algo. */
export async function archiveClub(clubId) {
  await exigeCargo(clubId, ["founder"]);
  must(await supabase.rpc("archive_club", { p_club_id: String(clubId) }));
}

/**
 * Post no mural. Passa pelo MESMO caminho de escrita do feed
 * (`engineDB.createCommunityPost`). Um segundo caminho de escrita para a
 * mesma tabela é como se ganham seis bugs num dia.
 */
export async function createClubPost(clubId, { text, images = [], videoUrl = "", car = null }) {
  const row = must(await supabase.from("clubs").select("*").eq("id", String(clubId)).maybeSingle());
  if (!row) throw erroDeClube("not-found", "Clube não encontrado.");
  const club = normalizeClub(row.id, clubFromRow(row));

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
    // O mural são as publicações da Comunidade: curtir e apagar post de clube
    // é curtir e apagar publicação, pelo caminho que já existe.
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
