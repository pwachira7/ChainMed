import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { db } from "../config/db.js";
import { env } from "../config/index.js";
import { capture } from "../services/audit.js";
import { authenticate, originCheck, wrap } from "../middleware/auth.js";
import { HttpError, opaqueToken, sha256 } from "../utils/security.js";
import type { Response } from "express";
export const auth = Router();
const password = z.string().min(12).max(128);
const identity = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
});
const cookie = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: 7 * 86400000,
};
function access(user: { id: string }, sessionId: string) {
  return jwt.sign({ sid: sessionId }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: "15m",
    issuer: "chainmed",
    audience: "chainmed-web",
    algorithm: "HS256",
  });
}
export const publicUser = (u: {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
}) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  active: u.active,
});
auth.use(
  rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
auth.post(
  "/register",
  wrap(async (req, res) => {
    const input = identity
      .extend({ name: z.string().trim().min(2).max(80), password })
      .strict()
      .parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      await capture(tx, {
        actor: user,
        action: "ACCOUNT_REGISTERED",
        resourceType: "User",
        resourceId: user.id,
        requestId: req.requestId,
      });
      return user;
    });
    res.status(201).json({ data: publicUser(user) });
  }),
);
auth.post(
  "/login",
  wrap(async (req, res) => {
    const input = identity.parse(req.body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    const valid = await bcrypt.compare(
      input.password,
      user?.passwordHash ??
        "$2b$12$KIXxQSYle4bCFMNdT5rjyuF7kTuZR5h4F6uoqw3q0AykK8xKjYpWq",
    );
    if (!user || !valid || !user.active) {
      await db.$transaction((tx) =>
        capture(tx, {
          action: "LOGIN_FAILED",
          resourceType: "Authentication",
          resourceId: "login",
          outcome: "FAILURE",
          requestId: req.requestId,
        }),
      );
      throw new HttpError(401, "Invalid credentials");
    }
    const token = opaqueToken();
    const session = await db.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      await capture(tx, {
        actor: user,
        action: "LOGIN_SUCCESS",
        resourceType: "Session",
        resourceId: session.id,
        requestId: req.requestId,
      });
      return session;
    });
    res.cookie("refresh", token, cookie).json({
      data: { user: publicUser(user), accessToken: access(user, session.id) },
    });
  }),
);
auth.post(
  "/refresh",
  wrap(async (req, res) => {
    originCheck(req);
    const token = req.cookies.refresh;
    if (typeof token !== "string") throw new HttpError(401, "Session expired");
    const fresh = opaqueToken();
    const session = await db.$transaction(async (tx) => {
      const old = await tx.session.findUnique({
        where: { tokenHash: sha256(token) },
        include: { user: true },
      });
      if (
        !old ||
        old.revokedAt ||
        old.expiresAt < new Date() ||
        !old.user.active
      )
        throw new HttpError(401, "Session expired");
      const changed = await tx.session.updateMany({
        where: { id: old.id, revokedAt: null, tokenHash: sha256(token) },
        data: { tokenHash: sha256(fresh) },
      });
      if (changed.count !== 1)
        throw new HttpError(401, "Session already rotated");
      return old;
    });
    res.cookie("refresh", fresh, cookie).json({
      data: {
        user: publicUser(session.user),
        accessToken: access(session.user, session.id),
      },
    });
  }),
);
auth.post(
  "/logout",
  authenticate,
  wrap(async (req, res) => {
    originCheck(req);
    await db.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: req.user!.sessionId },
        data: { revokedAt: new Date() },
      });
      await capture(tx, {
        actor: req.user,
        action: "LOGOUT",
        resourceType: "Session",
        resourceId: req.user!.sessionId,
        requestId: req.requestId,
      });
    });
    res
      .clearCookie("refresh", { path: cookie.path })
      .json({ data: { ok: true } });
  }),
);
auth.get(
  "/me",
  authenticate,
  wrap(async (req, res) => {
    res.json({
      data: publicUser(
        await db.user.findUniqueOrThrow({ where: { id: req.user!.id } }),
      ),
    });
  }),
);
auth.patch(
  "/profile",
  authenticate,
  wrap(async (req, res) => {
    const input = z
      .object({ name: z.string().trim().min(2).max(80) })
      .strict()
      .parse(req.body);
    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: req.user!.id },
        data: input,
      });
      await capture(tx, {
        actor: req.user,
        action: "PROFILE_UPDATED",
        resourceType: "User",
        resourceId: u.id,
        requestId: req.requestId,
      });
      return u;
    });
    res.json({ data: publicUser(user) });
  }),
);
auth.post(
  "/password",
  authenticate,
  wrap(async (req, res) => {
    const input = z
      .object({ currentPassword: z.string().max(128), newPassword: password })
      .parse(req.body);
    const user = await db.user.findUniqueOrThrow({
      where: { id: req.user!.id },
    });
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash)))
      throw new HttpError(400, "Current password is incorrect");
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() },
      });
      await capture(tx, {
        actor: req.user,
        action: "PASSWORD_CHANGED",
        resourceType: "User",
        resourceId: user.id,
        requestId: req.requestId,
      });
    });
    res
      .clearCookie("refresh", { path: cookie.path })
      .json({ data: { ok: true } });
  }),
);
auth.post(
  "/forgot-password",
  wrap(async (req, res) => {
    const { email } = z
      .object({
        email: z
          .string()
          .email()
          .transform((s) => s.toLowerCase()),
      })
      .parse(req.body);
    if (env.NODE_ENV === "production")
      throw new HttpError(
        503,
        "Password delivery is not configured; contact your administrator",
      );
    const user = await db.user.findUnique({ where: { email } });
    let resetToken: string | undefined;
    if (user) {
      resetToken = opaqueToken();
      await db.$transaction(async (tx) => {
        await tx.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: sha256(resetToken!),
            expiresAt: new Date(Date.now() + 15 * 60000),
          },
        });
        await capture(tx, {
          action: "PASSWORD_RESET_REQUESTED",
          resourceType: "User",
          resourceId: user.id,
          requestId: req.requestId,
        });
      });
    }
    res.json({
      data: {
        message: "If the account exists, a reset was created.",
        ...(env.NODE_ENV === "development"
          ? { developmentResetToken: resetToken }
          : {}),
      },
    });
  }),
);
auth.post(
  "/reset-password",
  wrap(async (req, res) => {
    const input = z
      .object({ token: z.string().length(64), newPassword: password })
      .parse(req.body);
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await db.$transaction(async (tx) => {
      const reset = await tx.passwordReset.findUnique({
        where: { tokenHash: sha256(input.token) },
      });
      if (!reset || reset.usedAt || reset.expiresAt < new Date())
        throw new HttpError(400, "Reset token is invalid or expired");
      const used = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1)
        throw new HttpError(400, "Reset token already used");
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await tx.session.updateMany({
        where: { userId: reset.userId },
        data: { revokedAt: new Date() },
      });
      await tx.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await capture(tx, {
        action: "PASSWORD_RESET",
        resourceType: "User",
        resourceId: reset.userId,
        requestId: req.requestId,
      });
    });
    res.json({ data: { ok: true } });
  }),
);
