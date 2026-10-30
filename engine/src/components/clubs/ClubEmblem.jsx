import { useId, useState } from "react";
import { CLUB_LUCIDE_ICONS } from "./clubIcons";
import { CLUB_BORDER_WIDTH, CLUB_ICON_PATHS, resolveEmblem } from "../../services/clubStyles";

/**
 * O emblema do clube, em SVG, nos dois modos — e com a mesma forma nos dois.
 *
 * GERADO (sem logo): forma × símbolo × sigla × duas cores. É o padrão e o
 * reserva: logo que não carrega cai nele, nunca num quadrado quebrado.
 *
 * COM FOTO (`club.logoUrl`, logo quadrada no Storage, pasta `clubs/<id>/`):
 * a foto é recortada (clipPath) na forma escolhida — placa, escudo, círculo
 * ou hexágono — e, se o clube ligar, o símbolo vai por cima, no centro ou
 * num selo no canto, com disco ou sombra atrás para ler sobre qualquer foto.
 *
 * Borda: a cor da paleta, "sem borda" ou a padrão (branco translúcido), com
 * a mesma espessura relativa em qualquer tamanho (viewBox 100).
 *
 * A forma padrão é a PLACA, a direção aprovada: faixa superior como a
 * Mercosul, sigla em mono no corpo. Funciona de 28px (lista) a 96px (topo).
 */

// O contorno de cada forma no viewBox 100×100: corpo, recorte da foto e borda.
const OUTLINE = {
  plate: "M13 12h74a10 10 0 0110 10v56a10 10 0 01-10 10H13A10 10 0 013 78V22a10 10 0 0110-10z",
  shield: "M50 8l36 13v26c0 22-15 38-36 45C29 85 14 69 14 47V21L50 8z",
  circle: "M50 8a42 42 0 110 84a42 42 0 110-84z",
  hex: "M50 6l38 22v44L50 94 12 72V28L50 6z",
};
// Onde o selo do canto fica dentro de cada forma (centro x, y).
const CORNER = { plate: [79, 71], shield: [66, 63], circle: [73, 73], hex: [70, 64] };
// O lugar do símbolo no emblema gerado (x, y, lado).
const GENERATED_SLOT = { plate: [7, 14, 17], shield: [36, 22, 28], circle: [37, 20, 26], hex: [37, 22, 26] };
const DEFAULT_BORDER = "rgba(255,255,255,.55)";

/** O símbolo sozinho, para o seletor: desenho à mão (preenchido) ou lucide (traço). */
export function ClubIconGlyph({ icon, size = 21, className = "" }) {
  const Lucide = CLUB_ICON_PATHS[icon] ? null : CLUB_LUCIDE_ICONS[icon];
  if (Lucide) return <Lucide size={size} strokeWidth={2} aria-hidden="true" className={className} />;
  const path = CLUB_ICON_PATHS[icon];
  if (!path) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className}>
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/** O símbolo dentro do SVG do emblema, em (x, y) com lado `size`. */
function EmblemSymbol({ icon, x, y, size, color, filter }) {
  const path = CLUB_ICON_PATHS[icon];
  if (path) {
    return (
      <g transform={`translate(${x},${y}) scale(${size / 24})`} filter={filter}>
        <path d={path} fill={color} />
      </g>
    );
  }
  const Lucide = CLUB_LUCIDE_ICONS[icon];
  if (!Lucide) return null;
  return (
    <g filter={filter}>
      <Lucide x={x} y={y} size={size} color={color} strokeWidth={2.4} aria-hidden="true" />
    </g>
  );
}

export function ClubEmblem({ club, size = 64, className = "", forceGenerated = false }) {
  const logo = forceGenerated ? "" : club?.logoUrl || "";
  // A logo que falhou fica marcada pela URL: trocar de logo tenta de novo.
  const [brokenLogo, setBrokenLogo] = useState("");
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const hasPhoto = Boolean(logo) && brokenLogo !== logo;
  const look = resolveEmblem(club, { hasPhoto });
  const outline = OUTLINE[look.shape] || OUTLINE.plate;
  const tag = String(club?.tag || "").toUpperCase() || "—";
  const border =
    look.borderHex === null ? null : (
      <path
        d={outline}
        fill="none"
        stroke={look.borderHex || DEFAULT_BORDER}
        strokeWidth={CLUB_BORDER_WIDTH}
        strokeLinejoin="round"
      />
    );

  let body;
  if (hasPhoto) {
    const showSymbol = look.showSymbolOnPhoto && look.icon !== "none";
    const corner = look.symbolPosition === "corner";
    const [cx, cy] = corner ? CORNER[look.shape] : [50, 50];
    const symbolSize = corner ? 17 : 36;
    const backingR = corner ? 13.5 : 26;
    body = (
      <>
        <defs>
          <clipPath id={`${id}-clip`}>
            <path d={outline} />
          </clipPath>
          <radialGradient
            id={`${id}-scrim`}
            gradientUnits="userSpaceOnUse"
            cx={cx}
            cy={cy}
            r={corner ? 26 : 46}
          >
            <stop offset="0" stopColor="#000" stopOpacity=".62" />
            <stop offset=".6" stopColor="#000" stopOpacity=".32" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}-sym`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0.8" stdDeviation="1.2" floodOpacity=".7" />
          </filter>
        </defs>
        <g clipPath={`url(#${id}-clip)`}>
          {/* Fundo na cor do clube: foto com transparência não vira buraco. */}
          <rect width="100" height="100" fill={look.fill} />
          <image
            href={logo}
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid slice"
            onError={() => setBrokenLogo(logo)}
          />
          {showSymbol && look.symbolBacking === "scrim" ? (
            <rect width="100" height="100" fill={`url(#${id}-scrim)`} />
          ) : null}
        </g>
        {showSymbol && look.symbolBacking === "disc" ? (
          <circle cx={cx} cy={cy} r={backingR} fill={look.fill} stroke="rgba(255,255,255,.75)" strokeWidth="1.5" />
        ) : null}
        {showSymbol ? (
          <EmblemSymbol
            icon={look.icon}
            x={cx - symbolSize / 2}
            y={cy - symbolSize / 2}
            size={symbolSize}
            color={look.symbolHex}
            filter={look.symbolShadow ? `url(#${id}-sym)` : undefined}
          />
        ) : null}
        {border}
      </>
    );
  } else {
    const [sx, sy, ss] = GENERATED_SLOT[look.shape] || GENERATED_SLOT.plate;
    // A sigla tem de 2 a 5 letras: sem encolher, "CBSC" transborda a placa.
    const fit = (base) => Math.min(base, (base * 3.2) / Math.max(tag.length, 2.6));
    const label = (y, fontSize) => (
      <text
        x="50"
        y={y}
        textAnchor="middle"
        fontFamily="JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace"
        fontWeight="800"
        fontSize={fit(fontSize)}
        letterSpacing={tag.length > 4 ? 0.5 : 1.5}
        fill="#ffffff"
      >
        {tag}
      </text>
    );
    const symbol =
      look.icon === "none" ? null : (
        <EmblemSymbol icon={look.icon} x={sx} y={sy} size={ss} color={look.symbolHex} />
      );

    if (look.shape === "plate") {
      body = (
        <>
          <path d={outline} fill={look.fill} />
          <path d="M3 22a10 10 0 0110-10h74a10 10 0 0110 10v12H3V22z" fill={look.fill2} />
          {symbol}
          <circle cx="46" cy="23" r="1.8" fill="rgba(255,255,255,.72)" />
          <circle cx="53" cy="23" r="1.8" fill="rgba(255,255,255,.72)" />
          <circle cx="60" cy="23" r="1.8" fill="rgba(255,255,255,.72)" />
          {label(72, 34)}
          <rect x="3" y="80" width="94" height="8" rx="4" fill="rgba(0,0,0,.2)" />
          {border}
        </>
      );
    } else {
      const strip = { shield: "M14 55h72v16H14z", circle: "M8 54h84v18H8z", hex: "M17 56h66v16H17z" }[look.shape];
      const labelY = look.shape === "hex" ? 69 : 68;
      body = (
        <>
          <path d={outline} fill={look.fill} />
          {look.shape === "circle" ? (
            <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />
          ) : null}
          {symbol}
          {/* A faixa da sigla fica dentro da forma (recortada por ela). */}
          <g clipPath={`url(#${id}-clip)`}>
            <path d={strip} fill={look.fill2} opacity={look.shape === "circle" ? 0.95 : 1} />
          </g>
          <defs>
            <clipPath id={`${id}-clip`}>
              <path d={outline} />
            </clipPath>
          </defs>
          {label(labelY, 17)}
          {border}
        </>
      );
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={tag}
      className={`shrink-0 ${className}`}
    >
      <defs>
        <filter id={`${id}-shadow`}>
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity=".34" />
        </filter>
      </defs>
      <g filter={`url(#${id}-shadow)`}>{body}</g>
    </svg>
  );
}

/** A sigla como o membro a carrega: `[CVC]` ao lado do nome. */
export function ClubTag({ tag, className = "" }) {
  if (!tag) return null;
  return (
    <span
      className={`inline-block rounded-md border border-[color-mix(in_srgb,var(--club,var(--engine-border-strong))_38%,transparent)] bg-[color-mix(in_srgb,var(--club,var(--engine-surface-2))_16%,transparent)] px-1.5 py-px font-mono text-[10px] font-extrabold tracking-wide text-[var(--club-ink,var(--engine-text-muted))] ${className}`}
    >
      [{String(tag).toUpperCase()}]
    </span>
  );
}
