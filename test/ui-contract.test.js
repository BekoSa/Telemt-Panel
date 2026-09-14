'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('dashboard queries Telemt readiness without replacing panel liveness', () => {
  assert.match(source, /useApi\('\/health\/ready'\)/);
});

test('user detail exposes current Telemt user control routes', () => {
  assert.match(source, /['"]\/users\/['"]\s*\+\s*user\.username\s*\+\s*['"]\/enable['"]/);
  assert.match(source, /['"]\/users\/['"]\s*\+\s*user\.username\s*\+\s*['"]\/disable['"]/);
  assert.match(source, /['"]\/users\/['"]\s*\+\s*user\.username\s*\+\s*['"]\/reset-quota['"]/);
  assert.match(source, />Enable user</);
  assert.match(source, />Disable user</);
  assert.match(source, />Reset quota</);
});

test('legacy rotate-secret unavailable workaround is removed', () => {
  assert.doesNotMatch(source, /rotate-secret is not yet available/);
});

test('runtime edge exposes Telemt TLS fingerprint observability', () => {
  assert.match(source, /useApi\('\/runtime\/tls-fingerprints\?limit=100'\)/);
  assert.match(source, />Fingerprints</);
  assert.match(source, /function EdgeTlsFingerprints\(/);
});

test('users page exposes current active source IP snapshot', () => {
  assert.match(source, /useApi\('\/stats\/users\/active-ips'\)/);
  assert.match(source, /Active source IPs/);
  assert.match(source, /function ActiveUserIps\(/);
});
