/**
 * Passeio de ponta a ponta pelo app LOGADO, contra o Supabase de verdade.
 *
 *   # terminal 1 (engine/)
 *   npx vite --port 5190 --strictPort
 *   # terminal 2 (engine/)
 *   node scripts/e2e-emulator.mjs [etapa]
 *   node scripts/supabase/cleanup-test-users.mjs   # sempre, no fim
 *
 * Até 16/10/2026 rodava contra os emuladores do Firebase. O Supabase local
 * pede Docker, que esta máquina não tem; então as contas são reais, com
 * e-mail `@teste.dev`, e o script de limpeza apaga todas no fim (a conta leva
 * em cascata tudo que é dela). As políticas do banco que respondem são as de
 * produção — melhor que emulador, que roda uma cópia das regras.
 *
 * Por que existe: até 24/09/2026 as telas logadas — Garagem, Painel,
 * Mensagens, criar clube, postar — só tinham sido vistas pelo dono, com a
 * conta dele, em produção. Script de trava lê arquivo; banco de prova usa
 * dado falso. Nenhum dos dois passa pela regra do Firestore de verdade, e é
 * na regra que a maior parte dos defeitos deste projeto morou.
 *
 * Tudo aqui acontece PELA TELA, como uma pessoa faria: preencher, clicar,
 * esperar. Nenhum dado real é lido nem alterado: só o das contas de teste.
 *
 * Cada etapa registra o que viu (captura + erros de console + erros de
 * página) em `e2e-out/`. O relatório final é a lista de etapas com o
 * resultado de cada uma — uma etapa que falha não derruba as seguintes.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE || "http://localhost:5190";
const OUT = path.resolve("e2e-out");
fs.mkdirSync(OUT, { recursive: true });

const SUFIXO = Date.now().toString(36).slice(-5);
export const USUARIOS = {
  a: {
    nome: "Ana Teste",
    usuario: `ana_${SUFIXO}`,
    email: `ana_${SUFIXO}@teste.dev`,
    senha: "Engine!2026seguro",
    telefone: "11987654321",
  },
  b: {
    nome: "Bruno Teste",
    usuario: `bruno_${SUFIXO}`,
    email: `bruno_${SUFIXO}@teste.dev`,
    senha: "Engine!2026seguro",
    telefone: "21987654321",
  },
};

const resultados = [];

export async function novaSessao(browser, { mobile = false } = {}) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
      : { viewport: { width: 1280, height: 900 } },
  );
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const txt = m.text();
    // Ruído conhecido e inofensivo do ambiente de teste, não do app.
    if (/favicon|Download the React DevTools|net::ERR_ABORTED.*\.map/.test(txt)) return;
    erros.push(`console: ${txt.slice(0, 220)}`);
  });
  return { ctx, page, erros };
}

export async function etapa(nome, sessao, fn) {
  const inicio = Date.now();
  const antes = sessao.erros.length;
  let ok = true;
  let detalhe = "";
  try {
    detalhe = (await fn()) || "";
  } catch (e) {
    ok = false;
    detalhe = String(e?.message || e).split("\n")[0].slice(0, 300);
  }
  const novosErros = sessao.erros.slice(antes);
  const arquivo = `${String(resultados.length + 1).padStart(2, "0")}-${nome.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  try {
    await sessao.page.screenshot({ path: path.join(OUT, arquivo), fullPage: false });
  } catch {
    // página pode ter fechado
  }
  const r = { nome, ok: ok && novosErros.length === 0, falhou: !ok, detalhe, erros: novosErros, arquivo, ms: Date.now() - inicio };
  resultados.push(r);
  const marca = r.falhou ? "FALHA" : novosErros.length ? "ERRO " : "ok   ";
  console.log(`${marca} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  for (const e of novosErros.slice(0, 4)) console.log(`        ${e}`);
  return r;
}

export async function cadastrar(page, u) {
  await page.goto(`${BASE}/register`, { waitUntil: "load" });
  await page.waitForSelector('input[autocomplete="name"]', { timeout: 15000 });
  await page.fill('input[autocomplete="name"]', u.nome);
  await page.fill('input[autocomplete="username"]', u.usuario);
  await page.fill('input[placeholder="(00) 00000-0000"]', u.telefone);
  const selects = page.locator("form select");
  // país: o primeiro select da página de cadastro, depois do DDI do telefone
  const n = await selects.count();
  for (let i = 0; i < n; i += 1) {
    const opcoes = await selects.nth(i).locator("option").allTextContents();
    if (opcoes.some((o) => /São Paulo|Rio de Janeiro/.test(o))) {
      await selects.nth(i).selectOption({ label: "São Paulo" }).catch(() => selects.nth(i).selectOption("SP"));
    }
  }
  await page.fill('input[type="email"]', u.email);
  const senhas = page.locator('input[autocomplete="new-password"]');
  await senhas.nth(0).fill(u.senha);
  await senhas.nth(1).fill(u.senha);
  await page.click('button[type="submit"]');
}

export async function lerErroDaTela(page) {
  return page
    .locator(".auth-feedback-error, [role=alert]")
    .allTextContents()
    .then((t) => t.map((x) => x.trim()).filter(Boolean).join(" | "))
    .catch(() => "");
}

export function relatorio() {
  const falhas = resultados.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n${resultados.length} etapas · ${resultados.length - falhas.length} ok · ${falhas.length} com problema`);
  return falhas.length;
}

// ---------------------------------------------------------------------------
// Utilidades de navegação
// ---------------------------------------------------------------------------
export async function esperarOpcoes(select, minimo = 2, ms = 20000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if ((await select.locator("option").count()) >= minimo && !(await select.isDisabled())) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`select não carregou opções em ${ms / 1000}s`);
}

export async function escolherPorTexto(select, padrao) {
  const opcoes = await select.locator("option").evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })));
  const alvo = opcoes.find((o) => o.v && padrao.test(o.t)) || opcoes.find((o) => o.v);
  if (!alvo) throw new Error("nenhuma opção válida");
  await select.selectOption(alvo.v);
  return alvo.t;
}

/** Fecha celebração de conquista, toast grudado ou modal esquecido. */
export async function fecharSobreposicoes(page) {
  for (let i = 0; i < 3; i += 1) {
    const fechar = page.getByRole("button", { name: /^Fechar$/i });
    if (await fechar.count()) {
      await fechar.first().click().catch(() => {});
      await page.waitForTimeout(600);
    } else break;
  }
}

export async function textoDaPagina(page) {
  return (await page.locator("main, body").first().innerText().catch(() => "")).replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// O passeio
// ---------------------------------------------------------------------------
const rodandoDireto = process.argv[1] && process.argv[1].split(path.sep).join("/").endsWith("scripts/e2e-emulator.mjs");
if (rodandoDireto) {
  const browser = await chromium.launch();
  const A = await novaSessao(browser);
  const { page } = A;

  await etapa("Ana: cadastro pela tela", A, async () => {
    await cadastrar(page, USUARIOS.a);
    await page.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 20000 });
    return new URL(page.url()).pathname;
  });

  await etapa("Ana: garagem vazia", A, async () => {
    await page.goto(`${BASE}/garagem`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const t = await textoDaPagina(page);
    return t.includes("Adicionar carro") ? "botão de adicionar presente" : `sem botão — ${t.slice(0, 120)}`;
  });

  await etapa("Ana: adicionar carro-meta pela FIPE", A, async () => {
    await page.getByRole("button", { name: /Adicionar carro/ }).first().click();
    const modal = page.locator("form").filter({ has: page.locator("select") }).last();
    await modal.waitFor({ timeout: 10000 });
    const selects = modal.locator("select");
    await esperarOpcoes(selects.nth(0), 5);
    const marca = await escolherPorTexto(selects.nth(0), /^Fiat$/i);
    await esperarOpcoes(selects.nth(1), 2);
    const modelo = await escolherPorTexto(selects.nth(1), /Pulse/i);
    await esperarOpcoes(selects.nth(2), 2);
    const opcoesAno = await selects.nth(2).locator("option").allTextContents();
    if (opcoesAno.some((o) => o.includes("32000"))) throw new Error(`select mostra "32000": ${opcoesAno.slice(0, 3).join(" | ")}`);
    const ano = await escolherPorTexto(selects.nth(2), /2023|2024/);
    await page.waitForTimeout(2500);
    // O formulário exige foto, e escolher uma abre o recorte antes de voltar.
    await modal.locator('input[type="file"]').setInputFiles(path.resolve("public/icons/icon-512.png"));
    await page.getByRole("button", { name: /^Salvar$/ }).last().click({ timeout: 10000 });
    await page.waitForTimeout(3000);
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(3500);
    return `${marca} · ${modelo} · ${ano}`;
  });

  await etapa("Ana: carro aparece na garagem", A, async () => {
    await page.goto(`${BASE}/garagem`, { waitUntil: "load" });
    await page.waitForTimeout(3500);
    const t = await textoDaPagina(page);
    if (!/Pulse/i.test(t)) throw new Error(`carro não aparece — ${t.slice(0, 160)}`);
    return "Pulse listado";
  });

  await etapa("Ana: fecha a celebração e lê o card", A, async () => {
    await fecharSobreposicoes(page);
    const card = await textoDaPagina(page);
    if (/32000/.test(card)) throw new Error("card mostra o ano 32000");
    // Sem aporte, falta tudo: o card tem que dizer 100%.
    if (!/FALTA\s*100\s*%/i.test(card)) throw new Error(`"falta" não é 100% — ${(card.match(/FALTA[^R]*/i) || [""])[0]}`);
    return `ano: ${(card.match(/0 ?km|20\d\d/i) || ["?"])[0]} · falta 100%`;
  });

  // O simulador ficou enxuto em 06/10/2026: abre direto no custo do mês,
  // sem convite de renda nem aba "Avançado".
  await etapa("Ana: simulador abre com o custo do mês", A, async () => {
    await page.getByRole("button", { name: /Simular/ }).first().click();
    await page.waitForTimeout(2500);
    const t = await textoDaPagina(page);
    const custo = (t.match(/R\$ ?[\d.]+ ?por mês/) || [""])[0];
    if (!custo) throw new Error(`custo do mês ausente — ${t.slice(0, 160)}`);
    return custo;
  });

  await etapa("Ana: fecha o simulador pelo X", A, async () => {
    // Esc não fecha (achado registrado); aqui o caminho que existe.
    // O X do simulador se chama "Fechar" (até 25/09/2026 era "Cancelar").
    await page.getByRole("button", { name: "Fechar", exact: true }).first().click();
    await page.waitForTimeout(1500);
    return "fechou";
  });

  await etapa("Ana: Esc fecha o simulador e o cadastro de carro", A, async () => {
    await page.getByRole("button", { name: /Simular/ }).first().click();
    await page.waitForTimeout(2000);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    if (await page.getByText("O VEREDITO").count()) throw new Error("Esc não fechou o simulador");
    await page.getByRole("button", { name: /Adicionar carro/ }).first().click();
    await page.waitForTimeout(1500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    if (await page.getByText("Cadastrar carro").count()) throw new Error("Esc não fechou o cadastro de carro");
    return "os dois fecham com Esc";
  });

  // O card mostra quanto FALTA ("FALTA 100% · R$ 103.519,00"). O preço FIPE
  // muda todo mês, então o que se confere é a diferença antes/depois.
  const faltaNoCard = (texto) => {
    // O percentual pode ter casa decimal: "FALTA 95,2%".
    const m = texto.match(/FALTA\s*[\d,]+%\s*R\$\s*([\d.]+),(\d{2})/i);
    return m ? Number(m[1].replace(/\./g, "")) + Number(m[2]) / 100 : null;
  };

  await etapa("Ana: registra aporte", A, async () => {
    const faltavaAntes = faltaNoCard(await textoDaPagina(page));
    await page.getByRole("button", { name: /Registrar aporte|^Aporte$/ }).first().click();
    await page.waitForTimeout(1500);
    const campo = page.locator('input[inputmode="numeric"], input[inputmode="decimal"]').first();
    await campo.fill("5000");
    await page.getByRole("button", { name: /Registrar|Salvar|Confirmar/ }).last().click();
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/garagem`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    await fecharSobreposicoes(page);
    const t = await textoDaPagina(page);
    const faltaDepois = faltaNoCard(t);
    if (faltavaAntes == null || faltaDepois == null || faltavaAntes - faltaDepois !== 5000) {
      throw new Error(`card NÃO reflete o aporte — antes ${faltavaAntes}, depois ${faltaDepois}`);
    }
    return `falta caiu R$ 5.000 (${faltavaAntes} → ${faltaDepois})`;
  });

  await etapa("Ana: abre a ficha técnica", A, async () => {
    await fecharSobreposicoes(page);
    // A ficha abre pela seta no alto do card (o texto "Ver ficha técnica" é
    // só aria-label do botão da seta).
    await page.getByRole("button", { name: /ficha técnica/i }).first().click();
    await page.waitForTimeout(3000);
    const t = await textoDaPagina(page);
    await page.keyboard.press("Escape");
    return /Motor|Potência|Consumo|ficha/i.test(t) ? "ficha abriu" : `? ${t.slice(0, 160)}`;
  });

  // ---------------- Comunidade ----------------
  const TEXTO_POST = `Primeira volta com o Pulse ${SUFIXO}`;
  await etapa("Ana: publica na Comunidade", A, async () => {
    await page.goto(`${BASE}/community`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: /^Publicar$/ }).first().click();
    await page.getByPlaceholder("Conte o que rolou com o carro hoje...").fill(TEXTO_POST);
    await page.getByRole("button", { name: /^Publicar$/ }).last().click();
    await page.waitForTimeout(4000);
    const t = await textoDaPagina(page);
    return t.includes(TEXTO_POST) ? "post aparece no feed" : `post NÃO aparece — ${t.slice(0, 160)}`;
  });

  await etapa("Ana: Painel carrega", A, async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
    await page.waitForTimeout(5000);
    const t = await textoDaPagina(page);
    return t.slice(0, 140);
  });

  await etapa("Ana: Configurações carrega", A, async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: "load" });
    await page.waitForTimeout(3500);
    const t = await textoDaPagina(page);
    return /Configurações/.test(t) ? "ok" : t.slice(0, 140);
  });

  // ---------------- Clube ----------------
  const SIGLA = `T${SUFIXO.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
  await etapa("Ana: funda um clube", A, async () => {
    await page.goto(`${BASE}/clubs`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: /Criar clube|^Criar$/ }).first().click();
    await page.waitForTimeout(1500);
    await page.getByPlaceholder("Civic Club Campinas").fill(`Pulse Clube ${SUFIXO}`);
    const sigla = page.getByLabel(/^Sigla/).or(page.locator('input[maxlength="5"]'));
    await sigla.first().fill(SIGLA);
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Rebaixados/ }).first().click();
    await page.getByLabel(/Cidade-base/).first().fill("Campinas");
    await page.getByRole("button", { name: "Fundar clube" }).last().click();
    await page.waitForTimeout(5000);
    const t = await textoDaPagina(page);
    const onde = new URL(page.url()).pathname;
    if (!t.includes(SIGLA)) throw new Error(`sigla não aparece depois de fundar — em ${onde}: ${t.slice(0, 200)}`);
    return `fundado, em ${onde}`;
  });

  // ---------------- Evento ----------------
  const TITULO_EVENTO = `Encontro Pulse ${SUFIXO}`;
  await etapa("Ana: cria um evento", A, async () => {
    await page.goto(`${BASE}/events`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: /Criar/ }).first().click();
    await page.waitForTimeout(1500);
    await page.getByPlaceholder("ex: 3ª Edição Cars & Coffee SP").fill(TITULO_EVENTO);
    const daqui15 = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
    await page.locator('input[type="date"]').first().fill(daqui15);
    await page.locator('input[type="time"]').first().fill("09:00");
    await page.getByPlaceholder("Descreva seu evento...").fill("Café e carros no domingo.");
    const selects = page.locator("form select");
    const total = await selects.count();
    for (let i = 0; i < total; i += 1) {
      const sel = selects.nth(i);
      if (await sel.isDisabled()) continue;
      if (!(await sel.inputValue())) await escolherPorTexto(sel, /São Paulo|Casual|Encontro/).catch(() => {});
    }
    await page.getByPlaceholder("ex: São Paulo").fill("Campinas").catch(() => {});
    await page.getByPlaceholder("ex: Rua das Flores, 123").fill("Parque Portugal").catch(() => {});
    await page.locator('form button[type="submit"]').last().click();
    await page.waitForTimeout(4500);
    const t = await textoDaPagina(page);
    const erro = await page.locator("form .text-red-500, form .text-red-400, form [role=alert]").allTextContents().catch(() => []);
    if (!t.includes(TITULO_EVENTO)) throw new Error(`evento não aparece${erro.length ? ` — formulário diz: ${erro.join(" | ")}` : ""} — ${t.slice(0, 160)}`);
    return "evento listado";
  });

  // ---------------- Bruno, no celular ----------------
  const B = await novaSessao(browser, { mobile: true });
  const pb = B.page;

  await etapa("Bruno (celular): cadastro", B, async () => {
    await cadastrar(pb, USUARIOS.b);
    await pb.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 20000 });
    return new URL(pb.url()).pathname;
  });

  await etapa("Bruno: vê o post da Ana no feed", B, async () => {
    await pb.goto(`${BASE}/community`, { waitUntil: "load" });
    await pb.waitForTimeout(4500);
    const t = await textoDaPagina(pb);
    if (!t.includes(TEXTO_POST)) throw new Error(`post da Ana não aparece — ${t.slice(0, 200)}`);
    return "aparece";
  });

  await etapa("Bruno: ?tab=feed (link do mural do clube) mostra o feed", B, async () => {
    await pb.goto(`${BASE}/community?tab=feed`, { waitUntil: "load" });
    await pb.waitForTimeout(4000);
    if (!(await textoDaPagina(pb)).includes(TEXTO_POST)) throw new Error("feed vazio com ?tab=feed");
    await pb.goto(`${BASE}/community`, { waitUntil: "load" });
    await pb.waitForTimeout(3000);
    return "feed renderiza";
  });

  await etapa("Bruno: curte o post da Ana", B, async () => {
    const post = pb.locator("article").filter({ hasText: TEXTO_POST }).first();
    await post.getByRole("button", { name: /curtir|like/i }).first().click();
    await pb.waitForTimeout(2500);
    const t = (await post.innerText()).replace(/\s+/g, " ");
    return `card depois: ${t.slice(0, 140)}`;
  });

  await etapa("Bruno: abre o perfil da Ana e segue", B, async () => {
    // LINK DIRETO, como quem recebe o perfil compartilhado. Até 25/09/2026
    // isto redirecionava para a Comunidade (1ª resposta da escuta vinha do
    // cache); o roteiro precisava passar antes pela Comunidade.
    await pb.goto(`${BASE}/community/@${USUARIOS.a.usuario}`, { waitUntil: "load" });
    await pb.waitForTimeout(4000);
    if (!new URL(pb.url()).pathname.includes(`@${USUARIOS.a.usuario}`)) {
      throw new Error(`link direto redirecionou para ${new URL(pb.url()).pathname}`);
    }
    await pb.waitForTimeout(4000);
    await pb.getByRole("button", { name: /^Seguir$/ }).first().click();
    await pb.waitForTimeout(2500);
    const t = await textoDaPagina(pb);
    await pb.waitForTimeout(3000);
    const depois = ((await textoDaPagina(pb)).match(/(\d+) SEGUIDORES/i)?.[1] ?? "?");
    if (!/SEGUINDO/i.test(t)) throw new Error("botão não virou Seguindo");
    if (depois !== "1") throw new Error(`contador de seguidores ficou em ${depois}`);
    return "virou Seguindo · 1 seguidor";
  });

  await etapa("Bruno: entra no clube da Ana", B, async () => {
    await pb.goto(`${BASE}/clubs`, { waitUntil: "load" });
    await pb.waitForTimeout(4000);
    // Logado, a aba padrão é "Meus clubes"; a busca mora em Descobrir.
    await pb.getByRole("button", { name: "Descobrir", exact: true }).first().click();
    await pb.waitForTimeout(2500);
    await pb.getByPlaceholder(/Buscar por nome ou sigla/).fill(SIGLA);
    await pb.waitForTimeout(3000);
    await pb.getByText(`Pulse Clube ${SUFIXO}`).first().click();
    await pb.waitForTimeout(3500);
    await pb.getByRole("button", { name: /^Entrar/ }).first().click();
    await pb.waitForTimeout(3500);
    const t = await textoDaPagina(pb);
    return /Membro|Sair do clube/.test(t) ? "virou membro" : `? ${t.slice(0, 200)}`;
  });

  await etapa("Bruno: confirma presença no evento", B, async () => {
    await pb.goto(`${BASE}/community?tab=eventos`, { waitUntil: "load" });
    await pb.waitForTimeout(3000);
    await pb.getByRole("button", { name: "Descobrir", exact: true }).click();
    await pb.waitForTimeout(3000);
    await pb.getByText(TITULO_EVENTO).first().click();
    await pb.waitForTimeout(3500);
    await pb.getByRole("button", { name: /Confirmar Presença/i }).first().click();
    await pb.waitForTimeout(1500);
    // Abre um formulário curto (carro que vai levar etc.) antes de gravar.
    await pb.getByRole("button", { name: "Confirmar", exact: true }).last().click();
    await pb.waitForTimeout(3000);
    const t = await textoDaPagina(pb);
    if (!/Você confirmou presença|Cancelar Presença/i.test(t)) throw new Error(`não confirmou — ${t.slice(0, 200)}`);
    return (t.match(/\d+ confirmados?/) || ["confirmado"])[0];
  });

  await etapa("Bruno: manda mensagem pelo botão do perfil", B, async () => {
    await pb.goto(`${BASE}/community/@${USUARIOS.a.usuario}`, { waitUntil: "load" });
    await pb.waitForTimeout(4000);
    await pb.getByRole("button", { name: /^Mensagem$/i }).first().click();
    await pb.waitForURL((u) => /\/messages\/.+/.test(u.pathname), { timeout: 15000 });
    await pb.waitForTimeout(2500);
    const caixa = pb.locator("textarea").last();
    await caixa.fill(`Oi Ana, bora no encontro? ${SUFIXO}`);
    await pb.locator('button[type="submit"]').last().click();
    await pb.waitForTimeout(3000);
    const t = await textoDaPagina(pb);
    if (!t.includes(`bora no encontro? ${SUFIXO}`)) throw new Error(`não aparece na conversa — ${t.slice(0, 160)}`);
    return `conversa aberta direto (${new URL(pb.url()).pathname.slice(0, 22)}…)`;
  });

  // ---------------- Ana recebe ----------------
  await etapa("Ana: notificações de curtida e seguidor", A, async () => {
    await page.goto(`${BASE}/garagem`, { waitUntil: "load" });
    await page.waitForTimeout(3500);
    await page.getByRole("button", { name: /Notificações|notifica/i }).first().click();
    await page.waitForTimeout(2500);
    const t = await textoDaPagina(page);
    const curtiu = /curtiu/i.test(t);
    const seguiu = /começou a seguir|seguiu você|novo seguidor/i.test(t);
    const painel = (await page.locator('[role="dialog"], aside').last().innerText().catch(() => "")).replace(/\s+/g, " ");
    if (!curtiu || !seguiu) throw new Error(`curtida: ${curtiu ? "sim" : "NÃO"} · seguidor: ${seguiu ? "sim" : "NÃO"} · painel: ${painel.slice(0, 200)}`);
    return "curtida e novo seguidor notificados";
  });

  await etapa("Ana: recebe a mensagem do Bruno", A, async () => {
    await page.goto(`${BASE}/messages`, { waitUntil: "load" });
    await page.waitForTimeout(4000);
    const t = await textoDaPagina(page);
    if (t.includes(`bora no encontro? ${SUFIXO}`)) return "texto da mensagem já visível na lista";
    await page.getByText(`@${USUARIOS.b.usuario}`).first().click();
    await page.waitForTimeout(3000);
    const conversa = await textoDaPagina(page);
    if (!conversa.includes(`bora no encontro? ${SUFIXO}`)) throw new Error(`mensagem NÃO chegou — ${conversa.slice(0, 200)}`);
    return "mensagem chegou na conversa";
  });

  await browser.close();
  process.exit(relatorio() ? 1 : 0);
}
