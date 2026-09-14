from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new, 1))


replace_once('app.js', """const GEOIP_API_URL = (process.env.GEOIP_API_URL || '').trim();
const GEOIP_API_KEY = (process.env.GEOIP_API_KEY || '').trim();
let GEOIP_ENDPOINT = null;
if (GEOIP_API_URL) {
  try {
    const parsed = new URL(GEOIP_API_URL);
    const loopbackHttp = parsed.protocol === 'http:' && ['localhost','127.0.0.1','::1','[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !loopbackHttp) throw new Error('endpoint must use HTTPS (or loopback HTTP for a local proxy)');
    GEOIP_ENDPOINT = parsed;
  } catch (err) {
    console.error(`[FATAL] Invalid GEOIP_API_URL: ${err.message}`);
    process.exit(1);
  }
}
""", """const GEOIP_API_URL = (process.env.GEOIP_API_URL || '').trim();
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
""")

replace_once('app.js', """    geoIpEnabled:        !!GEOIP_ENDPOINT,
    rateLimitWindow:     '5 min',
""", """    geoIpEnabled:        !!GEOIP_ENDPOINT,
    geoIpProvider:       GEOIP_PROVIDER,
    rateLimitWindow:     '5 min',
""")

replace_once('app.js', """  if (toFetch.length > 0) {
    try {
      const geoUrl = new URL(GEOIP_ENDPOINT.toString());
      geoUrl.searchParams.set('fields', 'status,message,lat,lon,country,city,query');
      if (GEOIP_API_KEY) geoUrl.searchParams.set('key', GEOIP_API_KEY);
      const r = await fetch(geoUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(toFetch.map(ip => ({ query: ip }))),
        signal:  AbortSignal.timeout(8000),
      });
      const data = await r.json();
      for (const d of data) {
        if (d.status !== 'success') {
          console.warn(`[GEO] ip-api failed for ${d.query}: ${d.message||'unknown'}`);
          continue;
        }
        const entry = { ip: d.query, lat: d.lat, lon: d.lon, country: d.country, city: d.city, ts: now };
        geoCache.set(d.query, entry);
        result.push(entry);
      }
    } catch (e) {
      console.error('[GEO] ip-api.com error:', e.message);
    }
  }
""", """  if (toFetch.length > 0) {
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
""")

replace_once('src/client.jsx', """  const [count,setCount]   = useState({resolved:0,sent:0});
""", """  const [count,setCount]   = useState({resolved:0,sent:0,disabled:false});
""")

replace_once('src/client.jsx', """          // Mark active vs recent for different visual treatment
          const activeSet=new Set((users||[]).flatMap(u=>u.active_unique_ips_list||[]));
          const rawPoints=(geo.data||[]).map(p=>({
""", """          if(geo.disabled){
            S.current.points=[];
            setCount({resolved:0,sent:allIps.length,disabled:true});
            if(!cancelled) setStatus('ready');
            return;
          }
          // Mark active vs recent for different visual treatment
          const activeSet=new Set((users||[]).flatMap(u=>u.active_unique_ips_list||[]));
          const rawPoints=(geo.data||[]).map(p=>({
""")

replace_once('src/client.jsx', """          setCount({resolved: S.current.points.length, sent: geo.meta?.sent||allIps.length});
        } else {
          S.current.points=[];
          setCount({resolved:0,sent:0});
""", """          setCount({resolved: S.current.points.length, sent: geo.meta?.sent||allIps.length, disabled:false});
        } else {
          S.current.points=[];
          setCount({resolved:0,sent:0,disabled:false});
""")

replace_once('src/client.jsx', """          {status==='ready'&&(
            <span style={{fontFamily:'var(--mono)',fontSize:11}}>
              <span style={{color:'var(--accent)'}}>●</span>
              <span style={{color:'var(--text3)'}}> active </span>
              <span style={{color:'var(--info)',opacity:.6}}>●</span>
              <span style={{color:'var(--text3)'}}>
                {' '}recent · {count.resolved}/{count.sent} IPs plotted
                {count.sent>count.resolved&&
                  <span style={{color:'var(--warn)'}}> ({count.sent-count.resolved} not geolocated)</span>}
                {' '}· drag to rotate
              </span>
            </span>
          )}
""", """          {status==='ready'&&(count.disabled ? (
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--warn)'}}>GeoIP disabled · set GEOIP_DISABLED=false to plot IP locations</span>
          ) : (
            <span style={{fontFamily:'var(--mono)',fontSize:11}}>
              <span style={{color:'var(--accent)'}}>●</span>
              <span style={{color:'var(--text3)'}}> active </span>
              <span style={{color:'var(--info)',opacity:.6}}>●</span>
              <span style={{color:'var(--text3)'}}>
                {' '}recent · {count.resolved}/{count.sent} IPs plotted
                {count.sent>count.resolved&&
                  <span style={{color:'var(--warn)'}}> ({count.sent-count.resolved} not geolocated)</span>}
                {' '}· drag to rotate
              </span>
            </span>
          ))}
""")

replace_once('.env.example', """# Optional IP geolocation batch endpoint. Disabled by default so client IPs never
# leave the panel unless the operator explicitly configures a provider. External
# endpoints must use HTTPS; loopback HTTP is allowed for a local privacy proxy.
# Example for ip-api Pro (paid HTTPS endpoint):
# GEOIP_API_URL=https://pro.ip-api.com/batch
# GEOIP_API_KEY=your-provider-key
""", """# IP geolocation for the Analytics globe. Enabled by default through the
# server-side HTTPS batch endpoint at ip-api.io; public client IPs are sent to
# that provider only for geolocation. Set GEOIP_DISABLED=true to opt out.
GEOIP_DISABLED=false
# Optional custom HTTPS batch endpoint. ip-api.io uses its native {ips:[...]}
# format; other custom endpoints are expected to be ip-api.com batch-compatible.
# GEOIP_API_URL=https://your-geoip-provider.example/batch
# GEOIP_API_KEY=your-provider-key
""")

replace_once('README.md', """- 📈 **Analytics** — live-график соединений, топ пользователей, 3D-глобус; GeoIP включается только явной настройкой оператора
""", """- 📈 **Analytics** — live-график соединений, топ пользователей, 3D-глобус; GeoIP работает из коробки через серверный HTTPS batch lookup и может быть явно отключён
""")
replace_once('README.md', """| `GEOIP_API_URL` | — | HTTPS batch endpoint для opt-in геолокации IP; без него GeoIP выключен |
| `GEOIP_API_KEY` | — | Опциональный ключ GeoIP-провайдера (добавляется как query `key`) |
""", """| `GEOIP_DISABLED` | — | `true` полностью отключает GeoIP (default: `false`) |
| `GEOIP_API_URL` | — | Опциональный custom HTTPS batch endpoint; default: `https://ip-api.io/api/v1/ip/batch` |
| `GEOIP_API_KEY` | — | Опциональный ключ GeoIP-провайдера (`api_key` для ip-api.io, `key` для legacy-compatible custom endpoint) |
""")
replace_once('README.md', """- Геолокация IP выключена по умолчанию: адреса клиентов не отправляются третьей стороне без явной настройки `GEOIP_API_URL`; внешний endpoint обязан использовать HTTPS (loopback HTTP разрешён только для локального proxy)
- Для ip-api используйте Pro HTTPS batch endpoint и ключ; бесплатный HTTP endpoint намеренно больше не используется
""", """- Геолокация IP выполняется сервером через HTTPS: по умолчанию используется `ip-api.io` batch API; браузер по-прежнему делает запросы только к origin панели
- Публичные IP отправляются GeoIP-провайдеру только для построения карты; `GEOIP_DISABLED=true` полностью отключает передачу, а `GEOIP_API_URL` позволяет указать свой HTTPS endpoint (loopback HTTP разрешён только для локального proxy)
""")

replace_once('test/app.test.js', """delete process.env.GEOIP_API_URL;
delete process.env.GEOIP_API_KEY;
""", """delete process.env.GEOIP_API_URL;
delete process.env.GEOIP_API_KEY;
delete process.env.GEOIP_DISABLED;
""")
replace_once('test/app.test.js', """test('GeoIP enrichment is disabled by default instead of sending IPs to a third party', async () => {
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  const loginBody = await login.json();
  assert.ok(cookie);
  assert.ok(loginBody.csrfToken);

  const response = await fetch(`${baseUrl}/panel/geo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-CSRF-Token': loginBody.csrfToken,
    },
    body: JSON.stringify({ ips: ['127.0.0.1'] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: [], disabled: true });
});
""", """test('GeoIP enrichment is enabled securely by default while private IPs stay local', async () => {
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  const loginBody = await login.json();
  assert.ok(cookie);
  assert.ok(loginBody.csrfToken);

  const configResponse = await fetch(`${baseUrl}/panel/config`, { headers: { Cookie: cookie } });
  assert.equal(configResponse.status, 200);
  const configBody = await configResponse.json();
  assert.equal(configBody.data.geoIpEnabled, true);
  assert.equal(configBody.data.geoIpProvider, 'ip-api.io');

  const response = await fetch(`${baseUrl}/panel/geo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-CSRF-Token': loginBody.csrfToken,
    },
    body: JSON.stringify({ ips: ['127.0.0.1'] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: [], meta: { sent: 1, resolved: 0 } });
});
""")
