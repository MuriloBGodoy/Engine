import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, SlidersHorizontal, Store } from "lucide-react";
import { getServiceCategoryLabel } from "../../services/serviceListingDisplay";
import { proDisplay } from "../../services/proProfiles";
import "../../services/i18n-shop";

/**
 * Um cartão do diretório "quem atende" — uma oficina, um lojista, um
 * detalhador.
 *
 * Mostra o perfil, não o anúncio: quem monta a conta profissional aparece
 * aqui no mesmo dia, antes de ter publicado qualquer coisa. Era o furo que
 * deixava uma oficina de verdade invisível no app, por não existir lista de
 * perfis em lugar nenhum (ver `listProProfiles`).
 *
 * A foto é o logo da página ou o retrato da pessoa. Sem nenhum dos dois, fica
 * a inicial — não um retângulo cinza: o nome é a informação, a foto é enfeite.
 *
 * `meu` marca o cartão de quem está olhando, e `onManage` abre o painel da
 * conta profissional. Os dois existem porque a vitrine estreou (14/11/2026)
 * mostrando o perfil do próprio dono igual ao dos outros: ele se via na lista
 * pública e não tinha dali nenhum caminho para editar nem para apagar.
 */
export function ProDirectoryCard({ item, meu = false, onManage = null, className = "" }) {
  const { t } = useTranslation();
  const { profile, person, path } = item;
  const show = proDisplay(profile, person);
  const place = [profile.data.city, profile.data.state].filter(Boolean).join(" · ");
  const category = profile.data.category ? getServiceCategoryLabel(profile.data.category, t) : "";
  const inicial = (show.name || show.handle || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1).toUpperCase();

  const miolo = (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)]">
        {show.logo ? (
          <img src={show.logo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="font-display text-base font-bold text-[var(--engine-text-muted)]">{inicial}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {category && (
            <span className="block text-[10.5px] font-bold uppercase tracking-wide text-[var(--engine-text-muted)]">
              {category}
            </span>
          )}
          {meu && (
            <span className="rounded-full bg-[var(--engine-accent-soft)] px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-[var(--engine-accent-text)]">
              {t("proDirectory.mine")}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm font-bold text-[var(--engine-text)]">
          {show.name || show.handle}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-[var(--engine-text-muted)]">
          {place ? (
            <>
              <MapPin size={12} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{place}</span>
            </>
          ) : (
            <>
              <Store size={12} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{show.handle || t("proDirectory.noPlace")}</span>
            </>
          )}
        </span>
      </span>
    </span>
  );

  // Com "gerenciar" o cartão deixa de ser um link inteiro: botão dentro de
  // link não é tocável de verdade no celular, e o navegador reclama do HTML.
  if (!meu || !onManage) {
    return (
      <Link to={path} className={`engine-card engine-card-hover flex items-center gap-3 p-3.5 ${className}`}>
        {miolo}
      </Link>
    );
  }

  return (
    <div className={`engine-card flex items-center gap-2 p-3.5 ${className}`}>
      <Link to={path} className="flex min-w-0 flex-1 items-center gap-3">
        {miolo}
      </Link>
      <button
        type="button"
        onClick={onManage}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--engine-border-strong)] px-3 text-[12.5px] font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]"
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        {t("proDirectory.manage")}
      </button>
    </div>
  );
}
