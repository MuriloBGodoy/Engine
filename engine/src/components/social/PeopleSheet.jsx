import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, UserMinus, X } from "lucide-react";
import { PostMenu } from "./PostMenu";
import { getInitials, withoutAt } from "../../services/people";

/**
 * Seguidores e seguindo — a folha que abre pelo contador do perfil.
 *
 * Até 06/11/2026 as duas listas eram abas do perfil, ao lado de
 * Publicações. Nenhuma rede faz assim, e não é moda: aba é para conteúdo
 * que a pessoa veio ver, e ninguém abre um perfil para ler uma lista de
 * nomes. O gesto que todo mundo já tem no dedo é tocar no NÚMERO.
 *
 * Tirar as duas da tira de abas é o que libera espaço para Garagem, que é
 * conteúdo de verdade.
 *
 * O que a folha tem, e por quê:
 *  - as duas listas numa folha só, trocando por aba interna: quem abre
 *    "seguidores" quase sempre quer comparar com "seguindo";
 *  - busca, que é o que torna a lista usável quando ela cresce;
 *  - seguir/deixar de seguir na própria linha, sem sair daqui;
 *  - no MEU perfil, "remover seguidor" (migration 20261106100000) — o gesto
 *    pequeno que faltava entre aguentar e bloquear.
 */

function PersonRow({
  person,
  currentUserId,
  isFollowing,
  onToggleFollow,
  onRemoveFollower,
  onOpen,
  t,
}) {
  const handle = withoutAt(person.username);
  const eu = person.userId === currentUserId;
  const podeAbrir = Boolean(handle);

  return (
    <li className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={() => podeAbrir && onOpen(handle)}
        disabled={!podeAbrir}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--engine-surface-2)] text-[11px] font-bold text-[var(--engine-text-muted)]">
          {person.avatar ? (
            <img src={person.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            person.avatarInitials || getInitials(person.author)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold text-[var(--engine-text)]">
            {person.author || t("peopleSheet.unknown")}
          </span>
          {handle ? (
            <span className="block truncate text-[12px] text-[var(--engine-text-muted)]">
              @{handle}
            </span>
          ) : null}
        </span>
      </button>

      {!eu && currentUserId ? (
        <button
          type="button"
          onClick={() => onToggleFollow(person.userId, !isFollowing)}
          className={`min-h-9 shrink-0 rounded-lg px-3 text-[12px] font-black uppercase tracking-wide transition ${
            isFollowing
              ? "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
              : "bg-[var(--engine-accent)] text-white hover:brightness-95"
          }`}
        >
          {isFollowing ? t("peopleSheet.following") : t("peopleSheet.follow")}
        </button>
      ) : null}

      {onRemoveFollower && !eu ? (
        <PostMenu
          label={t("peopleSheet.options")}
          items={[
            {
              label: t("peopleSheet.removeFollower"),
              icon: UserMinus,
              danger: true,
              onClick: () => onRemoveFollower(person.userId),
            },
          ]}
        />
      ) : null}
    </li>
  );
}

export function PeopleSheet({
  open,
  tab,
  onTab,
  onClose,
  followers = [],
  following = [],
  profiles = {},
  counts = {},
  currentUserId = "",
  myFollowing = null,
  onToggleFollow,
  onRemoveFollower,
  t,
}) {
  const [term, setTerm] = useState("");
  const navigate = useNavigate();

  // Cada abertura começa limpa: a busca da vez passada não é contexto.
  useEffect(() => {
    if (open) setTerm("");
  }, [open, tab]);

  // O voltar do aparelho fecha a folha em vez de sair do perfil (R8).
  useEffect(() => {
    if (!open) return undefined;
    const sair = () => onClose();
    window.history.pushState({ engineSheet: "people" }, "");
    window.addEventListener("popstate", sair);
    return () => {
      window.removeEventListener("popstate", sair);
      if (window.history.state?.engineSheet === "people") window.history.back();
    };
    // `onClose` é estável o bastante: trocar a função não deve remontar a
    // folha nem empilhar outra entrada no histórico.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A lista crua vira gente com nome e retrato ATUAIS: o cartão gravado no
  // vínculo é só a rede de segurança enquanto o perfil não chega (R24/R25).
  const pessoas = useMemo(() => {
    const crua =
      tab === "followers"
        ? followers.map((item) => ({ ...item, userId: item.userId || item.followerId }))
        : following.map((userId) => ({ userId }));
    const lista = crua.map((item) => {
      const vivo = profiles?.[item.userId] || {};
      return {
        userId: item.userId,
        author: vivo.author || item.author || "",
        username: vivo.username || item.username || "",
        avatar: vivo.avatar || item.avatar || "",
        avatarInitials: vivo.avatarInitials || item.avatarInitials || "",
      };
    });
    const busca = term.trim().toLowerCase();
    if (!busca) return lista;
    return lista.filter((pessoa) =>
      `${pessoa.author} ${pessoa.username}`.toLowerCase().includes(busca),
    );
  }, [tab, followers, following, profiles, term]);

  if (!open) return null;

  const abas = [
    { id: "followers", label: t("peopleSheet.followers"), count: counts.followers },
    { id: "following", label: t("peopleSheet.following"), count: counts.following },
  ];

  return createPortal(
    <div className="engine-modal-overlay" role="dialog" aria-modal="true">
      <div className="engine-modal-panel engine-pop sm:max-w-md">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--engine-border)] px-4 pt-4">
          <div className="flex gap-5">
            {abas.map((aba) => (
              <button
                key={aba.id}
                type="button"
                onClick={() => onTab(aba.id)}
                className={`border-b-2 pb-3 text-[13px] font-black uppercase tracking-wide transition ${
                  tab === aba.id
                    ? "border-[var(--engine-accent)] text-[var(--engine-accent)]"
                    : "border-transparent text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
                }`}
              >
                {aba.label}
                {typeof aba.count === "number" ? (
                  <span className="ml-1.5 tabular-nums">{aba.count}</span>
                ) : null}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t("peopleSheet.close")}
            aria-label={t("peopleSheet.close")}
            className="-mr-1 mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 px-4 pt-3">
          <label className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--engine-surface-2)] px-3">
            <Search size={16} className="shrink-0 text-[var(--engine-text-subtle)]" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={t("peopleSheet.search")}
              className="w-full bg-transparent text-[14px] text-[var(--engine-text)] outline-none placeholder:text-[var(--engine-text-subtle)]"
            />
          </label>
        </div>

        <div className="engine-modal-body engine-scroll engine-safe-bottom px-4 pb-4">
          {pessoas.length ? (
            <ul className="divide-y divide-[var(--engine-border)]">
              {pessoas.map((pessoa) => (
                <PersonRow
                  key={pessoa.userId}
                  person={pessoa}
                  t={t}
                  currentUserId={currentUserId}
                  isFollowing={Boolean(myFollowing?.has(pessoa.userId))}
                  onToggleFollow={onToggleFollow}
                  onRemoveFollower={
                    tab === "followers" && onRemoveFollower ? onRemoveFollower : null
                  }
                  onOpen={(handle) => {
                    onClose();
                    navigate(`/community/@${handle}`);
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="py-12 text-center text-sm font-semibold text-[var(--engine-text-muted)]">
              {/* Sem conta a RLS não entrega a lista, mas o CONTADOR vem de
                  uma função pública — e aí a folha dizia "ninguém segue
                  este perfil" bem embaixo de um 2. O vazio tem que dizer a
                  verdade: a lista é para quem tem conta. */}
              {!currentUserId
                ? t("socialFixes.profile.signInToSeeList")
                : term.trim()
                  ? t("peopleSheet.noMatch")
                  : tab === "followers"
                    ? t("peopleSheet.emptyFollowers")
                    : t("peopleSheet.emptyFollowing")}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
