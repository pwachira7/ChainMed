import { Router } from "express";
import { z } from "zod";
import { db } from "../config/db.js";
import { authenticate, permit, wrap } from "../middleware/auth.js";
import { capture } from "../services/audit.js";
import { permissions } from "../services/permissions.js";
import { HttpError } from "../utils/security.js";
import { publicUser } from "./auth.js";
export const users = Router();
users.use(authenticate, permit("users:manage"));
users.get(
  "/",
  wrap(async (req, res) => {
    res.json({
      data: (await db.user.findMany({ orderBy: { createdAt: "desc" } })).map(
        publicUser,
      ),
    });
  }),
);
users.get("/permissions", (_req, res) => {
  res.json({ data: permissions });
});
users.patch(
  "/:id",
  wrap(async (req, res) => {
    const input = z
      .object({
        role: z.enum(["ADMIN", "STAFF", "AUDITOR", "CITIZEN"]).optional(),
        active: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    if (req.params.id === req.user!.id)
      throw new HttpError(
        400,
        "An administrator cannot change their own role or disable their account",
      );
    const user = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724022)`;
      const old = await tx.user.findUnique({ where: { id: req.params.id } });
      if (!old) throw new HttpError(404, "User not found");
      if ((input.role && input.role !== "STAFF") || input.active === false) {
        const open = await tx.incident.count({
          where: {
            assigneeId: old.id,
            status: { notIn: ["RESOLVED", "CLOSED"] },
          },
        });
        if (open)
          throw new HttpError(
            409,
            "Reassign active incidents before changing staff access",
          );
      }
      const user = await tx.user.update({ where: { id: old.id }, data: input });
      await tx.session.updateMany({
        where: { userId: old.id },
        data: { revokedAt: new Date() },
      });
      await capture(tx, {
        actor: req.user,
        action: "USER_ACCESS_UPDATED",
        resourceType: "User",
        resourceId: old.id,
        requestId: req.requestId,
        metadata: { oldRole: old.role, role: user.role, active: user.active },
      });
      return user;
    });
    res.json({ data: publicUser(user) });
  }),
);
export const staff = Router();
staff.use(authenticate, permit("incident:manage"));
staff.get(
  "/",
  wrap(async (req, res) => {
    res.json({
      data: await db.user.findMany({
        where: { role: "STAFF", active: true },
        select: { id: true, name: true },
      }),
    });
  }),
);
export const notifications = Router();
notifications.use(authenticate);
notifications.get(
  "/",
  wrap(async (req, res) => {
    res.json({
      data: await db.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    });
  }),
);
notifications.patch(
  "/:id",
  wrap(async (req, res) => {
    const changed = await db.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { readAt: new Date() },
    });
    if (!changed.count) throw new HttpError(404, "Notification not found");
    res.json({ data: { ok: true } });
  }),
);
