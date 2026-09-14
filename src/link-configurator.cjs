'use strict';

const HEX32 = /^[0-9a-f]{32}$/i;
const DD_SECRET = /^dd([0-9a-f]{32})$/i;
const EE_SECRET = /^ee([0-9a-f]{32})([0-9a-f]+)$/i;

function validateHost(value) {
  let host = String(value ?? '').trim();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!host || host.length > 253) throw new Error('Host/IP is required and must be at most 253 characters');
  if (/\s/.test(host) || /[\/?#@&=]/.test(host) || !/^[A-Za-z0-9._:-]+$/.test(host)) {
    throw new Error('Host/IP must be a hostname, IPv4 address, or IPv6 address without a scheme or path');
  }
  return host;
}

function validatePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Port must be an integer from 1 to 65535');
  }
  return port;
}

function classifySecret(rawValue) {
  const raw = String(rawValue ?? '').trim();
  if (HEX32.test(raw)) return { rawSecret: raw, baseSecret: raw, secretMode: 'plain' };
  const dd = raw.match(DD_SECRET);
  if (dd) return { rawSecret: raw, baseSecret: dd[1], secretMode: 'dd' };
  const ee = raw.match(EE_SECRET);
  if (ee && ee[2].length % 2 === 0) return { rawSecret: raw, baseSecret: ee[1], secretMode: 'ee' };
  throw new Error('Secret is not a supported Telemt proxy secret');
}

function normalizeBaseSecret(rawValue) {
  return classifySecret(rawValue).baseSecret;
}

function parseConnectionLink(link) {
  let parsed;
  try { parsed = new URL(String(link)); }
  catch { throw new Error('Connection link is not a valid tg:// URL'); }
  if (parsed.protocol !== 'tg:' || !['proxy', 'webproxy'].includes(parsed.hostname)) {
    throw new Error('Connection link must use tg://proxy or tg://webproxy');
  }
  const host = validateHost(parsed.searchParams.get('server'));
  const secret = classifySecret(parsed.searchParams.get('secret'));
  const isWeb = parsed.hostname === 'webproxy';
  const port = isWeb ? 443 : validatePort(parsed.searchParams.get('port'));
  return {
    scheme: isWeb ? 'webproxy' : 'proxy',
    host,
    port,
    ...secret,
  };
}

function buildConnectionLink({ kind, host, port, secret }) {
  const safeHost = validateHost(host);
  const encodedHost = encodeURIComponent(safeHost);
  const raw = String(secret ?? '').trim();

  if (kind === 'tls') {
    const parsedSecret = classifySecret(raw);
    if (parsedSecret.secretMode !== 'ee') throw new Error('TLS mode requires an existing ee FakeTLS secret');
    const safePort = validatePort(port);
    return `tg://proxy?server=${encodedHost}&port=${safePort}&secret=${raw}`;
  }

  if (!HEX32.test(raw)) throw new Error('Secret must be exactly 32 hex characters for this mode');

  if (kind === 'web-plain') return `tg://webproxy?server=${encodedHost}&secret=${raw}`;
  if (kind === 'web-dd') return `tg://webproxy?server=${encodedHost}&secret=dd${raw}`;

  const safePort = validatePort(port);
  if (kind === 'classic') return `tg://proxy?server=${encodedHost}&port=${safePort}&secret=${raw}`;
  if (kind === 'secure') return `tg://proxy?server=${encodedHost}&port=${safePort}&secret=dd${raw}`;
  throw new Error(`Unsupported connection link kind: ${kind}`);
}

function buildGeneralLinksPatch(host, port) {
  return {
    general: {
      links: {
        public_host: validateHost(host),
        public_port: validatePort(port),
      },
    },
  };
}

module.exports = {
  validateHost,
  validatePort,
  classifySecret,
  normalizeBaseSecret,
  parseConnectionLink,
  buildConnectionLink,
  buildGeneralLinksPatch,
};
