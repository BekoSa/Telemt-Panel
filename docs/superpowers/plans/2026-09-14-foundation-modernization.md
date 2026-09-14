# Foundation Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a reproducible Node 24 foundation with automated tests, a correct unauthenticated liveness endpoint, and CI/Docker verification before Telemt 3.5.7 feature work.

**Architecture:** Keep Express 4 and the existing application behavior, but split app construction from process startup so HTTP behavior can be tested with Node's built-in test runner. Add `/healthz` as panel-process liveness only. Use a committed npm lockfile and `npm ci` for production/CI reproducibility.

**Tech Stack:** Node.js 24 LTS, Express 4.22.2, express-session 1.19.0, memorystore 1.6.8, bcryptjs 3.0.3, dotenv 17.4.2, Node `node:test`, GitHub Actions, Docker.

**Spec:** `docs/superpowers/specs/2026-09-14-telemt-3.5.7-modernization-design.md`

## Global Constraints

- Target Node.js 24 LTS; do not migrate to Express 5 in this phase.
- Preserve current authentication, CSRF, session, audit, Telemt proxy, and frontend behavior.
- `/healthz` must not require authentication and must not depend on Telemt availability.
- Telemt credentials remain server-side.
- Use Node's built-in test runner; do not add a test framework dependency.
- Production Docker builds use `npm ci --omit=dev` after the lockfile is committed.

---

### Task 1: Add a failing liveness/startup test

**Files:**
- Create: `test/app.test.js`
- Modify: `package.json`
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: current process environment contract (`SESSION_SECRET`, `PANEL_PASSWORD_HASH`, `TELEMT_API_URL`).
- Produces: `createApp()` exported from `app.js` in Task 2; `npm test` command.

- [ ] **Step 1: Update the package metadata and test command**

Use this dependency/runtime target:

```json
{
  "engines": { "node": ">=24.0.0 <25" },
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "node --test",
    "setup": "node setup-password.js init"
  },
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "dotenv": "^17.4.2",
    "express": "^4.22.2",
    "express-session": "^1.19.0",
    "memorystore": "^1.6.8"
  }
}
```

- [ ] **Step 2: Write the failing behavior test**

Create `test/app.test.js`:

```js
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-for-tests-1234567890';
process.env.PANEL_PASSWORD_HASH = '$2b$12$JqQz4YdGQOeU8u4W7yQy4.qnFwYdx7vN3f4J0zj8A1pQHhMEwqJqK';
process.env.TELEMT_API_URL = 'http://127.0.0.1:1';

const { createApp } = require('../app');

let server;
let baseUrl;

before(async () => {
  const app = createApp();
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test('GET /healthz is public process liveness', async () => {
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'telemt-panel' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('GET /auth/me remains protected by session state', async () => {
  const response = await fetch(`${baseUrl}/auth/me`);
  assert.equal(response.status, 401);
});
```

- [ ] **Step 3: Add a Node 24 CI job that can demonstrate RED**

Create `.github/workflows/test.yml`:

```yaml
name: Test

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24.21.0'
          cache: npm
      - run: npm install
      - run: npm test
```

- [ ] **Step 4: Run CI and verify RED**

Expected failure: `Cannot find module '../app'`. A different failure means fix the test/setup before implementing production code.

- [ ] **Step 5: Commit**

Commit message: `test: define panel liveness contract`.

---

### Task 2: Separate app construction and implement liveness

**Files:**
- Create: `app.js`
- Modify: `server.js`
- Test: `test/app.test.js`

**Interfaces:**
- Consumes: same environment variables and current Express routes/middleware.
- Produces: `createApp(): Express.Application`; `startServer()` remains in `server.js`.

- [ ] **Step 1: Move application construction into `app.js`**

Move the current `server.js` application code into `app.js`, preserving route order and behavior, with these structural changes:

```js
function createApp() {
  const app = express();
  if (TRUST_PROXY) app.set('trust proxy', 1);

  app.get('/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, service: 'telemt-panel' });
  });

  // existing middleware/routes/static handling, unchanged in behavior
  return app;
}

module.exports = { createApp };
```

`/healthz` must be registered before session/auth middleware and must not call Telemt.

- [ ] **Step 2: Reduce `server.js` to process startup**

`server.js` imports `createApp`, listens on `0.0.0.0:${PORT}`, and retains the existing startup log. It must not start a listener when `app.js` is imported by tests.

- [ ] **Step 3: Run CI and verify GREEN**

Expected: both tests pass on Node 24.

- [ ] **Step 4: Commit**

Commit message: `refactor: make panel app testable`.

---

### Task 3: Make dependency resolution reproducible

**Files:**
- Create: `package-lock.json`
- Modify: `.github/workflows/test.yml`
- Modify: `Dockerfile`

**Interfaces:**
- Consumes: Task 1 `package.json` dependency ranges.
- Produces: npm lockfile compatible with Node 24/npm 11; Docker and CI both use it.

- [ ] **Step 1: Generate the lockfile under Node 24/npm 11**

Run:

```bash
npm install --package-lock-only
```

Verify the root lockfile package records the Node engine `>=24.0.0 <25` and the intended direct dependency versions/ranges.

- [ ] **Step 2: Switch CI to deterministic install**

Replace `npm install` with:

```yaml
- run: npm ci
```

- [ ] **Step 3: Switch Docker build to Node 24 and `npm ci`**

Use:

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
```

Preserve the existing non-root user and file ownership behavior.

- [ ] **Step 4: Run CI**

Expected: `npm ci` succeeds and all tests pass.

- [ ] **Step 5: Commit**

Commit message: `build: make Node dependencies reproducible`.

---

### Task 4: Fix Docker healthcheck and add Docker verification

**Files:**
- Modify: `Dockerfile`
- Modify: `.github/workflows/docker.yml`

**Interfaces:**
- Consumes: Task 2 public `/healthz` endpoint.
- Produces: container health reflects panel process health rather than login state.

- [ ] **Step 1: Change the healthcheck**

Use:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz >/dev/null || exit 1
```

- [ ] **Step 2: Make Docker workflow depend on tests**

Add a test job (or reuse the same test commands) before build/push so image publication cannot bypass `npm ci` + `npm test`.

- [ ] **Step 3: Run branch CI/Docker build**

Expected: Node tests pass and the multi-arch Docker build completes.

- [ ] **Step 4: Commit**

Commit message: `fix: use public liveness for container health`.

---

### Task 5: Update deployment documentation

**Files:**
- Modify: `README.md`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: foundation runtime/deployment behavior.
- Produces: operator documentation aligned with the new baseline.

- [ ] **Step 1: Update README runtime requirements**

Document Node 24 LTS for non-Docker use, `npm ci` for reproducible installs, `/healthz` as panel liveness, and explain that Telemt readiness is separate.

- [ ] **Step 2: Modernize Compose syntax**

Remove the obsolete top-level `version: '3.8'`. Keep current service/network semantics. Pass through `SESSION_IDLE_MINUTES`, `BIND_SESSION_IP`, `AUDIT_LOG_MAX`, and `COOKIE_SECURE` so Compose behavior matches `.env.example`.

- [ ] **Step 3: Clarify `.env.example`**

Keep current variables and add comments that the panel's healthcheck is independent of Telemt availability.

- [ ] **Step 4: Run final CI**

Expected: all tests and Docker build checks pass.

- [ ] **Step 5: Commit**

Commit message: `docs: update foundation deployment guidance`.

---

## Self-review

- Foundation scope only; Telemt 3.5.7 feature additions are intentionally deferred to the next plan.
- No Express 5 migration is included.
- Liveness is explicitly independent of authentication and Telemt.
- Every production behavior change (`createApp`/`healthz`) is preceded by a failing test.
- Configuration-only dependency/CI/Docker edits are verified by CI and Docker build.