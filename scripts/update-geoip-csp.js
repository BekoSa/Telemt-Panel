'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(oldText, newText);
}

const appPath = path.join(root, 'app.js');
let app = fs.readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  "const AUDIT_MAX      = parseInt(process.env.AUDIT_LOG_MAX || '1000');\n",
  "const AUDIT_MAX      = parseInt(process.env.AUDIT_LOG_MAX || '1000');\nconst GEOIP_API_URL = (process.env.GEOIP_API_URL || '').trim();\nconst GEOIP_API_KEY = (process.env.GEOIP_API_KEY || '').trim();\nlet GEOIP_ENDPOINT = null;\nif (GEOIP_API_URL) {\n  try {\n    const parsed = new URL(GEOIP_API_URL);\n    const loopbackHttp = parsed.protocol === 'http:' && ['localhost','127.0.0.1','::1','[::1]'].includes(parsed.hostname);\n    if (parsed.protocol !== 'https:' && !loopbackHttp) throw new Error('endpoint must use HTTPS (or loopback HTTP for a local proxy)');\n    GEOIP_ENDPOINT = parsed;\n  } catch (err) {\n    console.error(`[FATAL] Invalid GEOIP_API_URL: ${err.message}`);\n    process.exit(1);\n  }\n}\n",
  'GeoIP config',
);

app = replaceOnce(
  app,
  "    \"default-src 'self'; \" +\n    \"script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; \" +\n    \"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \" +\n    \"font-src 'self' https://fonts.gstatic.com; \" +\n    \"img-src 'self' data:; \" +\n    \"connect-src 'self' https://cdn.jsdelivr.net http://ip-api.com; \" +\n    \"frame-ancestors 'none';\"",
  "    \"default-src 'self'; \" +\n    \"script-src 'self'; \" +\n    \"style-src 'self' 'unsafe-inline'; \" +\n    \"font-src 'self'; \" +\n    \"img-src 'self' data:; \" +\n    \"connect-src 'self'; \" +\n    \"object-src 'none'; \" +\n    \"base-uri 'none'; \" +\n    \"form-action 'self'; \" +\n    \"frame-ancestors 'none';\"",
  'CSP policy',
);

app = replaceOnce(
  app,
  "    auditLogCurrent:     auditLog.length,\n    rateLimitWindow:     '5 min',",
  "    auditLogCurrent:     auditLog.length,\n    geoIpEnabled:        !!GEOIP_ENDPOINT,\n    rateLimitWindow:     '5 min',",
  'panel GeoIP status',
);

app = replaceOnce(
  app,
  "app.post('/panel/geo', requireAuth, async (req, res) => {\n  const { ips } = req.body || {};\n  if (!Array.isArray(ips) || !ips.length) return res.json({ ok: true, data: [] });",
  "app.post('/panel/geo', requireAuth, async (req, res) => {\n  const { ips } = req.body || {};\n  if (!Array.isArray(ips) || !ips.length) return res.json({ ok: true, data: [] });\n  if (!GEOIP_ENDPOINT) return res.json({ ok: true, data: [], disabled: true });",
  'GeoIP default disable',
);

app = replaceOnce(
  app,
  "      const r = await fetch('http://ip-api.com/batch?fields=status,message,lat,lon,country,city,query', {",
  "      const geoUrl = new URL(GEOIP_ENDPOINT.toString());\n      geoUrl.searchParams.set('fields', 'status,message,lat,lon,country,city,query');\n      if (GEOIP_API_KEY) geoUrl.searchParams.set('key', GEOIP_API_KEY);\n      const r = await fetch(geoUrl, {",
  'GeoIP secure endpoint',
);

fs.writeFileSync(appPath, app);

const envPath = path.join(root, '.env.example');
let env = fs.readFileSync(envPath, 'utf8');
env = replaceOnce(
  env,
  "# Note: the panel's /healthz endpoint checks panel-process liveness only.\n# Telemt API availability/readiness is intentionally checked separately.\n",
  "# Note: the panel's /healthz endpoint checks panel-process liveness only.\n# Telemt API availability/readiness is intentionally checked separately.\n\n# Optional IP geolocation batch endpoint. Disabled by default so client IPs never\n# leave the panel unless the operator explicitly configures a provider. External\n# endpoints must use HTTPS; loopback HTTP is allowed for a local privacy proxy.\n# Example for ip-api Pro (paid HTTPS endpoint):\n# GEOIP_API_URL=https://pro.ip-api.com/batch\n# GEOIP_API_KEY=your-provider-key\n",
  'GeoIP env example',
);
fs.writeFileSync(envPath, env);

const readmePath = path.join(root, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
readme = replaceOnce(
  readme,
  "| `TELEMT_API_TOKEN` | — | Authorization header для Telemt API |\n| `PORT` | — | Порт панели (default: `3000`) |",
  "| `TELEMT_API_TOKEN` | — | Authorization header для Telemt API |\n| `GEOIP_API_URL` | — | HTTPS batch endpoint для opt-in геолокации IP; без него GeoIP выключен |\n| `GEOIP_API_KEY` | — | Опциональный ключ GeoIP-провайдера (добавляется как query `key`) |\n| `PORT` | — | Порт панели (default: `3000`) |",
  'README env table',
);
readme = replaceOnce(
  readme,
  "- Геолокация IP через `ip-api.com` пока выполняется на сервере с 10-минутным кэшем; замена этого HTTP-зависимого механизма запланирована отдельным этапом модернизации",
  "- Геолокация IP выключена по умолчанию: адреса клиентов не отправляются третьей стороне без явной настройки `GEOIP_API_URL`; внешний endpoint обязан использовать HTTPS (loopback HTTP разрешён только для локального proxy)\n- Для ip-api используйте Pro HTTPS batch endpoint и ключ; бесплатный HTTP endpoint намеренно больше не используется",
  'README GeoIP security',
);
fs.writeFileSync(readmePath, readme);
