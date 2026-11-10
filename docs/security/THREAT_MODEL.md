# Threat model and RBAC

## Assets and adversaries
Protect operational incident information, identities, session credentials, audit evidence, blockchain signing authority and investigation conclusions. Consider unauthenticated users, malicious citizens, compromised staff accounts, unauthorized auditors, privileged database writers and compromised signing keys. Denial of service, phishing and endpoint compromise are not eliminated by ledger anchoring.

## Central permission matrix

| Capability | Citizen | Care staff | Auditor | Administrator |
| --- | --- | --- | --- | --- |
| Register citizen / manage own profile | Yes | Yes | Yes | Yes |
| Submit incident | Yes | No | No | Yes |
| Read operational records | Own | Assigned | No | All |
| Review incident / change priority/status / add internal notes | No | Assigned | No | All |
| Assign staff | No | No | No | Yes |
| View internal operational notes | No | Assigned | No | All |
| Read audit evidence / download reports | No | No | Yes | Yes |
| Verify single / batch / full inventory | No | No | Yes | Yes |
| Acknowledge or close findings | No | No | Yes | Yes |
| Modify historical audit events | No | No | No | No |
| Change roles / account availability | No | No | No | Other accounts |
| Read notifications | Own | Own | Own | Own |

The matrix in `backend/src/services/permissions.ts` controls endpoint authorization. Ownership restrictions are additional checks. The API always reads current account role and revocation state rather than trusting a stale JWT role. Citizens get 404 for others' incident IDs and do not receive internal notes or assignment history. Direct staff reassignment by staff is denied even for assigned incidents. Administrators cannot modify their own role or active flag; active incident assignments block removal of staff access until reassigned.

## Security mechanisms
- bcrypt cost 12; minimum 12-character new passwords; bounded inputs and payloads.
- HS256 JWT with fixed issuer/audience, 15-minute expiration, random session identifier and database-backed revocation.
- 256-bit refresh/reset secrets, SHA-256 hashes at rest, atomic one-use/rotation checks. Refresh cookie is HTTP-only, SameSite Strict, scoped to auth routes and Secure in production.
- Exact trusted Origin required for cookie refresh/logout. Bearer-authenticated writes require an access token unavailable to a cross-site attacker. CORS allows the configured origin. Production origin must be HTTPS.
- Helmet response headers, per-process request/authentication rate limits, Prisma parameterized queries and Zod allowlists.
- Access credentials stay in browser memory; they are not persisted in localStorage. Profile changes cannot modify roles or email. Public registration rejects extra privileged fields.
- CSV formula injection protection and exports restricted to a redacted field allowlist.
- Audit metadata excludes contact, care descriptions and authentication secrets. JSON application logs avoid request bodies and authorization headers.
- No general audit write/update/delete API; tamper CLI requires development mode, explicit opt-in and an isolated confirmed test fixture.

## Trust and limitations
A database owner can change all application tables, including audit/outbox rows. Existing external commitments reveal changed or deleted evidence, provided the correct independent registry remains available. A signing-key attacker can add false new commitments, cannot replace existing registry entries, and may deny service by revoking writers if also contract owner. Contract owner/writer actions are visible on chain. Store keys outside application source, rotate authorized writers and monitor governance for production.

An attacker controlling the database, chain host and frontend can replace the entire demonstration history. The local chain is an educational trust anchor, not proof against an adversary controlling the same machine. Deleted events that were never anchored and whose outbox is also deleted have no surviving external witness. The original event's truthfulness is outside hash verification. Backups, independent observers and immutable off-site retention remain necessary.

Metadata identifiers remain potentially linkable even without care text. Limit ledger access and assess privacy before real deployment. No actual patient data belongs in this project.

API audit append-only behavior is not a database superuser protection. Production must separate migration ownership, application role and restricted audit privileges. This repository uses a single development database account so tamper exercises can be demonstrated. In-process rate limiting is suitable only for a single API instance. Add distributed limits, TLS proxy hardening, secret management, disaster recovery and third-party security review before operational use.

Development reset tokens are intentionally returned locally. Production reset requests return 503 until secure delivery is implemented; no fake mail delivery is claimed. Native developer launchers, seed and tamper tools refuse production mode.

## Dependency validation
The final production-dependency advisory scan is saved in `docs/testing/dependency-audit.json`. Zod was upgraded to 4.6.7. The Prisma 6 configuration package's pinned Effect and Deepmerge dependencies are overridden to patched versions (3.22.4 and 8.0.2 in the lockfile). The direct development dependencies deliberately establish the override versions; application code does not depend on those packages directly. Prisma generation, migration, application build and integration tests were rerun after replacement. A zero-advisory report is a point-in-time registry check, not a claim that all defects or development-tool risks are eliminated.
