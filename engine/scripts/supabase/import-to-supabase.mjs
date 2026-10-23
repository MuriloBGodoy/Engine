/**
 * Importa o backup do Firebase (gerado por export-firebase.mjs) no Supabase.
 *
 *   node scripts/supabase/import-to-supabase.mjs [backup.json] [--reset]
 *
 * `--reset` apaga antes tudo que já estiver no Supabase (tabelas públicas,
 * contas e as fotos migradas) — é o que torna o script repetível.
 *
 * O que ele faz, nesta ordem:
 *
 *   1. Contas. Cada uid do Firebase ganha um UUID novo (o Supabase exige
 *      UUID). A senha vai junto: o hash scrypt do Firebase entra no formato
 *      `$fbscrypt$` que o Supabase Auth sabe conferir, e no primeiro login ele
 *      mesmo troca por bcrypt. Conta Google ganha a identidade Google com o
 *      mesmo `sub`, então entrar pelo Google cai na mesma conta.
 *   2. Troca de uid. Todo texto que contém um uid antigo (ids de post
 *      `goal-<uid>-<carro>`, chaves de mapa, `targetPath`...) passa a conter o
 *      novo. Id de conversa é recalculado, porque ele é o par ORDENADO de uids
 *      e a ordem muda com o UUID.
 *   3. Fotos. Imagem em base64 dentro do documento sobe para o Storage e o
 *      banco fica só com a URL. Mesma imagem em vários lugares (o avatar
 *      copiado em post, comentário, conversa) vira um arquivo só.
 *   4. Dados, numa transação só, com `engine.trusted` ligado para os triggers
 *      deixarem passar datas e históricos originais. Contadores (curtidas,
 *      membros) são recalculados pelos próprios triggers a partir das linhas.
 *
 * Credenciais: C:\engine-credentials\supabase.env (fora do repo).
 */
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const pg = require("pg");
const { createClient } = require("@supabase/supabase-js");

const args = process.argv.slice(2);
const RESET = args.includes("--reset");
const BACKUP = args.find((arg) => !arg.startsWith("--")) || "C:/engine-credentials/firebase-export-2026-10-16.json";
const ENV_FILE = process.env.SUPABASE_ENV_FILE || "C:/engine-credentials/supabase.env";
const BUCKET = "photos";

const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const PROJECT_REF = new URL(env.SUPABASE_URL).hostname.split(".")[0];
const POOLER_HOST = process.env.SUPABASE_POOLER_HOST || "aws-1-sa-east-1.pooler.supabase.com";

const backup = JSON.parse(readFileSync(BACKUP, "utf8"));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// 1. uid antigo -> UUID novo
// ---------------------------------------------------------------------------

const uidMap = new Map(backup.users.map((user) => [user.uid, randomUUID()]));
const oldUids = [...uidMap.keys()].sort((a, b) => b.length - a.length);

const swapUids = (text) => {
  let out = text;
  for (const uid of oldUids) if (out.includes(uid)) out = out.split(uid).join(uidMap.get(uid));
  return out;
};

const deepSwap = (value) => {
  if (typeof value === "string") return swapUids(value);
  if (Array.isArray(value)) return value.map(deepSwap);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [swapUids(k), deepSwap(v)]));
  }
  return value;
};

// ---------------------------------------------------------------------------
// 3. base64 -> Storage
// ---------------------------------------------------------------------------

const uploaded = new Map();
let uploadCount = 0;

const uploadDataUri = async (dataUri) => {
  const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/is.exec(dataUri);
  if (!match) return dataUri;
  const [, mime, payload] = match;
  const bytes = Buffer.from(payload, "base64");
  const hash = createHash("sha1").update(bytes).digest("hex");
  if (uploaded.has(hash)) return uploaded.get(hash);

  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[mime] || "jpg";
  const path = `migrated/${hash}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  uploaded.set(hash, url);
  uploadCount += 1;
  return url;
};

const deepUpload = async (value) => {
  if (typeof value === "string") return value.startsWith("data:image/") ? uploadDataUri(value) : value;
  if (Array.isArray(value)) return Promise.all(value.map(deepUpload));
  if (value && typeof value === "object") {
    const entries = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await deepUpload(v)]));
    return Object.fromEntries(entries);
  }
  return value;
};

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

const known = new Set(uidMap.values());
const isUser = (id) => known.has(String(id || ""));
const iso = (value, fallback = new Date().toISOString()) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};
const omit = (object, keys) => Object.fromEntries(Object.entries(object || {}).filter(([k]) => !keys.includes(k)));
const std64 = (text) => {
  const s = String(text).replace(/-/g, "+").replace(/_/g, "/");
  return s + "=".repeat((4 - (s.length % 4)) % 4);
};

// ---------------------------------------------------------------------------
// Monta as linhas
// ---------------------------------------------------------------------------

const docs = [];
for (const item of backup.docs) {
  docs.push({ segments: swapUids(item.path).split("/"), data: await deepUpload(deepSwap(item.data)) });
}
const where = (...pattern) =>
  docs.filter(
    (d) => d.segments.length === pattern.length && pattern.every((p, i) => p === "*" || p === d.segments[i]),
  );

const rows = {
  cars: [],
  user_private: [],
  achievements: [],
  notifications: [],
  usernames: [],
  public_profiles: [],
  follows: [],
  clubs: [],
  club_members: [],
  club_requests: [],
  featured: [],
  community_goals: [],
  post_likes: [],
  events: [],
  event_participants: [],
  conversations: [],
  messages: [],
  service_listings: [],
};

for (const d of where("users", "*", "cars", "*")) {
  if (!isUser(d.segments[1])) continue;
  rows.cars.push({ user_id: d.segments[1], id: d.segments[3], data: d.data, updated_at: iso(d.data.updatedAt) });
}

const publicUsernameOf = new Map(
  where("publicProfiles", "*").map((d) => [d.segments[1], String(d.data.username || "")]),
);

for (const d of where("users", "*", "private", "*")) {
  const [, uid, , docId] = d.segments;
  if (!isUser(uid) || !["settings", "community", "moderation"].includes(docId)) continue;
  let data = d.data;
  if (docId === "settings") {
    // Quem nunca escolheu um @ tinha `@engine.<uid>` derivado do uid antigo.
    // O uid mudou, então o @ derivado mudaria junto e todo link compartilhado
    // quebraria. Fica gravado o @ que o perfil público já mostrava.
    const profile = data.profile || {};
    if (!profile.username) {
      const oldUid = [...uidMap].find(([, novo]) => novo === uid)?.[0] || "";
      const handle = publicUsernameOf.get(uid) || `@engine.${oldUid.slice(0, 6).toLowerCase()}`;
      data = { ...data, profile: { ...profile, username: handle } };
    }
  }
  rows.user_private.push({ user_id: uid, doc_id: docId, data, updated_at: iso(data.updatedAt) });
}

for (const d of where("users", "*", "achievements", "*")) {
  if (!isUser(d.segments[1])) continue;
  rows.achievements.push({
    user_id: d.segments[1],
    achievement_id: d.segments[3],
    unlocked_at: iso(d.data.unlockedAt),
  });
}

const NOTIFICATION_TYPES = [
  "follow", "like", "comment", "rating", "achievement", "message",
  "service_approved", "service_changes_requested", "service_rejected",
];

for (const d of where("users", "*", "notifications", "*")) {
  if (!isUser(d.segments[1]) || !NOTIFICATION_TYPES.includes(d.data.type)) continue;
  rows.notifications.push({
    id: randomUUID(),
    user_id: d.segments[1],
    actor_id: isUser(d.data.actorId) ? d.data.actorId : null,
    type: d.data.type,
    read: Boolean(d.data.read),
    data: omit(d.data, ["type", "read", "actorId", "recipientId", "createdAt"]),
    created_at: iso(d.data.createdAt),
  });
}

// Registro de @. O dono pode ter um @ salvo nas configurações que nunca foi
// registrado (era o caso de quem usava o @ derivado do uid).
const taken = new Map();
for (const d of where("usernames", "*")) {
  if (!isUser(d.data.userId)) continue;
  taken.set(d.segments[1], d.data.userId);
}
for (const row of rows.user_private.filter((r) => r.doc_id === "settings")) {
  const name = String(row.data.profile?.username || "").replace(/^@+/, "").toLowerCase();
  if (name && !taken.has(name)) taken.set(name, row.user_id);
}
for (const [username, userId] of taken) {
  rows.usernames.push({ username, user_id: userId, updated_at: new Date().toISOString() });
}

for (const d of where("publicProfiles", "*")) {
  const uid = d.segments[1];
  if (!isUser(uid)) continue;
  const settings = rows.user_private.find((r) => r.user_id === uid && r.doc_id === "settings");
  const username = String(d.data.username || settings?.data.profile?.username || "");
  rows.public_profiles.push({
    user_id: uid,
    username,
    author: String(d.data.author || ""),
    data: omit({ ...d.data, username }, ["id", "userId", "updatedAt"]),
    updated_at: iso(d.data.updatedAt),
  });
}

const followKey = new Map();
for (const d of where("publicProfiles", "*", "followers", "*")) {
  const [, target, , follower] = d.segments;
  if (!isUser(target) || !isUser(follower) || target === follower) continue;
  followKey.set(`${follower}>${target}`, {
    follower_id: follower,
    target_id: target,
    data: omit(d.data, ["followerId", "createdAt"]),
    created_at: iso(d.data.createdAt),
  });
}
for (const d of where("publicProfiles", "*", "following", "*")) {
  const [, follower, , target] = d.segments;
  if (!isUser(target) || !isUser(follower) || target === follower) continue;
  const key = `${follower}>${target}`;
  if (!followKey.has(key)) {
    followKey.set(key, { follower_id: follower, target_id: target, data: {}, created_at: iso(d.data.createdAt) });
  }
}
rows.follows.push(...followKey.values());

const CLUB_COLUMNS = [
  "founderId", "tag", "nameLower", "archived", "official", "memberCount", "country", "state",
  "joinPolicy", "contentVisibility", "createdAt", "updatedAt",
];
// Clube do formato do backend Java (antes do port para o Firestore, 22/09):
// sem sigla, fundador em `createdBy`, imagem em `imageUrl` e a filiação numa
// coleção à parte, `clubMemberships/{clube}/members/{uid}`. Vira clube do
// formato atual em vez de ser descartado.
const legacyTag = (name) => String(name || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
for (const d of where("clubs", "*")) {
  if (d.data.tag || !isUser(d.data.createdBy)) continue;
  const { createdBy, imageUrl } = d.data;
  const rest = omit(d.data, ["createdBy", "imageUrl", "settings", "tags"]);
  d.data = {
    ...rest,
    founderId: createdBy,
    tag: legacyTag(rest.name),
    cover: imageUrl || "",
    focus: { brands: [], models: [], styles: [] },
  };
  for (const m of where("clubMemberships", d.segments[1], "members", "*")) {
    docs.push({
      segments: ["clubs", d.segments[1], "members", m.segments[3]],
      data: {
        role: m.data.role === "owner" || m.segments[3] === createdBy ? "founder" : "member",
        joinedAt: m.data.joinedAt,
      },
    });
  }
}

for (const d of where("clubs", "*")) {
  const data = d.data;
  if (!/^[A-Z0-9]{2,5}$/.test(String(data.tag || "").toUpperCase())) continue;
  rows.clubs.push({
    id: d.segments[1],
    founder_id: isUser(data.founderId) ? data.founderId : null,
    tag: String(data.tag || "").toUpperCase(),
    name_lower: String(data.nameLower || data.name || "").toLowerCase(),
    archived: Boolean(data.archived),
    official: Boolean(data.official),
    member_count: 0,
    country: String(data.country || "BR"),
    state: String(data.state || ""),
    join_policy: data.joinPolicy === "approval" ? "approval" : "open",
    content_visibility: data.contentVisibility === "members" ? "members" : "public",
    focus_brands: Array.isArray(data.focus?.brands) ? data.focus.brands.map(String) : [],
    focus_styles: Array.isArray(data.focus?.styles) ? data.focus.styles.map(String) : [],
    data: omit(data, CLUB_COLUMNS),
    created_at: iso(data.createdAt),
    updated_at: iso(data.updatedAt),
  });
}
const clubIds = new Set(rows.clubs.map((club) => club.id));

for (const d of where("clubs", "*", "members", "*")) {
  const [, clubId, , uid] = d.segments;
  if (!clubIds.has(clubId) || !isUser(uid)) continue;
  rows.club_members.push({
    club_id: clubId,
    uid,
    role: ["founder", "captain"].includes(d.data.role) ? d.data.role : "member",
    display_name: String(d.data.displayName || ""),
    username: String(d.data.username || ""),
    avatar: String(d.data.avatar || ""),
    title: String(d.data.title || ""),
    joined_at: iso(d.data.joinedAt),
  });
}

for (const d of where("clubs", "*", "requests", "*")) {
  const [, clubId, , uid] = d.segments;
  if (!clubIds.has(clubId) || !isUser(uid)) continue;
  rows.club_requests.push({
    club_id: clubId,
    uid,
    message: String(d.data.message || ""),
    display_name: String(d.data.displayName || ""),
    username: String(d.data.username || ""),
    avatar: String(d.data.avatar || ""),
    created_at: iso(d.data.createdAt),
  });
}

for (const d of where("featured", "*")) {
  rows.featured.push({ id: d.segments[1], data: d.data, updated_at: iso(d.data.updatedAt) });
}

const GOAL_COLUMNS = [
  "id", "ownerId", "userId", "kind", "clubId", "likesCount", "likesBy", "comments", "ratingsBy",
  "createdAt", "updatedAt",
];
for (const d of where("communityGoals", "*")) {
  const data = d.data;
  const owner = data.ownerId || data.userId;
  if (!isUser(owner)) continue;
  rows.community_goals.push({
    id: d.segments[1],
    owner_id: owner,
    kind: data.kind === "post" ? "post" : "goal",
    club_id: String(data.clubId || ""),
    likes_count: 0,
    comments: Array.isArray(data.comments) ? data.comments : [],
    ratings_by: data.ratingsBy && typeof data.ratingsBy === "object" ? data.ratingsBy : {},
    data: omit(data, GOAL_COLUMNS),
    created_at: iso(data.createdAt),
    updated_at: iso(data.updatedAt),
  });
}
const goalOwner = new Map(rows.community_goals.map((goal) => [goal.id, goal.owner_id]));

const likeKey = new Map();
for (const d of where("communityGoals", "*", "likes", "*")) {
  const [, postId, , liker] = d.segments;
  if (!goalOwner.has(postId) || !isUser(liker)) continue;
  likeKey.set(`${postId}>${liker}`, { post_id: postId, liker_id: liker, created_at: iso(d.data.createdAt) });
}
// Curtidas do mapa antigo `likesBy` que a migração para subcoleção não pegou.
for (const d of where("communityGoals", "*")) {
  for (const [liker, liked] of Object.entries(d.data.likesBy || {})) {
    if (!liked || !goalOwner.has(d.segments[1]) || !isUser(liker)) continue;
    const key = `${d.segments[1]}>${liker}`;
    if (!likeKey.has(key)) likeKey.set(key, { post_id: d.segments[1], liker_id: liker, created_at: iso(null) });
  }
}
rows.post_likes.push(...likeKey.values());

const EVENT_COLUMNS = ["createdBy", "clubId", "eventDate", "type", "state", "createdAt", "updatedAt"];
for (const d of where("events", "*")) {
  if (!isUser(d.data.createdBy)) continue;
  rows.events.push({
    id: d.segments[1],
    created_by: d.data.createdBy,
    club_id: String(d.data.clubId || ""),
    event_date: String(d.data.eventDate || ""),
    type: String(d.data.type || "casual"),
    state: String(d.data.state || ""),
    data: omit(d.data, EVENT_COLUMNS),
    created_at: iso(d.data.createdAt),
    updated_at: iso(d.data.updatedAt),
  });
}
const eventIds = new Set(rows.events.map((event) => event.id));
for (const d of where("events", "*", "participants", "*")) {
  const [, eventId, , uid] = d.segments;
  if (!eventIds.has(eventId) || !isUser(uid)) continue;
  rows.event_participants.push({
    event_id: eventId,
    uid,
    data: omit(d.data, ["uid", "rsvpDate"]),
    rsvp_date: iso(d.data.rsvpDate),
  });
}

const conversationId = new Map();
for (const d of where("conversations", "*")) {
  const members = (d.data.memberIds || []).filter(isUser).sort();
  if (members.length !== 2) continue;
  const newId = `${members[0]}__${members[1]}`;
  conversationId.set(d.segments[1], newId);
  rows.conversations.push({
    id: newId,
    member_ids: members,
    members: d.data.members || {},
    unread: d.data.unread || {},
    last_message: d.data.lastMessage || null,
    created_at: iso(d.data.createdAt),
    updated_at: iso(d.data.updatedAt),
  });
}
for (const d of where("conversations", "*", "messages", "*")) {
  const newId = conversationId.get(d.segments[1]);
  if (!newId) continue;
  rows.messages.push({
    id: randomUUID(),
    conversation_id: newId,
    sender_id: isUser(d.data.senderId) ? d.data.senderId : null,
    text: String(d.data.text || ""),
    type: String(d.data.type || "text"),
    status: String(d.data.status || "delivered"),
    data: omit(d.data, ["senderId", "text", "type", "status", "createdAt"]),
    created_at: iso(d.data.createdAt),
  });
}
// O aviso de mensagem aponta para o id antigo da conversa.
for (const notification of rows.notifications) {
  const old = notification.data.conversationId;
  if (old && conversationId.has(old)) {
    const neu = conversationId.get(old);
    notification.data = JSON.parse(JSON.stringify(notification.data).split(old).join(neu));
  }
}

const LISTING_COLUMNS = [
  "id", "ownerId", "moderationStatus", "viewCount", "detailCount", "whatsappCount", "createdAt", "updatedAt",
];
for (const d of where("serviceListings", "*")) {
  if (!isUser(d.data.ownerId)) continue;
  rows.service_listings.push({
    id: d.segments[1],
    owner_id: d.data.ownerId,
    moderation_status: ["approved", "pending", "changes_requested", "rejected"].includes(d.data.moderationStatus)
      ? d.data.moderationStatus
      : "pending",
    view_count: Number(d.data.viewCount) || 0,
    detail_count: Number(d.data.detailCount) || 0,
    whatsapp_count: Number(d.data.whatsappCount) || 0,
    data: omit(d.data, LISTING_COLUMNS),
    created_at: iso(d.data.createdAt),
    updated_at: iso(d.data.updatedAt),
  });
}

// ---------------------------------------------------------------------------
// Grava
// ---------------------------------------------------------------------------

const client = new pg.Client({
  connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@${POOLER_HOST}:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const JSON_COLUMNS = new Set(["data", "comments", "ratings_by", "members", "unread", "last_message", "subscription"]);
const insertRows = async (table, list) => {
  for (const row of list) {
    const columns = Object.keys(row);
    const values = columns.map((column) =>
      JSON_COLUMNS.has(column) && row[column] !== null ? JSON.stringify(row[column]) : row[column],
    );
    await client.query(
      `insert into public.${table} (${columns.join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
      values,
    );
  }
};

const hash = backup.hashConfig;
const passwordOf = (user) =>
  user.passwordHash && user.passwordSalt && hash
    ? `$fbscrypt$v=1,n=${hash.memoryCost},r=${hash.rounds},p=1,ss=${hash.saltSeparator},sk=${hash.signerKey}$${std64(user.passwordSalt)}$${std64(user.passwordHash)}`
    : "";

try {
  await client.query("begin");

  if (RESET) {
    await client.query(`truncate public.${Object.keys(rows).join(", public.")}, public.reports, public.user_plans cascade`);
    await client.query("delete from auth.users");
  }

  for (const user of backup.users) {
    const id = uidMap.get(user.uid);
    const providers = [
      ...new Set(
        (user.providerData || []).map((p) => (p.providerId === "password" ? "email" : p.providerId.replace(/\.com$/, ""))),
      ),
    ];
    if (!providers.length) providers.push("email");
    await client.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
         confirmation_token, recovery_token, email_change_token_new, email_change)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, now(),
         $4, $5, $6, now(), $7, '', '', '', '')`,
      [
        id,
        String(user.email || "").toLowerCase(),
        passwordOf(user),
        JSON.stringify({ provider: providers[0], providers }),
        JSON.stringify({
          full_name: user.displayName || "",
          name: user.displayName || "",
          avatar_url: user.photoURL || "",
          firebase_uid: user.uid,
        }),
        iso(user.metadata?.creationTime),
        user.metadata?.lastSignInTime ? iso(user.metadata.lastSignInTime) : null,
      ],
    );
    for (const provider of user.providerData || []) {
      const isEmail = provider.providerId === "password";
      const sub = isEmail ? id : provider.uid;
      await client.query(
        `insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, now(), now())`,
        [
          id,
          sub,
          JSON.stringify({
            sub,
            email: String(provider.email || user.email || "").toLowerCase(),
            email_verified: true,
            ...(isEmail ? {} : { full_name: provider.displayName || "", avatar_url: provider.photoURL || "" }),
          }),
          isEmail ? "email" : provider.providerId.replace(/\.com$/, ""),
        ],
      );
    }
  }

  // Liga a bandeira que os triggers respeitam: datas, comentários e
  // avaliações originais passam como vieram.
  await client.query("select set_config('engine.trusted', 'on', true)");
  for (const table of Object.keys(rows)) await insertRows(table, rows[table]);

  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

console.log(`${backup.users.length} contas, ${uploadCount} fotos no Storage`);
for (const [table, list] of Object.entries(rows)) console.log(`  ${table}: ${list.length}`);
console.log("uid antigo -> novo:");
for (const user of backup.users) console.log(`  ${user.email}  ${user.uid} -> ${uidMap.get(user.uid)}`);
