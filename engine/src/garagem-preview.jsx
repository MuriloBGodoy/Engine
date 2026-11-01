/**
 * Banco de prova do card de carro.
 *
 * A Garagem vive atrás do login, então o card nunca tinha sido medido no
 * celular — e era justamente lá que ele quebrava: `h-[560px]` fixo, herdado da
 * grade de três colunas do desktop, sobrava numa tela de 390 e cortava o que
 * não coubesse, porque o card também é `overflow-hidden`.
 *
 * Foi aqui que as quatro variantes do redesenho foram medidas lado a lado
 * (551px → 341px por card no celular) antes de a escolhida virar o CarCard.
 * As referências e os prints dessa comparação estão em
 * `ui designs/2026-08-25-card-carro-mobile/`.
 *
 * Não entra no build: o Vite só empacota o index.html. Vive no `npm run dev`,
 * em /garagem-preview.html.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { CarCard } from "./components/CarCard";
import { Garagem } from "./pages/Garagem";
import { CAR_TYPE_OWNED, FalhaDeLeitura } from "./services/db";
import "./index.css";
import "./services/i18n";
import "./services/i18n-garage-fixes";
import "./services/i18n-reminders";
import "./services/i18n-garage-v2";
import { MemoryRouter } from "react-router-dom";

const QUERY = new URLSearchParams(window.location.search);
if (QUERY.get("dark") === "1") document.documentElement.classList.add("dark");

const TEMA_ALTERNADO = (() => {
  const q = new URLSearchParams(QUERY);
  if (q.get("dark") === "1") q.delete("dark");
  else q.set("dark", "1");
  return q;
})();

const FOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
       <rect width="640" height="360" fill="#2b2f36"/>
       <text x="50%" y="52%" fill="#8b94a3" font-family="sans-serif"
             font-size="26" text-anchor="middle">foto do carro</text>
     </svg>`,
  );

// Nome longo de propósito: é o caso que trunca e o que empurra a altura.
const CARROS = [
  {
    rotulo: "Meta em andamento",
    car: {
      id: "1", brand: "Chevrolet", model: "Onix Hatch LT 1.0 12V Flex 5p Mec.",
      year: 2024, image: FOTO, type: "goal",
      targetValue: 92000, savedValue: 34500, progress: 37, remaining: 57500,
    },
  },
  {
    rotulo: "Carro próprio (com custo de posse)",
    car: {
      id: "2", brand: "Volkswagen", model: "Golf GTI 2.0 TSI", year: 2019,
      image: FOTO, type: CAR_TYPE_OWNED, owned: true,
      targetValue: 0, savedValue: 0, progress: 0, remaining: 0,
      ownership: { fuelPrice: 6.2, monthlyKm: 1200, insurance: 320, ipvaValue: 2400 },
    },
  },
  {
    rotulo: "Meta conquistada",
    car: {
      id: "3", brand: "Fiat", model: "Argo Drive 1.3", year: 2022, image: FOTO,
      type: "goal", targetValue: 68000, savedValue: 68000, progress: 100,
      remaining: 0, markAchieved: true,
    },
  },
];

/**
 * O estado de erro da Garagem, que so aparece quando a leitura falha e nao ha
 * cache. Fica no banco de prova porque e justamente o estado que ninguem ve
 * ate o dia em que ele importa — e no dia em que importou, ele nao existia:
 * a tela dizia "adicione seu primeiro carro" para quem tinha sete.
 */
function ProvaDeErro() {
  return (
    <div className="min-h-screen bg-[var(--engine-bg)] font-sans text-[var(--engine-text)]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <Garagem
          cars={[]}
          loadError={new FalhaDeLeitura("a garagem", new Error("timeout"))}
          onRetry={() => {}}
          onOpenModal={() => {}}
          onOpenDelete={() => {}}
          onOpenOwnership={() => {}}
          onAddContribution={() => {}}
          onAddExpense={() => {}}
          onMarkAchieved={() => {}}
          onOpenSpecs={() => {}}
        />
      </div>
    </div>
  );
}

export function Prova() {
  // Sem largura artificial: quem varia e o VIEWPORT, medido com emulacao de
  // dispositivo. Forcar a largura de um div nao liga as media queries — as
  // classes `sm:`/`md:` continuam valendo pela janela, e a primeira medicao
  // desta tela saiu errada exatamente por isso.
  return (
    <div className="min-h-screen bg-[var(--engine-bg)] font-sans text-[var(--engine-text)]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
            Card de carro
          </p>
          <a
            href={`?${TEMA_ALTERNADO}`}
            className="rounded-full border border-[var(--engine-border)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]"
          >
            {QUERY.get("dark") === "1" ? "Claro" : "Escuro"}
          </a>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CARROS.map(({ rotulo, car }) => (
            <div key={car.id} data-prova={rotulo}>
              <CarCard
                car={car}
                onDelete={() => {}}
                onOpenOwnership={() => {}}
                onAddContribution={() => {}}
                onAddExpense={() => {}}
                onMarkAchieved={() => {}}
                onOpenSpecs={() => {}}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MemoryRouter>{QUERY.get("erro") === "1" ? <ProvaDeErro /> : <Prova />}</MemoryRouter>
  </React.StrictMode>,
);
