import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CarFront, CheckCircle2, Package, Pencil } from "lucide-react";
import { engineDB } from "../services/db";
import {
  fitLabel,
  fittingCar,
  formatProductPrice,
  getProductByHandle,
  productCategoryLabel,
  productPath,
  productUrl,
  setProductSaleStatus,
} from "../services/shops";
import { getWhatsAppHref } from "../services/serviceListingDisplay";
import { shareOrCopyLink } from "../services/serviceListingPublic";
import { WhatsAppIcon } from "../components/services/ListingParts";
import { ReportListingButton } from "../components/services/ReportListing";
import { MESSAGE_QUERY_FLAG, MessageProviderButton } from "../components/services/MessageProvider";
import { ProfileLinkCard, PublicMissing, PublicShell } from "../components/pro/PublicShell";
import { ProductEditor } from "../components/shops/ProductEditor";
import { useMyPro } from "../hooks/useMyPro";
import { useToast } from "../components/ToastProvider";

/**
 * Página pública do produto: /produtos/<slug>. Como a do serviço: abre sem
 * login, fora do shell, com fotos (a primeira é a capa), preço, condição,
 * "serve em" (e "serve no seu carro" para quem tem garagem), quem vende e o
 * contato — mensagem pelo Engine com o produto fixado no topo, ou WhatsApp
 * com a mesma linha pronta + o link desta página. A equipe do perfil vê o
 * próprio produto mesmo pendente e marca vendido daqui.
 */
export function ProductPublicPage({ user }) {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const autoMessage = searchParams.get(MESSAGE_QUERY_FLAG) === "1";
  const [result, setResult] = useState({ slug: null, product: null, failed: false });
  const [cars, setCars] = useState([]);
  const [editing, setEditing] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const scroller = useRef(null);
  const pro = useMyPro(user?.uid);
  const loading = result.slug !== slug;
  const product = loading ? null : result.product;
  const team = product ? pro.publishable.find((entry) => entry.profile.id === product.profileId) || null : null;

  const load = () =>
    getProductByHandle(slug)
      .then((found) => setResult({ slug, product: found && found.active ? found : null, failed: false }))
      .catch(() => setResult({ slug, product: null, failed: true }));

  useEffect(() => {
    let alive = true;
    getProductByHandle(slug)
      .then((found) => alive && setResult({ slug, product: found && found.active ? found : null, failed: false }))
      .catch(() => alive && setResult({ slug, product: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (product?.slug && product.slug !== slug) navigate(productPath(product), { replace: true });
  }, [product, slug, navigate]);

  useEffect(() => {
    if (!product || product.moderationStatus !== "approved" || team) return;
    engineDB.trackServiceListingMetric(product.id, "detail", "link");
  }, [product, team]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let alive = true;
    engineDB.getCars().then((list) => alive && setCars(list || [])).catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!product) return undefined;
    const previous = document.title;
    document.title = `${product.title} · Engine`;
    return () => {
      document.title = previous;
    };
  }, [product]);

  if (loading) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-5xl animate-pulse sm:px-6 sm:py-6" aria-busy="true">
          <div className="aspect-square w-full bg-[var(--engine-surface-2)] sm:aspect-[16/10] sm:rounded-2xl" />
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      </PublicShell>
    );
  }

  if (!product) {
    return (
      <PublicShell>
        <PublicMissing
          title={t(result.failed ? "services.publicPage.errorTitle" : "shops.public.missingTitle")}
          copy={t(result.failed ? "services.publicPage.errorCopy" : "shops.public.missingCopy")}
          cta={t("shops.public.seeShops")}
          to="/services?aba=lojas"
        />
      </PublicShell>
    );
  }

  const approved = product.moderationStatus === "approved";
  const sold = product.saleStatus === "sold";
  const myCar = fittingCar(product, cars);
  const whatsappHref = sold ? undefined : getWhatsAppHref(product, t);
  const photos = product.photos;

  const share = async () => {
    const url = productUrl(product);
    const outcome = await shareOrCopyLink({ url, title: product.title });
    if (outcome === "copied") toast(t("services.share.copied"));
    if (outcome === "failed") toast(t("services.share.copyFailed", { url }), "error");
  };

  const toggleSold = async () => {
    try {
      await setProductSaleStatus(product, sold ? "available" : "sold");
      toast(t(sold ? "shops.status.markedAvailable" : "shops.status.markedSold"));
      load();
    } catch (error) {
      console.error(error);
      toast(t("shops.form.saveError"), "error");
    }
  };

  return (
    <PublicShell
      right={
        <button type="button" onClick={share} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[var(--engine-text-muted)] hover:text-[var(--engine-accent)]">
          {t("services.share.action")}
        </button>
      }
    >
      {team && (
        <div className="border-b border-[var(--engine-border)] bg-[var(--engine-surface)] px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--engine-text)]">
              {approved ? t("shops.public.teamApproved") : t("shops.public.teamPending")}
            </p>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--engine-border)] px-4 text-sm font-bold">
              <Pencil size={15} aria-hidden="true" />
              {t("pro.edit")}
            </button>
            <button type="button" onClick={toggleSold} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--engine-accent)] px-4 text-sm font-bold text-white">
              <CheckCircle2 size={15} aria-hidden="true" />
              {t(sold ? "shops.status.markAvailable" : "shops.status.markSold")}
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-5xl gap-6 pb-28 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <div className="relative overflow-hidden bg-[var(--engine-surface-2)] sm:rounded-2xl">
            {photos.length ? (
              <div
                ref={scroller}
                onScroll={(event) => {
                  const node = event.currentTarget;
                  setPhotoIndex(Math.round(node.scrollLeft / Math.max(1, node.clientWidth)));
                }}
                className="engine-chip-scroll flex snap-x snap-mandatory overflow-x-auto"
              >
                {photos.map((photo, index) => (
                  <img
                    key={`${photo}-${index}`}
                    src={photo}
                    alt={index === 0 ? product.title : ""}
                    loading={index === 0 ? "eager" : "lazy"}
                    className={`aspect-square w-full shrink-0 snap-center object-cover sm:aspect-[4/3] ${sold ? "opacity-70" : ""}`}
                  />
                ))}
              </div>
            ) : (
              <div className="flex aspect-square items-center justify-center text-[var(--engine-text-subtle)]">
                <Package size={40} aria-hidden="true" />
              </div>
            )}
            {photos.length > 1 && (
              <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-1 text-xs font-black text-white">
                {photoIndex + 1}/{photos.length}
              </span>
            )}
          </div>

          <section className="space-y-4 px-4 pt-5 sm:px-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--engine-accent)]">
              {productCategoryLabel(product.category, t)} · {t(`shops.condition.${product.condition}`)}
            </p>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">{product.title}</h1>
            <p className="font-display text-3xl font-extrabold">
              {formatProductPrice(product, t, i18n.language)}
              {product.acceptsOffers && !product.priceNegotiable && (
                <span className="ml-2 align-middle text-xs font-bold uppercase tracking-wider text-[var(--engine-text-subtle)]">{t("shops.price.offers")}</span>
              )}
            </p>
            {sold && (
              <p className="rounded-xl bg-[var(--engine-surface-2)] p-3 text-sm font-bold text-[var(--engine-text)]">{t("shops.status.soldHint")}</p>
            )}
            {myCar && (
              <p className="flex items-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                <CarFront size={16} aria-hidden="true" />
                {t("shops.fitsYour", { car: [myCar.brand, myCar.model].filter(Boolean).join(" ") })}
              </p>
            )}
            {product.fits.length > 0 && (
              <div>
                <h2 className="text-[11px] font-black uppercase text-[var(--engine-text-muted)]">
                  <span className="tracking-widest">{t("shops.fits.title")}</span>
                </h2>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {product.fits.map((fit, index) => (
                    <li key={index} className="rounded-full border border-[var(--engine-border)] px-3 py-1 text-xs font-bold">
                      {fitLabel(fit)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {product.description && (
              <p className="whitespace-pre-line text-sm font-medium leading-6 text-[var(--engine-text)]">{product.description}</p>
            )}
          </section>
        </div>

        <aside className="space-y-3 px-4 sm:px-0">
          <ProfileLinkCard profileId={product.profileId} fallbackName={product.providerName} />
          {!team && (
            <div className="space-y-2 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4">
              <MessageProviderButton listing={product} user={user} autoOpen={autoMessage} />
              {whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => approved && engineDB.trackServiceListingMetric(product.id, "whatsapp", "link")}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:brightness-95"
                >
                  <WhatsAppIcon size={18} />
                  WhatsApp
                </a>
              )}
              <p className="text-[11px] font-medium leading-4 text-[var(--engine-text-subtle)]">{t("shops.public.noPayments")}</p>
            </div>
          )}
          {!team && approved && <ReportListingButton listing={product} user={user} />}
        </aside>
      </main>

      {editing && team && (
        <ProductEditor
          user={user}
          profiles={pro.publishable}
          original={product}
          onClose={() => setEditing(false)}
          onSaved={() => load()}
        />
      )}
    </PublicShell>
  );
}
