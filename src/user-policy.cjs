'use strict';

const NUMERIC_FIELDS = new Set([
  'max_tcp_conns',
  'data_quota_bytes',
  'rate_limit_up_bps',
  'rate_limit_down_bps',
  'max_unique_ips',
]);

const OPTIONAL_FIELDS = [
  'user_ad_tag',
  'max_tcp_conns',
  'expiration_rfc3339',
  'data_quota_bytes',
  'rate_limit_up_bps',
  'rate_limit_down_bps',
  'max_unique_ips',
];

function present(value) {
  return value !== '' && value !== undefined && value !== null;
}

function cast(field, value) {
  return NUMERIC_FIELDS.has(field) ? Number(value) : value;
}

function buildCreateUserBody(form) {
  const body = { username: form.username };
  if (present(form.secret)) body.secret = form.secret;
  for (const field of OPTIONAL_FIELDS) {
    if (present(form[field])) body[field] = cast(field, form[field]);
  }
  if (typeof form.enabled === 'boolean') body.enabled = form.enabled;
  return body;
}

function buildPatchUserBody(initial, form) {
  const body = {};
  if (present(form.secret)) body.secret = form.secret;
  for (const field of OPTIONAL_FIELDS) {
    if (present(form[field])) {
      body[field] = cast(field, form[field]);
    } else if (initial?.[field] !== undefined && initial?.[field] !== null) {
      body[field] = null;
    }
  }
  return body;
}

function findUserQuota(data, username) {
  const rows = Array.isArray(data?.users) ? data.users : [];
  return rows.find(row => row?.username === username) || null;
}

module.exports = {
  buildCreateUserBody,
  buildPatchUserBody,
  findUserQuota,
};
