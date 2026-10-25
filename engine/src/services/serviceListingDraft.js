/**
 * Rascunho do anúncio novo, guardado no aparelho enquanto a pessoa preenche.
 *
 * Fechou o formulário sem querer, a sessão caiu, o 4G sumiu no envio: na
 * próxima vez que abrir "Cadastrar", o que ela escreveu volta. É por conta
 * (o uid vai junto), para um celular emprestado não mostrar o rascunho de
 * outra pessoa, e vence em 30 dias.
 *
 * Storage pode não existir ou estourar (modo privado, cota cheia, webview do
 * Instagram): tudo aqui é try/catch e falha em silêncio — rascunho é ajuda,
 * nunca pode impedir de publicar.
 */

const KEY = "engine_service_listing_draft";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const hasContent = (form) =>
  Boolean(
    String(form?.title || "").trim() ||
      String(form?.description || "").trim() ||
      String(form?.whatsapp || "").trim() ||
      (form?.photos || []).length,
  );

export function readListingDraft(uid) {
  if (!uid) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || saved.uid !== uid || !saved.form || typeof saved.form !== "object") return null;
    if (Date.now() - Number(saved.savedAt || 0) > MAX_AGE_MS) return null;
    return hasContent(saved.form) ? saved.form : null;
  } catch {
    return null;
  }
}

export function writeListingDraft(uid, form) {
  if (!uid) return;
  try {
    // Foto em data URL (base64) não cabe no storage nem deve ir para ele;
    // só as URLs que já subiram.
    const clean = {
      ...form,
      id: "",
      photos: (form?.photos || []).filter((photo) => /^https?:\/\//.test(String(photo))),
    };
    if (!hasContent(clean)) {
      window.localStorage.removeItem(KEY);
      return;
    }
    window.localStorage.setItem(KEY, JSON.stringify({ uid, savedAt: Date.now(), form: clean }));
  } catch {
    // Sem storage: segue sem rascunho.
  }
}

export function clearListingDraft() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // idem
  }
}
