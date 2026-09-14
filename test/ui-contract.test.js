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

test('runtime edge exposes WEB runtime status and bounded sessions', () => {
  assert.match(source, /useApi\('\/runtime\/web\/status'\)/);
  assert.match(source, /useApi\('\/runtime\/web\/sessions\?limit=100'\)/);
  assert.match(source, />WEB Runtime</);
  assert.match(source, /function WebRuntimePanel\(/);
});

test('WEB runtime controls use the current runtime_instance fence', () => {
  assert.match(source, /\/runtime\/web\/lifecycle\/pause/);
  assert.match(source, /\/runtime\/web\/lifecycle\/drain/);
  assert.match(source, /\/runtime\/web\/lifecycle\/resume/);
  assert.match(source, /runtime_instance/);
  assert.match(source, /timeout_secs/);
  assert.match(source, />Pause</);
  assert.match(source, />Drain</);
  assert.match(source, />Resume</);
});

test('WEB runtime can close an explicit active session reference', () => {
  assert.match(source, /\/runtime\/web\/sessions\/close/);
  assert.match(source, /kind:\s*['"]refs['"]/);
  assert.match(source, /session_refs/);
  assert.match(source, />Close session</);
});

test('Telemt config editor preserves optimistic concurrency revision', () => {
  assert.match(source, /function TelemtConfigPage\(/);
  assert.match(source, /api\('\/config'\)/);
  assert.match(source, /api\('\/config','PATCH',patch,revision\)/);
  assert.match(source, /revision_conflict/);
  assert.match(source, />Configuration</);
});

test('Telemt config reload uses bounded drain with rollback and polls status', () => {
  assert.match(source, /api\('\/system\/reload','POST',\{mode:'drain',timeout_secs:30,failure_policy:'rollback'\}\)/);
  assert.match(source, /api\('\/system\/reload\/'\+reloadId\)/);
  assert.match(source, /deferred_process_fields/);
  assert.match(source, /rolled_back/);
  assert.match(source, /succeeded/);
});
