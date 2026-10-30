/**
 * Banco de prova da Home de quem entrou (MemberHome).
 *
 * A Home logada lê a garagem da conta, e não se entra na conta de ninguém na
 * produção só para medir uma tela. Este entry monta o MemberHome DE PRODUÇÃO
 * com um usuário e carros de mentira (um que se tem, com lembretes, e duas
 * metas); serviços, posts e eventos vêm do banco de verdade, só leitura.
 *
 * Não entra no build: o Vite só empacota o index.html. Vive no `npm run dev`,
 * em /home-member-preview.html (?dark=1, ?empty=1 para a garagem vazia).
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { RegionProvider } from "./hooks/RegionProvider";
import { MemberHome } from "./components/home/MemberHome";
import "./index.css";
import "./services/i18n";
import "./services/i18n-quotes";
import "./services/i18n-services-extra";
import "./services/i18n-reminders";
import "./services/i18n-home";

const QUERY = new URLSearchParams(window.location.search);
if (QUERY.get("dark") === "1") document.documentElement.classList.add("dark");

const emDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const PHOTO = "https://evaankeqxykcktxvesbf.supabase.co/storage/v1/object/public/photos/migrated/";

const cars = QUERY.get("empty") === "1" ? [] : [
  {
    id: "owned-1",
    type: "owned",
    brand: "VW - VolksWagen",
    model: "Polo GTS 1.4 TSI 16V Flex",
    year: "2022",
    image: `${PHOTO}927d2dc818da32ad259af3634081aa25f5ed49ad.jpg`,
    reminders: {
      uf: "SP",
      plateDigit: "6",
      ipva: { manualDate: emDias(9) },
      revision: { intervalMonths: 12, lastDate: emDias(-370) },
      insurance: { renewalDate: emDias(24) },
    },
  },
  {
    id: "goal-1",
    type: "goal",
    brand: "BMW",
    model: "M2 Competition 3.0 Bi-Turbo 410cv Aut.",
    year: "2020",
    targetValue: 420000,
    savedValue: 63000,
    image: `${PHOTO}ab8bb1b043929e0e35b294b230b053ed4114c0ed.jpg`,
  },
  {
    id: "goal-2",
    type: "goal",
    brand: "Audi",
    model: "TT 2.0 16v TFSI S-Tronic",
    year: "2015",
    targetValue: 150000,
    savedValue: 12000,
    image: `${PHOTO}39ea96d3d5004a23a0dfb422c2ecbb5e241ed426.jpg`,
  },
];

const user = { uid: "00000000-0000-4000-8000-000000000000", displayName: "Murilo Godoy" };

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <RegionProvider>
        <div className="min-h-[100dvh] bg-[var(--engine-bg)] px-4 py-5 font-sans text-[var(--engine-text)] sm:px-6 lg:px-10 lg:py-8">
          <div className="engine-container">
            <MemberHome user={user} cars={cars} settings={{ profile: { displayName: "Murilo Godoy" } }} />
          </div>
        </div>
      </RegionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
