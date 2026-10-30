import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { SubTabsHeader } from "./SubTabsHeader";
import { useToast } from "../ToastProvider";
import { ClubCard } from "../clubs/ClubCard";
import { ClubCreateModal } from "../clubs/ClubCreateModal";
import { ClubDiscoveryTab } from "../clubs/ClubDiscoveryTab";
import { ClubDetailModal } from "../clubs/ClubDetailModal";
import { useMyClubs, useCreateClub, clubErrorMessage } from "../clubs/clubsDataSource";

/**
 * A aba Clubes da Comunidade: "meus clubes" e "descobrir".
 *
 * O cabeçalho vem do `SubTabsHeader`, compartilhado com Eventos — a linha de
 * sub-abas nasceu duplicada nas duas features e divergia no detalhe.
 */
export function ClubsTab({ searchParams, setSearchParams, user = null }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const { clubs, loading, error, fetch } = useMyClubs();
  const { create: createClub, loading: creatingClub } = useCreateClub();

  const signedIn = Boolean(user?.uid);
  const [activeSubTab, setActiveSubTab] = useState(signedIn ? "my-clubs" : "discover");
  const visibleSubTab = signedIn ? activeSubTab : "discover";
  const [showCreateModal, setShowCreateModal] = useState(false);
  const selectedClubId = searchParams.get("club");

  useEffect(() => {
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openClub = (clubId) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "clubes");
    params.set("club", clubId);
    setSearchParams(params);
  };

  const closeClub = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("club");
    setSearchParams(params);
  };

  const handleCreateClub = async (clubData, files) => {
    try {
      const newClub = await createClub(clubData, files);
      // Clube criado mesmo se a foto não subiu: o aviso é calmo, não erro.
      showToast(
        newClub?.photoUploadFailed ? t("clubs.custom.photoLater") : t("clubs.toast.created"),
        newClub?.photoUploadFailed ? { tone: "info", duration: 6000 } : "success",
      );
      setShowCreateModal(false);
      fetch();
      if (newClub?.id) openClub(newClub.id);
    } catch (error_) {
      showToast(clubErrorMessage(error_, t), "error");
    }
  };

  return (
    <div className="space-y-4">
      <SubTabsHeader
/* Visitante não tem "meus clubes": a sub-aba sai e Descobrir vira a única,
     igual ao que foi feito em Eventos (b61049f). Sem isto quem chega sem
     login cai numa aba vazia que nunca vai encher. */
  tabs={[
          signedIn && { id: "my-clubs", label: t("clubs.tabs.mine") },
          { id: "discover", label: t("clubs.tabs.discover") },
        ].filter(Boolean)}
        active={visibleSubTab}
        onChange={setActiveSubTab}
        createLabel={t("clubs.create")}
        createShortLabel={t("clubs.createShort")}
        onCreate={() => setShowCreateModal(true)}
      />

      {visibleSubTab === "my-clubs" ? (
        <div className="space-y-4">
          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}

          {loading && !clubs.length ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[var(--engine-text-muted)]">
              <Loader2 size={18} className="animate-spin" />
              {t("clubs.loading")}
            </div>
          ) : !clubs.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--engine-border-strong)] px-4 py-8 text-center">
              <p className="text-[14px] font-bold text-[var(--engine-text)]">
                {t("clubs.emptyTitle")}
              </p>
              <p className="mx-auto mt-1 max-w-[42ch] text-[12.5px] text-[var(--engine-text-muted)]">
                {t("clubs.emptyCopy")}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSubTab("discover")}
                  className="inline-flex min-h-11 items-center rounded-xl border border-[var(--engine-border-strong)] px-4 text-[13.5px] font-bold text-[var(--engine-text)]"
                >
                  {t("clubs.emptyDiscover")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-[13.5px] font-bold text-white"
                >
                  <Plus size={16} />
                  {t("clubs.create")}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clubs.map((club) => (
                <ClubCard key={club.id} club={club} onOpen={openClub} showRole />
              ))}
            </div>
          )}
        </div>
      ) : (
        <ClubDiscoveryTab
          onSelectClub={openClub}
          onCreate={() => setShowCreateModal(true)}
        />
      )}

      {showCreateModal ? (
        <ClubCreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateClub}
          loading={creatingClub}
        />
      ) : null}

      {selectedClubId ? (
        <ClubDetailModal clubId={selectedClubId} onClose={closeClub} />
      ) : null}
    </div>
  );
}
