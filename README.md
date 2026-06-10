# 3Д Печать — документация проекта

Сайт услуг 3Д-печати, моделирования и сканирования. Фронтенд — статические HTML/CSS/JS; бэкенд — Express + PostgreSQL (или in-memory БД для локальной разработки).

## Запуск

```bash
npm install
copy server\.env.example server\.env
npm start
```

Сайт открывается на `http://localhost:3000`. Подробности по API и переменным окружения — в [server/README.md](server/README.md).

---

## Структура репозитория

```
├── landing.html, print-step-*.html, profile.html …   — страницы сайта
├── scripts/                                          — клиентская логика
├── site.css, styles.css, admin.css                   — стили
├── image/                                            — изображения и иконки
├── input.js, delet_landing_page.js                   — утилиты для всех страниц
├── server/                                           — Express API, БД, доменная логика
└── package.json                                      — npm start → server
```

---

## HTML-страницы

### `landing.html` — главная

Маркетинговая страница: hero, услуги, портфолио, отзывы, форма отзыва.

| Скрипт | Назначение |
|--------|------------|
| `scripts/app-bootstrap.js` | Проверка сессии, кэш пользователя, `AppBootstrap.request()` |
| `scripts/order-notifications.js` | Колокольчик уведомлений, WebSocket/polling |
| `scripts/landing-auth-link.js` | Кнопка «Личный кабинет» → `profile.html` или `login.html` |
| `scripts/landing-motion.js` | Анимации при скролле, sticky-шапка |
| `scripts/landing-reviews.js` | Карусель отзывов, отправка нового отзыва |
| `delet_landing_page.js` | Скрывает полосу прокрутки на странице |

Стили: `site.css`.

---

### `print-step-1.html` — заявка на сканирование

Четырёхшаговый мастер (wizard) вместо калькулятора. Слева — подсказки, справа — форма.

| Скрипт | Назначение |
|--------|------------|
| `scripts/print-service.js` | Вся логика услуги `scan`: wizard, валидация, отправка заявки |
| `scripts/app-bootstrap.js` | Авторизация |
| `scripts/landing-motion.js` | Анимации шапки |
| `scripts/order-notifications.js` | Уведомления |
| `delet_landing_page.js` | Скрытие скроллбара |

---

### `print-step-2.html` — заявка на моделирование

Аналогично `print-step-1.html`, но тип услуги `modeling`.

Те же скрипты; `print-service.js` определяет тип по имени файла страницы.

---

### `print-step-3.html` — заказ 3Д-печати

Калькулятор печати с загрузкой и **3D-превью модели**.

| Скрипт | Назначение |
|--------|------------|
| `scripts/print-service.js` | Загрузка файла, Three.js viewer, расчёт цены, переход к оплате |
| остальные | как на других print-страницах |

Ключевые элементы разметки:
- `#model-file-input` — input для файла
- `#model-upload-trigger` — кнопка «загрузить»
- `#model-viewer-host` / `#model-preview-canvas` — область 3D-превью
- `form.config-row` — параметры (технология, материал, цвет, толщина, количество)

---

### `checkout.html` — оплата

Выбор или ввод карты, подтверждение заказа.

| Скрипт | Назначение |
|--------|------------|
| `scripts/checkout.js` | Карты из профиля, валидация, сохранение контекста в `sessionStorage` |
| `scripts/app-bootstrap.js` | API-запросы |
| `delet_landing_page.js` | Скрытие скроллбара |

Данные заказа берутся из `sessionStorage.checkout_payload` (заполняется в `print-service.js`).

---

### `processing.html` — обработка оплаты

Промежуточный экран после checkout: создаёт заказ через API.

| Скрипт | Назначение |
|--------|------------|
| `scripts/checkout-processing.js` | Читает `checkout_processing_context`, POST `/orders`, редирект в заказы |

---

### `login.html` — вход / регистрация

| Скрипт | Назначение |
|--------|------------|
| `scripts/login.js` | Формы login/register, редирект после входа (`?next=`) |

---

### `profile.html` — личный кабинет

Профиль, адреса, чат поддержки (в т.ч. ИИ-бот).

| Скрипт | Назначение |
|--------|------------|
| `scripts/profile.js` | Редактирование профиля, чат, WebSocket |
| `scripts/app-bootstrap.js` | Защита страницы, logout |
| `scripts/order-notifications.js` | Уведомления |
| `delet_landing_page.js` | Скрытие скроллбара |

---

### `orders.html` — мои заказы

Список заказов, статусы, QR Почты России, скачивание файла модели.

| Скрипт | Назначение |
|--------|------------|
| `scripts/orders.js` | Загрузка заказов, детали, оплата |
| `scripts/pochta-qr.js` | Генерация QR для отправки посылки |
| `scripts/app-bootstrap.js`, `order-notifications.js`, `delet_landing_page.js` | как выше |

---

### `delivery-address.html` — адрес доставки

Карта Яндекса, выбор ПВЗ/адреса для доставки готового изделия.

| Скрипт | Назначение |
|--------|------------|
| `scripts/delivery-address.js` | Яндекс.Карты, сохранение адреса |
| `scripts/app-bootstrap.js`, `order-notifications.js`, `delet_landing_page.js` | как выше |

---

### `payment.html` — способы оплаты

Управление сохранёнными картами.

| Скрипт | Назначение |
|--------|------------|
| `scripts/payment.js` | CRUD карт, маскирование номера |
| `scripts/app-bootstrap.js`, `order-notifications.js` | как выше |

---

### Админ-панель (`admin*.html`)

Общая оболочка: `admin.html` (дашборд). Разделы:

| Файл | Скрипт | Раздел |
|------|--------|--------|
| `admin-orders.html` | `admin-orders.js` | Заказы, смена статуса, файл модели |
| `admin-clients.html` | `admin-clients.js` | Клиенты |
| `admin-warehouse.html` | `admin-warehouse.js` | Склад, варианты печати |
| `admin-delivery.html` | `admin-delivery.js` | Настройки доставки, карта |
| `admin-reviews.html` | `admin-reviews.js` | Модерация отзывов |
| `admin-notifications.html` | `admin-notifications.js` | Рассылка уведомлений |
| `admin-support.html` | `admin-support.js` | Чаты поддержки |
| `admin-settings.html` | `admin-settings.js` | Тарифы, опции услуг |

На всех админ-страницах: `scripts/admin-common.js` (авторизация admin, `AdminCommon.request`).

Стили: `admin.css` + `site.css`.

---

## Клиентские скрипты (`scripts/`)

| Файл | Роль |
|------|------|
| `app-bootstrap.js` | Глобальный `window.AppBootstrap`: fetch к `/api`, кэш пользователя, защита страниц (`profile`, `orders`, `payment`, `delivery-address`), logout |
| `print-service.js` | **Ядро заказа услуг**: калькулятор, 3D viewer, wizard сканирования/моделирования, черновики в `sessionStorage` |
| `checkout.js` | Страница оплаты |
| `checkout-processing.js` | Создание заказа после оплаты |
| `login.js` | Авторизация |
| `profile.js` | Профиль и поддержка |
| `orders.js` | Список заказов клиента |
| `payment.js` | Банковские карты |
| `delivery-address.js` | Адрес и карта |
| `order-notifications.js` | Уведомления в шапке |
| `landing-auth-link.js` | Ссылка кабинета на главной |
| `landing-motion.js` | Анимации landing |
| `landing-reviews.js` | Отзывы на landing |
| `pochta-qr.js` | QR-коды Почты России |
| `admin-common.js` | База для админки |
| `admin-*.js` | Логика разделов админки |

---

## Утилиты в корне

### `input.js`

Очистка полей форм при загрузке и фокусе. Подключается на страницах с формами (через атрибуты `data-clear-on-focus`, `data-clear-all`, классы `.clear-on-load`).

### `delet_landing_page.js`

После `load` добавляет CSS, скрывающий scrollbar у `html` и `body`. Подключается на большинстве внутренних страниц.

---

## Стили

| Файл | Область |
|------|---------|
| `site.css` | Основной UI: landing, print-страницы, профиль, заказы, checkout, 3D viewer (`.model-viewer-host`, `#model-preview-canvas`) |
| `styles.css` | Дополнительные/legacy стили |
| `admin.css` | Админ-панель |

---

## 3D-модели: загрузка и отображение

Вся клиентская логика сосредоточена в **`scripts/print-service.js`** (только страница `print-step-3.html`).

### Схема потока

```
Пользователь выбирает файл (STL/OBJ/AMF/3MF/FBX)
        ↓
attachModelUpload() — обработчик #model-file-input
        ↓
URL.createObjectURL(file) → локальный preview URL
        ↓
ensureThreeViewer() — Three.js сцена на #model-preview-canvas
        ↓
estimateObjectVolumeCm3() → объём в см³ → расчёт цены
        ↓
tryUploadModelFile() → POST /api/orders/upload (если пользователь авторизован)
        ↓
Файл сохраняется в server/uploads/, путь в uploadedFile
        ↓
При checkout — payload с file_path уходит в POST /api/orders
```

### Ключевые функции в `print-service.js`

| Функция | Строки (прибл.) | Что делает |
|---------|-----------------|------------|
| `attachModelUpload()` | ~894 | Вешает обработчики на кнопку загрузки, input, диалог замены файла |
| `loadThreeEcosystem()` | ~791 | Динамически подгружает Three.js 0.125.2 с unpkg + loaders (STL, OBJ, FBX, AMF, 3MF) + fflate |
| `ensureThreeViewer()` | ~995 | Создаёт WebGLRenderer, камеру, OrbitControls, освещение, сетку; загружает модель по расширению |
| `meshVolumeCm3()` | ~716 | Считает объём mesh по треугольникам (мм³ → см³) |
| `estimateObjectVolumeCm3()` | ~744 | Суммирует объём всех mesh в сцене |
| `tryUploadModelFile()` | ~884 | `FormData` → `POST /api/orders/upload` |
| `disposeModelViewer()` | ~814 | Очистка WebGL при смене файла |
| `addBlenderStyleViewport()` | ~842 | Серый фон, сетка, оси X/Y/Z как в Blender |

### Поддерживаемые форматы

- **Превью и расчёт объёма:** STL, OBJ, FBX, AMF, 3MF
- **Исходники для моделирования/сканирования (без 3D viewer):** также JPG, PNG, PDF, DWG, DXF

### Серверная часть загрузки

`server/src/routes/order.routes.js`:

- `POST /api/orders/upload` — multer сохраняет файл в `server/uploads/`, возвращает `{ name, path, size, ext }`
- `POST /api/orders` — создаёт заказ с полями `file_name`, `file_path`, `file_size`, `file_ext`
- `POST /api/orders/price-preview` — расчёт цены с учётом `modelVolumeCm3`, технологии, материала и т.д.

Статика загруженных файлов: Express раздаёт `/uploads/*` из папки `server/uploads`.

### Разметка на `print-step-3.html`

```html
<div data-model-panel>
  <input id="model-file-input" accept=".stl,.obj,.amf,.3mf,.fbx" />
  <div id="model-viewer-host" hidden>
    <canvas id="model-preview-canvas"></canvas>
  </div>
</div>
```

После выбора файла панель получает класс `is-model-preview`, viewer показывается, пустое состояние скрывается.

### Расчёт цены

1. Пользователь меняет параметры или загружает модель → `hasUserInteractedWithCalculator = true`
2. `buildPayload()` собирает технологию, материал, объём, qty
3. `updatePrice()` → `POST /api/orders/price-preview`
4. `canCheckoutToPayment()` проверяет: все поля заполнены, файл есть, цена > 0
5. `saveCheckoutPayload()` → `sessionStorage.checkout_payload` → переход на `checkout.html`

---

## Бэкенд (`server/`)

| Путь | Назначение |
|------|------------|
| `server/src/index.js` | Express: static фронтенда, CORS, маршруты `/api/*`, WebSocket `/ws`, pretty URLs (`/profile` → `profile.html`) |
| `server/src/db.js` | Подключение Postgres или in-memory fallback |
| `server/src/auth.js` | JWT в cookie, хеш паролей |
| `server/src/routes/auth.routes.js` | login, register, logout, `/auth/me` |
| `server/src/routes/order.routes.js` | заказы, upload, price-preview, options |
| `server/src/routes/profile.routes.js` | профиль, адреса, карты, уведомления, поддержка |
| `server/src/routes/admin.routes.js` | админ API |
| `server/src/routes/delivery.routes.js` | доставка |
| `server/src/routes/review.routes.js` | отзывы |
| `server/src/domain/support-bot.js` | ИИ-бот поддержки (GigaChat/Ollama) |
| `server/src/domain/russian-post/` | Интеграция Почты России |
| `server/src/realtime.js` | WebSocket-рассылка событий |
| `server/sql/init.sql` | Схема БД |

---

## Хранение состояния в браузере

| Ключ `sessionStorage` | Где пишется | Смысл |
|-----------------------|-------------|-------|
| `print_service_draft_{type}` | `print-service.js` | Черновик параметров услуги |
| `print_service_quote_step_{type}` | `print-service.js` | Текущий шаг wizard (scan/modeling) |
| `checkout_payload` | `print-service.js` | Данные для оплаты |
| `checkout_processing_context` | `checkout.js` | Контекст для `processing.html` |
| `app.userCache` | `app-bootstrap.js` | Кэш `/auth/me` на 5 минут |
| `app.toast` | `print-service.js` | Toast после отправки заявки |

---

## API (кратко)

Базовый префикс: `/api`. Все запросы с `credentials: "include"`.

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/login`, `/auth/register` | Вход и регистрация |
| GET | `/auth/me` | Текущий пользователь |
| GET | `/orders/options` | Технологии, материалы, склад |
| POST | `/orders/price-preview` | Расчёт стоимости |
| POST | `/orders/upload` | Загрузка 3D-файла |
| POST | `/orders` | Создание заказа |
| GET | `/orders` | Список заказов пользователя |

Полный список — в [server/README.md](server/README.md).
