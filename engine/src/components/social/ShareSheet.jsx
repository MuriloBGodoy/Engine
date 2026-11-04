import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Copy, Mail, Search, Send, Share2, X } from "lucide-react";
import {
  attachmentFromGoal,
  attachmentFromShare,
  conversationPartner,
  profileCardFromSettings,
  sendMessage,
  startConversation,
  subscribeConversations,
} from "../../services/chat";
import { copyText } from "../../services/serviceListingPublic";
import { canNativeShare, shareTargets, subscribeShareSheet, withShareRef } from "../../services/shareLinks";
import { trackEvent } from "../../services/observability";
import { ChatAvatar } from "../ChatAvatar";
import { useToast } from "../ToastProvider";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { useProfileSearch } from "../../hooks/useProfileSearch";
import { useRequireAccount } from "../../hooks/useRequireAccount";
import "../../services/i18n-social-posts";

const matches = (person, term) =>
  `${person.author || ""} ${person.username || ""}`.toLowerCase().includes(term);

// Marcas sem ícone no lucide: a letra/forma em texto, sem imagem externa.
const Glyph = ({ children }) => (
  <span aria-hidden="true" className="text-[15px] font-black leading-none">
    {children}
  </span>
);

/**
 * Folha de compartilhar: em cima, mandar para alguém DENTRO do Engine (DM);
 * embaixo, levar para fora — menu nativo do aparelho (celular), WhatsApp,
 * Telegram, X, Facebook, e-mail e "copiar link" (que é também o caminho do
 * Instagram, que não aceita link pela web).
 *
 * O link sai sempre com `?ref=share` (sem dado da pessoa) e é o endereço
 * público, que abre para visitante.
 */
export function ShareSheet({ open, payload, user, settings, onClose }) {
  const { t } = useTranslation();
  const toast = useToast();
  const requireAccount = useRequireAccount(user);
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [sentTo, setSentTo] = useState([]);
  const [sendingTo, setSendingTo] = useState("");
  const userId = user?.uid || "";
  const visible = Boolean(open && payload?.url);

  useHistoryDismiss(visible, onClose);

  useEffect(() => {
    if (!visible || !userId) return undefined;
    // Compartilhar é coisa de amigo: fios de serviço ficam de fora.
    return subscribeConversations(userId, (list) =>
      setConversations(list.filter((conversation) => conversation.kind !== "service")),
    );
  }, [visible, userId]);

  const term = search.trim().toLowerCase();
  const foundProfiles = useProfileSearch(term, { enabled: visible && Boolean(userId), max: 12 });

  const contacts = useMemo(() => {
    const seen = new Set();
    const list = [];
    conversations.forEach((conversation) => {
      const partner = conversationPartner(conversation, userId);
      if (!partner.userId || partner.deleted || seen.has(partner.userId)) return;
      seen.add(partner.userId);
      list.push(partner);
    });
    foundProfiles.forEach((profile) => {
      const id = profile.userId || profile.id;
      if (!id || id === userId || seen.has(id)) return;
      seen.add(id);
      list.push({ userId: id, author: profile.author, username: profile.username, avatar: profile.avatar, avatarInitials: profile.avatarInitials });
    });
    return term ? list.filter((person) => matches(person, term)) : list;
  }, [conversations, foundProfiles, term, userId]);

  if (!visible) return null;

  const url = withShareRef(payload.url);
  const title = payload.title || "Engine";
  const text = payload.text || title;
  const kind = payload.kind || (payload.goal ? "post" : "link");
  const targets = shareTargets({ url, text, title });
  const track = (channel) => trackEvent("conteudo_compartilhado", { kind, channel });

  const sendInside = async (person) => {
    if (sendingTo || sentTo.includes(person.userId)) return;
    setSendingTo(person.userId);
    try {
      const conversationId = await startConversation(profileCardFromSettings(settings, user), person);
      // Tudo viaja como cartão: post pelo anexo de sempre, o resto pelo
      // anexo genérico. Mandar o endereço cru no texto deixava o id do
      // clube à mostra e o balão ilegível.
      await sendMessage(conversationId, {
        senderId: userId,
        text: note.trim(),
        attachment: payload.goal
          ? attachmentFromGoal(payload.goal)
          : attachmentFromShare({ ...payload, title }),
      });
      setSentTo((current) => [...current, person.userId]);
      track("engine_dm");
    } catch (error) {
      console.error(error);
      toast(t("messages.sendError"), "error");
    } finally {
      setSendingTo("");
    }
  };

  const copy = async () => {
    const ok = await copyText(url);
    track("copy");
    toast(ok ? t("socialPosts.share.copied") : t("services.share.copyFailed", { url }), ok ? undefined : "error");
  };

  const native = async () => {
    try {
      await navigator.share({ url, title, text });
      track("native");
      onClose();
    } catch (error) {
      if (error?.name !== "AbortError") copy();
    }
  };

  const external = [
    { id: "whatsapp", label: "WhatsApp", href: targets.whatsapp, icon: <Glyph>W</Glyph>, tone: "bg-[#25D366] text-white" },
    { id: "telegram", label: "Telegram", href: targets.telegram, icon: <Send size={17} />, tone: "bg-[#229ED9] text-white" },
    { id: "x", label: "X", href: targets.x, icon: <Glyph>𝕏</Glyph>, tone: "bg-black text-white dark:bg-white dark:text-black" },
    { id: "facebook", label: "Facebook", href: targets.facebook, icon: <Glyph>f</Glyph>, tone: "bg-[#1877F2] text-white" },
    { id: "email", label: t("socialPosts.share.email"), href: targets.email, icon: <Mail size={17} />, tone: "bg-[var(--engine-surface-2)] text-[var(--engine-text)]" },
  ];
  const round = "flex h-12 w-12 items-center justify-center rounded-full";
  const tile = "flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 text-center text-[11px] font-semibold text-[var(--engine-text-muted)]";

  return createPortal(
    <div onClick={(event) => event.stopPropagation()}>
      <div className="engine-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <section role="dialog" aria-modal="true" aria-label={t("socialPosts.share.title")} className="engine-drawer engine-safe-bottom">
        <span aria-hidden="true" className="mx-auto mt-2 block h-1 w-10 shrink-0 rounded-full bg-[var(--engine-border-strong)] sm:hidden" />
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--engine-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold text-[var(--engine-text)]">{t("socialPosts.share.title")}</h2>
            <p className="truncate text-xs text-[var(--engine-text-subtle)]">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)]"
          >
            <X size={20} />
          </button>
        </header>

        <div className="engine-scroll min-h-0 flex-1 overflow-y-auto">
          {/* Dentro do Engine */}
          <div className="border-b border-[var(--engine-border)] px-4 py-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-text-subtle)]">
              {t("socialPosts.share.inside")}
            </p>
            {userId ? (
              <>
                <label className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--engine-text-subtle)]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("messages.searchPlaceholder")}
                    className="h-10 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] pl-9 pr-3 text-sm text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)]"
                  />
                </label>
                <div className="engine-scroll-x -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
                  {contacts.slice(0, 20).map((person) => {
                    const sent = sentTo.includes(person.userId);
                    return (
                      <button
                        key={person.userId}
                        type="button"
                        onClick={() => sendInside(person)}
                        disabled={sent || sendingTo === person.userId}
                        aria-label={`${t("messages.sendTo")} ${person.author}`}
                        className={tile}
                      >
                        <span className="relative">
                          <ChatAvatar person={person} />
                          {sent && (
                            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--engine-accent)] text-white">
                              <Check size={12} />
                            </span>
                          )}
                        </span>
                        <span className="w-full truncate">{sent ? t("messages.sent") : person.author}</span>
                      </button>
                    );
                  })}
                  {!contacts.length && (
                    <p className="py-3 text-xs text-[var(--engine-text-muted)]">{t("messages.noResults")}</p>
                  )}
                </div>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t("messages.optionalNote")}
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-sm text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)]"
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => requireAccount(window.location.pathname + window.location.search)}
                className="min-h-11 text-sm font-bold text-[var(--engine-accent)] hover:underline"
              >
                {t("socialPosts.share.signInToSend")}
              </button>
            )}
          </div>

          {/* Fora do Engine */}
          <div className="px-4 py-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-text-subtle)]">
              {t("socialPosts.share.outside")}
            </p>
            <div className="engine-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {canNativeShare() && (
                <button type="button" onClick={native} className={tile}>
                  <span className={`${round} bg-[var(--engine-accent)] text-white`}>
                    <Share2 size={18} />
                  </span>
                  {t("socialPosts.share.more")}
                </button>
              )}
              <button type="button" onClick={copy} className={tile}>
                <span className={`${round} bg-[var(--engine-surface-2)] text-[var(--engine-text)]`}>
                  <Copy size={17} />
                </span>
                {t("socialPosts.share.copy")}
              </button>
              {external.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track(item.id)}
                  className={tile}
                >
                  <span className={`${round} ${item.tone}`}>{item.icon}</span>
                  {item.label}
                </a>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--engine-text-subtle)]">
              {t("socialPosts.share.instagramHint")}
            </p>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/**
 * A folha única do app: ouve `openShareSheet(...)` (services/shareLinks.js)
 * de qualquer tela. Montada uma vez no App, onde usuário e configurações já
 * estão à mão.
 */
export function ShareSheetHost({ user, settings }) {
  const [payload, setPayload] = useState(null);
  useEffect(() => subscribeShareSheet((next) => setPayload({ ...next, at: Date.now() })), []);
  return (
    <ShareSheet
      key={payload?.at || 0}
      open={Boolean(payload)}
      payload={payload}
      user={user}
      settings={settings}
      onClose={() => setPayload(null)}
    />
  );
}
