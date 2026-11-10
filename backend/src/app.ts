import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { ZodError } from "zod";
import type { Prisma as PrismaTypes } from "@prisma/client";
const require = createRequire(import.meta.url);
const { Prisma } = require("@prisma/client") as {
  Prisma: typeof PrismaTypes;
};
import pino from "pino";
import path from "node:path";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/index.js";
import { db } from "./config/db.js";
import { auth } from "./routes/auth.js";
import { incidents } from "./routes/incidents.js";
import { audit, findings } from "./routes/audit.js";
import { users, staff, notifications } from "./routes/admin.js";
import { HttpError } from "./utils/security.js";
import { capture } from "./services/audit.js";
import { openapi } from "./openapi.js";
export const log = pino();
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
app.get("/api/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ data: { status: "ok", database: "connected" } });
  } catch {
    res.status(503).json({ error: { message: "Database unavailable" } });
  }
});
app.get("/api/openapi.json", (_req, res) => {
  res.json(openapi);
});
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));
app.use("/api/auth", auth);
app.use("/api/incidents", incidents);
app.use("/api/audit", audit);
app.use("/api/findings", findings);
app.use("/api/users", users);
app.use("/api/staff", staff);
app.use("/api/notifications", notifications);
if (env.NODE_ENV === "production") {
  const frontendPath = path.resolve(process.cwd(), "frontend", "dist");
  app.use(express.static(frontendPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}
app.use((_req, _res, next) => next(new HttpError(404, "Endpoint not found")));
app.use(
  async (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          message: "Invalid input",
          details: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
          requestId: req.requestId,
        },
      });
      return;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        error: {
          message: "This record already exists",
          requestId: req.requestId,
        },
      });
      return;
    }
    const status =
      error instanceof HttpError
        ? error.status
        : 400 === (error as any)?.status
          ? 400
          : 500;
    if (
      req.user &&
      !req.denialCaptured &&
      (status === 403 ||
        (status === 404 && req.originalUrl.startsWith("/api/incidents/")))
    ) {
      try {
        await db.$transaction((tx) =>
          capture(tx, {
            actor: req.user,
            action: "ACCESS_DENIED",
            resourceType: "Endpoint",
            resourceId: req.originalUrl.split("?")[0],
            outcome: "DENIED",
            requestId: req.requestId,
            metadata: { method: req.method },
          }),
        );
      } catch {
        log.error(
          { requestId: req.requestId },
          "Denied-action audit capture failed",
        );
      }
    }
    if (status === 500)
      log.error(
        {
          requestId: req.requestId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Request failed",
      );
    res.status(status).json({
      error: {
        message:
          status === 500
            ? "Unexpected server error"
            : error instanceof Error
              ? error.message
              : "Invalid request",
        requestId: req.requestId,
      },
    });
  },
);
