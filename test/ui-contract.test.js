'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientPath = path.join(__dirname, '..', 'src', 'client.jsx');
const legacyPath = path.join(__dirname, '..', 'public', 'index.html');
const source = fs.readFileSync(fs.existsSync(clientPath) ? clientPath : legacyPath, 'utf8');
const webExplorerPath = path.join(__dirname, '..', 'src', 'web-sessions-explorer.jsx');
const webExplorerSource = fs.existsSync(webExplorerPath) ? fs.readFileSync(webExplorerPath, 'utf8') : '';

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

test('TLS fingerprint page degrades cleanly on older Telemt versions', () => {
  assert.match(source, /TLS fingerprint telemetry is unavailable on the connected Telemt/);
});

test('optional capabilities only degrade on route absence and preserve real API failures', () => {
  assert.match(source, /const isUnsupportedCapability\s*=\s*\(code,status\)\s*=>\s*status===404\s*\|\|\s*code==='not_found'/);
  assert.match(source, /setErrCode\(e\.code\|\|null\)/);
  assert.match(source, /setErrStatus\(e\.status\|\|null\)/);
  assert.match(source, /isUnsupportedCapability\(ready\.errCode,ready\.errStatus\)/);
  assert.ok((source.match(/isUnsupportedCapability\(errCode,errStatus\)/g) || []).length >= 2);
  assert.match(source, /isUnsupportedCapability\(status\.errCode,status\.errStatus\)/);
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

test('WEB runtime exposes aggregate WEB traffic and honest WSS occupancy telemetry', () => {
  assert.match(source, /const wssRows=rows\.filter\(row=>row\.carrier==='websocket'\|\|row\.carrier==='websocket-lanes'\)/);
  assert.match(source, /d\?\.runtime\?\.bytes_up/);
  assert.match(source, /d\?\.runtime\?\.bytes_down/);
  assert.match(source, /d\?\.runtime\?\.websockets\?\.entries/);
  assert.match(source, /d\?\.runtime\?\.budget\?\.websocket_bytes/);
  assert.match(source, />WEB \/ WSS Traffic</);
  assert.match(source, />WEB UP</);
  assert.match(source, />WEB DOWN</);
  assert.match(source, />WSS SESSIONS</);
  assert.match(source, />WSS SOCKETS</);
  assert.match(source, />WSS BUFFERED</);
  assert.match(source, /WEB payload totals include HTTPS and WebSocket carriers/);
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

test('WEB runtime can close an explicit active session reference and track its operation', () => {
  assert.match(webExplorerSource, /\/runtime\/web\/sessions\/close/);
  assert.match(webExplorerSource, /kind:\s*['"]refs['"]/);
  assert.match(webExplorerSource, /session_refs/);
  assert.match(webExplorerSource, /\/runtime\/web\/operations\//);
  assert.match(webExplorerSource, />Close</);
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
