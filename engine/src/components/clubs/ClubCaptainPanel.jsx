import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Shield } from "lucide-react";
import { useClubAdmin, clubErrorMessage } from "./clubsDataSource";
import { useToast } from "../ToastProvider";

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
  const { listRequests, approveRequest, rejectRequest, loading } = useClubAdmin(clubId);
  const [requests, setRequests] = useState([]);
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
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, canManage]);

  if (!canManage) return null;

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
        <span className="rounded-full bg-[var(--engine-surface-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--engine-text-muted)]">
          {t("clubs.captain.requests", { count: requests.length })}
        </span>
      </header>

      <div className="mt-2.5 space-y-2">
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
