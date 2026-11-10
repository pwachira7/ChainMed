import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { canonical, sha256 } from "../utils/security.js";
export type Actor = { id: string; role: string };
export type AuditInput = {
  actor?: Actor;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome?: string;
  requestId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};
export function auditPayload(event: {
  id: string;
  timestamp: Date;
  actorId: string | null;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: string;
  requestId: string;
  metadata: unknown;
  previousDigest: string | null;
}) {
  return {
    id: event.id,
    timestamp: event.timestamp.toISOString(),
    actorId: event.actorId,
    actorRole: event.actorRole,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    outcome: event.outcome,
    requestId: event.requestId,
    metadata: event.metadata,
    previousDigest: event.previousDigest,
  };
}
export async function capture(tx: Prisma.TransactionClient, input: AuditInput) {
  // Serialize chain-head selection across all application instances.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(724019)`;
  const previous = await tx.auditEvent.findFirst({
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
  });
  const timestamp = new Date(
    Math.max(Date.now(), (previous?.timestamp.getTime() ?? 0) + 1),
  );
  const event = {
    id: randomUUID(),
    timestamp,
    actorId: input.actor?.id ?? null,
    actorRole: input.actor?.role ?? "ANONYMOUS",
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: input.outcome ?? "SUCCESS",
    requestId: input.requestId ?? randomUUID(),
    metadata: input.metadata ?? {},
    previousDigest: previous?.digest ?? null,
  };
  const canonicalPayload = canonical(auditPayload(event));
  const digest = sha256(canonicalPayload);
  await tx.auditEvent.create({ data: { ...event, canonicalPayload, digest } });
  await tx.blockchainAnchor.create({ data: { eventId: event.id, digest } });
  return event.id;
}
