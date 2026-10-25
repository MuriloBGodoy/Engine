import { useTranslation } from "react-i18next";
import { Megaphone, Share2 } from "lucide-react";
import { useToast } from "../ToastProvider";
import { trackEvent } from "../../services/observability";
import { shareOrCopyLink } from "../../services/serviceListingPublic";

/**
 * "Conhece um bom prestador aqui? Indique o Engine." Aparece quando a cidade
 * (ou o filtro) ainda está vazia: em vez de só "nada encontrado", dá a quem
 * procurava um gesto útil — mandar o Engine para o prestador que ele já usa.
 * É assim que uma cidade vazia deixa de ser vazia.
 */
export function InviteProviderCard({ place = "", className = "" }) {
  const { t } = useTranslation();
  const toast = useToast();

  const share = async () => {
    const url = `${window.location.origin}/services`;
    const result = await shareOrCopyLink({
      url,
      title: "Engine",
      text: t("services.region.inviteText"),
    });
    trackEvent("servico_indicacao_compartilhada", { result });
    if (result === "copied") toast(t("services.region.inviteCopied"));
    else if (result === "failed") toast(t("services.share.copyFailed", { url }), "error");
  };

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-5 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
          <Megaphone size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[var(--engine-text)]">
            {place
              ? t("services.region.inviteTitle", { place })
              : t("services.region.inviteTitleGeneric")}
          </p>
          <p className="mt-1 text-sm font-medium leading-6 text-[var(--engine-text-muted)]">
            {t("services.region.inviteCopy")}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={share}
        className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-sm font-bold text-white transition hover:brightness-95"
      >
        <Share2 size={17} aria-hidden="true" />
        {t("services.region.inviteAction")}
      </button>
    </div>
  );
}
