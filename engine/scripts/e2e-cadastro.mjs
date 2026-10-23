/**
 * Cadastro com nome de usuário que já existe — o defeito que prendia o
 * e-mail da pessoa fora do app (achado na auditoria de 24/09/2026).
 *
 *   node scripts/e2e-cadastro.mjs      (com o vite no ar, ver e2e-emulator.mjs)
 *
 * O que tem que acontecer: a tela diz que o NOME está em uso, nenhuma conta
 * é criada, e a pessoa troca o nome e entra com o MESMO e-mail. Antes:
 * "Não foi possível criar sua conta agora" → "Este e-mail já está cadastrado".
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { novaSessao, etapa, cadastrar, lerErroDaTela, relatorio, USUARIOS } from "./e2e-emulator.mjs";

// Pergunta direto ao Auth do Supabase se a conta nasceu (chave de servidor,
// em C:\engine-credentials\supabase.env, fora do repo).
const env = Object.fromEntries(
  readFileSync(process.env.SUPABASE_ENV_FILE || "C:/engine-credentials/supabase.env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const contaExiste = async (email) => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users || []).some((user) => user.email === email.toLowerCase());
};

const browser = await chromium.launch();

const a = await novaSessao(browser);
await etapa("Ana se cadastra", a, async () => {
  await cadastrar(a.page, USUARIOS.a);
  await a.page.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 20000 });
});
await a.ctx.close();

const b = await novaSessao(browser);
await etapa("Bruno tenta o nome da Ana → mensagem específica", b, async () => {
  await cadastrar(b.page, { ...USUARIOS.b, usuario: USUARIOS.a.usuario });
  await b.page.waitForTimeout(5000);
  const msg = await lerErroDaTela(b.page);
  if (!/usuário já está em uso|já está em uso/i.test(msg)) throw new Error(`tela diz: "${msg}"`);
  return msg;
});

await etapa("…e nenhuma conta foi criada", b, async () => {
  if (await contaExiste(USUARIOS.b.email)) throw new Error("conta órfã criada no Auth");
  return "Auth sem conta do Bruno";
});

await etapa("Bruno troca o nome e entra com o MESMO e-mail", b, async () => {
  await b.page.locator('input[autocomplete="username"]').fill(USUARIOS.b.usuario);
  await b.page.click('button[type="submit"]');
  await b.page.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 20000 });
  return new URL(b.page.url()).pathname;
});

await browser.close();
process.exit(relatorio() ? 1 : 0);
