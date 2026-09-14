'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'src', 'client.jsx'), 'utf8');
const links = fs.readFileSync(path.join(root, 'src', 'connection-link-configurator.jsx'), 'utf8');
const webPath = path.join(root, 'src', 'web-sessions-explorer.jsx');
const quotaPath = path.join(root, 'src', 'user-quota-runtime.jsx');

test('user create/edit UI exposes directional rate limits and explicit override clearing semantics', () => {
  assert.match(client, /buildCreateUserBody/);
  assert.match(client, /buildPatchUserBody/);
  assert.match(client, /rate_limit_up_bps/);
  assert.match(client, /rate_limit_down_bps/);
  assert.match(client, /Upload rate limit \(bps\)/);
  assert.match(client, /Download rate limit \(bps\)/);
  assert.match(client, /Clear configured overrides/);
  assert.match(client, /Create enabled/);
});

test('user detail consumes stats users quota endpoint', () => {
  assert.ok(fs.existsSync(quotaPath), 'src/user-quota-runtime.jsx must exist');
  const quota = fs.readFileSync(quotaPath, 'utf8');
  assert.match(quota, /\/stats\/users\/quota/);
  assert.match(quota, /findUserQuota/);
  assert.match(client, /UserQuotaRuntime/);
});

test('WEB link configurator can persist an existing vhost profile through PATCH config', () => {
  assert.match(links, /buildWebVhostPatch/);
  assert.match(links, /web\.vhosts/);
  assert.match(links, /Save WEB host\/profile to Telemt/);
  assert.doesNotMatch(links, /WEB config is not editable by Telemt 3\.5\.7 Control API/);
});

test('WEB vhost persistence uses the same config snapshot and revision that selected its index', () => {
  assert.match(links, /let configSnapshot\s*=\s*telemt\.config\s*\|\|\s*\{\}/);
  assert.match(links, /let writeRevision\s*=\s*telemt\.revision/);
  assert.match(links, /buildWebVhostPatch\(configSnapshot,/);
  assert.match(links, /apiFn\('\/config',\s*'PATCH',\s*patch,\s*writeRevision\)/);
  assert.doesNotMatch(links, /buildWebVhostPatch\(current\?\.data/);
});

test('WEB runtime consumes Telemt 3.5.7 envelope data directly without a phantom nested data field', () => {
  assert.match(client, /const d=status\.data;/);
  assert.match(client, /const page=sessions\.data;/);
  assert.doesNotMatch(client, /status\.data\?\.data/);
  assert.doesNotMatch(client, /sessions\.data\?\.data/);
});

test('WEB sessions explorer covers filters detail pagination operation polling and operator resets', () => {
  assert.ok(fs.existsSync(webPath), 'src/web-sessions-explorer.jsx must exist');
  const web = fs.readFileSync(webPath, 'utf8');
  assert.match(web, /buildSessionQuery/);
  assert.match(web, /\/runtime\/web\/sessions['"`]/);
  assert.match(web, /\/runtime\/web\/sessions\//);
  assert.match(web, /next_cursor/);
  assert.match(web, /\/runtime\/web\/operations\//);
  assert.match(web, /isTerminalOperation/);
  assert.match(web, /\/runtime\/web\/debug\/clear/);
  assert.match(web, /\/runtime\/web\/carrier-learning\/reset/);
  assert.match(web, /runtime_instance/);
  assert.match(client, /WebSessionsExplorer/);
});

test('one-time integration helpers are not shipped in the PR tree', () => {
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'apply-telemt-ui.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'apply-telemt-coverage.py')), false);
});
