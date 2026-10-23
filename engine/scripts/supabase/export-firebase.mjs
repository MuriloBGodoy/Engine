/**
 * Backup completo do Firebase (Firestore inteiro + contas do Auth com o hash
 * da senha) num JSON só. É o ponto de partida da migração para o Supabase e o
 * único registro do que existia depois que o projeto do Firebase for apagado.
 *
 * Só funciona enquanto o projeto do Firebase existir. Depois que ele for
 * apagado, este script e a dependência `firebase-admin` podem sair.
 *
 *   node scripts/supabase/export-firebase.mjs [saida.json]
 *
 * Credencial: C:\engine-credentials\service-account.json (fora do repo).
 * A saída tem hash de senha — guardar fora do repo também.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const CREDENTIAL = process.env.FIREBASE_CREDENTIAL || "C:/engine-credentials/service-account.json";
const OUT = process.argv[2] || "C:/engine-credentials/firebase-export.json";

const sa = require(CREDENTIAL);
const app = initializeApp({ credential: cert(sa) });
const db = getFirestore(app);

// Timestamp vira ISO; referência vira caminho. O resto do JSON passa reto.
const plain = (value) => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    if (typeof value.path === "string" && typeof value.id === "string" && value.firestore) return value.path;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
};

const docs = [];
const walk = async (collectionRef) => {
  const refs = await collectionRef.listDocuments();
  for (const ref of refs) {
    const snap = await ref.get();
    if (snap.exists) docs.push({ path: ref.path, data: plain(snap.data()) });
    for (const sub of await ref.listCollections()) await walk(sub);
  }
};
for (const col of await db.listCollections()) await walk(col);

const token = (await app.options.credential.getAccessToken()).access_token;
const config = await (
  await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${sa.project_id}/config`, {
    headers: { Authorization: `Bearer ${token}` },
  })
).json();

const users = [];
let pageToken;
do {
  const page = await getAuth(app).listUsers(1000, pageToken);
  users.push(...page.users.map((user) => user.toJSON()));
  pageToken = page.pageToken;
} while (pageToken);

writeFileSync(
  OUT,
  JSON.stringify(
    { exportedAt: new Date().toISOString(), projectId: sa.project_id, hashConfig: config.signIn?.hashConfig, users, docs },
    null,
    1,
  ),
);
console.log(`${users.length} contas, ${docs.length} documentos -> ${OUT}`);
