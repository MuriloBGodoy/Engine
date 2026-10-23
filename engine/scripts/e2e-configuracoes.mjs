/* global document -- usado dentro de page.evaluate(), que roda no navegador */
/**
 * Configurações, pela tela e contra o banco de verdade.
 *
 *   node scripts/e2e-configuracoes.mjs   (com o vite no ar, ver e2e-emulator.mjs)
 *   node scripts/supabase/cleanup-test-users.mjs   # sempre, no fim
 *
 * Até 05/10/2026 a página exibia ~30 opções e só umas 10 faziam alguma
 * coisa; "Resetar banco local" apagava os carros do SERVIDOR; e "Excluir
 * conta" deixava perfil, @, seguidores e anúncios para trás. Cada etapa aqui
 * prova uma promessa da tela nova: o que muda grava sozinho e sobrevive à
 * recarga, o aviso desligado some do sino, a senha troca de verdade, e a
 * conta excluída não deixa rastro.
 *
 * A conferência do banco usa a chave de servidor do Supabase, que ignora a
 * RLS — é o olho de fora, não o caminho do app.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import {
  novaSessao, etapa, cadastrar, relatorio, USUARIOS, textoDaPagina, fecharSobreposicoes,
} from "./e2e-emulator.mjs";

const BASE = process.env.E2E_BASE || "http://localhost:5190";
const NOVA_SENHA = "Engine!2026trocada";

const env = Object.fromEntries(
  readFileSync(process.env.SUPABASE_ENV_FILE || "C:/engine-credentials/supabase.env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** Uma linha (ou null), filtrando por coluna = valor. */
const linha = async (tabela, filtros) => {
  let q = db.from(tabela).select("*");
  for (const [coluna, valor] of Object.entries(filtros)) q = q.eq(coluna, valor);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return data;
};
const linhas = async (tabela, filtros) => {
  let q = db.from(tabela).select("*");
  for (const [coluna, valor] of Object.entries(filtros)) q = q.eq(coluna, valor);
  const { data, error } = await q;
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return data;
};
// Plantar dado pelo olho de fora: o que se prova é a EXCLUSÃO, não a criação
// de cada um (essa tem suíte própria).
const plantar = async (tabela, dados) => {
  const { error } = await db.from(tabela).insert(dados);
  if (error) throw new Error(`plantar ${tabela}: ${error.message}`);
};

const uidDe = async (usuario) => (await linha("usernames", { username: usuario.toLowerCase() }))?.user_id;

const browser = await chromium.launch();
const A = await novaSessao(browser);
const B = await novaSessao(browser);
const pa = A.page;
const pb = B.page;
const ana = USUARIOS.a;
const bruno = USUARIOS.b;

const secao = async (nome) => {
  // Dentro da barra de seções: o sino do topo também se chama "Notificações".
  await pa.locator("nav.engine-rail").getByRole("button", { name: nome, exact: true }).click();
  await pa.waitForTimeout(500);
};
const chave = (nome) => pa.getByRole("switch", { name: nome });
const contadorDoSino = () =>
  pa.evaluate(() => {
    const sino = document.querySelector('button[aria-label="Notificações"]');
    return sino?.querySelector("span")?.textContent?.trim() || "";
  });

await etapa("Ana e Bruno se cadastram", A, async () => {
  await Promise.all([cadastrar(pa, ana), cadastrar(pb, bruno)]);
  await pa.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 20000 });
  await pb.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 20000 });
  await fecharSobreposicoes(pa);
  await fecharSobreposicoes(pb);
  return "ok";
});

await etapa("Configurações: 4 seções, sem 'Dados' nem opção de enfeite", A, async () => {
  await pa.goto(`${BASE}/settings`, { waitUntil: "load" });
  await pa.waitForTimeout(2500);
  const t = await textoDaPagina(pa);
  for (const nome of ["Conta", "Notificações", "Privacidade", "App"]) {
    if (!t.includes(nome)) throw new Error(`falta a seção ${nome}`);
  }
  for (const morto of ["Exportar", "Resetar", "2FA", "Fuso horário", "Moeda", "Densidade", "APAGAR"]) {
    if (t.includes(morto)) throw new Error(`ainda aparece "${morto}"`);
  }
  if (!t.includes(ana.email)) throw new Error("e-mail da conta não aparece");
  return "Conta · Notificações · Privacidade · App";
});

await etapa("Privacidade: 'Ocultar valores' grava sozinho e sobrevive à recarga", A, async () => {
  await secao("Privacidade");
  await chave("Ocultar valores").click();
  await pa.waitForTimeout(2500);
  const uid = await uidDe(ana.usuario);
  const salvo = await linha("user_private", { user_id: uid, doc_id: "settings" });
  const noBanco = salvo?.data?.privacy?.lockSensitiveValues;
  if (noBanco !== true) throw new Error(`no banco ficou ${noBanco}`);
  await pa.reload({ waitUntil: "load" });
  await pa.waitForTimeout(2500);
  if (!pa.url().includes("section=privacy")) throw new Error("recarga perdeu a seção");
  if ((await chave("Ocultar valores").getAttribute("aria-checked")) !== "true") {
    throw new Error("chave voltou desligada depois de recarregar");
  }
  await chave("Ocultar valores").click(); // devolve como estava
  await pa.waitForTimeout(1500);
  return "banco = true · recarga mantém";
});

await etapa("App: tema claro aplica na hora e fica gravado", A, async () => {
  await secao("App");
  await pa.getByRole("radio", { name: "Claro" }).click();
  await pa.waitForTimeout(800);
  const escuro = await pa.evaluate(() => document.documentElement.classList.contains("dark"));
  if (escuro) throw new Error("ainda escuro");
  await pa.waitForTimeout(1500);
  await pa.reload({ waitUntil: "load" });
  await pa.waitForTimeout(3000);
  if (await pa.evaluate(() => document.documentElement.classList.contains("dark"))) {
    throw new Error("voltou ao escuro depois de recarregar");
  }
  await pa.getByRole("radio", { name: "Escuro" }).click();
  await pa.waitForTimeout(1500);
  return "claro → recarga → claro";
});

await etapa("Notificações: seguidor com aviso desligado não aparece no sino", A, async () => {
  await secao("Notificações");
  await chave("Novos seguidores").click();
  await pa.waitForTimeout(2000);

  await pb.goto(`${BASE}/community/@${ana.usuario}`, { waitUntil: "load" });
  await pb.waitForTimeout(6000);
  await pb.getByRole("button", { name: /^Seguir$/ }).first().click();
  await pb.waitForTimeout(4000);

  const desligado = await contadorDoSino();
  if (desligado) throw new Error(`sino mostrou "${desligado}" com o aviso desligado`);

  await chave("Novos seguidores").click();
  await pa.waitForTimeout(2500);
  const ligado = await contadorDoSino();
  if (ligado !== "1") throw new Error(`religado, o sino mostra "${ligado}" (esperado 1)`);
  return "desligado: nada · religado: 1";
});

await etapa("Notificações: 'Pausar tudo' esconde o contador", A, async () => {
  await chave("Pausar tudo").click();
  await pa.waitForTimeout(1500);
  const pausado = await contadorDoSino();
  await chave("Pausar tudo").click();
  await pa.waitForTimeout(1500);
  if (pausado) throw new Error(`pausado, o sino ainda mostra "${pausado}"`);
  return "contador some e volta";
});

await etapa("Conta: senha atual errada é recusada com mensagem em português", A, async () => {
  await secao("Conta");
  await pa.getByRole("button", { name: /^Alterar senha/ }).click();
  await pa.fill('input[placeholder="Senha atual"]', "errada123");
  await pa.fill('input[placeholder^="Nova senha"]', NOVA_SENHA);
  await pa.fill('input[placeholder="Repita a nova senha"]', NOVA_SENHA);
  const antes = A.erros.length;
  await pa.getByRole("button", { name: "Salvar senha" }).click();
  await pa.waitForTimeout(3000);
  A.erros.length = antes; // o 400 da senha errada é o próprio teste
  const t = await textoDaPagina(pa);
  if (!t.includes("Senha incorreta.")) throw new Error(`sem a mensagem — ${t.slice(0, 200)}`);
  return "Senha incorreta.";
});

await etapa("Conta: troca a senha, sai e entra com a nova", A, async () => {
  await pa.fill('input[placeholder="Senha atual"]', ana.senha);
  await pa.getByRole("button", { name: "Salvar senha" }).click();
  await pa.waitForTimeout(3500);
  await pa.locator("main").getByRole("button", { name: /^Sair$/ }).click();
  await pa.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 10000 });
  await pa.fill('input[type="email"]', ana.email);
  await pa.fill('input[type="password"]', NOVA_SENHA);
  await pa.click('button[type="submit"]');
  await pa.waitForTimeout(5000);
  if (new URL(pa.url()).pathname.startsWith("/login")) throw new Error("nova senha não entrou");
  ana.senha = NOVA_SENHA;
  return "entrou com a senha nova";
});

let uidAna = "";
await etapa("Ana segue o Bruno (para a exclusão ter o que limpar)", A, async () => {
  uidAna = await uidDe(ana.usuario);
  await pa.goto(`${BASE}/community/@${bruno.usuario}`, { waitUntil: "load" });
  await pa.waitForTimeout(6000);
  await pa.getByRole("button", { name: /^Seguir$/ }).first().click();
  await pa.waitForTimeout(3000);
  const uidBruno = await uidDe(bruno.usuario);
  if (!(await linha("follows", { follower_id: uidAna, target_id: uidBruno }))) {
    throw new Error("seguir não gravou");
  }
  return "seguindo";
});

let uidBruno = "";
const futuro = new Date(Date.now() + 7 * 864e5).toISOString();
const passado = new Date(Date.now() - 7 * 864e5).toISOString();
let clubeAna = "";
let clubeBruno = "";
let clubeFechado = "";
let conversa = "";
await etapa("Ana tem dado em todo canto (carro, post, comentário, clube, evento, conversa)", A, async () => {
  uidBruno = await uidDe(bruno.usuario);
  conversa = [uidAna, uidBruno].sort().join("__");
  clubeAna = `e2e-ana-${uidAna.slice(0, 8)}`;
  clubeBruno = `e2e-bruno-${uidBruno.slice(0, 8)}`;
  clubeFechado = `e2e-fechado-${uidBruno.slice(0, 8)}`;
  const sigla = uidAna.replace(/[^0-9a-f]/g, "").slice(0, 3).toUpperCase();
  await plantar("cars", { user_id: uidAna, id: "carro1", data: { name: "Golf GTI", targetValue: 150000 } });
  await plantar("community_goals", { id: `post-ana-${uidAna}`, owner_id: uidAna, data: { title: "Meta da Ana" } });
  await plantar("community_goals", {
    id: `post-bruno-${uidBruno}`,
    owner_id: uidBruno,
    data: { title: "Meta do Bruno" },
    comments: [
      { id: "c1", userId: uidAna, text: "comentário da Ana" },
      { id: "c2", userId: uidBruno, text: "resposta do Bruno" },
    ],
    ratings_by: { [uidAna]: 5, [uidBruno]: 4 },
  });
  await plantar("post_likes", { post_id: `post-bruno-${uidBruno}`, liker_id: uidAna });
  await plantar("conversations", {
    id: conversa,
    member_ids: [uidAna, uidBruno].sort(),
    members: {
      [uidAna]: { author: ana.nome, username: ana.usuario, avatar: "" },
      [uidBruno]: { author: bruno.nome, username: bruno.usuario, avatar: "" },
    },
  });
  await plantar("clubs", { id: clubeAna, founder_id: uidAna, tag: `A${sigla}`, name_lower: "clube da ana", data: { name: "Clube da Ana" } });
  await plantar("club_members", { club_id: clubeAna, uid: uidAna, role: "founder", display_name: ana.nome });
  await plantar("clubs", { id: clubeBruno, founder_id: uidBruno, tag: `B${sigla}`, name_lower: "clube do bruno", data: { name: "Clube do Bruno" } });
  await plantar("club_members", { club_id: clubeBruno, uid: uidBruno, role: "founder", display_name: bruno.nome });
  await plantar("club_members", { club_id: clubeBruno, uid: uidAna, role: "member", display_name: ana.nome });
  await plantar("clubs", {
    id: clubeFechado, founder_id: uidBruno, tag: `F${sigla}`, name_lower: "clube fechado",
    join_policy: "approval", content_visibility: "members", data: { name: "Clube Fechado" },
  });
  await plantar("club_requests", { club_id: clubeFechado, uid: uidAna, display_name: ana.nome });
  await plantar("events", { id: `e2e-evento-ana-${uidAna}`, created_by: uidAna, event_date: futuro, data: { title: "Encontro da Ana" } });
  await plantar("events", { id: `e2e-evento-passado-${uidBruno}`, created_by: uidBruno, event_date: passado, data: { title: "Track day" } });
  await plantar("event_participants", { event_id: `e2e-evento-passado-${uidBruno}`, uid: uidAna, data: { displayName: ana.nome } });
  await plantar("service_listings", { id: `e2e-servico-${uidAna}`, owner_id: uidAna, data: { title: "Polimento" } });
  return "11 lugares";
});

await etapa("Excluir conta: senha errada não apaga nada", A, async () => {
  await pa.goto(`${BASE}/settings`, { waitUntil: "load" });
  await pa.waitForTimeout(2500);
  await fecharSobreposicoes(pa); // o carro plantado destrava "Primeira Meta"
  await pa.getByRole("button", { name: /Excluir conta/ }).click();
  await pa.waitForTimeout(800);
  const dialogo = pa.getByRole("dialog");
  await dialogo.locator('input[type="password"]').fill("errada123");
  const antes = A.erros.length;
  await dialogo.getByRole("button", { name: "Excluir minha conta" }).click();
  await pa.waitForTimeout(3000);
  A.erros.length = antes;
  const texto = await dialogo.innerText();
  if (!texto.includes("Senha incorreta.")) throw new Error("sem aviso de senha");
  if (!texto.includes("Clube da Ana")) throw new Error("não avisou que o clube fundado será arquivado");
  if (!(await linha("public_profiles", { user_id: uidAna }))) throw new Error("apagou o perfil mesmo com a senha errada");
  return "nada saiu";
});

await etapa("Excluir conta: apaga perfil, @, seguir e espaço privado", A, async () => {
  const dialogo = pa.getByRole("dialog");
  await dialogo.locator('input[type="password"]').fill(ana.senha);
  const antes = A.erros.length;
  await dialogo.getByRole("button", { name: "Excluir minha conta" }).click();
  await pa.waitForURL((u) => !u.pathname.startsWith("/settings"), { timeout: 60000 });
  await pa.waitForTimeout(2000);
  // Sair depois de a conta já não existir: o servidor responde 403 ao
  // `/logout` e a biblioteca do Supabase trata como "já saiu". É o próprio
  // efeito da exclusão, não defeito.
  A.erros.splice(antes, A.erros.length, ...A.erros.slice(antes).filter((e) => !/status of 403/.test(e)));

  const sobras = [];
  const postBruno = await linha("community_goals", { id: `post-bruno-${uidBruno}` });
  const comentarios = postBruno?.comments || [];
  const cartao = (await linha("conversations", { id: conversa }))?.members?.[uidAna];
  const vazio = async (tabela, filtros, nome) => {
    if ((await linhas(tabela, filtros)).length) sobras.push(nome);
  };
  await vazio("public_profiles", { user_id: uidAna }, "perfil público");
  await vazio("usernames", { username: ana.usuario.toLowerCase() }, "@ reservado");
  await vazio("follows", { follower_id: uidAna }, "seguindo");
  await vazio("user_private", { user_id: uidAna }, "configurações");
  await vazio("notifications", { user_id: uidAna }, "notificações");
  await vazio("cars", { user_id: uidAna }, "carro");
  await vazio("community_goals", { owner_id: uidAna }, "post próprio");
  if (comentarios.some((c) => c.userId === uidAna)) sobras.push("comentário");
  if (comentarios.length !== 1) sobras.push(`comentário do Bruno (${comentarios.length})`);
  if (postBruno?.ratings_by?.[uidAna]) sobras.push("avaliação");
  await vazio("post_likes", { liker_id: uidAna }, "curtida");
  if (postBruno?.likes_count !== 0) sobras.push(`likes_count (${postBruno?.likes_count})`);
  if (cartao?.author !== "Conta excluída" || cartao?.username) sobras.push("cartão na conversa");
  if ((await linha("clubs", { id: clubeAna }))?.archived !== true) sobras.push("clube fundado não arquivado");
  await vazio("club_members", { uid: uidAna }, "membro em clube");
  const membrosBruno = (await linha("clubs", { id: clubeBruno }))?.member_count;
  if (membrosBruno !== 1) sobras.push(`member_count (${membrosBruno})`);
  await vazio("club_requests", { uid: uidAna }, "pedido pendente");
  await vazio("events", { created_by: uidAna }, "evento criado");
  await vazio("event_participants", { uid: uidAna }, "presença em evento passado");
  await vazio("service_listings", { owner_id: uidAna }, "anúncio");
  if ((await db.auth.admin.getUserById(uidAna)).data?.user) sobras.push("a própria conta");
  if (sobras.length) throw new Error(`sobrou: ${sobras.join(", ")}`);
  return "nada sobrou (22 conferências)";
});

await etapa("Conta excluída não entra mais", A, async () => {
  await pa.goto(`${BASE}/login`, { waitUntil: "load" });
  await pa.fill('input[type="email"]', ana.email);
  await pa.fill('input[type="password"]', ana.senha);
  const antes = A.erros.length;
  await pa.click('button[type="submit"]');
  await pa.waitForTimeout(4000);
  A.erros.length = antes;
  if (!new URL(pa.url()).pathname.startsWith("/login")) throw new Error("entrou numa conta excluída");
  return "login recusado";
});

await etapa("Bruno: o @ da Ana ficou livre e o perfil sumiu", B, async () => {
  await pb.goto(`${BASE}/community/@${ana.usuario}`, { waitUntil: "load" });
  await pb.waitForTimeout(6000);
  const t = await textoDaPagina(pb);
  if (t.includes(ana.nome)) throw new Error("perfil da Ana ainda aparece");
  return new URL(pb.url()).pathname;
});

await etapa("Bruno: a conversa com a Ana fica trancada e sem link de perfil", B, async () => {
  await pb.goto(`${BASE}/messages/${conversa}`, { waitUntil: "load" });
  await pb.waitForTimeout(5000);
  const t = await textoDaPagina(pb);
  if (!t.includes("Esta conta foi excluída")) throw new Error(`sem o aviso — ${t.slice(0, 160)}`);
  if (await pb.locator("textarea").count()) throw new Error("caixa de mensagem ainda aberta");
  return "Conta excluída · sem composer";
});

await browser.close();
process.exit(relatorio() ? 1 : 0);
