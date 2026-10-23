/* global document -- usado dentro de page.evaluate(), que roda no navegador */
/**
 * Gravação que falha AVISA — o caminho do erro, provado.
 *
 *   node scripts/e2e-falhas.mjs      (com o vite no ar, ver e2e-emulator.mjs)
 *
 * Até 25/09/2026 cinco gravações pegavam o erro do Firestore, guardavam uma
 * cópia no navegador e devolviam sucesso. O gatilho mais comum na vida real é
 * conexão ruim, então é o que se simula aqui: a página fica offline no meio
 * do uso, a gravação estoura o tempo-limite (7 s), e a tela TEM que dizer que
 * não deu — e não pode fingir o contrário.
 */
import path from "node:path";
import { chromium } from "playwright";
import {
  novaSessao, etapa, cadastrar, relatorio, USUARIOS, textoDaPagina,
  esperarOpcoes, escolherPorTexto, fecharSobreposicoes,
} from "./e2e-emulator.mjs";

const BASE = process.env.E2E_BASE || "http://localhost:5190";
const browser = await chromium.launch();
const S = await novaSessao(browser);
const p = S.page;

// Ruído que este teste CAUSA de propósito (cortar a rede) e o próprio aviso
// sendo registrado no console — não são defeito do app.
const registrar = S.erros.push.bind(S.erros);
S.erros.push = (...itens) =>
  registrar(...itens.filter((e) => !/ERR_INTERNET_DISCONNECTED|não chegou ao servidor|não confirmou/i.test(e)));

const lerToasts = () =>
  p.evaluate(() =>
    [...document.querySelectorAll("[role=status], [role=alert], [aria-live]")]
      .map((e) => e.textContent.trim())
      .filter(Boolean),
  );

// O aviso dura ~2,6 s. Com o Firestore a falha offline só chegava depois do
// tempo-limite de 7 s; com o Supabase o erro de rede chega na hora, e olhar
// num instante fixo perdia o aviso que já tinha passado. Espera o aviso
// APARECER, até `ms`.
const esperarToast = async (padrao, ms = 10000) => {
  const vistos = new Set();
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    (await lerToasts()).forEach((t) => vistos.add(t));
    if ([...vistos].some((t) => padrao.test(t))) break;
    await p.waitForTimeout(200);
  }
  return [...vistos];
};

await etapa("cadastro + carro (online)", S, async () => {
  await cadastrar(p, USUARIOS.a);
  await p.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 20000 });
  await p.goto(`${BASE}/garagem`, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  await p.getByRole("button", { name: /Adicionar carro/ }).first().click();
  const modal = p.locator("form").filter({ has: p.locator("select") }).last();
  const sel = modal.locator("select");
  await esperarOpcoes(sel.nth(0), 5);
  await escolherPorTexto(sel.nth(0), /^Fiat$/i);
  await esperarOpcoes(sel.nth(1), 2);
  await escolherPorTexto(sel.nth(1), /Mobi/i);
  await esperarOpcoes(sel.nth(2), 2);
  await escolherPorTexto(sel.nth(2), /20\d\d/);
  await p.waitForTimeout(2000);
  await modal.locator('input[type="file"]').setInputFiles(path.resolve("public/icons/icon-512.png"));
  await p.getByRole("button", { name: /^Salvar$/ }).last().click({ timeout: 10000 });
  await p.waitForTimeout(2000);
  await modal.locator('button[type="submit"]').click();
  await p.waitForTimeout(4000);
  await fecharSobreposicoes(p);
  if (!/Mobi/i.test(await textoDaPagina(p))) throw new Error("carro não entrou");
  return "Mobi na garagem";
});

await etapa("OFFLINE: excluir carro avisa e o carro fica", S, async () => {
  await S.ctx.setOffline(true);
  await p.getByRole("button", { name: "Excluir" }).first().click();
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Excluir" }).last().click();
  const toasts = await esperarToast(/excluir|servidor/i);
  const aindaLa = /Mobi/i.test(await textoDaPagina(p));
  await S.ctx.setOffline(false);
  if (!toasts.some((x) => /excluir|servidor/i.test(x))) throw new Error(`sem aviso — toasts: ${toasts.join(" | ") || "(nenhum)"}`);
  if (!aindaLa) throw new Error("carro sumiu da tela sem ter sido excluído no servidor");
  return `aviso: "${toasts.find((x) => /excluir|servidor/i.test(x))}"`;
});

await etapa("OFFLINE: anúncio de serviço avisa que NÃO foi enviado", S, async () => {
  await p.goto(`${BASE}/services`, { waitUntil: "load" });
  await p.waitForTimeout(3500);
  // Sessão nova confere os marcos da garagem: "Primeira Meta" comemora aqui.
  await fecharSobreposicoes(p);
  await p.getByRole("button", { name: /Cadastrar novo serviço|Novo serviço/i }).first().click();
  await p.waitForTimeout(1500);
  await p.getByPlaceholder("Limpeza premium de carros em domicílio").fill("Polimento técnico");
  await p.getByPlaceholder("Seu nome ou empresa").fill("Ana Estética");
  await p.getByPlaceholder(/Explique o que você faz/).fill("Polimento e vitrificação com hora marcada.");
  await p.getByPlaceholder("São Paulo, SP").fill("Campinas").catch(() => {});
  await p.getByPlaceholder("Rua, número, bairro").fill("Av. Norte-Sul, 1000").catch(() => {});
  await p.getByPlaceholder(/Zona Sul, ABC/).fill("Campinas e região").catch(() => {});
  await S.ctx.setOffline(true);
  await p.getByRole("button", { name: /Enviar para aprovação/i }).last().click();
  const toasts = await esperarToast(/NÃO foi enviado|servidor|enviado para aprovação/i);
  await S.ctx.setOffline(false);
  if (toasts.some((x) => /enviado para aprovação/i.test(x) && !/NÃO/.test(x))) {
    throw new Error(`fingiu sucesso: ${toasts.join(" | ")}`);
  }
  if (!toasts.some((x) => /NÃO foi enviado|servidor/i.test(x))) throw new Error(`sem aviso — ${toasts.join(" | ") || "(nenhum)"}`);
  return "avisou que não foi enviado";
});

await browser.close();
process.exit(relatorio() ? 1 : 0);
