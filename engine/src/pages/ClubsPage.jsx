import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "../components/ToastProvider";
import { ClubCard } from "../components/clubs/ClubCard";
import { ClubCreateModal } from "../components/clubs/ClubCreateModal";
import { ClubDiscoveryTab } from "../components/clubs/ClubDiscoveryTab";
import { SubTabsHeader } from "../components/community/SubTabsHeader";
import {
  useMyClubs,
  useCreateClub,
  clubErrorMessage,
} from "../components/clubs/clubsDataSource";

/**
 * A página `/clubs`, irmã da aba Clubes da Comunidade.
 *
 * O conteúdo é o mesmo: o que muda é a moldura (título de página e navegação
 * por rota em vez de parâmetro de busca). O cabeçalho de sub-abas é o
 * `SubTabsHeader` compartilhado, e não uma terceira cópia dele.
 */
export function ClubsPage({ user = null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showToast = useToast();
  const { clubs, loading, error, fetch } = useMyClubs();
  const { create: createClub, loading: creatingClub } = useCreateClub();

  const signedIn = Boolean(user?.uid);
  const [activeTab, setActiveTab] = useState(signedIn ? "my-clubs" : "discover");
  const visibleTab = signedIn ? activeTab : "discover";
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openClub = (clubId) => navigate(`/clubs/${clubId}`);

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
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--engine-text)] sm:text-3xl">
          {t("clubs.title")}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--engine-text-muted)]">{t("clubs.subtitle")}</p>
      </header>

      <SubTabsHeader
/* Visitante não tem "meus clubes": a sub-aba sai e Descobrir vira a única,
     igual ao que foi feito em Eventos (b61049f). Sem isto quem chega sem
     login cai numa aba vazia que nunca vai encher. */
  tabs={[
          signedIn && { id: "my-clubs", label: t("clubs.tabs.mine") },
          { id: "discover", label: t("clubs.tabs.discover") },
        ].filter(Boolean)}
        active={visibleTab}
        onChange={setActiveTab}
        createLabel={t("clubs.create")}
        createShortLabel={t("clubs.createShort")}
        onCreate={() => setShowCreateModal(true)}
      />

      {visibleTab === "my-clubs" ? (
        <div className="space-y-4">
          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}

          {loading && !clubs.length ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[var(--engine-text-muted)] sm:py-12">
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
                  onClick={() => setActiveTab("discover")}
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
        <ClubDiscoveryTab onSelectClub={openClub} onCreate={() => setShowCreateModal(true)} />
      )}

      {showCreateModal ? (
        <ClubCreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateClub}
          loading={creatingClub}
        />
      ) : null}
    </div>
  );
}
