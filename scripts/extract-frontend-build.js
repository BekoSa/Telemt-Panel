'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'public', 'index.html');
const clientPath = path.join(root, 'src', 'client.jsx');
const packagePath = path.join(root, 'package.json');

let html = fs.readFileSync(htmlPath, 'utf8');

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(oldText, newText);
}

const externalHead = `<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js"></script>`;
html = replaceOnce(html, externalHead, '', 'external frontend dependencies');
html = replaceOnce(
  html,
  "  --mono:'IBM Plex Mono',monospace;--sans:'DM Sans',sans-serif;",
  "  --mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;--sans:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
  'font stack',
);

const match = html.match(/<script type="text\/babel">\n([\s\S]*?)\n<\/script>\n<\/body>/);
if (!match) throw new Error('inline Babel application script not found');
if ((html.match(/<script type="text\/babel">/g) || []).length !== 1) throw new Error('expected one inline Babel application script');

let client = match[1];
client = replaceOnce(
  client,
  'const {useState, useEffect, useCallback, useRef} = React;\n',
  '',
  'legacy React hook globals',
);
client = client.replaceAll('window.Chart', 'Chart');
client = client.replaceAll('window.d3', 'd3');
client = client.replaceAll('window.topojson', 'topojson');
client = replaceOnce(client, 'ReactDOM.createRoot(', 'createRoot(', 'ReactDOM root');
client = replaceOnce(
  client,
  "const world=await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r=>r.json());",
  'const world=worldAtlas;',
  'world atlas CDN fetch',
);

const imports = `import React, {useState, useEffect, useCallback, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import Chart from 'chart.js/auto';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';

`;
client = imports + client + '\n';

fs.mkdirSync(path.dirname(clientPath), { recursive: true });
fs.writeFileSync(clientPath, client);

html = html.replace(match[0], '<script src="/assets/app.js" defer></script>\n</body>');
fs.writeFileSync(htmlPath, html);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts.build = 'esbuild src/client.jsx --bundle --minify --target=es2022 --format=iife --outfile=public/assets/app.js';
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

const gitignorePath = path.join(root, '.gitignore');
let gitignore = fs.readFileSync(gitignorePath, 'utf8');
if (!gitignore.includes('public/assets/')) {
  gitignore += '\n# Generated frontend bundle\npublic/assets/\n';
  fs.writeFileSync(gitignorePath, gitignore);
}

const dockerPath = path.join(root, 'Dockerfile');
let docker = fs.readFileSync(dockerPath, 'utf8');
docker = replaceOnce(
  docker,
  'FROM node:24-alpine AS deps\n',
  'FROM node:24-alpine AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM node:24-alpine AS deps\n',
  'Docker frontend build stage',
);
docker = replaceOnce(
  docker,
  '# Copy all project files (public/ included, .env excluded via .dockerignore)\nCOPY . .',
  '# Copy all project files (public/ included, .env excluded via .dockerignore)\nCOPY . .\nCOPY --from=build /app/public/assets ./public/assets',
  'Docker generated frontend assets',
);
fs.writeFileSync(dockerPath, docker);

for (const workflowPath of ['.github/workflows/test.yml', '.github/workflows/docker.yml']) {
  const full = path.join(root, workflowPath);
  let workflow = fs.readFileSync(full, 'utf8');
  workflow = replaceOnce(
    workflow,
    '      - name: Run tests\n        run: npm test',
    '      - name: Build frontend\n        run: npm run build\n\n      - name: Run tests\n        run: npm test',
    `${workflowPath} frontend build gate`,
  );
  fs.writeFileSync(full, workflow);
}

const readmePath = path.join(root, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
readme = replaceOnce(
  readme,
  '# Воспроизводимая установка зависимостей\nnpm ci\n\n# Интерактивный wizard (рекомендуется)',
  '# Воспроизводимая установка зависимостей\nnpm ci\n\n# Предварительная сборка локального frontend bundle\nnpm run build\n\n# Интерактивный wizard (рекомендуется)',
  'README local build instructions',
);
readme = replaceOnce(
  readme,
  "├── server.js           # Process entrypoint и listen()\n├── setup-password.js",
  "├── server.js           # Process entrypoint и listen()\n├── src/client.jsx       # React SPA source; npm/esbuild bundles browser dependencies locally\n├── setup-password.js",
  'README source tree',
);
readme = replaceOnce(
  readme,
  "└── public/\n    └── index.html      # SPA (React + Chart.js + D3)",
  "└── public/\n    ├── index.html      # SPA shell and styles\n    └── assets/         # Generated by npm run build; not committed",
  'README public tree',
);
fs.writeFileSync(readmePath, readme);
