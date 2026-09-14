'use strict';
require('dotenv').config();

const { createApp } = require('./app');

const PORT = parseInt(process.env.PORT || '3000');
const USERNAME = process.env.PANEL_USERNAME || 'admin';
const TELEMT_URL = (process.env.TELEMT_API_URL || 'http://127.0.0.1:9091').replace(/\/$/, '');
const SESSION_HOURS = parseInt(process.env.SESSION_MAX_AGE_HOURS || '8');
const PASS_HASH = process.env.PANEL_PASSWORD_HASH || '';

const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║  Telemt Control Panel                ║`);
  console.log(`  ║  http://0.0.0.0:${PORT}                 ║`);
  console.log(`  ╚══════════════════════════════════════╝`);
  console.log(`  Proxying → ${TELEMT_URL}`);
  console.log(`  User:       ${USERNAME}`);
  console.log(`  Auth:       ${PASS_HASH ? 'bcrypt hash' : 'plaintext (use hash in prod!)'}`);
  console.log(`  Session:    ${SESSION_HOURS}h rolling\n`);
});
