(function () {
  const API = window.AppBootstrap;
  const cityInput = document.getElementById("address-city");
  const lineInput = document.getElementById("address-line");
  const saveBtn = document.getElementById("save-address-btn");
  const searchBtn = document.getElementById("address-search-btn");
  const statusEl = document.getElementById("address-status");
  const listEl = document.getElementById("saved-addresses");
  const mapContainer = document.getElementById("delivery-map");

  const CITY_FALLBACK_COORDS = {
    "москва": [55.751244, 37.618423],
    "санкт-петербург": [59.938955, 30.315644],
    "питер": [59.938955, 30.315644],
    "новосибирск": [55.030199, 82.92043],
    "екатеринбург": [56.838011, 60.597465],
    "казань": [55.796127, 49.106405],
    "нижний новгород": [56.326797, 44.006516],
    "челябинск": [55.160026, 61.40259],
    "омск": [54.989347, 73.368221],
    "самара": [53.195878, 50.100202],
    "ростов-на-дону": [47.235714, 39.701505],
    "уфа": [54.738762, 55.972055],
  };

  let map = null;
  let selectedMarker = null;
  let postOfficeCollection = null;
  let selectedPickupPoint = null;

  if (lineInput) {
    lineInput.readOnly = true;
    lineInput.placeholder = "Выберите пункт выдачи Почты России на карте";
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

  function getCityFallbackCoords(city) {
    return CITY_FALLBACK_COORDS[String(city || "").trim().toLowerCase()] || null;
  }

  function parseAddressParts(geoObject, fallbackCity) {
    const text = geoObject?.properties?.get("text") || geoObject?.properties?.get("name") || "Почта России";
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

  function distanceScore(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return Number.POSITIVE_INFINITY;
    const lat = a[0] - b[0];
    const lng = a[1] - b[1];
    return lat * lat + lng * lng;
  }

  function selectPickupPoint(point, silent) {
    if (!map || !window.ymaps || !point?.coords) return;
    selectedPickupPoint = point;
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
      setStatus("Выбран пункт выдачи Почты России. Нажмите 'Сохранить'.", false);
    }
  }

  async function renderPostOfficesForCity(city, cityCoords) {
    if (!map || !window.ymaps) return;
    if (!postOfficeCollection) {
      postOfficeCollection = new window.ymaps.GeoObjectCollection();
      map.geoObjects.add(postOfficeCollection);
    }
    postOfficeCollection.removeAll();
    selectedPickupPoint = null;
    if (lineInput) lineInput.value = "";

    const result = await geocode(`Почта России ${city}`, { results: 20 });
    const points = [];

    result.geoObjects.each((geoObject) => {
      const coords = geoObject?.geometry?.getCoordinates?.();
      if (!Array.isArray(coords)) return;
      const parsed = parseAddressParts(geoObject, city);
      const address = parsed.line || "Почта России";
      const point = {
        coords,
        city: parsed.city || city,
        address,
      };

      const marker = new window.ymaps.Placemark(
        coords,
        {
          balloonContentHeader: "Почта России",
          balloonContentBody: address,
          hintContent: address,
        },
        { preset: "islands#blueIcon" }
      );

      marker.events.add("click", () => {
        selectPickupPoint(point, false);
      });

      postOfficeCollection.add(marker);
      points.push(point);
    });

    if (points.length === 0) {
      setStatus("В этом городе не удалось найти пункты выдачи Почты России.", true);
      return;
    }

    points.sort((a, b) => distanceScore(a.coords, cityCoords) - distanceScore(b.coords, cityCoords));
    selectPickupPoint(points[0], true);
    setStatus(`Найдено пунктов выдачи: ${points.length}. Ближайший выбран автоматически.`, false);
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

    setStatus("Ищем пункты выдачи Почты России...", false);
    let cityCoords = null;

    try {
      const cityResult = await geocode(city, { results: 1 });
      const cityObject = cityResult.geoObjects.get(0);
      cityCoords = cityObject?.geometry?.getCoordinates?.() || null;
    } catch (error) {
      cityCoords = getCityFallbackCoords(city);
      if (!cityCoords) {
        setStatus(`Не удалось найти город: ${extractYandexErrorMessage(error)}.`, true);
        return;
      }
      setStatus("Геокодер города недоступен, используем локальные координаты.", true);
    }

    map.setCenter(cityCoords, 11, { duration: 250 });
    try {
      await renderPostOfficesForCity(city, cityCoords);
    } catch (error) {
      setStatus(`Не удалось получить пункты Почты России: ${extractYandexErrorMessage(error)}.`, true);
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
        setStatus("Выберите отделение только по синей точке Почты России.", true);
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
          };
          selectPickupPoint(point, true);
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

  searchBtn?.addEventListener("click", () => {
    searchByCity().catch((error) => {
      setStatus(extractYandexErrorMessage(error), true);
    });
  });

  cityInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchByCity().catch((error) => setStatus(extractYandexErrorMessage(error), true));
  });

  saveBtn?.addEventListener("click", async () => {
    if (!selectedPickupPoint?.address) {
      setStatus("Сначала выберите пункт выдачи Почты России на карте.", true);
      return;
    }
    setStatus("Сохранение...", false);
    try {
      await API.request("/profile/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Пункт выдачи Почты России",
          city: selectedPickupPoint.city || String(cityInput?.value || "").trim(),
          addressLine: selectedPickupPoint.address,
          lat: selectedPickupPoint.coords?.[0] ?? null,
          lng: selectedPickupPoint.coords?.[1] ?? null,
          isDefault: true,
        }),
      });
      setStatus("Адрес сохранен.", false);
      await loadAddresses();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  API.bootstrapUser()
    .then(() => {
      API.wireLogout();
      initMap();
      loadAddresses().catch((error) => setStatus(error.message, true));
    })
    .catch((error) => {
      if (error.status === 401) window.location.replace("login.html");
    });
})();
