'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-for-tests-1234567890';
process.env.PANEL_PASSWORD_HASH = '';
process.env.PANEL_PASSWORD = 'test-password';
process.env.TELEMT_API_URL = 'http://127.0.0.1:1';
delete process.env.GEOIP_API_URL;
delete process.env.GEOIP_API_KEY;

const { createApp } = require('../app');

let server;
let baseUrl;

before(async () => {
  const app = createApp();
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test('GET /healthz is public process liveness', async () => {
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'telemt-panel' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('GET /auth/me remains protected by session state', async () => {
  const response = await fetch(`${baseUrl}/auth/me`);
  assert.equal(response.status, 401);
});

test('CSP only permits local scripts and browser connections', async () => {
  const response = await fetch(`${baseUrl}/auth/me`);
  const csp = response.headers.get('content-security-policy') || '';
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /connect-src 'self';/);
  assert.doesNotMatch(csp, /cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|ip-api\.com/);
});

test('GeoIP enrichment is disabled by default instead of sending IPs to a third party', async () => {
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
