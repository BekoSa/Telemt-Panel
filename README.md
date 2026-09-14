# Telemt Control Panel

Web UI для управления [Telemt MTProto proxy](https://github.com/telemt/telemt) с авторизацией, аудитом и аналитикой.

Текущая линия модернизации ориентирована на Telemt 3.5.7. Foundation уже переведён на Node.js 24 LTS и воспроизводимые npm-сборки; новые возможности Control API добавляются поэтапно.

## Возможности

- 🔐 **Авторизация** — bcrypt, httpOnly cookie, CSRF-токен, rate limiting, idle timeout, IP-binding
- 👥 **Управление пользователями** — создание, редактирование, удаление, ротация секрета
- 📊 **Статистика** — Summary, Zero/All, Upstreams, DCs, ME Writers, Minimal All
- ⚙️ **Runtime** — Gates, Init, ME Pool, ME Quality, Upstream Quality, NAT/STUN, ME Selftest
- 🌐 **Analytics** — live график соединений, топ пользователей, 3D-глобус с геолокацией IP
- 🔍 **Analysis** — health score, детектирование аномалий, анализ лимитов пользователей
- 🛡️ **Panel Security** — активные сессии (revoke), аудит-лог, конфиг безопасности

## Требования

Для запуска без Docker требуется **Node.js 24 LTS**. Зависимости фиксируются в `package-lock.json`; для воспроизводимой установки используйте `npm ci`.

## Быстрый старт

### 1. Настройка

```bash
cp .env.example .env

# Воспроизводимая установка зависимостей
npm ci

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

## Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `SESSION_SECRET` | ✓ | Случайная строка ≥48 символов |
| `PANEL_PASSWORD_HASH` | ✓* | bcrypt хэш пароля |
| `PANEL_PASSWORD` | ✓* | Пароль открытым текстом (только для разработки) |
| `PANEL_USERNAME` | — | Логин (default: `admin`) |
| `TELEMT_API_URL` | — | Адрес Telemt API (default: `http://127.0.0.1:9091`) |
| `TELEMT_API_TOKEN` | — | Authorization header для Telemt API |
| `PORT` | — | Порт панели (default: `3000`) |
| `COOKIE_SECURE` | — | `true` только при HTTPS |
| `TRUST_PROXY` | — | `true` за nginx/caddy |
| `SESSION_MAX_AGE_HOURS` | — | Время жизни сессии (default: `8`) |
| `SESSION_IDLE_MINUTES` | — | Таймаут бездействия (default: `60`, `0` = off) |
| `BIND_SESSION_IP` | — | Привязать сессию к IP (default: `false`) |
| `AUDIT_LOG_MAX` | — | Размер кольцевого буфера аудита (default: `1000`) |

*Одно из двух обязательно.

## Конфигурация Telemt

Для текущих страниц статистики/runtime в `config.toml` Telemt должны быть включены соответствующие API-возможности:

```toml
[server.api]
enabled = true
listen = "0.0.0.0:9091"
minimal_runtime_enabled = true
runtime_edge_enabled = true
whitelist = ["172.16.0.0/12"]   # Docker bridge subnet
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
├── setup-password.js   # CLI для генерации хэша и секрета
├── test/
│   └── app.test.js     # Node.js built-in tests
├── package.json
├── package-lock.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── public/
    └── index.html      # SPA (React + Chart.js + D3)
```

## Безопасность

- Telemt API токен хранится только на сервере, браузер его никогда не видит
- Все запросы к Telemt идут через серверный прокси `/api/v1/*`
- CSRF-токен обязателен для всех мутирующих запросов
- Панель и Docker healthcheck используют отдельный публичный `/healthz`, который не раскрывает конфигурацию или состояние сессий
- Геолокация IP через `ip-api.com` пока выполняется на сервере с 10-минутным кэшем; замена этого HTTP-зависимого механизма запланирована отдельным этапом модернизации

## Лицензия

MIT
