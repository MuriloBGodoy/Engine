import { useTranslation } from "react-i18next";
import { ExternalLink, Globe } from "lucide-react";
import { FaInstagram, FaTiktok, FaWhatsapp } from "react-icons/fa";
import {
  getDirectionsUrl,
  getMapUrl,
  youtubeId,
} from "../../services/serviceListingDisplay";

/**
 * Peças do anúncio de serviço que aparecem tanto no detalhe da vitrine quanto
 * na página pública (/servicos/<slug>).
 */

// Ícones oficiais (react-icons) com a mesma assinatura (size/className) dos
// ícones lucide, para poderem ser passados como `icon={WhatsAppIcon}`.
export function WhatsAppIcon({ size = 18, className = "" }) {
  return <FaWhatsapp size={size} className={className} aria-hidden="true" />;
}

export function InstagramIcon({ size = 18, className = "" }) {
  return <FaInstagram size={size} className={className} aria-hidden="true" />;
}

export function TikTokIcon({ size = 18, className = "" }) {
  return <FaTiktok size={size} className={className} aria-hidden="true" />;
}

/** Portfólio do prestador: redes, site e vídeo do serviço. */
export function PortfolioLinks({ listing, t, large = false }) {
  const videoId = youtubeId(listing.videoUrl);
  const links = [
    listing.instagram && {
      key: "instagram",
      icon: InstagramIcon,
      label: `@${listing.instagram}`,
      href: `https://instagram.com/${listing.instagram}`,
    },
    listing.tiktok && {
      key: "tiktok",
      icon: TikTokIcon,
      label: `@${listing.tiktok}`,
      href: `https://tiktok.com/@${listing.tiktok}`,
    },
    listing.website && {
      key: "website",
      icon: Globe,
      label: t("services.fields.website"),
      href: listing.website.startsWith("http") ? listing.website : `https://${listing.website}`,
    },
    listing.videoUrl &&
      !videoId && {
        key: "video",
        icon: ExternalLink,
        label: t("services.watchVideo"),
        href: listing.videoUrl,
      },
  ].filter(Boolean);

  if (!links.length && !videoId) return null;

  return (
    <div className="grid gap-3">
      {videoId && (
        <div className="overflow-hidden rounded-xl border border-[var(--engine-border)]">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}`}
            title={t("services.watchVideo")}
            allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="aspect-video w-full"
          />
        </div>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 rounded-xl border border-[var(--engine-border)] px-3 font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] ${
                  large ? "min-h-11 text-sm" : "min-h-10 text-xs"
                }`}
              >
                <Icon size={large ? 17 : 15} className="shrink-0" />
                <span className="max-w-48 truncate">{link.label}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MapPreview({ listing, compact = false }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)]">
      <iframe
        title={t("services.mapTitle", { title: listing.title || t("services.service") })}
        src={getMapUrl(listing)}
        loading="lazy"
        className={`${compact ? "h-44" : "h-64"} w-full border-0`}
      />
      <a
        href={getDirectionsUrl(listing)}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-11 items-center justify-center gap-2 border-t border-[var(--engine-border)] px-4 py-3 text-xs font-black uppercase tracking-widest text-[var(--engine-accent)] transition hover:bg-[var(--engine-accent)] hover:text-white"
      >
        <ExternalLink size={15} />
        {t("services.openGoogleMaps")}
      </a>
    </div>
  );
}
