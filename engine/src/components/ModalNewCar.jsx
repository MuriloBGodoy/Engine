import { useState, useEffect, useRef } from "react";
import { X, Save, Loader2, Plus, Trash2, Upload } from "lucide-react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { auth } from "../services/supabase";
import { CAR_TYPE_GOAL, CAR_TYPE_OWNED, MAX_CAR_PHOTOS } from "../services/db";
import { isFileTooBig, isImageFile, uploadUserPhoto } from "../services/photos";
import { ImageCropper } from "./ImageCropper";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { formatFipeYear } from "../services/carDisplay";

const fieldClass =
  "w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3 text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)] disabled:opacity-40";
const fieldLabelClass =
  "ml-1 text-[10px] font-bold uppercase tracking-widest";

export function ModalNewCar({ isOpen, onClose, onSave, carToEdit = null }) {
  const { i18n, t } = useTranslation();
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [years, setYears] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  // Código FIPE do veículo (`004278-1`), que só aparece na resposta de preço.
  // Vinha e ia embora junto com o resto do payload.
  const [fipeCode, setFipeCode] = useState("");
  const [targetValue, setTargetValue] = useState(0);
  const [savedValue, setSavedValue] = useState(0);
  const [carType, setCarType] = useState(carToEdit?.type || CAR_TYPE_GOAL);
  const isOwned = carType === CAR_TYPE_OWNED;
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState(() =>
    Array.isArray(carToEdit?.images) && carToEdit.images.length
      ? carToEdit.images
      : [carToEdit?.image].filter(Boolean),
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [fileForCropping, setFileForCropping] = useState(null);

  // Voltar no Android fecha o cadastro em vez de sair da garagem. O cropper
  // empilha a própria entrada em cima desta: voltar dentro dele fecha só ele.
  useHistoryDismiss(isOpen, onClose);

  const formatDisplayValue = (val) => {
    return new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  const handleMoneyChange = (e) => {
    const rawValue = e.target.value.replace(/\D/g, "");
    setSavedValue(Number(rawValue) / 100);
  };

  useEffect(() => {
    if (!isOpen) return;

    axios
      .get("https://parallelum.com.br/fipe/api/v1/carros/marcas")
      .then((res) => setBrands(res.data))
      .catch(() => {});

    const timer = setTimeout(() => {
      if (carToEdit) {
        setSavedValue(carToEdit.savedValue || 0);
        setTargetValue(carToEdit.targetValue || 0);
      } else {
        setSavedValue(0);
        setTargetValue(0);
        setSelectedBrand("");
        setSelectedModel("");
        setSelectedYear("");
        setFipeCode("");
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, carToEdit]);

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setError("");
    if (!files.length) return;

    const slots = MAX_CAR_PHOTOS - photos.length;
    if (slots <= 0) {
      setError(t("modalCar.photoLimit", { value: MAX_CAR_PHOTOS }));
      return;
    }

    const selected = files.slice(0, 1); // Process one at a time for cropper
    if (selected.some((file) => !isImageFile(file) || isFileTooBig(file))) {
      setError(t("modalCar.imageError"));
      return;
    }

    // Show cropper for the first selected file
    setFileForCropping(selected[0]);
    setIsCropperOpen(true);
  };

  const handleCropperSave = async (croppedFile) => {
    if (!croppedFile) {
      console.error("[ModalNewCar] croppedFile é nulo");
      return false;
    }

    setUploading(true);
    try {
      const url = await uploadUserPhoto(croppedFile, {
        userId: auth.currentUser?.uid,
        folder: "cars",
      });

      setPhotos((current) => [...current, url].slice(0, MAX_CAR_PHOTOS));
      setFileForCropping(null);
      setError("");
      setUploading(false);
      return true;
    } catch (uploadError) {
      console.error("[ModalNewCar] Erro no upload:", uploadError);
      const errorMsg = uploadError?.message || t("modalCar.imageError");
      setError(errorMsg);
      setUploading(false);
      return false;
    }
  };

  const removePhoto = (index) =>
    setPhotos((current) => current.filter((_, position) => position !== index));

  const handleBrandChange = (brandId) => {
    setSelectedBrand(brandId);
    setModels([]);
    // Limpa o que estava abaixo na cascata: um código de modelo da marca
    // anterior emparelhado com a marca nova aponta para outro carro.
    setSelectedModel("");
    setSelectedYear("");
    setYears([]);
    setFipeCode("");
    if (brandId) {
      setLoading(true);
      axios
        .get(
          `https://parallelum.com.br/fipe/api/v1/carros/marcas/${brandId}/modelos`,
        )
        .then((res) => {
          setModels(res.data.modelos);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  };

  const handleModelChange = (modelId) => {
    setSelectedModel(modelId);
    setYears([]);
    setSelectedYear("");
    setFipeCode("");
    if (modelId) {
      setLoading(true);
      axios
        .get(
          `https://parallelum.com.br/fipe/api/v1/carros/marcas/${selectedBrand}/modelos/${modelId}/anos`,
        )
        .then((res) => {
          setYears(res.data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  };

  const handleYearSelection = (yearId) => {
    setSelectedYear(yearId);
    setFipeCode("");
    if (yearId) {
      setLoading(true);
      axios
        .get(
          `https://parallelum.com.br/fipe/api/v1/carros/marcas/${selectedBrand}/modelos/${selectedModel}/anos/${yearId}`,
        )
        .then((res) => {
          const valorLimpo = Number(res.data.Valor.replace(/\D/g, "")) / 100;
          setTargetValue(valorLimpo);
          // `CodigoFipe` só existe nesta resposta e é a chave canônica do
          // veículo no Brasil. Vinha sendo descartada junto com o resto.
          setFipeCode(res.data.CodigoFipe || "");
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    const pickedBrand = brands.find(
      (b) => String(b.codigo) === String(selectedBrand),
    );
    const pickedModel = models.find(
      (m) => String(m.codigo) === String(selectedModel),
    );
    const pickedYear = years.find((y) => String(y.codigo) === String(selectedYear));

    const brandName = pickedBrand?.nome || carToEdit?.brand || "";
    const modelName = pickedModel?.nome || carToEdit?.model || "";
    const yearName = pickedYear?.nome || carToEdit?.year || "";

    // O select de modelo fica desabilitado enquanto a lista da FIPE não
    // carrega — e navegador nenhum valida campo desabilitado, então dava para
    // salvar carro só com a marca. Aí a publicação saía sem modelo.
    if (!brandName || !modelName) {
      setError(t("modalCar.missingVehicle"));
      setLoading(false);
      return;
    }

    // Foto é opcional na garagem desde 25/09/2026. Exigir foto antes de
    // saber "cabe um Pulse?" travava a entrada do funil principal. Onde a foto
    // importa — publicar o carro na Comunidade — ela continua exigida.

    // Códigos FIPE. Só valem se os TRÊS vierem da seleção desta sessão: um
    // código de marca novo com um de modelo antigo aponta para outro veículo.
    //
    // Na edição, quem não mexe nos selects mantém o que já estava — mesma
    // lógica dos nomes logo acima. Mas se o nome mudou e o código não pôde ser
    // resolvido, o código é APAGADO em vez de mantido: um código velho colado
    // num carro novo é pior que código nenhum, e todo consumidor deste campo
    // já precisa funcionar sem ele (a maior parte da base nunca vai ter).
    const resolvedFipe =
      pickedBrand && pickedModel && pickedYear
        ? {
            brandCode: String(pickedBrand.codigo),
            modelCode: String(pickedModel.codigo),
            yearCode: String(pickedYear.codigo),
            code: fipeCode || "",
          }
        : null;
    const keptFipe =
      carToEdit?.fipe &&
      carToEdit.brand === brandName &&
      carToEdit.model === modelName &&
      carToEdit.year === yearName
        ? carToEdit.fipe
        : null;

    const carData = {
      id: carToEdit ? carToEdit.id : Date.now(),
      brand: brandName,
      model: modelName,
      year: yearName,
      fipe: resolvedFipe || keptFipe,
      type: carType,
      targetValue: targetValue,
      // Carro que a pessoa já tem não está sendo poupado: o progresso é total,
      // e é isso que faz o card mostrar custo em vez de barra.
      savedValue: isOwned ? targetValue : savedValue,
      images: photos,
      image: photos[0],
    };

    const saved = await onSave(carData);
    setLoading(false);

    if (saved === true) {
      onClose();
      return;
    }

    // O motivo vem de quem salvou quando existe (limite de tamanho, por
    // exemplo); a mensagem genérica só cobre o resto.
    setError(saved?.message || t("modalCar.saveError"));
  };

  if (!isOpen) return null;

  return (
    <div className="engine-modal-overlay">
      <div className="engine-modal-panel engine-pop sm:max-w-4xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--engine-border)] px-5 py-4 sm:px-7">
          <h2 className="text-lg font-extrabold tracking-tight text-[var(--engine-text)]">
            {carToEdit ? t("modalCar.editTitle") : t("modalCar.newTitle")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("common.cancel")}
            /* 44x44: media 40x40. */
            className="-m-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-subtle)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="engine-modal-body engine-scroll engine-safe-bottom space-y-5 px-5 pt-5 sm:px-7 sm:pt-6"
        >
          {/* Galeria: a primeira foto é a capa. Foto é obrigatória — nada de
              imagem genérica quando a pessoa não envia nada. */}
          <div className="space-y-2">
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {photos.map((photo, index) => (
                  <div
                    key={photo}
                    className="relative aspect-[4/3] min-h-[200px] overflow-hidden rounded-xl border border-[var(--engine-border)] bg-gradient-to-br from-[var(--engine-surface-2)] via-[var(--engine-surface-2)]/50 to-[var(--engine-surface)] flex items-center justify-center"
                  >
                    <img src={photo} alt="" className="h-full w-full object-contain" />
                    {index === 0 && (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">
                        {t("modalCar.cover")}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      title={t("common.delete")}
                      aria-label={t("common.delete")}
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-[var(--engine-accent)]"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < MAX_CAR_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--engine-border-strong)] bg-[var(--engine-surface-2)] transition-colors hover:border-[var(--engine-accent)] disabled:opacity-50 ${
                  photos.length ? "h-20" : "h-40 sm:h-48"
                }`}
              >
                {uploading ? (
                  <Loader2 className="animate-spin text-[var(--engine-accent)]" size={24} />
                ) : (
                  <>
                    {photos.length ? (
                      <Plus className="text-[var(--engine-text-subtle)]" size={22} />
                    ) : (
                      <Upload className="mb-2 text-[var(--engine-text-subtle)]" size={30} />
                    )}
                    <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
                      {photos.length
                        ? t("modalCar.addPhoto", { count: MAX_CAR_PHOTOS - photos.length })
                        : t("modalCar.photo")}
                    </span>
                  </>
                )}
              </button>
            )}

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
            />
          </div>

          <div className="space-y-4">
            {/* Primeira decisão do cadastro, porque muda o resto do formulário
                e o significado do carro no app: meta é o que a pessoa quer,
                owned é o que ela já tem — e só o owned aceita registro de
                gasto. */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: CAR_TYPE_GOAL, label: t("modalCar.typeGoal"), hint: t("modalCar.typeGoalHint") },
                { value: CAR_TYPE_OWNED, label: t("modalCar.typeOwned"), hint: t("modalCar.typeOwnedHint") },
              ].map((option) => {
                const active = carType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCarType(option.value)}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)]"
                        : "border-[var(--engine-border)] hover:border-[var(--engine-accent)]/50"
                    }`}
                  >
                    <span
                      className={`block text-sm font-black ${
                        active ? "text-[var(--engine-accent)]" : "text-[var(--engine-text)]"
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--engine-text-muted)]">
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4">
              <select
                onChange={(e) => handleBrandChange(e.target.value)}
                required={!carToEdit}
                value={selectedBrand}
                className={fieldClass}
              >
                <option value="">
                  {carToEdit
                    ? t("modalCar.brandCurrent", { brand: carToEdit.brand })
                    : t("modalCar.brand")}
                </option>
                {brands.map((b) => (
                  <option key={b.codigo} value={b.codigo}>
                    {b.nome}
                  </option>
                ))}
              </select>

              <select
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={!models.length && !carToEdit}
                required={!carToEdit}
                value={selectedModel}
                className={fieldClass}
              >
                <option value="">
                  {carToEdit
                    ? t("modalCar.modelCurrent", { model: carToEdit.model })
                    : t("modalCar.model")}
                </option>
                {models.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.nome}
                  </option>
                ))}
              </select>

              <select
                onChange={(e) => handleYearSelection(e.target.value)}
                disabled={!years.length && !carToEdit}
                required={!carToEdit}
                value={selectedYear}
                className={fieldClass}
              >
                <option value="">
                  {carToEdit
                    ? t("modalCar.yearCurrent", { year: carToEdit.year })
                    : t("modalCar.year")}
                </option>
                {years.map((y) => (
                  <option key={y.codigo} value={y.codigo}>
                    {formatFipeYear(y.nome, t("car.zeroKm"))}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={`${fieldLabelClass} text-[var(--engine-accent)]`}>
                  {isOwned ? t("modalCar.fipePriceOwned") : t("modalCar.fipePrice")}
                </label>
                <input
                  value={formatDisplayValue(targetValue)}
                  readOnly
                  className="w-full cursor-not-allowed rounded-xl border border-[var(--engine-accent)]/20 bg-[var(--engine-accent-soft)] px-4 py-3 font-bold text-[var(--engine-text)] outline-none"
                />
              </div>
              {/* Quanto já guardou só faz sentido pra carro que ainda é meta:
                  quem já tem o carro não está juntando pra comprá-lo. */}
              {!isOwned && (
                <div className="space-y-1">
                  <label className={`${fieldLabelClass} text-[var(--engine-text-subtle)]`}>
                    {t("modalCar.savedValue")}
                  </label>
                  <input
                    type="text"
                    value={formatDisplayValue(savedValue)}
                    onChange={handleMoneyChange}
                    className={fieldClass}
                  />
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-center text-sm font-semibold text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] py-3 font-semibold tracking-tight text-white shadow-[0_2px_10px_var(--engine-accent-soft)] transition-colors hover:brightness-95 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            {carToEdit ? t("modalCar.update") : t("modalCar.confirm")}
          </button>
        </form>
      </div>

      <ImageCropper
        imageFile={fileForCropping}
        isOpen={isCropperOpen}
        onClose={() => {
          setIsCropperOpen(false);
          setFileForCropping(null);
        }}
        onSave={handleCropperSave}
      />
    </div>
  );
}
