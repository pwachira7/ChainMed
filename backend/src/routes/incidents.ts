import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "../config/db.js";
import { authenticate, permit, wrap } from "../middleware/auth.js";
import { capture } from "../services/audit.js";
import { canReadIncident, transitions } from "../services/permissions.js";
import { canonical, HttpError, sha256 } from "../utils/security.js";
import type { Prisma, IncidentStatus } from "@prisma/client";
export const incidents = Router();
incidents.use(authenticate);
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(100).optional(),
});
const inputSchema = z
  .object({
    category: z.enum([
      "Medical emergency",
      "Safety concern",
      "Care assistance",
      "Welfare check",
      "Other",
    ]),
    description: z.string().trim().min(10).max(5000),
    location: z.string().trim().min(3).max(200),
    contact: z.string().trim().max(100).optional(),
    urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  })
  .strict();
incidents.get(
  "/",
  permit("incident:read"),
  wrap(async (req, res) => {
    const { page, limit, q } = pageSchema.parse(req.query);
    const status = z
      .enum([
        "SUBMITTED",
        "UNDER_REVIEW",
        "ASSIGNED",
        "IN_PROGRESS",
        "RESOLVED",
        "CLOSED",
      ])
      .optional()
      .parse(req.query.status);
    const where: Prisma.IncidentWhereInput = {
      ...(req.user!.role === "CITIZEN"
        ? { reporterId: req.user!.id }
        : req.user!.role === "STAFF"
          ? { assigneeId: req.user!.id }
          : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { reference: { contains: q, mode: "insensitive" } },
              { location: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const sort = z
      .enum(["newest", "oldest"])
      .default("newest")
      .parse(req.query.sort);
    const [data, total] = await Promise.all([
      db.incident.findMany({
        where,
        orderBy: { createdAt: sort === "newest" ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { assignee: { select: { id: true, name: true } } },
      }),
      db.incident.count({ where }),
    ]);
    res.json({ data, pagination: { page, limit, total } });
  }),
);
incidents.post(
  "/",
  permit("incident:create"),
  wrap(async (req, res) => {
    const input = inputSchema.parse(req.body);
    const key = z.string().uuid().parse(req.headers["idempotency-key"]);
    const requestHash = sha256(canonical(input));
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user!.id + key})::bigint)`;
      const old = await tx.idempotencyKey.findUnique({
        where: { key: req.user!.id + ":" + key },
      });
      if (old) {
        if (old.requestHash !== requestHash)
          throw new HttpError(
            409,
            "Idempotency key reused with different input",
          );
        return tx.incident.findUniqueOrThrow({ where: { id: old.resourceId } });
      }
      const incident = await tx.incident.create({
        data: {
          ...input,
          reference:
            "CM-" +
            new Date().getUTCFullYear() +
            "-" +
            randomUUID().slice(0, 8).toUpperCase(),
          reporterId: req.user!.id,
          history: { create: { toStatus: "SUBMITTED", actorId: req.user!.id } },
        },
      });
      await tx.idempotencyKey.create({
        data: {
          key: req.user!.id + ":" + key,
          userId: req.user!.id,
          requestHash,
          resourceId: incident.id,
        },
      });
      await capture(tx, {
        actor: req.user,
        action: "INCIDENT_CREATED",
        resourceType: "Incident",
        resourceId: incident.id,
        requestId: req.requestId,
        metadata: { reference: incident.reference, urgency: incident.urgency },
      });
      return incident;
    });
    res.status(201).json({ data: result });
  }),
);
incidents.get(
  "/:id",
  permit("incident:read"),
  wrap(async (req, res) => {
    const incident = await db.incident.findUnique({
      where: { id: req.params.id },
      include: {
        assignee: { select: { id: true, name: true } },
        history: { orderBy: { createdAt: "asc" } },
        assignments: { orderBy: { createdAt: "asc" } },
        notes: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { name: true } } },
        },
      },
    });
    if (!incident) throw new HttpError(404, "Incident not found");
    if (!canReadIncident(req.user!, incident)) {
      await db.$transaction((tx) =>
        capture(tx, {
          actor: req.user,
          action: "ACCESS_DENIED",
          resourceType: "Incident",
          resourceId: incident.id,
          outcome: "DENIED",
          requestId: req.requestId,
        }),
      );
      req.denialCaptured = true;
      throw new HttpError(404, "Incident not found");
    }
    res.json({
      data:
        req.user!.role === "CITIZEN"
          ? { ...incident, notes: [], assignments: [] }
          : incident,
    });
  }),
);
incidents.patch(
  "/:id",
  permit("incident:manage"),
  wrap(async (req, res) => {
    const input = z
      .object({
        version: z.number().int().min(0),
        status: z
          .enum([
            "SUBMITTED",
            "UNDER_REVIEW",
            "ASSIGNED",
            "IN_PROGRESS",
            "RESOLVED",
            "CLOSED",
          ])
          .optional(),
        assigneeId: z.string().uuid().optional(),
        urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
      })
      .strict()
      .parse(req.body);
    const result = await db.$transaction(async (tx) => {
      const incident = await tx.incident.findUnique({
        where: { id: req.params.id },
      });
      if (!incident || !canReadIncident(req.user!, incident))
        throw new HttpError(404, "Incident not found");
      if (input.assigneeId && req.user!.role !== "ADMIN")
        throw new HttpError(403, "Only administrators assign staff");
      if (input.assigneeId) {
        const staff = await tx.user.findFirst({
          where: { id: input.assigneeId, role: "STAFF", active: true },
        });
        if (!staff) throw new HttpError(400, "Select active care staff");
        if (
          !["UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS"].includes(incident.status)
        )
          throw new HttpError(400, "Review incident before assignment");
      }
      const next =
        input.status ??
        (input.assigneeId && incident.status === "UNDER_REVIEW"
          ? "ASSIGNED"
          : incident.status);
      if (
        next !== incident.status &&
        !transitions[incident.status].includes(next)
      )
        throw new HttpError(400, "Invalid incident status transition");
      if (next === "ASSIGNED" && !input.assigneeId && !incident.assigneeId)
        throw new HttpError(400, "Assign responsible staff first");
      const changed = await tx.incident.updateMany({
        where: { id: incident.id, version: input.version },
        data: {
          status: next as IncidentStatus,
          ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
          ...(input.urgency ? { urgency: input.urgency } : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new HttpError(409, "Incident changed; reload before updating");
      if (next !== incident.status)
        await tx.incidentStatusHistory.create({
          data: {
            incidentId: incident.id,
            fromStatus: incident.status,
            toStatus: next,
            actorId: req.user!.id,
          },
        });
      if (input.assigneeId)
        await tx.incidentAssignment.create({
          data: {
            incidentId: incident.id,
            staffId: input.assigneeId,
            assignedBy: req.user!.id,
          },
        });
      await capture(tx, {
        actor: req.user,
        action: input.assigneeId ? "INCIDENT_ASSIGNED" : "INCIDENT_UPDATED",
        resourceType: "Incident",
        resourceId: incident.id,
        requestId: req.requestId,
        metadata: {
          from: incident.status,
          to: next,
          assigneeId: input.assigneeId ?? incident.assigneeId,
          urgency: input.urgency ?? incident.urgency,
        },
      });
      return tx.incident.findUniqueOrThrow({ where: { id: incident.id } });
    });
    res.json({ data: result });
  }),
);
incidents.post(
  "/:id/notes",
  permit("incident:manage"),
  wrap(async (req, res) => {
    const { text } = z
      .object({ text: z.string().trim().min(3).max(3000) })
      .strict()
      .parse(req.body);
    const result = await db.$transaction(async (tx) => {
      const i = await tx.incident.findUnique({ where: { id: req.params.id } });
      if (!i || !canReadIncident(req.user!, i))
        throw new HttpError(404, "Incident not found");
      const note = await tx.operationalNote.create({
        data: { incidentId: i.id, authorId: req.user!.id, text },
      });
      await capture(tx, {
        actor: req.user,
        action: "NOTE_ADDED",
        resourceType: "Incident",
        resourceId: i.id,
        requestId: req.requestId,
        metadata: { noteId: note.id },
      });
      return note;
    });
    res.status(201).json({ data: result });
  }),
);
