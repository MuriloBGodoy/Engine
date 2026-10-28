import { useState, useEffect, useMemo, useRef } from "react";
import { X, Save, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { auth } from "../services/supabase";
import { CAR_TYPE_GOAL, CAR_TYPE_OWNED, MAX_CAR_PHOTOS } from "../services/db";
import { isFileTooBig, isImageFile, uploadUserPhoto } from "../services/photos";
import { ImageCropper } from "./ImageCropper";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { formatFipeYear } from "../services/carDisplay";
import { localISODate } from "../services/garageInput";
import { useConfirm } from "./ConfirmProvider";

const FIPE_BRANDS_URL = "https://parallelum.com.br/fipe/api/v1/carros/marcas";

// Busca por palavras soltas, sem acento e sem caixa: "onix 1.0 aut" acha
// "ONIX HATCH LTZ 1.0 12V TB Flex 5p Aut.". A GM tem 557 versões na lista e o
// select nativo não filtra nada (auditoria de 25/10/2026).
const foldText = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const filterModels = (models, query) => {
  const tokens = foldText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return models;
  return models.filter((model) => {
    const name = foldText(model.nome);
    return tokens.every((token) => name.includes(token));
  });
};

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
  // "fipe" quando o alvo veio da consulta, "manual" quando a pessoa digitou o
  // preço que achou. `pricedAt` é o dia da consulta: "Preço FIPE" sem data
  // dava a entender que era o de hoje.
  const [priceSource, setPriceSource] = useState(null);
  const [pricedAt, setPricedAt] = useState(null);
  const [savedValue, setSavedValue] = useState(0);
  // Qual chamada da FIPE falhou ("brands" | "models" | "years" | "price").
  // Antes as quatro engoliam o erro: lista vazia e muda, sem "tentar de novo".
  const [fipeError, setFipeError] = useState(null);
  const [modelQuery, setModelQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Resposta velha não sobrescreve seleção nova: quem troca de versão rápido
  // recebia o preço da anterior.
  const requestRef = useRef(0);
  const confirm = useConfirm();
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

  // O alvo é editável: "o preço que eu achei" vale mais que a FIPE para quem
  // está negociando, e é o único conserto quando a FIPE não respondeu.
  const handleTargetChange = (e) => {
    const rawValue = e.target.value.replace(/\D/g, "");
    setTargetValue(Number(rawValue) / 100);
    setPriceSource("manual");
    setPricedAt(null);
  };

  const loadBrands = () => {
    setFipeError(null);
    axios
      .get(FIPE_BRANDS_URL)
      .then((res) => setBrands(res.data))
      .catch(() => setFipeError("brands"));
  };

  useEffect(() => {
    if (!isOpen) return;

    axios
      .get(FIPE_BRANDS_URL)
      .then((res) => setBrands(res.data))
      .catch(() => setFipeError("brands"));

    const timer = setTimeout(() => {
      setFipeError(null);
      setModelQuery("");
      if (carToEdit) {
        setSavedValue(carToEdit.savedValue || 0);
        setTargetValue(carToEdit.targetValue || 0);
        setPriceSource(carToEdit.priceSource || null);
        setPricedAt(carToEdit.pricedAt || null);
      } else {
        setSavedValue(0);
        setTargetValue(0);
        setPriceSource(null);
        setPricedAt(null);
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

  // Toda troca na cascata zera o preço: antes, se a consulta da versão nova
  // falhasse, o carro era salvo com o preço da versão ANTERIOR.
  const clearPrice = () => {
    setTargetValue(0);
    setPriceSource(null);
    setPricedAt(null);
    setFipeCode("");
  };

  const loadModels = (brandId) => {
    const request = ++requestRef.current;
    setFipeError(null);
    setLoading(true);
    axios
      .get(`${FIPE_BRANDS_URL}/${brandId}/modelos`)
      .then((res) => {
        if (request !== requestRef.current) return;
        setModels(res.data.modelos || []);
      })
      .catch(() => request === requestRef.current && setFipeError("models"))
      .finally(() => request === requestRef.current && setLoading(false));
  };

  const loadYears = (brandId, modelId) => {
    const request = ++requestRef.current;
    setFipeError(null);
    setLoading(true);
    axios
      .get(`${FIPE_BRANDS_URL}/${brandId}/modelos/${modelId}/anos`)
      .then((res) => {
        if (request !== requestRef.current) return;
        setYears(res.data || []);
      })
      .catch(() => request === requestRef.current && setFipeError("years"))
      .finally(() => request === requestRef.current && setLoading(false));
  };

  const loadPrice = (brandId, modelId, yearId) => {
    const request = ++requestRef.current;
    setFipeError(null);
    setLoading(true);
    return axios
      .get(`${FIPE_BRANDS_URL}/${brandId}/modelos/${modelId}/anos/${yearId}`)
      .then((res) => {
        if (request !== requestRef.current) return;
        const valorLimpo = Number(String(res.data.Valor || "").replace(/\D/g, "")) / 100;
        if (!valorLimpo) throw new Error("FIPE sem preço");
        setTargetValue(valorLimpo);
        setPriceSource("fipe");
        setPricedAt(localISODate());
        // `CodigoFipe` só existe nesta resposta e é a chave canônica do
        // veículo no Brasil. Vinha sendo descartada junto com o resto.
        setFipeCode(res.data.CodigoFipe || "");
      })
      .catch(() => request === requestRef.current && setFipeError("price"))
      .finally(() => request === requestRef.current && setLoading(false));
  };

  const handleBrandChange = (brandId) => {
    setSelectedBrand(brandId);
    setModels([]);
    setModelQuery("");
    // Limpa o que estava abaixo na cascata: um código de modelo da marca
    // anterior emparelhado com a marca nova aponta para outro carro.
    setSelectedModel("");
    setSelectedYear("");
    setYears([]);
    clearPrice();
    if (brandId) loadModels(brandId);
    else requestRef.current += 1;
  };

  const handleModelChange = (modelId) => {
    setSelectedModel(modelId);
    setYears([]);
    setSelectedYear("");
    clearPrice();
    if (modelId) loadYears(selectedBrand, modelId);
    else requestRef.current += 1;
  };

  const handleYearSelection = (yearId) => {
    setSelectedYear(yearId);
    clearPrice();
    if (yearId) loadPrice(selectedBrand, selectedModel, yearId);
    else requestRef.current += 1;
  };

  const retryFipe = () => {
    if (fipeError === "brands") loadBrands();
    else if (fipeError === "models" && selectedBrand) loadModels(selectedBrand);
    else if (fipeError === "years" && selectedModel) loadYears(selectedBrand, selectedModel);
    else if (fipeError === "price" && selectedYear) loadPrice(selectedBrand, selectedModel, selectedYear);
    else if (fipeError === "price" && carToEdit?.fipe) refreshFipePrice();
  };

  // Reconsulta pelo trio de códigos já gravado: a meta congelava no preço do
  // dia do cadastro. Carro antigo sem `fipe` refaz a cascata.
  const refreshFipePrice = async () => {
    const codes = carToEdit?.fipe;
    if (!codes) return;
    setRefreshing(true);
    await loadPrice(codes.brandCode, codes.modelCode, codes.yearCode);
    setRefreshing(false);
  };

  const filteredModels = useMemo(() => {
    const list = filterModels(models, modelQuery);
    // A versão escolhida continua na lista mesmo fora do filtro, senão o
    // select nativo mostra vazio com um valor selecionado.
    if (selectedModel && !list.some((m) => String(m.codigo) === String(selectedModel))) {
      const picked = models.find((m) => String(m.codigo) === String(selectedModel));
      if (picked) return [picked, ...list];
    }
    return list;
  }, [models, modelQuery, selectedModel]);

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

    // Meta com alvo 0 vira "Falta 100% · R$ 0" e uma previsão sem sentido.
    // Carro próprio pode entrar sem valor, mas só se a pessoa disser que sim.
    if (!(targetValue > 0)) {
      if (!isOwned) {
        setError(t("garageFixes.fipe.targetRequired"));
        setLoading(false);
        return;
      }
      const ok = await confirm({
        title: t("garageFixes.fipe.zeroOwnedTitle"),
        message: t("garageFixes.fipe.zeroOwnedBody"),
        confirmLabel: t("garageFixes.fipe.zeroOwnedConfirm"),
        tone: "neutral",
      });
      if (!ok) {
        setLoading(false);
        return;
      }
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
      priceSource,
      pricedAt: priceSource === "fipe" ? pricedAt : null,
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
          {/* Galeria: a primeira foto é a capa. Foto é opcional desde
              25/09/2026; quem não envia vê o placeholder, nunca foto de banco. */}
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

              {/* Filtro digitável: a lista da marca tem até ~560 versões e o
                  select nativo não busca. A busca filtra a lista que já veio
                  da FIPE, sem chamada nova. */}
              {models.length > 0 && (
                <label className="block space-y-1">
                  <span className={`${fieldLabelClass} text-[var(--engine-text-subtle)]`}>
                    {t("garageFixes.fipe.filterLabel")}
                  </span>
                  <input
                    type="search"
                    value={modelQuery}
                    onChange={(e) => setModelQuery(e.target.value)}
                    placeholder={t("garageFixes.fipe.filterPlaceholder")}
                    autoComplete="off"
                    enterKeyHint="search"
                    className={`${fieldClass} min-h-11`}
                  />
                  <span className="ml-1 block text-[11px] text-[var(--engine-text-muted)]">
                    {modelQuery.trim() && filteredModels.length === 0
                      ? t("garageFixes.fipe.filterEmpty")
                      : t("garageFixes.fipe.filterCount", {
                          count: filteredModels.length,
                          total: models.length,
                        })}
                  </span>
                </label>
              )}

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
                {filteredModels.map((m) => (
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

              {fipeError && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--engine-accent)]/30 bg-[var(--engine-accent-soft)] px-3.5 py-2"
                >
                  <span className="text-xs font-semibold text-[var(--engine-text)]">
                    {t(`garageFixes.fipe.${fipeError}Error`)}
                  </span>
                  <button
                    type="button"
                    onClick={retryFipe}
                    className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-black uppercase tracking-wider text-[var(--engine-accent)] transition hover:bg-[var(--engine-surface-2)]"
                  >
                    <RefreshCw size={14} />
                    {t("garageFixes.fipe.retry")}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="engine-car-target"
                  className={`${fieldLabelClass} text-[var(--engine-accent)]`}
                >
                  {priceSource === "manual"
                    ? t("garageFixes.fipe.manualPrice")
                    : isOwned
                      ? t("modalCar.fipePriceOwned")
                      : t("modalCar.fipePrice")}
                </label>
                <input
                  id="engine-car-target"
                  type="text"
                  inputMode="numeric"
                  value={formatDisplayValue(targetValue)}
                  onChange={handleTargetChange}
                  className="w-full rounded-xl border border-[var(--engine-accent)]/20 bg-[var(--engine-accent-soft)] px-4 py-3 font-bold text-[var(--engine-text)] outline-none transition-colors focus:border-[var(--engine-accent)]"
                />
                <p className="ml-1 text-[11px] text-[var(--engine-text-muted)]">
                  {priceSource === "fipe" && pricedAt
                    ? t("garageFixes.fipe.pricedAt", {
                        date: new Date(`${pricedAt}T12:00:00`).toLocaleDateString(i18n.language),
                      })
                    : priceSource !== "manual" && carToEdit && targetValue > 0
                      ? t("garageFixes.fipe.pricedAtUnknown")
                      : t("garageFixes.fipe.editPriceHint")}
                </p>
                {carToEdit?.fipe && !selectedYear && (
                  <button
                    type="button"
                    onClick={refreshFipePrice}
                    disabled={refreshing || loading}
                    className="flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-bold text-[var(--engine-accent)] transition hover:underline disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                    {refreshing ? t("garageFixes.fipe.refreshing") : t("garageFixes.fipe.refreshPrice")}
                  </button>
                )}
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
                    inputMode="numeric"
                    value={formatDisplayValue(savedValue)}
                    onChange={handleMoneyChange}
                    className={fieldClass}
                  />
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-center text-sm font-semibold text-[var(--engine-accent)]">
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
