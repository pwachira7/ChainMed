# REST API reference

Base URL `http://localhost:4000/api`. JSON success: `{data: ...}`; paginated success additionally has `{pagination:{page,limit,total}}`. Errors: `{error:{message,requestId,details?}}`. IDs are UUIDs unless specified. Send `Authorization: Bearer ACCESS_TOKEN` on protected endpoints. Interactive documentation is at `/api/docs`; `/api/openapi.json` enumerates routes. Curl examples use local shell variables, not embedded credentials.

## Authentication

| Method / path | Body / behavior |
| --- | --- |
| POST /auth/register | `{name,email,password}`; password 12–128 chars; strict citizen-only registration; 201 |
| POST /auth/login | `{email,password}`; returns `{user,accessToken}` and HTTP-only refresh cookie |
| POST /auth/refresh | `{}` with refresh cookie and exact `Origin: WEB_ORIGIN`; rotates cookie and returns access token |
| POST /auth/logout | `{}`; bearer + trusted Origin; revokes current session and clears cookie |
| GET /auth/me | Current public account fields |
| PATCH /auth/profile | `{name}` only |
| POST /auth/password | `{currentPassword,newPassword}`; revokes all sessions |
| POST /auth/forgot-password | `{email}`; development delivery token only; production 503 until delivery configured |
| POST /auth/reset-password | `{token,newPassword}`; consumes token and revokes sessions |

Public user fields are `id,email,name,role,active`. Password hashes, session hashes and reset token hashes are never returned. Refresh expiry is seven days; access expiry fifteen minutes; reset expiry fifteen minutes. Cookies are scoped to `/api/auth`.

## Care operations

| Method / path | Authorization / input |
| --- | --- |
| GET /incidents | Citizen own, staff assigned, admin all; `page`, `limit` (1–100), `q`, `status`, `sort=newest/oldest` |
| POST /incidents | Citizen/admin; required UUID `Idempotency-Key` header; body below |
| GET /incidents/{id} | Same scope; includes timeline; citizens receive no internal notes/assignment history |
| PATCH /incidents/{id} | Admin/assigned staff; `{version,status?,assigneeId?,urgency?}` |
| POST /incidents/{id}/notes | Admin/assigned staff; `{text}` (3–3000 chars) |
| GET /staff | Authorized care managers; active staff IDs and names |

Incident body:

```json
{
  "category": "Welfare check",
  "description": "Fictional report requesting a coordinated community welfare response.",
  "location": "Demo Community Hall",
  "urgency": "HIGH",
  "contact": "Optional fictional contact"
}
```

Categories: Medical emergency, Safety concern, Care assistance, Welfare check, Other. Urgency: LOW, MEDIUM, HIGH, CRITICAL. Description 10–5000 chars; location 3–200; optional contact ≤100. Lifecycle: SUBMITTED → UNDER_REVIEW → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED. RESOLVED may reopen to IN_PROGRESS. A responsible active staff member is required before ASSIGNED. Only admin assigns staff. Assignment during UNDER_REVIEW automatically advances to ASSIGNED. Version mismatch returns 409; reload before retrying. A reused idempotency key with different input returns 409; identical retries return the original record.

## Evidence and investigations

| Method / path | Authorization / behavior |
| --- | --- |
| GET /audit | Admin/auditor; searchable paginated audit evidence with outbox state and latest verification |
| GET /audit/summary | Counts events, confirmed, pending, failed and open findings; latest run |
| GET /audit/{id} | Event, canonical payload, digests, chain commitment, receipt, findings and recent verification history |
| POST /audit/verify | `{ids?: UUID[]}` max 100; omitted IDs means full inventory reconciliation |
| GET /audit/reports/csv | Redacted export of up to 5000 filtered stored events |
| GET /audit/reports/pdf | Actual generated PDF; same scope/limit |
| GET /findings | Admin/auditor; `page`, `limit`, optional `status` |
| PATCH /findings/{id} | `{status,note}`; status ACKNOWLEDGED/CLOSED/FALSE_ALARM; justification ≥10 chars |
| GET /notifications | Current recipient's latest 100 notifications |
| PATCH /notifications/{id} | `{}`; mark own notification read |

Audit query filters: `q`, exact `role`, `actorId`, `action`, `resourceType`, ISO UTC `from`, `to`; list also supports `integrity`, `sort`, `page`, `limit`. Export ignores paging and applies the evidence field filters. The UI exposes common filters; actor/resource filtering is also available directly via API. Latest verification lookup is bounded to 100 runs. Findings preserve missing-record IDs even when the audit row cannot be opened.

## Access management

| Method / path | Authorization / input |
| --- | --- |
| GET /users | Admin; public user fields |
| GET /users/permissions | Admin; centralized permission matrix |
| PATCH /users/{id} | Admin; `{role?,active?}`; cannot change self; revokes target sessions |

Removing staff access is blocked while unresolved assignments remain. No role creation, audit mutation or clinical treatment APIs exist.

## Example

```sh
curl http://localhost:4000/api/incidents \
  -H "Authorization: Bearer $CHAINMED_ACCESS_TOKEN"

curl -X POST http://localhost:4000/api/audit/verify \
  -H "Authorization: Bearer $CHAINMED_AUDITOR_TOKEN" \
  -H 'Content-Type: application/json' -d '{}'
```

400 invalid schema/lifecycle, 401 invalid/expired/revoked session, 403 permission/Origin denial, 404 absent or inaccessible incident, 409 idempotency/version/access-state conflict, 429 request limit, 503 missing production reset delivery or unavailable health dependency. Unexpected failures return generic 500 messages with a correlation ID.
