import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Share2 } from "lucide-react";
import { didILike, getShowcaseBySlug, likeCar } from "../services/carShowcase";
import { engineDB } from "../services/db";
import { auth } from "../services/supabase";
import { openShareSheet, shareUrls } from "../services/shareLinks";
import { useToast } from "../components/ToastProvider";
import "../services/i18n-cars";

/**
 * A página pública de um carro: o que o dono escolheu mostrar.
 *
 * Nada de dinheiro aqui — gasto, aporte e renda ficam na garagem, que é
 * privada. O que chega é a cópia de `car_showcase`.
 */
export function CarShowcasePage() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const showToast = useToast();
  const [car, setCar] = useState(undefined);
  const [owner, setOwner] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);

  useEffect(() => {
    let alive = true;
    getShowcaseBySlug(slug)
      .then(async (found) => {
        if (!alive) return;
        setCar(found);
        setLikes(found?.likeCount || 0);
        if (!found) return;
        const [perfis, meu] = await Promise.all([
          engineDB.getPublicProfilesByIds([found.ownerId]),
          didILike(found.id).catch(() => false),
        ]);
        if (!alive) return;
        setOwner(perfis[found.ownerId] || null);
        setLiked(meu);
      })
      .catch(() => {
        if (alive) setCar(null);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  const toggleLike = async () => {
    if (!auth.currentUser?.uid) return;
    const next = !liked;
    setLiked(next);
    setLikes((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      await likeCar(car.id, next);
    } catch {
      setLiked(!next);
      setLikes((value) => Math.max(0, value + (next ? -1 : 1)));
      showToast(t("community.genericError"), "error");
    }
  };

  if (car === undefined) {
    return <div className="py-16 text-center text-sm text-[var(--engine-text-muted)]">…</div>;
  }

  if (car === null) {
    return (
      <div className="rounded-2xl border border-[var(--engine-border)] p-8 text-center">
        <p className="text-sm font-bold text-[var(--engine-text)]">{t("cars.notFound")}</p>
        <Link
          to="/community?tab=carros"
          className="mt-3 inline-block text-[13px] font-bold text-[var(--engine-accent-text)]"
        >
          {t("cars.tab")}
        </Link>
      </div>
    );
  }

  const specs = car.specs;
  const images = car.images?.length ? car.images : [car.image].filter(Boolean);

  return (
    <article className="space-y-4 pb-10">
      {images.length > 0 && (
        <div className="engine-scroll-x flex gap-2 overflow-x-auto">
          {images.map((src) => (
            <img
              key={src}
              src={src}
              alt={car.title}
              className="h-64 w-auto shrink-0 rounded-xl object-cover sm:h-80"
            />
          ))}
        </div>
      )}

      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--engine-text)] sm:text-2xl">
            {car.title}
          </h1>
          <p className="mt-0.5 text-[13px] font-semibold text-[var(--engine-text-muted)]">
            {[car.year, car.city, car.state].filter(Boolean).join(" · ")}
          </p>
          {owner && (
            <Link
              to={owner.username ? `/community/@${owner.username}` : "/community"}
              className="mt-1 inline-block text-[13px] font-bold text-[var(--engine-accent-text)]"
            >
              {t("cars.ownerSince")} {owner.author || `@${owner.username}`}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={liked}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--engine-border)] px-3 text-[13px] font-bold text-[var(--engine-text)]"
          >
            <Heart
              size={17}
              className={liked ? "text-[var(--engine-accent)]" : ""}
              fill={liked ? "currentColor" : "none"}
            />
            {likes > 0 ? likes : ""}
          </button>
          <button
            type="button"
            onClick={() =>
              openShareSheet({
                url: shareUrls.car(car.slug),
                title: car.title,
                kind: "car",
                subtitle: [car.year, car.city].filter(Boolean).join(" · "),
                image: car.image || "",
              })
            }
            aria-label={t("socialPosts.share.title")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--engine-border)] text-[var(--engine-text)]"
          >
            <Share2 size={17} />
          </button>
        </div>
      </header>

      {/* A preparação contada pelo dono. Número declarado continua declarado:
          quem desenha a ficha é o mesmo componente do post, que carimba isso. */}
      <section className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4">
        <h2 className="text-[13px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
          {t("cars.setup")}
        </h2>
        {specs?.notes ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--engine-text)]">
            {specs.notes}
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-[var(--engine-text-muted)]">{t("cars.noSetup")}</p>
        )}
        {car.mods?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {car.mods.map((mod) => (
              <span
                key={mod}
                className="rounded-full bg-[var(--engine-surface-2)] px-2.5 py-1 text-[12px] font-bold text-[var(--engine-text-muted)]"
              >
                {t(`cars.mods.${mod}`, { defaultValue: mod })}
              </span>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
