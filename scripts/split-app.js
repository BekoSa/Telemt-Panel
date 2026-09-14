'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const appPath = path.join(root, 'app.js');

const source = fs.readFileSync(serverPath, 'utf8');
const appAnchor = "const app = express();\nif (TRUST_PROXY) app.set('trust proxy', 1);\n";
const startMarker = '// ─── Start ────────────────────────────────────────────────────────────────────';

if (!source.includes(appAnchor)) {
  throw new Error('server.js app anchor not found');
}
const startIndex = source.indexOf(startMarker);
if (startIndex === -1) {
  throw new Error('server.js start marker not found');
}

let appSource = source.slice(0, startIndex).trimEnd() + '\n';
appSource = appSource.replace(
  appAnchor,
  "function createApp() {\n" +
  "  const app = express();\n" +
  "  if (TRUST_PROXY) app.set('trust proxy', 1);\n\n" +
  "  // Panel process liveness only: public and independent of Telemt.\n" +
  "  app.get('/healthz', (req, res) => {\n" +
  "    res.setHeader('Cache-Control', 'no-store');\n" +
  "    res.json({ ok: true, service: 'telemt-panel' });\n" +
  "  });\n"
);
appSource += "\n  return app;\n}\n\nmodule.exports = { createApp };\n";

const startupSource = `'use strict';
require('dotenv').config();

const { createApp } = require('./app');

const PORT = parseInt(process.env.PORT || '3000');
const USERNAME = process.env.PANEL_USERNAME || 'admin';
const TELEMT_URL = (process.env.TELEMT_API_URL || 'http://127.0.0.1:9091').replace(/\\/$/, '');
const SESSION_HOURS = parseInt(process.env.SESSION_MAX_AGE_HOURS || '8');
const PASS_HASH = process.env.PANEL_PASSWORD_HASH || '';

const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(\`\\n  ╔══════════════════════════════════════╗\`);
  console.log(\`  ║  Telemt Control Panel                ║\`);
  console.log(\`  ║  http://0.0.0.0:\${PORT}                 ║\`);
  console.log(\`  ╚══════════════════════════════════════╝\`);
  console.log(\`  Proxying → \${TELEMT_URL}\`);
  console.log(\`  User:       \${USERNAME}\`);
  console.log(\`  Auth:       \${PASS_HASH ? 'bcrypt hash' : 'plaintext (use hash in prod!)'}\`);
  console.log(\`  Session:    \${SESSION_HOURS}h rolling\\n\`);
});
`;

fs.writeFileSync(appPath, appSource);
fs.writeFileSync(serverPath, startupSource);
