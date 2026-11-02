import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserMinus } from "lucide-react";
import { fetchMentionCards, mentionKey, parseBio, removeMention } from "../../services/mentions";
import { supabase } from "../../services/supabase";
import { useConfirm } from "../ConfirmProvider";
import { useToast } from "../ToastProvider";
import { MentionKindIcon } from "./MentionKindIcon";

/**
 * A bio com as menções em chip (foto + ícone do tipo + nome atual). Marcador
 * sem menção ativa no banco — alvo apagado, bloqueado, ou que se tirou da
 * bio — some do texto em vez de virar `@[person:…]` cru.
 *
 * Quem foi mencionado vê, no próprio chip, "tirar minha menção". No clube,
 * quem edita o clube responde por ele.
 */
export function BioWithMentions({ text, ownerId, viewerId = "" }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const showToast = useToast();
  const parts = parseBio(text);
  const hasMentions = parts.some((part) => part.type === "mention");
  const [cards, setCards] = useState({});
  const [leadClubs, setLeadClubs] = useState(new Set());

  const [version, setVersion] = useState(0);
  const load = () => setVersion((value) => value + 1);

  useEffect(() => {
    if (!hasMentions || !ownerId) return undefined;
    let alive = true;
    fetchMentionCards(ownerId).then((result) => alive && setCards(result));
    return () => {
      alive = false;
    };
  }, [hasMentions, ownerId, text, version]);

  // Clubes mencionados em que EU edito o clube: só para mostrar o botão (o
  // banco confere de novo no remove_mention).
  useEffect(() => {
    const clubIds = Object.values(cards).filter((card) => card.kind === "club").map((card) => card.id);
    if (!viewerId || !clubIds.length) return undefined;
    let alive = true;
    (async () => {
      const mine = await supabase.from("club_members").select("club_id, role_id").eq("uid", viewerId).in("club_id", clubIds);
      if (mine.error || !mine.data?.length) return;
      const roles = await supabase
        .from("club_roles")
        .select("club_id, id, permissions")
        .in("club_id", mine.data.map((row) => row.club_id));
      if (roles.error || !alive) return;
      const can = new Set();
      for (const row of mine.data) {
        const role = roles.data.find((r) => r.club_id === row.club_id && r.id === row.role_id);
        if (row.role_id === "founder" || role?.permissions?.includes("edit_club")) can.add(row.club_id);
      }
      setLeadClubs(can);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [cards, viewerId]);

  if (!String(text || "").trim()) return null;

  const canRemove = (card) =>
    viewerId &&
    viewerId !== ownerId &&
    ((card.kind === "person" && card.id === viewerId) || (card.kind === "club" && leadClubs.has(card.id)));

  const handleRemove = async (card) => {
    const ok = await confirm({
      title: t("mentions.removeTitle"),
      message: card.kind === "club" ? t("mentions.removeClubMessage", { name: card.name }) : t("mentions.removeMessage"),
      confirmLabel: t("mentions.remove"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await removeMention(ownerId, card.kind, card.id);
      showToast(t("mentions.removed"), "success");
      load();
    } catch {
      showToast(t("mentions.removeError"), "error");
    }
  };

  return (
    <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-[var(--engine-text)]">
      {parts.map((part, index) => {
        if (part.type === "text") return <span key={index}>{part.value}</span>;
        const card = cards[mentionKey(part)];
        if (!card) return null;
        return (
          <span key={index} className="mx-0.5 inline-flex max-w-full items-center gap-0.5 align-middle">
            <Link
              to={card.path || "/"}
              className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface-2)] py-0.5 pl-0.5 pr-2.5 text-[12.5px] font-semibold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)]"
            >
              <MentionKindIcon kind={card.kind} avatar={card.avatar} logo={card.kind === "club" ? card.logo : ""} size={20} />
              <span className="truncate">{card.kind === "person" ? card.label : card.name}</span>
            </Link>
            {canRemove(card) ? (
              <button
                type="button"
                onClick={() => handleRemove(card)}
                title={t("mentions.remove")}
                aria-label={t("mentions.remove")}
                className="grid h-7 w-7 place-items-center rounded-full text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)]"
              >
                <UserMinus size={13} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        );
      })}
    </p>
  );
}
