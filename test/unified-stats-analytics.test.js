'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const helperPath = path.join(root, 'src', 'unified-stats.cjs');
const clientPath = path.join(root, 'src', 'client.jsx');
const unifiedUiPath = path.join(root, 'src', 'unified-stats-panel.jsx');
const analyticsPath = path.join(root, 'src', 'unified-analytics.jsx');

function loadHelper() {
  assert.ok(fs.existsSync(helperPath), 'src/unified-stats.cjs must exist');
  delete require.cache[require.resolve(helperPath)];
  return require(helperPath);
}

test('unified snapshot keeps MTProxy and WEB planes explicit without fake byte totals', () => {
  const { normalizeUnifiedSnapshot } = loadHelper();
  const snapshot = normalizeUnifiedSnapshot({
    edge: { data: { totals: { current_connections: 7, current_connections_direct: 5, current_connections_me: 2, active_users: 3 } } },
    web: { runtime: { manager: { sessions: 4 }, streams: { live: 6 }, websockets: { entries: 2 }, bytes_up: 1200, bytes_down: 3400 } },
  });
  assert.deepEqual(snapshot.mtproxy, { current: 7, direct: 5, me: 2, activeUsers: 3 });
  assert.deepEqual(snapshot.web, { sessions: 4, streams: 6, wssSockets: 2, bytesUp: 1200, bytesDown: 3400 });
  assert.equal(Object.hasOwn(snapshot, 'totalBytes'), false);
  assert.equal(snapshot.clientActivity, 11);
});

test('timeline points stay aligned and bounded while preserving WEB series', () => {
  const { appendTimelinePoint, createTimelineBuffer } = loadHelper();
  const buffer = createTimelineBuffer();
  for (let i = 0; i < 5; i++) {
    appendTimelinePoint(buffer, {
      mtproxy: { current: i, direct: i + 1, me: i + 2, activeUsers: i + 3 },
      web: { sessions: i + 4, streams: i + 5, wssSockets: i + 6, bytesUp: i + 7, bytesDown: i + 8 },
      clientActivity: i + i + 4,
    }, `t${i}`, 3);
  }
  assert.deepEqual(buffer.labels, ['t2', 't3', 't4']);
  assert.deepEqual(buffer.mtproxy, [2, 3, 4]);
  assert.deepEqual(buffer.webSessions, [6, 7, 8]);
  assert.deepEqual(buffer.wssSockets, [8, 9, 10]);
  assert.equal(new Set(Object.values(buffer).map(v => v.length)).size, 1);
});

test('top users combines MTProxy connection counts with WEB session ownership explicitly', () => {
  const { buildTopUserRows } = loadHelper();
  const rows = buildTopUserRows([
    { username: 'alice', current_connections: 2 },
    { username: 'bob', current_connections: 5 },
  ], [
    { user: 'alice' }, { user: 'alice' }, { user: 'bob' }, { user: 'web-only' },
  ]);
  assert.deepEqual(rows.slice(0, 3), [
    { username: 'bob', mtproxyConnections: 5, webSessions: 1, activity: 6 },
    { username: 'alice', mtproxyConnections: 2, webSessions: 2, activity: 4 },
    { username: 'web-only', mtproxyConnections: 0, webSessions: 1, activity: 1 },
  ]);
});

test('dashboard and statistics expose WEB alongside MTProxy through a shared panel', () => {
  assert.ok(fs.existsSync(unifiedUiPath), 'src/unified-stats-panel.jsx must exist');
  const client = fs.readFileSync(clientPath, 'utf8');
  const ui = fs.readFileSync(unifiedUiPath, 'utf8');
  assert.match(client, /UnifiedStatsPanel/);
  assert.ok((client.match(/<UnifiedStatsPanel/g) || []).length >= 2, 'Dashboard and Statistics should both render unified stats');
  assert.match(ui, /MTProxy/);
  assert.match(ui, /WEB/);
  assert.match(ui, /WEB UP/);
  assert.match(ui, /WEB DOWN/);
  assert.match(ui, /planes are reported separately/i);
});

test('analytics polls MTProxy WEB and WEB sessions and surfaces polling errors', () => {
  assert.ok(fs.existsSync(analyticsPath), 'src/unified-analytics.jsx must exist');
  const client = fs.readFileSync(clientPath, 'utf8');
  const analytics = fs.readFileSync(analyticsPath, 'utf8');
  assert.match(client, /UnifiedAnalytics/);
  assert.match(analytics, /\/runtime\/connections\/summary/);
  assert.match(analytics, /\/runtime\/web\/status/);
  assert.match(analytics, /\/runtime\/web\/sessions\?limit=200/);
  assert.match(analytics, /next_cursor/);
  assert.match(analytics, /pageCount\s*<\s*5/);
  assert.match(analytics, /setPollError/);
  assert.match(analytics, /WEB sessions/);
  assert.match(analytics, /WSS sockets/);
  assert.match(analytics, /MTProxy/);
  assert.doesNotMatch(analytics, /catch\s*\{\s*\}/);
});

test('analytics top users refresh from live API data instead of a page-load-only users prop', () => {
  const analytics = fs.readFileSync(analyticsPath, 'utf8');
  assert.match(analytics, /apiFn\('\/users'\)/);
  assert.match(analytics, /buildTopUserRows/);
  assert.match(analytics, /MTProxy connections/);
  assert.match(analytics, /WEB sessions/);
});
