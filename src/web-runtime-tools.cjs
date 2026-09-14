'use strict';

const FILTER_ORDER = ['ip','host','user','user_agent_id','key_id','carrier','state'];
const TERMINAL_STATES = new Set(['completed','cancelled','failed']);

function buildSessionQuery(filters = {}, cursor = null, limit = 50) {
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error('WEB session limit must be between 1 and 200');
  const params = new URLSearchParams();
  params.set('limit', String(n));
  if (cursor !== null && cursor !== undefined && String(cursor) !== '') params.set('cursor', String(cursor));
  for (const key of FILTER_ORDER) {
    const value = filters[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') params.set(key, String(value).trim());
  }
  return `?${params.toString()}`;
}

function buildWebVhostPatch(config, {vhostIndex, host, username, secretMode}) {
  const vhosts = config?.web?.vhosts;
  if (!Array.isArray(vhosts) || !Number.isInteger(vhostIndex) || !vhosts[vhostIndex]) {
    throw new Error('Select an existing WEB vhost before saving');
  }
  if (!['plain','dd'].includes(secretMode)) throw new Error('WEB secret mode must be plain or dd');
  if (!host || typeof host !== 'string') throw new Error('WEB host is required');
  if (!username || typeof username !== 'string') throw new Error('WEB username is required');

  const nextVhosts = vhosts.map((vhost, index) => {
    if (index !== vhostIndex) return {...vhost, profiles:Array.isArray(vhost.profiles)?vhost.profiles.map(p=>({...p})):vhost.profiles};
    const profiles = Array.isArray(vhost.profiles) ? vhost.profiles.map(p => ({...p})) : [];
    const userIndex = profiles.findIndex(profile => profile?.user === username);
    if (userIndex >= 0) profiles[userIndex] = {...profiles[userIndex], secret_mode: secretMode};
    else profiles.push({user: username, secret_mode: secretMode});
    return {...vhost, host, profiles};
  });

  return {web:{vhosts:nextVhosts}};
}

function isTerminalOperation(operation) {
  return TERMINAL_STATES.has(operation?.state);
}

module.exports = {
  buildSessionQuery,
  buildWebVhostPatch,
  isTerminalOperation,
};
