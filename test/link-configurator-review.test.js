'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'connection-link-configurator.jsx'), 'utf8');

test('saving standard public host/port does not depend on a valid preview secret', () => {
  assert.match(source, /const saveDisabled = saving \|\| telemt\.loading \|\| telemt\.readOnly \|\| webMode;/);
  assert.doesNotMatch(source, /saveDisabled[^;]*generated\.error/);
});

test('WEB link builder states that a matching Telemt WEB profile is still required', () => {
  assert.match(source, /matching Telemt WEB profile/i);
});
