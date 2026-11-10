# Requirements and implementation map

## Research scope
Care operations include emergency reporting, welfare checks, staff assignment, operational notes and incident status coordination. ChainMed studies the connection between access control, automatic evidence capture, blockchain commitments, verification and accountable feedback. It does not manage clinical diagnoses, billing or patient treatment records.

## Functional requirements

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Public registration, authentication, profile and password management | `backend/src/routes/auth.ts`; account UI | API session and browser tests |
| Four roles, centralized permissions, incident ownership | middleware and permissions service | positive/negative RBAC and cross-user API tests |
| Incident creation and lifecycle coordination | incidents router, history and assignment tables | concurrent idempotency, lifecycle and browser role handoff |
| Atomic evidence capture | audit service called in business transaction | forced rollback test |
| Durable blockchain anchoring | BlockchainAnchor outbox, worker | real registry anchoring and retry tests |
| Reproducible integrity verification | canonical event reconstruction and SHA-256 | known digest, altered/deleted fixtures and outage tests |
| Reconciliation of expected records | union of chain inventory, outbox and database IDs | deleted fixture test |
| Investigation feedback | findings, evidence notes and notifications | API acknowledgement and notification assertions |
| Search, filtering, paging and reports | incidents/audit/finding APIs, dashboard UI | browser navigation and actual CSV/PDF tests |
| Demonstration-only tampering | gated CLI restricted to confirmed fixture actions | equivalent isolated database changes in integration tests |

## Non-functional requirements
- Confidentiality: authenticated, role-scoped reads; no care text or contact data in chain payloads.
- Integrity: append-only API, atomic operational evidence capture, per-event commitments, previous digest linkage.
- Availability: operations survive RPC failures because outbox work is durable; verification outages are warnings.
- Consistency: optimistic incident versions, transaction locks on audit chain head and worker signing, session refresh compare-and-swap.
- Usability: responsive views, role-aware navigation, named inputs, error and empty states, keyboard focus indicators.
- Reproducibility: locked npm dependencies, migration, seed, pinned Solidity compiler, test reports and demonstration guide.
- Maintainability: TypeScript modules separate routing, security, auditing, verification and workers. Direct Prisma access in routes is an intentional capstone simplification; separate repository/controller layers are unnecessary pass-through abstractions at this scale.

## Acceptance evidence
The execution results in `testing/` record actual validation. Real database and local-chain integration is required; a passing TypeScript build alone does not establish workflow correctness. Larger volumes, distributed rate limiting, third-party delivery and independent chain governance remain production work.
