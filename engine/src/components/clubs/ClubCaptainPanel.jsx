import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Shield, UserPlus, X } from "lucide-react";
import { useClubAdmin, clubErrorMessage } from "./clubsDataSource";
import { useToast } from "../ToastProvider";
import { useProfileSearch } from "../../hooks/useProfileSearch";
import { ChatAvatar } from "../ChatAvatar";
import { withoutAt } from "../../services/people";

/**
 * Painel do capitão: os pedidos pendentes e o que fazer com eles.
 *
 * Só existe para quem tem cargo — não é um bloco desabilitado para o resto.
 * Botão que aparece e não funciona ensina a pessoa a ignorar a tela, e o
 * contrato (§4) trata `not-allowed` como "esse botão não devia ter aparecido".
 */
export function ClubCaptainPanel({ clubId, role, canApprove, onChanged }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const { listRequests, approveRequest, rejectRequest, listInvites, invite, cancelInvite, loading } =
    useClubAdmin(clubId);
  const [requests, setRequests] = useState([]);
  const [invites, setInvites] = useState([]);
  /* Duas filas no mesmo painel, nunca misturadas: em "pedidos" quem decide é
     a direção, em "convites" é a pessoa convidada. */
  const [tab, setTab] = useState("requests");
  const [handle, setHandle] = useState("");
  const [inviting, setInviting] = useState(false);
  // Convidar era às cegas: digitava-se um @ e o botão mandava, sem nunca
  // mostrar DE QUEM se tratava. Errar uma letra convidava um estranho, e a
  // pessoa só descobria quando o convite não era aceito.
  const termo = withoutAt(handle).trim();
  const achados = useProfileSearch(termo, { enabled: termo.length >= 2, max: 5 });
  const [busyUid, setBusyUid] = useState("");

  // Quem aprova é quem tem approve_requests no cargo (o banco confere). Sem
  // a informação do cargo, vale o papel antigo.
  const canManage = canApprove ?? (role === "captain" || role === "founder");

  useEffect(() => {
    if (!canManage || !clubId) return;
    let alive = true;
    listRequests()
      .then((list) => {
        if (alive) setRequests(list || []);
      })
      .catch(() => {});
    listInvites()
      .then((list) => {
        if (alive) setInvites(list || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, canManage]);

  if (!canManage) return null;

  const sendInvite = async (event) => {
    event.preventDefault();
    const username = handle.replace(/^@/, "").trim();
    if (!username || inviting) return;
    setInviting(true);
    try {
      await invite(username, "");
      setHandle("");
      setTab("invites");
      setInvites(await listInvites());
      showToast(t("clubs.invite.sent", { name: username }), "success");
    } catch (error) {
      showToast(clubErrorMessage(error, t), "error");
    } finally {
      setInviting(false);
    }
  };

  const dropInvite = async (uid) => {
    setBusyUid(uid);
    try {
      await cancelInvite(uid);
      setInvites((prev) => prev.filter((row) => row.uid !== uid));
    } catch (error) {
      showToast(clubErrorMessage(error, t), "error");
    } finally {
      setBusyUid("");
    }
  };

  const act = async (uid, name, approve) => {
    setBusyUid(uid);
    try {
      if (approve) await approveRequest(uid);
      else await rejectRequest(uid);
      setRequests((prev) => prev.filter((request) => request.uid !== uid));
      showToast(
        approve ? t("clubs.captain.approved", { name }) : t("clubs.captain.rejected"),
        "success",
      );
      onChanged?.();
    } catch (error) {
      showToast(clubErrorMessage(error, t), "error");
    } finally {
      setBusyUid("");
    }
  };

  return (
    <section className="rounded-2xl border border-[color-mix(in_srgb,var(--club)_42%,transparent)] bg-[color-mix(in_srgb,var(--club)_8%,var(--engine-surface))] p-3.5">
      <header className="flex items-center gap-2">
        <Shield size={16} className="text-[var(--club-ink)]" />
        <h4 className="flex-1 text-[13.5px] font-extrabold text-[var(--engine-text)]">
          {t("clubs.captain.title")}
        </h4>
      </header>

      {/* Convidar pelo @: até aqui a porta do clube só abria de fora. */}
      <form onSubmit={sendInvite} className="mt-2.5 flex gap-2">
        <label className="flex min-h-10 flex-1 items-center gap-1.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-2.5">
          <span className="text-[13px] font-bold text-[var(--engine-text-muted)]">@</span>
          <input
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder={t("clubs.invite.placeholder")}
            aria-label={t("clubs.invite.title")}
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold text-[var(--engine-text)] outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={!handle.trim() || inviting}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--club)] px-3 text-[12.5px] font-bold text-[var(--club-on)] disabled:opacity-60"
        >
          {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={15} />}
          {t("clubs.invite.send")}
        </button>
      </form>

      {/* Quem é essa pessoa, antes de convidar. Tocar no nome completa o @ —
          é o mesmo gesto da busca de pessoas em Mensagens. */}
      {termo.length >= 2 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)]">
          {achados.length ? (
            achados.map((pessoa) => {
              const arroba = withoutAt(pessoa.username);
              const escolhido = arroba.toLowerCase() === termo.toLowerCase();
              return (
                <button
                  key={pessoa.userId || pessoa.id || arroba}
                  type="button"
                  onClick={() => setHandle(arroba)}
                  className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-[var(--engine-surface-2)] ${
                    escolhido ? "bg-[var(--engine-surface-2)]" : ""
                  }`}
                >
                  <ChatAvatar person={pessoa} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-[var(--engine-text)]">
                      {pessoa.author}
                    </span>
                    <span className="block truncate text-[11.5px] text-[var(--engine-text-muted)]">
                      @{arroba}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-2.5 py-2 text-[12px] text-[var(--engine-text-muted)]">
              {t("clubs.invite.noMatch")}
            </p>
          )}
        </div>
      )}

      <div className="mt-2.5 flex gap-1 rounded-xl bg-[var(--engine-surface-2)] p-1">
        {[
          { id: "requests", label: t("clubs.captain.requests", { count: requests.length }) },
          { id: "invites", label: t("clubs.invite.pending", { count: invites.length }) },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-9 flex-1 rounded-lg px-2 text-[12px] font-bold transition-colors ${
              tab === item.id
                ? "bg-[var(--engine-surface)] text-[var(--engine-text)]"
                : "text-[var(--engine-text-muted)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "invites" && (
        <div className="mt-2.5 space-y-2">
          {!invites.length && (
            <p className="py-1 text-[12.5px] text-[var(--engine-text-muted)]">
              {t("clubs.invite.none")}
            </p>
          )}
          {invites.map((row) => (
            <div
              key={row.uid}
              className="flex items-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[var(--engine-text)]">
                  {row.displayName}
                </p>
                <p className="truncate text-[11.5px] text-[var(--engine-text-muted)]">
                  {row.username ? `@${withoutAt(row.username)}` : t("clubs.invite.waiting")}
                </p>
              </div>
              <button
                type="button"
                disabled={busyUid === row.uid}
                onClick={() => dropInvite(row.uid)}
                aria-label={t("clubs.invite.cancel")}
                title={t("clubs.invite.cancel")}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--engine-text-muted)] disabled:opacity-60"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={`mt-2.5 space-y-2 ${tab === "requests" ? "" : "hidden"}`}>
        {loading && !requests.length ? (
          <Loader2 size={16} className="mx-auto my-3 animate-spin text-[var(--engine-text-muted)]" />
        ) : null}

        {!loading && !requests.length ? (
          <p className="py-1 text-[12.5px] text-[var(--engine-text-muted)]">
            {t("clubs.captain.noRequests")}
          </p>
        ) : null}

        {requests.map((request) => (
          <div
            key={request.uid}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-2.5 py-2"
          >
            <div className="min-w-[10rem] flex-1">
              <p className="text-[13px] font-bold text-[var(--engine-text)]">
                {request.displayName}
              </p>
              <p className="text-[11.5px] text-[var(--engine-text-muted)]">
                {request.message || t("clubs.captain.noMessage")}
              </p>
            </div>
            <button
              type="button"
              disabled={busyUid === request.uid}
              onClick={() => act(request.uid, request.displayName, true)}
              className="min-h-10 rounded-lg bg-[var(--club)] px-3 text-[12.5px] font-bold text-[var(--club-on)] disabled:opacity-60"
            >
              {t("clubs.captain.approve")}
            </button>
            <button
              type="button"
              disabled={busyUid === request.uid}
              onClick={() => act(request.uid, request.displayName, false)}
              className="min-h-10 rounded-lg px-3 text-[12.5px] font-semibold text-[var(--engine-text-muted)] disabled:opacity-60"
            >
              {t("clubs.captain.reject")}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
