import { db } from "../config/db.js";
import { canonical, sha256 } from "../utils/security.js";
import { auditPayload, capture, type Actor } from "./audit.js";
import { Chain } from "./blockchain.js";
export type Result =
  | "VERIFIED"
  | "HASH_MISMATCH"
  | "MISSING_BLOCKCHAIN_ANCHOR"
  | "PENDING_CONFIRMATION"
  | "MISSING_OFF_CHAIN_RECORD"
  | "VERIFICATION_ERROR";
export interface ChainReader {
  ready(): Promise<void>;
  get(
    id: string,
  ): Promise<{ exists: boolean; digest: string; confirmed?: boolean }>;
  inventory(): Promise<string[]>;
}
export async function verifyEvent(
  id: string,
  chain: ChainReader,
): Promise<{ eventId: string; result: Result; detail: string }> {
  try {
    const [event, anchor, commitment] = await Promise.all([
      db.auditEvent.findUnique({ where: { id } }),
      db.blockchainAnchor.findUnique({ where: { eventId: id } }),
      chain.get(id),
    ]);
    if (!event)
      return {
        eventId: id,
        result: "MISSING_OFF_CHAIN_RECORD",
        detail:
          "Expected event is absent from PostgreSQL. Preserve chain and database evidence.",
      };
    const payload = canonical(auditPayload(event));
    const digest = sha256(payload);
    if (
      digest !== event.digest ||
      payload !== event.canonicalPayload ||
      (commitment.exists && commitment.digest !== digest)
    )
      return {
        eventId: id,
        result: "HASH_MISMATCH",
        detail:
          "Reconstructed record, stored digest, canonical payload or chain commitment differ. Preserve evidence and investigate privileged writes.",
      };
    if (!commitment.exists)
      return {
        eventId: id,
        result:
          anchor && anchor.status !== "CONFIRMED"
            ? "PENDING_CONFIRMATION"
            : "MISSING_BLOCKCHAIN_ANCHOR",
        detail:
          anchor && anchor.status !== "CONFIRMED"
            ? "Anchoring is queued or retrying; this is not proof of tampering."
            : "No registry commitment exists for a record expected to be anchored.",
      };
    if (anchor?.status !== "CONFIRMED" || commitment.confirmed === false)
      return {
        eventId: id,
        result: "PENDING_CONFIRMATION",
        detail:
          "Registry commitment exists; worker has not confirmed the configured depth.",
      };
    return {
      eventId: id,
      result: "VERIFIED",
      detail:
        "Canonical SHA-256 digest matches the stored record and confirmed registry commitment.",
    };
  } catch {
    return {
      eventId: id,
      result: "VERIFICATION_ERROR",
      detail:
        "Verification infrastructure unavailable. Retry after checking RPC and database connectivity; no tampering conclusion.",
    };
  }
}
export async function verifyBatch(
  actor?: Actor,
  ids?: string[],
  reader?: ChainReader,
) {
  const run = await db.integrityVerificationRun.create({
    data: { requestedBy: actor?.id },
  });
  let results: Awaited<ReturnType<typeof verifyEvent>>[] = [];
  try {
    const chain = reader ?? new Chain();
    await chain.ready();
    const inventory = ids ?? [
      ...new Set([
        ...(await db.auditEvent.findMany({ select: { id: true } })).map(
          (e) => e.id,
        ),
        ...(
          await db.blockchainAnchor.findMany({ select: { eventId: true } })
        ).map((a) => a.eventId),
        ...(await chain.inventory()),
      ]),
    ];
    for (const id of inventory) results.push(await verifyEvent(id, chain));
  } catch {
    results = [
      {
        eventId: "infrastructure",
        result: "VERIFICATION_ERROR",
        detail: "Registry unavailable; no integrity conclusion was reached.",
      },
    ];
  }
  await db.$transaction(async (tx) => {
    // Serialize deduplication of open findings.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(724021)`;
    for (const result of results) {
      if (["VERIFIED", "PENDING_CONFIRMATION"].includes(result.result))
        continue;
      const exists = await tx.integrityVerificationFinding.findFirst({
        where: {
          eventId: result.eventId,
          result: result.result,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
      });
      if (exists) continue;
      const finding = await tx.integrityVerificationFinding.create({
        data: {
          runId: run.id,
          eventId: result.eventId,
          result: result.result,
          severity: result.result === "VERIFICATION_ERROR" ? "WARNING" : "HIGH",
          detail: result.detail,
        },
      });
      const users = await tx.user.findMany({
        where: { active: true, role: { in: ["ADMIN", "AUDITOR"] } },
        select: { id: true },
      });
      await tx.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          findingId: finding.id,
          title:
            result.result === "VERIFICATION_ERROR"
              ? "Verification service needs attention"
              : "Audit integrity finding: " + result.result,
        })),
      });
    }
    await tx.integrityVerificationRun.update({
      where: { id: run.id },
      data: { completedAt: new Date(), results },
    });
    await capture(tx, {
      actor,
      action: "INTEGRITY_VERIFICATION",
      resourceType: "VerificationRun",
      resourceId: run.id,
      metadata: {
        checked: results.length,
        issues: results.filter(
          (r) => !["VERIFIED", "PENDING_CONFIRMATION"].includes(r.result),
        ).length,
      },
    });
  });
  return { id: run.id, results };
}
