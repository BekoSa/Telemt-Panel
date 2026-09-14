'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-for-tests-1234567890';
process.env.PANEL_PASSWORD_HASH = '$2b$12$JqQz4YdGQOeU8u4W7yQy4.qnFwYdx7vN3f4J0zj8A1pQHhMEwqJqK';
process.env.TELEMT_API_URL = 'http://127.0.0.1:1';

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
