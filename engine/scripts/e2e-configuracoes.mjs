/* global document -- usado dentro de page.evaluate(), que roda no navegador */
/**
 * Configurações, pela tela e contra as regras reais (emuladores).
 *
 *   node scripts/e2e-configuracoes.mjs   (com emuladores + vite, ver e2e-emulator.mjs)
 *
 * Até 05/10/2026 a página exibia ~30 opções e só umas 10 faziam alguma
 * coisa; "Resetar banco local" apagava os carros do SERVIDOR; e "Excluir
 * conta" deixava perfil, @, seguidores e anúncios para trás. Cada etapa aqui
 * prova uma promessa da tela nova: o que muda grava sozinho e sobrevive à
 * recarga, o aviso desligado some do sino, a senha troca de verdade, e a
 * conta excluída não deixa rastro que as regras permitam apagar.
 *
 * A conferência do banco usa a API REST do emulador com `Bearer owner`, que
 * ignora as regras — é o olho de fora, não o caminho do app.
 */
import { chromium } from "playwright";
import {
  novaSessao, etapa, cadastrar, relatorio, USUARIOS, textoDaPagina, fecharSobreposicoes,
} from "./e2e-emulator.mjs";

const BASE = process.env.E2E_BASE || "http://localhost:5190";
const DB = "http://127.0.0.1:8099/v1/projects/engine-garage/databases/(default)/documents";
const NOVA_SENHA = "Engine!2026trocada";

const lerDoc = async (caminho) => {
  const r = await fetch(`${DB}/${caminho}`, { headers: { Authorization: "Bearer owner" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`REST ${caminho}: ${r.status}`);
  return r.json();
};
const listar = async (caminho) => {
  const r = await fetch(`${DB}/${caminho}`, { headers: { Authorization: "Bearer owner" } });
  if (r.status === 404) return [];
  return (await r.json()).documents || [];
};
// Valor JS → formato tipado da API REST do Firestore.
const valor = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x)])) } };
};
// Plantar dado pelo olho de fora: o que se prova é a EXCLUSÃO pelas regras
// reais, não a criação de cada um (essa tem suíte própria).
const plantar = async (caminho, dados) => {
  const r = await fetch(`${DB}/${caminho}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: valor(dados).mapValue.fields }),
  });
  if (!r.ok) throw new Error(`plantar ${caminho}: ${r.status} ${await r.text()}`);
};
const campo = (docu, nome) => docu?.fields?.[nome];

const uidDe = async (usuario) =>
  (await lerDoc(`usernames/${usuario.toLowerCase()}`))?.fields?.userId?.stringValue;

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
  const salvo = await lerDoc(`users/${uid}/private/settings`);
  const noBanco = salvo?.fields?.privacy?.mapValue?.fields?.lockSensitiveValues?.booleanValue;
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
  if (!(await lerDoc(`publicProfiles/${uidBruno}/followers/${uidAna}`))) {
    throw new Error("seguir não gravou");
  }
  return "seguindo";
});

let uidBruno = "";
const futuro = new Date(Date.now() + 7 * 864e5).toISOString();
const passado = new Date(Date.now() - 7 * 864e5).toISOString();
await etapa("Ana tem dado em todo canto (carro, post, comentário, clube, evento, conversa)", A, async () => {
  uidBruno = await uidDe(bruno.usuario);
  const conversa = [uidAna, uidBruno].sort().join("__");
  await Promise.all([
    plantar(`users/${uidAna}/cars/carro1`, { name: "Golf GTI", targetValue: 150000 }),
    plantar("communityGoals/post_ana", { ownerId: uidAna, userId: uidAna, title: "Meta da Ana" }),
    plantar("communityGoals/post_bruno", {
      ownerId: uidBruno,
      userId: uidBruno,
      title: "Meta do Bruno",
      likesCount: 1,
      comments: [
        { id: "c1", userId: uidAna, text: "comentário da Ana" },
        { id: "c2", userId: uidBruno, text: "resposta do Bruno" },
      ],
      ratingsBy: { [uidAna]: 5, [uidBruno]: 4 },
    }),
    plantar(`communityGoals/post_bruno/likes/${uidAna}`, { likerId: uidAna, postOwnerId: uidBruno }),
    plantar(`conversations/${conversa}`, {
      memberIds: [uidAna, uidBruno].sort(),
      members: {
        [uidAna]: { author: ana.nome, username: ana.usuario, avatar: "" },
        [uidBruno]: { author: bruno.nome, username: bruno.usuario, avatar: "" },
      },
    }),
    plantar("clubs/clube_ana", {
      name: "Clube da Ana", tag: "ANA", founderId: uidAna, memberCount: 1, archived: false,
      official: false, joinPolicy: "open", contentVisibility: "public",
    }),
    plantar(`clubs/clube_ana/members/${uidAna}`, { uid: uidAna, role: "founder", displayName: ana.nome, username: ana.usuario, avatar: "" }),
    plantar(`users/${uidAna}/clubs/clube_ana`, { role: "founder" }),
    plantar("clubs/clube_bruno", {
      name: "Clube do Bruno", tag: "BRU", founderId: uidBruno, memberCount: 2, archived: false,
      official: false, joinPolicy: "open", contentVisibility: "public",
    }),
    plantar(`clubs/clube_bruno/members/${uidAna}`, { uid: uidAna, role: "member", displayName: ana.nome }),
    plantar(`users/${uidAna}/clubs/clube_bruno`, { role: "member" }),
    plantar("clubs/clube_fechado", {
      name: "Clube Fechado", tag: "FEC", founderId: uidBruno, memberCount: 1, archived: false,
      official: false, joinPolicy: "approval", contentVisibility: "members",
    }),
    plantar(`clubs/clube_fechado/requests/${uidAna}`, { uid: uidAna, displayName: ana.nome }),
    plantar("events/evento_ana", { createdBy: uidAna, title: "Encontro da Ana", eventDate: futuro }),
    plantar("events/evento_passado", { createdBy: uidBruno, title: "Track day", eventDate: passado }),
    plantar(`events/evento_passado/participants/${uidAna}`, { uid: uidAna, displayName: ana.nome }),
    plantar("serviceListings/servico_ana", { ownerId: uidAna, moderationStatus: "pending", title: "Polimento" }),
  ]);
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
  if (!(await lerDoc(`publicProfiles/${uidAna}`))) throw new Error("apagou o perfil mesmo com a senha errada");
  return "nada saiu";
});

await etapa("Excluir conta: apaga perfil, @, seguir e espaço privado", A, async () => {
  const dialogo = pa.getByRole("dialog");
  await dialogo.locator('input[type="password"]').fill(ana.senha);
  await dialogo.getByRole("button", { name: "Excluir minha conta" }).click();
  await pa.waitForURL((u) => !u.pathname.startsWith("/settings"), { timeout: 60000 });
  await pa.waitForTimeout(2000);

  const sobras = [];
  const conversa = [uidAna, uidBruno].sort().join("__");
  if (await lerDoc(`publicProfiles/${uidAna}`)) sobras.push("perfil público");
  if (await lerDoc(`usernames/${ana.usuario.toLowerCase()}`)) sobras.push("@ reservado");
  if (await lerDoc(`publicProfiles/${uidBruno}/followers/${uidAna}`)) sobras.push("seguidor no Bruno");
  if ((await listar(`publicProfiles/${uidAna}/following`)).length) sobras.push("lista de seguindo");
  if (await lerDoc(`users/${uidAna}/private/settings`)) sobras.push("configurações");
  if ((await listar(`users/${uidAna}/notifications`)).length) sobras.push("notificações");
  if ((await listar(`users/${uidAna}/cars`)).length) sobras.push("carro");
  if (await lerDoc("communityGoals/post_ana")) sobras.push("post próprio");
  const postBruno = await lerDoc("communityGoals/post_bruno");
  const comentarios = campo(postBruno, "comments")?.arrayValue?.values || [];
  if (comentarios.some((c) => c.mapValue.fields.userId.stringValue === uidAna)) sobras.push("comentário");
  if (comentarios.length !== 1) sobras.push(`comentário do Bruno (${comentarios.length})`);
  if (campo(postBruno, "ratingsBy")?.mapValue?.fields?.[uidAna]) sobras.push("avaliação");
  if (await lerDoc(`communityGoals/post_bruno/likes/${uidAna}`)) sobras.push("curtida");
  if (campo(postBruno, "likesCount")?.integerValue !== "0") sobras.push("likesCount");
  const cartao = campo(await lerDoc(`conversations/${conversa}`), "members")?.mapValue?.fields?.[uidAna]?.mapValue?.fields;
  if (cartao?.author?.stringValue !== "Conta excluída" || cartao?.username?.stringValue) sobras.push("cartão na conversa");
  if (campo(await lerDoc("clubs/clube_ana"), "archived")?.booleanValue !== true) sobras.push("clube fundado não arquivado");
  const fundador = (await lerDoc(`clubs/clube_ana/members/${uidAna}`))?.fields;
  if (fundador?.displayName?.stringValue !== "Conta excluída") sobras.push("nome no clube fundado");
  if (await lerDoc(`clubs/clube_bruno/members/${uidAna}`)) sobras.push("membro no clube do Bruno");
  if (campo(await lerDoc("clubs/clube_bruno"), "memberCount")?.integerValue !== "1") sobras.push("memberCount");
  if (await lerDoc(`clubs/clube_fechado/requests/${uidAna}`)) sobras.push("pedido pendente");
  if ((await listar(`users/${uidAna}/clubs`)).length) sobras.push("espelho de clubes");
  if (await lerDoc("events/evento_ana")) sobras.push("evento criado");
  if (await lerDoc(`events/evento_passado/participants/${uidAna}`)) sobras.push("presença em evento passado");
  if (await lerDoc("serviceListings/servico_ana")) sobras.push("anúncio");
  if (sobras.length) throw new Error(`sobrou: ${sobras.join(", ")}`);
  return "nada sobrou (24 conferências)";
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
  const conversa = [uidAna, uidBruno].sort().join("__");
  await pb.goto(`${BASE}/messages/${conversa}`, { waitUntil: "load" });
  await pb.waitForTimeout(5000);
  const t = await textoDaPagina(pb);
  if (!t.includes("Esta conta foi excluída")) throw new Error(`sem o aviso — ${t.slice(0, 160)}`);
  if (await pb.locator("textarea").count()) throw new Error("caixa de mensagem ainda aberta");
  return "Conta excluída · sem composer";
});

await browser.close();
process.exit(relatorio() ? 1 : 0);
