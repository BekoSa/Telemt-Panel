'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src', 'client.jsx'), 'utf8');

test('GeoIP keeps an HTTPS zero-config provider with an explicit opt-out', () => {
  assert.match(app, /https:\/\/ip-api\.io\/api\/v1\/ip\/batch/);
  assert.match(app, /GEOIP_DISABLED/);
  assert.match(app, /geoIpProvider/);
  assert.match(app, /api_key/);
});

test('globe distinguishes disabled GeoIP from unresolved addresses', () => {
  assert.match(client, /geo\.disabled/);
  assert.match(client, /GeoIP disabled/);
});

test('one-time GeoIP integration helpers are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'apply-geoip-fix.py')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'apply-geoip-fix.yml')), false);
});
