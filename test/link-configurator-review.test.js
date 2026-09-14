'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'connection-link-configurator.jsx'), 'utf8');

test('saving config does not depend on a valid preview secret and only blocks WEB without a target vhost', () => {
  assert.match(source, /const webTargetMissing = webMode/);
  assert.match(source, /const saveDisabled = saving \|\| telemt\.loading \|\| telemt\.readOnly \|\| webTargetMissing;/);
  assert.doesNotMatch(source, /saveDisabled[^;]*generated\.error/);
  assert.match(source, /buildGeneralLinksPatch\(host, port\)/);
});

test('WEB link builder states that a matching Telemt WEB profile is still required', () => {
  assert.match(source, /matching Telemt WEB profile/i);
});
