import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import {
  PRO_HANDLE_PATTERN,
  cleanHandle,
  createProPage,
  emptyProData,
  proErrorKey,
  saveMyProfessional,
  updateProProfile,
} from "../../services/proProfiles";
import { uploadListingPhoto } from "../../services/shops";
import { useToast } from "../ToastProvider";
import { GhostButton, PrimaryButton, Sheet, StepHeader } from "./ProUi";
import { ProStepIdentity } from "./steps/ProStepIdentity";
import { ProStepContact } from "./steps/ProStepContact";
import { ProStepPlace } from "./steps/ProStepPlace";

const STEPS = [
  { key: "identity", Component: ProStepIdentity },
  { key: "contact", Component: ProStepContact },
  { key: "place", Component: ProStepPlace },
];

/**
 * Formulário em passos da conta profissional:
 *   kind "person" — "Anunciar como você";
 *   kind "page"   — "Criar página profissional" (ou editar uma).
 * `profile` presente = editar. `seed` = o que já se sabe da pessoa (nome,
 * cidade, telefone das configurações) para não pedir de novo.
 */
export function ProProfileEditor({ kind, profile = null, seed = {}, user, onClose, onSaved }) {
  const { t } = useTranslation();
  const toast = useToast();
  const editing = Boolean(profile);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [value, setValue] = useState(() => ({
    kind,
    handle: profile?.handle || "",
    name: profile?.name || seed.name || "",
    data: { ...emptyProData(), ...(seed.data || {}), ...(profile?.data || {}) },
  }));

  const upload = async (file, field) => {
    setUploading(field);
    try {
      const url = await uploadListingPhoto(file, user?.uid, "pro");
      setValue((current) => ({ ...current, data: { ...current.data, [field]: url } }));
    } catch (error) {
      console.error(error);
      toast(t("pro.errors.photo"), "error");
    } finally {
      setUploading("");
    }
  };

  const stepError = () => {
    if (step === 0) {
      if (kind === "page" && !editing && !PRO_HANDLE_PATTERN.test(cleanHandle(value.handle))) return "pro.errors.invalid-handle";
      if (kind === "page" && !value.name.trim()) return "pro.errors.invalid-name";
    }
    return "";
  };

  const next = () => {
    const error = stepError();
    if (error) {
      toast(t(error), "error");
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const save = async () => {
    const error = stepError();
    if (error) {
      toast(t(error), "error");
      return;
    }
    setSaving(true);
    try {
      let id = profile?.id;
      if (editing) {
        await updateProProfile(profile.id, { name: value.name, data: value.data });
      } else if (kind === "page") {
        id = await createProPage({ handle: value.handle, name: value.name, data: value.data });
      } else {
        id = await saveMyProfessional({ name: value.name, data: value.data });
      }
      toast(t(editing ? "pro.saved" : kind === "page" ? "pro.pageCreated" : "pro.proEnabled"));
      onSaved?.(id);
    } catch (saveError) {
      console.error(saveError);
      toast(t(proErrorKey(saveError)), "error");
      if (String(saveError?.message).includes("handle")) setStep(0);
    } finally {
      setSaving(false);
    }
  };

  const { key, Component } = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Sheet
      onClose={onClose}
      eyebrow={t(kind === "page" ? "pro.page" : "pro.personal")}
      title={t(editing ? "pro.editTitle" : kind === "page" ? "pro.createPageTitle" : "pro.asYouTitle")}
      footer={
        <>
          {step > 0 && (
            <GhostButton onClick={() => setStep((current) => current - 1)}>
              <ArrowLeft size={16} aria-hidden="true" />
              {t("pro.back")}
            </GhostButton>
          )}
          <span className="flex-1" />
          {editing && !last && (
            <GhostButton onClick={save} disabled={saving}>
              {t("pro.saveNow")}
            </GhostButton>
          )}
          {last ? (
            <PrimaryButton onClick={save} busy={saving}>
              <Check size={16} aria-hidden="true" />
              {t(editing ? "pro.save" : kind === "page" ? "pro.createPage" : "pro.enable")}
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
      <StepHeader index={step} total={STEPS.length} title={t(`pro.steps.${key}`)} />
      <Component value={value} onChange={setValue} onUpload={upload} uploading={uploading} editing={editing} />
    </Sheet>
  );
}
