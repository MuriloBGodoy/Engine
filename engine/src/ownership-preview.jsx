/**
 * Banco de prova do simulador (Jesse).
 *
 * NÃO É MAIS TEMPORÁRIO (22/08/2026). Ficou porque é a única forma de olhar o
 * que está atrás do login sem criar conta na produção. Foi com ele que a
 * auditoria mobile mediu o simulador e a ficha pela primeira vez num celular.
 * Não entra no build: o Vite só empacota o index.html, então isto vive só no
 * `npm run dev` — abrir /ownership-preview.html ou /ficha-preview.html.
 * A Garagem exige login; este entry monta o OwnershipModal DE PRODUCAO com um
 * carro real e um carro de referencia com abastecimentos, para fotografar o
 * estado ATUAL antes do redesenho.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { OwnershipModal } from "./components/OwnershipModal";
import "./index.css";
import "./services/i18n";

const QUERY = new URLSearchParams(window.location.search);
if (QUERY.get("dark") === "1") document.documentElement.classList.add("dark");

const dias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const alvo = {
  id: "alvo",
  brand: "Fiat",
  model: "PULSE Drive 1.0 Turbo 200 Flex Aut.",
  year: "2023 Gasolina",
  type: "goal",
  targetValue: 92000,
  savedValue: 18000,
};

// Carro que a pessoa ja tem, com abastecimentos suficientes para o
// expenses.js calcular consumo real, km/mes e media mensal.
const atual = {
  id: "atual",
  brand: "VW - VolksWagen",
  model: "Gol 1.6 Mi Total Flex 8V 4p",
  year: "2014 Gasolina",
  type: "owned",
  targetValue: 34000,
  savedValue: 34000,
  expenses: [
    { id: "e1", category: "fuel", amount: 280, date: dias(96), odometer: 118400, liters: 40 },
    { id: "e2", category: "fuel", amount: 291, date: dias(74), odometer: 118850, liters: 41 },
    { id: "e3", category: "maintenance", amount: 620, date: dias(60), note: "Revisao 120 mil" },
    { id: "e4", category: "fuel", amount: 305, date: dias(52), odometer: 119320, liters: 43 },
    { id: "e5", category: "insurance", amount: 210, date: dias(40) },
    { id: "e6", category: "fuel", amount: 298, date: dias(28), odometer: 119760, liters: 42 },
    { id: "e7", category: "fuel", amount: 312, date: dias(6), odometer: 120240, liters: 44 },
  ],
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnershipModal
      isOpen
      car={alvo}
      cars={[alvo, atual]}
      settings={{
        // ?pais=PT fotografa a tela de fora do Brasil ("estamos trabalhando nisso").
        profile: { country: QUERY.get("pais") || "BR", state: QUERY.get("pais") ? "" : "SP" },
        // ?sem=1 derruba a renda: é o estado 2 (primeira visita), que é o mais
        // comum e por isso precisa ser fotografado tambem.
        // ?renda= e ?contas= fotografam qualquer celula da grade medida — em
        // especial o caso rebaixado pelo teto de fatia da renda
        // (?renda=11000&contas=500), que é "aperta" com R$ 4.438 sobrando.
        budget:
          QUERY.get("sem") === "1"
            ? {}
            : {
                monthlyIncome: Number(QUERY.get("renda")) || 5200,
                monthlyExpenses: Number(QUERY.get("contas")) || 3400,
              },
      }}
      onClose={() => {}}
      onSave={async () => true}
      onSettingsUpdate={() => {}}
    />
  </React.StrictMode>,
);
