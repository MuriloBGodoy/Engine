import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Hash, TrendingUp } from "lucide-react";
import { useTrendingTags } from "../../hooks/useTrendingTags";
import { tagPath } from "../../services/socialText";
import "../../services/i18n-social-posts";

/**
 * Bloco "Em alta": fileira de chips (`variant="chips"`, para cima do feed no
 * celular) ou lista (`variant="list"`, no trilho lateral). Some quando não há
 * tag nenhuma na semana — um bloco vazio no feed é só ruído.
 */
export function TrendingTags({ variant = "chips", limit = 10, className = "" }) {
  const { t, i18n } = useTranslation();
  const items = useTrendingTags({ limit });
  if (!items.length) return null;
  const number = new Intl.NumberFormat(i18n.language || "pt-BR", { notation: "compact" });

  if (variant === "list") {
    return (
      <section className={`engine-card p-4 ${className}`} aria-label={t("socialPosts.tags.trending")}>
        <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
          <TrendingUp size={14} className="text-[var(--engine-accent)]" />
          {t("socialPosts.tags.trending")}
        </h2>
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.tag}>
              <Link
                to={tagPath(item.tag)}
                className="flex min-h-10 items-center justify-between gap-2 rounded-lg px-2 text-sm font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
              >
                <span className="min-w-0 truncate">#{item.tag}</span>
                <span className="shrink-0 text-[11px] font-semibold text-[var(--engine-text-subtle)]">
                  {t("socialPosts.tags.posts", { count: item.posts, formatted: number.format(item.posts) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <nav
      aria-label={t("socialPosts.tags.trending")}
      className={`engine-scroll-x -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 ${className}`}
    >
      <span className="flex shrink-0 items-center gap-1 pr-1 text-[10px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
        <TrendingUp size={13} className="text-[var(--engine-accent)]" />
        {t("socialPosts.tags.trending")}
      </span>
      {items.map((item) => (
        <Link
          key={item.tag}
          to={tagPath(item.tag)}
          className="flex min-h-9 shrink-0 items-center gap-0.5 rounded-full border border-[var(--engine-border)] bg-[var(--engine-surface)] px-3 text-xs font-bold text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
        >
          <Hash size={12} />
          {item.tag}
        </Link>
      ))}
    </nav>
  );
}
