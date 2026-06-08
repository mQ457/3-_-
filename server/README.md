# Auth API (Express + Postgres)

## Быстрый старт

### Локально

```bash
# из корня репозитория
npm install
copy server\.env.example server\.env   # Windows
# заполните server/.env (минимум GIGACHAT_AUTH_KEY для ИИ-поддержки)
npm start
```

Сайт: `http://localhost:3000`

Без `DATABASE_URL` в `.env` сервер использует in-memory БД — удобно для проверки, но данные сбрасываются после перезапуска. Для постоянных данных укажите Neon/Postgres в `DATABASE_URL`.

### Render

1. Подключите репозиторий на [render.com](https://render.com).
2. **Root Directory:** `server` (или используйте `render.yaml` из корня — Blueprint подхватит настройки).
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. В **Environment** задайте переменные (см. блок «Render» в `server/.env.example`).

Обязательно на Render:
- `DATABASE_URL` — строка подключения Neon/Supabase
- `NODE_ENV=production`
- `CORS_ORIGIN=https://<ваш-сервис>.onrender.com`
- `GIGACHAT_AUTH_KEY` и `GIGACHAT_TLS_INSECURE=1` (если используете GigaChat)
- `AUTO_OPEN_BROWSER=0`

Health check: `GET /api/health`

---

## 1) Setup (подробнее)

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` in `.env` (for example Neon/Supabase/local Postgres).
3. Install dependencies:
   - from repo root: `npm install`
   - or only server: `cd server && npm install`
4. On first start the server creates tables automatically from `sql/init.sql`, seeds service options and ensures admin account.

Default admin credentials (if not overridden via env):
- phone: `+79990000000`
- password: `Admin12345!`

You can override them with:
- `ADMIN_PHONE`
- `ADMIN_PASSWORD`
- or `ADMIN_PASSWORD_HASH`

## 2) Run locally

- From repo root: `npm start` or `npm run dev`
- From server folder: `npm start` or `npm run dev`

Server starts on `http://localhost:3000` by default.

## 2.1) AI support bot (заглушка, по умолчанию)

Без внешних API: бот отвечает заготовленными текстами по ключевым словам и выглядит как ИИ-помощник.

Set env:
- `SUPPORT_BOT_ENABLED=1`
- `AI_PROVIDER=stub`

Поведение:
- Вопрос распознан (заказ, доставка, материалы и т.д.) → ответ из базы шаблонов, статус `bot_active`.
- Вопрос не распознан → сообщение «не понял вопрос» и передача консультанту (`status=open`).
- Запрос оператора / возврат / спорный платёж → передача консультанту.

Заготовки: `server/src/domain/support-stub.js` — можно дополнять категории и тексты.

## 2.2) AI support bot (GigaChat / Groq / Ollama)

Если позже появится рабочий API, укажите провайдера:

Set env:
- `AI_PROVIDER=gigachat` (или `groq`, `ollama`)
- ключи провайдера — см. `.env.example`

Support chat can also auto-reply with a local LLM and escalate to human admin only when needed.

1. Install Ollama: `https://ollama.com/download`
2. Pull model (recommended starter): `ollama pull qwen2.5:3b`
3. Add env variables to `.env`:
   - `SUPPORT_BOT_ENABLED=1`
   - `OLLAMA_URL=http://127.0.0.1:11434`
   - `OLLAMA_MODEL=qwen2.5:3b`
   - optional: `OLLAMA_API_KEY=...` (if your Ollama endpoint is behind auth)
   - optional: `OLLAMA_TIMEOUT_MS=45000`

## 2.1.2) Groq API mode (no self-hosted Ollama)

Use Groq when you want AI in deploy without running your own model server.

Set env:
- `SUPPORT_BOT_ENABLED=1`
- `AI_PROVIDER=groq`
- `GROQ_API_KEY=...`
- `GROQ_MODEL=llama-3.1-8b-instant`
- optional: `GROQ_BASE_URL=https://api.groq.com/openai/v1`

## 2.2) Deploy with AI enabled

For production, run AI on a separate Linux server (VPS) and connect app backend to it.

On VPS:
1. Install Ollama and model:
   - `curl -fsSL https://ollama.com/install.sh | sh`
   - `ollama pull qwen2.5:3b`
2. Run as a service and expose endpoint via Nginx reverse proxy (HTTPS).
3. Protect endpoint with auth token (recommended) or IP allowlist.

In Render env:
- `SUPPORT_BOT_ENABLED=1`
- `AI_PROVIDER=ollama`
- `OLLAMA_URL=https://<your-ollama-domain>`
- `OLLAMA_MODEL=qwen2.5:3b`
- `OLLAMA_API_KEY=<token-if-enabled>`
- `AUTO_OPEN_BROWSER=0`

## 3) Render + Neon (free and persistent)

Render web service:
1. Register on `https://render.com`.
2. Create a new Web Service and connect your repository.
3. Set **Root Directory** to `server`.
4. Set **Build Command** to `npm install`.
5. Set **Start Command** to `npm start`.

Environment Variables in Render:
- `DATABASE_URL=postgresql://...` (your Neon connection string) — **required**
- `SESSION_COOKIE_NAME=session_token`
- `SESSION_TTL_DAYS=7`
- `CORS_ORIGIN=https://<your-service>.onrender.com` (if several domains are needed, separate with commas)
- `NODE_ENV=production`
- `AUTO_OPEN_BROWSER=0`
- `SUPPORT_BOT_ENABLED=1`, `AI_PROVIDER=stub`
- optional: `ADMIN_PHONE=+79990000000`
- optional: `ADMIN_PASSWORD=Admin12345!`

Neon:
1. Create project on `https://neon.tech`.
2. Copy connection string and paste it into `DATABASE_URL` on Render.
3. Redeploy Render service.

## 3.1) Production readiness checklist

- Set `NODE_ENV=production`.
- Set strict `CORS_ORIGIN` to your frontend domain(s), not `*`.
- Keep `AUTO_OPEN_BROWSER=0` in deploy.
- Use HTTPS in production (secure cookies depend on it).
- Rotate default admin credentials (`ADMIN_PHONE` / `ADMIN_PASSWORD`).
- Verify health endpoint: `GET /api/health`.

## 4) API

- `POST /api/auth/register` `{ phone, password, fullName }`
- `POST /api/auth/login` `{ phone, password }`
- `POST /api/auth/logout`
- `GET /api/profile/me`
- `PATCH /api/profile/me` `{ fullName, phone, email }`

All authenticated requests use `HTTP-only` cookie set by login/register.
