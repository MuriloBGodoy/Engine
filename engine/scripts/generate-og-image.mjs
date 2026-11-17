/**
 * Gera o cartão de link do Engine (Open Graph), 1200x630.
 *
 * Rodar com `npm run og` sempre que a marca ou a frase mudarem. O PNG vai
 * para public/og-engine.png e é versionado — o build não gera nada.
 *
 * Por que isto existe: as páginas fundas do Engine (post, perfil, carro,
 * clube, evento, anúncio) já ganham cartão pelas edge functions social-og e
 * service-og. A RAIZ não tinha nenhum — e a raiz é justamente o link que vai
 * na bio do Instagram e no story. Compartilhar enginegarage.com.br no
 * WhatsApp mostrava só a URL crua, sem imagem, sem título, sem frase.
 *
 * Por que Playwright e não SVG+sharp como os ícones: a palavra ENGINE é Sora
 * 800 itálica. Um <text> em SVG só desenha a fonte certa em quem a tem
 * instalada; aqui o navegador baixa a Sora de verdade e o PNG sai com o
 * desenho definitivo. Mesmo motivo do gerador da logo horizontal.
 *
 * O "E" é o DO REPO, não redesenhado: mesmo rect + path de public/favicon.svg
 * e de src/components/Logo.jsx.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const saida = resolve(here, "../public/og-engine.png");

const RED = "#e11d2a";
const INK = "#08090c";

// 1200x630 é a medida que WhatsApp, Instagram, Facebook, X e LinkedIn pedem
// para o cartão grande. Abaixo de 600px de largura o WhatsApp cai no cartão
// pequeno (miniatura quadrada ao lado do texto), que é o que queremos evitar.
const LARGURA = 1200;
const ALTURA = 630;

const pagina = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Sora:wght@700;800&display=swap"
    />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: ${LARGURA}px;
        height: ${ALTURA}px;
        background: ${INK};
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 0 96px;
        position: relative;
        overflow: hidden;
        font-family: Inter, sans-serif;
      }
      /* O brilho vermelho atrás, bem de leve: dá profundidade sem virar
         enfeite. Fica no canto superior direito para não brigar com o texto,
         que é alinhado à esquerda. */
      .brilho {
        position: absolute;
        top: -340px;
        right: -220px;
        width: 820px;
        height: 820px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(225,29,42,.30) 0%, rgba(225,29,42,0) 68%);
      }
      /* Faixa vermelha na base: a assinatura que o app usa na barra de cima. */
      .faixa {
        position: absolute;
        left: 0; right: 0; bottom: 0;
        height: 10px;
        background: ${RED};
      }
      .marca { display: flex; align-items: center; gap: 22px; position: relative; }
      .palavra {
        font-family: Sora, sans-serif;
        font-weight: 800;
        font-style: italic;
        font-size: 92px;
        letter-spacing: -.035em;
        color: #fff;
        /* A Sora itálica passa da largura de avanço: sem esta folga o "E"
           final encosta no que vier depois. Mesmo ajuste da logo horizontal. */
        padding-right: .16em;
        line-height: 1;
      }
      h1 {
        position: relative;
        margin-top: 44px;
        max-width: 880px;
        font-size: 56px;
        font-weight: 700;
        line-height: 1.15;
        letter-spacing: -.02em;
        color: #fff;
      }
      p {
        position: relative;
        margin-top: 22px;
        max-width: 820px;
        font-size: 29px;
        font-weight: 400;
        line-height: 1.45;
        color: #9aa0ab;
      }
      .dominio {
        position: relative;
        margin-top: 52px;
        font-size: 25px;
        font-weight: 600;
        letter-spacing: .02em;
        color: ${RED};
      }
    </style>
  </head>
  <body>
    <div class="brilho"></div>

    <div class="marca">
      <svg width="104" height="104" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" rx="15" fill="${RED}" />
        <path fill="#fff" d="M18 46 24.4 18h23.2l-1.5 6.4H30.2l-1 4.3h14.5l-1.4 6.1H27.8l-1.1 4.8h16.4L41.6 46H18Z" />
      </svg>
      <span class="palavra">ENGINE</span>
    </div>

    <h1>Sua garagem virou rede.</h1>
    <p>Metas, custos, manutenção e a comunidade automotiva em um só lugar.</p>
    <div class="dominio">enginegarage.com.br</div>

    <div class="faixa"></div>
  </body>
</html>`;

const navegador = await chromium.launch();
const aba = await navegador.newPage({
  viewport: { width: LARGURA, height: ALTURA },
  deviceScaleFactor: 1,
});
await aba.setContent(pagina, { waitUntil: "networkidle" });
// `document.fonts.ready` é o que garante que a Sora já desenhou. Sem isto o
// print pode sair com a fonte de reserva, e aí a marca fica errada.
// eslint-disable-next-line no-undef -- roda DENTRO do navegador, não no Node.
await aba.evaluate(() => document.fonts.ready);
await aba.screenshot({ path: saida });
await navegador.close();

console.log(`cartão gerado: ${saida} (${LARGURA}x${ALTURA})`);
