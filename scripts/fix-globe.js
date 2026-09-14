'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'src', 'client.jsx');
let source = fs.readFileSync(file, 'utf8');
const needle = '    const d3=d3;\n';
const matches = source.split(needle).length - 1;
if (matches !== 1) throw new Error(`expected exactly one self-shadowing d3 declaration, found ${matches}`);
source = source.replace(needle, '');
fs.writeFileSync(file, source);
