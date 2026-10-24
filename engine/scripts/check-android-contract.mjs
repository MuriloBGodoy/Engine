/**
 * Guarda do que foi consertado para Android em 16/09/2026. Irmã da
 * `check-mobile-contract.mjs` e da `check-ios-contract.mjs`: não é teste de
 * layout, é uma trava contra as regressões que já aconteceram uma vez, cada
 * uma com o defeito medido que a criou (Playwright Chromium, matriz
 * 360×740 / 320×568 / 412×915 / Fold 673×841 / tablet 800×1280).
 *
 *   node scripts/check-android-contract.mjs
 *
 * O Chromium do Playwright não tem gesto de voltar nem teclado de verdade; o
 * gesto foi medido com `history.back()` e o teclado com o viewport cortado a
 * 55%. O que só um Android físico confirma está no relatório da auditoria.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FALHA ${name}${detail ? `\n         ${detail}` : ""}`);
  }
};

console.log("\ncontrato do Android\n");

// 1. Todo overlay fecha pelo gesto de voltar. Em 13/09/2026, 14 de 14
//    overlays saíam da tela (no PWA/TWA, do app) ao voltar: nenhum tinha
//    entrada própria no histórico. O hook é a única forma sancionada de
//    fazer isso — um `popstate` solto por componente reabre o bug do contador
//    órfão que engolia o voltar seguinte.
const OVERLAYS = [
  "src/components/ExpensesModal.jsx",
  "src/components/ContributionModal.jsx",
  "src/components/CreateFeedPostModal.jsx",
  "src/components/ShareToChatModal.jsx",
  "src/components/DeleteModal.jsx",
  "src/components/EditProfileModal.jsx",
  "src/components/ModalNewCar.jsx",
  "src/components/ImageCropper.jsx",
  "src/components/ImagePreviewModal.jsx",
  "src/components/NotificationsPanel.jsx",
  "src/components/RegionPicker.jsx",
  "src/components/ConfirmProvider.jsx",
  // Da Jesse, ligado por ela em 16/09/2026 na variante B; fica na trava
  // porque é o overlay mais usado do app.
  "src/components/OwnershipModal.jsx",
];
const missingHook = OVERLAYS.filter((f) => !/useHistoryDismiss\(/.test(read(f)));
check(
  "todo overlay chama useHistoryDismiss()",
  missingHook.length === 0,
  missingHook.join(", "),
);

const hook = read("src/hooks/useHistoryDismiss.js");
check(
  "o hook empurra a entrada na MESMA URL e preserva o estado do router",
  /pushState\(\s*\{\s*\.\.\.\(base/.test(hook) && /window\.location\.href/.test(hook),
  "sem espalhar history.state o React Router perde usr/key/idx e registra rota a mais",
);
check(
  "o hook desfaz a entrada ao fechar pelo X (senão o próximo voltar é fantasma)",
  /window\.history\.back\(\)/.test(hook) && /selfBacksPending/.test(hook),
);
check(
  "o hook só desfaz a entrada se ela ainda é o topo (navegação por cima é da pessoa)",
  /readToken\(window\.history\.state\)\s*!==\s*token\)\s*return/.test(hook),
);
check(
  "o hook adia o back() de limpeza um tique (StrictMode remonta o efeito na hora)",
  /setTimeout\(undoAbandonedEntry/.test(hook),
);
check(
  "um ouvinte de popstate só, no módulo, não um por overlay",
  (hook.match(/addEventListener\("popstate"/g) || []).length === 1,
);

// 2. A prévia de foto tem dois níveis: voltar dentro do editor volta à
//    prévia, não cancela a foto. Precisa de duas entradas.
const preview = read("src/components/ImagePreviewModal.jsx");
check(
  "ImagePreviewModal empilha prévia e editor como dois níveis de voltar",
  (preview.match(/useHistoryDismiss\(/g) || []).length === 2,
);

// 3. Toast não é overlay: voltar não pode gastá-lo. (E o ouvinte global do
//    hook não deve ser importado lá por engano.)
check(
  "ToastProvider não captura o gesto de voltar",
  !/useHistoryDismiss/.test(read("src/components/ToastProvider.jsx")),
);

// 4. Corpo dos modais de tela cheia. Com `max-h-[72vh]` dentro de um painel
//    de 100dvh o rolável parava a 72% da tela e sobravam ~200px vazios
//    embaixo (medido: gap de 207px no 360×740, 13/09/2026); o formulário só
//    aparecia rolando dentro da faixa. `engine-modal-body` ocupa o resto.
for (const file of [
  "src/components/ExpensesModal.jsx",
  "src/components/ContributionModal.jsx",
  "src/components/CreateFeedPostModal.jsx",
]) {
  const src = read(file);
  check(
    `${path.basename(file)} usa engine-modal-body, não max-h-[NNvh]`,
    // Só em className: o comentário que explica o conserto cita o valor antigo.
    /engine-modal-body/.test(src) && !/className="[^"]*max-h-\[\d+vh\]/.test(src),
  );
}

// 5. Desenho com o dedo. O editor de foto ouvia só onMouse*: no Android o
//    toque vira um clique emulado no fim, sem movimento, e arrastar rolava a
//    página — 0 pixels de traço com toque real via CDP (13/09/2026). Pointer
//    events + touch-action: none no canvas enquanto há ferramenta ativa.
const editor = read("src/components/ImageEditor.jsx");
check(
  "ImageEditor desenha por pointer events, não por mouse events",
  /onPointerDown=/.test(editor) && /onPointerMove=/.test(editor) && !/onMouseDown=/.test(editor),
);
check(
  "o canvas do editor tem touch-none com ferramenta ativa (senão o dedo rola a página)",
  /touch-none/.test(editor),
);
check(
  "o editor segura o ponteiro (setPointerCapture) para o traço não morrer na borda",
  /setPointerCapture/.test(editor),
);

// 6. Alvos de toque no cabeçalho dos modais: o X media 36×36 (h-9 w-9) em
//    Expenses/Contribution/FeedPost/Paywall e 40×40 nos demais. Material pede
//    48, HIG 44; 44 com margem negativa mantém o lugar visual.
const smallClose = OVERLAYS.filter((f) => /h-(9|10) w-(9|10)[^"`]*(rounded-xl|rounded-lg)[^"`]*text-\[var\(--engine-text-(muted|subtle)\)\]/.test(read(f)));
check(
  "nenhum X de fechar modal abaixo de 44px",
  smallClose.length === 0,
  smallClose.join(", "),
);

// 7. Lixeira dos lançamentos: o alvo era o ícone nu de 15×15.
for (const file of ["src/components/ExpensesModal.jsx", "src/components/ContributionModal.jsx"]) {
  const src = read(file);
  const trash = src.slice(src.indexOf("<Trash2") - 600, src.indexOf("<Trash2"));
  check(`${path.basename(file)}: a lixeira tem alvo de 44px`, /h-11 w-11/.test(trash));
}

// 8. Strings do fluxo de foto passam pelo i18n nos 3 idiomas. Estavam
//    cravadas em português no ImagePreviewModal e nos `title` do editor.
const i18n = read("src/services/i18n.js");
for (const key of ["imagePreview", "imageEditor"]) {
  check(
    `i18n tem o bloco ${key} nos 3 idiomas`,
    (i18n.match(new RegExp(`^\\s+${key}: \\{`, "gm")) || []).length === 3,
  );
}
check(
  "ImagePreviewModal não tem texto cravado",
  !/"(Voltar|Editar foto|Foto|Fechar|Cancelar|Enviar)"/.test(preview) && !/>\s*(Cancelar|Enviar|Foto)\s*</.test(preview),
);
check(
  "common.close existe nos 3 idiomas (o X do toast usava aria-label cravado)",
  (i18n.match(/^\s+close: "(Fechar|Close|Cerrar)",\s*$/gm) || []).length >= 3 &&
    /t\("common\.close"\)/.test(read("src/components/ToastProvider.jsx")),
);

console.log(failures === 0 ? "\ntudo verde\n" : `\n${failures} falha(s)\n`);
process.exit(failures === 0 ? 0 : 1);
