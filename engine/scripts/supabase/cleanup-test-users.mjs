/**
 * Apaga as contas descartáveis que os testes criam no Supabase real.
 *
 *   node scripts/supabase/cleanup-test-users.mjs
 *
 * Só toca conta cujo e-mail termina num domínio de teste (`@teste.dev`, dos
 * e2e, e `@engine-test.dev`, do check:rls). Apagar a conta leva em cascata
 * tudo que é dela; clube fundado, conversa e denúncia saem antes, à mão,
 * porque sobrevivem à conta de propósito no app de verdade.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pg = require("pg");

const ENV_FILE = process.env.SUPABASE_ENV_FILE || "C:/engine-credentials/supabase.env";
const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const ref = new URL(env.SUPABASE_URL).hostname.split(".")[0];
const host = process.env.SUPABASE_POOLER_HOST || "aws-1-sa-east-1.pooler.supabase.com";

const client = new pg.Client({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@${host}:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const TEST_USERS = `select id from auth.users where email like '%@teste.dev' or email like '%@engine-test.dev'`;
try {
  await client.query("begin");
  const clubs = await client.query(`delete from public.clubs where founder_id in (${TEST_USERS})`);
  const convs = await client.query(
    `delete from public.conversations c where exists (select 1 from (${TEST_USERS}) t where t.id = any (c.member_ids))`,
  );
  const reports = await client.query(`delete from public.reports where reporter_id in (${TEST_USERS})`);
  const users = await client.query(
    `delete from auth.users where email like '%@teste.dev' or email like '%@engine-test.dev' returning email`,
  );
  await client.query("commit");
  console.log(
    `${users.rowCount} conta(s), ${clubs.rowCount} clube(s), ${convs.rowCount} conversa(s), ${reports.rowCount} denúncia(s) apagados`,
  );
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
