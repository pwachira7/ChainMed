# Validation and dissertation methodology

## Reproduce
1. Use Node 22, install dependencies, migrate and seed PostgreSQL.
2. Start Hardhat, deploy/configure the demo registry, start API/frontend/worker.
3. `npm run typecheck` and `npm run build` validate TypeScript and production bundling.
4. `npm run test:contract` compiles the pinned npm Solidity compiler and exercises registry security.
5. `npm test` migrates a fresh isolated `chainmed_test_*` schema and deploys a dedicated registry before real API integration tests.
6. `npx playwright install chromium`, then `npm run test:e2e` tests the browser across all roles and a 390px viewport.
7. `npm run measure` writes actual sequential local measurements to `performance-results.json`.

In restricted hosts, all local services and tests need permission to bind/connect to loopback. Prisma and Chromium may need initial network downloads. If `PLAYWRIGHT_BROWSERS_PATH` is customized during installation, use the same value for test execution.

## Coverage and evidence
Unit checks validate deterministic canonical serialization, a known SHA-256 vector, UUID-to-bytes32 round trip, permission restrictions and ownership rules. Contract tests exercise authorized writers, revoked writers, unauthorized governance, duplicate rejection, retrieval and enumeration. API integration tests use actual PostgreSQL and Ethereum to cover transaction rollback, idempotency concurrency, stale incident versions, forbidden lifecycle transitions, role boundaries, cross-user isolation, internal note redaction, anchoring, mismatch/deletion detection, outage classification, feedback notifications, investigation actions, actual exports, refresh rotation, Origin validation and revocation.

Browser tests verify citizen report submission, administrator review/assignment, staff note/status updates, auditor verification and CSV download, restricted-route navigation and mobile menu/overflow behavior. They also produce screenshots from the implemented interface. Browser checks include real component interaction; this repository does not claim exhaustive isolated unit coverage of every frontend component.

Generated Vitest/Playwright JSON reports record actual executions. Playwright trace artifacts for failures are kept in gitignored `test-results/`; HTML report is in gitignored `playwright-report/`. Results include machine-specific timing and local paths; redact these as appropriate before publication. Only the final successful rerun should support a passing conclusion. Failed runs and their fixes are summarized in `../PROGRESS.md` rather than hidden by a claim that no defects occurred.

## Performance method
The benchmark runs volumes 10, 50 and 100 sequential events in the isolated schema. It measures a baseline `SELECT 1` transaction, then a complete audit+outbox transaction. Their mean difference estimates incremental evidence overhead for this narrow workload, not the overhead for every business operation. It measures time to drain event commitments and per-event integrity verification, plus twenty health API requests. Queue timing includes any older outstanding test jobs; warm-cache effects and local mining bias the result. These are descriptive local capstone measurements, not production capacity or finality guarantees.

Use independent replicated trials, confidence intervals, controlled hardware, larger volumes, concurrent actors and a genuinely independent test network for stronger dissertation claims. Do not extrapolate a local Hardhat confirmation time to public Ethereum finality. No fabricated targets or placeholder numerical results are included.

## Academic chapter mapping
- Chapter 3: requirements, RBAC matrix, threat model, schema, conceptual framework and experiment design.
- Chapter 4: implemented modules, diagrams, canonical payload, durable anchoring, verification algorithm and screenshots.
- Chapter 5: generated test reports, measured data, negative cases, findings and limitations; explain local trust assumptions and external validity.

## Final execution evidence (27 October 2026)
- Application tests: 17 passed (13 real integration/API cases and 4 deterministic security/hash cases).
- Solidity tests: 3 passed, covering multiple authorization, duplicate, input and governance scenarios.
- Chromium browser tests: 5 passed, covering all roles and mobile layout.
- Production build and Prisma generation: successful; committed migration applied to real PostgreSQL and reapplied with no pending changes.
- Clean `npm ci --ignore-scripts` in an isolated directory: successful. The main clean install also ran lifecycle scripts; generation was then explicitly rerun.
- Production dependency advisory scan: zero known advisories in the saved report.
- Performance: actual 10/50/100-event local measurements saved. The negative incremental overhead at volume 10 reflects measurement/warm-up noise; it is not a performance improvement claim.

The host ran Node 25.5.0. Hardhat printed its unsupported-version warning, while the recorded checks succeeded. Use the documented Node 22 environment for replication. Docker Compose was supplied but not executed because Docker is not installed; actual persistence checks used native PostgreSQL from `embedded-postgres`.
