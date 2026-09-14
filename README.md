# Telemt Control Panel

Web UI для управления [Telemt MTProto proxy](https://github.com/telemt/telemt) с авторизацией, аудитом, runtime-операциями и аналитикой.

Текущая ветка модернизации ориентирована на **Telemt 3.5.7**. Панель переведена на Node.js 24 LTS, воспроизводимые npm-сборки и актуальный Control API; новые endpoint'ы Telemt 3.5.7 интегрированы без передачи API-токена в браузер.

## Возможности

- 🔐 **Авторизация панели** — bcrypt, httpOnly cookie, CSRF-токен, rate limiting, idle timeout, опциональный IP-binding
- 👥 **Управление пользователями** — создание, редактирование, удаление, ротация секрета, enable/disable и reset quota
- 📊 **Статистика** — Summary, Zero/All, Upstreams, DCs, ME Writers, Minimal All и активные source IP
- ⚙️ **Runtime** — Gates, Initialization, ME Pool, ME Quality, Upstream Quality, NAT/STUN, ME Selftest и readiness
- 🌐 **Runtime Edge / WEB** — connection summary, recent events, TLS fingerprints, WEB status/sessions, close session, Pause/Drain/Resume
- 🧩 **Configuration** — безопасный sparse JSON patch с `If-Match` revision, conflict handling и drain+rollback runtime reload
- 📈 **Analytics** — live-график соединений, топ пользователей, 3D-глобус; GeoIP включается только явной настройкой оператора
- 🔍 **Analysis** — health score, детектирование аномалий, анализ лимитов пользователей
- 🛡️ **Panel Security** — активные сессии/revoke, аудит-лог и текущая конфигурация безопасности панели
- 📦 **Локальный frontend bundle** — React/Chart.js/D3/TopoJSON/world-atlas собираются через npm/esbuild; browser Babel и runtime CDN не используются

Новые observability endpoint'ы, отсутствующие в более старом Telemt, отображаются как unavailable/N/A вместо аварийного состояния панели там, где это безопасно определить по фиксированному endpoint.

## Требования

Для запуска без Docker требуется **Node.js 24 LTS**. Зависимости фиксируются в `package-lock.json`; для воспроизводимой установки используйте `npm ci`.

## Быстрый старт

### 1. Настройка

```bash
cp .env.example .env

# Воспроизводимая установка зависимостей
npm ci

# Предварительная сборка локального frontend bundle
npm run build

# Интерактивный wizard (рекомендуется)
node setup-password.js init

# Или вручную
node setup-password.js hash <your-password>   # → PANEL_PASSWORD_HASH
node setup-password.js secret                  # → SESSION_SECRET
```

### 2. Запуск

```bash
# Без Docker
npm start

# С Docker
docker compose up -d --build
```

### 3. Проверка панели

```bash
curl http://127.0.0.1:3000/healthz
```

Ожидаемый ответ:

```json
{"ok":true,"service":"telemt-panel"}
```

`/healthz` проверяет только работоспособность процесса панели и **не зависит от доступности Telemt**. Состояние и readiness самого Telemt отображаются/проверяются отдельно через его Control API.

## Проверки

```bash
npm run build
npm test
```

CI выполняет frontend build и весь Node.js test suite перед Docker build. Docker workflow дополнительно собирает образ для `linux/amd64` и `linux/arm64`.

## Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `SESSION_SECRET` | ✓ | Случайная строка ≥48 символов |
| `PANEL_PASSWORD_HASH` | ✓* | bcrypt хэш пароля |
| `PANEL_PASSWORD` | ✓* | Пароль открытым текстом (только для разработки) |
| `PANEL_USERNAME` | — | Логин (default: `admin`) |
| `TELEMT_API_URL` | — | Адрес Telemt API (default: `http://127.0.0.1:9091`) |
| `TELEMT_API_TOKEN` | — | Authorization header для Telemt API |
| `GEOIP_API_URL` | — | HTTPS batch endpoint для opt-in геолокации IP; без него GeoIP выключен |
| `GEOIP_API_KEY` | — | Опциональный ключ GeoIP-провайдера (добавляется как query `key`) |
| `PORT` | — | Порт панели (default: `3000`) |
| `COOKIE_SECURE` | — | `true` только при HTTPS |
| `TRUST_PROXY` | — | `true` за nginx/caddy |
| `SESSION_MAX_AGE_HOURS` | — | Время жизни сессии (default: `8`) |
| `SESSION_IDLE_MINUTES` | — | Таймаут бездействия (default: `60`, `0` = off) |
| `BIND_SESSION_IP` | — | Привязать сессию к IP (default: `false`) |
| `AUDIT_LOG_MAX` | — | Размер кольцевого буфера аудита (default: `1000`) |

*Одно из двух обязательно.

## Конфигурация Telemt

Для страниц статистики/runtime в `config.toml` Telemt должны быть включены соответствующие API-возможности. При Docker-развёртывании Telemt API также должен быть доступен из контейнера панели:

```toml
[server.api]
enabled = true
listen = "0.0.0.0:9091"
minimal_runtime_enabled = true
runtime_edge_enabled = true
whitelist = ["172.16.0.0/12"]   # пример Docker bridge subnet
```

Если используется `auth_header`, его точное значение укажите в `TELEMT_API_TOKEN`.

## За nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name panel.example.com;

    ssl_certificate     /etc/letsencrypt/live/panel.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.example.com/privkey.pem;

    location / {
        proxy_pass         http://telemt-panel:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

```env
COOKIE_SECURE=true
TRUST_PROXY=true
```

## Структура проекта

```text
telemt-panel/
├── app.js              # Express app — auth, sessions, audit, Telemt proxy, static UI
├── server.js           # Process entrypoint и listen()
├── src/client.jsx      # React SPA source; browser dependencies собираются локально
├── setup-password.js   # CLI для генерации хэша и секрета
├── test/               # Node.js integration и UI-contract tests
├── package.json
├── package-lock.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── public/
    ├── index.html      # SPA shell and styles
    └── assets/         # Generated by npm run build; не коммитится
```

## Безопасность

- Telemt API токен хранится только на сервере, браузер его никогда не видит
- Все запросы к Telemt идут через серверный прокси `/api/v1/*`
- Upstream `401` от Telemt не инвалидирует пользовательскую сессию панели и возвращается как отдельная upstream-auth ошибка
- CSRF-токен обязателен для всех мутирующих запросов панели
- Browser CSP разрешает scripts/connections только с origin панели; runtime CDN-зависимости удалены
- Панель и Docker healthcheck используют отдельный публичный `/healthz`, который не раскрывает конфигурацию или состояние сессий
- Геолокация IP выключена по умолчанию: адреса клиентов не отправляются третьей стороне без явной настройки `GEOIP_API_URL`; внешний endpoint обязан использовать HTTPS (loopback HTTP разрешён только для локального proxy)
- Для ip-api используйте Pro HTTPS batch endpoint и ключ; бесплатный HTTP endpoint намеренно больше не используется

### Ограничения текущей архитектуры

Сессии (`memorystore`), login rate-limit state и audit ring buffer остаются process-local. Это нормально для текущего single-instance deployment, но перед горизонтальным масштабированием их нужно вынести во внешний store. Миграция на Express 5 также оставлена отдельным этапом, чтобы не смешивать framework routing changes с Telemt 3.5.7 compatibility update.

## Лицензия

MIT
