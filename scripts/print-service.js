(function () {
  const API_BASE = "/api";
  const page = window.location.pathname.split("/").pop();
  const serviceByPage = {
    "print-step-1.html": { type: "scan", name: "Сканирование" },
    "print-step-2.html": { type: "modeling", name: "Моделирование" },
    "print-step-3.html": { type: "print", name: "3Д печать" },
  };
  const service = serviceByPage[page] || { type: "print", name: "Услуга" };
  const form = document.querySelector("form.config-row");
  const sumEl = document.querySelector(".sum");
  const volumeEl = document.getElementById("model-volume-value");
  const checkoutLinks = document.querySelectorAll('a[href^="checkout.html"]');
  let checkoutLinksWired = false;
  let uploadedFile = null;
  let localModelFile = null;
  let previewObjectUrl = null;
  let modelVolumeCm3 = 0;
  let selectedPrintVariant = null;
  let printInventory = { technologies: [], variants: [] };
  let printOptionMaps = { technology: new Map(), material: new Map(), color: new Map(), thickness: new Map() };
  let hasUserInteractedWithCalculator = false;
  let priceRequestId = 0;
  let priceLoading = false;
  let priceLoadingStartedAt = 0;
  let priceDebounceTimer = 0;
  let lastQuotedTotalRub = 0;
  const SELECT_PLACEHOLDERS = {
    tech: "Технологии",
    material: "Материалы",
    color: "Цвета",
    thickness: "Толщина",
  };
  const DRAFT_KEY = `print_service_draft_${service.type}`;
  const QUOTE_STEP_KEY = `print_service_quote_step_${service.type}`;
  const POST_LOGIN_REDIRECT_KEY = "app.postLoginRedirect";
  const QUOTE_STATUSES = {
    modeling: "Ожидает оценки",
    scan: "Ожидает оценки",
  };

  const PRINT_TECH_TEMPLATES = [
    { code: "fdm", name: "FDM / FFF", materials: ["pla", "abs", "petg", "tpu", "nylon"], thicknesses: [0.05, 0.1, 0.2, 0.3, 0.5] },
    { code: "sla", name: "SLA", materials: ["resin_standard", "resin_engineering", "resin_dental", "resin_jewelry", "resin_flexible"], thicknesses: [0.025, 0.05, 0.1] },
    { code: "dlp", name: "DLP", materials: ["resin_standard", "resin_engineering", "resin_dental", "resin_flexible"], thicknesses: [0.035, 0.05, 0.1, 0.15] },
    { code: "lcd_msla", name: "LCD / MSLA", materials: ["resin_standard", "resin_engineering", "resin_dental", "resin_flexible"], thicknesses: [0.035, 0.05, 0.1, 0.15] },
    { code: "sls", name: "SLS", materials: ["pa12", "pa11", "tpi_powder", "pa_glass", "pa_carbon"], thicknesses: [0.08, 0.1, 0.15, 0.2] },
    { code: "dmls_slm", name: "DMLS / SLM", materials: ["steel316l", "alsi10mg", "ti6al4v", "cobalt_chrome", "inconel718"], thicknesses: [0.02, 0.03, 0.05, 0.1] },
    { code: "binder_jetting", name: "Binder Jetting", materials: ["powder_steel", "sand", "gypsum", "powder_polymer"], thicknesses: [0.1, 0.2, 0.3] },
    {
      code: "material_jetting",
      name: "Material Jetting",
      materials: ["photopolymer_multi", "photopolymer_elastic", "photopolymer_transparent", "photopolymer_biocompatible"],
      thicknesses: [0.016, 0.02, 0.03, 0.04, 0.06],
    },
    { code: "lom", name: "LOM", materials: ["paper", "pvc", "metal_foil"], thicknesses: [0.06, 0.1, 0.2, 0.3] },
  ];

  const MODEL_EXTS = ["stl", "obj", "amf", "3mf", "fbx"];
  const SOURCE_FILE_EXTS = ["stl", "obj", "amf", "3mf", "fbx", "jpg", "jpeg", "png", "webp", "pdf", "dwg", "dxf"];
  const THREE_VER = "0.125.2";
  const THREE_BASE = `https://unpkg.com/three@${THREE_VER}`;
  const FFLATE_SRC = "https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js";
  const BRIEF_LABELS = {
    modelingKind: {
      new_model: "Новая модель с нуля",
      improve_file: "Доработать существующий файл",
      print_prep: "Подготовить модель к печати",
      fix_geometry: "Исправить ошибки геометрии",
    },
    modelingObjectType: {
      technical: "Техническая деталь",
      decorative: "Декоративная модель",
      enclosure: "Корпус / крышка / крепление",
      prototype: "Макет или прототип",
      other: "Другое",
    },
    scanObjectType: {
      part: "Деталь или запчасть",
      enclosure: "Корпус",
      figurine: "Фигурка / декоративный объект",
      mechanism: "Механизм / сборка",
      other: "Другое",
    },
    objectSize: {
      small: "Маленький (до 10 см)",
      medium: "Средний (10-40 см)",
      large: "Большой (больше 40 см)",
    },
    surfaceType: {
      matte: "Матовая",
      glossy: "Глянцевая",
      transparent: "Прозрачная",
      dark: "Тёмная",
      metal: "Металлическая",
    },
    scanResult: {
      digital_model: "Только цифровая модель",
      model_and_print: "Цифровая модель + печать копии",
      reverse_engineering: "Обратное проектирование",
    },
    serviceAccuracy: {
      draft: "Примерная",
      standard: "Обычная",
      high: "Высокая",
      maximum: "Максимально точная",
    },
    transferMethod: {
      post: "Отправить по почте",
      handoff: "Передать вручную / привезти",
      discuss: "Согласовать с консультантом",
    },
  };

  const QUOTE_ICON_PATHS = {
    "modelingKind:new_model": '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    "modelingKind:improve_file": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    "modelingKind:print_prep": '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
    "modelingKind:fix_geometry": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.8 7.8L7.7 19.3a2.4 2.4 0 0 1-3.4-3.4L9.6 10.6a6 6 0 0 1 7.8-7.8z"/>',
    "scanObjectType:part": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.3a2 2 0 1 1-4 0V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.7a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6v-.3a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.3a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"/>',
    "scanObjectType:enclosure": '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/>',
    "scanObjectType:figurine": '<circle cx="12" cy="5" r="2"/><path d="M10 22v-5l-2-2 2-5h4l2 5-2 2v5"/><path d="M8 22h8"/>',
    "scanObjectType:mechanism": '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="M10.2 10.2 13.8 13.8"/><path d="M8 2v3"/><path d="M8 11v3"/><path d="M2 8h3"/><path d="M11 8h3"/><path d="M16 10v3"/><path d="M16 19v3"/><path d="M10 16h3"/><path d="M19 16h3"/>',
    "scanObjectType:other": '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4"/><path d="M12 17h.01"/>',
  };

  function modelExtFromName(filename) {
    const lower = String(filename || "").toLowerCase();
    for (const ext of MODEL_EXTS) {
      if (lower.endsWith(`.${ext}`)) return ext;
    }
    return "";
  }

  function sourceExtFromName(filename) {
    const lower = String(filename || "").toLowerCase();
    for (const ext of SOURCE_FILE_EXTS) {
      if (lower.endsWith(`.${ext}`)) return ext;
    }
    return "";
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data.message || data.error || "Ошибка запроса";
      const error = new Error(typeof msg === "string" ? msg : "Ошибка запроса");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function fieldValue(name) {
    return String(form?.elements?.[name]?.value || "").trim();
  }

  function fieldChecked(name) {
    return Boolean(form?.elements?.[name]?.checked);
  }

  function labelFor(group, value) {
    return BRIEF_LABELS[group]?.[String(value || "")] || String(value || "");
  }

  function buildServiceBrief() {
    const previous = readDraft().serviceBrief || {};
    if (service.type === "modeling") {
      const description = String(document.getElementById("modeling-task-text")?.value || "").trim();
      return {
        ...previous,
        kind: fieldValue("modelingKind") || previous.kind || "",
        kindLabel: labelFor("modelingKind", fieldValue("modelingKind") || previous.kind),
        objectType: fieldValue("modelingObjectType") || previous.objectType || "",
        objectTypeLabel: labelFor("modelingObjectType", fieldValue("modelingObjectType") || previous.objectType),
        accuracy: fieldValue("serviceAccuracy") || previous.accuracy || "",
        accuracyLabel: labelFor("serviceAccuracy", fieldValue("serviceAccuracy") || previous.accuracy),
        printAfterModeling: form?.elements?.printAfterModeling ? fieldChecked("printAfterModeling") : Boolean(previous.printAfterModeling),
        phoneConfirmed: fieldValue("phoneConfirmed") || previous.phoneConfirmed || "",
        description: description || previous.description || "",
      };
    }
    if (service.type === "scan") {
      const description = String(document.getElementById("scan-task-text")?.value || "").trim();
      return {
        ...previous,
        objectType: fieldValue("scanObjectType") || previous.objectType || "",
        objectTypeLabel: labelFor("scanObjectType", fieldValue("scanObjectType") || previous.objectType),
        objectSize: fieldValue("objectSize") || previous.objectSize || "",
        objectSizeLabel: labelFor("objectSize", fieldValue("objectSize") || previous.objectSize),
        surfaceType: fieldValue("surfaceType") || previous.surfaceType || "",
        surfaceTypeLabel: labelFor("surfaceType", fieldValue("surfaceType") || previous.surfaceType),
        resultType: fieldValue("scanResult") || previous.resultType || "",
        resultTypeLabel: labelFor("scanResult", fieldValue("scanResult") || previous.resultType),
        accuracy: fieldValue("serviceAccuracy") || previous.accuracy || "",
        accuracyLabel: labelFor("serviceAccuracy", fieldValue("serviceAccuracy") || previous.accuracy),
        transferMethod: fieldValue("transferMethod") || previous.transferMethod || "",
        transferMethodLabel: labelFor("transferMethod", fieldValue("transferMethod") || previous.transferMethod),
        phoneConfirmed: fieldValue("phoneConfirmed") || previous.phoneConfirmed || "",
        lengthMm: Number(fieldValue("lengthMm") || previous.lengthMm || 0),
        widthMm: Number(fieldValue("widthMm") || previous.widthMm || 0),
        heightMm: Number(fieldValue("heightMm") || previous.heightMm || 0),
        description: description || previous.description || "",
      };
    }
    return {};
  }

  function estimateServiceMetrics(brief) {
    if (service.type === "modeling") {
      const kindK = { new_model: 2, improve_file: 1.25, print_prep: 1, fix_geometry: 1.5 }[brief.kind] || 1;
      const typeK = { technical: 1.5, decorative: 1.2, enclosure: 1.4, prototype: 1.15, other: 1.1 }[brief.objectType] || 1;
      const accuracyK = { draft: 1, standard: 1.25, high: 1.7, maximum: 2.2 }[brief.accuracy] || 1;
      const complexity = Math.max(1, Math.min(5, Math.round((kindK + typeK + accuracyK - 2) * 1.4)));
      const estimatedHours = Math.max(1, Math.round(2 * kindK * typeK * accuracyK));
      return { complexity, estimatedHours };
    }
    if (service.type === "scan") {
      const sizeK = { small: 1, medium: 1.6, large: 2.4 }[brief.objectSize] || 1;
      const surfaceK = { matte: 1, glossy: 1.35, transparent: 1.9, dark: 1.25, metal: 1.6 }[brief.surfaceType] || 1;
      const resultK = { digital_model: 1, model_and_print: 1.25, reverse_engineering: 1.8 }[brief.resultType] || 1;
      const accuracyK = { draft: 1, standard: 1.2, high: 1.6, maximum: 2.1 }[brief.accuracy] || 1;
      const dimensions = [brief.lengthMm, brief.widthMm, brief.heightMm].filter((value) => Number(value) > 0);
      const dimensionK = dimensions.length === 3 && Math.max(...dimensions) > 400 ? 1.25 : 1;
      const raw = sizeK * surfaceK * resultK * accuracyK * dimensionK;
      const complexity = Math.max(1, Math.min(6, Math.round(raw)));
      const estimatedHours = Math.max(1, Math.round(1.5 * raw));
      return { complexity, estimatedHours };
    }
    return {
      complexity: Number(form?.elements.complexity?.value || 1),
      estimatedHours: Number(form?.elements.estimatedHours?.value || 1),
    };
  }

  function buildPayload() {
    const serviceBrief = buildServiceBrief();
    const metrics = estimateServiceMetrics(serviceBrief);
    const complexity = Number(metrics.complexity || 1);
    const estimatedHours = Number(metrics.estimatedHours || 1);
    return {
      serviceType: service.type,
      serviceName: service.name,
      material: String(selectedPrintVariant?.materialCode || ""),
      technology: String(form?.elements.tech?.value || selectedPrintVariant?.technologyCode || ""),
      color: String(form?.elements.color?.value || selectedPrintVariant?.colorCode || ""),
      thickness: String(form?.elements.thickness?.value || selectedPrintVariant?.thicknessMm || ""),
      qty: Number(form?.elements.qty?.value || 1),
      modelVolumeCm3,
      complexity: Number.isFinite(complexity) ? complexity : 1,
      estimatedHours: Number.isFinite(estimatedHours) ? estimatedHours : 1,
      modelingTask: String(document.getElementById("modeling-task-text")?.value || document.getElementById("scan-task-text")?.value || ""),
      serviceBrief,
      uploadedFile,
    };
  }

  function saveDraft() {
    if (!form) return;
    const draft = {
      tech: String(form.elements.tech?.value || ""),
      material: String(form.elements.material?.value || ""),
      color: String(form.elements.color?.value || ""),
      thickness: String(form.elements.thickness?.value || ""),
      qty: Number(form.elements.qty?.value || 1),
      modelingTask: String(document.getElementById("modeling-task-text")?.value || ""),
      scanTask: String(document.getElementById("scan-task-text")?.value || ""),
      serviceBrief: buildServiceBrief(),
    };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (_error) {

    }
  }

  function restoreDraft() {
    if (!form) return;
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}");
      if (!draft || typeof draft !== "object") return null;
      if (draft && typeof draft === "object") {
        if (Number(draft.qty) > 0 && form.elements.qty) {
          form.elements.qty.value = String(Number(draft.qty));
        }
        if (typeof draft.tech === "string" && form.elements.tech) form.elements.tech.value = draft.tech;
        if (typeof draft.material === "string" && form.elements.material) form.elements.material.value = draft.material;
        if (typeof draft.color === "string" && form.elements.color) form.elements.color.value = draft.color;
        if (typeof draft.thickness === "string" && form.elements.thickness) form.elements.thickness.value = draft.thickness;
      }
      const hasMeaningfulData =
        Boolean(String(draft.tech || "").trim()) ||
        Boolean(String(draft.material || "").trim()) ||
        Boolean(String(draft.color || "").trim()) ||
        Boolean(String(draft.thickness || "").trim()) ||
        Number(draft.qty || 0) > 1 ||
        Boolean(String(draft.modelingTask || "").trim()) ||
        Boolean(String(draft.scanTask || "").trim()) ||
        Boolean(draft.serviceBrief && typeof draft.serviceBrief === "object" && Object.values(draft.serviceBrief).some((value) => String(value || "").trim()));
      return hasMeaningfulData ? draft : null;
    } catch (_error) {
      return null;
    }
  }

  function isPageReload() {
    try {
      const navigation = performance.getEntriesByType?.("navigation")?.[0];
      if (navigation?.type) return navigation.type === "reload";
      return performance.navigation?.type === 1;
    } catch (_error) {
      return false;
    }
  }

  function clearQuoteDraftOnReload() {
    if (service.type === "print" || !isPageReload()) return;
    try {
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(QUOTE_STEP_KEY);
    } catch (_error) {

    }
  }

  function formatNumberRu(value, digits = 2) {
    const num = Number(value || 0);
    return num.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function updateVolumeUi() {
    if (volumeEl) {
      volumeEl.textContent = modelVolumeCm3 > 0 ? `${formatNumberRu(modelVolumeCm3)} см3` : "—";
    }
  }

  function pickPrintVariant() {
    if (!form || service.type !== "print") return;
    const tech = String(form.elements.tech?.value || "");
    const material = String(form.elements.material?.value || "");
    const color = String(form.elements.color?.value || "");
    const thickness = Number(form.elements.thickness?.value || 0);
    const candidates = printInventory.variants.filter(
      (variant) =>
        variant.technologyCode === tech &&
        variant.materialCode === material &&
        variant.colorCode === color &&
        Number(variant.thicknessMm || 0) === thickness
    );
    selectedPrintVariant = candidates[0] || null;
  }

  function fillSelect(select, items, mapItem) {
    if (!select) return;
    const html = items.map(mapItem).join("");
    select.innerHTML = html || '<option value="">Нет доступных вариантов</option>';
  }

  function formatOptionName(value) {
    const raw = String(value || "").replace(/[_-]+/g, " ").trim();
    if (!raw) return "";
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  function formatThicknessLabel(value) {
    return `${String(Number(value).toFixed(3)).replace(/\.?0+$/, "").replace(".", ",")} мм`;
  }

  function setDisabledPlaceholder(select, text) {
    if (!select) return;
    select.innerHTML = `<option value="">${text}</option>`;
    select.value = "";
    select.disabled = true;
  }

  function resetSelectWithPlaceholder(select, key, disabled) {
    if (!select) return;
    select.innerHTML = `<option value="">${SELECT_PLACEHOLDERS[key] || ""}</option>`;
    select.value = "";
    select.disabled = Boolean(disabled);
  }

  function setPriceValue(value) {
    if (!sumEl) return;
    sumEl.classList.remove("is-loading");
    lastQuotedTotalRub = Number(value || 0);
    sumEl.textContent = `${lastQuotedTotalRub} ₽`;
  }

  function setPriceLoading(isLoading) {
    if (!sumEl) return;
    priceLoading = isLoading;
    if (isLoading) {
      priceLoadingStartedAt = Date.now();
      sumEl.classList.add("is-loading");
      sumEl.innerHTML = '<span class="price-spinner" aria-hidden="true"></span><span class="price-loading-text">Расчет...</span>';
      return;
    }
    sumEl.classList.remove("is-loading");
  }

  async function stopPriceLoadingWithMinDelay() {
    if (!priceLoading) return;
    const elapsed = Date.now() - Number(priceLoadingStartedAt || 0);
    const minVisibleMs = 300;
    if (elapsed < minVisibleMs) {
      await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
    }
    setPriceLoading(false);
  }

  function hasRequiredSelections(payload) {
    if (!payload) return false;
    const hasQty = Number(payload.qty || 0) >= 1;
    if (!hasQty) return false;
    if (service.type === "modeling") {
      const brief = payload.serviceBrief || {};
      return (
        Boolean(String(brief.kind || "").trim()) &&
        Boolean(String(brief.objectType || "").trim()) &&
        Boolean(String(brief.accuracy || "").trim()) &&
        String(brief.description || "").trim().length >= 12
      );
    }
    if (service.type === "scan") {
      const brief = payload.serviceBrief || {};
      return (
        Boolean(String(brief.objectType || "").trim()) &&
        Boolean(String(brief.objectSize || "").trim()) &&
        Boolean(String(brief.surfaceType || "").trim()) &&
        Boolean(String(brief.resultType || "").trim()) &&
        Boolean(String(brief.accuracy || "").trim()) &&
        Boolean(String(brief.transferMethod || "").trim())
      );
    }
    const hasPrintSelections =
      Boolean(payload.technology) &&
      Boolean(payload.material) &&
      Boolean(payload.color) &&
      Boolean(payload.thickness);
    if (!hasPrintSelections) return false;
    return Boolean(localModelFile || uploadedFile?.path);
  }

  
  function canCheckoutToPayment() {
    if (priceLoading) return false;
    const payload = buildPayload();
    return hasUserInteractedWithCalculator && hasRequiredSelections(payload) && lastQuotedTotalRub > 0;
  }

  function getGlobalActiveThicknesses() {
    return Array.from(
      new Map(
        Array.from((printOptionMaps.thickness || new Map()).values())
          .filter((row) => row.active)
          .map((row) => [Number(row.code), row])
      ).values()
    )
      .sort((a, b) => Number(a.code) - Number(b.code))
      .map((row) => ({ code: String(row.code), name: row.name || formatThicknessLabel(row.code) }));
  }

  function getThicknessesByTemplate(selectedTemplate) {
    const globalThicknesses = getGlobalActiveThicknesses();
    const allowed = (selectedTemplate?.thicknesses || []).map((value) => Number(value));

    if (!allowed.length) return globalThicknesses;
    const filtered = globalThicknesses.filter((row) => allowed.includes(Number(row.code)));
    return filtered.length ? filtered : globalThicknesses;
  }

  function syncNonPrintSelectors() {
    if (!form || service.type === "print") return;
    const techSelect = form.elements.tech;
    const materialSelect = form.elements.material;
    const colorSelect = form.elements.color;
    const thicknessSelect = form.elements.thickness;
    if (!techSelect || !materialSelect || !colorSelect || !thicknessSelect) return;

    const prevTech = String(techSelect.value || "");
    const prevMaterial = String(materialSelect.value || "");
    const prevColor = String(colorSelect.value || "");
    const prevThickness = String(thicknessSelect.value || "");

    const activeTechs = Array.from(printOptionMaps.technology.values()).filter((row) => row.active);
    fillSelect(techSelect, [{ code: "", name: SELECT_PLACEHOLDERS.tech }, ...activeTechs], (item) => {
      const disabled = item.code ? "" : "";
      return `<option value="${item.code}"${disabled}>${item.name}</option>`;
    });
    techSelect.value = activeTechs.some((row) => row.code === prevTech) ? prevTech : "";
    if (!techSelect.value) {
      resetSelectWithPlaceholder(materialSelect, "material", true);
      resetSelectWithPlaceholder(colorSelect, "color", true);
      resetSelectWithPlaceholder(thicknessSelect, "thickness", true);
      return;
    }

    const selectedTemplate = PRINT_TECH_TEMPLATES.find((row) => row.code === techSelect.value);
    const activeMaterials = Array.from(printOptionMaps.material.values()).filter((row) => row.active);
    const materialsFromTemplate = (selectedTemplate?.materials || [])
      .map((code) => activeMaterials.find((row) => row.code === code))
      .filter(Boolean);
    const materials = materialsFromTemplate.length ? materialsFromTemplate : activeMaterials;
    fillSelect(materialSelect, [{ code: "", name: SELECT_PLACEHOLDERS.material }, ...materials], (item) => {
      const disabled = item.code ? "" : "";
      return `<option value="${item.code}"${disabled}>${item.name}</option>`;
    });
    materialSelect.disabled = materials.length === 0;
    materialSelect.value = materials.some((row) => row.code === prevMaterial) ? prevMaterial : "";
    if (!materialSelect.value && materials.length === 1) materialSelect.value = materials[0].code;
    if (!materialSelect.value) {
      resetSelectWithPlaceholder(colorSelect, "color", true);
      resetSelectWithPlaceholder(thicknessSelect, "thickness", true);
      return;
    }

    const activeColors = Array.from(printOptionMaps.color.values()).filter((row) => row.active);
    const materialCode = String(materialSelect.value || "");
    const needsNaturalColor = /steel|inconel|cobalt|alsi|ti6|powder|sand|gypsum|paper|foil|pa\d|resin/i.test(materialCode);
    const colors = needsNaturalColor ? activeColors.filter((row) => row.code === "natural") : activeColors.filter((row) => row.code !== "natural");
    fillSelect(colorSelect, [{ code: "", name: SELECT_PLACEHOLDERS.color }, ...colors], (item) => {
      const disabled = item.code ? "" : "";
      return `<option value="${item.code}"${disabled}>${item.name}</option>`;
    });
    colorSelect.disabled = colors.length <= 1;
    colorSelect.value = colors.some((row) => row.code === prevColor) ? prevColor : "";
    if (!colorSelect.value && colors.length === 1) colorSelect.value = colors[0].code;

    const thicknesses = getThicknessesByTemplate(selectedTemplate);
    fillSelect(thicknessSelect, [{ code: "", name: SELECT_PLACEHOLDERS.thickness }, ...thicknesses], (item) => {
      return `<option value="${item.code}">${item.name}</option>`;
    });
    thicknessSelect.disabled = thicknesses.length === 0;
    thicknessSelect.value = thicknesses.some((row) => row.code === prevThickness) ? prevThickness : "";
    if (!thicknessSelect.value && thicknesses.length === 1) thicknessSelect.value = thicknesses[0].code;
  }

  function syncPrintSelectors() {
    if (!form || service.type !== "print") return;
    const techSelect = form.elements.tech;
    const materialSelect = form.elements.material;
    const colorSelect = form.elements.color;
    const thicknessSelect = form.elements.thickness;
    if (!techSelect || !materialSelect || !colorSelect || !thicknessSelect) return;
    const prevTech = String(techSelect.value || "");
    const prevMaterial = String(materialSelect.value || "");
    const prevColor = String(colorSelect.value || "");
    const prevThickness = String(thicknessSelect.value || "");

    const activeTechCodes = new Set(printInventory.technologies.map((item) => item.code));
    const allowedTechs = PRINT_TECH_TEMPLATES.filter((tech) => activeTechCodes.has(tech.code));
    fillSelect(techSelect, [{ code: "", name: SELECT_PLACEHOLDERS.tech }, ...allowedTechs], (item) => {
      const disabled = item.code ? "" : "";
      return `<option value="${item.code}"${disabled}>${item.name}</option>`;
    });
    techSelect.value = allowedTechs.some((tech) => tech.code === prevTech) ? prevTech : "";
    if (!techSelect.value) {
      resetSelectWithPlaceholder(materialSelect, "material", true);
      resetSelectWithPlaceholder(colorSelect, "color", true);
      resetSelectWithPlaceholder(thicknessSelect, "thickness", true);
      selectedPrintVariant = null;
      return;
    }

    const selectedTechTemplate = PRINT_TECH_TEMPLATES.find((tech) => tech.code === techSelect.value);
    const techVariants = printInventory.variants.filter(
      (variant) => variant.technologyCode === techSelect.value && variant.availableQty > 0
    );
    const availableMaterialCodes = new Set(techVariants.map((variant) => variant.materialCode));
    const materials = (selectedTechTemplate?.materials || [])
      .filter((code) => availableMaterialCodes.has(code))
      .map((code) => ({
        code,
        name: printOptionMaps.material.get(code)?.name || formatOptionName(code),
      }));
    fillSelect(materialSelect, [{ code: "", name: SELECT_PLACEHOLDERS.material }, ...materials], (item) => {
      const disabled = item.code ? "" : "";
      return `<option value="${item.code}"${disabled}>${item.name}</option>`;
    });
    materialSelect.disabled = materials.length === 0;
    materialSelect.value = materials.some((item) => item.code === prevMaterial) ? prevMaterial : "";
    if (!materialSelect.value && materials.length === 1) materialSelect.value = materials[0].code;
    if (!materialSelect.value) {
      resetSelectWithPlaceholder(colorSelect, "color", true);
      const fallbackThicknesses = getThicknessesByTemplate(selectedTechTemplate);
      fillSelect(thicknessSelect, [{ code: "", name: SELECT_PLACEHOLDERS.thickness }, ...fallbackThicknesses], (item) => {
        return `<option value="${item.code}">${item.name}</option>`;
      });
      thicknessSelect.disabled = fallbackThicknesses.length === 0;
      if (fallbackThicknesses.length === 1) thicknessSelect.value = fallbackThicknesses[0].code;
      selectedPrintVariant = null;
      return;
    }

    const materialVariants = techVariants.filter((variant) => variant.materialCode === materialSelect.value);
    const colorCandidates = Array.from(new Map(materialVariants.map((variant) => [variant.colorCode, variant.colorName])).entries()).map(
      ([code, name]) => ({ code, name: name || printOptionMaps.color.get(code)?.name || formatOptionName(code) })
    );
    fillSelect(colorSelect, [{ code: "", name: SELECT_PLACEHOLDERS.color }, ...colorCandidates], (item) => {
      const disabled = item.code ? "" : "";
      return `<option value="${item.code}"${disabled}>${item.name}</option>`;
    });
    colorSelect.value = colorCandidates.some((item) => item.code === prevColor) ? prevColor : "";
    if (!colorSelect.value && colorCandidates.length === 1) colorSelect.value = colorCandidates[0].code;
    colorSelect.disabled = colorCandidates.length <= 1;
    const thicknessSource = colorSelect.value
      ? materialVariants.filter((variant) => variant.colorCode === colorSelect.value)
      : materialVariants;
    const thicknesses = Array.from(new Set(thicknessSource.map((variant) => Number(variant.thicknessMm || 0))))
      .filter((value) => value > 0)
      .sort((a, b) => a - b)
      .map((value) => ({ code: String(value), name: formatThicknessLabel(value) }));
    thicknessSelect.disabled = thicknesses.length === 0;
    fillSelect(thicknessSelect, [{ code: "", name: SELECT_PLACEHOLDERS.thickness }, ...thicknesses], (item) => {
      return `<option value="${item.code}">${item.name}</option>`;
    });
    if (thicknesses.length && thicknesses.some((item) => item.code === prevThickness)) thicknessSelect.value = prevThickness;
    else if (thicknesses.length) thicknessSelect.value = "";
    if (!thicknesses.length) setDisabledPlaceholder(thicknessSelect, "Нет доступной толщины");
    else if (!thicknessSelect.value && thicknesses.length === 1) thicknessSelect.value = thicknesses[0].code;
    pickPrintVariant();
  }

  async function loadOptions() {
    if (!form) return;
    const data = await request("/orders/options");
    const options = data.options || {};
    const inventory = data.printInventory || {};
    printInventory = {
      technologies: Array.isArray(inventory.technologies) ? inventory.technologies : [],
      variants: Array.isArray(inventory.variants) ? inventory.variants : [],
    };
    printOptionMaps = {
      technology: new Map((options.technology || []).map((item) => [item.code, item])),
      material: new Map((options.material || []).map((item) => [item.code, item])),
      color: new Map((options.color || []).map((item) => [item.code, item])),
      thickness: new Map((options.thickness || []).map((item) => [item.code, item])),
    };
    const activeTechCodes = new Set((options.technology || []).filter((item) => item.active).map((item) => item.code));
    const activeMaterialCodes = new Set((options.material || []).filter((item) => item.active).map((item) => item.code));
    const activeColorCodes = new Set((options.color || []).filter((item) => item.active).map((item) => item.code));
    if (service.type === "print") {
      printInventory.variants = printInventory.variants.filter(
        (variant) =>
          activeTechCodes.has(variant.technologyCode) &&
          activeMaterialCodes.has(variant.materialCode) &&
          activeColorCodes.has(variant.colorCode)
      );
      const availableTechCodes = new Set(printInventory.variants.map((variant) => variant.technologyCode));
      printInventory.technologies = printInventory.technologies.filter((item) => availableTechCodes.has(item.code));
    }

    if (service.type === "print") syncPrintSelectors();
    else syncNonPrintSelectors();
  }

  async function updatePrice() {
    if (!form || !sumEl) return;
    const payload = buildPayload();
    if (!hasUserInteractedWithCalculator || !hasRequiredSelections(payload)) {
      setPriceLoading(false);
      setPriceValue(0);
      syncCheckoutLinksHref();
      return;
    }
    const requestId = ++priceRequestId;
    setPriceLoading(true);
    try {
      const data = await request("/orders/price-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (requestId !== priceRequestId) return;
      await stopPriceLoadingWithMinDelay();
      setPriceValue(data.totalAmount || 0);
      syncCheckoutLinksHref();
      if (service.type === "print") {
        pickPrintVariant();
      }
    } catch (_error) {
      if (requestId !== priceRequestId) return;
      await stopPriceLoadingWithMinDelay();
      setPriceValue(0);
      syncCheckoutLinksHref();
    }
  }

  function schedulePriceUpdate(delayMs = 0) {
    if (priceDebounceTimer) {
      clearTimeout(priceDebounceTimer);
      priceDebounceTimer = 0;
    }
    if (delayMs <= 0) {
      updatePrice();
      return;
    }
    priceDebounceTimer = window.setTimeout(() => {
      priceDebounceTimer = 0;
      updatePrice();
    }, delayMs);
  }

  function meshVolumeCm3(THREE, mesh) {
    const geometry = mesh.geometry;
    if (!geometry || !geometry.attributes?.position) return 0;
    const cloned = geometry.clone();
    cloned.applyMatrix4(mesh.matrixWorld);
    const pos = cloned.attributes.position;
    const index = cloned.index;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let volumeMm3 = 0;
    const triCount = index ? index.count / 3 : pos.count / 3;
    for (let i = 0; i < triCount; i += 1) {
      if (index) {
        a.fromBufferAttribute(pos, index.getX(i * 3));
        b.fromBufferAttribute(pos, index.getX(i * 3 + 1));
        c.fromBufferAttribute(pos, index.getX(i * 3 + 2));
      } else {
        a.fromBufferAttribute(pos, i * 3);
        b.fromBufferAttribute(pos, i * 3 + 1);
        c.fromBufferAttribute(pos, i * 3 + 2);
      }
      volumeMm3 += a.dot(b.clone().cross(c)) / 6;
    }
    cloned.dispose?.();
    return Math.abs(volumeMm3) / 1000;
  }

  function estimateObjectVolumeCm3(THREE, object3d) {
    let sum = 0;
    object3d.updateMatrixWorld(true);
    object3d.traverse((child) => {
      if (child.isMesh && child.geometry) {
        sum += meshVolumeCm3(THREE, child);
      }
    });
    if (sum > 0) return sum;
    const box = new THREE.Box3().setFromObject(object3d);
    if (box.isEmpty()) return 0;
    const size = new THREE.Vector3();
    box.getSize(size);
    return Math.abs((size.x * size.y * size.z) / 1000);
  }

  let threeScriptsPromise = null;

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.getElementsByTagName("script")).find((s) => s.src === src);
      if (existing) {
        if (existing.dataset.loaded === "1") {
          resolve();
          return;
        }
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Не удалось загрузить ${src}`)), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = () => {
        script.dataset.loaded = "1";
        resolve();
      };
      script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
      document.head.appendChild(script);
    });
  }

  function ensureFflate() {
    if (typeof window.fflate !== "undefined") return Promise.resolve();
    return loadScriptOnce(FFLATE_SRC);
  }

  function loadThreeEcosystem() {
    if (threeScriptsPromise) return threeScriptsPromise;
    threeScriptsPromise = (async () => {
      await loadScriptOnce(`${THREE_BASE}/build/three.min.js`);
      await loadScriptOnce(`${THREE_BASE}/examples/js/controls/OrbitControls.js`);
      await ensureFflate();
      await loadScriptOnce(`${THREE_BASE}/examples/js/loaders/STLLoader.js`);
      await loadScriptOnce(`${THREE_BASE}/examples/js/loaders/OBJLoader.js`);
      await loadScriptOnce(`${THREE_BASE}/examples/js/loaders/MTLLoader.js`);
      await loadScriptOnce(`${THREE_BASE}/examples/js/loaders/FBXLoader.js`);
      await loadScriptOnce(`${THREE_BASE}/examples/js/loaders/AMFLoader.js`);
      await loadScriptOnce(`${THREE_BASE}/examples/js/loaders/3MFLoader.js`);
      return window.THREE;
    })().catch((err) => {
      threeScriptsPromise = null;
      throw err;
    });
    return threeScriptsPromise;
  }

  let viewerGeneration = 0;
  let activeViewer = null;

  function disposeModelViewer() {
    if (!activeViewer) return;
    cancelAnimationFrame(activeViewer.rafId || 0);
    activeViewer.resizeObserver?.disconnect();
    activeViewer.controls?.dispose?.();
    activeViewer.renderer?.dispose?.();
    if (activeViewer.scene) {
      activeViewer.scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        const mats = obj.material;
        if (!mats) return;
        const list = Array.isArray(mats) ? mats : [mats];
        list.forEach((m) => {
          if (m.map) m.map.dispose?.();
          m.dispose?.();
        });
      });
    }
    activeViewer = null;
  }

  function revokePreviewObjectUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
  }

  function addBlenderStyleViewport(THREE, scene) {
    scene.background = new THREE.Color(0x454545);
    const gridSize = 12;
    const gridDiv = 28;
    const grid = new THREE.GridHelper(gridSize, gridDiv, 0x737373, 0x5a5a5a);
    grid.name = "viewport-grid";
    scene.add(grid);

    const axisLen = 1.35;
    const axes = new THREE.AxesHelper(axisLen);
    axes.name = "viewport-axes";
    scene.add(axes);

    function addAxisLabel(letter, cssColor, pos) {
      const cnv = document.createElement("canvas");
      const ctx = cnv.getContext("2d");
      cnv.width = 128;
      cnv.height = 128;
      ctx.fillStyle = cssColor;
      ctx.font = "bold 80px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(letter, 64, 64);
      const map = new THREE.CanvasTexture(cnv);
      const mat = new THREE.SpriteMaterial({
        map,
        depthTest: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.setScalar(0.42);
      sprite.name = `axis-label-${letter}`;
      scene.add(sprite);
    }

    const d = 1.58;
    addAxisLabel("X", "#e54b4b", new THREE.Vector3(d, 0, 0));
    addAxisLabel("Y", "#3fb86a", new THREE.Vector3(0, d, 0));
    addAxisLabel("Z", "#4f9fff", new THREE.Vector3(0, 0, d));
  }

  async function tryUploadModelFile(file, statusEl, successText) {
    const body = new FormData();
    body.append("modelFile", file);
    const data = await request("/orders/upload", { method: "POST", body });
    uploadedFile = data.file;
    if (statusEl && successText !== null) {
      statusEl.textContent = successText === undefined ? "" : successText;
    }
  }

  async function attachModelUpload() {
    if (page !== "print-step-3.html") return;
    const panel = document.querySelector("[data-model-panel]");
    const input = document.getElementById("model-file-input");
    const trigger = document.getElementById("model-upload-trigger");
    const fileNameEl = document.getElementById("model-file-name");
    const viewerHost = document.getElementById("model-viewer-host");
    const status = document.getElementById("model-upload-status");
    if (!panel || !input || !trigger || !fileNameEl || !viewerHost || !status) return;

    const replaceDialog = document.getElementById("model-replace-dialog");
    const replaceYes = document.getElementById("model-replace-yes");
    const replaceNo = document.getElementById("model-replace-no");
    const replaceBackdrop = replaceDialog?.querySelector(".model-replace-dialog__backdrop");

    function openReplaceDialog() {
      if (!replaceDialog) return;
      replaceDialog.hidden = false;
      replaceDialog.setAttribute("aria-hidden", "false");
      fileNameEl.setAttribute("aria-expanded", "true");
      replaceYes?.focus();
    }

    function closeReplaceDialog() {
      if (!replaceDialog) return;
      replaceDialog.hidden = true;
      replaceDialog.setAttribute("aria-hidden", "true");
      fileNameEl.setAttribute("aria-expanded", "false");
      fileNameEl.focus();
    }

    trigger.addEventListener("click", () => input.click());

    fileNameEl.addEventListener("click", () => {
      if (!panel.classList.contains("is-model-preview")) {
        input.click();
        return;
      }
      openReplaceDialog();
    });

    replaceYes?.addEventListener("click", () => {
      closeReplaceDialog();
      input.value = "";
      input.click();
    });

    replaceNo?.addEventListener("click", closeReplaceDialog);
    replaceBackdrop?.addEventListener("click", closeReplaceDialog);

    document.addEventListener("keydown", function onReplaceEscape(e) {
      if (e.key !== "Escape" || !replaceDialog || replaceDialog.hidden) return;
      closeReplaceDialog();
    });

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;

      const ext = modelExtFromName(file.name);
      if (!ext) {
        status.textContent = "Допустимы только файлы STL, OBJ, AMF, 3MF, FBX.";
        return;
      }

      revokePreviewObjectUrl();
      disposeModelViewer();
      localModelFile = file;
      uploadedFile = null;

      previewObjectUrl = URL.createObjectURL(file);
      fileNameEl.textContent = file.name;
      status.textContent = "";
      panel.classList.add("is-model-preview");
      viewerHost.hidden = false;

      const gen = ++viewerGeneration;
      try {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await ensureThreeViewer(
          { path: previewObjectUrl, ext, name: file.name, size: file.size },
          gen,
          status
        );
        try {
          await tryUploadModelFile(file, status);
        } catch (uploadErr) {
          if (uploadErr.status === 401) {
            status.textContent = "Войдите в аккаунт, чтобы сохранить файл для заказа.";
          } else {
            status.textContent = uploadErr.message || "Не удалось сохранить файл на сервер.";
          }
        }
      } catch (err) {
        status.textContent = err.message || "Не удалось показать модель.";
        panel.classList.remove("is-model-preview");
        viewerHost.hidden = true;
      }
    });
  }

  async function ensureThreeViewer(fileInfo, generation, statusEl) {
    const canvas = document.getElementById("model-preview-canvas");
    const viewerHost = document.getElementById("model-viewer-host");
    if (!canvas || !viewerHost || !fileInfo?.path) return;

    disposeModelViewer();

    await loadThreeEcosystem();
    const THREE = window.THREE;
    if (!THREE) return;
    if (generation !== viewerGeneration) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(2.2, 1.8, 3.2);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.4, 0);

    addBlenderStyleViewport(THREE, scene);

    const hemi = new THREE.HemisphereLight(0xdedede, 0x4a4a4a, 0.85);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.65);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0xffffff, 0.28));

    const syncSize = () => {
      const w = Math.max(1, viewerHost.clientWidth);
      const h = Math.max(1, viewerHost.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
    };
    syncSize();

    const resizeObserver = new ResizeObserver(() => syncSize());
    resizeObserver.observe(viewerHost);

    const ext = String(fileInfo.ext || "").toLowerCase();

    function fallbackMesh() {
      if (generation !== viewerGeneration) return;
      const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
      const material = new THREE.MeshStandardMaterial({
        color: 0x8fa4ff,
        metalness: 0.15,
        roughness: 0.45,
      });
      scene.add(new THREE.Mesh(geometry, material));
    }

    const onLoadError = (err) => {
      if (generation !== viewerGeneration) return;
      const msg = (err && err.message) || "Не удалось разобрать файл.";
      if (statusEl) statusEl.textContent = msg;
      fallbackMesh();
    };

    const normalizeObject = (object) => {
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return;
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      object.position.sub(center);
      const maxDim = Math.max(size.x || 1, size.y || 1, size.z || 1);
      object.scale.setScalar(2 / maxDim);
    };

    const loadUrl = fileInfo.path;

    try {
      if (ext === "stl" && THREE.STLLoader) {
        const loader = new THREE.STLLoader();
        loader.load(
          loadUrl,
          (geometry) => {
            if (generation !== viewerGeneration) {
              geometry?.dispose?.();
              return;
            }
            const material = new THREE.MeshStandardMaterial({
              color: 0x8fa4ff,
              metalness: 0.12,
              roughness: 0.42,
            });
            const mesh = new THREE.Mesh(geometry, material);
            modelVolumeCm3 = estimateObjectVolumeCm3(THREE, mesh);
            updateVolumeUi();
            hasUserInteractedWithCalculator = true;
            updatePrice();
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const maxDim = Math.max(size.x || 1, size.y || 1, size.z || 1);
            mesh.scale.setScalar(2 / maxDim);
            scene.add(mesh);
          },
          undefined,
          onLoadError
        );
      } else if (ext === "obj" && THREE.OBJLoader) {
        const loader = new THREE.OBJLoader();
        loader.load(
          loadUrl,
          (object) => {
            if (generation !== viewerGeneration) return;
            modelVolumeCm3 = estimateObjectVolumeCm3(THREE, object);
            updateVolumeUi();
            hasUserInteractedWithCalculator = true;
            updatePrice();
            normalizeObject(object);
            scene.add(object);
          },
          undefined,
          onLoadError
        );
      } else if (ext === "fbx" && THREE.FBXLoader) {
        const loader = new THREE.FBXLoader();
        loader.load(
          loadUrl,
          (object) => {
            if (generation !== viewerGeneration) return;
            modelVolumeCm3 = estimateObjectVolumeCm3(THREE, object);
            updateVolumeUi();
            hasUserInteractedWithCalculator = true;
            updatePrice();
            normalizeObject(object);
            scene.add(object);
          },
          undefined,
          onLoadError
        );
      } else if (ext === "amf" && THREE.AMFLoader) {
        const loader = new THREE.AMFLoader();
        loader.load(
          loadUrl,
          (object) => {
            if (generation !== viewerGeneration) return;
            if (!object) {
              onLoadError(new Error("Пустой или неподдерживаемый AMF."));
              return;
            }
            modelVolumeCm3 = estimateObjectVolumeCm3(THREE, object);
            updateVolumeUi();
            hasUserInteractedWithCalculator = true;
            updatePrice();
            normalizeObject(object);
            scene.add(object);
          },
          undefined,
          onLoadError
        );
      } else if (ext === "3mf" && THREE.ThreeMFLoader) {
        const loader = new THREE.ThreeMFLoader();
        loader.load(
          loadUrl,
          (object) => {
            if (generation !== viewerGeneration) return;
            modelVolumeCm3 = estimateObjectVolumeCm3(THREE, object);
            updateVolumeUi();
            hasUserInteractedWithCalculator = true;
            updatePrice();
            normalizeObject(object);
            scene.add(object);
          },
          undefined,
          onLoadError
        );
      } else {
        modelVolumeCm3 = 0;
        updateVolumeUi();
        fallbackMesh();
      }
    } catch (_error) {
      fallbackMesh();
    }

    activeViewer = { rafId: 0, renderer, controls, scene, resizeObserver };
    const tick = () => {
      activeViewer.rafId = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    activeViewer.rafId = requestAnimationFrame(tick);
  }

  function optionHtml(value, label, selectedValue) {
    return `<option value="${value}"${String(selectedValue || "") === value ? " selected" : ""}>${label}</option>`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}");
      return draft && typeof draft === "object" ? draft : {};
    } catch (_error) {
      return {};
    }
  }

  function hideProductionFieldsForBrief() {
    if (!form || service.type === "print") return;
    ["tech", "material", "color", "thickness"].forEach((name) => {
      const field = form.elements?.[name]?.closest?.(".field");
      if (field) field.style.display = "none";
    });
    const qtyField = form.elements?.qty?.closest?.(".field");
    if (qtyField) qtyField.style.display = "none";
  }

  function setupServiceBriefFields() {
    if (!form || service.type === "print") return;
    hideProductionFieldsForBrief();
    const title = document.querySelector(".config-title");
    if (title) {
      title.textContent = service.type === "modeling" ? "Заявка на моделирование" : "Заявка на сканирование";
    }
    const priceLine = form.querySelector(".price-line");
    if (!priceLine || form.querySelector("[data-service-brief]")) return;
    const draft = readDraft();
    const brief = draft.serviceBrief || {};
    const wrap = document.createElement("div");
    wrap.className = "service-brief";
    wrap.dataset.serviceBrief = service.type;

    if (service.type === "modeling") {
      wrap.innerHTML = `
        <div class="service-brief__head">
          <div class="service-brief__title">Техническое задание на моделирование</div>
          <div class="service-brief__hint">Опишите будущую модель простыми словами. Чем больше деталей, тем точнее оценка.</div>
        </div>
        <label class="field">
          <span class="label">Что нужно сделать?</span>
          <select class="select" name="modelingKind">
            <option value="">Выберите вариант</option>
            ${Object.entries(BRIEF_LABELS.modelingKind).map(([value, label]) => optionHtml(value, label, brief.kind)).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Тип модели</span>
          <select class="select" name="modelingObjectType">
            <option value="">Выберите тип</option>
            ${Object.entries(BRIEF_LABELS.modelingObjectType).map(([value, label]) => optionHtml(value, label, brief.objectType)).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Требуемая точность</span>
          <select class="select" name="serviceAccuracy">
            <option value="">Выберите точность</option>
            ${Object.entries(BRIEF_LABELS.serviceAccuracy)
              .filter(([value]) => value !== "maximum")
              .map(([value, label]) => optionHtml(value, label, brief.accuracy))
              .join("")}
          </select>
        </label>
        <label class="field service-brief__wide">
          <span class="label">Описание задачи</span>
          <textarea id="modeling-task-text" class="textarea" rows="7" placeholder="Например: нужен корпус 120×80×30 мм под плату, с отверстиями под винты и крышкой. Есть фото/эскиз.">${escapeHtml(draft.modelingTask || brief.description || "")}</textarea>
        </label>
        <label class="service-brief__check">
          <input type="checkbox" name="printAfterModeling" ${brief.printAfterModeling ? "checked" : ""}>
          <span>После моделирования хочу также напечатать эту модель</span>
        </label>
      `;
    } else {
      wrap.innerHTML = `
        <div class="service-brief__head">
          <div class="service-brief__title">Анкета объекта для сканирования</div>
          <div class="service-brief__hint">Укажите, что нужно оцифровать и какой результат хотите получить.</div>
        </div>
        <label class="field">
          <span class="label">Что сканируем?</span>
          <select class="select" name="scanObjectType">
            <option value="">Выберите объект</option>
            ${Object.entries(BRIEF_LABELS.scanObjectType).map(([value, label]) => optionHtml(value, label, brief.objectType)).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Размер объекта</span>
          <select class="select" name="objectSize">
            <option value="">Выберите размер</option>
            ${Object.entries(BRIEF_LABELS.objectSize).map(([value, label]) => optionHtml(value, label, brief.objectSize)).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Поверхность</span>
          <select class="select" name="surfaceType">
            <option value="">Выберите поверхность</option>
            ${Object.entries(BRIEF_LABELS.surfaceType).map(([value, label]) => optionHtml(value, label, brief.surfaceType)).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Нужный результат</span>
          <select class="select" name="scanResult">
            <option value="">Выберите результат</option>
            ${Object.entries(BRIEF_LABELS.scanResult).map(([value, label]) => optionHtml(value, label, brief.resultType)).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Точность</span>
          <select class="select" name="serviceAccuracy">
            <option value="">Выберите точность</option>
            ${Object.entries(BRIEF_LABELS.serviceAccuracy).map(([value, label]) => optionHtml(value, label, brief.accuracy)).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Как передать объект?</span>
          <select class="select" name="transferMethod">
            <option value="">Выберите способ</option>
            ${Object.entries(BRIEF_LABELS.transferMethod).map(([value, label]) => optionHtml(value, label, brief.transferMethod)).join("")}
          </select>
        </label>
        <div class="service-brief__dimensions">
          <label class="field"><span class="label">Длина, мм</span><input class="input" type="number" name="lengthMm" min="0" value="${Number(brief.lengthMm || 0) || ""}" placeholder="120"></label>
          <label class="field"><span class="label">Ширина, мм</span><input class="input" type="number" name="widthMm" min="0" value="${Number(brief.widthMm || 0) || ""}" placeholder="80"></label>
          <label class="field"><span class="label">Высота, мм</span><input class="input" type="number" name="heightMm" min="0" value="${Number(brief.heightMm || 0) || ""}" placeholder="30"></label>
        </div>
        <label class="field service-brief__wide">
          <span class="label">Комментарий</span>
          <textarea id="scan-task-text" class="textarea" rows="5" placeholder="Например: нужно отсканировать пластиковую запчасть, поверхность матовая, важна посадка по отверстиям.">${escapeHtml(draft.scanTask || brief.description || "")}</textarea>
        </label>
      `;
    }

    const fileBlock = document.createElement("div");
    fileBlock.className = "service-brief__file";
    fileBlock.innerHTML = `
      <label class="field service-brief__wide">
        <span class="label">Исходные материалы (необязательно)</span>
        <input class="input" type="file" id="service-source-file" accept=".stl,.obj,.amf,.3mf,.fbx,.jpg,.jpeg,.png,.webp,.pdf,.dwg,.dxf">
      </label>
      <div class="muted-small" id="service-source-status">Можно приложить фото, эскиз, чертёж или 3Д-файл.</div>
    `;
    wrap.appendChild(fileBlock);
    priceLine.insertAdjacentElement("beforebegin", wrap);
  }

  function attachBriefFileUpload() {
    if (service.type === "print") return;
    const input = document.getElementById("service-source-file");
    const status = document.getElementById("service-source-status");
    if (!input || !status) return;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const ext = sourceExtFromName(file.name);
      if (!ext || !SOURCE_FILE_EXTS.includes(ext)) {
        status.textContent = "Поддерживаются фото, PDF, чертежи и 3Д-файлы.";
        uploadedFile = null;
        return;
      }
      localModelFile = file;
      uploadedFile = null;
      hasUserInteractedWithCalculator = true;
      status.textContent = "Сохраняем файл для заказа...";
      try {
        await tryUploadModelFile(file, status, `Файл «${file.name}» прикреплён к заказу.`);
      } catch (error) {
        if (error.status === 401) {
          status.textContent = "Файл будет прикреплён после входа в аккаунт. Остальные поля можно заполнить сейчас.";
        } else {
          status.textContent = error.message || "Не удалось прикрепить файл.";
        }
      }
      saveDraft();
      schedulePriceUpdate(250);
    });
  }

  function requestPagePath() {
    return service.type === "scan" ? "print-step-1.html" : "print-step-2.html";
  }

  function quoteTitle() {
    return service.type === "scan" ? "Заявка на 3Д-сканирование" : "Заявка на 3Д-моделирование";
  }

  function quoteSubtitle() {
    if (service.type === "scan") {
      return "Заполните короткую заявку: мы оценим объект, свяжемся с вами и согласуем стоимость до начала работ.";
    }
    return "Опишите задачу: дизайнер изучит материалы, уточнит детали и согласует стоимость до начала работ.";
  }

  function quoteInfoHtml(step = 1) {
    const scanInfo = {
      1: {
        eyebrow: "Подсказка страницы 1",
        title: "Что сканируем",
        text: "Выберите, к какому типу относится объект. Это помогает сразу понять сложность формы и способ оцифровки.",
        tipsTitle: "Выбор объекта",
        points: ["Деталь, корпус, фигурка или сборка", "Если не уверены, выбирайте «Другое»"],
        note: "На этом шаге нужна только категория объекта.",
      },
      2: {
        eyebrow: "Подсказка страницы 2",
        title: "Комментарий и файлы",
        text: "Опишите объект своими словами: из чего он, какие места важны и для чего нужен результат.",
        tipsTitle: "Описание объекта",
        points: ["Добавьте фото с разных сторон", "Укажите важные отверстия, посадки или размеры"],
        note: "Файл необязателен, но ускоряет оценку.",
      },
      3: {
        eyebrow: "Подсказка страницы 3",
        title: "Параметры скана",
        text: "Размер, поверхность и нужная точность влияют на время сканирования, обработку модели и итоговую стоимость.",
        tipsTitle: "Оценка сложности",
        points: ["Глянцевые, тёмные и прозрачные поверхности сложнее", "Габариты можно указать примерно"],
        note: "Цена будет назначена после оценки объекта.",
      },
      4: {
        eyebrow: "Подсказка страницы 4",
        title: "Подтверждение связи",
        text: "Проверьте номер телефона. По нему менеджер уточнит детали, расскажет как передать объект и согласует цену.",
        tipsTitle: "Перед отправкой",
        points: ["Если номер неверный, измените его в профиле", "После заявки оплата сразу не требуется"],
        note: "Мы свяжемся до начала работы.",
      },
    };
    const modelingInfo = {
      1: {
        eyebrow: "Подсказка страницы 1",
        title: "Что моделируем",
        text: "Выберите тип задачи, чтобы дизайнер понял: создавать модель с нуля, исправлять файл или готовить её к печати.",
        tipsTitle: "Выбор задачи",
        points: ["Новая модель — если файла ещё нет", "Доработка — если есть готовый файл или эскиз"],
        note: "На этом шаге выбираем только направление работы.",
      },
      2: {
        eyebrow: "Подсказка страницы 2",
        title: "ТЗ и исходники",
        text: "Опишите, какой результат нужен в итоге. Чем понятнее задача, тем быстрее дизайнер сможет оценить работу.",
        tipsTitle: "Что написать в ТЗ",
        points: ["Приложите фото, чертёж, эскиз или 3Д-файл", "Напишите размеры, назначение и важные детали"],
        note: "Короткого описания достаточно, детали уточним по телефону.",
      },
      3: {
        eyebrow: "Подсказка страницы 3",
        title: "Пожелания к модели",
        text: "Укажите тип модели и требуемую точность. Это влияет на детализацию, время моделирования и цену.",
        tipsTitle: "Точность и печать",
        points: ["Технические детали требуют большей точности", "Отметьте печать, если модель нужно будет изготовить"],
        note: "Цена будет назначена после оценки ТЗ.",
      },
      4: {
        eyebrow: "Подсказка страницы 4",
        title: "Подтверждение связи",
        text: "Проверьте номер телефона. Менеджер свяжется, уточнит задачу и согласует стоимость до начала моделирования.",
        tipsTitle: "Перед отправкой",
        points: ["Если номер неверный, измените его в профиле", "Заявка отправляется без оплаты"],
        note: "После отправки заявка появится в личном кабинете.",
      },
    };
    const info = (service.type === "scan" ? scanInfo : modelingInfo)[step] || {
      title: "Заявка",
      text: "Заполните данные по шагам.",
      points: [],
      note: "Цена будет назначена после оценки.",
    };
    const isScanTransferStep = service.type === "scan" && step === 3;
    return `
      <div class="quote-info-card">
        <h2>${info.title}</h2>
        <p>${info.text}</p>
        ${
          info.points?.length
            ? `<div class="quote-info-card__tips">
                <span>${info.tipsTitle || "Что указать"}</span>
                <ul>
                  ${info.points.map((point) => `<li>${point}</li>`).join("")}
                </ul>
              </div>`
            : ""
        }
        ${
          isScanTransferStep
            ? `<div class="quote-info-card__address">
                <span>Адрес предприятия</span>
                <b>Адрес предприятия будет указан после звонка менеджера.</b>
              </div>`
            : ""
        }
      </div>
    `;
  }

  function quoteOptions(group, selectedValue, name) {
    return Object.entries(BRIEF_LABELS[group] || {})
      .map(([value, label]) => {
        const checked = String(selectedValue || "") === value ? " checked" : "";
        const iconPath = QUOTE_ICON_PATHS[`${group}:${value}`] || QUOTE_ICON_PATHS["scanObjectType:other"];
        return `<label class="quote-choice">
          <input type="radio" name="${name || group}" value="${value}"${checked}>
          <span class="quote-choice__dot"></span>
          <span class="quote-choice__icon" aria-hidden="true"><svg viewBox="0 0 24 24">${iconPath}</svg></span>
          <span>${label}</span>
        </label>`;
      })
      .join("");
  }

  function quoteFormTitle(step) {
    if (service.type === "scan") {
      return ["Что нужно отсканировать?", "Опишите объект", "Уточните параметры", "Подтвердите телефон"][step - 1] || "";
    }
    return ["Что нужно сделать?", "Опишите задачу", "Уточните модель", "Подтвердите телефон"][step - 1] || "";
  }

  function quoteSelect(group, selectedValue, name, placeholder) {
    return `<select name="${name || group}">
      <option value="">${placeholder || "Выберите вариант"}</option>
      ${Object.entries(BRIEF_LABELS[group] || {})
        .map(([value, label]) => optionHtml(value, label, selectedValue))
        .join("")}
    </select>`;
  }

  function quoteStepHtml(step, user) {
    const draft = readDraft();
    const brief = draft.serviceBrief || {};
    if (step === 1) {
      if (service.type === "modeling") {
        return `
          <div class="quote-step" data-quote-step-panel="1">
            <div class="quote-choice-grid">${quoteOptions("modelingKind", brief.kind, "modelingKind")}</div>
          </div>
        `;
      }
      return `
        <div class="quote-step" data-quote-step-panel="1">
          <div class="quote-choice-grid">${quoteOptions("scanObjectType", brief.objectType, "scanObjectType")}</div>
        </div>
      `;
    }
    if (step === 2) {
      if (service.type === "modeling") {
        return `
          <div class="quote-step" data-quote-step-panel="2">
            <label class="quote-field">
              <span>Описание задачи</span>
              <textarea id="modeling-task-text" rows="7" placeholder="Например: нужен корпус 120×80×30 мм под плату, с отверстиями под винты и крышкой.">${escapeHtml(draft.modelingTask || brief.description || "")}</textarea>
            </label>
            <label class="quote-file">
              <span>Исходные материалы</span>
              <input type="file" id="service-source-file" accept=".stl,.obj,.amf,.3mf,.fbx,.jpg,.jpeg,.png,.webp,.pdf,.dwg,.dxf">
              <small id="service-source-status">Можно приложить фото, эскиз, чертёж или 3Д-файл.</small>
            </label>
          </div>
        `;
      }
      return `
        <div class="quote-step" data-quote-step-panel="2">
          <label class="quote-field">
            <span>Комментарий к объекту</span>
            <textarea id="scan-task-text" rows="7" placeholder="Например: пластиковая запчасть, важна посадка по отверстиям, поверхность матовая.">${escapeHtml(draft.scanTask || brief.description || "")}</textarea>
          </label>
          <label class="quote-file">
            <span>Исходные материалы</span>
            <input type="file" id="service-source-file" accept=".stl,.obj,.amf,.3mf,.fbx,.jpg,.jpeg,.png,.webp,.pdf,.dwg,.dxf">
            <small id="service-source-status">Можно приложить фото объекта, чертёж или другой файл.</small>
          </label>
        </div>
      `;
    }
    if (step === 3) {
      if (service.type === "modeling") {
        return `
          <div class="quote-step" data-quote-step-panel="3">
            <div class="quote-select-grid">
              <label><span>Тип модели</span>${quoteSelect("modelingObjectType", brief.objectType, "modelingObjectType", "Тип модели")}</label>
              <label><span>Точность</span>${quoteSelect("serviceAccuracy", brief.accuracy, "serviceAccuracy", "Точность")}</label>
            </div>
            <label class="quote-choice quote-choice--wide quote-choice--print-after">
              <input type="checkbox" name="printAfterModeling"${brief.printAfterModeling ? " checked" : ""}>
              <span class="quote-choice__dot"></span>
              <span>После моделирования хочу также напечатать эту модель</span>
            </label>
          </div>
        `;
      }
      return `
        <div class="quote-step" data-quote-step-panel="3">
          <div class="quote-select-grid">
            <label><span>Размер объекта</span>${quoteSelect("objectSize", brief.objectSize, "objectSize", "Размер")}</label>
            <label><span>Поверхность</span>${quoteSelect("surfaceType", brief.surfaceType, "surfaceType", "Поверхность")}</label>
            <label><span>Нужный результат</span>${quoteSelect("scanResult", brief.resultType, "scanResult", "Результат")}</label>
            <label><span>Точность</span>${quoteSelect("serviceAccuracy", brief.accuracy, "serviceAccuracy", "Точность")}</label>
            <label><span>Передача объекта</span>${quoteSelect("transferMethod", brief.transferMethod, "transferMethod", "Способ передачи")}</label>
          </div>
          <div class="quote-dimensions">
            <label><span>Длина, мм</span><input type="number" name="lengthMm" min="0" value="${Number(brief.lengthMm || 0) || ""}" placeholder="120"></label>
            <label><span>Ширина, мм</span><input type="number" name="widthMm" min="0" value="${Number(brief.widthMm || 0) || ""}" placeholder="80"></label>
            <label><span>Высота, мм</span><input type="number" name="heightMm" min="0" value="${Number(brief.heightMm || 0) || ""}" placeholder="30"></label>
          </div>
        </div>
      `;
    }
    if (step === 4) {
      const phone = user?.phone || window.__APP_USER__?.phone || "";
      return `
        <div class="quote-step" data-quote-step-panel="4">
          <div class="quote-phone-card">
            <span>Телефон для связи</span>
            <b>${escapeHtml(phone || "Номер не найден")}</b>
          </div>
          <label class="quote-choice quote-choice--wide">
            <input type="radio" name="phoneConfirmed" value="yes"${brief.phoneConfirmed === "yes" ? " checked" : ""}>
            <span class="quote-choice__dot"></span>
            <span>Да, номер актуален</span>
          </label>
          <a class="quote-profile-link" href="profile.html">Нет, изменить номер в личном кабинете</a>
        </div>
      `;
    }
    return "";
  }

  function quoteStepTitle(step) {
    return ["Описание", "Настройка", "Контакты", "Готово"][step - 1] || "";
  }

  function syncPageStepper(activeStep) {
    const labels = ["Описание", "Настройка", "Контакты", "Готово"];
    document.querySelectorAll(".stepper .step").forEach((stepEl, index) => {
      const stepNumber = index + 1;
      stepEl.classList.toggle("is-active", stepNumber === activeStep);
      stepEl.classList.toggle("is-complete", stepNumber < activeStep);
      const nameEl = stepEl.querySelector(".name");
      if (nameEl && labels[index]) nameEl.textContent = labels[index];
    });
  }

  function wireSelectArrows(scope = document) {
    scope.querySelectorAll("select").forEach((select) => {
      if (select.dataset.arrowWired === "1") return;
      select.dataset.arrowWired = "1";
      const close = () => select.classList.remove("is-open");
      select.addEventListener("mousedown", () => {
        select.classList.toggle("is-open");
      });
      select.addEventListener("keydown", (event) => {
        if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
          select.classList.add("is-open");
        }
        if (event.key === "Escape" || event.key === "Tab") {
          close();
        }
      });
      select.addEventListener("change", close);
      select.addEventListener("blur", close);
    });
  }

  function renderQuoteWizard(user = window.__APP_USER__ || null) {
    if (!form || service.type === "print") return;
    const grid = document.querySelector(".print-grid");
    const left = grid?.querySelector(".quote-sidebar") || grid?.querySelector(".dash-panel:first-child");
    const right = grid?.querySelector(".quote-workspace") || grid?.querySelector(".print-right");
    const rawStep = Number(sessionStorage.getItem(QUOTE_STEP_KEY) || 1);
    const step = Math.min(4, Math.max(1, rawStep || 1));
    if (grid) grid.classList.add("quote-layout");
    if (left) {
      left.className = "dash-panel quote-sidebar";
      left.innerHTML = quoteInfoHtml(step);
    }
    if (right) {
      right.className = "dash-panel print-right quote-workspace";
      right.setAttribute("aria-label", quoteTitle());
    }
    syncPageStepper(step);
    form.className = "quote-wizard";
    form.innerHTML = `
      <div class="quote-wizard__head">
        <div class="quote-wizard__title">${step}. ${quoteFormTitle(step)}</div>
      </div>
      ${quoteStepHtml(step, user)}
      <div class="quote-wizard__status" id="quote-wizard-status"></div>
      <div class="quote-wizard__actions">
        <button class="quote-nav-btn" type="button" data-quote-prev ${step === 1 ? "disabled" : ""}>Назад</button>
        <button class="btn btn-primary quote-submit-btn" type="button" data-quote-next>${step === 4 ? "Оставить заявку" : "Далее"}</button>
      </div>
    `;
    attachBriefFileUpload();
    form.querySelectorAll("input, textarea, select").forEach((node) => {
      node.addEventListener("input", saveDraft);
      node.addEventListener("change", saveDraft);
    });
    wireSelectArrows(form);
    form.querySelector("[data-quote-prev]")?.addEventListener("click", () => {
      saveDraft();
      sessionStorage.setItem(QUOTE_STEP_KEY, String(Math.max(1, step - 1)));
      renderQuoteWizard(user);
    });
    form.querySelector("[data-quote-next]")?.addEventListener("click", () => handleQuoteNext(step, user));
  }

  function quoteStatus(message, isError = true) {
    const node = document.getElementById("quote-wizard-status");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", Boolean(isError));
  }

  async function ensureQuoteAuth() {
    const redirectToRegister = () => {
      saveDraft();
      sessionStorage.setItem(QUOTE_STEP_KEY, "1");
      try {
        sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, requestPagePath());
      } catch (_storageError) {}
      window.location.replace(`login.html?mode=register&next=${encodeURIComponent(requestPagePath())}`);
    };

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), 5000) : 0;
    try {
      const data = await request("/auth/me", { method: "GET", cache: "no-store", signal: controller?.signal });
      return data.user || null;
    } catch (error) {
      if (error.status === 401 || error.name === "AbortError") {
        redirectToRegister();
        return null;
      }
      throw error;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  function validateQuoteStep(step) {
    const brief = buildServiceBrief();
    if (step === 1) {
      if (service.type === "modeling" && !brief.kind) return "Выберите, что нужно сделать.";
      if (service.type === "scan" && !brief.objectType) return "Выберите, что нужно отсканировать.";
    }
    if (step === 2) {
      if (String(brief.description || "").trim().length < 10) return "Добавьте короткое описание задачи.";
    }
    if (step === 3) {
      if (service.type === "modeling" && !brief.objectType) return "Выберите тип модели.";
      if (service.type === "scan" && (!brief.objectSize || !brief.surfaceType || !brief.resultType)) {
        return "Заполните размер, поверхность и нужный результат.";
      }
      if (!brief.accuracy) return "Выберите требуемую точность.";
      if (service.type === "scan" && !brief.transferMethod) return "Выберите способ передачи объекта.";
    }
    if (step === 4 && fieldValue("phoneConfirmed") !== "yes") return "Подтвердите, что номер телефона актуален.";
    return "";
  }

  async function handleQuoteNext(step, user) {
    saveDraft();
    quoteStatus("");
    if (step === 1) {
      const button = form?.querySelector("[data-quote-next]");
      if (button) button.disabled = true;
      quoteStatus("Проверяем вход и переходим к регистрации...", false);
      let authedUser = null;
      try {
        authedUser = await ensureQuoteAuth();
      } catch (error) {
        if (button) button.disabled = false;
        quoteStatus(error.message || "Не удалось проверить вход. Попробуйте ещё раз.", true);
        return;
      }
      if (!authedUser) return;
      if (button) button.disabled = false;
      quoteStatus("");
      user = authedUser;
    }
    const validationMessage = validateQuoteStep(step);
    if (validationMessage) {
      quoteStatus(validationMessage, true);
      return;
    }
    if (step < 4) {
      sessionStorage.setItem(QUOTE_STEP_KEY, String(step + 1));
      renderQuoteWizard(user);
      return;
    }
    await submitQuoteRequest(user);
  }

  async function submitQuoteRequest(user) {
    const button = form?.querySelector("[data-quote-next]");
    const payload = buildPayload();
    payload.totalAmount = 0;
    payload.subtotalAmount = 0;
    payload.deliveryType = "none";
    payload.quoteRequest = true;
    payload.initialStatus = QUOTE_STATUSES[service.type] || "Ожидает оценки";
    try {
      if (button) button.disabled = true;
      quoteStatus("Отправляем заявку...", false);
      if (localModelFile && !uploadedFile?.path) {
        await tryUploadModelFile(localModelFile, document.getElementById("service-source-status"), "");
        payload.uploadedFile = uploadedFile;
      }
      const data = await request("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(QUOTE_STEP_KEY);
      try {
        sessionStorage.setItem(
          "app.toast",
          JSON.stringify({
            title: "Заявка получена",
            message: `Заявка ${data.orderNumber || ""} находится в обработке. В ближайшее время менеджер позвонит для обсуждения цены.`,
          })
        );
      } catch (_error) {}
      window.location.href = "orders.html";
    } catch (error) {
      if (button) button.disabled = false;
      if (error.status === 401) {
        await ensureQuoteAuth();
        return;
      }
      quoteStatus(error.message || "Не удалось отправить заявку.", true);
    }
  }

  function saveCheckoutPayload() {
    const payload = buildPayload();
    payload.totalAmount = Number(String(sumEl?.textContent || "0").replace(/[^\d]/g, "")) || 0;
    sessionStorage.setItem("checkout_payload", JSON.stringify(payload));
    return payload;
  }

  function buildCheckoutUrl(payload) {
    const params = new URLSearchParams();
    params.set("totalAmount", String(Number(payload?.totalAmount || 0)));
    params.set("serviceType", String(payload?.serviceType || service.type || ""));
    params.set("serviceName", String(payload?.serviceName || service.name || ""));
    return `checkout.html?${params.toString()}`;
  }

  function syncCheckoutLinksHref() {
    const payload = saveCheckoutPayload();
    const allowed = canCheckoutToPayment();
    const href = allowed ? buildCheckoutUrl(payload) : "#";
    checkoutLinks.forEach((link) => {
      link.setAttribute("href", href);
      link.classList.toggle("is-checkout-blocked", !allowed);
      link.setAttribute("aria-disabled", allowed ? "false" : "true");
      link.title = allowed ? "" : "Выберите все параметры услуги и дождитесь расчёта ненулевой стоимости.";
    });
  }

  function redirectToLoginForCheckout() {
    try {
      sessionStorage.setItem("app.postLoginRedirect", "checkout.html");
    } catch (_error) {}
    window.location.href = "login.html?mode=register&next=checkout.html";
  }

  function initCheckoutLinks() {
    syncCheckoutLinksHref();
    if (checkoutLinksWired) return;
    checkoutLinksWired = true;
    checkoutLinks.forEach((link) => {
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!canCheckoutToPayment()) {
          const status = document.getElementById("model-upload-status");
          if (status && page === "print-step-3.html") {
            status.textContent = "Выберите параметры и загрузите модель — сумма должна быть больше 0.";
          }
          return;
        }
        const needUpload = page === "print-step-3.html" && localModelFile && !uploadedFile?.path;
        if (needUpload) {
          const status = document.getElementById("model-upload-status");
          try {
            if (status) status.textContent = "Сохранение файла для заказа…";
            await tryUploadModelFile(localModelFile, status, "");
            if (!canCheckoutToPayment()) {
              if (status) status.textContent = "Сумма заказа должна быть больше 0.";
              return;
            }
            const payload = saveCheckoutPayload();
            window.location.href = buildCheckoutUrl(payload);
          } catch (err) {
            if (err.status === 401) {
              if (status) status.textContent = "Войдите в аккаунт, чтобы прикрепить файл к заказу.";
              redirectToLoginForCheckout();
              return;
            }
            if (status) status.textContent = err.message || "Не удалось сохранить файл.";
          }
          return;
        }
        if (!canCheckoutToPayment()) return;
        const payload = saveCheckoutPayload();
        window.location.href = buildCheckoutUrl(payload);
      });
    });
  }

  async function init() {
    try {
      clearQuoteDraftOnReload();
      try {
        const notice = sessionStorage.getItem("service_calc_notice");
        if (notice) {
          sessionStorage.removeItem("service_calc_notice");
          const statusEl = document.getElementById("model-upload-status");
          if (statusEl) {
            statusEl.textContent = notice;
          } else {
            const priceLine = document.querySelector(".price-line");
            if (priceLine) {
              let banner = document.getElementById("print-service-notice");
              if (!banner) {
                banner = document.createElement("p");
                banner.id = "print-service-notice";
                banner.className = "muted-small";
                banner.style.cssText = "color:#dc2626;font-weight:700;margin:8px 0 0;";
                priceLine.insertAdjacentElement("afterend", banner);
              }
              banner.textContent = notice;
            }
          }
        }
      } catch (_e) {}
      if (service.type !== "print") {
        renderQuoteWizard();
        return;
      }
      setPriceLoading(true);
      await loadOptions();
      setupServiceBriefFields();
      const restoredDraft = restoreDraft();
      if (restoredDraft) {
        hasUserInteractedWithCalculator = true;
        if (service.type === "print") syncPrintSelectors();
        else syncNonPrintSelectors();
      }
      updateVolumeUi();
      attachBriefFileUpload();
      await attachModelUpload();
      wireSelectArrows(form || document);
      setPriceLoading(false);
      setPriceValue(0);
      initCheckoutLinks();
      form?.elements?.tech?.addEventListener("change", () => {
        hasUserInteractedWithCalculator = true;
        saveDraft();
        if (service.type === "print") {
          syncPrintSelectors();
          schedulePriceUpdate();
        } else {
          syncNonPrintSelectors();
          schedulePriceUpdate();
        }
      });
      form?.elements?.material?.addEventListener("change", () => {
        hasUserInteractedWithCalculator = true;
        saveDraft();
        if (service.type === "print") {
          syncPrintSelectors();
          schedulePriceUpdate();
        } else {
          syncNonPrintSelectors();
          schedulePriceUpdate();
        }
      });
      form?.elements?.color?.addEventListener("change", () => {
        hasUserInteractedWithCalculator = true;
        saveDraft();
        if (service.type === "print") {
          syncPrintSelectors();
          schedulePriceUpdate();
        } else {
          syncNonPrintSelectors();
          schedulePriceUpdate();
        }
      });
      form?.elements?.thickness?.addEventListener("change", () => {
        hasUserInteractedWithCalculator = true;
        saveDraft();
        if (service.type === "print") {
          pickPrintVariant();
          schedulePriceUpdate();
        }
      });
      form?.addEventListener("change", () => {
        hasUserInteractedWithCalculator = true;
        saveDraft();
        schedulePriceUpdate();
      });
      form?.addEventListener("input", () => {
        hasUserInteractedWithCalculator = true;
        saveDraft();
        schedulePriceUpdate(350);
      });
    } catch (_error) {
      setPriceLoading(false);
      setPriceValue(0);
      initCheckoutLinks();
    }
  }

  init();
})();
