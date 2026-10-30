/* eslint-disable react-refresh/only-export-components --
   Harness de banco de prova: é o entry de uma página própria, não um módulo
   que alguém importa, então fast refresh por export não se aplica. */
/**
 * Banco de prova dos Clubes (Jesse).
 *
 * A área de Clubes vive atrás do login e, enquanto o Han escreve
 * `services/clubs.js`, atrás de uma camada de dados que ainda não existe.
 * Este harness monta os componentes DE PRODUÇÃO com clubes no formato do
 * `CLUBES-CONTRATO.md` §1 — mesmos campos, mesmos tipos, datas em ISO — para
 * a tela poder ser medida antes de haver Firestore do outro lado.
 *
 * Não entra no build: o Vite só empacota o index.html. Vive no `npm run dev`,
 * em /clubs-preview.html.
 *
 *   ?tela=descoberta|clube|criar   qual tela montar
 *   ?dark=1                        tema escuro
 *   ?papel=visitante|membro|capitao|fundador
 *   ?vazio=1                       estados vazios (clube sem nada, zero clubes)
 *   ?tela=editar                   o "Personalizar" (29/10/2026)
 *   ?fotos=1                       clube com capa e logo próprias
 *   ?tela=emblemas                 combinações do emblema com foto, nos tamanhos reais
 */
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "./components/ToastProvider";
import { ClubCard } from "./components/clubs/ClubCard";
import { ClubHeader, ClubTabs } from "./components/clubs/ClubHeader";
import { ClubWall, ClubGallery, ClubGarage, ClubMeetups, ClubMemberList, ClubAbout } from "./components/clubs/ClubPanels";
import { ClubCreateModal } from "./components/clubs/ClubCreateModal";
import { ClubEmblem } from "./components/clubs/ClubEmblem";
import { ClubEditModal } from "./components/clubs/ClubEditModal";
import { clubColorVars } from "./services/clubStyles";
import "./index.css";
import "./services/i18n";
import "./services/i18n-social-fixes";

const QUERY = new URLSearchParams(window.location.search);
if (QUERY.get("dark") === "1") document.documentElement.classList.add("dark");
const TELA = QUERY.get("tela") || "descoberta";
const PAPEL = QUERY.get("papel") || "capitao";
const VAZIO = QUERY.get("vazio") === "1";
const FOTOS = QUERY.get("fotos") === "1";

// Capa e logo de mentira, desenhadas aqui: o harness não fala com o Storage.
const svgUri = (w, h, body) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;
const CAPA = svgUri(1200, 400, '<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0b1d3a"/><stop offset="1" stop-color="#d92534"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="900" cy="330" r="60" fill="#111"/><circle cx="300" cy="330" r="60" fill="#111"/><rect x="200" y="200" width="800" height="110" rx="40" fill="#e9ebf0"/>');
// Uma "foto" com textura e tons misturados, como foto de carro de verdade.
const FOTO_LOGO = svgUri(400, 400, '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc3e6"/><stop offset=".55" stop-color="#f3d9b1"/><stop offset=".56" stop-color="#555"/><stop offset="1" stop-color="#2b2b2b"/></linearGradient></defs><rect width="400" height="400" fill="url(#s)"/><rect x="60" y="170" width="280" height="80" rx="30" fill="#c0392b"/><rect x="110" y="130" width="170" height="60" rx="24" fill="#a93226"/><circle cx="120" cy="260" r="34" fill="#111"/><circle cx="290" cy="260" r="34" fill="#111"/>');
const LOGO = svgUri(400, 400, '<rect width="400" height="400" fill="#111827"/><circle cx="200" cy="200" r="150" fill="none" stroke="#facc4b" stroke-width="24"/><text x="200" y="230" font-size="110" font-family="Arial" font-weight="900" text-anchor="middle" fill="#facc4b">CVC</text>');

const emDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

const clube = (over = {}) => ({
  id: "cvc",
  name: "Civic Club Campinas",
  tag: "CVC",
  motto: "Nada de original, tudo de respeito",
  description:
    "Clube de donos e entusiastas de Honda Civic em Campinas e região. Começou em 2011 com seis carros num estacionamento de shopping; hoje é o encontro fixo do 1º domingo no Parque Portugal.",
  emblem: { shape: "plate", icon: "wheel" },
  colors: { primary: "azul-mercosul", secondary: "grafite" },
  cover: "",
  country: "BR",
  state: "SP",
  city: "Campinas",
  foundedYear: 2011,
  meetupSchedule: "1º domingo do mês, Parque Portugal",
  focus: { brands: ["Honda"], models: ["Civic"], styles: ["jdm"] },
  rules: [
    "Respeito acima de tudo: nada de humilhar carro de ninguém.",
    "Sem cavalo de pau, ronco e arrancada no local do encontro.",
    "Foto de carro alheio só com autorização do dono.",
  ],
  links: { instagram: "civicclubcampinas", whatsapp: "https://chat.whatsapp.com/x", facebook: "", website: "" },
  joinPolicy: "approval",
  contentVisibility: "public",
  founderId: "u1",
  memberCount: 128,
  official: false,
  archived: false,
  createdAt: emDias(-900),
  updatedAt: emDias(-2),
  myRole: PAPEL === "visitante" ? null : PAPEL === "membro" ? "member" : PAPEL === "fundador" ? "founder" : "captain",
  myRequestPending: false,
  nextMeetup: { id: "e1", title: "Encontro mensal do CVC", eventDate: emDias(13), city: "Campinas" },
  logo: "",
  logoUrl: FOTOS ? LOGO : "",
  coverUrl: FOTOS ? CAPA : "",
  ...over,
});

const CLUBES = [
  clube(),
  clube({
    id: "opb", name: "Opala Clube de Brasília", tag: "OPB", motto: "Seis cilindros não se explica",
    colors: { primary: "vinho", secondary: "preto-fosco" }, emblem: { shape: "shield", icon: "piston" },
    city: "Brasília", state: "DF", foundedYear: 1998, memberCount: 96, joinPolicy: "open",
    focus: { brands: ["GM - Chevrolet"], models: ["Opala"], styles: ["antigos"] },
    myRole: null, nextMeetup: { id: "e2", title: "Encontro", eventDate: emDias(19), city: "Brasília" },
    logoUrl: "", coverUrl: "",
  }),
  clube({
    id: "cbsc", name: "Celta Brabo Social Club", tag: "CBSC", motto: "Popular, mas nosso",
    colors: { primary: "verde-limao", secondary: "preto-fosco" }, emblem: { shape: "plate", icon: "turbo" },
    city: "Curitiba", state: "PR", foundedYear: 2021, memberCount: 342, joinPolicy: "open",
    focus: { brands: ["GM - Chevrolet"], models: ["Celta"], styles: ["rebaixados", "preparados"] },
    myRole: null, nextMeetup: { id: "e3", title: "Encontro", eventDate: emDias(12), city: "Curitiba" },
    logoUrl: "", coverUrl: FOTOS ? CAPA : "",
  }),
  clube({
    id: "eng4", name: "Engine Off-road", tag: "ENG4", motto: "O asfalto acaba, a gente continua",
    colors: { primary: "verde-bandeira", secondary: "marrom-couro" }, emblem: { shape: "hex", icon: "mountain" },
    city: "", state: "", foundedYear: 2026, memberCount: 58, official: true, joinPolicy: "open",
    focus: { brands: [], models: [], styles: ["offroad", "viagem"] },
    myRole: null, nextMeetup: null,
  }),
];

const POSTS = [
  { id: "p1", authorName: "Paula Mendes", authorAvatar: "", pinned: true, createdAt: emDias(-3),
    note: "Confirmado: 5 de outubro, 9h, estacionamento do Parque Portugal. Quem for levar carro pra exposição chega 8h30." },
  { id: "p2", authorName: "Tiago Lima", authorAvatar: "", pinned: false, createdAt: emDias(-1),
    note: "Saiu da repintura. Agora é original de fábrica de novo, só que melhor.",
    images: [CAPA, LOGO] },
];

const MEMBROS = [
  { uid: "u1", role: "founder", displayName: "Rafa Nogueira", username: "@rafanog", avatar: "", carLabel: "Civic EXL 2018" },
  { uid: "u2", role: "captain", displayName: "Paula Mendes", username: "@paulamds", avatar: "", carLabel: "Civic LXR 2015" },
  { uid: "u3", role: "member", displayName: "Tiago Lima", username: "@tiagolima", avatar: "", carLabel: "Civic EX 2004" },
  { uid: "u4", role: "member", displayName: "Bruna Castro", username: "@bcastro", avatar: "", carLabel: "Fit LX 2012" },
];

const CARROS = [
  { goalId: "g1", ownerId: "u1", ownerName: "Rafa Nogueira", brand: "Honda", model: "Civic EXL 2.0 16V Flex", year: 2018, name: "Honda Civic EXL 2.0 16V Flex", matchesFocus: true, matchLabel: "Civic" },
  { goalId: "g2", ownerId: "u2", ownerName: "Paula Mendes", brand: "Honda", model: "Civic LXR 2.0 Flex", year: 2015, name: "Honda Civic LXR 2.0 Flex", matchesFocus: true, matchLabel: "Civic" },
  { goalId: "g3", ownerId: "u3", ownerName: "Tiago Lima", brand: "Honda", model: "Civic EX 1.7 16V", year: 2004, name: "Honda Civic EX 1.7 16V", matchesFocus: true, matchLabel: "Civic" },
  { goalId: "g4", ownerId: "u4", ownerName: "Bruna Castro", brand: "Honda", model: "Fit LX 1.4", year: 2012, name: "Honda Fit LX 1.4", matchesFocus: false },
];

const EVENTOS = [
  { id: "e1", title: "Encontro mensal do CVC", eventDate: emDias(13), location: "Parque Portugal", city: "Campinas" },
  { id: "e2", title: "Track day Interlagos (caravana)", eventDate: emDias(34), location: "Rod. Anhanguera", city: "São Paulo" },
];
const PASSADOS = [
  { id: "e0", title: "Encontro mensal do CVC", eventDate: emDias(-15), location: "Parque Portugal", city: "Campinas" },
  { id: "e-1", title: "Encontro mensal do CVC", eventDate: emDias(-45), location: "Parque Portugal", city: "Campinas" },
];

function PaginaDoClube() {
  const alvo = VAZIO
    ? clube({ memberCount: 1, rules: [], description: "", meetupSchedule: "", nextMeetup: null })
    : clube();
  const [tab, setTab] = useState(QUERY.get("aba") || "wall");
  const role = alvo.myRole;
  const canManage = role === "captain" || role === "founder";

  return (
    <div style={clubColorVars(alvo)} className="space-y-4">
      <ClubHeader
        club={alvo}
        memberCount={alvo.memberCount}
        carCount={VAZIO ? 0 : CARROS.length}
        meetupCount={VAZIO ? 0 : 41}
        onJoin={() => {}}
        onLeave={() => {}}
        onShare={() => {}}
        onCustomize={canManage ? () => {} : null}
        onPickLogo={canManage ? () => {} : null}
        onPickCover={canManage ? () => {} : null}
      />
      <ClubTabs active={tab} onChange={setTab} />
      {tab === "photos" && <ClubGallery posts={VAZIO ? [] : POSTS} loading={false} />}
      {tab === "wall" && (
        <ClubWall club={alvo} posts={VAZIO ? [] : POSTS} loading={false} canPost={Boolean(role)} onCreatePost={() => {}} />
      )}
      {tab === "garage" && (
        <ClubGarage cars={VAZIO ? [] : CARROS} loading={false} isMember={Boolean(role)} hasOwnCar={false} onPublish={() => {}} />
      )}
      {tab === "meetups" && (
        <ClubMeetups club={alvo} events={VAZIO ? [] : EVENTOS} pastEvents={VAZIO ? [] : PASSADOS} loading={false} canCreate={canManage} onCreate={() => {}} />
      )}
      {tab === "members" && (
        <ClubMemberList club={alvo} members={VAZIO ? [] : MEMBROS} total={alvo.memberCount} loading={false} canManage={role === "founder"} />
      )}
      {tab === "about" && <ClubAbout club={alvo} isMember={Boolean(role)} />}
    </div>
  );
}

function Descoberta() {
  const lista = VAZIO ? [] : CLUBES;
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Clubes</h1>
        <p className="mt-1 text-[13px] text-[var(--engine-text-muted)]">
          Crews do Engine — ache a sua ou funde a primeira.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <ClubCard key={c.id} club={c} onOpen={() => {}} showRole={c.id === "cvc"} />
        ))}
      </div>
      {!lista.length ? (
        <div className="rounded-2xl border border-dashed border-[var(--engine-border-strong)] px-4 py-8 text-center text-[var(--engine-text-muted)]">
          Nenhum clube por aqui ainda.
        </div>
      ) : null}
    </div>
  );
}

// Foto + forma + símbolo + borda: as combinações que mais quebram.
const COMBOS = [
  { label: "placa, sem símbolo", photo: true, colors: { primary: "azul-mercosul", secondary: "grafite" }, emblem: { shape: "plate", icon: "car" } },
  { label: "escudo, canto, disco", photo: true, colors: { primary: "vinho", secondary: "preto-fosco" }, emblem: { shape: "shield", icon: "flame", showSymbolOnPhoto: true, symbolPosition: "corner", symbolBacking: "disc", borderColor: "amarelo-pista" } },
  { label: "círculo, centro, sombra", photo: true, colors: { primary: "verde-bandeira" }, emblem: { shape: "circle", icon: "turbo", showSymbolOnPhoto: true, symbolPosition: "center", symbolBacking: "scrim", symbolColor: "amarelo-pista", borderColor: "none" } },
  { label: "hex, canto, sem fundo", photo: true, colors: { primary: "roxo-neon" }, emblem: { shape: "hex", icon: "trophy", showSymbolOnPhoto: true, symbolPosition: "corner", symbolBacking: "none", borderColor: "prata" } },
  { label: "disco vinho + símbolo vinho (cai p/ branco)", photo: true, colors: { primary: "vinho" }, emblem: { shape: "circle", icon: "crown", showSymbolOnPhoto: true, symbolPosition: "center", symbolBacking: "disc", symbolColor: "vinho" } },
  { label: "gerado, borda amarela, símbolo amarelo", photo: false, colors: { primary: "preto-fosco", secondary: "grafite" }, emblem: { shape: "shield", icon: "motorbike", symbolColor: "amarelo-pista", borderColor: "amarelo-pista" } },
  { label: "gerado amarelo + símbolo amarelo (cai p/ escuro)", photo: false, colors: { primary: "amarelo-pista", secondary: "amarelo-pista" }, emblem: { shape: "plate", icon: "wheel", symbolColor: "amarelo-pista", borderColor: "none" } },
];

function Emblemas() {
  return (
    <div className="space-y-3">
      {COMBOS.map((combo) => {
        const c = clube({ colors: combo.colors, emblem: combo.emblem, logoUrl: combo.photo ? FOTO_LOGO : "" });
        return (
          <div key={combo.label} className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3">
            <p className="mb-2 text-[12px] font-bold text-[var(--engine-text-muted)]">{combo.label}</p>
            <div className="flex items-end gap-4">
              {[84, 64, 40, 28].map((size) => (
                <ClubEmblem key={size} club={c} size={size} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      {TELA === "clube" ? <PaginaDoClube /> : null}
      {TELA === "descoberta" ? <Descoberta /> : null}
      {TELA === "emblemas" ? <Emblemas /> : null}
      {TELA === "editar" ? (
        <ClubEditModal
          club={clube({ coverUrl: "", logoUrl: "" })}
          role={PAPEL === "fundador" ? "founder" : "captain"}
          isOpen
          onClose={() => {}}
        />
      ) : null}
      {TELA === "criar" ? (
        <ClubCreateModal isOpen onClose={() => {}} onCreate={async () => {}} />
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
