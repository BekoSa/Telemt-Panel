'use strict';
require('dotenv').config();

const express  = require('express');
const session      = require('express-session');
const MemoryStore  = require('memorystore')(session);
const bcrypt   = require('bcryptjs');
const path     = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT          = parseInt(process.env.PORT || '3000');
const USERNAME      = process.env.PANEL_USERNAME || 'admin';
const PASS_HASH     = process.env.PANEL_PASSWORD_HASH || '';
const PASS_PLAIN    = process.env.PANEL_PASSWORD || '';
const TELEMT_URL    = (process.env.TELEMT_API_URL || 'http://127.0.0.1:9091').replace(/\/$/, '');
const TELEMT_TOKEN  = process.env.TELEMT_API_TOKEN || '';
const SECRET        = process.env.SESSION_SECRET || '';
const SESSION_HOURS = parseInt(process.env.SESSION_MAX_AGE_HOURS || '8');
const TRUST_PROXY    = process.env.TRUST_PROXY === 'true';
const IDLE_MINUTES   = parseInt(process.env.SESSION_IDLE_MINUTES || '60');
const BIND_IP        = process.env.BIND_SESSION_IP === 'true';
const AUDIT_MAX      = parseInt(process.env.AUDIT_LOG_MAX || '1000');
const GEOIP_API_URL = (process.env.GEOIP_API_URL || '').trim();
const GEOIP_API_KEY = (process.env.GEOIP_API_KEY || '').trim();
const GEOIP_DISABLED = process.env.GEOIP_DISABLED === 'true';
const GEOIP_DEFAULT_URL = 'https://ip-api.io/api/v1/ip/batch';
let GEOIP_ENDPOINT = null;
let GEOIP_PROVIDER = 'disabled';
if (!GEOIP_DISABLED) {
  try {
    const parsed = new URL(GEOIP_API_URL || GEOIP_DEFAULT_URL);
    const loopbackHttp = parsed.protocol === 'http:' && ['localhost','127.0.0.1','::1','[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !loopbackHttp) throw new Error('endpoint must use HTTPS (or loopback HTTP for a local proxy)');
    GEOIP_ENDPOINT = parsed;
    GEOIP_PROVIDER = GEOIP_API_URL ? parsed.hostname : 'ip-api.io';
  } catch (err) {
    console.error(`[FATAL] Invalid GEOIP_API_URL: ${err.message}`);
    process.exit(1);
  }
}

// Fatal guards
if (!SECRET) {
  console.error('[FATAL] SESSION_SECRET is not set. Generate one with:\n  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}
if (!PASS_HASH && !PASS_PLAIN) {
  console.error('[FATAL] Neither PANEL_PASSWORD_HASH nor PANEL_PASSWORD is set.\nSet a hash with: node setup-password.js <your-password>');
  process.exit(1);
}
if (PASS_PLAIN && !PASS_HASH) {
  console.warn('[WARN] Using plaintext PANEL_PASSWORD. Consider PANEL_PASSWORD_HASH in production.');
}

// ─── App ─────────────────────────────────────────────────────────────────────
function createApp() {
  const app = express();
  if (TRUST_PROXY) app.set('trust proxy', 1);

  // Panel process liveness only: public and independent of Telemt.
  app.get('/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, service: 'telemt-panel' });
  });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '512kb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'none'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none';"
  );
  next();
});

// Session
const sessionStore = new MemoryStore({
    checkPeriod: 3600 * 1000,
    max: 100,
    ttl: SESSION_HOURS * 3600 * 1000,
  });

app.use(session({
  store:             sessionStore,
  secret:            SECRET,
  resave:            false,
  saveUninitialized: false,
  rolling:           true,
  name:              'tpanel.sid',
  cookie: {
    httpOnly: true,
    secure:   process.env.COOKIE_SECURE === 'true',
    sameSite: 'strict',
    maxAge:   SESSION_HOURS * 3600 * 1000,
  },
}));

// ─── Rate limiter (login only) ─────────────────────────────────────────────
const loginBucket = new Map(); // ip → [timestamps]
const WINDOW_MS   = 5 * 60 * 1000;  // 5 min
const MAX_TRIES   = 10;

function loginRateLimit(req, res, next) {
  const ip  = req.ip;
  const now = Date.now();
  const arr = (loginBucket.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX_TRIES) {
    const retryAfter = Math.ceil((arr[0] + WINDOW_MS - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ ok: false, error: `Too many attempts. Retry in ${retryAfter}s.` });
  }
  arr.push(now);
  loginBucket.set(ip, arr);
  // cleanup old entries every 500 requests
  if (loginBucket.size > 500) {
    for (const [k, v] of loginBucket) {
      if (v.every(t => now - t > WINDOW_MS)) loginBucket.delete(k);
    }
  }
  next();
}

// ─── Auth guard ──────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ ok: false, error: 'Unauthorized' });
}


// ─── Audit Log ────────────────────────────────────────────────────────────────
const auditLog = [];
function audit(action, username, ip, extra = {}) {
  const entry = { ts: Date.now(), action, username: username || '—', ip: ip || '—', ...extra };
  auditLog.push(entry);
  if (auditLog.length > AUDIT_MAX) auditLog.shift();
}

// ─── Idle timeout + IP binding middleware ─────────────────────────────────────
function sessionGuard(req, res, next) {
  if (!req.session?.authenticated) return next();
  const IDLE_MS = IDLE_MINUTES * 60 * 1000;
  const last = req.session.lastActivity || req.session.loginAt || 0;
  if (IDLE_MS > 0 && Date.now() - last > IDLE_MS) {
    const user = req.session.username;
    return req.session.destroy(() => {
      audit('session_idle_expire', user, req.ip);
      res.status(401).json({ ok: false, error: 'Session expired due to inactivity' });
    });
  }
  if (BIND_IP && req.session.boundIp && req.session.boundIp !== req.ip) {
    const user = req.session.username;
    return req.session.destroy(() => {
      audit('session_ip_mismatch', user, req.ip, { boundIp: req.session.boundIp });
      res.status(401).json({ ok: false, error: 'Session IP mismatch' });
    });
  }
  req.session.lastActivity = Date.now();
  next();
}
app.use(sessionGuard);

// ─── CSRF ─────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
function csrfToken() { return crypto.randomBytes(24).toString('hex'); }
const CSRF_SAFE = new Set(['GET','HEAD','OPTIONS']);

function csrfCheck(req, res, next) {
  if (CSRF_SAFE.has(req.method)) return next();
  if (!req.session?.authenticated) return next(); // auth check handles it
  const token = req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken)
    return res.status(403).json({ ok: false, error: { code: 'csrf_invalid', message: 'CSRF token invalid' } });
  next();
}
app.use(csrfCheck);

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/auth/login', loginRateLimit, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string')
    return res.status(400).json({ ok: false, error: 'Missing credentials' });

  // Constant-time username check via bcrypt dummy
  const usernameOk = username === USERNAME;

  let passwordOk = false;
  try {
    if (PASS_HASH) {
      passwordOk = await bcrypt.compare(password, PASS_HASH);
    } else {
      // plaintext fallback — constant-time compare
      passwordOk = password.length === PASS_PLAIN.length &&
        require('crypto').timingSafeEqual(Buffer.from(password), Buffer.from(PASS_PLAIN));
    }
  } catch { /* invalid hash format */ }

  // Artificial delay to slow brute-force regardless of result
  await new Promise(r => setTimeout(r, 200 + Math.random() * 200));

  if (!usernameOk || !passwordOk) {
    audit('login_fail', username, req.ip, { success: false });
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }

  req.session.regenerate(err => {
    if (err) return res.status(500).json({ ok: false, error: 'Session error' });
    req.session.authenticated = true;
    req.session.username      = username;
    req.session.loginAt       = Date.now();
    req.session.lastActivity  = Date.now();
    req.session.boundIp       = req.ip;
    req.session.userAgent     = req.headers['user-agent'] || '—';
    req.session.csrfToken     = csrfToken();
    audit('login', username, req.ip, { success: true });
    console.log(`[AUTH] Login: ${username} from ${req.ip}`);
    res.json({ ok: true, username, csrfToken: req.session.csrfToken });
  });
});

app.post('/auth/logout', requireAuth, (req, res) => {
  const user = req.session.username;
  const ip   = req.ip;
  req.session.destroy(() => {
    res.clearCookie('tpanel.sid');
    audit('logout', user, ip);
    console.log(`[AUTH] Logout: ${user}`);
    res.json({ ok: true });
  });
});

app.get('/auth/me', (req, res) => {
  if (req.session?.authenticated) {
    res.json({ ok: true, username: req.session.username, loginAt: req.session.loginAt, csrfToken: req.session.csrfToken });
  } else {
    res.status(401).json({ ok: false });
  }
});



// ─── Panel management endpoints ───────────────────────────────────────────────

// Active sessions list
app.get('/panel/sessions', requireAuth, (req, res) => {
  sessionStore.all((err, sessions) => {
    if (err) return res.status(500).json({ ok: false, error: 'Store error' });
    const list = Object.entries(sessions || {}).map(([id, sess]) => ({
      id,
      username:     sess.username || '—',
      ip:           sess.boundIp  || '—',
      userAgent:    sess.userAgent || '—',
      loginAt:      sess.loginAt,
      lastActivity: sess.lastActivity,
      current:      id === req.sessionID,
    })).sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
    res.json({ ok: true, data: list });
  });
});

// Revoke specific session
app.delete('/panel/sessions/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (id === req.sessionID)
    return res.status(400).json({ ok: false, error: 'Cannot revoke your own session — use logout' });
  sessionStore.destroy(id, (err) => {
    if (err) return res.status(500).json({ ok: false, error: 'Failed to revoke session' });
    audit('session_revoke', req.session.username, req.ip, { revokedId: id });
    res.json({ ok: true });
  });
});

// Revoke all other sessions
app.delete('/panel/sessions', requireAuth, (req, res) => {
  sessionStore.all((err, sessions) => {
    if (err) return res.status(500).json({ ok: false });
    const others = Object.keys(sessions || {}).filter(id => id !== req.sessionID);
    let done = 0;
    if (others.length === 0) return res.json({ ok: true, revoked: 0 });
    others.forEach(id => {
      sessionStore.destroy(id, () => {
        done++;
        if (done === others.length) {
          audit('session_revoke_all', req.session.username, req.ip, { count: others.length });
          res.json({ ok: true, revoked: others.length });
        }
      });
    });
  });
});

// Audit log
app.get('/panel/audit', requireAuth, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit || '200'), AUDIT_MAX);
  const filter = req.query.action || '';
  let entries  = auditLog.slice().reverse();
  if (filter) entries = entries.filter(e => e.action.includes(filter));
  res.json({ ok: true, data: entries.slice(0, limit), total: auditLog.length });
});

// Panel config info
app.get('/panel/config', requireAuth, (req, res) => {
  res.json({ ok: true, data: {
    sessionMaxAgeHours:  SESSION_HOURS,
    sessionIdleMinutes:  IDLE_MINUTES,
    bindSessionIp:       BIND_IP,
    cookieSecure:        process.env.COOKIE_SECURE === 'true',
    trustProxy:          TRUST_PROXY,
    auditLogMax:         AUDIT_MAX,
    auditLogCurrent:     auditLog.length,
    geoIpEnabled:        !!GEOIP_ENDPOINT,
    geoIpProvider:       GEOIP_PROVIDER,
    rateLimitWindow:     '5 min',
    rateLimitMaxTries:   10,
  }});
});

// ─── IP Geolocation (server-side, cached) ─────────────────────────────────────
const geoCache = new Map(); // ip → { lat, lon, country, city, ts }
const GEO_TTL  = 10 * 60 * 1000; // 10 min

function isPrivateIp(ip) {
  if (!ip) return true;
  const s = ip.trim();
  // Loopback
  if (s === '::1' || s.startsWith('127.')) return true;
  // RFC1918
  if (s.startsWith('10.')) return true;
  if (s.startsWith('192.168.')) return true;
  const m172 = s.match(/^172\.(\d+)\./);
  if (m172 && +m172[1] >= 16 && +m172[1] <= 31) return true;
  // CG-NAT 100.64.0.0/10
  const m100 = s.match(/^100\.(\d+)\./);
  if (m100 && +m100[1] >= 64 && +m100[1] <= 127) return true;
  // Link-local
  if (s.startsWith('169.254.')) return true;
  if (s.toLowerCase().startsWith('fe80:')) return true;
  // IPv6 ULA
  if (/^f[cd]/i.test(s)) return true;
  return false;
}

app.post('/panel/geo', requireAuth, async (req, res) => {
  const { ips } = req.body || {};
  if (!Array.isArray(ips) || !ips.length) return res.json({ ok: true, data: [] });
  if (!GEOIP_ENDPOINT) return res.json({ ok: true, data: [], disabled: true });

  const now     = Date.now();
  const result  = [];
  const toFetch = [];

  for (const ip of [...new Set(ips)].slice(0, 100)) {
    if (isPrivateIp(ip)) continue;
    const cached = geoCache.get(ip);
    if (cached && now - cached.ts < GEO_TTL) { result.push(cached); continue; }
    toFetch.push(ip);
  }

  if (toFetch.length > 0) {
    try {
      const geoUrl = new URL(GEOIP_ENDPOINT.toString());
      const isIpApiIo = geoUrl.hostname === 'ip-api.io';
      if (isIpApiIo) {
        if (GEOIP_API_KEY) geoUrl.searchParams.set('api_key', GEOIP_API_KEY);
      } else {
        geoUrl.searchParams.set('fields', 'status,message,lat,lon,country,city,query');
        if (GEOIP_API_KEY) geoUrl.searchParams.set('key', GEOIP_API_KEY);
      }
      const r = await fetch(geoUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(isIpApiIo ? { ips: toFetch } : toFetch.map(ip => ({ query: ip }))),
        signal:  AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`GeoIP provider returned HTTP ${r.status}`);
      const data = await r.json();
      if (isIpApiIo) {
        for (const [ip, d] of Object.entries(data.results || {})) {
          const loc = d?.location || {};
          if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) continue;
          const entry = { ip: d.ip || ip, lat: loc.latitude, lon: loc.longitude, country: loc.country, city: loc.city, ts: now };
          geoCache.set(entry.ip, entry);
          result.push(entry);
        }
      } else {
        if (!Array.isArray(data)) throw new Error('Custom GeoIP provider returned an unsupported payload');
        for (const d of data) {
          if (d.status !== 'success') {
            console.warn(`[GEO] lookup failed for ${d.query}: ${d.message||'unknown'}`);
            continue;
          }
          const entry = { ip: d.query, lat: d.lat, lon: d.lon, country: d.country, city: d.city, ts: now };
          geoCache.set(d.query, entry);
          result.push(entry);
        }
      }
    } catch (e) {
      console.error(`[GEO] ${GEOIP_PROVIDER} error:`, e.message);
    }
  }

  console.log(`[GEO] sent=${ips.length} private_skipped=${ips.length - [...new Set(ips)].filter(ip=>!isPrivateIp(ip)).length} resolved=${result.length}`);
  res.json({ ok: true, data: result, meta: { sent: ips.length, resolved: result.length } });
});

// ─── Telemt API Proxy ─────────────────────────────────────────────────────────
app.use('/api', requireAuth, async (req, res) => {
  // Audit mutating Telemt API calls
  if (!['GET','HEAD'].includes(req.method)) {
    audit('telemt_api_' + req.method.toLowerCase(), req.session.username, req.ip, { path: req.path });
  }
  const qs  = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const url = `${TELEMT_URL}${req.path}${qs}`;

  const headers = { 'Content-Type': 'application/json' };
  if (TELEMT_TOKEN)            headers['Authorization'] = TELEMT_TOKEN;
  if (req.headers['if-match']) headers['If-Match']      = req.headers['if-match'];

  const opts = { method: req.method, headers };
  if (['POST', 'PATCH', 'PUT'].includes(req.method) && req.body)
    opts.body = JSON.stringify(req.body);

  try {
    const upstream = await fetch(url, { ...opts, signal: AbortSignal.timeout(30_000) });
    const text     = await upstream.text();
    if (upstream.status === 401) {
      return res.status(502).json({
        ok: false,
        error: {
          code: 'telemt_unauthorized',
          message: 'Telemt API rejected the configured credentials',
        },
      });
    }
    res.status(upstream.status)
       .setHeader('Content-Type', 'application/json')
       .send(text);
  } catch (e) {
    if (e.name === 'TimeoutError')
      return res.status(504).json({ ok: false, error: { code: 'proxy_timeout', message: 'Upstream timeout' } });
    console.error('[PROXY] Error:', e.message);
    res.status(502).json({ ok: false, error: { code: 'proxy_error', message: e.message } });
  }
});

// ─── Static ───────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), { etag: true }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  return app;
}

module.exports = { createApp };
