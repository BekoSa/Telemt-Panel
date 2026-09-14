'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseConnectionLink,
  buildConnectionLink,
  buildGeneralLinksPatch,
  validateHost,
} = require('../src/link-configurator.cjs');

const SECRET = '0123456789abcdef0123456789abcdef';

test('parses Telemt classic and secure links into one base secret', () => {
  const classic = parseConnectionLink(`tg://proxy?server=1.2.3.4&port=443&secret=${SECRET}`);
  assert.deepEqual(classic, {
    scheme: 'proxy', host: '1.2.3.4', port: 443,
    rawSecret: SECRET, baseSecret: SECRET, secretMode: 'plain',
  });

  const secure = parseConnectionLink(`tg://proxy?server=proxy.example.com&port=8443&secret=dd${SECRET}`);
  assert.equal(secure.host, 'proxy.example.com');
  assert.equal(secure.port, 8443);
  assert.equal(secure.baseSecret, SECRET);
  assert.equal(secure.secretMode, 'dd');
});

test('builds classic and secure MTProxy links with manual host and port', () => {
  assert.equal(
    buildConnectionLink({ kind: 'classic', host: 'proxy.example.com', port: 8443, secret: SECRET }),
    `tg://proxy?server=proxy.example.com&port=8443&secret=${SECRET}`,
  );
  assert.equal(
    buildConnectionLink({ kind: 'secure', host: '203.0.113.7', port: 443, secret: SECRET }),
    `tg://proxy?server=203.0.113.7&port=443&secret=dd${SECRET}`,
  );
});

test('builds both Telemt 3.5.7 WEB proxy link forms and never emits a port', () => {
  assert.equal(
    buildConnectionLink({ kind: 'web-plain', host: 'proxy.example.com', port: 9999, secret: SECRET }),
    `tg://webproxy?server=proxy.example.com&secret=${SECRET}`,
  );
  assert.equal(
    buildConnectionLink({ kind: 'web-dd', host: 'proxy.example.com', port: 9999, secret: SECRET }),
    `tg://webproxy?server=proxy.example.com&secret=dd${SECRET}`,
  );
});

test('WEB mode rejects FakeTLS ee secrets instead of producing an invalid link', () => {
  assert.throws(
    () => buildConnectionLink({ kind: 'web-plain', host: 'proxy.example.com', secret: `ee${SECRET}6578616d706c652e636f6d` }),
    /32 hex/i,
  );
});

test('TLS output preserves an existing Telemt FakeTLS secret', () => {
  const tlsSecret = `ee${SECRET}6578616d706c652e636f6d`;
  assert.equal(
    buildConnectionLink({ kind: 'tls', host: 'proxy.example.com', port: 443, secret: tlsSecret }),
    `tg://proxy?server=proxy.example.com&port=443&secret=${tlsSecret}`,
  );
});

test('host validation accepts public names/IPs and rejects URL/path injection', () => {
  assert.equal(validateHost('proxy.example.com'), 'proxy.example.com');
  assert.equal(validateHost('203.0.113.7'), '203.0.113.7');
  assert.equal(validateHost('2001:db8::1'), '2001:db8::1');
  assert.throws(() => validateHost('https://proxy.example.com/path'), /host/i);
  assert.throws(() => validateHost('proxy.example.com&secret=bad'), /host/i);
});

test('Telemt config persistence is limited to general.links public host/port', () => {
  assert.deepEqual(buildGeneralLinksPatch('proxy.example.com', 8443), {
    general: { links: { public_host: 'proxy.example.com', public_port: 8443 } },
  });
});

test('client integrates a manual configurator with separate local and Telemt persistence semantics', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'src', 'client.jsx'), 'utf8');
  const component = fs.readFileSync(path.join(__dirname, '..', 'src', 'connection-link-configurator.jsx'), 'utf8');
  assert.match(client, /ConnectionLinkConfigurator/);
  assert.match(component, />Link Configurator</);
  assert.match(component, /WEB plain/);
  assert.match(component, /WEB dd/);
  assert.match(component, /443 fixed/);
  assert.match(component, /Save public host\/port to Telemt/);
  assert.match(component, /general\.links/);
  assert.match(component, /If-Match|revision/);
  assert.match(component, /WEB config is not editable by Telemt 3\.5\.7 Control API/);
});
