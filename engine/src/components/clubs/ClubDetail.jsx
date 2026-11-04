import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Flag, List, Loader2, Network, Settings2 } from "lucide-react";
import { ClubHeader, ClubTabs } from "./ClubHeader";
import { ClubWall, ClubGallery, ClubGarage, ClubMeetups, ClubMemberList, ClubAbout } from "./ClubPanels";
import { ClubCaptainPanel } from "./ClubCaptainPanel";
import { ClubEditModal } from "./ClubEditModal";
import { ClubPhotoPicker } from "./ClubPhotoPicker";
import { ClubTree } from "./ClubTree";
import { ClubRolesModal } from "./ClubRolesModal";
import { hasPermission } from "../../services/clubRoles";
import {
  useClubDetail,
  useClubMembers,
  useClubPosts,
  useClubEvents,
  useClubGarage,
  useClubMembership,
  useClubAdmin,
  clubErrorMessage,
  listMyClubInvites,
  acceptClubInvite,
  cancelClubInvite,
} from "./clubsDataSource";
import { useToast } from "../ToastProvider";
import { openShareSheet } from "../../services/shareLinks";
import { clubColorVars, clubMatchesCar } from "../../services/clubStyles";
import { useIsDark } from "../../hooks/useIsDark";
import { auth } from "../../services/supabase";
import { useSocialReport } from "../../hooks/useSocialReport";
import { authPath } from "../../services/authRedirect";

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
  const { openReport, reportDialog } = useSocialReport();
  const navigate = useNavigate();
  const showToast = useToast();

  const { club, loading, error, fetch } = useClubDetail(clubId);
  const { members, fetch: fetchMembers, loading: loadingMembers } = useClubMembers(clubId);
  const { posts, fetch: fetchPosts, loading: loadingPosts } = useClubPosts(clubId);
  const { events, fetch: fetchEvents, loading: loadingEvents } = useClubEvents(clubId, {});
  const { events: pastEvents, fetch: fetchPast } = useClubEvents(clubId, { past: true });
  const { cars, fetch: fetchGarage, loading: loadingGarage } = useClubGarage(clubId);
  const { join, leave, loading: membershipLoading } = useClubMembership(clubId);
  const { assignRole, removeMember, uploadImage, removeImage, updateClub, pinPost } = useClubAdmin(clubId);
  const logoPicker = useRef(null);
  const coverPicker = useRef(null);
  const [photoBusy, setPhotoBusy] = useState("");

  const [tab, setTab] = useState("wall");
  const [editing, setEditing] = useState(false);
  const [membersView, setMembersView] = useState("list");
  const [rolesOpen, setRolesOpen] = useState(false);
  const [treeKey, setTreeKey] = useState(0);

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
  // Permissões do cargo (20261101150000). Sem a lista de cargos (banco
  // antigo), cai no papel antigo: capitão e fundador podem o que podiam.
  const myRoleInfo = club?.myRoleInfo || null;
  const legacyStaff = role === "captain" || role === "founder";
  const can = (perm) => (myRoleInfo ? hasPermission(myRoleInfo, perm) : legacyStaff);
  const canManage = can("manage_events");

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
    setTreeKey((value) => value + 1);
  };

  /* Convite pendente para quem está olhando: aceitar e recusar ficam no topo
     do clube, que é onde o aviso do sino deixa a pessoa. */
  const [invited, setInvited] = useState(false);
  const [answering, setAnswering] = useState(false);
  useEffect(() => {
    if (!uid || !clubId || isMember) {
      setInvited(false);
      return undefined;
    }
    let alive = true;
    listMyClubInvites()
      .then((list) => {
        if (alive) setInvited((list || []).some((row) => row.clubId === clubId));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid, clubId, isMember]);

  const answerInvite = async (accept) => {
    setAnswering(true);
    try {
      if (accept) {
        await acceptClubInvite(clubId);
        showToast(t("clubs.invite.accepted"), "success");
      } else {
        await cancelClubInvite(clubId, uid);
      }
      setInvited(false);
      refresh();
    } catch (error) {
      showToast(clubErrorMessage(error, t), "error");
    } finally {
      setAnswering(false);
    }
  };

  const handleJoin = async () => {
    try {
      // Convite (`?ref=<uid>`): quem mandou o link vira o padrinho, se ainda
      // for membro — o banco confere.
      const ref = new URLSearchParams(window.location.search).get("ref") || "";
      await join({ ref });
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
      if (action === "remove") await removeMember(member.uid);
      else await assignRole(member.uid, action);
      fetchMembers({ limit: 30 });
      setTreeKey((value) => value + 1);
    } catch (err) {
      showToast(clubErrorMessage(err, t), "error");
    }
  };

  // Trocar logo/capa direto do cabeçalho: sobe, grava, apaga a antiga. Se
  // gravar falhar, o arquivo novo sai do Storage para não ficar órfão. O erro
  // volta como exceção com a frase pronta, e o recorte a mostra.
  const quickPhoto = (kind) => async (file) => {
    setPhotoBusy(kind);
    try {
      const path = await uploadImage(kind, file);
      try {
        await updateClub({ [kind]: path });
      } catch (error) {
        removeImage(path);
        throw error;
      }
      const old = club?.[kind] || "";
      if (old.startsWith(`clubs/${clubId}/`)) removeImage(old);
      showToast(t("clubs.custom.saved"), "success");
      fetch();
      return true;
    } catch (error) {
      throw new Error(clubErrorMessage(error, t), { cause: error });
    } finally {
      setPhotoBusy("");
    }
  };
  const canEditLook = can("edit_club") && club && !club.archived;

  const handleTogglePin = async (post) => {
    try {
      await pinPost(post.id, !post.pinned);
      fetchPosts({ limit: 20 });
    } catch (err) {
      showToast(clubErrorMessage(err, t), "error");
    }
  };

  const handleShare = () => {
    // Link de membro leva o convite: quem entrar por ele ganha padrinho
    // (o `ref` do convite tem prioridade sobre o `ref=share`).
    const url = `${window.location.origin}/clubs/${clubId}${isMember && uid ? `?ref=${uid}` : ""}`;
    openShareSheet({
      url,
      title: club?.name || "Engine",
      kind: "club",
      // O cartão na conversa mostra a cara do clube, não o endereço.
      subtitle: club?.tag ? `#${club.tag}` : "",
      image: club?.coverUrl || club?.logoUrl || "",
    });
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
        onCustomize={canEditLook ? () => setEditing(true) : null}
        onPickLogo={canEditLook ? () => logoPicker.current?.open() : null}
        onPickCover={canEditLook ? () => coverPicker.current?.open() : null}
        photoBusy={photoBusy}
        actionLoading={membershipLoading}
      />

      {/* Convite esperando resposta: aceitar entra no clube com quem convidou
          como padrinho; recusar some com o convite. */}
      {invited && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--club)_42%,transparent)] bg-[color-mix(in_srgb,var(--club)_10%,var(--engine-surface))] p-3.5">
          <p className="min-w-[12rem] flex-1 text-[13.5px] font-bold text-[var(--engine-text)]">
            {t("clubs.invite.youWereInvited")}
          </p>
          <button
            type="button"
            disabled={answering}
            onClick={() => answerInvite(true)}
            className="min-h-11 rounded-xl bg-[var(--club)] px-4 text-[13px] font-bold text-[var(--club-on)] disabled:opacity-60"
          >
            {t("clubs.invite.accept")}
          </button>
          <button
            type="button"
            disabled={answering}
            onClick={() => answerInvite(false)}
            className="min-h-11 rounded-xl px-3 text-[13px] font-semibold text-[var(--engine-text-muted)] disabled:opacity-60"
          >
            {t("clubs.invite.decline")}
          </button>
        </div>
      )}

      {canEditLook ? (
        <>
          <ClubPhotoPicker ref={logoPicker} kind="logo" onCropped={quickPhoto("logo")} />
          <ClubPhotoPicker ref={coverPicker} kind="cover" onCropped={quickPhoto("cover")} />
        </>
      ) : null}

      <ClubEditModal
        club={club}
        role={role}
        isOpen={editing}
        onClose={() => setEditing(false)}
        onSaved={() => fetch()}
      />

      <ClubRolesModal
        club={club}
        isOpen={rolesOpen}
        onClose={() => setRolesOpen(false)}
        onSaved={refresh}
      />

      <ClubTabs active={tab} onChange={setTab} />

      {tab === "wall" ? (
        <ClubWall
          club={club}
          posts={posts}
          loading={loadingPosts}
          canPost={isMember}
          canPin={can("post_announcements")}
          onTogglePin={handleTogglePin}
          // O compositor é o da Comunidade: post de clube é post da Comunidade
          // com `clubId` (contrato §2). Não existe segundo editor aqui.
          onCreatePost={() => navigate(`/community?tab=feed&club=${clubId}&compose=1`)}
        />
      ) : null}

      {tab === "photos" ? <ClubGallery posts={posts} loading={loadingPosts} /> : null}

      {tab === "garage" ? (
        <ClubGarage
          cars={garageCars}
          loading={loadingGarage}
          isMember={isMember}
          hasOwnCar={hasOwnCar}
          // A Garagem não tem ação de publicar: o botão levava a um beco sem
          // saída. Agora abre o "publicar meu carro" da Comunidade.
          onPublish={() => navigate("/community?share=1")}
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
          <ClubCaptainPanel clubId={clubId} role={role} canApprove={can("approve_requests")} onChanged={refresh} />
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label={t("clubTree.title")} className="flex flex-1 gap-1 rounded-xl bg-[var(--engine-surface-2)] p-1">
              {[
                { id: "list", label: t("clubTree.list"), icon: List },
                { id: "tree", label: t("clubTree.title"), icon: Network },
              ].map((tabItem) => {
                const { id, label } = tabItem;
                const TabIcon = tabItem.icon;
                return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={membersView === id}
                  onClick={() => setMembersView(id)}
                  className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-bold transition ${
                    membersView === id
                      ? "bg-[var(--engine-surface)] text-[var(--engine-text)] shadow-sm"
                      : "text-[var(--engine-text-muted)]"
                  }`}
                >
                  <TabIcon size={14} aria-hidden="true" />
                  {label}
                </button>
                );
              })}
            </div>
            {role === "founder" && !club.archived ? (
              <button
                type="button"
                onClick={() => setRolesOpen(true)}
                className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--engine-border-strong)] px-3 text-[12.5px] font-bold text-[var(--engine-text)]"
              >
                <Settings2 size={15} aria-hidden="true" />
                {t("clubRoles.manage")}
              </button>
            ) : null}
          </div>
          {membersView === "tree" ? (
            <ClubTree clubId={clubId} reloadKey={treeKey} />
          ) : (
            <ClubMemberList
              club={club}
              members={members}
              total={club.memberCount}
              loading={loadingMembers}
              roles={club.roles || []}
              myRole={myRoleInfo}
              myUid={uid}
              onAssign={(member, roleId) => handleMemberAction(roleId, member)}
              onRemove={(member) => handleMemberAction("remove", member)}
            />
          )}
        </div>
      ) : null}

      {tab === "about" ? (
        <div className="space-y-3">
          <ClubAbout club={club} isMember={isMember} />
          {role !== "founder" && (
            <button
              type="button"
              onClick={() => {
                if (!uid) {
                  navigate(authPath("/login", `/clubs/${clubId}`));
                  return;
                }
                openReport({ targetType: "club", targetId: String(clubId), reportedUserId: club.founderId || "" });
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-[var(--engine-text-muted)] transition hover:text-[var(--engine-accent)]"
            >
              <Flag size={14} aria-hidden="true" />
              {t("socialFixes.reportClub")}
            </button>
          )}
        </div>
      ) : null}
      {reportDialog}
    </div>
  );
}
