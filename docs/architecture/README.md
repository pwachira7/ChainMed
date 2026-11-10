# Architecture, schema and integrity design

## Boundaries
The browser presents permission-aware screens and holds a short-lived bearer access token in memory. The API independently authenticates every protected request against a current active session and role. Prisma communicates with PostgreSQL. A separate worker signs registry transactions. The verification service reads chain commitments and writes findings; notifications connect evidence review back to authorized users.

Business routes perform incident changes and call `capture(tx, ...)` in the same database transaction. If evidence or outbox insertion fails, the business update rolls back. Failed authentication and permission denial evidence is stored in separate transactions because no business change succeeds. Logging captures events; auditing reconstructs and compares them and manages investigations.

## Database dictionary

| Entity | Purpose / constraints |
| --- | --- |
| User | Unique normalized email; bcrypt hash; active flag; enum role; no public role selection |
| Session | Unique hashed refresh token; expiry; revocation; user foreign key |
| PasswordReset | Hashed one-use token; expiry; consumed timestamp |
| Incident | Unique reference; reporter and optional assignee FKs; category, description, location, urgency, lifecycle status; optimistic version |
| IncidentAssignment | Append-only assignment history; incident FK; assigned staff and administrator IDs |
| IncidentStatusHistory | Append-only from/to states, actor and timestamp; incident FK |
| OperationalNote | Incident/author FKs; operation text; timestamp |
| AuditEvent | UUID; approved event fields; canonical payload; SHA-256 digest; previous digest; no update/delete endpoint |
| BlockchainAnchor | Unique event UUID; immutable expected digest; retry state, attempt count, lease and transaction metadata |
| IntegrityVerificationRun | Requester, start/end, JSON per-event results |
| IntegrityVerificationFinding | Run FK; event UUID, result, severity, investigation status and timestamped notes |
| Notification | Recipient FK; finding UUID, title and read time |
| IdempotencyKey | User-scoped request key; canonical input hash; created incident ID |

Audit actor IDs, assignment actors, finding event IDs and the outbox event identifier intentionally preserve evidence as opaque historical identifiers. Outbox rows have no cascading relation to AuditEvent: they must survive deliberate deletion to support reconciliation. User and incident records are deactivated/closed rather than deleted through the API. A fixed single enum role per account is the normalized access model: the permission matrix is version-controlled code rather than editable role/permission tables. Role-at-event-time is retained even after role changes.

The migration defines unique constraints and indexes for identity, operational ownership, event timestamps, action/role filters, queue status/retry time, findings and unread notifications. Refer to `backend/prisma/schema.prisma` for exact types and relations.

## Canonical event and hashing
An event contains `id`, ISO UTC `timestamp`, nullable `actorId`, `actorRole`, `action`, `resourceType`, `resourceId`, `outcome`, `requestId`, approved `metadata` and nullable `previousDigest`. String keys are sorted recursively; arrays retain their order; numbers, booleans, nulls and strings use JSON representation. Undefined and Date instances are not accepted event metadata. All timestamps are explicitly serialized as UTC strings.

The canonical payload excludes the digest, stored canonical string, blockchain state and mutable investigation state. SHA-256 consumes UTF-8 bytes and produces 64 lowercase hexadecimal characters. Ethers sends `0x` plus those 64 characters as Solidity `bytes32`. Event UUID hyphens are removed (16 bytes), then right-padded with 16 zero bytes to fit `bytes32`. The inverse restores the UUID; this representation retains no care information.

Example metadata is `{reference, urgency}` for creation or `{from, to, assigneeId, urgency}` for coordination. Operational descriptions, contact details, passwords, tokens and reset secrets are excluded. A previous digest adds linkage; current verification validates it as part of the committed payload, rather than claiming an independent complete hash-chain proof.

Concurrent capture takes a PostgreSQL transaction advisory lock before selecting the latest digest. A monotonic millisecond timestamp resolves equal-clock ordering. This serializes chain-head extension at capstone volume; benchmark its contention before larger deployments.

## Durable anchoring
A committed outbox row starts PENDING. A worker transaction takes a nonblocking advisory lock to serialize the service signer's nonce across worker processes sharing this database. It leases up to ten eligible jobs, checks the registry first, submits a new transaction if absent, stores its transaction hash and waits for the configured receipt depth. States are PENDING → SUBMITTED → CONFIRMED, or FAILED with capped exponential backoff. The database transaction commits queue updates at batch end; if the process crashes after a send but before commit, the original PENDING row remains and a later worker finds the existing registry commitment. Thus processing is at least once and registry effects are deduplicated.

A worker recovers existing commitments from emitted events and their actual block depth. Nonce caching is disabled to avoid repeated stale nonces during fast local mining. Locks serialize instances within the configured database; do not use the same signer from unrelated databases or external writers. A ten-row transaction may be long under delayed mining; a production queue should use short claim/update transactions and a dedicated cross-process signer lock. RPC failure retains records and schedules retries, never discards evidence.

## Verification algorithm
1. Establish RPC connectivity, correct chain ID and deployed contract presence.
2. For full reconciliation, take the union of PostgreSQL audit UUIDs, durable outbox UUIDs and enumerable registry UUIDs.
3. Retrieve the event, outbox state and independent chain commitment.
4. Missing expected PostgreSQL evidence yields MISSING_OFF_CHAIN_RECORD.
5. Rebuild the event from its structured columns; compare canonical string, recomputed digest, stored digest and any chain digest. Divergence yields HASH_MISMATCH.
6. Missing commitment with unconfirmed outbox yields PENDING_CONFIRMATION. A missing commitment expected to be confirmed yields MISSING_BLOCKCHAIN_ANCHOR.
7. An existing commitment without confirmed local receipt state, or whose on-chain block depth is below the configured threshold, remains PENDING_CONFIRMATION. Verification independently checks the registry event block depth.
8. Matching evidence and a confirmed anchor yields VERIFIED. RPC/database failures yield VERIFICATION_ERROR, never an unsupported tampering verdict.
9. Persist the run and new deduplicated findings; notify active admins/auditors. Infrastructure errors carry WARNING severity; integrity inconsistencies carry HIGH severity.
10. Record verification itself as a new audit event. It naturally awaits anchoring, so a full scan can never mean no newer events exist.

Investigations move OPEN → ACKNOWLEDGED → CLOSED or FALSE_ALARM; a justification is mandatory for every update. Terminal investigations cannot be silently edited. A subsequent verification can raise a new finding if the same unresolved evidence condition recurs after closure.

## Primary implementation references
- [Prisma v6 transactions](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions)
- [PostgreSQL advisory locks](https://www.postgresql.org/docs/17/explicit-locking.html)
- [Hardhat TypeScript support](https://v2.hardhat.org/hardhat-runner/docs/guides/typescript)
