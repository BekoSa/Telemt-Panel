'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCreateUserBody,
  buildPatchUserBody,
  findUserQuota,
} = require('../src/user-policy.cjs');

test('create user body includes Telemt 3.5.7 directional rate limits and enabled state', () => {
  assert.deepEqual(buildCreateUserBody({
    username: 'alice',
    secret: '',
    user_ad_tag: '',
    max_tcp_conns: '8',
    expiration_rfc3339: '',
    data_quota_bytes: '1000',
    rate_limit_up_bps: '2000000',
    rate_limit_down_bps: '5000000',
    max_unique_ips: '3',
    enabled: false,
  }), {
    username: 'alice',
    max_tcp_conns: 8,
    data_quota_bytes: 1000,
    rate_limit_up_bps: 2000000,
    rate_limit_down_bps: 5000000,
    max_unique_ips: 3,
    enabled: false,
  });
});

test('patch body sends null when an existing optional override is explicitly cleared', () => {
  const initial = {
    user_ad_tag: '00112233445566778899aabbccddeeff',
    max_tcp_conns: 8,
    expiration_rfc3339: '2027-01-01T00:00:00Z',
    data_quota_bytes: 1000,
    rate_limit_up_bps: 2000000,
    rate_limit_down_bps: 5000000,
    max_unique_ips: 3,
  };
  const form = {
    secret: '',
    user_ad_tag: '',
    max_tcp_conns: '',
    expiration_rfc3339: '',
    data_quota_bytes: '',
    rate_limit_up_bps: '',
    rate_limit_down_bps: '',
    max_unique_ips: '',
  };

  assert.deepEqual(buildPatchUserBody(initial, form), {
    user_ad_tag: null,
    max_tcp_conns: null,
    expiration_rfc3339: null,
    data_quota_bytes: null,
    rate_limit_up_bps: null,
    rate_limit_down_bps: null,
    max_unique_ips: null,
  });
});

test('patch body leaves never-configured blank overrides unchanged', () => {
  assert.deepEqual(buildPatchUserBody({}, {
    secret: '',
    user_ad_tag: '',
    max_tcp_conns: '',
    expiration_rfc3339: '',
    data_quota_bytes: '',
    rate_limit_up_bps: '',
    rate_limit_down_bps: '',
    max_unique_ips: '',
  }), {});
});

test('quota helper selects the requested user from stats/users/quota payload', () => {
  const row = findUserQuota({ users: [
    {username:'alice',data_quota_bytes:1000,used_bytes:250,last_reset_epoch_secs:10},
    {username:'bob',data_quota_bytes:2000,used_bytes:500,last_reset_epoch_secs:20},
  ] }, 'bob');
  assert.equal(row.username, 'bob');
  assert.equal(row.used_bytes, 500);
});
