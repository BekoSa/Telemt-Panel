# Telemt Control Panel

Web UI для управления [Telemt MTProto proxy](https://github.com/telemt/telemt) с авторизацией, аудитом и аналитикой.

## Возможности

- 🔐 **Авторизация** — bcrypt, httpOnly cookie, CSRF-токен, rate limiting, idle timeout, IP-binding
- 👥 **Управление пользователями** — создание, редактирование, удаление, ротация секрета
- 📊 **Статистика** — Summary, Zero/All, Upstreams, DCs, ME Writers, Minimal All
- ⚙️ **Runtime** — Gates, Init, ME Pool, ME Quality, Upstream Quality, NAT/STUN, ME Selftest
- 🌐 **Analytics** — live график соединений, топ пользователей, 3D-глобус с геолокацией IP
- 🔍 **Analysis** — health score, детектирование аномалий, анализ лимитов пользователей
- 🛡️ **Panel Security** — активные сессии (revoke), аудит-лог, конфиг безопасности

## Быстрый старт

### 1. Настройка

```bash
cp .env.example .env

# Интерактивный wizard (рекомендуется)
npm install
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

Для полной функциональности в `config.toml`:

```toml
[server.api]
enabled = true
listen = "0.0.0.0:9091"
minimal_runtime_enabled = true
runtime_edge_enabled = true
whitelist = ["172.16.0.0/12"]   # Docker bridge subnet
```

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

```
telemt-panel/
├── server.js           # Express сервер — auth, proxy, API
├── setup-password.js   # CLI для генерации хэша и секрета
├── package.json
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
- Геолокация IP через `ip-api.com` выполняется на сервере с 10-минутным кэшем

## Лицензия

MIT
