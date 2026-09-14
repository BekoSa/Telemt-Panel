'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const clientPath = path.join(root, 'src', 'client.jsx');

test('frontend is delivered as a prebuilt local asset without browser Babel or runtime library CDNs', () => {
  assert.doesNotMatch(html, /type=["']text\/babel["']/i);
  assert.doesNotMatch(html, /babel-standalone/i);
  assert.doesNotMatch(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/(react|react-dom|chart\.js|d3|topojson)/i);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/i);
  assert.match(html, /<script src=["']\/assets\/app\.js["'] defer><\/script>/i);
  assert.match(pkg.scripts?.build || '', /esbuild/);
  assert.ok(fs.existsSync(clientPath), 'src/client.jsx must exist');
});

test('client source bundles visualization dependencies and world topology locally', () => {
  assert.ok(fs.existsSync(clientPath), 'src/client.jsx must exist');
  if (!fs.existsSync(clientPath)) return;
  const source = fs.readFileSync(clientPath, 'utf8');
  assert.match(source, /from ['"]react['"]/);
  assert.match(source, /from ['"]react-dom\/client['"]/);
  assert.match(source, /from ['"]chart\.js\/auto['"]/);
  assert.match(source, /from ['"]d3['"]/);
  assert.match(source, /from ['"]topojson-client['"]/);
  assert.match(source, /from ['"]world-atlas\/countries-110m\.json['"]/);
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net\/npm\/world-atlas/i);
});

test('globe renderer uses the imported d3 namespace without self-shadowing it', () => {
  const source = fs.readFileSync(clientPath, 'utf8');
  assert.doesNotMatch(source, /const\s+d3\s*=\s*d3\s*;/);
  assert.match(source, /topojson\.feature\(world,world\.objects\.countries\)/);
  assert.match(source, /d3\.geoOrthographic\(\)/);
});

test('frontend self-hosts the original IBM Plex Mono and DM Sans typography', () => {
  const source = fs.readFileSync(clientPath, 'utf8');
  assert.match(pkg.devDependencies?.['@fontsource/ibm-plex-mono'] || '', /5\.3\.0/);
  assert.match(pkg.devDependencies?.['@fontsource/dm-sans'] || '', /5\.3\.0/);
  assert.match(source, /@fontsource\/ibm-plex-mono\/400\.css/);
  assert.match(source, /@fontsource\/ibm-plex-mono\/600\.css/);
  assert.match(source, /@fontsource\/dm-sans\/400\.css/);
  assert.match(source, /@fontsource\/dm-sans\/700\.css/);
  assert.match(html, /--mono:'IBM Plex Mono',monospace/);
  assert.match(html, /--sans:'DM Sans',sans-serif/);
  assert.match(html, /<link rel=["']stylesheet["'] href=["']\/assets\/app\.css["']/i);
});

test('user maintenance and configurator feedback classes have explicit UI styles', () => {
  const source = fs.readFileSync(clientPath, 'utf8');
  const configurator = fs.readFileSync(path.join(root, 'src', 'connection-link-configurator.jsx'), 'utf8');
  assert.match(source, /className=["']btn btn-warn btn-sm["'][^>]*onClick=\{rotateSecret\}/);
  assert.match(configurator, /message\.ok\?'success-box':'error-box'/);
  assert.match(html, /\.btn-warn\s*\{[^}]*background:var\(--warn2\)[^}]*color:var\(--warn\)/s);
  assert.match(html, /\.btn-warn:hover\s*\{/);
  assert.match(html, /\.success-box\s*\{[^}]*color:var\(--accent\)/s);
});
