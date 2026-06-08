(function () {
  const API = window.AppBootstrap;
  const cityInput = document.getElementById("address-city");
  const lineInput = document.getElementById("address-line");
  const saveBtn = document.getElementById("save-address-btn");
  const citySearchBtn = document.getElementById("address-search-btn");
  const addressSearchBtn = document.getElementById("address-locate-btn");
  const statusEl = document.getElementById("address-status");
  const listEl = document.getElementById("saved-addresses");
  const mapContainer = document.getElementById("delivery-map");
  const DELIVERY_SELECTION_KEY = "delivery_selection";

  let map = null;
  let selectedMarker = null;
  let selectedPoint = null;

  if (lineInput) {
    lineInput.placeholder = "Улица, дом, корпус, например: Тверская 7";
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  function setMapMessage(message) {
    if (!mapContainer) return;
    let fallback = mapContainer.querySelector(".delivery-map-fallback");
    if (!fallback) {
      fallback = document.createElement("div");
      fallback.className = "delivery-map-fallback";
      mapContainer.appendChild(fallback);
    }
    fallback.textContent = message;
  }

  function clearMapMessage() {
    if (!mapContainer) return;
    const fallback = mapContainer.querySelector(".delivery-map-fallback");
    if (fallback) fallback.remove();
  }

  function extractYandexErrorMessage(error) {
    if (!error) return "Ошибка геокодирования";
    if (typeof error === "string") return error;
    if (typeof error.message === "string" && error.message.trim()) return error.message;
    if (typeof error.error === "string" && error.error.trim()) return error.error;
    if (typeof error.reason === "string" && error.reason.trim()) return error.reason;
    if (typeof error.details === "string" && error.details.trim()) return error.details;
    if (typeof error.responseText === "string" && error.responseText.trim()) return error.responseText;
    if (typeof error === "object") {
      try {
        const serialized = JSON.stringify(error);
        if (serialized && serialized !== "{}") return serialized;
      } catch {
        // ignore
      }
    }
    return "Ошибка геокодирования";
  }

  function geocode(query, options) {
    return window.ymaps.geocode(query, options).then(
      (result) => result,
      (error) => {
        throw error instanceof Error ? error : new Error(extractYandexErrorMessage(error));
      }
    );
  }

  function parseCoords(item) {
    const lat = Number(item?.lat);
    const lng = Number(item?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }

  function persistDeliverySelection(extra) {
    const payload = {
      deliveryType: "manual",
      deliveryPointAddress: selectedPoint?.address || String(lineInput?.value || "").trim(),
      deliveryPointId: selectedPoint?.id || "",
      deliveryPrice: Number(extra?.deliveryPrice || 0),
      city: selectedPoint?.city || String(cityInput?.value || "").trim(),
    };
    sessionStorage.setItem(DELIVERY_SELECTION_KEY, JSON.stringify(payload));
    try {
      const checkout = JSON.parse(sessionStorage.getItem("checkout_payload") || "{}");
      checkout.deliveryType = payload.deliveryType;
      checkout.deliveryPointAddress = payload.deliveryPointAddress;
      checkout.deliveryPointId = payload.deliveryPointId;
      checkout.deliveryAmount = payload.deliveryPrice;
      checkout.subtotalAmount = Number(checkout.subtotalAmount ?? checkout.totalAmount ?? 0);
      if (payload.deliveryType !== "none") {
        checkout.totalAmount = checkout.subtotalAmount + payload.deliveryPrice;
      }
      sessionStorage.setItem("checkout_payload", JSON.stringify(checkout));
    } catch {
      // noop
    }
  }

  function setSelectedPoint(point, silent) {
    if (!map || !window.ymaps || !point?.coords) return;
    selectedPoint = {
      ...point,
      id: point.id || String(point.address || point.city || "").trim(),
    };
    if (!selectedMarker) {
      selectedMarker = new window.ymaps.Placemark(point.coords, {}, { preset: "islands#redDotIcon" });
      map.geoObjects.add(selectedMarker);
    } else {
      selectedMarker.geometry.setCoordinates(point.coords);
    }
    map.setCenter(point.coords, 15, { duration: 250 });
    if (lineInput) lineInput.value = point.address || "";
    if (cityInput && point.city) cityInput.value = point.city;
    if (!silent) {
      setStatus("Адрес выбран. Нажмите 'Сохранить' для сохранения.", false);
    }
  }

  async function resolveCityCoordinates(city) {
    const query = `${city}, Россия`;
    if (window.ymaps) {
      try {
        const cityResult = await geocode(query, { results: 1, kind: "locality" });
        const cityObject = cityResult.geoObjects.get(0);
        const coords = cityObject?.geometry?.getCoordinates?.();
        if (Array.isArray(coords) && coords.length === 2) return coords;
      } catch (error) {
        console.warn("ymaps city geocode", error);
      }
    }
    const data = await API.request(`/delivery/geocode-city?city=${encodeURIComponent(city)}`);
    if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
      return [Number(data.lat), Number(data.lng)];
    }
    return null;
  }

  function parseAddressParts(geoObject, fallbackCity) {
    const text = geoObject?.properties?.get("text") || geoObject?.properties?.get("name") || "";
    const line = typeof geoObject?.getAddressLine === "function" ? geoObject.getAddressLine() : text;
    const meta = geoObject?.properties?.get("metaDataProperty.GeocoderMetaData") || {};
    const parts = meta?.Address?.Components;
    let city = fallbackCity || "";
    if (Array.isArray(parts)) {
      const cityPart = parts.find((item) => item.kind === "locality" || item.kind === "province");
      city = cityPart?.name || city;
    }
    return { line, city };
  }

  async function geocodeAddress(address, city) {
    const queryItems = [];
    if (address) queryItems.push(address);
    if (city) queryItems.push(city);
    queryItems.push("Россия");
    const query = queryItems.filter(Boolean).join(", ");
    const result = await geocode(query, { results: 1 });
    const object = result.geoObjects.get(0);
    const coords = object?.geometry?.getCoordinates?.();
    if (!Array.isArray(coords) || coords.length !== 2) {
      throw new Error("Адрес не найден.");
    }
    const parsed = parseAddressParts(object, city);
    return {
      coords,
      address: parsed.line,
      city: parsed.city || city || "",
    };
  }

  async function searchByCity() {
    const city = String(cityInput?.value || "").trim();
    if (!city) {
      setStatus("Введите город.", true);
      return;
    }
    if (!map || !window.ymaps) {
      setStatus("Карта еще не готова.", true);
      return;
    }

    setStatus("Ищем город...", false);
    let cityCoords = null;
    try {
      cityCoords = await resolveCityCoordinates(city);
    } catch (error) {
      setStatus(`Не удалось найти город: ${extractYandexErrorMessage(error)}`, true);
      return;
    }
    if (!cityCoords) {
      setStatus("Город не найден. Попробуйте другое название.", true);
      return;
    }

    map.setCenter(cityCoords, 11, { duration: 250 });
    setStatus("Город найден. Введите адрес и нажмите «Найти адрес».", false);
  }

  async function searchByAddress() {
    const address = String(lineInput?.value || "").trim();
    const city = String(cityInput?.value || "").trim();
    if (!address) {
      setStatus("Введите адрес для поиска.", true);
      return;
    }
    if (!map || !window.ymaps) {
      setStatus("Карта еще не готова.", true);
      return;
    }

    setStatus("Ищем адрес на карте...", false);
    try {
      const result = await geocodeAddress(address, city);
      setSelectedPoint(result, false);
      setStatus("Адрес найден. Нажмите 'Сохранить' для сохранения.", false);
    } catch (error) {
      setStatus(extractYandexErrorMessage(error), true);
    }
  }

  function initMap() {
    if (!mapContainer) return;
    if (!window.ymaps || typeof window.ymaps.ready !== "function") {
      setMapMessage("Не удалось загрузить Яндекс.Карты.");
      setStatus("Сервис карты временно недоступен.", true);
      return;
    }

    window.ymaps.ready(() => {
      map = new window.ymaps.Map("delivery-map", {
        center: [55.751244, 37.618423],
        zoom: 10,
        controls: ["zoomControl", "geolocationControl"],
      });
      clearMapMessage();
      map.events.add("click", () => {
        setStatus("Введите адрес и нажмите «Найти адрес», либо выберите сохраненный адрес.", false);
      });
      searchByCity().catch((error) => setStatus(extractYandexErrorMessage(error), true));
    });
  }

  async function loadAddresses() {
    const data = await API.request("/profile/addresses", { method: "GET" });
    const items = data.addresses || [];
    if (!listEl) return;
    if (items.length === 0) {
      listEl.innerHTML = '<div class="muted-small">Нет сохраненных адресов</div>';
      return;
    }

    listEl.innerHTML = items
      .map(
        (item) => `
        <div class="chip ${item.isDefault ? "is-active" : ""}" data-address-id="${item.id}">
          <div class="chip-top">
            <span>${item.label || "Адрес"}</span>
            <button class="chip-remove" type="button" data-address-id="${item.id}" aria-label="Удалить адрес">×</button>
          </div>
          <span class="small">${[item.city, item.addressLine].filter(Boolean).join(", ")}</span>
        </div>`
      )
      .join("");

    listEl.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", async () => {
        const id = chip.getAttribute("data-address-id");
        const selected = items.find((row) => row.id === id);
        if (!selected) return;
        try {
          await API.request(`/profile/addresses/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isDefault: true }),
          });

          const coords = parseCoords(selected);
          const point = {
            coords: coords || [55.751244, 37.618423],
            city: selected.city || String(cityInput?.value || "").trim(),
            address: selected.addressLine || "",
            id: selected.id,
          };
          setSelectedPoint(point, true);
          setStatus("Сохраненный адрес выбран.", false);
          await loadAddresses();
        } catch (error) {
          setStatus(error.message, true);
        }
      });
    });

    listEl.querySelectorAll(".chip-remove").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.getAttribute("data-address-id");
        if (!id) return;
        try {
          await API.request(`/profile/addresses/${id}`, { method: "DELETE" });
          setStatus("Адрес удален.", false);
          await loadAddresses();
        } catch (error) {
          setStatus(error.message, true);
        }
      });
    });
  }

  citySearchBtn?.addEventListener("click", () => {
    searchByCity().catch((error) => {
      setStatus(extractYandexErrorMessage(error), true);
    });
  });

  addressSearchBtn?.addEventListener("click", () => {
    searchByAddress().catch((error) => setStatus(extractYandexErrorMessage(error), true));
  });

  cityInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchByCity().catch((error) => setStatus(extractYandexErrorMessage(error), true));
  });

  lineInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchByAddress().catch((error) => setStatus(extractYandexErrorMessage(error), true));
  });

  saveBtn?.addEventListener("click", async () => {
    if (!selectedPoint?.address || !Array.isArray(selectedPoint.coords)) {
      setStatus("Сначала найдите и выберите адрес на карте.", true);
      return;
    }
    setStatus("Сохранение...", false);
    try {
      await API.request("/profile/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Адрес доставки",
          city: selectedPoint.city || String(cityInput?.value || "").trim(),
          addressLine: selectedPoint.address,
          lat: selectedPoint.coords?.[0] ?? null,
          lng: selectedPoint.coords?.[1] ?? null,
          postalCode: null,
          officeCode: null,
          deliveryType: "manual",
          isDefault: true,
        }),
      });
      persistDeliverySelection({ deliveryPrice: 0 });
      setStatus("Адрес сохранён. Можно перейти к оплате.", false);
      await loadAddresses();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  function loadYandexMaps(apiKey) {
    return new Promise((resolve, reject) => {
      if (window.ymaps) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      const keyPart = apiKey ? `apikey=${encodeURIComponent(apiKey)}&` : "";
      script.src = `https://api-maps.yandex.ru/2.1/?${keyPart}lang=ru_RU`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Не удалось загрузить Яндекс.Карты"));
      document.head.appendChild(script);
    });
  }

  API.bootstrapUser()
    .then(async () => {
      API.wireLogout();
      const config = await API.request("/delivery/config");
      await loadYandexMaps(config.yandexMapsApiKey || "");
      initMap();
      loadAddresses().catch((error) => setStatus(error.message, true));
    })
    .catch((error) => {
      if (error.status === 401) window.location.replace("login.html");
    });
})();
