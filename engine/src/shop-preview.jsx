/* eslint-disable react-refresh/only-export-components --
   Harness de banco de prova: é o entry de uma página própria, não um módulo
   que alguém importa, então fast refresh por export não se aplica. */
/**
 * Banco de prova da Loja / Anunciar / página profissional (Jesse, 01/11/2026).
 *
 * Monta os componentes DE PRODUÇÃO de `components/shop/` com dados de exemplo
 * no formato da migração `20261101130000_pro_profiles_and_shops.sql`, para a
 * tela ser medida antes de as telas do Han ligarem tudo no Supabase. É também
 * a referência de como encaixar as peças: o fluxo Anunciar abaixo é a ordem
 * de passos aprovada pelo Murilo.
 *
 * Não entra no build: o Vite só empacota o index.html. Vive no `npm run dev`,
 * em /shop-preview.html.
 *
 *   ?tela=anunciar|pagina|produto|lojas
 *   ?dark=1             tema escuro
 *   ?passo=N            abre o Anunciar no passo N, com o rascunho preenchido
 *   ?vazio=1            vitrine e Lojas vazias
 */
import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { useTranslation } from "react-i18next";
import { Store, Tag, Wrench } from "lucide-react";
import { ListingFlow, ListingFlowDone, ReviewList, ReviewRow } from "./components/shop/ListingFlow";
import {
  BigPriceInput,
  Chip,
  ChoiceCard,
  FieldBox,
  MessageBubble,
  PhotoGrid,
  ProfileLogo,
  SwitchRow,
  fieldInputClass,
} from "./components/shop/ShopPrimitives";
import { ProductCard, ProductGrid, ShopEmpty } from "./components/shop/ProductCard";
import { ProPageBody, ProPageHeader, ProPagePreviewCard, ProPageTabs } from "./components/shop/ProPageHeader";
import { ProductDetail } from "./components/shop/ProductDetail";
import { ContactSheet } from "./components/shop/ContactSheet";
import { FitsPicker } from "./components/shop/FitsPicker";
import { ServiceRow, ShopBrowseHeader, ShopSection, StoreCard, StoreRow } from "./components/shop/ShopBrowse";
import { Chip as CategoryChip, ChipRow } from "./components/shop/ShopPrimitives";
import { handleFromName, maskBrPhone, prefilledMessage, profileInitials } from "./services/shopFormat";
import { getServiceCategoryLabel } from "./services/serviceListingDisplay";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { ProductEditor } from "./components/shops/ProductEditor";
import { ProductCard as RealProductCard } from "./components/shops/ProductCard";
import { ProProfileEditor } from "./components/pro/ProProfileEditor";
import { ProVitrine } from "./components/pro/ProVitrine";
import { ShopSegment } from "./components/shop/ShopBrowse";
import { proProfileFromRow } from "./services/proProfiles";
import { fittingCar, productFromRow } from "./services/shops";
import "./services/i18n-pro";
import "./index.css";
import "./services/i18n";
import "./services/i18n-shop";

/* ---------- contas de exemplo: no app são as do services/shops.js (Han) ---------- */
const PRODUCT_CATEGORIES = ["parts", "wheels-tires", "sound", "accessories", "detailing", "tools", "other"];
const cleanHandle = (v) => String(v || "").toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._]/g, "").slice(0, 24);
const formatPrice = (amount, currency, locale) =>
  amount == null ? "" : Number(amount).toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 });
const fitLabel = (fit) =>
  [fit.brand, fit.model, fit.yearFrom && fit.yearTo ? `${fit.yearFrom}–${fit.yearTo}` : fit.yearFrom || ""].filter(Boolean).join(" ");
const fitsCar = ({ fits, universal }, car) =>
  Boolean(universal) ||
  (fits || []).some((f) => f.brandCode === car.brandCode && (!f.modelCode || f.modelCode === car.modelCode) && (!f.yearFrom || car.year >= f.yearFrom) && (!f.yearTo || car.year <= f.yearTo));
const carShortName = (car) => String(car.model || "").split(/\s+/)[0];

const QUERY = new URLSearchParams(window.location.search);
if (QUERY.get("dark") === "1") document.documentElement.classList.add("dark");
const EMPTY = QUERY.get("vazio") === "1";

/* ---------- "fotos" de exemplo (SVG), só do banco de prova ---------- */
const svg = (bg1, bg2, glyph) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><radialGradient id="g" cx="35%" cy="25%" r="90%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient></defs><rect width="200" height="200" fill="url(#g)"/><ellipse cx="100" cy="182" rx="80" ry="10" fill="#000" opacity=".25"/>${glyph}</svg>`,
  )}`;
const spokes = [0, 72, 144, 216, 288]
  .map((a) => `<line x1="100" y1="100" x2="${100 + 50 * Math.cos((a * Math.PI) / 180)}" y2="${100 + 50 * Math.sin((a * Math.PI) / 180)}"/>`)
  .join("");
const ART = {
  coil: svg("#6b5640", "#1f1912", '<rect x="88" y="30" width="24" height="140" rx="6" fill="#d9dde4"/><polyline points="70,48 130,62 70,76 130,90 70,104 130,118 70,132 130,146 70,160" stroke="#e5322f" stroke-width="9" fill="none" stroke-linejoin="round"/><rect x="74" y="22" width="52" height="12" rx="4" fill="#9aa1ad"/>'),
  wheel: svg("#4b5260", "#14171c", `<circle cx="100" cy="100" r="70" fill="#1b1d22"/><circle cx="100" cy="100" r="56" fill="none" stroke="#c9ced6" stroke-width="5"/><g stroke="#c9ced6" stroke-width="9" stroke-linecap="round">${spokes}</g><circle cx="100" cy="100" r="13" fill="#e5322f"/>`),
  screen: svg("#2e4258", "#0d141c", '<rect x="40" y="62" width="120" height="78" rx="8" fill="#0b0d10" stroke="#5b6472" stroke-width="3"/><rect x="48" y="70" width="104" height="62" rx="4" fill="#1f6fd1"/><rect x="56" y="80" width="26" height="20" rx="3" fill="#fff"/>'),
  light: svg("#3f414b", "#121318", '<path d="M30 120 Q40 70 110 64 L170 70 Q178 100 160 128 Q100 140 30 120z" fill="#191a1f" stroke="#8b919c" stroke-width="3"/><circle cx="135" cy="100" r="16" fill="#e8eef8"/>'),
  brake: svg("#4a4f58", "#121418", '<circle cx="95" cy="105" r="60" fill="#8e949e"/><circle cx="95" cy="105" r="22" fill="#2a2c31"/><path d="M120 40 Q170 60 165 120 L145 118 Q148 72 112 58z" fill="#e5322f"/>'),
  steer: svg("#5a3030", "#170d0d", '<circle cx="100" cy="100" r="62" fill="none" stroke="#2c2c31" stroke-width="14"/><rect x="40" y="94" width="120" height="14" rx="6" fill="#2c2c31"/><circle cx="100" cy="102" r="20" fill="#1a1a1d" stroke="#e5322f" stroke-width="3"/>'),
  align: svg("#2f3a36", "#0d1110", '<rect x="40" y="70" width="120" height="60" rx="30" fill="none" stroke="#e8ebf0" stroke-width="6"/><line x1="100" y1="40" x2="100" y2="160" stroke="#e5322f" stroke-width="4" stroke-dasharray="8 6"/>'),
  chip: svg("#3b2f4a", "#0f0c14", '<rect x="62" y="62" width="76" height="76" rx="8" fill="#1a1620" stroke="#c9c2d6" stroke-width="4"/>'),
};
const coverSvg = (c1, c2, extra) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="600" height="200" fill="url(#c)"/>${extra}</svg>`,
  )}`;
const COVERS = [
  coverSvg("#1a1c22", "#0b0c0f", '<line x1="-20" y1="200" x2="260" y2="-40" stroke="#e5322f" stroke-width="10"/>'),
  coverSvg("#2d3036", "#121317", '<g fill="#f4f6fa" opacity=".85"><rect x="20" y="96" width="44" height="8"/><rect x="110" y="96" width="44" height="8"/><rect x="200" y="96" width="44" height="8"/><rect x="290" y="96" width="44" height="8"/><rect x="380" y="96" width="44" height="8"/><rect x="470" y="96" width="44" height="8"/></g>'),
  coverSvg("#3a2a22", "#120d0a", '<rect y="140" width="600" height="60" fill="#000" opacity=".35"/>'),
];

/* ---------- dados no formato do banco ---------- */
const MY_CAR = { brandCode: "25", brand: "Honda", modelCode: "8213", model: "Civic Touring", year: 2019 };
const CIVIC_G10 = { brandCode: "25", brand: "Honda", modelCode: "8213", model: "Civic", yearFrom: 2017, yearTo: 2021 };
const CATALOG = [
  CIVIC_G10,
  { brandCode: "25", brand: "Honda", modelCode: "4901", model: "Civic", yearFrom: 2012, yearTo: 2016 },
  { brandCode: "56", brand: "Toyota", modelCode: "9001", model: "Corolla", yearFrom: 2020, yearTo: 2024 },
  { brandCode: "59", brand: "VW", modelCode: "6010", model: "Golf", yearFrom: 2014, yearTo: 2019 },
  { brandCode: "59", brand: "VW", modelCode: "8790", model: "Jetta", yearFrom: 2019, yearTo: 2024 },
  { brandCode: "26", brand: "Hyundai", modelCode: "8990", model: "HB20", yearFrom: 2020, yearTo: 2024 },
].map((fit) => ({ ...fit, key: `${fit.modelCode}-${fit.yearFrom}` }));

const PAGE = {
  name: "Garagem 47 Performance",
  handle: "garagem47",
  category: "Oficina e loja de peças",
  cover: COVERS[0],
  logo: null,
  verified: true,
  rating: "4,8",
  ratingCount: 127,
  place: "Mooca, São Paulo",
  followerCount: 1200,
  whatsapp: "+55 11 98765-4321",
  team: [
    { id: "1", name: "Rafael Souza", initials: "RS" },
    { id: "2", name: "Thiago Freitas", initials: "TF" },
    { id: "3", name: "Ana Lima", initials: "AL" },
  ],
};

const PRODUCTS = EMPTY
  ? []
  : [
      { id: "coil", title: "Kit coilover rosca Civic G10", photos: [ART.coil, ART.coil, ART.coil, ART.coil, ART.coil], data: { category: "parts", condition: "used", priceAmount: 3450, acceptsOffers: true, fits: [CIVIC_G10] }, description: "Rodou 8 mil km. Regulagem de altura e 24 cliques de carga. Saiu do meu Civic quando voltei pro original. Sem vazamento, buchas novas.", seller: "garagem47" },
      { id: "rodas", title: "Jogo de rodas aro 18 5x114,3", photos: [ART.wheel, ART.wheel, ART.wheel, ART.wheel], data: { category: "wheels-tires", condition: "used", priceAmount: 2800, fits: [CIVIC_G10, CATALOG[2]] }, seller: "garagem47" },
      { id: "multi", title: "Central multimídia 9\" com CarPlay", photos: [ART.screen, ART.screen, ART.screen], data: { category: "sound", condition: "new", priceAmount: 1290, universal: true, fits: [] }, seller: "garagem47" },
      { id: "farol", title: "Par de faróis full LED Golf MK7", photos: [ART.light, ART.light], data: { category: "accessories", condition: "used", priceAmount: 1850, fits: [CATALOG[3]] }, seller: "luzetech" },
      { id: "pastilha", title: "Pastilhas dianteiras cerâmicas", photos: [ART.brake, ART.brake], data: { category: "parts", condition: "new", priceAmount: 240, fits: [CIVIC_G10] }, seller: "garagem47" },
      { id: "volante", title: "Volante Momo 350 mm", photos: [ART.steer], data: { category: "accessories", condition: "used", priceAmount: 690, universal: true, fits: [] }, seller: "joao.turbo", saleStatus: "sold" },
    ];

const SERVICES = EMPTY
  ? []
  : [
      { id: "s1", title: "Instalação de coilover", price: "a partir de R$ 450", meta: "Suspensão e rebaixamento · cerca de 3 h", photo: ART.coil },
      { id: "s2", title: "Alinhamento e balanceamento 3D", price: "R$ 120", meta: "Pneus e rodas · 1 h", photo: ART.align },
      { id: "s3", title: "Remap stage 1", price: "a partir de R$ 1.200", meta: "Performance · meio dia", photo: ART.chip },
    ];

const STORES = [
  { handle: "garagem47", name: "Garagem 47 Performance", cover: COVERS[0], initials: "G47", rating: "4,8", place: "Mooca, SP" },
  { handle: "luzetech", name: "LuzeTech Iluminação", cover: COVERS[1], initials: "LT", rating: "4,6", place: "Santo André, SP" },
  { handle: "rodaopneus", name: "Rodão Pneus", cover: COVERS[2], initials: "RP", rating: "4,9", place: "Guarulhos, SP" },
];

/* ---------- como a tela transforma o dado em props ---------- */
function useCardProps() {
  const { t, i18n } = useTranslation();
  return (product, { withSeller = false } = {}) => {
    const sold = product.saleStatus === "sold";
    const fit = fitsCar({ fits: product.data.fits, universal: product.data.universal }, MY_CAR);
    return {
      photo: product.photos[0],
      photoCount: product.photos.length,
      tag: sold ? t("shop.card.sold") : product.data.condition === "new" ? t("shop.condition.new") : t("shop.condition.used"),
      title: product.title,
      price: product.data.priceAmount == null ? t("shop.card.negotiable") : formatPrice(product.data.priceAmount, "BRL", i18n.language),
      fitsCar: fit ? carShortName(MY_CAR) : "",
      seller: withSeller ? `@${product.seller}` : "",
      sold,
    };
  };
}

/* ======================= Anunciar ======================= */
const FILLED = {
  mode: "page",
  kind: "product",
  page: { name: "Garagem 47 Performance", handle: "garagem47", handleEdited: true, logo: null, cover: 0 },
  photos: [ART.coil, ART.coil, ART.coil].map((url, i) => ({ id: `p${i}`, url })),
  title: "Kit coilover rosca Civic G10",
  category: "parts",
  condition: "used",
  description: "",
  price: 3450,
  acceptsOffers: true,
  priceFrom: false,
  universal: false,
  fits: [CATALOG[0]],
  fitQuery: "",
  whatsappOn: true,
  phone: "(11) 98765-4321",
};
const BLANK = {
  mode: null,
  kind: null,
  page: { name: "", handle: "", handleEdited: false, logo: null, cover: 0 },
  photos: [],
  title: "",
  category: null,
  condition: null,
  description: "",
  price: null,
  acceptsOffers: false,
  priceFrom: false,
  universal: false,
  fits: [],
  fitQuery: "",
  whatsappOn: true,
  phone: "",
};

function stepsFor(draft) {
  const steps = ["mode"];
  if (draft.mode === "page") steps.push("page");
  steps.push("kind", "photos", "title");
  if (draft.kind !== "service") steps.push("condition");
  steps.push("price");
  if (draft.kind !== "service") steps.push("fits");
  steps.push("contact", "review");
  return steps;
}

function handleStatus(handle) {
  // No app: rpc("handle_available", { p_handle }) com debounce.
  if (!handle) return null;
  if (!/^[a-z0-9._]{3,24}$/.test(handle)) return "invalid";
  if (["engine", "admin", "lojas", "servicos", "produtos"].includes(handle)) return "reserved";
  if (handle === "murilo.g") return "taken";
  return "available";
}

function AnunciarScreen() {
  const { t, i18n } = useTranslation();
  const startStep = QUERY.get("passo");
  const [draft, setDraft] = useState(startStep ? FILLED : BLANK);
  const [index, setIndex] = useState(Number(startStep) || 0);
  const [done, setDone] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const steps = stepsFor(draft);
  const key = steps[Math.min(index, steps.length - 1)];
  const owner = draft.mode === "page"
    ? { name: draft.page.name || t("shop.flow.previewPage"), handle: draft.page.handle || "…", initials: profileInitials(draft.page.name) }
    : { name: "Murilo Godoy", handle: "murilo.g", initials: "MG" };
  const priceText = draft.price == null ? "" : `${draft.kind === "service" && draft.priceFrom ? t("shop.card.from", { price: formatPrice(draft.price, "BRL", i18n.language) }) : formatPrice(draft.price, "BRL", i18n.language)}`;
  const status = handleStatus(draft.page.handle);
  const message = prefilledMessage({ kind: draft.kind, title: draft.title, price: draft.price != null ? formatPrice(draft.price, "BRL", i18n.language) : "" }, t);
  const fit = draft.kind === "product" && fitsCar({ fits: draft.fits, universal: draft.universal }, MY_CAR);
  const categories = draft.kind === "service" ? ["mechanics", "automotive-aesthetics", "body-paint", "electrical", "suspension-lowering", "performance-tuning", "other"] : PRODUCT_CATEGORIES;
  const categoryLabel = (c) => (draft.kind === "service" ? getServiceCategoryLabel(c, t) : t(`shop.categories.${c}`));

  const can = {
    mode: Boolean(draft.mode),
    page: draft.page.name.trim().length > 1 && status === "available",
    kind: Boolean(draft.kind),
    photos: draft.photos.length > 0,
    title: draft.title.trim().length > 2 && Boolean(draft.category),
    condition: Boolean(draft.condition),
    price: draft.price > 0,
    fits: draft.universal || draft.fits.length > 0,
    contact: !draft.whatsappOn || draft.phone.replace(/\D/g, "").length >= 10,
    review: true,
  }[key];

  const card = (
    <ProductCard
      placeholder
      photo={draft.photos[0]?.url}
      photoCount={draft.photos.length}
      tag={draft.condition ? t(`shop.condition.${draft.condition}`) : ""}
      title={draft.title.trim()}
      price={priceText}
      fitsCar={fit ? carShortName(MY_CAR) : ""}
      seller={`@${owner.handle}${draft.category ? ` · ${categoryLabel(draft.category)}` : ""}`}
    />
  );

  if (done) {
    return (
      <ListingFlowDone
        body={draft.mode === "page" ? t("shop.done.bodyPage", { handle: owner.handle }) : t("shop.done.bodyProfile")}
        card={card}
        onSeeShowcase={() => (window.location.search = "?tela=pagina")}
        onAnother={() => {
          setDraft(BLANK);
          setIndex(0);
          setDone(false);
        }}
        onExit={() => setDone(false)}
      />
    );
  }

  const jump = (stepKey) => setIndex(steps.indexOf(stepKey));
  const views = {
    mode: {
      title: t("shop.mode.title"),
      sub: t("shop.mode.sub"),
      content: (
        <>
          <ChoiceCard selected={draft.mode === "person"} onClick={() => set({ mode: "person" })} icon={<ProfileLogo initials="MG" className="h-12 w-12 rounded-full text-base" />} title={t("shop.mode.asYou")} hint={t("shop.mode.asYouHint", { handle: "murilo.g" })} />
          <ChoiceCard selected={draft.mode === "page"} onClick={() => set({ mode: "page" })} icon={<Store size={24} aria-hidden="true" />} title={t("shop.mode.page")} hint={t("shop.mode.pageHint")} />
        </>
      ),
    },
    page: {
      title: t("shop.page.title"),
      sub: t("shop.page.sub"),
      content: (
        <>
          <FieldBox label={t("shop.page.name")} htmlFor="pg-name">
            <input
              id="pg-name"
              className={fieldInputClass}
              value={draft.page.name}
              placeholder={t("shop.page.namePlaceholder")}
              autoComplete="organization"
              onChange={(e) => set({ page: { ...draft.page, name: e.target.value, handle: draft.page.handleEdited ? draft.page.handle : handleFromName(e.target.value) } })}
            />
          </FieldBox>
          <FieldBox
            label={t("shop.page.handle")}
            htmlFor="pg-handle"
            prefix="@"
            hint={
              status && (
                <p className={`mt-1.5 text-xs font-semibold ${status === "available" ? "text-[var(--engine-text-muted)]" : "text-[var(--engine-accent)]"}`} aria-live="polite">
                  {status === "available" && t("shop.page.available", { handle: draft.page.handle })}
                  {status === "taken" && t("shop.page.taken", { handle: draft.page.handle })}
                  {status === "invalid" && t("shop.page.invalid")}
                  {status === "reserved" && t("shop.page.reserved")}
                </p>
              )
            }
          >
            <input
              id="pg-handle"
              className={fieldInputClass}
              value={draft.page.handle}
              placeholder={t("shop.page.handlePlaceholder")}
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => set({ page: { ...draft.page, handle: cleanHandle(e.target.value), handleEdited: true } })}
            />
          </FieldBox>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => set({ page: { ...draft.page, logo: draft.page.logo ? null : ART.chip } })} className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[var(--engine-border-strong)] bg-[var(--engine-surface)] text-[13px] font-bold text-[var(--engine-text-muted)]">
              <ProfileLogo src={draft.page.logo} initials={owner.initials} className="h-11 w-11 rounded-xl text-[13px]" />
              {draft.page.logo ? t("shop.page.logoChange") : t("shop.page.logo")}
            </button>
            <div>
              <span className="mb-1.5 block text-[13px] font-bold text-[var(--engine-text)]">{t("shop.page.cover")}</span>
              <div className="grid grid-cols-3 gap-1.5">
                {COVERS.map((c, i) => (
                  <button key={c} type="button" aria-pressed={draft.page.cover === i} onClick={() => set({ page: { ...draft.page, cover: i } })} className={`h-10 overflow-hidden rounded-[10px] ${draft.page.cover === i ? "outline-2 outline-offset-2 outline-[var(--engine-text)]" : ""}`}>
                    <img src={c} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
              <button type="button" className="mt-1.5 min-h-7 text-xs font-bold text-[var(--engine-text-muted)]">{t("shop.page.coverUpload")}</button>
            </div>
          </div>
          <SwitchRow checked={false} title={t("shop.page.team")} hint={t("shop.page.teamHint")} />
        </>
      ),
    },
    kind: {
      title: t("shop.kind.title"),
      content: (
        <>
          <ChoiceCard selected={draft.kind === "product"} onClick={() => set({ kind: "product" })} icon={<Tag size={24} aria-hidden="true" />} title={t("shop.kind.product")} hint={t("shop.kind.productHint")} />
          <ChoiceCard selected={draft.kind === "service"} onClick={() => set({ kind: "service", condition: null, category: null })} icon={<Wrench size={24} aria-hidden="true" />} title={t("shop.kind.service")} hint={t("shop.kind.serviceHint")} />
        </>
      ),
    },
    photos: {
      title: t("shop.photos.title"),
      sub: t("shop.photos.sub", { max: 10 }),
      content: (
        <PhotoGrid
          photos={draft.photos}
          onAdd={(files) => set({ photos: [...draft.photos, ...files.map((f, i) => ({ id: `${Date.now()}-${i}`, url: URL.createObjectURL(f) }))].slice(0, 10) })}
          onRemove={(i) => set({ photos: draft.photos.filter((_, j) => j !== i) })}
        />
      ),
    },
    title: {
      title: draft.kind === "service" ? t("shop.titleStep.titleService") : t("shop.titleStep.titleProduct"),
      content: (
        <>
          <FieldBox label={t("shop.titleStep.label")} htmlFor="t-in">
            <input id="t-in" maxLength={60} className={fieldInputClass} value={draft.title} placeholder={draft.kind === "service" ? t("shop.titleStep.placeholderService") : t("shop.titleStep.placeholderProduct")} onChange={(e) => set({ title: e.target.value })} />
          </FieldBox>
          <div>
            <span className="mb-2 block text-[13px] font-bold text-[var(--engine-text)]">{t("shop.titleStep.category")}</span>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Chip key={c} selected={draft.category === c} onClick={() => set({ category: c })}>
                  {categoryLabel(c)}
                </Chip>
              ))}
            </div>
          </div>
        </>
      ),
    },
    condition: {
      title: t("shop.condition.title"),
      content: (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {["new", "used"].map((c) => (
              <ChoiceCard key={c} vertical selected={draft.condition === c} onClick={() => set({ condition: c })} title={t(`shop.condition.${c}`)} hint={t(`shop.condition.${c}Hint`)} />
            ))}
          </div>
          <FieldBox label={t("shop.condition.description")} optional={t("shop.condition.optional")} htmlFor="d-in" multiline>
            <textarea id="d-in" rows={4} className={`${fieldInputClass} resize-none py-3.5 leading-normal`} value={draft.description} placeholder={t("shop.condition.descriptionPlaceholder")} onChange={(e) => set({ description: e.target.value })} />
          </FieldBox>
        </>
      ),
    },
    price: {
      title: t("shop.price.title"),
      sub: t("shop.price.sub"),
      content: (
        <>
          <BigPriceInput value={draft.price} onChange={(price) => set({ price })} label={t("shop.price.label")} locale={i18n.language} />
          {draft.kind === "service" ? (
            <SwitchRow checked={draft.priceFrom} onChange={(v) => set({ priceFrom: v })} title={t("shop.price.from")} hint={t("shop.price.fromHint")} />
          ) : (
            <SwitchRow checked={draft.acceptsOffers} onChange={(v) => set({ acceptsOffers: v })} title={t("shop.price.offers")} />
          )}
        </>
      ),
    },
    fits: {
      title: t("shop.fits.title"),
      sub: t("shop.fits.sub"),
      content: (
        <FitsPicker
          universal={draft.universal}
          onUniversal={(v) => set({ universal: v })}
          query={draft.fitQuery}
          onQuery={(q) => set({ fitQuery: q })}
          selected={draft.fits.map((f) => ({ key: f.key, label: fitLabel(f, t) }))}
          suggestions={CATALOG.filter((f) => !draft.fits.some((s) => s.key === f.key) && fitLabel(f, t).toLowerCase().includes(draft.fitQuery.toLowerCase())).slice(0, 5).map((f) => ({ key: f.key, label: fitLabel(f, t) }))}
          onAdd={(item) => set({ fits: [...draft.fits, CATALOG.find((f) => f.key === item.key)], fitQuery: "" })}
          onRemove={(k) => set({ fits: draft.fits.filter((f) => f.key !== k) })}
        />
      ),
    },
    contact: {
      title: t("shop.contact.title"),
      content: (
        <>
          <SwitchRow checked title={t("shop.contact.engine")} hint={t("shop.contact.always")} />
          <SwitchRow checked={draft.whatsappOn} onChange={(v) => set({ whatsappOn: v })} title={t("shop.contact.whatsapp")} />
          {draft.whatsappOn && (
            <FieldBox label={t("shop.contact.number")} htmlFor="ph-in" prefix="+55">
              <input id="ph-in" type="tel" inputMode="tel" autoComplete="tel-national" className={fieldInputClass} value={draft.phone} placeholder="(11) 98765-4321" onChange={(e) => set({ phone: maskBrPhone(e.target.value) })} />
            </FieldBox>
          )}
          <div>
            <span className="mb-2 block text-[13px] font-bold text-[var(--engine-text)]">{t("shop.contact.arrives")}</span>
            <MessageBubble>{message}</MessageBubble>
          </div>
        </>
      ),
    },
    review: {
      title: t("shop.review.title"),
      content: (
        <ReviewList>
          <ReviewRow label={t("shop.review.where")} onEdit={() => jump("mode")}>
            @{owner.handle} {draft.mode === "page" && t("shop.review.newPage")}
          </ReviewRow>
          <ReviewRow label={t("shop.review.photos")} onEdit={() => jump("photos")}>{t("shop.review.photoCount", { count: draft.photos.length })}</ReviewRow>
          <ReviewRow label={t("shop.review.titleRow")} onEdit={() => jump("title")}>
            {draft.title}
            <span className="block text-xs text-[var(--engine-text-muted)]">{draft.category && categoryLabel(draft.category)}</span>
          </ReviewRow>
          {draft.kind !== "service" && <ReviewRow label={t("shop.review.condition")} onEdit={() => jump("condition")}>{draft.condition && t(`shop.condition.${draft.condition}`)}</ReviewRow>}
          <ReviewRow label={t("shop.review.price")} onEdit={() => jump("price")}>
            {priceText}
            {draft.acceptsOffers && draft.kind !== "service" ? ` · ${t("shop.review.offersSuffix")}` : ""}
          </ReviewRow>
          {draft.kind !== "service" && <ReviewRow label={t("shop.review.fits")} onEdit={() => jump("fits")}>{draft.universal ? t("shop.review.anyCar") : draft.fits.map((f) => fitLabel(f, t)).join(", ")}</ReviewRow>}
          <ReviewRow label={t("shop.review.contact")} onEdit={() => jump("contact")}>{draft.whatsappOn ? t("shop.review.contactBoth") : t("shop.review.contactEngine")}</ReviewRow>
        </ReviewList>
      ),
    },
  };

  const showPreview = key !== "mode" && key !== "kind";
  const pagePreview = key === "page";
  return (
    <ListingFlow
      step={views[key]}
      index={index}
      total={steps.length}
      canNext={can}
      isLast={key === "review"}
      onBack={() => setIndex((i) => Math.max(0, i - 1))}
      onNext={() => (key === "review" ? setDone(true) : setIndex((i) => i + 1))}
      onExit={() => (window.location.search = "?tela=lojas")}
      onSaveExit={() => (window.location.search = "?tela=lojas")}
      previewLabel={pagePreview ? t("shop.flow.previewPage") : t("shop.flow.previewTitle")}
      previewNote={pagePreview ? "" : draft.mode === "page" ? t("shop.flow.wherePage") : t("shop.flow.whereProfile")}
      preview={
        !showPreview ? null : pagePreview ? (
          <ProPagePreviewCard name={owner.name} handle={owner.handle} logo={draft.page.logo} cover={COVERS[draft.page.cover]} initials={owner.initials} />
        ) : (
          <div className="engine-card p-3.5">
            <div className="mx-auto max-w-[220px]">{card}</div>
          </div>
        )
      }
      previewMini={
        !showPreview
          ? null
          : pagePreview
            ? { thumb: <ProfileLogo src={draft.page.logo} initials={owner.initials} className="h-full w-full rounded-[10px] text-[13px]" />, title: owner.name, sub: `@${owner.handle}` }
            : { thumb: draft.photos[0] ? <img src={draft.photos[0].url} alt="" className="h-full w-full object-cover" /> : null, title: draft.title.trim() || t("shop.flow.untitled"), sub: priceText || t("shop.flow.noPrice") }
      }
    />
  );
}

/* ======================= Página profissional ======================= */
function PaginaScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("products");
  const [fitOnly, setFitOnly] = useState(false);
  const [contact, setContact] = useState(null);
  const toCard = useCardProps();
  const mine = PRODUCTS.filter((p) => p.seller === "garagem47");
  const list = fitOnly ? mine.filter((p) => fitsCar({ fits: p.data.fits, universal: p.data.universal }, MY_CAR)) : mine;
  return (
    <Shell>
      <ProPageHeader
        page={{ ...PAGE, initials: "G47", productCount: mine.length, serviceCount: SERVICES.length }}
        onMessage={() => setContact({ channel: "engine", message: prefilledMessage({}, t) })}
        whatsappHref="https://wa.me/5511987654321"
        onFollow={() => {}}
      />
      <ProPageTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "products", label: t("shop.profile.tabs.products"), count: mine.length },
          { id: "services", label: t("shop.profile.tabs.services"), count: SERVICES.length },
          { id: "reviews", label: t("shop.profile.tabs.reviews"), count: PAGE.ratingCount },
        ]}
        stickyTop="top-0"
      />
      <ProPageBody>
        {tab === "products" && (
          <>
            <ChipRow className="mb-4">
              <CategoryChip selected={fitOnly} onClick={() => setFitOnly(!fitOnly)}>
                {t("shop.profile.fitsMine", { car: carShortName(MY_CAR) })}
              </CategoryChip>
              {PRODUCT_CATEGORIES.slice(0, 4).map((c) => (
                <CategoryChip key={c}>{t(`shop.categories.${c}`)}</CategoryChip>
              ))}
            </ChipRow>
            {list.length ? (
              <ProductGrid>
                {list.map((p) => (
                  <ProductCard key={p.id} {...toCard(p)} onClick={() => (window.location.search = `?tela=produto&id=${p.id}`)} />
                ))}
              </ProductGrid>
            ) : fitOnly ? (
              <ShopEmpty title={t("shop.profile.emptyFit", { car: carShortName(MY_CAR) })} body={t("shop.profile.emptyFitBody")} actionLabel={t("shop.profile.clearFilter")} onAction={() => setFitOnly(false)} />
            ) : (
              <ShopEmpty title={t("shop.profile.emptyProducts")} body={t("shop.profile.emptyProductsBody", { handle: PAGE.handle })} />
            )}
          </>
        )}
        {tab === "services" &&
          (SERVICES.length ? (
            <div className="grid gap-2.5">
              {SERVICES.map((s) => (
                <ServiceRow key={s.id} photo={s.photo} title={s.title} meta={s.meta} price={s.price} actionLabel={t("shop.profile.quote")} onAction={() => setContact({ channel: "engine", message: prefilledMessage({ kind: "service", title: s.title, carName: `${MY_CAR.model} ${MY_CAR.year}` }, t) })} />
              ))}
            </div>
          ) : (
            <ShopEmpty title={t("shop.profile.emptyServices")} />
          ))}
        {tab === "reviews" && <p className="text-sm text-[var(--engine-text-muted)]">ServiceReviews</p>}
      </ProPageBody>
      <ContactSheet key={contact?.message} open={Boolean(contact)} channel={contact?.channel} handle={PAGE.handle} initialMessage={contact?.message} phone={PAGE.whatsapp} phoneLabel={PAGE.whatsapp} onSend={() => setContact(null)} onClose={() => setContact(null)} />
    </Shell>
  );
}

/* ======================= Produto ======================= */
function ProdutoScreen() {
  const { t, i18n } = useTranslation();
  const [contact, setContact] = useState(null);
  const product = PRODUCTS.find((p) => p.id === QUERY.get("id")) || PRODUCTS[0];
  if (!product) return <Shell><ShopEmpty title={t("shop.profile.emptyProducts")} /></Shell>;
  const priceText = formatPrice(product.data.priceAmount, "BRL", i18n.language);
  const message = prefilledMessage({ kind: "product", title: product.title, price: priceText }, t);
  const store = STORES.find((s) => s.handle === product.seller);
  return (
    <Shell>
      <ProductDetail
        product={{
          title: product.title,
          price: priceText,
          photos: product.photos,
          sold: product.saleStatus === "sold",
          badges: [t(`shop.condition.${product.data.condition}`), t(`shop.categories.${product.data.category}`), product.data.acceptsOffers && t("shop.product.offers")].filter(Boolean),
          description: product.description,
          universal: product.data.universal,
          fitsLabels: product.data.fits.map((f) => fitLabel(f, t)),
        }}
        fit={fitsCar({ fits: product.data.fits, universal: product.data.universal }, MY_CAR)}
        carName={`${MY_CAR.model} ${MY_CAR.year}`}
        seller={store ? { name: store.name, handle: store.handle, initials: store.initials, meta: `${store.rating} · ${store.place}` } : { name: "João Turbo", handle: product.seller, initials: "JT", meta: "Campinas, SP" }}
        onBack={() => (window.location.search = "?tela=pagina")}
        onShare={() => {}}
        onSeller={() => (window.location.search = "?tela=pagina")}
        onMessage={() => setContact({ channel: "engine" })}
        onWhatsApp={() => setContact({ channel: "whatsapp" })}
      />
      <ContactSheet key={contact?.channel} open={Boolean(contact)} channel={contact?.channel} handle={product.seller} initialMessage={message} phone={PAGE.whatsapp} phoneLabel={PAGE.whatsapp} onSend={() => setContact(null)} onClose={() => setContact(null)} />
    </Shell>
  );
}

/* ======================= Serviços | Lojas ======================= */
function LojasScreen() {
  const { t } = useTranslation();
  const [segment, setSegment] = useState("shops");
  const [fitOnly, setFitOnly] = useState(false);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const toCard = useCardProps();
  const list = useMemo(
    () =>
      PRODUCTS.filter((p) => (category === "all" || p.data.category === category) && (!fitOnly || fitsCar({ fits: p.data.fits, universal: p.data.universal }, MY_CAR)) && p.title.toLowerCase().includes(query.toLowerCase())),
    [category, fitOnly, query],
  );
  const catName = category === "all" ? t("shop.browse.all") : t(`shop.categories.${category}`);
  return (
    <Shell>
      <ShopBrowseHeader segment={segment} onSegment={setSegment} query={query} onQuery={setQuery} carName={`${MY_CAR.model} ${MY_CAR.year}`} fitOnly={fitOnly} onFitOnly={setFitOnly} onAdvertise={() => (window.location.search = "?tela=anunciar")} />
      {segment === "shops" ? (
        <>
          <ChipRow className="px-4 pt-3 lg:px-12" label={t("shop.browse.categories")}>
            {["all", ...PRODUCT_CATEGORIES].map((c) => (
              <CategoryChip key={c} selected={category === c} onClick={() => setCategory(c)}>
                {c === "all" ? t("shop.browse.all") : t(`shop.categories.${c}`)}
              </CategoryChip>
            ))}
          </ChipRow>
          {!EMPTY && (
            <ShopSection title={t("shop.browse.storesNear")} flush>
              <StoreRow>
                {STORES.map((s) => (
                  <StoreCard key={s.handle} {...s} onClick={() => (window.location.search = "?tela=pagina")} />
                ))}
              </StoreRow>
            </ShopSection>
          )}
          <ShopSection title={fitOnly ? t("shop.browse.fitsYour", { car: carShortName(MY_CAR) }) : t("shop.browse.latest")} aside={list.length ? t("shop.browse.count", { count: list.length }) : ""}>
            <div className="pb-6 lg:pb-12">
              {list.length ? (
                <ProductGrid>
                  {list.map((p) => (
                    <ProductCard key={p.id} {...toCard(p, { withSeller: true })} onClick={() => (window.location.search = `?tela=produto&id=${p.id}`)} />
                  ))}
                </ProductGrid>
              ) : (
                <ShopEmpty
                  title={fitOnly ? t("shop.browse.emptyFit", { category: catName, car: carShortName(MY_CAR) }) : category === "all" ? t("shop.browse.emptyAll") : t("shop.browse.empty", { category: catName })}
                  body={t("shop.browse.emptyBody")}
                  actionLabel={category !== "all" ? t("shop.browse.allCategories") : undefined}
                  onAction={() => setCategory("all")}
                />
              )}
            </div>
          </ShopSection>
        </>
      ) : (
        <div className="grid gap-2.5 px-4 pb-6 pt-4 lg:px-12">
          {SERVICES.map((s) => (
            <ServiceRow key={s.id} photo={s.photo} title={s.title} meta={`Garagem 47 Performance · ${s.meta}`} price={s.price} onClick={() => (window.location.search = "?tela=pagina")} />
          ))}
        </div>
      )}
    </Shell>
  );
}

/** Moldura mínima: no app real a página fica dentro do layout com a navegação. */
function Shell({ children }) {
  return <main className="mx-auto min-h-dvh max-w-[1280px] bg-[var(--engine-bg)]">{children}</main>;
}

/* ===== Telas DE VERDADE do Han, com dados de exemplo (?tela=editor|criarpagina|vitrine) ===== */
const FAKE_USER = { uid: "preview-user" };
const PAGE_ROW = {
  id: "page-1",
  kind: "page",
  handle: "garagem47",
  name: "Garagem 47 Performance",
  data: { category: "shop", city: "São Paulo", state: "SP", cover: COVERS[0], whatsapp: "11987654321", whatsappCountry: "+55", bio: "Suspensão, rodas e som. Instalação na hora." },
};
const PERSON_ROW = { id: "person-1", kind: "person", user_id: "preview-user", name: "Murilo Godoy", data: { city: "São Paulo" } };
const PRO_ENTRIES = [
  { profile: proProfileFromRow(PERSON_ROW), role: "owner", status: "active" },
  { profile: proProfileFromRow(PAGE_ROW), role: "owner", status: "active" },
];
const GARAGE = [{ brand: "Honda", model: "Civic Touring", year: "2019", fipe: { brandCode: "25" } }];
const LISTING_ROWS = PRODUCTS.map((p) => ({
  id: p.id,
  kind: "product",
  slug: p.id,
  moderation_status: "approved",
  profile_id: "page-1",
  data: {
    title: p.title,
    description: p.description || "",
    photos: p.photos,
    category: p.data.category,
    condition: p.data.condition,
    priceAmount: p.data.priceAmount,
    acceptsOffers: Boolean(p.data.acceptsOffers),
    saleStatus: p.saleStatus || "available",
    fits: p.data.fits,
  },
})).concat(
  SERVICES.map((s, i) => ({
    id: s.id,
    kind: "service",
    slug: s.id,
    moderation_status: i === 2 ? "pending" : "approved",
    profile_id: "page-1",
    data: { title: s.title, photos: [s.photo], category: "mechanics", price: s.price.replace(/^a partir de /, ""), priceFrom: s.price.startsWith("a partir") },
  })),
);

function RealEditorScreen() {
  return (
    <ProductEditor
      user={FAKE_USER}
      profiles={PRO_ENTRIES}
      profileId={QUERY.get("passo") ? "page-1" : ""}
      onClose={() => (window.location.search = "?tela=vitrine")}
      onSaved={() => {}}
    />
  );
}

function RealPageEditorScreen() {
  return <ProProfileEditor kind="page" seed={{ name: "" }} user={FAKE_USER} onClose={() => {}} onSaved={() => {}} />;
}

function RealVitrineScreen() {
  const { t } = useTranslation();
  const profile = proProfileFromRow(PAGE_ROW);
  return (
    <main className="mx-auto min-h-dvh max-w-[1280px] bg-[var(--engine-bg)] pb-16">
      <ProPageHeader
        page={{
          name: profile.name,
          handle: profile.handle,
          category: t("pro.categories.shop"),
          cover: profile.data.cover,
          initials: "G47",
          rating: "4,8",
          ratingCount: 127,
          place: "São Paulo, SP",
          productCount: PRODUCTS.length,
          serviceCount: SERVICES.length,
        }}
        whatsappHref="https://wa.me/5511987654321"
      >
        <p className="mt-3.5 max-w-2xl text-sm leading-6 text-[var(--engine-text)]">{profile.data.bio}</p>
      </ProPageHeader>
      <ProVitrine rows={EMPTY ? [] : LISTING_ROWS} cars={GARAGE} handle={profile.handle} />
    </main>
  );
}

function RealShopCardsScreen() {
  return (
    <main className="mx-auto min-h-dvh max-w-[1280px] bg-[var(--engine-bg)] px-4 py-4 lg:px-12">
      <ShopSegment value="shops" onChange={() => {}} />
      <div className="mt-4">
        <ProductGrid>
          {LISTING_ROWS.filter((row) => row.kind === "product").map((row) => {
            const product = { ...productFromRow(row), providerName: "Garagem 47 Performance", city: "São Paulo" };
            return <RealProductCard key={row.id} product={product} fitsCar={fittingCar(product, GARAGE)} onOpen={() => {}} />;
          })}
        </ProductGrid>
      </div>
    </main>
  );
}

const SCREENS = {
  anunciar: AnunciarScreen,
  pagina: PaginaScreen,
  produto: ProdutoScreen,
  lojas: LojasScreen,
  editor: RealEditorScreen,
  criarpagina: RealPageEditorScreen,
  vitrine: RealVitrineScreen,
  cartoes: RealShopCardsScreen,
};
const Screen = SCREENS[QUERY.get("tela")] || AnunciarScreen;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          {/* O fluxo ocupa a altura da caixa em que está (min-h-full). */}
          <div className="h-dvh overflow-y-auto">
            <Screen />
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
