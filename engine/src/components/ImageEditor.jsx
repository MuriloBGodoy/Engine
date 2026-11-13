import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Pen, Type, Palette, RotateCw, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  fitEditorCanvas,
  isSideways,
  quarterTurnScale,
  rotatePointClockwise,
} from "../services/imageEditorGeometry";
import { Select } from "./ui/Select";

const FILTERS = [
  { name: "Original", css: "none" },
  { name: "Brighten", css: "brightness(1.3)" },
  { name: "Darken", css: "brightness(0.7)" },
  { name: "Blur", css: "blur(5px)" },
  { name: "Sepia", css: "sepia(1)" },
  { name: "Grayscale", css: "grayscale(1)" },
];

const FONTS = ["Arial", "Verdana", "Georgia", "Courier New", "Times New Roman", "Comic Sans MS", "Impact"];

// Cores do TEXTO que o usuário escreve na foto: são conteúdo dele, não tema
// do app, por isso ficam fixas aqui (como no Instagram), com "outra cor" ao lado.
const TEXT_SWATCHES = ["#FFFFFF", "#000000", "#FF3B30", "#FFCC00", "#34C759", "#0A84FF"];

const MIN_TEXT = 12;
const MAX_TEXT = 120;
// Folga em volta da caixa do texto para o dedo acertar (unidades do canvas).
const HIT_PAD = 10;
// Quanto do texto tem que continuar dentro da foto ao arrastar.
const KEEP_INSIDE = 24;

const DEFAULT_STYLE = {
  fontSize: 32,
  fontFamily: "Arial",
  fontWeight: "bold",
  fontStyle: "normal",
  textColor: "#FFFFFF",
  shadow: true,
  shadowColor: "#000000",
  stroke: false,
  strokeColor: "#000000",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fontOf = (el) => `${el.fontStyle === "italic" ? "italic" : "normal"} ${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;

// Canvas só para medir texto; criado sob demanda, fora do React.
let measureCtx = null;
function measureText(el) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = fontOf(el);
  const m = measureCtx.measureText(el.text || " ");
  return {
    width: m.width,
    ascent: m.actualBoundingBoxAscent || el.fontSize * 0.8,
    descent: m.actualBoundingBoxDescent || el.fontSize * 0.2,
  };
}

// Mantém um pedaço do texto dentro da foto. x/y continuam no mesmo sistema de
// sempre (pixels do canvas, x à esquerda, y na linha de base), que é o que o
// fillText e a imagem exportada usam.
function clampTextPosition(el, x, y, width, height) {
  const box = measureText(el);
  return {
    x: clamp(x, KEEP_INSIDE - box.width, width - KEEP_INSIDE),
    y: clamp(y, KEEP_INSIDE - box.descent, height - KEEP_INSIDE + box.ascent),
  };
}

function drawElements(ctx, list) {
  list.forEach((el) => {
    if (el.type === "line") {
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < el.points.length; i += 2) {
        if (i === 0) ctx.moveTo(el.points[i], el.points[i + 1]);
        else ctx.lineTo(el.points[i], el.points[i + 1]);
      }
      ctx.stroke();
    } else if (el.type === "text") {
      ctx.font = fontOf(el);
      ctx.fillStyle = el.textColor;
      if (el.shadow) {
        ctx.shadowColor = el.shadowColor;
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
      }
      if (el.stroke) {
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = Math.max(2, el.fontSize / 12);
        ctx.lineJoin = "round";
        ctx.strokeText(el.text, el.x, el.y);
      }
      ctx.fillText(el.text, el.x, el.y);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
  });
}

/** Botão de alternar compacto (negrito, itálico, sombra, contorno). */
function ToggleChip({ active, onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${
        active ? "bg-[var(--engine-accent)] text-white" : "bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
}

/** Bolinha de cor que abre o seletor nativo. */
function ColorDot({ value, onChange, label }) {
  return (
    <label
      title={label}
      className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
    >
      <span className="h-6 w-6 rounded-full border-2 border-white/70" style={{ backgroundColor: value }} />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

/** Controles de estilo do texto: os mesmos para o texto novo e o selecionado. */
function TextStyleControls({ value, onChange }) {
  const { t } = useTranslation();
  const isCustomColor = !TEXT_SWATCHES.includes(value.textColor.toUpperCase());

  return (
    <div className="grid gap-3">
      {/* Cor do texto */}
      <div className="flex items-center gap-1.5 overflow-x-auto" role="group" aria-label={t("imageEditor.textColor")}>
        {TEXT_SWATCHES.map((color) => {
          const active = value.textColor.toUpperCase() === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange({ textColor: color })}
              aria-label={`${t("imageEditor.textColor")} ${color}`}
              aria-pressed={active}
              className="flex h-11 w-9 shrink-0 items-center justify-center"
            >
              <span
                className={`h-7 w-7 rounded-full border-2 transition ${
                  active ? "scale-110 border-white ring-2 ring-[var(--engine-accent)]" : "border-white/40"
                }`}
                style={{ backgroundColor: color }}
              />
            </button>
          );
        })}
        <label
          title={t("imageEditor.customColor")}
          className="relative flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center"
        >
          <span
            className={`h-7 w-7 rounded-full border-2 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] ${
              isCustomColor ? "scale-110 border-white ring-2 ring-[var(--engine-accent)]" : "border-white/40"
            }`}
          />
          <input
            type="color"
            value={value.textColor}
            onChange={(e) => onChange({ textColor: e.target.value })}
            aria-label={t("imageEditor.customColor")}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      {/* Estilo: negrito, itálico, sombra, contorno, fonte */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleChip
          active={value.fontWeight === "bold"}
          onClick={() => onChange({ fontWeight: value.fontWeight === "bold" ? "normal" : "bold" })}
          label={t("imageEditor.bold")}
        >
          <Bold size={16} aria-hidden="true" />
          <span className="sr-only">{t("imageEditor.bold")}</span>
        </ToggleChip>
        <ToggleChip
          active={value.fontStyle === "italic"}
          onClick={() => onChange({ fontStyle: value.fontStyle === "italic" ? "normal" : "italic" })}
          label={t("imageEditor.italic")}
        >
          <Italic size={16} aria-hidden="true" />
          <span className="sr-only">{t("imageEditor.italic")}</span>
        </ToggleChip>
        <ToggleChip active={value.shadow} onClick={() => onChange({ shadow: !value.shadow })} label={t("imageEditor.shadow")}>
          {t("imageEditor.shadow")}
        </ToggleChip>
        {value.shadow && (
          <ColorDot value={value.shadowColor} onChange={(c) => onChange({ shadowColor: c })} label={t("imageEditor.shadowColor")} />
        )}
        <ToggleChip active={value.stroke} onClick={() => onChange({ stroke: !value.stroke })} label={t("imageEditor.outline")}>
          {t("imageEditor.outline")}
        </ToggleChip>
        {value.stroke && (
          <ColorDot value={value.strokeColor} onChange={(c) => onChange({ strokeColor: c })} label={t("imageEditor.outlineColor")} />
        )}
        <Select
          value={value.fontFamily}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          aria-label={t("imageEditor.font")}
          className="h-11 min-w-0 flex-1 basis-32 rounded-lg border border-white/20 bg-engineDark px-2 text-base text-white outline-none focus:border-[var(--engine-accent)] sm:text-sm"
        >
          {FONTS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </Select>
      </div>

      {/* Tamanho (o atalho no celular é a pinça na própria foto) */}
      <label className="flex items-center gap-3">
        <span className="sr-only">{t("imageEditor.size")}</span>
        <Type size={14} className="shrink-0 text-white/60" aria-hidden="true" />
        <input
          type="range"
          min={MIN_TEXT}
          max={MAX_TEXT}
          value={value.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className="h-2 flex-1 cursor-pointer accent-[var(--engine-accent)]"
        />
        <Type size={22} className="shrink-0 text-white/60" aria-hidden="true" />
        <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-white/70">{value.fontSize}px</span>
      </label>
    </div>
  );
}

/**
 * Editor de foto do chat (desenho, texto, filtros, rotação) sobre um canvas.
 *
 * Entrada por pointer events, não por mouse (16/09/2026): com onMouseDown/
 * Move/Up o dedo não desenhava nada no Android — o toque vira só um clique
 * emulado no fim, sem movimento — e arrastar rolava a página. `touch-none`
 * no palco enquanto uma ferramenta está ativa entrega o gesto ao desenho.
 *
 * Texto como nos stories (30/10/2026): até aqui o texto era posicionado por
 * dois sliders X/Y, e o Murilo pediu arrastar com o dedo e com o mouse. O
 * texto continua desenhado NO canvas (é o que vai na imagem exportada); por
 * cima de cada um fica uma camada invisível do tamanho da caixa do texto que
 * recebe o toque: arrastar move, tocar seleciona, pinça com dois dedos muda o
 * tamanho, e pelo teclado as setas movem a camada focada. x/y seguem em
 * pixels do canvas, na linha de base — o mesmo sistema de antes.
 */
export function ImageEditor({ imageUrl, onClose, onSave }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [tool, setTool] = useState(null);
  const [brushSize, setBrushSize] = useState(5);
  const [brushColor, setBrushColor] = useState("#FF3B30");
  const [rotation, setRotation] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 500, height: 500 });
  const [imageReady, setImageReady] = useState(false);
  const [filter, setFilter] = useState("Original");
  const [textInput, setTextInput] = useState("");
  const [draftStyle, setDraftStyle] = useState(DEFAULT_STYLE);
  const [elements, setElements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // Gesto em andamento. Em ref: muda a cada movimento e não deve re-renderizar.
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const lineRef = useRef([]);

  const selected = elements.find((el) => el.id === selectedId && el.type === "text") || null;
  const textElements = elements.filter((el) => el.type === "text");

  function renderCanvas(extraLine) {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    // O tamanho manda o estado; o canvas acompanha (girar troca largura e altura).
    if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
    if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // A foto é desenhada no tamanho dela (de lado, as medidas do canvas se
    // invertem) e girada em volta do centro: nunca esticada para caber.
    const drawW = isSideways(rotation) ? canvas.height : canvas.width;
    const drawH = isSideways(rotation) ? canvas.width : canvas.height;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.filter = FILTERS.find((f) => f.name === filter)?.css || "none";
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    ctx.filter = "none";

    drawElements(ctx, elements);

    if (extraLine && extraLine.length > 0) {
      drawElements(ctx, [{ type: "line", points: extraLine, color: brushColor, size: brushSize }]);
    }
  }

  // Caixa onde o canvas tem que caber na tela.
  const editorBox = () => [Math.min(500, window.innerWidth - 48), window.innerHeight * 0.5];

  // Gira 90° no sentido horário. O canvas troca largura e altura (re-encaixado
  // na tela) e traços e textos giram junto com a foto, para continuarem em
  // cima do mesmo ponto dela. O texto em si continua de pé, como nos stories.
  const rotateClockwise = () => {
    const image = imageRef.current;
    if (!image) return;
    const next = (rotation + 90) % 360;
    const from = canvasSize;
    const to = fitEditorCanvas(image.naturalWidth, image.naturalHeight, next, ...editorBox());
    const scale = quarterTurnScale(from, to);

    setElements((prev) =>
      prev.map((el) => {
        if (el.type === "line") {
          const points = [];
          for (let i = 0; i < el.points.length; i += 2) {
            const p = rotatePointClockwise(el.points[i], el.points[i + 1], from, to);
            points.push(p.x, p.y);
          }
          return { ...el, points, size: Math.max(1, el.size * scale) };
        }
        if (el.type === "text") {
          const before = measureText(el);
          const center = rotatePointClockwise(
            el.x + before.width / 2,
            el.y + (before.descent - before.ascent) / 2,
            from,
            to,
          );
          const resized = { ...el, fontSize: Math.round(clamp(el.fontSize * scale, MIN_TEXT, MAX_TEXT)) };
          const after = measureText(resized);
          // Girar não deve empurrar o texto para fora da foto: se ele cabe
          // inteiro no quadro novo, fica inteiro dentro.
          let x = center.x - after.width / 2;
          let y = center.y - (after.descent - after.ascent) / 2;
          if (after.width <= to.width) x = clamp(x, 0, to.width - after.width);
          if (after.ascent + after.descent <= to.height) y = clamp(y, after.ascent, to.height - after.descent);
          return { ...resized, ...clampTextPosition(resized, x, y, to.width, to.height) };
        }
        return el;
      }),
    );
    setRotation(next);
    setCanvasSize(to);
  };

  // Carrega a imagem e dimensiona o canvas para caber na tela.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (!canvasRef.current) return;
      imageRef.current = img;
      setRotation(0);
      setCanvasSize(fitEditorCanvas(img.naturalWidth, img.naturalHeight, 0, ...editorBox()));
      setImageReady(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (imageReady) renderCanvas();
    // renderCanvas lê exatamente estes estados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageReady, elements, filter, rotation, canvasSize]);

  const updateText = (id, updates) => {
    setElements((prev) =>
      prev.map((el) => {
        if (el.id !== id) return el;
        const next = { ...el, ...updates };
        if (!("x" in updates) && !("y" in updates)) {
          // Mudou tamanho, fonte ou texto: cresce em volta do centro (como a
          // pinça dos stories), não a partir do canto esquerdo da linha de base.
          const before = measureText(el);
          const after = measureText(next);
          const centerX = el.x + before.width / 2;
          const centerY = el.y + (before.descent - before.ascent) / 2;
          next.x = centerX - after.width / 2;
          next.y = centerY - (after.descent - after.ascent) / 2;
        }
        // O texto pode ter crescido para fora da foto.
        return { ...next, ...clampTextPosition(next, next.x, next.y, canvasSize.width, canvasSize.height) };
      }),
    );
  };

  const deleteText = (id) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    setSelectedId(null);
  };

  const addText = () => {
    const text = textInput.trim();
    if (!text) return;
    const base = { ...draftStyle, id: Date.now(), type: "text", text };
    const box = measureText(base);
    // Nasce no centro; daí o usuário arrasta.
    const pos = clampTextPosition(
      base,
      (canvasSize.width - box.width) / 2,
      canvasSize.height / 2 + (box.ascent - box.descent) / 2,
      canvasSize.width,
      canvasSize.height,
    );
    setElements((prev) => [...prev, { ...base, ...pos }]);
    setTextInput("");
    setSelectedId(base.id);
    setTool(null);
  };

  // Converte coordenadas da tela para pixels do canvas (o CSS pode encolhê-lo).
  const toCanvasPoint = (clientX, clientY) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const capture = (target, pointerId) => {
    if (target?.setPointerCapture && pointerId !== undefined) {
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Ponteiro já liberado (toque cancelado pelo sistema); segue sem captura.
      }
    }
  };

  const handlePointerDown = (e) => {
    if (tool === "draw") {
      // Segura o ponteiro: o traço continua mesmo se o dedo sair do canvas.
      capture(e.currentTarget, e.pointerId);
      const p = toCanvasPoint(e.clientX, e.clientY);
      lineRef.current = [p.x, p.y];
      gestureRef.current = { mode: "draw" };
      return;
    }

    const pointers = pointersRef.current;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Todo dedo fica preso ao palco: o pointerup chega mesmo fora da foto, e
    // o mapa de ponteiros nunca fica com um dedo "fantasma".
    capture(e.currentTarget, e.pointerId);

    if (pointers.size === 1) {
      const hit = e.target.closest?.("[data-text-id]");
      const hitEl = hit ? elements.find((el) => String(el.id) === hit.dataset.textId) : null;
      if (hitEl) {
        setSelectedId(hitEl.id);
        const p = toCanvasPoint(e.clientX, e.clientY);
        gestureRef.current = { mode: "drag", id: hitEl.id, startX: p.x, startY: p.y, elX: hitEl.x, elY: hitEl.y };
      } else {
        // Toque no vazio: só desseleciona se não virar pinça.
        gestureRef.current = { mode: "tap-empty" };
      }
    } else if (pointers.size === 2) {
      const target = elements.find((el) => el.id === (gestureRef.current?.id ?? selectedId) && el.type === "text");
      if (target) {
        const [a, b] = [...pointers.values()];
        gestureRef.current = {
          mode: "pinch",
          id: target.id,
          startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          startSize: target.fontSize,
        };
      } else {
        gestureRef.current = null;
      }
    }
  };

  const handlePointerMove = (e) => {
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.mode === "draw") {
      const p = toCanvasPoint(e.clientX, e.clientY);
      lineRef.current = [...lineRef.current, p.x, p.y];
      renderCanvas(lineRef.current);
      return;
    }

    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (gesture.mode === "pinch" && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const size = Math.round(clamp((gesture.startSize * dist) / gesture.startDist, MIN_TEXT, MAX_TEXT));
      updateText(gesture.id, { fontSize: size });
    } else if (gesture.mode === "drag") {
      const p = toCanvasPoint(e.clientX, e.clientY);
      const el = elements.find((item) => item.id === gesture.id);
      if (!el) return;
      const pos = clampTextPosition(
        el,
        gesture.elX + (p.x - gesture.startX),
        gesture.elY + (p.y - gesture.startY),
        canvasSize.width,
        canvasSize.height,
      );
      setElements((prev) => prev.map((item) => (item.id === gesture.id ? { ...item, ...pos } : item)));
    }
  };

  const handlePointerUp = (e) => {
    const gesture = gestureRef.current;

    if (gesture?.mode === "draw") {
      if (lineRef.current.length > 0) {
        const points = lineRef.current;
        setElements((prev) => [...prev, { type: "line", points, color: brushColor, size: brushSize }]);
      }
      lineRef.current = [];
      gestureRef.current = null;
      return;
    }

    const pointers = pointersRef.current;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (gesture?.mode === "tap-empty" && e.type === "pointerup") setSelectedId(null);
      gestureRef.current = null;
    } else if (gesture?.mode === "pinch") {
      // Sobrou um dedo: não vira arrasto de repente; espera soltar.
      gestureRef.current = { mode: "idle" };
    }
  };

  const handleTextKeyDown = (e, el) => {
    const step = e.shiftKey ? 10 : 2;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      updateText(el.id, { x: el.x + dx, y: el.y + dy });
      setSelectedId(el.id);
    } else if (e.key === "Delete") {
      e.preventDefault();
      deleteText(el.id);
    } else if (e.key === "Escape") {
      setSelectedId(null);
    }
  };

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/jpeg", 0.8));
  };

  const toolButton = (name, Icon, label) => (
    <button
      type="button"
      onClick={() => {
        setTool(tool === name ? null : name);
        setSelectedId(null);
      }}
      aria-pressed={tool === name}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition ${
        tool === name ? "bg-[var(--engine-accent)] text-white" : "bg-white/10 text-white hover:bg-white/20"
      }`}
      title={label}
      aria-label={label}
    >
      <Icon size={18} />
    </button>
  );

  // O palco só toma o gesto para si quando há o que arrastar ou desenhar;
  // fora disso o dedo rola a tela normalmente.
  const stageCapturesTouch = tool === "draw" || textElements.length > 0;

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Toolbar Header */}
      <div className="shrink-0 border-b border-white/10 bg-black/50 p-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {toolButton("draw", Pen, t("imageEditor.draw"))}
            {toolButton("text", Type, t("imageEditor.text"))}
            {toolButton("filters", Palette, t("imageEditor.filters"))}
            <button
              type="button"
              onClick={rotateClockwise}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
              title={t("imageEditor.rotate")}
              aria-label={t("imageEditor.rotate")}
            >
              <RotateCw size={18} />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportImage}
              className="min-h-11 rounded-lg bg-[var(--engine-accent)] px-4 py-2 text-xs font-bold text-white transition hover:brightness-95"
            >
              {t("imageEditor.save")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
              title={t("imageEditor.close")}
              aria-label={t("imageEditor.close")}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Palco: canvas + camadas de toque dos textos */}
      <div className="flex-1 overflow-hidden overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className={`relative select-none ${stageCapturesTouch ? "touch-none" : ""} ${tool === "draw" ? "cursor-crosshair" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <canvas ref={canvasRef} className="block max-h-full max-w-full rounded-lg bg-white" />

            {tool !== "draw" &&
              textElements.map((el) => {
                const box = measureText(el);
                const isSelected = el.id === selectedId;
                return (
                  <div
                    key={el.id}
                    data-text-id={String(el.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={t("imageEditor.textLayer", { text: el.text })}
                    aria-pressed={isSelected}
                    onFocus={() => setSelectedId(el.id)}
                    onKeyDown={(e) => handleTextKeyDown(e, el)}
                    className={`absolute touch-none cursor-grab rounded-md border-2 border-dashed outline-none transition-colors active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--engine-accent)] ${
                      isSelected ? "border-white/90 ring-1 ring-black/50" : "border-transparent hover:border-white/40"
                    }`}
                    style={{
                      left: `${((el.x - HIT_PAD) / canvasSize.width) * 100}%`,
                      top: `${((el.y - box.ascent - HIT_PAD) / canvasSize.height) * 100}%`,
                      width: `${((box.width + HIT_PAD * 2) / canvasSize.width) * 100}%`,
                      height: `${((box.ascent + box.descent + HIT_PAD * 2) / canvasSize.height) * 100}%`,
                    }}
                  />
                );
              })}
          </div>
        </div>
      </div>

      {/* Desenho */}
      {tool === "draw" && (
        <div className="shrink-0 border-t border-white/10 bg-black/50 p-3 backdrop-blur-sm">
          <label className="mx-auto flex w-full max-w-xl items-center gap-3">
            <span className="shrink-0 text-xs font-semibold text-white">{t("imageEditor.brushSize")}</span>
            <input
              type="range"
              min="1"
              max="20"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer accent-[var(--engine-accent)]"
            />
            <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-white/70">{brushSize}px</span>
            <ColorDot value={brushColor} onChange={setBrushColor} label={t("imageEditor.brushColor")} />
          </label>
        </div>
      )}

      {/* Texto novo */}
      {tool === "text" && !selected && (
        <div className="max-h-[45vh] shrink-0 overflow-y-auto border-t border-white/10 bg-black/50 p-3 backdrop-blur-sm">
          <form
            className="mx-auto grid w-full max-w-xl gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              addText();
            }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={t("imageEditor.textPlaceholder")}
                aria-label={t("imageEditor.textPlaceholder")}
                enterKeyHint="done"
                className="h-11 min-w-0 flex-1 rounded-lg bg-white/10 px-3 text-base text-white placeholder-white/50 outline-none focus:bg-white/20"
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                className="h-11 shrink-0 rounded-lg bg-[var(--engine-accent)] px-4 text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-50"
              >
                {t("imageEditor.addText")}
              </button>
            </div>
            <TextStyleControls value={draftStyle} onChange={(u) => setDraftStyle((prev) => ({ ...prev, ...u }))} />
          </form>
        </div>
      )}

      {/* Texto selecionado */}
      {selected && (
        <div className="max-h-[45vh] shrink-0 overflow-y-auto border-t border-white/10 bg-black/50 p-3 backdrop-blur-sm">
          <div className="mx-auto grid w-full max-w-xl gap-3">
            <p className="text-xs text-white/60">{t("imageEditor.dragHint")}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={selected.text}
                onChange={(e) => updateText(selected.id, { text: e.target.value })}
                aria-label={t("imageEditor.text")}
                className="h-11 min-w-0 flex-1 rounded-lg bg-white/10 px-3 text-base text-white placeholder-white/50 outline-none focus:bg-white/20"
              />
              <button
                type="button"
                onClick={() => deleteText(selected.id)}
                title={t("imageEditor.deleteText")}
                aria-label={t("imageEditor.deleteText")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-400 transition hover:bg-red-500/30"
              >
                <Trash2 size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selected.text.trim()) deleteText(selected.id);
                  else setSelectedId(null);
                }}
                className="h-11 shrink-0 rounded-lg bg-[var(--engine-accent)] px-4 text-xs font-bold text-white transition hover:brightness-95"
              >
                {t("imageEditor.done")}
              </button>
            </div>
            <TextStyleControls value={selected} onChange={(u) => updateText(selected.id, u)} />
          </div>
        </div>
      )}

      {/* Filtros */}
      {tool === "filters" && (
        <div className="shrink-0 border-t border-white/10 bg-black/50 p-3 backdrop-blur-sm">
          <div className="flex gap-2 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => setFilter(f.name)}
                aria-pressed={filter === f.name}
                className={`min-h-11 shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  filter === f.name ? "bg-[var(--engine-accent)] text-white" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {t(`imageEditor.filterNames.${f.name}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
