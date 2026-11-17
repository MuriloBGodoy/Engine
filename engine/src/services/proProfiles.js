import { must, supabase } from "./supabase";

/**
 * Conta profissional e página profissional (migration 20261101130000).
 *
 *   kind "person" — "Anunciar como você": a própria pessoa, mesmo @, com
 *                   categoria, contato, horário e área (como o "mudar para
 *                   conta profissional" do Instagram/TikTok).
 *   kind "page"   — "Criar página profissional": @ próprio no mesmo registro
 *                   dos @ das pessoas, logo, capa, bio e equipe com papéis
 *                   owner/admin/editor (como a Página do Facebook).
 *
 * Quem pode o quê é do banco (RLS + funções). Daqui só se pergunta e grava.
 * Mora fora do db.js de propósito: aquele arquivo é editado por várias frentes.
 */

export const PRO_ROLES = ["owner", "admin", "editor"];
export const PRO_HANDLE_PATTERN = /^[a-z0-9._]{3,24}$/;
export const PRO_PUBLIC_BASE_PATH = "/p";

// O que o perfil guarda em `data` — a mesma lista de pro_profile_clean_data.
export const PRO_DATA_KEYS = [
  "category", "bio", "hours", "address", "city", "state", "country", "serviceArea",
  "whatsapp", "whatsappCountry", "email", "instagram", "tiktok", "website", "logo", "cover",
  "hideContact",
];

export const emptyProData = () => ({
  category: "",
  bio: "",
  hours: "",
  address: "",
  city: "",
  state: "",
  country: "BR",
  serviceArea: "",
  whatsapp: "",
  whatsappCountry: "+55",
  email: "",
  instagram: "",
  tiktok: "",
  website: "",
  logo: "",
  cover: "",
  hideContact: false,
});

export const proProfileFromRow = (row = {}) => ({
  id: row.id,
  kind: row.kind === "page" ? "page" : "person",
  userId: row.user_id || "",
  handle: row.handle || "",
  name: row.name || "",
  data: { ...emptyProData(), ...(row.data || {}) },
  suspended: Boolean(row.suspended),
  createdBy: row.created_by || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** "@" + handle, limpo como o banco limpa. */
export const cleanHandle = (value = "") =>
  String(value || "").trim().replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 24);

/** Caminho público: página pelo @ dela; pessoa pelo @ do perfil. */
export const proProfilePath = (profile, personUsername = "") => {
  const handle = profile?.kind === "page" ? profile.handle : cleanHandle(personUsername);
  return handle ? `${PRO_PUBLIC_BASE_PATH}/${encodeURIComponent(handle)}` : "";
};

export const canEditProfile = (role) => role === "owner" || role === "admin";
export const canManageTeam = (role) => role === "owner" || role === "admin";

// Códigos que o banco devolve e a tela explica (pro.errors.*).
const PRO_ERRORS = new Set([
  "not-signed-in", "not-found", "invalid-handle", "invalid-name", "handle-taken",
  "too-many-pages", "invalid-role", "forbidden-role", "user-not-found", "already-member",
  "team-full", "last-owner", "account-suspended",
]);
export const proErrorKey = (error) => {
  const code = String(error?.message || error?.code || "");
  return PRO_ERRORS.has(code) ? `pro.errors.${code}` : "pro.errors.generic";
};

/**
 * Todos os perfis em que eu estou (o meu pessoal, páginas e convites), com o
 * meu papel. `[{ profile, role, status }]`.
 */
export async function fetchMyProProfiles(userId) {
  if (!userId) return [];
  const rows = must(
    await supabase
      .from("pro_profile_members")
      .select("role, status, profile_id, pro_profiles(*)")
      .eq("user_id", userId),
  );
  return rows
    .filter((row) => row.pro_profiles)
    .map((row) => ({ profile: proProfileFromRow(row.pro_profiles), role: row.role, status: row.status }))
    .sort((a, b) => (a.profile.kind === b.profile.kind ? 0 : a.profile.kind === "person" ? -1 : 1));
}

/** "Anunciar como você": cria ou atualiza o meu perfil profissional. */
export const saveMyProfessional = async ({ name = "", data = {} }) =>
  must(await supabase.rpc("save_my_professional", { p_name: name, p_data: pickData(data) }));

export const createProPage = async ({ handle, name, data = {} }) =>
  must(await supabase.rpc("create_pro_page", { p_handle: cleanHandle(handle), p_name: name, p_data: pickData(data) }));

export async function updateProProfile(id, { name, data }) {
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (data !== undefined) patch.data = pickData(data);
  const rows = must(await supabase.from("pro_profiles").update(patch).eq("id", id).select("*"));
  if (!rows.length) throw new Error("not-found");
  return proProfileFromRow(rows[0]);
}

/** Apaga a página (owner) ou volta para conta pessoal. Os anúncios vão junto. */
export async function deleteProProfile(id) {
  const rows = must(await supabase.from("pro_profiles").delete().eq("id", id).select("id"));
  if (!rows.length) throw new Error("not-found");
}

/** "available" | "taken" | "invalid" | "reserved". Null sem rede. */
export async function checkHandle(handle) {
  try {
    return must(await supabase.rpc("handle_available", { p_handle: cleanHandle(handle) }));
  } catch {
    return null;
  }
}

/** { type: "person"|"page"|"club"|"event", id, handle, proProfileId? } ou null. */
export async function resolveHandle(text) {
  return must(await supabase.rpc("resolve_handle", { p_text: String(text || "") }));
}

export const fetchTeam = async (profileId) =>
  must(await supabase.rpc("pro_team", { p_profile: profileId })) || [];

export const inviteMember = async (profileId, username, role) =>
  must(await supabase.rpc("invite_pro_member", { p_profile: profileId, p_username: cleanHandle(username), p_role: role }));

export const respondInvite = async (profileId, accept) =>
  must(await supabase.rpc("respond_pro_invite", { p_profile: profileId, p_accept: Boolean(accept) }));

export const removeMember = async (profileId, userId) =>
  must(await supabase.rpc("remove_pro_member", { p_profile: profileId, p_user: userId }));

export const setMemberRole = async (profileId, userId, role) =>
  must(await supabase.rpc("set_pro_member_role", { p_profile: profileId, p_user: userId, p_role: role }));

/**
 * Perfil público pelo @ (página ou pessoa com conta profissional).
 * `{ profile, person }` — `person` é o cartão público da pessoa (só kind
 * "person"). `{ redirect }` quando o @ é de alguém sem conta profissional
 * (vai para o perfil da comunidade). Null quando não existe.
 */
export async function fetchProProfileByHandle(handle) {
  const resolved = await resolveHandle(handle);
  if (!resolved) return null;
  if (resolved.type === "person" && !resolved.proProfileId) {
    return { redirect: `/community/@${resolved.handle}` };
  }
  const profileId = resolved.type === "page" ? resolved.id : resolved.proProfileId;
  if (!profileId) return null;
  const row = must(await supabase.from("pro_profiles").select("*").eq("id", profileId).maybeSingle());
  if (!row) return null;
  const profile = proProfileFromRow(row);
  let person = null;
  if (profile.kind === "person") {
    const card = must(
      await supabase.from("public_profiles").select("username, author, data").eq("user_id", profile.userId).maybeSingle(),
    );
    person = card
      ? { username: card.username || `@${resolved.handle}`, author: card.author || "", avatar: card.data?.avatar || "", cover: card.data?.cover || "" }
      : { username: `@${resolved.handle}`, author: "", avatar: "", cover: "" };
  }
  return { profile, person };
}

/** Perfil pelo id (o do anúncio), com o cartão da pessoa quando é pessoal. */
export async function fetchProProfileById(profileId) {
  if (!profileId) return null;
  const row = must(await supabase.from("pro_profiles").select("*").eq("id", profileId).maybeSingle());
  if (!row) return null;
  const profile = proProfileFromRow(row);
  let person = null;
  if (profile.kind === "person") {
    const card = must(
      await supabase.from("public_profiles").select("username, author, data").eq("user_id", profile.userId).maybeSingle(),
    );
    person = card ? { username: card.username || "", author: card.author || "", avatar: card.data?.avatar || "", cover: card.data?.cover || "" } : null;
  }
  return { profile, person };
}

/** Nome e foto para mostrar (página: o dela; pessoa: o do perfil). */
export const proDisplay = (profile, person = null) => ({
  name: profile?.name || person?.author || (profile?.handle ? `@${profile.handle}` : ""),
  handle: profile?.kind === "page" ? `@${profile.handle}` : person?.username || "",
  logo: profile?.kind === "page" ? profile.data.logo : person?.avatar || "",
  cover: profile?.kind === "page" ? profile.data.cover : person?.cover || "",
});

function pickData(data = {}) {
  const out = {};
  for (const key of PRO_DATA_KEYS) {
    const value = data[key];
    if (key === "hideContact") {
      out.hideContact = Boolean(value);
    } else if (value !== undefined && value !== null && String(value).trim() !== "") {
      out[key] = String(value).trim();
    }
  }
  return out;
}

/* ------------------------------------------------------------ diretório -- */

const escapeLike = (value) => String(value || "").replace(/[\\%_,()]/g, (char) => `\\${char}`);

/**
 * Quem atende: o diretório público de contas profissionais e páginas.
 *
 * Isto faltava, e a falta era grave. Até aqui dava para CRIAR uma conta
 * profissional e para abrir uma pelo @ (`fetchProProfileByHandle`), mas não
 * havia como LISTAR nenhuma — nem em Serviços, nem na Buscar. Uma oficina
 * montava a conta e ficava invisível: só achava quem já soubesse o @ dela.
 * Numa praça onde o prestador é quem paga, a vitrine dele não pode depender
 * de alguém já conhecê-lo.
 *
 * Não precisou de migration: a política "pro: vitrine publica" já libera o
 * SELECT de qualquer perfil não suspenso (migration 20261101130000), e a
 * suspensão da conta da pessoa é conferida lá dentro, no
 * `pro_profile_visible`. Aqui só se pergunta.
 *
 * Devolve `[{ profile, person, path }]`. `person` vem do cartão público e só
 * existe em kind "person" — é de lá que sai o @ (a linha de pro_profiles tem
 * `handle` nulo nesse caso, por regra da própria tabela) e o retrato.
 */
export async function listProProfiles({ term = "", category = "", state = "", limit = 24 } = {}) {
  let consulta = supabase.from("pro_profiles").select("*").eq("suspended", false);

  if (category) consulta = consulta.eq("data->>category", category);
  if (state) consulta = consulta.eq("data->>state", state);

  const alvo = String(term || "").trim();
  if (alvo.length >= 2) {
    // O nome serve para os dois tipos; o @ só existe na página. Quem procura
    // pelo @ de uma PESSOA cai na busca de perfis, que já existe.
    const like = `%${escapeLike(alvo)}%`;
    consulta = consulta.or(`name.ilike.${like},handle.ilike.${like}`);
  }

  const rows = must(await consulta.order("updated_at", { ascending: false }).limit(Math.max(1, limit)));
  const perfis = rows.map(proProfileFromRow);

  // Os cartões das pessoas em uma leitura só, não uma por perfil.
  const pessoas = new Map();
  const ids = perfis.filter((perfil) => perfil.kind === "person" && perfil.userId).map((perfil) => perfil.userId);
  if (ids.length) {
    const cartoes = must(
      await supabase.from("public_profiles").select("user_id, username, author, data").in("user_id", ids),
    );
    for (const cartao of cartoes) {
      pessoas.set(cartao.user_id, {
        username: cartao.username || "",
        author: cartao.author || "",
        avatar: cartao.data?.avatar || "",
        cover: cartao.data?.cover || "",
      });
    }
  }

  return perfis
    .map((profile) => {
      const person = profile.kind === "person" ? pessoas.get(profile.userId) || null : null;
      return { profile, person, path: proProfilePath(profile, person?.username || "") };
    })
    // Sem caminho não há para onde levar: perfil pessoal cujo @ ainda não
    // existe no cartão público fica de fora em vez de virar link morto.
    .filter((item) => Boolean(item.path));
}

/** O diretório filtrado pelo que a pessoa digitou, sem ir ao servidor por tecla. */
export const proMatchesTerm = (item, alvo = "") => {
  if (!alvo) return true;
  const { profile, person } = item;
  return [profile.name, profile.handle, person?.author, person?.username, profile.data.city, profile.data.state]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(alvo.toLowerCase());
};
