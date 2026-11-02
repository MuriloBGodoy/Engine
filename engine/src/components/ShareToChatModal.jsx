import { ShareSheet } from "./social/ShareSheet";
import { shareUrls } from "../services/shareLinks";

/**
 * "Enviar" do post (o aviãozinho). Desde 02/11/2026 é a folha de
 * compartilhar inteira: em cima, mandar na DM do Engine (o post vai como
 * anexo, como antes); embaixo, levar para fora (WhatsApp, X, copiar link...).
 * A assinatura continua a mesma para as telas que já usavam este modal.
 */
export function ShareToChatModal({ open, goal, user, settings, onClose }) {
  const title = goal
    ? goal.title || String(goal.note || "").replace(/\s+/g, " ").trim().slice(0, 80) || goal.author || "Engine"
    : "";
  return (
    <ShareSheet
      open={Boolean(open && goal)}
      payload={goal ? { url: shareUrls.post(goal.id), title, text: title, goal, kind: "post" } : null}
      user={user}
      settings={settings}
      onClose={onClose}
    />
  );
}
