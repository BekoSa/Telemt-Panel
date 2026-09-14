'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const UPSTREAM_PORT = 47891;

process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-for-tests-1234567890';
process.env.PANEL_PASSWORD_HASH = '';
process.env.PANEL_PASSWORD = 'test-password';
process.env.TELEMT_API_URL = `http://127.0.0.1:${UPSTREAM_PORT}`;
process.env.TELEMT_API_TOKEN = 'wrong-token';

const { createApp } = require('../app');

let upstreamServer;
let panelServer;
let baseUrl;

before(async () => {
  upstreamServer = http.createServer((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'unauthorized', message: 'bad token' } }));
  });
  await new Promise((resolve, reject) => {
    upstreamServer.listen(UPSTREAM_PORT, '127.0.0.1', resolve);
    upstreamServer.once('error', reject);
  });

  const app = createApp();
  await new Promise((resolve, reject) => {
    panelServer = app.listen(0, '127.0.0.1', resolve);
    panelServer.once('error', reject);
  });
  const address = panelServer.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (panelServer) await new Promise(resolve => panelServer.close(resolve));
  if (upstreamServer) await new Promise(resolve => upstreamServer.close(resolve));
});

test('Telemt 401 is reported as upstream auth failure without invalidating panel session', async () => {
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.ok(cookie);

  const proxied = await fetch(`${baseUrl}/api/v1/health`, {
    headers: { Cookie: cookie },
  });
  assert.equal(proxied.status, 502);
  assert.deepEqual(await proxied.json(), {
    ok: false,
    error: {
      code: 'telemt_unauthorized',
      message: 'Telemt API rejected the configured credentials',
    },
  });

  const session = await fetch(`${baseUrl}/auth/me`, {
    headers: { Cookie: cookie },
  });
  assert.equal(session.status, 200);
  const sessionBody = await session.json();
  assert.equal(sessionBody.ok, true);
  assert.equal(sessionBody.username, 'admin');
});
