# Reproducible presentation

Use only fictional information. Start all services using the root README and confirm `/api/health` is healthy. Get the demo password from local `.env` without including it in slides or source control.

1. Sign in as `citizen@chainmed.demo` or register a new citizen. Report a Welfare check at “Fictional Demo Community Hall”; choose HIGH priority and add a short fictional description. Record the generated CM reference.
2. Sign in as `admin@chainmed.demo`. Open Care incidents, search for the reference, open it and move to Under review. Assign Jamie Okello. The timeline records the transition and assignment history persists.
3. Sign in as `staff@chainmed.demo`. Open the assigned incident, add an operational note, move to In progress and then Resolved. Explain assigned-record access and optimistic versions.
4. Sign in as `auditor@chainmed.demo`. Open Audit trail, search for the incident UUID or action. Wait for the worker to show Confirmed anchors. Open an event, inspect its digest and transaction hash, and Verify event. Run Verify full inventory. Download an actual CSV/PDF.
5. Demonstrate citizen isolation: navigate to `/audit` while signed in as citizen. The frontend redirects; a direct authenticated `GET /api/audit` also returns 403 and creates ACCESS_DENIED evidence. The automated API suite tests this independently of UI hiding.

## Controlled tampering

Enable `ALLOW_DEMO_TAMPER=true` only in the local development `.env`. This is a CLI, not a web endpoint. Create a dedicated fixture:

```sh
npm run tamper -w backend -- create
```

Copy its UUID. Wait until its anchor is Confirmed in the audit table; then run:

```sh
npm run tamper -w backend -- modify UUID_FROM_CREATE
```

Run full verification as auditor. Expect HASH_MISMATCH, a HIGH finding and an in-app notification. Inspect the finding, acknowledge it with an evidence note, then document the controlled demonstration outcome. Closing a finding does not repair the underlying evidence; a later scan may report it again.

For deletion, create a second fixture, wait for confirmation, then:

```sh
npm run tamper -w backend -- delete SECOND_UUID
```

Run **full inventory** verification. Expect MISSING_OFF_CHAIN_RECORD even though the row is absent from the audit table. The outbox and registry inventory preserve the expected UUID. Disable `ALLOW_DEMO_TAMPER` after the exercise. Leave tampered evidence isolated rather than rewriting history to hide it.

Stop Hardhat briefly to show VERIFICATION_ERROR as an infrastructure warning. Do not describe it as proven tampering. Restarting Hardhat clears its ephemeral chain, so perform this scenario last or use a persistent development chain provider. Reset using a new disposable database and new registry as described in README; never reuse old confirmed receipt state with an unrelated new chain.

## Screenshots and dissertation evidence

`npm run test:e2e` captures actual admin overview, audit trail and mobile screenshots in `docs/screenshots/`. For the tamper scenario, capture the fixture event before change, mismatch result, finding, notification and documented investigation. Include browser URL, fictional identity role and relevant test run date in your dissertation captions. Redact local passwords, tokens and signer keys. Do not present seeded counts or local-node latency as real healthcare outcomes.

Optional local helpers: `node scripts/verify-demo.mjs [EVENT_UUID]` signs in as the seeded auditor and runs a real single/full verification without printing credentials. `node scripts/capture-demo.mjs` captures the current findings and notifications interface using Playwright; install Chromium first and retain any configured `PLAYWRIGHT_BROWSERS_PATH`. These helpers refuse production mode.
