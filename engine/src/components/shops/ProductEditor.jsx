import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Store, UserRound } from "lucide-react";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_MAX_PHOTOS,
  emptyProduct,
  fitLabel,
  formatProductPrice,
  interestMessage,
  normalizeProduct,
  productCategoryLabel,
  saveProduct,
  uploadListingPhoto,
} from "../../services/shops";
import { APPROVAL_SLA_HOURS, listingEditNeedsReview } from "../../services/serviceListingRules";
import { useToast } from "../ToastProvider";
import { useConfirm } from "../ConfirmProvider";
import { ProAvatar } from "../pro/ProUi";
import { FlowOverlay, ListingFlow, ListingFlowDone, ReviewList, ReviewRow } from "../shop/ListingFlow";
import {
  BigPriceInput,
  Chip,
  ChoiceCard,
  FieldBox,
  MessageBubble,
  PhotoGrid,
  SwitchRow,
  fieldInputClass,
} from "../shop/ShopPrimitives";
import { ProductCard } from "./ProductCard";
import { ProductStepFits } from "./steps/ProductStepFits";

/**
 * Anunciar (ou editar) um produto. Uma pergunta por tela, com a prévia do
 * cartão ao vivo — o protótipo aprovado em 01/11/2026
 * (ui designs/2026-11-01-anunciar-e-pagina-profissional):
 *
 *   onde (se há mais de um perfil) → fotos → o que é → novo ou usado →
 *   quanto → serve em → contato → tudo certo
 *
 * `profiles` = onde posso anunciar ([{ profile }]); `profileId` = o escolhido
 * ao abrir. Mesma moderação dos serviços: entra na fila; edição só de
 * preço/status mantém no ar.
 */
export function ProductEditor({ user, profiles, profileId = "", original = null, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [value, setValue] = useState(() => (original ? normalizeProduct(original) : emptyProduct()));
  const [chosenProfile, setChosenProfile] = useState(original?.profileId || profileId || profiles[0]?.profile.id || "");
  const profile = profiles.find((entry) => entry.profile.id === chosenProfile)?.profile || null;

  const addFiles = async (files) => {
    const room = PRODUCT_MAX_PHOTOS - (value.photos || []).length;
    const chosen = files.slice(0, room);
    if (!chosen.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(chosen.map((file) => uploadListingPhoto(file, user?.uid, "shops")));
      setValue((current) => ({ ...current, photos: [...(current.photos || []), ...urls].slice(0, PRODUCT_MAX_PHOTOS) }));
    } catch (error) {
      console.error(error);
      toast(t("pro.errors.photo"), "error");
    } finally {
      setUploading(false);
    }
  };

  const steps = [
    ...(profiles.length > 1 && !original ? ["where"] : []),
    "photos",
    "title",
    "condition",
    "price",
    "fits",
    "contact",
    "review",
  ];
  const stepKey = steps[Math.min(step, steps.length - 1)];
  const go = (key) => setStep(Math.max(0, steps.indexOf(key)));
  const hasPrice = value.priceAmount !== "" && value.priceAmount != null && Number(value.priceAmount) >= 0;

  const missing = () => {
    if (!(value.photos || []).length) return { step: "photos", key: "shops.form.needPhoto" };
    if (!value.title.trim()) return { step: "title", key: "shops.form.needTitle" };
    if (!value.category) return { step: "title", key: "shops.form.needCategory" };
    if (!value.priceNegotiable && !hasPrice) return { step: "price", key: "shops.form.needPrice" };
    return null;
  };

  const canNext = {
    where: Boolean(profile),
    photos: (value.photos || []).length > 0 && !uploading,
    title: value.title.trim().length > 1 && Boolean(value.category),
    condition: Boolean(value.condition),
    price: value.priceNegotiable || hasPrice,
    fits: true,
    contact: true,
    review: !uploading,
  }[stepKey];

  const save = async () => {
    const problem = missing();
    if (problem) {
      toast(t(problem.key), "error");
      go(problem.step);
      return;
    }
    if (!profile) {
      toast(t("pro.errors.not-found"), "error");
      return;
    }
    if (original?.moderationStatus === "approved") {
      const before = { ...normalizeProduct(original), moderationStatus: "approved" };
      const after = { ...before, ...normalizeProduct(value), moderationStatus: "approved" };
      if (listingEditNeedsReview(before, after)) {
        const ok = await confirm({
          title: t("services.editWarning.title"),
          message: t("shops.form.backToReview", { hours: APPROVAL_SLA_HOURS }),
          confirmLabel: t("services.editWarning.confirm"),
          tone: "neutral",
        });
        if (!ok) return;
      }
    }
    setSaving(true);
    try {
      const { product, queued } = await saveProduct(value, { profile, userId: user?.uid, original });
      onSaved?.(product);
      if (queued) setSubmitted(true);
      else {
        toast(t("services.flash.liveUpdated"));
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast(t("shops.form.saveError"), "error");
    } finally {
      setSaving(false);
    }
  };

  const previewProduct = {
    ...normalizeProduct(value),
    providerName: profile?.name || "",
    city: profile?.data.city || "",
  };
  const card = <ProductCard product={previewProduct} preview seller={profileLabel(profile, t)} />;
  const priceText = value.priceNegotiable || hasPrice ? formatProductPrice(previewProduct, t, i18n.language) : "";

  if (submitted) {
    return (
      <FlowOverlay onDismiss={onClose} label={t("shop.done.pendingTitle")}>
        <ListingFlowDone pending body={t("shops.form.submittedCopy", { hours: APPROVAL_SLA_HOURS })} card={card} onExit={onClose} />
      </FlowOverlay>
    );
  }

  const set = (patch) => setValue((current) => ({ ...current, ...patch }));
  const photos = (value.photos || []).map((url) => ({ id: url, url }));
  const showContact = Boolean(profile?.data?.whatsapp) && !profile?.data?.hideContact;
  const phone = showContact ? `${profile.data.whatsappCountry || ""} ${profile.data.whatsapp}`.trim() : "";

  const views = {
    where: {
      title: t("shop.mode.title"),
      sub: t("shop.mode.sub"),
      content: profiles.map((entry) => {
        const page = entry.profile.kind === "page";
        return (
          <ChoiceCard
            key={entry.profile.id}
            selected={chosenProfile === entry.profile.id}
            onClick={() => setChosenProfile(entry.profile.id)}
            icon={
              page && entry.profile.data?.logo ? (
                <ProAvatar src={entry.profile.data.logo} name={entry.profile.name} size={48} square />
              ) : page ? (
                <Store size={24} aria-hidden="true" />
              ) : (
                <UserRound size={24} aria-hidden="true" />
              )
            }
            title={page ? entry.profile.name : t("shop.mode.asYou")}
            hint={page ? `@${entry.profile.handle}` : entry.profile.name || t("pro.personal")}
          />
        );
      }),
    },
    photos: {
      title: t("shop.photos.title"),
      sub: t("shop.photos.sub", { max: PRODUCT_MAX_PHOTOS }),
      content: (
        <PhotoGrid
          photos={photos}
          max={PRODUCT_MAX_PHOTOS}
          busy={uploading}
          onAdd={addFiles}
          onRemove={(index) => set({ photos: value.photos.filter((_, i) => i !== index) })}
          onMakeCover={(index) => set({ photos: [value.photos[index], ...value.photos.filter((_, i) => i !== index)] })}
        />
      ),
    },
    title: {
      title: t("shop.titleStep.titleProduct"),
      content: (
        <>
          <FieldBox label={t("shop.titleStep.label")} htmlFor="product-title">
            <input
              id="product-title"
              className={fieldInputClass}
              value={value.title}
              maxLength={90}
              placeholder={t("shop.titleStep.placeholderProduct")}
              onChange={(event) => set({ title: event.target.value })}
            />
          </FieldBox>
          <div>
            <span className="mb-2 block text-[13px] font-bold text-[var(--engine-text)]">{t("shop.titleStep.category")}</span>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_CATEGORIES.map((id) => (
                <Chip key={id} selected={value.category === id} onClick={() => set({ category: id })}>
                  {productCategoryLabel(id, t)}
                </Chip>
              ))}
            </div>
          </div>
        </>
      ),
    },
    condition: {
      title: t("shop.condition.title"),
      content: (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {["new", "used"].map((id) => (
              <ChoiceCard
                key={id}
                vertical
                selected={value.condition === id}
                onClick={() => set({ condition: id })}
                title={t(`shop.condition.${id}`)}
                hint={t(`shop.condition.${id}Hint`)}
              />
            ))}
          </div>
          <FieldBox label={t("shop.condition.description")} optional={t("shop.condition.optional")} htmlFor="product-description" multiline>
            <textarea
              id="product-description"
              rows={4}
              maxLength={1500}
              className={`${fieldInputClass} resize-none py-3.5 leading-normal`}
              value={value.description}
              placeholder={t("shop.condition.descriptionPlaceholder")}
              onChange={(event) => set({ description: event.target.value })}
            />
          </FieldBox>
        </>
      ),
    },
    price: {
      title: t("shop.price.title"),
      sub: t("shop.price.sub"),
      content: (
        <>
          {!value.priceNegotiable && (
            <BigPriceInput
              value={hasPrice ? Number(value.priceAmount) : null}
              onChange={(amount) => set({ priceAmount: amount == null ? "" : String(amount) })}
              currencySymbol={currencySymbol(value.currency, i18n.language)}
              label={t("shop.price.label")}
              locale={i18n.language}
            />
          )}
          <SwitchRow checked={value.acceptsOffers} onChange={(next) => set({ acceptsOffers: next })} title={t("shop.price.offers")} />
          <SwitchRow
            checked={value.priceNegotiable}
            onChange={(next) => set({ priceNegotiable: next })}
            title={t("shop.price.negotiable")}
            hint={t("shop.price.negotiableHint")}
          />
          {original && (
            <div>
              <span className="mb-2 block text-[13px] font-bold text-[var(--engine-text)]">{t("shop.price.status")}</span>
              <div className="flex gap-2">
                {["available", "sold"].map((id) => (
                  <Chip key={id} selected={value.saleStatus === id} onClick={() => set({ saleStatus: id })}>
                    {t(`shops.status.${id}`)}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </>
      ),
    },
    fits: {
      title: t("shop.fits.title"),
      sub: t("shop.fits.sub"),
      content: <ProductStepFits value={value} onChange={setValue} />,
    },
    contact: {
      title: t("shop.contact.title"),
      sub: t("shop.contact.fromProfile"),
      content: (
        <>
          <SwitchRow checked title={t("shop.contact.engine")} hint={t("shop.contact.always")} />
          <SwitchRow checked={showContact} title={t("shop.contact.whatsapp")} hint={phone || t("shop.contact.noWhatsapp")} />
          <div>
            <span className="mb-2 block text-[13px] font-bold text-[var(--engine-text)]">{t("shop.contact.arrives")}</span>
            <MessageBubble>{interestMessage({ kind: "product", title: value.title || t("shop.flow.untitled") }, t).replaceAll("*", "")}</MessageBubble>
          </div>
        </>
      ),
    },
    review: {
      title: t("shop.review.title"),
      content: (
        <ReviewList>
          <ReviewRow label={t("shop.review.where")} onEdit={steps.includes("where") ? () => go("where") : undefined}>
            {profileLabel(profile, t)}
          </ReviewRow>
          <ReviewRow label={t("shop.review.photos")} onEdit={() => go("photos")}>
            {t("shop.review.photoCount", { count: (value.photos || []).length })}
          </ReviewRow>
          <ReviewRow label={t("shop.review.titleRow")} onEdit={() => go("title")}>
            {value.title}
            {value.category && <span className="block text-xs text-[var(--engine-text-muted)]">{productCategoryLabel(value.category, t)}</span>}
          </ReviewRow>
          <ReviewRow label={t("shop.review.condition")} onEdit={() => go("condition")}>
            {t(`shop.condition.${value.condition}`)}
          </ReviewRow>
          <ReviewRow label={t("shop.review.price")} onEdit={() => go("price")}>
            {priceText}
            {value.acceptsOffers ? ` · ${t("shop.review.offersSuffix")}` : ""}
          </ReviewRow>
          <ReviewRow label={t("shop.review.fits")} onEdit={() => go("fits")}>
            {(value.fits || []).length ? value.fits.map(fitLabel).join(", ") : "—"}
          </ReviewRow>
          <ReviewRow label={t("shop.review.contact")}>
            {showContact ? t("shop.review.contactBoth") : t("shop.review.contactEngine")}
          </ReviewRow>
        </ReviewList>
      ),
    },
  };

  const showPreview = stepKey !== "where";
  return (
    <FlowOverlay onDismiss={onClose} label={t(original ? "shops.form.editTitle" : "shops.form.newTitle")}>
      <ListingFlow
        step={views[stepKey]}
        index={step}
        total={steps.length}
        canNext={canNext}
        isLast={stepKey === "review"}
        busy={saving}
        nextLabel={original ? t("pro.save") : undefined}
        onBack={() => setStep((current) => Math.max(0, current - 1))}
        onNext={stepKey === "review" ? save : () => setStep((current) => Math.min(current + 1, steps.length - 1))}
        onExit={onClose}
        previewNote={profile?.kind === "page" ? t("shop.flow.wherePage") : t("shop.flow.whereProfile")}
        preview={
          showPreview ? (
            <div className="engine-card p-3.5">
              <div className="mx-auto max-w-[220px]">{card}</div>
            </div>
          ) : null
        }
        previewMini={
          showPreview
            ? {
                thumb: value.photos?.[0] ? <img src={value.photos[0]} alt="" className="h-full w-full object-cover" /> : null,
                title: value.title.trim() || t("shop.flow.untitled"),
                sub: priceText || t("shop.flow.noPrice"),
              }
            : null
        }
      />
    </FlowOverlay>
  );
}

/** "@garagem47" para página; o nome (ou "Conta pessoal") para a pessoa. */
function profileLabel(profile, t) {
  if (!profile) return "";
  return profile.kind === "page" ? `@${profile.handle}` : profile.name || t("pro.personal");
}

/** "R$", "US$", "€" — o símbolo da moeda no idioma de quem anuncia. */
function currencySymbol(currency = "BRL", locale = "pt-BR") {
  try {
    return (
      new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value || currency
    );
  } catch {
    return currency;
  }
}
