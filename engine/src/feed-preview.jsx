/**
 * Banco de prova do cartão de post do feed (redesenho de 02/11/2026).
 *
 * O feed real depende do banco e de quem está logado; aqui o GoalCard DE
 * PRODUÇÃO roda com os formatos que importam: carrossel em retrato (4:5),
 * meta do próprio dono (com dinheiro) e de outra pessoa (só %), post de
 * carro com ficha declarada, texto puro com #tag e @menção, foto panorâmica.
 *
 * Não entra no build: o Vite só empacota o index.html. Vive no `npm run dev`,
 * em /feed-preview.html (`?dark=1` para o tema escuro, `?modal=1` para o
 * cartão no formato da publicação aberta).
 */
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GoalCard } from "./pages/Community";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { ToastProvider } from "./components/ToastProvider";
import "./index.css";
import "./services/i18n";

const QUERY = new URLSearchParams(window.location.search);
if (QUERY.get("dark") === "1") {
  document.documentElement.classList.add("dark");
  document.documentElement.dataset.theme = "dark";
}
const MODAL = QUERY.get("modal") === "1";

// Foto de mentira com o tamanho de câmera de verdade: o cartão lê a
// proporção do `naturalWidth/Height`, então o SVG declara largura e altura.
const photo = (width, height, from, to) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-size="${Math.round(width / 14)}" text-anchor="middle" opacity=".7">${width}×${height}</text></svg>`,
  )}`;

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600e3).toISOString();

const base = {
  comments: [],
  rating: 0,
  verified: false,
  note: "",
  clubTag: "",
  likesBy: {},
  ratingsBy: {},
  savedValue: 0,
  targetValue: 0,
  progress: 0,
  images: [],
  image: "",
  videoUrl: "",
  video: null,
  editedAt: "",
};

const POSTS = [
  {
    ...base,
    id: "p1",
    kind: "post",
    author: "Rafael Mendes",
    username: "@rafa.gti",
    avatar: "RM",
    city: "São Paulo",
    verified: true,
    clubTag: "GTI-SP",
    ownerId: "u-rafa",
    title: "Volkswagen Golf GTI",
    brand: "Volkswagen",
    model: "Golf GTI 2.0 TSI",
    year: "2018",
    images: [photo(1080, 1350, "#1d3a6e", "#7a5a3a"), photo(1080, 1080, "#222831", "#4b5563"), photo(1920, 1080, "#3b6ea8", "#e8d9b8")],
    likes: 1284,
    createdAt: hoursAgo(2),
    editedAt: hoursAgo(1),
    specs: {
      version: { transmission: "dual_clutch", aspiration: "turbo" },
      performance: {
        powerCv: { value: 230, origin: "declared", method: "owner" },
        torque: { value: 35.7, unit: "kgfm", origin: "declared", method: "owner" },
      },
      mods: [],
      stage: null,
      notes: "",
    },
    note: "Finalmente saiu do alinhamento 3D. Rodas novas, geometria no lugar e agora é estrada. Valeu @oficina.moema pela paciência com o dono chato. Próximo passo é o remap stage 1, mas só depois da revisão dos 60 mil. #golfgti #mk7 #vwbrasil",
    comments: [
      { id: "c1", text: "Ficou absurdo esse azul", author: "Lu Santos", username: "@lu.santos", createdAt: hoursAgo(1) },
      { id: "c2", text: "Qual medida das rodas?", author: "Thiago", username: "@thi.motors", createdAt: hoursAgo(1) },
    ],
  },
  {
    ...base,
    id: "p2",
    kind: "goal",
    author: "Ana Carolina Prado",
    username: "@anacarol",
    avatar: "AC",
    ownerId: "u-me",
    isMine: true,
    title: "Porsche 718 Cayman",
    brand: "Porsche",
    model: "718 Cayman 2.0",
    year: "2020",
    images: [photo(1920, 1080, "#2a1530", "#f3b27a")],
    savedValue: 148600,
    targetValue: 420000,
    rating: 4.7,
    likes: 342,
    createdAt: hoursAgo(5),
    note: "Mais um mês batendo o aporte. 35% do caminho #metas #porsche",
  },
  {
    ...base,
    id: "p3",
    kind: "goal",
    author: "Carlos Henrique",
    username: "@carlao.opala",
    avatar: "CH",
    clubTag: "OPALA",
    ownerId: "u-carlao",
    title: "Chevrolet Opala",
    brand: "Chevrolet",
    model: "Opala Diplomata 4.1",
    year: "1988",
    images: [photo(1600, 900, "#1f3b2a", "#d7c99a")],
    progress: 62,
    likes: 96,
    createdAt: hoursAgo(26),
    note: "Restauração andando.",
  },
  {
    ...base,
    id: "p4",
    kind: "post",
    author: "Bruno Kawasaki",
    username: "@bruno.k",
    avatar: "BK",
    ownerId: "u-bruno",
    likes: 18,
    createdAt: hoursAgo(30),
    editedAt: hoursAgo(28),
    note: "Alguém já trocou a bomba d'água do Compass 2.0 flex? Na concessionária pediram R$ 2.890 com mão de obra. Quero saber se é justo antes de fechar #jeepcompass @oficina.moema",
    comments: [
      { id: "c3", text: "Peça original sai uns R$ 900, com 3h de serviço fica bem abaixo disso.", author: "Oficina Moema", username: "@oficina.moema" },
    ],
  },
];

function Feed() {
  const { t } = useTranslation();
  const [likes, setLikes] = useState({});
  const noop = () => {};

  return (
    <main className="min-h-screen bg-[var(--engine-bg)] py-0 sm:py-6">
      <div className="mx-auto max-w-[470px] sm:space-y-4">
        {POSTS.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={{ ...goal, likes: goal.likes + (likes[goal.id] ? 1 : 0) }}
            interactions={{ liked: Boolean(likes[goal.id]), comments: [], rating: 0 }}
            following={[]}
            shared
            t={t}
            currentUserId="u-me"
            variant={MODAL ? "modal" : "feed"}
            onLike={(id) => setLikes((current) => ({ ...current, [id]: !current[id] }))}
            onComment={noop}
            onRate={noop}
            onShare={noop}
            onUnshare={noop}
            onFollow={noop}
            onOpenProfile={noop}
            onEditComment={noop}
            onDeleteComment={noop}
            onOpenPost={MODAL ? undefined : noop}
            onSendToChat={noop}
          />
        ))}
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <Feed />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>
  </React.StrictMode>,
);
