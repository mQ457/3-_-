(function () {
  const API = window.AppBootstrap;
  const cityInput = document.getElementById("address-city");
  const lineInput = document.getElementById("address-line");
  const saveBtn = document.getElementById("save-address-btn");
  const searchBtn = document.getElementById("address-search-btn");
  const statusEl = document.getElementById("address-status");
  const listEl = document.getElementById("saved-addresses");
  const mapContainer = document.getElementById("delivery-map");
  const skipDeliveryInput = document.getElementById("skip-delivery");
  const DELIVERY_SELECTION_KEY = "delivery_selection";

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

  function persistDeliverySelection(extra) {
    const payload = {
      deliveryType: skipDeliveryInput?.checked ? "none" : "russian_post",
      deliveryPointIndex: selectedPickupPoint?.postalCode || "",
      deliveryPointAddress: selectedPickupPoint?.address || "",
      deliveryPointId: selectedPickupPoint?.postalCode || "",
      deliveryPrice: Number(extra?.deliveryPrice || 0),
      city: selectedPickupPoint?.city || String(cityInput?.value || "").trim(),
    };
    sessionStorage.setItem(DELIVERY_SELECTION_KEY, JSON.stringify(payload));
    try {
      const checkout = JSON.parse(sessionStorage.getItem("checkout_payload") || "{}");
      checkout.deliveryType = payload.deliveryType;
      checkout.deliveryPointIndex = payload.deliveryPointIndex;
      checkout.deliveryPointAddress = payload.deliveryPointAddress;
      checkout.deliveryPointId = payload.deliveryPointId;
      checkout.deliveryAmount = payload.deliveryPrice;
      checkout.subtotalAmount = Number(checkout.subtotalAmount ?? checkout.totalAmount ?? 0);
      if (payload.deliveryType === "russian_post") {
        checkout.totalAmount = checkout.subtotalAmount + payload.deliveryPrice;
      }
      sessionStorage.setItem("checkout_payload", JSON.stringify(checkout));
    } catch {
      // noop
    }
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
    if (skipDeliveryInput?.checked) {
      setStatus("Доставка отключена — выберите «Без доставки» и сохраните.", false);
      return;
    }
    if (!postOfficeCollection) {
      postOfficeCollection = new window.ymaps.GeoObjectCollection();
      map.geoObjects.add(postOfficeCollection);
    }
    postOfficeCollection.removeAll();
    selectedPickupPoint = null;
    if (lineInput) lineInput.value = "";

    const query = new URLSearchParams({ city });
    if (Array.isArray(cityCoords) && cityCoords.length === 2) {
      query.set("lat", String(cityCoords[0]));
      query.set("lng", String(cityCoords[1]));
    }
    const data = await API.request(`/delivery/russian-post/offices?${query.toString()}`);
    const offices = data.offices || [];
    const points = [];

    async function resolveCoords(office) {
      const lat = Number(office.lat);
      const lng = Number(office.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
      const queryText = [office.address || office.label, office.city || city, "Почта России"]
        .filter(Boolean)
        .join(", ");
      try {
        const geo = await geocode(queryText, { results: 1 });
        const object = geo.geoObjects.get(0);
        const coords = object?.geometry?.getCoordinates?.();
        return Array.isArray(coords) ? coords : null;
      } catch {
        return null;
      }
    }

    for (const office of offices.slice(0, 40)) {
      const coords = await resolveCoords(office);
      if (!coords) continue;
      const point = {
        coords,
        city: office.city || city,
        address: office.address || office.label,
        postalCode: office.postalCode,
      };
      const marker = new window.ymaps.Placemark(
        coords,
        {
          balloonContentHeader: "Почта России",
          balloonContentBody: point.address,
          hintContent: office.postalCode || point.address,
        },
        { preset: "islands#blueIcon" }
      );
      marker.events.add("click", () => selectPickupPoint(point, false));
      postOfficeCollection.add(marker);
      points.push(point);
    }

    if (points.length === 0) {
      if (!offices.length) {
        setStatus(
          "Почта России не вернула ОПС. Проверьте POCHTA_OTPRAVKA_TOKEN и POCHTA_OTPRAVKA_USER_AUTH на сервере (Render → Environment).",
          true
        );
      } else {
        setStatus(
          "ОПС найдены, но без координат на карте. Попробуйте уточнить город или повторить поиск позже.",
          true
        );
      }
      return;
    }

    points.sort((a, b) => distanceScore(a.coords, cityCoords) - distanceScore(b.coords, cityCoords));
    selectPickupPoint(points[0], true);
    setStatus(`Найдено пунктов выдачи: ${points.length}. Ближайший выбран автоматически.`, false);
  }

  async function resolveCityCoordinates(city) {
    const query = `Россия, ${city}`;
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

    setStatus("Определяем город и ищем ОПС Почты России...", false);
    let cityCoords = null;

    try {
      cityCoords = await resolveCityCoordinates(city);
    } catch (error) {
      setStatus(`Не удалось найти город: ${extractYandexErrorMessage(error)}.`, true);
      return;
    }
    if (!cityCoords) {
      setStatus("Город не найден. Введите название как в почтовом адресе, например: Казань или Владивосток.", true);
      return;
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
    if (skipDeliveryInput?.checked) {
      persistDeliverySelection({ deliveryPrice: 0 });
      setStatus("Доставка отключена. Можно перейти к оплате.", false);
      return;
    }
    if (!selectedPickupPoint?.address || !selectedPickupPoint?.postalCode) {
      setStatus("Сначала выберите пункт выдачи Почты России на карте.", true);
      return;
    }
    setStatus("Сохранение...", false);
    try {
      let deliveryPrice = 0;
      try {
        const checkout = JSON.parse(sessionStorage.getItem("checkout_payload") || "{}");
        const tariff = await API.request("/delivery/russian-post/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            indexTo: selectedPickupPoint.postalCode,
            modelVolumeCm3: checkout.modelVolumeCm3,
            material: checkout.material,
            qty: checkout.qty,
          }),
        });
        deliveryPrice = Number(tariff.deliveryPrice || 0);
      } catch (error) {
        console.warn("tariff", error);
      }
      await API.request("/profile/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Пункт выдачи Почты России",
          city: selectedPickupPoint.city || String(cityInput?.value || "").trim(),
          addressLine: selectedPickupPoint.address,
          lat: selectedPickupPoint.coords?.[0] ?? null,
          lng: selectedPickupPoint.coords?.[1] ?? null,
          postalCode: selectedPickupPoint.postalCode,
          officeCode: selectedPickupPoint.postalCode,
          deliveryType: "russian_post",
          isDefault: true,
        }),
      });
      persistDeliverySelection({ deliveryPrice });
      setStatus(`Адрес сохранён. Доставка: ${deliveryPrice} ₽`, false);
      await loadAddresses();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  skipDeliveryInput?.addEventListener("change", () => {
    if (skipDeliveryInput.checked) {
      persistDeliverySelection({ deliveryPrice: 0 });
      setStatus("Доставка не будет добавлена к заказу.", false);
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
