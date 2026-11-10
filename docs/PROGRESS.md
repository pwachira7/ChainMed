# Development progress

Repository inspected: empty. Architecture: npm workspaces; Express/Prisma/PostgreSQL; React/Vite; Solidity/Hardhat; durable database outbox. Node available; Docker and psql absent at initial inspection. No existing code to preserve.

Implementation and verification results are updated as work proceeds. No production deployment is claimed.

## Decisions
- Single role per account, centralized backend permission matrix; public registration always Citizen.
- Audit and operational writes share one transaction. Audit hashes include immutable event fields, with deterministic sorted JSON serialization.
- Outbox anchoring is at-least-once; registry uniqueness and commitment reconciliation make retries safe.
- Chain inventory is enumerable, enabling detection of deleted off-chain events.
- Local reset delivery uses a development-only token response. Production requires external mail delivery before reset is enabled.

## Completed phases
1. Inspected the empty repository and established the npm workspace architecture.
2. Configured PostgreSQL via Docker Compose plus a native development fallback; generated local random secrets.
3. Created the normalized Prisma schema, committed initial migration, seeded fictional role accounts and incidents; applied migration to real PostgreSQL.
4. Implemented authentication, rotating hashed refresh tokens, session revocation, profile/password/reset flows and centralized RBAC.
5. Implemented scoped care incident creation, versioned lifecycle updates, assignments, internal notes, filtering and pagination.
6. Added canonical SHA-256 audit events and durable outbox records inside operational transactions; tested rollback and concurrency.
7. Compiled/deployed the Solidity registry and tested writer authorization, duplicates, enumeration, input constraints and owner transfer.
8. Integrated actual ethers submissions, receipt depth, retry/backoff and idempotent recovery of already-mined transactions.
9. Implemented single/batch/scheduled verification, full inventory reconciliation, mismatch/deletion/outage classification and isolated development tamper CLI.
10. Connected audit review, verification findings, notifications and documented investigations.
11. Completed responsive citizen/staff/admin/auditor experiences and modularized frontend pages, layout, hooks, context and shared components.
12. Implemented real redacted CSV/PDF exports, OpenAPI/Swagger documentation, test suites, performance measurement, diagrams and dissertation support.
13. Ran the cross-role browser demonstration against live PostgreSQL and Hardhat. Captured real screenshots and checked mobile layout.

## Actual validation
- `npm run build`: backend compilation and frontend production bundle pass.
- `npm test`: 17 pass, using a fresh `chainmed_test_*` schema, independent local test signer and dedicated contract.
- `npm run test:contract`: 3 pass.
- `npm run test:e2e`: 5 pass; actual screenshots in `docs/screenshots/`.
- `npm run measure`: generated actual sequential 10/50/100-event audit, anchoring and verification measurements plus health API timing.
- Prisma client generation and migration successful after dependency changes; migration reapplication reports no pending changes.
- Clean lockfile installation succeeded in an isolated directory; temporary dependency copies removed afterward.
- `npm audit --omit=dev`: zero known advisories after upgrading Zod and overriding affected Prisma configuration dependencies.

## Defects encountered and resolved
- Sandbox prevented initial network downloads, socket binding and PostgreSQL shared memory; authorized local execution enabled real service validation.
- Prisma CLI needed root .env loading and initial client generation; added an explicit wrapper and setup instructions.
- Vite version duplication caused incompatible plugin types; aligned frontend Vite with the test toolchain.
- Rapid Ethereum submissions reused a cached nonce; disabled provider nonce caching and tested retry plus receipt recovery.
- Browser selectors needed accessible combobox roles and a dashboard-specific sign-in assertion; corrected selectors and reran all five scenarios.
- Async frontend data loads could race; guarded stale responses with a generation counter.
- Test evidence originally shared the demo registry; isolated contract, signer and schema per run to prevent false demo missing-record alerts.
- Dependency scan identified Zod and Prisma configuration advisories; replaced affected versions, regenerated the lockfile and reran build/integration/browser checks.

## Remaining deployment limits
No Docker execution was possible on this host. Native PostgreSQL supplied real database validation. Node 25 produced a Hardhat support warning; Node 22 is the documented runtime. Production reset delivery, distributed infrastructure hardening, independent chain governance and clinical certification are outside this fictional capstone deployment. The README and threat model describe these explicitly. No production-readiness or decentralized-finality claim is made.

## Actual CLI tamper demonstration
Created an isolated `TAMPER_DEMO_FIXTURE` event, waited for the real worker's confirmed anchor, then modified only that fixture through the explicitly enabled development CLI. Verification through the authenticated auditor API returned HASH_MISMATCH. The actual result is saved in `docs/testing/demo-tamper-results.json`; corresponding finding/notification screenshots are in `docs/screenshots/`. The fixture is deliberately left as investigation evidence. The root `.env` keeps `ALLOW_DEMO_TAMPER=false`; the CLI was enabled only for individual commands.
