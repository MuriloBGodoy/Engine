import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Pencil } from "lucide-react";
import { engineDB } from "../services/db";
import {
  fitLabel,
  fittingCar,
  formatProductPrice,
  getProductByHandle,
  interestMessage,
  productCategoryLabel,
  productPath,
  productUrl,
  setProductSaleStatus,
} from "../services/shops";
import { normalizeWhatsApp } from "../services/serviceListingDisplay";
import { openShareSheet } from "../services/shareLinks";
import { ProductDetail } from "../components/shop/ProductDetail";
import { ContactSheet } from "../components/shop/ContactSheet";
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
  const [whatsappOpen, setWhatsappOpen] = useState(false);
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
  const phone = normalizeWhatsApp(product.whatsapp);
  const photos = product.photos;

  const share = () => openShareSheet({ url: productUrl(product), title: product.title, kind: "product" });

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

      <main className="mx-auto max-w-[1280px] pb-6">
        <ProductDetail
          product={{
            title: product.title,
            price: formatProductPrice(product, t, i18n.language),
            photos,
            sold,
            badges: [
              t(`shops.condition.${product.condition}`),
              productCategoryLabel(product.category, t),
              product.acceptsOffers && !product.priceNegotiable ? t("shop.product.offers") : "",
            ].filter(Boolean),
            description: product.description,
            fitsLabels: product.fits.map(fitLabel),
          }}
          fit={product.fits.length && cars.length ? Boolean(myCar) : null}
          carName={myCar ? [myCar.model || myCar.brand, myCar.year].filter(Boolean).join(" ") : ""}
          onBack={() => (window.history.length > 1 ? navigate(-1) : navigate("/services?aba=lojas"))}
          onShare={share}
          sellerSlot={<ProfileLinkCard profileId={product.profileId} fallbackName={product.providerName} />}
          hideContact={Boolean(team)}
          messageSlot={<MessageProviderButton listing={product} user={user} autoOpen={autoMessage} variant="bar" className="rounded-[14px] text-[15px]" />}
          onWhatsApp={phone && !sold ? () => setWhatsappOpen(true) : undefined}
          afterNote={!team && approved ? <div className="mt-3"><ReportListingButton listing={product} user={user} /></div> : null}
        />
      </main>

      <ContactSheet
        key={whatsappOpen ? "open" : "closed"}
        open={whatsappOpen}
        channel="whatsapp"
        initialMessage={[interestMessage(product, t), productUrl(product)].join("\n")}
        phone={phone}
        phoneLabel={phone ? `+${phone}` : ""}
        onWhatsApp={() => approved && engineDB.trackServiceListingMetric(product.id, "whatsapp", "link")}
        onClose={() => setWhatsappOpen(false)}
      />

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
