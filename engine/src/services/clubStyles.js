/**
 * Vocabulário visual dos Clubes — estilos, paleta, formas e símbolos.
 *
 * Isto é da TELA, não do dado (`CLUBES-CONTRATO.md` §7). O documento do clube
 * guarda **ids e nomes** (`"rebaixados"`, `"azul-mercosul"`, `"plate"`,
 * `"wheel"`); o hex e o SVG moram aqui. É o que permite trocar a paleta
 * inteira, ou redesenhar o emblema, sem tocar em nenhum documento gravado —
 * e é o motivo de o `clubs.js` do Han não importar este arquivo.
 *
 * Só valores e funções puras: o rótulo sai sempre do i18n
 * (`clubs.styles.<id>`, `clubs.colors.<id>`, `clubs.shapes.<id>`,
 * `clubs.icons.<id>`), como em `eventTypes.js`.
 */

/**
 * Os 17 estilos da lista fechada (CLUBES-MODELO.md §2.2). Declarados pelo
 * fundador; não se inferem da ficha do carro. A ordem é a da tela: primeiro
 * os que a cena brasileira mais usa.
 */
export const CLUB_STYLE_VALUES = [
  "rebaixados",
  "antigos",
  "ar",
  "jdm",
  "euro",
  "esportivos",
  "preparados",
  "som",
  "tuning",
  "muscle",
  "offroad",
  "picapes",
  "suv",
  "eletricos",
  "drift",
  "track",
  "viagem",
];

export const clubStyleLabel = (t, value) =>
  value ? t(`clubs.styles.${value}`, { defaultValue: value }) : "";

export const clubStyleOptions = (t, { withAll = false } = {}) => [
  ...(withAll ? [{ value: "", label: t("clubs.filters.allStyles") }] : []),
  ...CLUB_STYLE_VALUES.map((value) => ({ value, label: clubStyleLabel(t, value) })),
];

/**
 * A paleta fechada: 16 cores, cada uma com um hex por tema.
 *
 * Duas colunas de propósito. O mesmo vermelho que se lê bem sobre
 * `--engine-surface` claro some no escuro, e o inverso também: `amarelo-pista`
 * puro sobre fundo branco reprova em contraste como texto. Então cada cor
 * carrega o tom de PREENCHIMENTO (`hex`, usado em faixa, capa e emblema, onde
 * ela é fundo e não texto) e o tom de TINTA (`ink`/`inkDark`, usado quando a
 * cor vira texto ou borda sobre a superfície do app).
 *
 * `light: true` marca as cores claras o bastante para pedirem texto escuro em
 * cima — sem isso, "Entrar" em amarelo vira branco no branco.
 *
 * Contraste conferido em 29/10/2026 (WCAG, texto normal, 4,5:1): `ink` sobre
 * --engine-surface e --engine-surface-2 claros, `inkDark` sobre os escuros, e
 * o texto do botão (`--club-on`) sobre `hex`. Laranja, verde bandeira, ciano,
 * celeste e rosa escureceram um tom no `hex` (o branco do botão ficava entre
 * 3,4 e 4,5:1); laranja, verde limão, ciano e bege, no `ink`.
 */
export const CLUB_PALETTE = [
  { id: "vermelho-corrida", hex: "#d92534", ink: "#c01f2d", inkDark: "#ff6b74" },
  { id: "laranja-turbo", hex: "#be570d", ink: "#ad4e09", inkDark: "#ff9a4d" },
  { id: "amarelo-pista", hex: "#e0a80c", ink: "#8a6605", inkDark: "#facc4b", light: true },
  { id: "verde-bandeira", hex: "#1a8548", ink: "#157744", inkDark: "#4ade80" },
  { id: "verde-limao", hex: "#7cb518", ink: "#50750e", inkDark: "#a3e635", light: true },
  { id: "ciano-nitro", hex: "#0c818c", ink: "#0a7681", inkDark: "#3ed6e4" },
  { id: "azul-mercosul", hex: "#1f4fd8", ink: "#2145b4", inkDark: "#7d9dff" },
  { id: "azul-celeste", hex: "#2778b5", ink: "#1f6ea9", inkDark: "#6cc2ff" },
  { id: "roxo-neon", hex: "#7b3fe4", ink: "#6a32cc", inkDark: "#b491ff" },
  { id: "rosa-vinil", hex: "#d23289", ink: "#b32873", inkDark: "#ff7ab8" },
  { id: "vinho", hex: "#8e1f38", ink: "#8e1f38", inkDark: "#ef7d96" },
  { id: "marrom-couro", hex: "#8a5a2b", ink: "#754a22", inkDark: "#d8a56a" },
  { id: "grafite", hex: "#3c4452", ink: "#3c4452", inkDark: "#b7c0cf" },
  { id: "prata", hex: "#8b93a3", ink: "#5b6472", inkDark: "#cbd3e0", light: true },
  { id: "preto-fosco", hex: "#1c2028", ink: "#1c2028", inkDark: "#c9d1de" },
  { id: "bege-areia", hex: "#b79a68", ink: "#7c673b", inkDark: "#e3c78d", light: true },
];

export const CLUB_COLOR_VALUES = CLUB_PALETTE.map((color) => color.id);
export const DEFAULT_CLUB_COLOR = "azul-mercosul";
export const DEFAULT_CLUB_COLOR_SECONDARY = "grafite";

const paletteEntry = (id) =>
  CLUB_PALETTE.find((color) => color.id === id) || CLUB_PALETTE[6];

export const clubColorLabel = (t, value) =>
  value ? t(`clubs.colors.${value}`, { defaultValue: value }) : "";

/**
 * Traduz o clube inteiro para as quatro variáveis que o CSS consome.
 *
 * Devolve um objeto de estilo em vez de classes porque a cor é escolhida pelo
 * usuário: não existe classe Tailwind para 16 cores × 2 papéis que o purge
 * consiga enxergar. As variáveis entram uma vez no topo do componente e todo
 * o resto continua em classe utilitária.
 *
 *   --club      preenchimento (faixa, capa, emblema, botão do clube)
 *   --club-2    a segunda cor, para o gradiente e a faixa do emblema
 *   --club-ink  a cor como TEXTO/borda sobre a superfície do app
 *   --club-on   o texto que vai POR CIMA de --club
 */
export function clubColorVars(club, isDark = false) {
  const primary = paletteEntry(club?.colors?.primary || DEFAULT_CLUB_COLOR);
  const secondary = paletteEntry(
    club?.colors?.secondary || DEFAULT_CLUB_COLOR_SECONDARY,
  );
  return {
    "--club": primary.hex,
    "--club-2": secondary.hex,
    "--club-ink": isDark ? primary.inkDark : primary.ink,
    "--club-on": primary.light ? "#18202c" : "#ffffff",
  };
}

/** As 4 formas do emblema. `plate` é o padrão — é a direção aprovada. */
export const CLUB_SHAPE_VALUES = ["plate", "shield", "circle", "hex"];
export const DEFAULT_CLUB_SHAPE = "plate";
export const clubShapeLabel = (t, value) =>
  value ? t(`clubs.shapes.${value}`, { defaultValue: value }) : "";

/**
 * Os símbolos do emblema, em grupos para o seletor. Os 12 primeiros ids
 * (roda, turbo, pistão, chave, bandeira, raio, montanha, velocímetro, chassi
 * baixo, farol, escudo, nenhum) são os desenhos à mão logo abaixo; o resto
 * vem do lucide-react (components/clubs/clubIcons.js). A lista e os grupos
 * moram aqui, sem componente, para o i18n e a validação lerem sem React.
 * Rótulo: `clubs.icons.<id>`; grupo: `clubs.custom.iconGroups.<id>`.
 */
export const CLUB_ICON_GROUPS = [
  {
    id: "cars",
    icons: ["car", "car-front", "car-taxi-front", "lowered", "headlight", "bus", "truck",
      "truck-electric", "caravan", "tractor", "motorbike", "bike"],
  },
  {
    id: "mechanics",
    icons: ["wheel", "turbo", "piston", "wrench", "gauge", "cog", "disc", "fuel", "ev-charger",
      "battery", "plug", "key", "fan", "thermometer", "hammer", "drill", "spray-can", "paintbrush"],
  },
  {
    id: "road",
    icons: ["flag", "pennant", "route", "map-pin", "navigation", "compass", "milestone",
      "signpost", "cone", "parking", "mountain", "mountain-snow", "palm", "tent", "waves",
      "sunset", "sun", "moon", "snowflake", "wind"],
  },
  {
    id: "scene",
    icons: ["trophy", "medal", "award", "crown", "star", "sparkles", "bolt", "flame", "rocket",
      "timer", "siren", "skull", "ghost", "swords", "hand-metal", "speaker", "music", "radio",
      "camera", "users", "heart", "dog", "anchor"],
  },
  {
    id: "symbols",
    icons: ["shield", "shield-check", "gem", "infinity", "none"],
  },
];

export const CLUB_ICON_VALUES = CLUB_ICON_GROUPS.flatMap((group) => group.icons);

/**
 * Os desenhos dos 12 símbolos. Moram aqui, e não no componente, porque o
 * formulário de criação também precisa deles para o seletor — e um módulo de
 * serviço pode exportar constante sem brigar com o fast refresh.
 */
export const CLUB_ICON_PATHS = {
  wheel:
    "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 110 12 6 6 0 010-12zm0 3.6a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8z",
  turbo:
    "M12 3a9 9 0 019 9h-4a5 5 0 00-5-5V3zm-1 0v4a5 5 0 00-4.9 4H2.1A9 9 0 0111 3zM2.2 13h4.1a5 5 0 002.3 3.3l-2 3.5A9 9 0 012.2 13zm19.6 0a9 9 0 01-4.4 6.8l-2-3.5A5 5 0 0017.7 13h4.1z",
  piston: "M8 2h8v4l-1 2v5h1v9H8v-9h1V8L8 6V2zm2 2v1.6l1 2V13h2V7.6l1-2V4h-4z",
  wrench:
    "M14.7 2a6.3 6.3 0 00-5.6 9.1L2 18.2 5.8 22l7.1-7.1A6.3 6.3 0 0021 6.6l-3 3-2.6-2.6 3-3A6.3 6.3 0 0014.7 2z",
  flag: "M3 2h18v14H3V2zm3 3v3h3V5H6zm3 3v3H6V8h3zm0-3h3v3H9V5zm3 3h3v3h-3V8zm3-3h3v3h-3V5zM3 17h2v5H3v-5z",
  bolt: "M13 2L4 14h6l-1 8 9-12h-6l1-8z",
  mountain: "M12 4l5 8 2.5-3.5L23 20H1l6-9 2.5 3.5L12 4z",
  gauge:
    "M12 4a9 9 0 00-8.7 11.4l1.9-.5A7 7 0 1119 15l1.9.5A9 9 0 0012 4zm4.2 3.8l-4.9 3.7a1.6 1.6 0 101.8 1.8l3.1-5.5z",
  lowered:
    "M2 13h3.2a3 3 0 015.6 0h2.4a3 3 0 015.6 0H22v3h-2.2a3 3 0 01-5.6 0h-2.4a3 3 0 01-5.6 0H2v-3zm2-4h16v2H4V9z",
  headlight:
    "M7 6a6 6 0 100 12h1a6 6 0 000-12H7zm9 1h6v2h-6V7zm0 4h6v2h-6v-2zm0 4h6v2h-6v-2z",
  shield: "M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3z",
  none: "",
};

export const DEFAULT_CLUB_ICON = "wheel";

/**
 * O emblema com foto (29/10/2026). A logo é recortada na FORMA escolhida, e
 * por cima dela pode ir o símbolo, com cor, posição e fundo próprios. A borda
 * da forma vale com e sem foto.
 *
 *   showSymbolOnPhoto  liga o símbolo por cima da foto (sem foto, ele sempre
 *                      aparece no emblema gerado)
 *   symbolColor        nome da paleta, ou "" = branco
 *   symbolPosition     "center" | "corner" (selo no canto inferior direito)
 *   symbolBacking      "none" | "disc" (disco na cor do clube) | "scrim"
 *                      (sombra escura atrás do símbolo)
 *   borderColor        nome da paleta, "none" = sem borda, "" = padrão
 *                      (branco translúcido, o de sempre)
 *
 * As listas fechadas moram aqui e no `club_emblem_ok` do banco (migration
 * 20261029150000) — o teste do PGlite confere que a paleta das duas bate.
 */
export const CLUB_SYMBOL_POSITIONS = ["center", "corner"];
export const CLUB_SYMBOL_BACKINGS = ["none", "disc", "scrim"];
export const DEFAULT_SYMBOL_POSITION = "corner";
export const DEFAULT_SYMBOL_BACKING = "disc";
export const CLUB_BORDER_WIDTH = 3.5; // no viewBox 100: 3,5% do lado

const isPaletteId = (id) => CLUB_PALETTE.some((color) => color.id === id);

/** As duas cores como gravar: nome fora da paleta (dado antigo) vira o padrão. */
export const normalizeColors = (colors = {}) => ({
  primary: isPaletteId(colors?.primary) ? colors.primary : DEFAULT_CLUB_COLOR,
  secondary: isPaletteId(colors?.secondary) ? colors.secondary : "",
});

/** O emblema como gravar: só chaves conhecidas, só valores das listas. */
export function normalizeEmblem(emblem = {}) {
  const e = emblem && typeof emblem === "object" ? emblem : {};
  return {
    shape: CLUB_SHAPE_VALUES.includes(e.shape) ? e.shape : DEFAULT_CLUB_SHAPE,
    icon: CLUB_ICON_VALUES.includes(e.icon) ? e.icon : DEFAULT_CLUB_ICON,
    showSymbolOnPhoto: e.showSymbolOnPhoto === true,
    symbolColor: isPaletteId(e.symbolColor) ? e.symbolColor : "",
    symbolPosition: CLUB_SYMBOL_POSITIONS.includes(e.symbolPosition) ? e.symbolPosition : DEFAULT_SYMBOL_POSITION,
    symbolBacking: CLUB_SYMBOL_BACKINGS.includes(e.symbolBacking) ? e.symbolBacking : DEFAULT_SYMBOL_BACKING,
    borderColor: e.borderColor === "none" || isPaletteId(e.borderColor) ? e.borderColor : "",
  };
}

const luminance = (hex) => {
  const channels = [1, 3, 5]
    .map((i) => parseInt(String(hex).slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
/** Razão de contraste WCAG entre dois hex `#rrggbb`. */
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const SYMBOL_LIGHT = "#ffffff";
// Contorno automático no tema escuro. Medido contra --engine-elevated escuro
// (#14171d, o fundo mais claro em que o emblema aparece; sobre --engine-bg a
// conta só piora). Abaixo de 1,5:1 a forma se perde no fundo: em 30/10/2026
// só o preto-fosco (1,10) cai aqui. Grafite (1,83) fica de fora de propósito
// — é a cor secundária padrão e ainda se lê; vinho dá 2,05.
const DARK_SURFACE = "#14171d";
const OUTLINE_MIN_CONTRAST = 1.5;
const fadesOnDark = (hex) => contrastRatio(hex, DARK_SURFACE) < OUTLINE_MIN_CONTRAST;
const SYMBOL_DARK = "#18202c";
const SCRIM_TONE = "#2a2d33"; // o que a sombra escura vira sobre uma foto média

/**
 * Tudo que o desenho do emblema precisa, já resolvido em hex.
 *
 * Contraste: o símbolo é conferido contra o que está ATRÁS dele (a faixa da
 * placa, o corpo da forma, o disco ou a sombra). Abaixo de 3:1 — o mínimo
 * de WCAG para elemento gráfico — ele cai sozinho para branco ou grafite
 * escuro, o que contrastar mais. É o caso "símbolo vinho num disco vinho".
 * Sem fundo nenhum sobre a foto não há o que medir: o símbolo ganha sombra.
 */
export function resolveEmblem(club, { hasPhoto = false } = {}) {
  const emblem = normalizeEmblem(club?.emblem);
  const primary = paletteEntry(club?.colors?.primary || DEFAULT_CLUB_COLOR);
  const secondary = paletteEntry(club?.colors?.secondary || DEFAULT_CLUB_COLOR_SECONDARY);
  const symbolBase = emblem.symbolColor ? paletteEntry(emblem.symbolColor).hex : SYMBOL_LIGHT;

  let behind = null;
  if (!hasPhoto) behind = emblem.shape === "plate" ? secondary.hex : primary.hex;
  else if (emblem.symbolBacking === "disc") behind = primary.hex;
  else if (emblem.symbolBacking === "scrim") behind = SCRIM_TONE;

  let symbolHex = symbolBase;
  if (behind && contrastRatio(symbolBase, behind) < 3) {
    symbolHex = contrastRatio(SYMBOL_LIGHT, behind) >= contrastRatio(SYMBOL_DARK, behind) ? SYMBOL_LIGHT : SYMBOL_DARK;
  }

  // null = sem borda; "" = a borda padrão (branco translúcido, sempre lê).
  const borderHex =
    emblem.borderColor === "none" ? null : emblem.borderColor ? paletteEntry(emblem.borderColor).hex : "";
  // Sem borda visível, o que desenha a silhueta é o corpo da forma. Com foto
  // não dá para medir a borda da imagem (logo preta em fundo preto é o caso
  // comum), então com foto e sem borda o contorno entra sempre.
  const borderReads = borderHex === "" || (borderHex !== null && !fadesOnDark(borderHex));
  const darkOutline = !borderReads && (hasPhoto || fadesOnDark(primary.hex));

  return {
    ...emblem,
    fill: primary.hex,
    fill2: secondary.hex,
    symbolHex,
    symbolShadow: hasPhoto && emblem.symbolBacking === "none",
    borderHex,
    // Contorno fino só no tema escuro (a classe `dark:` decide), para a forma
    // não sumir no fundo. No claro nenhuma cor da paleta some.
    darkOutline,
  };
}
export const clubIconLabel = (t, value) =>
  value ? t(`clubs.icons.${value}`, { defaultValue: value }) : "";

/** `^[A-Z0-9]{2,5}$` — a mesma regra que a camada de dados valida. */
export const CLUB_TAG_PATTERN = /^[A-Z0-9]{2,5}$/;
export const normalizeClubTag = (value) =>
  String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
export const isValidClubTag = (value) => CLUB_TAG_PATTERN.test(String(value || ""));

export const CLUB_NAME_MAX = 40;
export const CLUB_MOTTO_MAX = 60;
export const CLUB_DESCRIPTION_MAX = 500;
export const CLUB_RULE_MAX = 120;
export const CLUB_RULES_MAX = 5;
export const CLUB_MEETUP_MAX = 80;
export const CLUB_FOCUS_MAX = 3;

/** `open` e `approval`; `invite` é fase 2 e não aparece na tela. */
export const CLUB_JOIN_POLICIES = ["open", "approval"];

/** Um clube novo já nasce com identidade — nada de formulário em branco. */
export function emptyClubDraft() {
  return {
    name: "",
    tag: "",
    motto: "",
    description: "",
    emblem: normalizeEmblem({}),
    colors: { primary: DEFAULT_CLUB_COLOR, secondary: DEFAULT_CLUB_COLOR_SECONDARY },
    cover: "",
    country: "BR",
    state: "",
    city: "",
    foundedYear: "",
    meetupSchedule: "",
    focus: { brands: [], models: [], styles: [] },
    rules: [],
    links: { instagram: "", whatsapp: "", facebook: "", website: "" },
    joinPolicy: "open",
    contentVisibility: "public",
  };
}

/**
 * Onde o clube fica, como a tela escreve. Clube sem estado é nacional — e
 * "Brasil inteiro" é uma informação, não um campo vazio.
 */
export function clubPlaceLabel(club, t) {
  if (!club) return "";
  if (club.city && club.state) return `${club.city}/${club.state}`;
  // Cidade sem UF ainda é uma informação melhor que "Brasil inteiro" — e é o
  // estado normal de quem está preenchendo o formulário de cima para baixo.
  if (club.city) return club.city;
  if (club.state) return club.state;
  return t("clubs.nationwide");
}

/**
 * Os chips de foco do card: no máximo dois, porque o card não é ficha.
 * Modelo ganha da marca (é mais específico), e um estilo sempre acompanha.
 */
export function clubFocusChips(club, t) {
  const focus = club?.focus || {};
  const chips = [];
  if (focus.models?.[0]) chips.push(focus.models[0]);
  else if (focus.brands?.[0]) chips.push(focus.brands[0]);
  if (focus.styles?.[0]) chips.push(clubStyleLabel(t, focus.styles[0]));
  if (!chips.length) chips.push(t("clubs.focusGeneral"));
  return chips.slice(0, 2);
}

/** Um clube com foco declarado casa com um carro da garagem por marca ou família. */
export function clubMatchesCar(club, car) {
  if (!club || !car) return false;
  const brands = (club.focus?.brands || []).map((b) => b.toLowerCase());
  const models = (club.focus?.models || []).map((m) => m.toLowerCase());
  const brand = String(car.brand || "").toLowerCase();
  const family = String(car.model || "").trim().split(/\s+/)[0]?.toLowerCase() || "";
  return brands.includes(brand) || (Boolean(family) && models.includes(family));
}
