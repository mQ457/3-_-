(function () {
  const API = window.AdminCommon;
  const cityInput = document.getElementById("warehouse-city");
  const addressInput = document.getElementById("warehouse-address");
  const indexInput = document.getElementById("warehouse-index");
  const searchBtn = document.getElementById("warehouse-search-btn");
  const saveBtn = document.getElementById("warehouse-save-btn");
  const statusEl = document.getElementById("warehouse-status");
  const mapEl = document.getElementById("warehouse-map");

  let map = null;
  let collection = null;
  let selected = null;
  let yandexKey = "";

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#f87171" : "#34d399";
  }

  function loadYandexMaps() {
    return new Promise((resolve, reject) => {
      if (window.ymaps) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      const keyPart = yandexKey ? `apikey=${encodeURIComponent(yandexKey)}&` : "";
      script.src = `https://api-maps.yandex.ru/2.1/?${keyPart}lang=ru_RU`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Не удалось загрузить Яндекс.Карты"));
      document.head.appendChild(script);
    });
  }

  function selectOffice(office) {
    selected = office;
    if (addressInput) addressInput.value = office.address || "";
    if (indexInput) indexInput.value = office.postalCode || "";
    if (map && office.lat != null && office.lng != null) {
      map.setCenter([office.lat, office.lng], 15, { duration: 200 });
    }
  }

  async function renderOffices(city, centerCoords) {
    const query = new URLSearchParams({ city });
    if (Array.isArray(centerCoords) && centerCoords.length === 2) {
      query.set("lat", String(centerCoords[0]));
      query.set("lng", String(centerCoords[1]));
    }
    const data = await API.request(`/delivery/russian-post/offices?${query.toString()}`);
    const offices = data.offices || [];
    if (!map || !window.ymaps) return;
    if (!collection) {
      collection = new window.ymaps.GeoObjectCollection();
      map.geoObjects.add(collection);
    }
    collection.removeAll();
    offices.forEach((office) => {
      if (office.lat == null || office.lng == null) return;
      const marker = new window.ymaps.Placemark(
        [office.lat, office.lng],
        { balloonContent: office.label || office.address, hintContent: office.postalCode },
        { preset: "islands#blueIcon" }
      );
      marker.events.add("click", () => selectOffice(office));
      collection.add(marker);
    });
    if (offices[0]) selectOffice(offices[0]);
    setStatus(`Найдено ОПС: ${offices.length}`, false);
  }

  async function resolveCityCenter(city) {
    if (window.ymaps) {
      try {
        const result = await new Promise((resolve, reject) => {
          window.ymaps.geocode(`Россия, ${city}`, { results: 1, kind: "locality" }).then(resolve, reject);
        });
        const coords = result?.geoObjects?.get(0)?.geometry?.getCoordinates?.();
        if (Array.isArray(coords) && coords.length === 2) return coords;
      } catch {

      }
    }
    const data = await API.request(`/delivery/geocode-city?city=${encodeURIComponent(city)}`);
    return [Number(data.lat), Number(data.lng)];
  }

  async function searchCity() {
    const city = String(cityInput?.value || "").trim();
    if (!city) {
      setStatus("Введите город.", true);
      return;
    }
    setStatus("Загрузка ОПС...", false);
    try {
      const center = await resolveCityCenter(city);
      if (map && center?.length === 2) {
        map.setCenter(center, 11, { duration: 200 });
      }
      await renderOffices(city, center);
    } catch (error) {
      setStatus(error.message || "Ошибка поиска ОПС", true);
    }
  }

  async function saveWarehouse() {
    if (!selected?.postalCode) {
      setStatus("Выберите ОПС на карте.", true);
      return;
    }
    try {
      await API.request("/admin/pochta-warehouse", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse: {
            postalCode: selected.postalCode,
            address: selected.address,
            city: selected.city || String(cityInput?.value || "").trim(),
            lat: selected.lat,
            lng: selected.lng,
            officeCode: selected.officeCode || selected.postalCode,
            label: "Склад отправления",
          },
        }),
      });
      setStatus("Склад сохранён.", false);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function loadWarehouse() {
    const data = await API.request("/admin/pochta-warehouse");
    const warehouse = data.warehouse;
    if (!warehouse) return;
    if (cityInput && warehouse.city) cityInput.value = warehouse.city;
    selectOffice({
      postalCode: warehouse.postalCode,
      address: warehouse.address,
      city: warehouse.city,
      lat: warehouse.lat,
      lng: warehouse.lng,
      officeCode: warehouse.officeCode,
    });
  }

  searchBtn?.addEventListener("click", () => searchCity().catch((e) => setStatus(e.message, true)));
  saveBtn?.addEventListener("click", () => saveWarehouse().catch((e) => setStatus(e.message, true)));

  API.ensureAdmin()
    .then(async () => {
      API.wireLogout();
      const config = await API.request("/delivery/config");
      yandexKey = config.yandexMapsApiKey || "";
      await loadYandexMaps();
      window.ymaps.ready(() => {
        map = new window.ymaps.Map(mapEl, {
          center: [55.751244, 37.618423],
          zoom: 10,
          controls: ["zoomControl"],
        });
        return loadWarehouse().then(() => searchCity());
      });
    })
    .catch((error) => {
      if (error.status === 401 || error.status === 403) window.location.href = "admin.html";
      else setStatus(error.message, true);
    });
})();
