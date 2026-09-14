'use strict';

const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(oldText, newText);
}

const clientPath = path.join(__dirname, '..', 'src', 'client.jsx');
let client = fs.readFileSync(clientPath, 'utf8');
const importAnchor = "import worldAtlas from 'world-atlas/countries-110m.json';\n";
const fontImports = `${importAnchor}import '@fontsource/ibm-plex-mono/400.css';\nimport '@fontsource/ibm-plex-mono/500.css';\nimport '@fontsource/ibm-plex-mono/600.css';\nimport '@fontsource/ibm-plex-mono/400-italic.css';\nimport '@fontsource/dm-sans/400.css';\nimport '@fontsource/dm-sans/500.css';\nimport '@fontsource/dm-sans/600.css';\nimport '@fontsource/dm-sans/700.css';\n`;
client = replaceOnce(client, importAnchor, fontImports, 'font imports');
fs.writeFileSync(clientPath, client);

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = replaceOnce(
  html,
  "  --mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;--sans:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
  "  --mono:'IBM Plex Mono',monospace;--sans:'DM Sans',sans-serif;",
  'font variables',
);
html = replaceOnce(
  html,
  '<title>Telemt Control Panel</title>\n',
  '<title>Telemt Control Panel</title>\n<link rel="stylesheet" href="/assets/app.css">\n',
  'stylesheet link',
);
fs.writeFileSync(htmlPath, html);

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts.build = 'esbuild src/client.jsx --bundle --minify --target=es2022 --format=iife --loader:.woff2=file --outfile=public/assets/app.js';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
