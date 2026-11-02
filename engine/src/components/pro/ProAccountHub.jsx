import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Building2, ExternalLink, Package, Pencil, Plus, Trash2, UserRound, Users } from "lucide-react";
import { deleteProProfile, proErrorKey, proProfilePath, respondInvite } from "../../services/proProfiles";
import { useConfirm } from "../ConfirmProvider";
import { useToast } from "../ToastProvider";
import { GhostButton, PrimaryButton, ProAvatar, Sheet } from "./ProUi";
import { ProProfileEditor } from "./ProProfileEditor";
import { ProTeamPanel } from "./ProTeamPanel";

/**
 * "Conta profissional" — substitui o antigo modal "Perfil de vendedor".
 *
 * Os dois caminhos lado a lado, como as redes fazem:
 *   - Anunciar como você (Instagram/TikTok "mudar para conta profissional"):
 *     mesmo @, ganha categoria, contato, horário e área;
 *   - Criar página profissional (Página do Facebook / TikTok Shop): @ próprio,
 *     logo, capa e equipe.
 * E daqui saem o "novo serviço" e o "novo produto" de cada perfil.
 *
 * `pro` = useMyPro(); `seed` = nome/cidade/telefone das configurações.
 */
export function ProAccountHub({ user, pro, seed, username = "", onClose, onNewService, onNewProduct }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [editor, setEditor] = useState(null); // { kind, profile? }
  const [team, setTeam] = useState(null); // { profile, role }

  const answer = async (entry, accept) => {
    try {
      await respondInvite(entry.profile.id, accept);
      toast(t(accept ? "pro.invite.accepted" : "pro.invite.declined"));
      pro.reload();
    } catch (error) {
      toast(t(proErrorKey(error)), "error");
    }
  };

  const remove = async (entry) => {
    const page = entry.profile.kind === "page";
    const ok = await confirm({
      title: t(page ? "pro.deletePageTitle" : "pro.disableTitle"),
      message: t(page ? "pro.deletePageConfirm" : "pro.disableConfirm", { name: entry.profile.name || `@${entry.profile.handle}` }),
      confirmLabel: t(page ? "pro.deletePage" : "pro.disable"),
    });
    if (!ok) return;
    try {
      await deleteProProfile(entry.profile.id);
      toast(t(page ? "pro.pageDeleted" : "pro.disabled"));
      pro.reload();
    } catch (error) {
      toast(t(proErrorKey(error)), "error");
    }
  };

  if (editor) {
    return (
      <ProProfileEditor
        kind={editor.kind}
        profile={editor.profile || null}
        seed={seed}
        user={user}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          pro.reload();
        }}
      />
    );
  }
  if (team) {
    return (
      <ProTeamPanel
        profile={team.profile}
        myRole={team.role}
        user={user}
        onClose={() => setTeam(null)}
        onLeft={() => {
          setTeam(null);
          pro.reload();
        }}
      />
    );
  }

  const card = (entry) => {
    const { profile, role } = entry;
    const page = profile.kind === "page";
    const path = proProfilePath(profile, username);
    const canEdit = role === "owner" || role === "admin";
    return (
      <li key={profile.id} className="space-y-3 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3">
        <div className="flex items-center gap-3">
          <ProAvatar src={page ? profile.data.logo : seed?.avatar} name={profile.name || seed?.name} size={48} square={page} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-sm font-bold text-[var(--engine-text)]">
              {profile.name || seed?.name}
              {page && <BadgeCheck size={14} className="shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />}
            </p>
            <p className="truncate text-xs font-medium text-[var(--engine-text-muted)]">
              {page ? `@${profile.handle}` : username}
              {" · "}
              {page ? t(`pro.roles.${role}`) : t("pro.personal")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton className="min-h-11 text-xs" onClick={() => onNewService(profile)}>
            <Plus size={15} aria-hidden="true" />
            {t("pro.newService")}
          </PrimaryButton>
          <PrimaryButton className="min-h-11 text-xs" onClick={() => onNewProduct(profile)}>
            <Package size={15} aria-hidden="true" />
            {t("pro.newProduct")}
          </PrimaryButton>
        </div>
        <div className="flex flex-wrap gap-2">
          {path && (
            <Link to={path} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)]">
              <ExternalLink size={14} aria-hidden="true" />
              {t(page ? "pro.viewPage" : "pro.viewShowcase")}
            </Link>
          )}
          {canEdit && (
            <button type="button" onClick={() => setEditor({ kind: profile.kind, profile })} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)]">
              <Pencil size={14} aria-hidden="true" />
              {t("pro.edit")}
            </button>
          )}
          {page && (
            <button type="button" onClick={() => setTeam({ profile, role })} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)]">
              <Users size={14} aria-hidden="true" />
              {t("pro.team.title")}
            </button>
          )}
          {role === "owner" && (
            <button type="button" onClick={() => remove(entry)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-[var(--engine-text-muted)] hover:text-red-500">
              <Trash2 size={14} aria-hidden="true" />
              {t(page ? "pro.deletePage" : "pro.disable")}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <Sheet onClose={onClose} eyebrow={t("pro.eyebrow")} title={t("pro.hubTitle")}>
      {pro.invites.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">{t("pro.invite.title")}</h3>
          {pro.invites.map((entry) => (
            <div key={entry.profile.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--engine-accent)]/40 bg-[var(--engine-accent-soft)] p-3">
              <ProAvatar src={entry.profile.data.logo} name={entry.profile.name} size={40} square />
              <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--engine-text)]">
                {t("pro.invite.body", { page: entry.profile.name, role: t(`pro.roles.${entry.role}`) })}
              </p>
              <GhostButton className="min-h-10 text-xs" onClick={() => answer(entry, false)}>
                {t("pro.invite.decline")}
              </GhostButton>
              <PrimaryButton className="min-h-10 text-xs" onClick={() => answer(entry, true)}>
                {t("pro.invite.accept")}
              </PrimaryButton>
            </div>
          ))}
        </section>
      )}

      <ul className="space-y-3">
        {pro.personal && card(pro.personal)}
        {pro.pages.map(card)}
      </ul>

      <section className="grid gap-3 sm:grid-cols-2">
        {!pro.personal && (
          <button
            type="button"
            onClick={() => setEditor({ kind: "person" })}
            className="rounded-2xl border border-[var(--engine-border)] p-4 text-left transition hover:border-[var(--engine-accent)]"
          >
            <UserRound className="text-[var(--engine-accent)]" size={22} aria-hidden="true" />
            <p className="mt-2 text-sm font-bold text-[var(--engine-text)]">{t("pro.asYouTitle")}</p>
            <p className="mt-1 text-xs font-medium leading-5 text-[var(--engine-text-muted)]">{t("pro.asYouCopy")}</p>
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditor({ kind: "page" })}
          className="rounded-2xl border border-[var(--engine-border)] p-4 text-left transition hover:border-[var(--engine-accent)]"
        >
          <Building2 className="text-[var(--engine-accent)]" size={22} aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-[var(--engine-text)]">{t("pro.createPageTitle")}</p>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--engine-text-muted)]">{t("pro.createPageCopy")}</p>
        </button>
      </section>
    </Sheet>
  );
}
