import { Router } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";
import { db } from "../config/db.js";
import { authenticate, permit, wrap } from "../middleware/auth.js";
import { capture } from "../services/audit.js";
import { verifyBatch } from "../services/verification.js";
import { Chain } from "../services/blockchain.js";
import { HttpError } from "../utils/security.js";
import { pageSchema } from "./incidents.js";
export const audit = Router();
audit.use(authenticate, permit("audit:read"));
function filters(query: Record<string, unknown>): Prisma.AuditEventWhereInput {
  const input = z
    .object({
      q: z.string().max(100).optional(),
      role: z.string().max(20).optional(),
      action: z.string().max(80).optional(),
      actorId: z.string().max(100).optional(),
      resourceType: z.string().max(80).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    })
    .parse(query);
  return {
    ...(input.q
      ? {
          OR: [
            { id: { contains: input.q } },
            { action: { contains: input.q, mode: "insensitive" } },
            { resourceId: { contains: input.q } },
          ],
        }
      : {}),
    ...(input.role ? { actorRole: input.role } : {}),
    ...(input.action ? { action: input.action } : {}),
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.resourceType ? { resourceType: input.resourceType } : {}),
    ...(input.from || input.to
      ? {
          timestamp: {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lte: new Date(input.to) } : {}),
          },
        }
      : {}),
  };
}
audit.get(
  "/summary",
  wrap(async (req, res) => {
    const [events, confirmed, pending, failed, alerts, latestRun] =
      await Promise.all([
        db.auditEvent.count(),
        db.blockchainAnchor.count({ where: { status: "CONFIRMED" } }),
        db.blockchainAnchor.count({
          where: { status: { in: ["PENDING", "SUBMITTED"] } },
        }),
        db.blockchainAnchor.count({ where: { status: "FAILED" } }),
        db.integrityVerificationFinding.count({
          where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
        }),
        db.integrityVerificationRun.findFirst({
          orderBy: { startedAt: "desc" },
        }),
      ]);
    res.json({
      data: { events, confirmed, pending, failed, alerts, latestRun },
    });
  }),
);
audit.get(
  "/",
  wrap(async (req, res) => {
    const { page, limit } = pageSchema.parse(req.query);
    let where = filters(req.query);
    const integrity = z
      .enum([
        "VERIFIED",
        "HASH_MISMATCH",
        "MISSING_BLOCKCHAIN_ANCHOR",
        "PENDING_CONFIRMATION",
        "MISSING_OFF_CHAIN_RECORD",
        "VERIFICATION_ERROR",
      ])
      .optional()
      .parse(req.query.integrity);
    if (integrity) {
      const runs = await db.integrityVerificationRun.findMany({
        where: { completedAt: { not: null } },
        orderBy: { startedAt: "desc" },
        take: 100,
      });
      const latest = new Map<string, string>();
      for (const run of runs)
        for (const r of (run.results ?? []) as {
          eventId: string;
          result: string;
        }[])
          if (!latest.has(r.eventId)) latest.set(r.eventId, r.result);
      where = {
        AND: [
          where,
          {
            id: {
              in: [...latest]
                .filter(([, v]) => v === integrity)
                .map(([k]) => k),
            },
          },
        ],
      };
    }
    const sort = z
      .enum(["newest", "oldest"])
      .default("newest")
      .parse(req.query.sort);
    const [events, total] = await Promise.all([
      db.auditEvent.findMany({
        where,
        orderBy: { timestamp: sort === "newest" ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditEvent.count({ where }),
    ]);
    const recentRuns = await db.integrityVerificationRun.findMany({
      where: { completedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
    const verification = new Map<string, string>();
    for (const run of recentRuns)
      for (const result of (run.results ?? []) as {
        eventId: string;
        result: string;
      }[])
        if (!verification.has(result.eventId))
          verification.set(result.eventId, result.result);
    const anchors = await db.blockchainAnchor.findMany({
      where: { eventId: { in: events.map((e) => e.id) } },
    });
    const findings = await db.integrityVerificationFinding.findMany({
      where: { eventId: { in: events.map((e) => e.id) } },
      orderBy: { detectedAt: "desc" },
    });
    res.json({
      data: events.map((e) => ({
        ...e,
        integrity: verification.get(e.id) ?? "NOT_CHECKED",
        anchor: anchors.find((a) => a.eventId === e.id) ?? null,
        finding: findings.find((f) => f.eventId === e.id) ?? null,
      })),
      pagination: { page, limit, total },
    });
  }),
);
audit.post(
  "/verify",
  permit("audit:verify"),
  wrap(async (req, res) => {
    const { ids } = z
      .object({ ids: z.array(z.string().uuid()).min(1).max(100).optional() })
      .strict()
      .parse(req.body);
    res.json({ data: await verifyBatch(req.user, ids) });
  }),
);
audit.get(
  "/reports/:format",
  permit("report:read"),
  wrap(async (req, res) => {
    const format = z.enum(["csv", "pdf"]).parse(req.params.format);
    const events = await db.auditEvent.findMany({
      where: filters(req.query),
      orderBy: { timestamp: "desc" },
      take: 5000,
    });
    await db.$transaction((tx) =>
      capture(tx, {
        actor: req.user,
        action: "REPORT_EXPORTED",
        resourceType: "AuditReport",
        resourceId: req.requestId,
        requestId: req.requestId,
        metadata: { format, count: events.length },
      }),
    );
    const rows = events.map((e) => [
      e.id,
      e.timestamp.toISOString(),
      e.actorRole,
      e.action,
      e.resourceType,
      e.resourceId,
      e.outcome,
      e.digest,
    ]);
    const headers = [
      "Event ID",
      "Timestamp",
      "Role",
      "Action",
      "Resource",
      "Resource ID",
      "Outcome",
      "SHA-256",
    ];
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="chainmed-audit.${format}"`,
    );
    if (format === "csv") {
      const csv = (value: string) =>
        '"' + value.replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
      res
        .type("text/csv")
        .send(
          [headers, ...rows].map((row) => row.map(csv).join(",")).join("\r\n"),
        );
    } else {
      res.type("application/pdf");
      const doc = new PDFDocument({ margin: 40 });
      doc.pipe(res);
      doc.fontSize(20).text("ChainMed | Audit evidence report");
      doc
        .fontSize(10)
        .text(
          `Generated ${new Date().toISOString()} | ${events.length} events | Maximum 5000 per export`,
        );
      doc.moveDown();
      for (const row of rows) {
        if (doc.y > 680) doc.addPage();
        doc
          .fontSize(9)
          .text(`${row[1]} • ${row[2]} • ${row[3]}`)
          .text(`Event ${row[0]} | ${row[6]}`)
          .text(`SHA-256 ${row[7]}`)
          .moveDown();
      }
      doc.end();
    }
  }),
);
audit.get(
  "/:id",
  wrap(async (req, res) => {
    const event = await db.auditEvent.findUnique({
      where: { id: req.params.id },
    });
    if (!event) throw new HttpError(404, "Audit event not found");
    let commitment: unknown;
    try {
      const chain = new Chain();
      await chain.ready();
      commitment = await chain.get(event.id);
    } catch {
      commitment = { error: "Blockchain unavailable; retry later" };
    }
    const [anchor, findings] = await Promise.all([
      db.blockchainAnchor.findUnique({ where: { eventId: event.id } }),
      db.integrityVerificationFinding.findMany({
        where: { eventId: event.id },
        orderBy: { detectedAt: "desc" },
      }),
    ]);
    const runs = await db.integrityVerificationRun.findMany({
      where: { completedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
    const verificationHistory = runs.flatMap((run) =>
      (
        (run.results ?? []) as {
          eventId: string;
          result: string;
          detail: string;
        }[]
      )
        .filter((result) => result.eventId === event.id)
        .map((result) => ({
          ...result,
          runId: run.id,
          checkedAt: run.completedAt,
        })),
    );
    res.json({
      data: { ...event, anchor, commitment, findings, verificationHistory },
    });
  }),
);
export const findings = Router();
findings.use(authenticate, permit("audit:read"));
findings.get(
  "/",
  wrap(async (req, res) => {
    const { page, limit } = pageSchema.parse(req.query);
    const status = z
      .enum(["OPEN", "ACKNOWLEDGED", "CLOSED", "FALSE_ALARM"])
      .optional()
      .parse(req.query.status);
    const where = status ? { status } : {};
    const [data, total] = await Promise.all([
      db.integrityVerificationFinding.findMany({
        where,
        orderBy: { detectedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.integrityVerificationFinding.count({ where }),
    ]);
    res.json({ data, pagination: { page, limit, total } });
  }),
);
findings.patch(
  "/:id",
  permit("finding:manage"),
  wrap(async (req, res) => {
    const input = z
      .object({
        status: z.enum(["ACKNOWLEDGED", "CLOSED", "FALSE_ALARM"]),
        note: z.string().trim().min(10).max(3000),
      })
      .strict()
      .parse(req.body);
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724021)`;
      const f = await tx.integrityVerificationFinding.findUnique({
        where: { id: req.params.id },
      });
      if (!f) throw new HttpError(404, "Finding not found");
      if (["CLOSED", "FALSE_ALARM"].includes(f.status))
        throw new HttpError(409, "Investigation is already closed");
      const notes = Array.isArray(f.notes) ? f.notes : [];
      const updated = await tx.integrityVerificationFinding.update({
        where: { id: f.id },
        data: {
          status: input.status,
          notes: [
            ...notes,
            {
              actorId: req.user!.id,
              timestamp: new Date().toISOString(),
              text: input.note,
              status: input.status,
            },
          ],
        },
      });
      await capture(tx, {
        actor: req.user,
        action: "INVESTIGATION_UPDATED",
        resourceType: "Finding",
        resourceId: f.id,
        requestId: req.requestId,
        metadata: { status: input.status },
      });
      return updated;
    });
    res.json({ data: result });
  }),
);
