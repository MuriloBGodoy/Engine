import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Clock } from "lucide-react";
import {
  PRODUCT_MAX_PHOTOS,
  emptyProduct,
  normalizeProduct,
  saveProduct,
  uploadListingPhoto,
} from "../../services/shops";
import { APPROVAL_SLA_HOURS, listingEditNeedsReview } from "../../services/serviceListingRules";
import { useToast } from "../ToastProvider";
import { useConfirm } from "../ConfirmProvider";
import { GhostButton, PrimaryButton, SelectField, Sheet, StepHeader } from "../pro/ProUi";
import { ProductCard } from "./ProductCard";
import { ProductStepPhotos } from "./steps/ProductStepPhotos";
import { ProductStepBasics } from "./steps/ProductStepBasics";
import { ProductStepPrice } from "./steps/ProductStepPrice";
import { ProductStepFits } from "./steps/ProductStepFits";

const STEPS = [
  { key: "photos", Component: ProductStepPhotos },
  { key: "basics", Component: ProductStepBasics },
  { key: "price", Component: ProductStepPrice },
  { key: "fits", Component: ProductStepFits },
];

/**
 * Anunciar (ou editar) um produto, em passos, com a prévia do cartão ao vivo
 * ao lado. `profiles` = onde posso anunciar ([{ profile }]); `profileId` =
 * o escolhido ao abrir. Mesma moderação dos serviços: entra na fila; edição
 * só de preço/status mantém no ar.
 */
export function ProductEditor({ user, profiles, profileId = "", original = null, onClose, onSaved }) {
  const { t } = useTranslation();
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

  const missing = (upTo) => {
    if (upTo >= 0 && !(value.photos || []).length) return { step: 0, key: "shops.form.needPhoto" };
    if (upTo >= 1 && !value.title.trim()) return { step: 1, key: "shops.form.needTitle" };
    if (upTo >= 1 && !value.category) return { step: 1, key: "shops.form.needCategory" };
    if (upTo >= 2 && !value.priceNegotiable && !(Number(value.priceAmount) >= 0 && String(value.priceAmount).trim() !== ""))
      return { step: 2, key: "shops.form.needPrice" };
    return null;
  };

  const next = () => {
    const problem = missing(step);
    if (problem) {
      toast(t(problem.key), "error");
      setStep(problem.step);
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const save = async () => {
    const problem = missing(STEPS.length);
    if (problem) {
      toast(t(problem.key), "error");
      setStep(problem.step);
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

  if (submitted) {
    return (
      <Sheet onClose={onClose} eyebrow={t("shops.eyebrow")} title={t("shops.form.submittedTitle")}>
        <div className="flex items-start gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4">
          <Clock className="mt-0.5 shrink-0 text-[var(--engine-accent)]" size={20} aria-hidden="true" />
          <p className="text-sm font-medium leading-6 text-[var(--engine-text)]">
            {t("shops.form.submittedCopy", { hours: APPROVAL_SLA_HOURS })}
          </p>
        </div>
        <PrimaryButton onClick={onClose} className="w-full">
          {t("common.close")}
        </PrimaryButton>
      </Sheet>
    );
  }

  const { key, Component } = STEPS[step];
  const last = step === STEPS.length - 1;
  const previewProduct = {
    ...normalizeProduct(value),
    providerName: profile?.name || "",
    city: profile?.data.city || "",
  };

  return (
    <Sheet
      wide
      onClose={onClose}
      eyebrow={t("shops.eyebrow")}
      title={t(original ? "shops.form.editTitle" : "shops.form.newTitle")}
      footer={
        <>
          {step > 0 && (
            <GhostButton onClick={() => setStep((current) => current - 1)}>
              <ArrowLeft size={16} aria-hidden="true" />
              {t("pro.back")}
            </GhostButton>
          )}
          <span className="flex-1" />
          {last ? (
            <PrimaryButton onClick={save} busy={saving}>
              <Check size={16} aria-hidden="true" />
              {t(original ? "pro.save" : "shops.form.publish")}
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={next}>
              {t("pro.next")}
              <ArrowRight size={16} aria-hidden="true" />
            </PrimaryButton>
          )}
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="space-y-5">
          {profiles.length > 1 && !original && step === 0 && (
            <SelectField
              id="product-profile"
              label={t("pro.publishAs")}
              value={chosenProfile}
              onChange={setChosenProfile}
              options={profiles.map((entry) => ({
                value: entry.profile.id,
                label: entry.profile.kind === "page" ? `${entry.profile.name} (@${entry.profile.handle})` : `${entry.profile.name || t("pro.personal")} · ${t("pro.personal")}`,
              }))}
            />
          )}
          <StepHeader index={step} total={STEPS.length} title={t(`shops.steps.${key}`)} />
          <Component value={value} onChange={setValue} onAddFiles={addFiles} uploading={uploading} />
        </div>
        <aside className="hidden md:block">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--engine-text-subtle)]">{t("shops.form.preview")}</p>
          <ProductCard product={previewProduct} preview />
        </aside>
      </div>
    </Sheet>
  );
}
