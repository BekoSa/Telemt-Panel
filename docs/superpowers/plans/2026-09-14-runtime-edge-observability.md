# Runtime Edge Observability Implementation Plan

> **For agentic workers:** Use the existing TDD workflow and keep this phase limited to read-only observability.

**Goal:** Surface the Telemt 3.5.7 TLS fingerprint and active-user-IP endpoints in the existing Runtime Edge and Users pages, with graceful behavior when connected to an older Telemt server.

**Architecture:** Reuse the existing `api()`/`useApi()` browser helpers and transparent server proxy. Add a `Fingerprints` tab to `EdgePage`; add an `Active source IPs` card to `UsersPage`. No new server routes are required.

**Tech Stack:** Existing React 18 UMD SPA, Node `node:test` source-contract tests.

## Task 1: RED contract

- Extend `test/ui-contract.test.js` to require `/runtime/tls-fingerprints?limit=100`, a `Fingerprints` tab, `/stats/users/active-ips`, and visible `Active source IPs` copy.
- Run CI and confirm only the new assertions fail.

## Task 2: TLS fingerprints

- Add `Fingerprints` to `EdgePage`.
- Add `EdgeTlsFingerprints()` using `useApi('/runtime/tls-fingerprints?limit=100')`.
- Show retention/capacity/drop/parse-error summary and bounded tables for global, user, IP, and CIDR rows.
- Show a disabled/unavailable state instead of breaking Runtime Edge when no payload exists.

## Task 3: Active IPs

- Add `ActiveUserIps()` using `useApi('/stats/users/active-ips')`.
- Render username + IP chips below the existing users table.
- On legacy endpoint failure, show a small unavailable note and keep user CRUD usable.

## Task 4: GREEN + PR verification

- Run all Node 24 tests.
- Verify draft PR Docker workflow still passes after the observability changes.
