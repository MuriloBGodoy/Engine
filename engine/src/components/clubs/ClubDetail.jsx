import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { ClubHeader, ClubTabs } from "./ClubHeader";
import { ClubWall, ClubGarage, ClubMeetups, ClubMemberList, ClubAbout } from "./ClubPanels";
import { ClubCaptainPanel } from "./ClubCaptainPanel";
import {
  useClubDetail,
  useClubMembers,
  useClubPosts,
  useClubEvents,
  useClubGarage,
  useClubMembership,
  useClubAdmin,
  clubErrorMessage,
} from "./clubsDataSource";
import { useToast } from "../ToastProvider";
import { clubColorVars, clubMatchesCar } from "../../services/clubStyles";
import { useIsDark } from "../../hooks/useIsDark";
import { auth } from "../../services/supabase";

/**
 * O corpo da página do clube — cabeçalho, as 5 abas e o painel do capitão.
 *
 * Vive num componente próprio porque é usado nos dois lugares em que um clube
 * abre: a rota `/clubs/:id` e o modal da aba Clubes da Comunidade. Duas cópias
 * do mesmo desenho foi exatamente o que criou o `SubTabsHeader`; não repetimos
 * o erro aqui.
 */
export function ClubDetail({ clubId, onClose }) {
  const isDark = useIsDark();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showToast = useToast();

  const { club, loading, error, fetch } = useClubDetail(clubId);
  const { members, fetch: fetchMembers, loading: loadingMembers } = useClubMembers(clubId);
  const { posts, fetch: fetchPosts, loading: loadingPosts } = useClubPosts(clubId);
  const { events, fetch: fetchEvents, loading: loadingEvents } = useClubEvents(clubId, {});
  const { events: pastEvents, fetch: fetchPast } = useClubEvents(clubId, { past: true });
  const { cars, fetch: fetchGarage, loading: loadingGarage } = useClubGarage(clubId);
  const { join, leave, loading: membershipLoading } = useClubMembership(clubId);
  const { promote, demote, removeMember } = useClubAdmin(clubId);

  const [tab, setTab] = useState("wall");

  useEffect(() => {
    if (!clubId) return;
    fetch();
    fetchMembers({ limit: 30 });
    fetchPosts({ limit: 20 });
    fetchEvents();
    fetchPast();
    fetchGarage({ limit: 40 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const uid = auth.currentUser?.uid;
  const role = club?.myRole || null;
  const isMember = Boolean(role);
  const canManage = role === "captain" || role === "founder";

  // A etiqueta de "casa com o foco" é da tela: o contrato manda a lista já
  // ordenada, e aqui só marcamos quais entraram por casamento de foco.
  const garageCars = useMemo(
    () =>
      (cars || []).map((car) => ({
        ...car,
        matchesFocus: clubMatchesCar(club, car),
        matchLabel: club?.focus?.models?.[0] || club?.focus?.brands?.[0] || "",
      })),
    [cars, club],
  );
  const hasOwnCar = useMemo(
    () => Boolean(uid) && garageCars.some((car) => car.ownerId === uid),
    [garageCars, uid],
  );

  const refresh = () => {
    fetch();
    fetchMembers({ limit: 30 });
  };

  const handleJoin = async () => {
    try {
      await join();
      showToast(
        club?.joinPolicy === "approval" ? t("clubs.join.requested") : t("clubs.join.joined"),
        "success",
      );
      refresh();
    } catch (err) {
      showToast(clubErrorMessage(err, t), "error");
    }
  };

  const handleLeave = async () => {
    try {
      await leave();
      showToast(t("clubs.join.left"), "success");
      refresh();
    } catch (err) {
      showToast(clubErrorMessage(err, t), "error");
    }
  };

  const handleMemberAction = async (action, member) => {
    try {
      if (action === "promote") await promote(member.uid);
      if (action === "demote") await demote(member.uid);
      if (action === "remove") await removeMember(member.uid);
      fetchMembers({ limit: 30 });
    } catch (err) {
      showToast(clubErrorMessage(err, t), "error");
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/clubs/${clubId}`;
    try {
      if (navigator.share) await navigator.share({ title: club?.name, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* cancelar o compartilhamento não é erro */
    }
  };

  if (loading && !club) {
    return (
      <div className="flex justify-center py-16 text-[var(--engine-text-muted)]">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (error || !club) {
    return (
      <div className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-6 text-center">
        <p className="text-sm text-[var(--engine-text-muted)]">{error || t("clubs.errors.generic")}</p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 min-h-11 rounded-xl border border-[var(--engine-border-strong)] px-4 text-sm font-bold"
          >
            {t("common.cancel")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div style={clubColorVars(club, isDark)} className="space-y-4">
      <ClubHeader
        club={club}
        memberCount={club.memberCount}
        carCount={garageCars.length}
        meetupCount={pastEvents?.length}
        onJoin={handleJoin}
        onLeave={handleLeave}
        onShare={handleShare}
        actionLoading={membershipLoading}
      />

      <ClubTabs active={tab} onChange={setTab} />

      {tab === "wall" ? (
        <ClubWall
          club={club}
          posts={posts}
          loading={loadingPosts}
          canPost={isMember}
          // O compositor é o da Comunidade: post de clube é post da Comunidade
          // com `clubId` (contrato §2). Não existe segundo editor aqui.
          onCreatePost={() => navigate(`/community?tab=feed&club=${clubId}&compose=1`)}
        />
      ) : null}

      {tab === "garage" ? (
        <ClubGarage
          cars={garageCars}
          loading={loadingGarage}
          isMember={isMember}
          hasOwnCar={hasOwnCar}
          onPublish={() => navigate("/garagem")}
        />
      ) : null}

      {tab === "meetups" ? (
        <ClubMeetups
          club={club}
          events={events || []}
          pastEvents={pastEvents || []}
          loading={loadingEvents}
          canCreate={canManage}
          onCreate={() => navigate(`/events?create=1&club=${clubId}`)}
        />
      ) : null}

      {tab === "members" ? (
        <div className="space-y-3">
          <ClubCaptainPanel clubId={clubId} role={role} onChanged={refresh} />
          <ClubMemberList
            club={club}
            members={members}
            total={club.memberCount}
            loading={loadingMembers}
            canManage={role === "founder"}
            onPromote={(member) => handleMemberAction("promote", member)}
            onDemote={(member) => handleMemberAction("demote", member)}
            onRemove={(member) => handleMemberAction("remove", member)}
          />
        </div>
      ) : null}

      {tab === "about" ? <ClubAbout club={club} isMember={isMember} /> : null}
    </div>
  );
}
