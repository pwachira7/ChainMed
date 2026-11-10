import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { env } from "../config/index.js";
import { allowed } from "../services/permissions.js";
import { capture } from "../services/audit.js";
import { HttpError } from "../utils/security.js";
import type { Role } from "@prisma/client";
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role; sessionId: string };
      requestId: string;
      denialCaptured?: boolean;
    }
  }
}
export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token) throw new HttpError(401, "Sign in required");
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "chainmed",
        audience: "chainmed-web",
      }) as jwt.JwtPayload;
    } catch {
      throw new HttpError(401, "Session expired");
    }
    const session = await db.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      !session.user.active
    )
      throw new HttpError(401, "Session expired");
    req.user = {
      id: session.userId,
      role: session.user.role,
      sessionId: session.id,
    };
    next();
  } catch (e) {
    next(e);
  }
};
export const permit =
  (permission: string): RequestHandler =>
  async (req, res, next) => {
    try {
      if (!req.user) throw new HttpError(401, "Sign in required");
      if (!allowed(req.user.role, permission)) {
        await db.$transaction((tx) =>
          capture(tx, {
            actor: req.user,
            action: "ACCESS_DENIED",
            resourceType: "Endpoint",
            resourceId: req.baseUrl + req.path,
            outcome: "DENIED",
            requestId: req.requestId,
            metadata: { permission },
          }),
        );
        req.denialCaptured = true;
        throw new HttpError(403, "Permission denied");
      }
      next();
    } catch (e) {
      next(e);
    }
  };
export const wrap =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
export function originCheck(req: import("express").Request) {
  if (req.headers.origin !== env.WEB_ORIGIN)
    throw new HttpError(403, "Trusted Origin header required");
}
