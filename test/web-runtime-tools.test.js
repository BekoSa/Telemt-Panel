'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSessionQuery,
  buildWebVhostPatch,
  isTerminalOperation,
} = require('../src/web-runtime-tools.cjs');

test('WEB session query supports bounded filters and cursor pagination', () => {
  const query = buildSessionQuery({
    user: 'alice',
    host: 'proxy.example.com',
    ip: '203.0.113.8',
    carrier: 'websocket-lanes',
    state: 'healthy',
  }, '42', 50);
  assert.equal(query, '?limit=50&cursor=42&ip=203.0.113.8&host=proxy.example.com&user=alice&carrier=websocket-lanes&state=healthy');
});

test('WEB vhost patch preserves the full array while updating selected host and user secret mode', () => {
  const config = {
    web: {
      enabled: true,
      vhosts: [
        {
          host: 'old.example.com',
          decoy: {mode:'http_upstream',upstream:'http://127.0.0.1:18081'},
          profiles: [
            {user:'alice',secret_mode:'plain',max_sessions:4},
            {user:'bob',secret_mode:'dd',max_sessions:8},
          ],
        },
        {host:'other.example.com',profiles:[{user:'carol',secret_mode:'plain'}]},
      ],
    },
  };

  const patch = buildWebVhostPatch(config, {
    vhostIndex: 0,
    host: 'proxy.example.com',
    username: 'alice',
    secretMode: 'dd',
  });

  assert.equal(patch.web.vhosts[0].host, 'proxy.example.com');
  assert.deepEqual(patch.web.vhosts[0].decoy, config.web.vhosts[0].decoy);
  assert.deepEqual(patch.web.vhosts[0].profiles[0], {user:'alice',secret_mode:'dd',max_sessions:4});
  assert.deepEqual(patch.web.vhosts[0].profiles[1], config.web.vhosts[0].profiles[1]);
  assert.deepEqual(patch.web.vhosts[1], config.web.vhosts[1]);
  assert.notStrictEqual(patch.web.vhosts, config.web.vhosts);
});

test('WEB vhost patch can add a profile to an existing configured vhost without inventing decoy settings', () => {
  const config = {web:{vhosts:[{host:'proxy.example.com',decoy:{mode:'static_404'},profiles:[]}]}};
  const patch = buildWebVhostPatch(config, {vhostIndex:0,host:'proxy.example.com',username:'alice',secretMode:'plain'});
  assert.deepEqual(patch.web.vhosts[0].profiles, [{user:'alice',secret_mode:'plain'}]);
  assert.deepEqual(patch.web.vhosts[0].decoy, {mode:'static_404'});
});

test('WEB vhost patch refuses to invent a vhost when Telemt has no selected vhost', () => {
  assert.throws(() => buildWebVhostPatch({web:{vhosts:[]}}, {
    vhostIndex: 0,
    host: 'proxy.example.com',
    username: 'alice',
    secretMode: 'plain',
  }), /existing WEB vhost/i);
});

test('WEB close operation terminal states are explicit', () => {
  assert.equal(isTerminalOperation({state:'queued'}), false);
  assert.equal(isTerminalOperation({state:'running'}), false);
  assert.equal(isTerminalOperation({state:'completed'}), true);
  assert.equal(isTerminalOperation({state:'cancelled'}), true);
  assert.equal(isTerminalOperation({state:'failed'}), true);
});
