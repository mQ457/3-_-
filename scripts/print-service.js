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
  const checkoutLinks = document.querySelectorAll('a[href="checkout.html"]');
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
  const SELECT_PLACEHOLDERS = {
    tech: "Технологии",
    material: "Материалы",
    color: "Цвета",
    thickness: "Толщина",
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
  const THREE_VER = "0.125.2";
  const THREE_BASE = `https://unpkg.com/three@${THREE_VER}`;
  const FFLATE_SRC = "https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js";

  function modelExtFromName(filename) {
    const lower = String(filename || "").toLowerCase();
    for (const ext of MODEL_EXTS) {
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

  function buildPayload() {
    const complexity = Number(form?.elements.complexity?.value || 1);
    const estimatedHours = Number(form?.elements.estimatedHours?.value || 1);
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
      modelingTask: String(document.getElementById("modeling-task-text")?.value || ""),
      uploadedFile,
    };
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
    sumEl.textContent = `${Number(value || 0)} ₽`;
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
    const hasCoreSelections =
      Boolean(payload.technology) &&
      Boolean(payload.material) &&
      Boolean(payload.color) &&
      Boolean(payload.thickness) &&
      Number(payload.qty || 0) >= 1;
    if (!hasCoreSelections) return false;
    if (service.type === "modeling") {
      return Boolean(String(payload.modelingTask || "").trim());
    }
    if (service.type !== "print") return true;
    return Boolean(localModelFile || uploadedFile?.path);
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
    // Fallback: if template is missing or does not intersect with active options,
    // keep thickness selectable from global active settings.
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

    const thicknesses = getThicknessesByTemplate(selectedTemplate);
    fillSelect(thicknessSelect, [{ code: "", name: SELECT_PLACEHOLDERS.thickness }, ...thicknesses], (item) => {
      return `<option value="${item.code}">${item.name}</option>`;
    });
    thicknessSelect.disabled = thicknesses.length === 0;
    thicknessSelect.value = thicknesses.some((row) => row.code === prevThickness) ? prevThickness : "";
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
    if (!materialSelect.value) {
      resetSelectWithPlaceholder(colorSelect, "color", true);
      const fallbackThicknesses = getThicknessesByTemplate(selectedTechTemplate);
      fillSelect(thicknessSelect, [{ code: "", name: SELECT_PLACEHOLDERS.thickness }, ...fallbackThicknesses], (item) => {
        return `<option value="${item.code}">${item.name}</option>`;
      });
      thicknessSelect.disabled = fallbackThicknesses.length === 0;
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
    else setDisabledPlaceholder(thicknessSelect, "Нет доступной толщины");
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
    const fill = (name, items, mapper) => {
      const select = form.elements[name];
      if (!select || !Array.isArray(items)) return;
      select.innerHTML = items
        .filter((item) => item.active)
        .map((item) => (typeof mapper === "function" ? mapper(item) : `<option value="${item.code}">${item.name}</option>`))
        .join("");
    };
    fill("material", options.material || []);
    fill("tech", options.technology || []);
    fill("color", options.color || []);
    fill("thickness", options.thickness || []);
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

  function attachModelingNotepad() {
    if (page !== "print-step-2.html") return;
    const panel = document.querySelector(".panel-grey1");
    if (!panel) return;
    const note = document.createElement("textarea");
    note.id = "modeling-task-text";
    note.className = "input";
    note.rows = 8;
    note.placeholder = "Опишите ТЗ для дизайнера...";
    note.style.maxWidth = "520px";
    note.style.marginTop = "12px";
    note.style.background = "#fffdf2";
    note.addEventListener("input", () => {
      hasUserInteractedWithCalculator = true;
      schedulePriceUpdate(350);
    });
    panel.appendChild(note);
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
    const href = buildCheckoutUrl(payload);
    checkoutLinks.forEach((link) => {
      link.setAttribute("href", href);
    });
  }

  function redirectToLoginForCheckout() {
    try {
      sessionStorage.setItem("app.postLoginRedirect", "checkout.html");
    } catch (_error) {
      // noop
    }
    window.location.href = "login.html?next=checkout.html";
  }

  function initCheckoutLinks() {
    syncCheckoutLinksHref();
    checkoutLinks.forEach((link) => {
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        const needUpload = page === "print-step-3.html" && localModelFile && !uploadedFile?.path;
        if (needUpload) {
          const status = document.getElementById("model-upload-status");
          try {
            if (status) status.textContent = "Сохранение файла для заказа…";
            await tryUploadModelFile(localModelFile, status, "");
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
        const payload = saveCheckoutPayload();
        window.location.href = buildCheckoutUrl(payload);
      });
    });
  }

  async function init() {
    try {
      await loadOptions();
      updateVolumeUi();
      attachModelingNotepad();
      await attachModelUpload();
      initCheckoutLinks();
      setPriceValue(0);
      form?.elements?.tech?.addEventListener("change", () => {
        hasUserInteractedWithCalculator = true;
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
        if (service.type === "print") {
          pickPrintVariant();
          schedulePriceUpdate();
        }
      });
      form?.addEventListener("change", () => {
        hasUserInteractedWithCalculator = true;
        schedulePriceUpdate();
      });
      form?.addEventListener("input", () => {
        hasUserInteractedWithCalculator = true;
        schedulePriceUpdate(350);
      });
    } catch (_error) {}
  }

  init();
})();
