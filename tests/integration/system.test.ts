import { beforeAll, afterAll, describe, it, expect } from "vitest";
import supertest from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { app } from "../../backend/src/app.js";
import { db } from "../../backend/src/config/db.js";
import { capture } from "../../backend/src/services/audit.js";
import { anchorOnce } from "../../backend/src/workers/anchor.js";
import { Chain } from "../../backend/src/services/blockchain.js";
import {
  verifyBatch,
  verifyEvent,
} from "../../backend/src/services/verification.js";
const api = supertest(app);
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
let incidentId: string;
const password = "Local-test-" + randomUUID();
const suffix = randomUUID().slice(0, 8);
async function login(role: string) {
  const response = await api
    .post("/api/auth/login")
    .send({ email: role.toLowerCase() + suffix + "@test.example", password });
  expect(response.status).toBe(200);
  tokens[role] = response.body.data.accessToken;
  return response;
}
const auth = (role: string) => ({ Authorization: "Bearer " + tokens[role] });
beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("chainmed_test"))
    throw new Error("Refusing to test outside isolated schema");
  const hash = await bcrypt.hash(password, 12);
  for (const role of ["ADMIN", "STAFF", "AUDITOR", "CITIZEN"] as const) {
    const u = await db.user.create({
      data: {
        email: role.toLowerCase() + suffix + "@test.example",
        name: "Fictional " + role,
        passwordHash: hash,
        role,
      },
    });
    ids[role] = u.id;
    await login(role);
  }
});
afterAll(async () => {
  await db.$disconnect();
});
describe.sequential("real PostgreSQL API and local Ethereum workflow", () => {
  it("requires authentication and rejects role escalation on registration", async () => {
    expect((await api.get("/api/incidents")).status).toBe(401);
    expect(
      (
        await api.post("/api/auth/register").send({
          email: "attack@test.example",
          name: "Test",
          password,
          role: "ADMIN",
        })
      ).status,
    ).toBe(400);
  });
  it("creates one incident across concurrent identical idempotency requests and captures evidence", async () => {
    const input = {
      category: "Welfare check",
      location: "Fictional Demo Hall",
      description: "A fictional citizen requests a community welfare check.",
      urgency: "HIGH",
    };
    const key = randomUUID();
    const responses = await Promise.all(
      [1, 2].map(() =>
        api
          .post("/api/incidents")
          .set(auth("CITIZEN"))
          .set("Idempotency-Key", key)
          .send(input),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].body.data.id).toBe(responses[1].body.data.id);
    incidentId = responses[0].body.data.id;
    expect(
      await db.auditEvent.count({
        where: { resourceId: incidentId, action: "INCIDENT_CREATED" },
      }),
    ).toBe(1);
    expect(
      (
        await api
          .post("/api/incidents")
          .set(auth("CITIZEN"))
          .set("Idempotency-Key", key)
          .send({ ...input, urgency: "LOW" })
      ).status,
    ).toBe(409);
  });
  it("denies cross-user and unassigned staff access and audits denials", async () => {
    expect(
      (await api.get("/api/incidents/" + incidentId).set(auth("STAFF"))).status,
    ).toBe(404);
    const other = await db.user.create({
      data: {
        email: "other" + suffix + "@test.example",
        name: "Other citizen",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    const r = await api
      .post("/api/auth/login")
      .send({ email: other.email, password });
    expect(
      (
        await api
          .get("/api/incidents/" + incidentId)
          .set("Authorization", "Bearer " + r.body.data.accessToken)
      ).status,
    ).toBe(404);
    expect((await api.get("/api/audit").set(auth("CITIZEN"))).status).toBe(403);
    expect(
      await db.auditEvent.count({
        where: { action: "ACCESS_DENIED", resourceId: incidentId },
      }),
    ).toBe(2);
  });
  it("enforces lifecycle, assignment, stale-version protection and staff notes", async () => {
    expect(
      (
        await api
          .patch("/api/incidents/" + incidentId)
          .set(auth("ADMIN"))
          .send({ version: 0, status: "CLOSED" })
      ).status,
    ).toBe(400);
    expect(
      (
        await api
          .patch("/api/incidents/" + incidentId)
          .set(auth("ADMIN"))
          .send({ version: 0, status: "UNDER_REVIEW" })
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .patch("/api/incidents/" + incidentId)
          .set(auth("ADMIN"))
          .send({ version: 0, urgency: "LOW" })
      ).status,
    ).toBe(409);
    expect(
      (
        await api
          .patch("/api/incidents/" + incidentId)
          .set(auth("ADMIN"))
          .send({ version: 1, assigneeId: ids.STAFF })
      ).status,
    ).toBe(200);
    const staffRead = await api
      .get("/api/incidents/" + incidentId)
      .set(auth("STAFF"));
    expect(staffRead.status).toBe(200);
    expect(staffRead.body.data.status).toBe("ASSIGNED");
    expect(
      (
        await api
          .post("/api/incidents/" + incidentId + "/notes")
          .set(auth("STAFF"))
          .send({ text: "Fictional response team contacted." })
      ).status,
    ).toBe(201);
    expect(
      (
        await api
          .patch("/api/incidents/" + incidentId)
          .set(auth("STAFF"))
          .send({ version: 2, status: "IN_PROGRESS" })
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .patch("/api/incidents/" + incidentId)
          .set(auth("AUDITOR"))
          .send({ version: 3, status: "RESOLVED" })
      ).status,
    ).toBe(403);
    const citizen = await api
      .get("/api/incidents/" + incidentId)
      .set(auth("CITIZEN"));
    expect(citizen.body.data.notes).toEqual([]);
  });
  it("rolls back business and outbox changes when the transaction fails", async () => {
    const before = await db.auditEvent.count();
    const outbox = await db.blockchainAnchor.count();
    await expect(
      db.$transaction(async (tx) => {
        await capture(tx, {
          action: "ROLLBACK_TEST",
          resourceType: "Test",
          resourceId: randomUUID(),
        });
        throw new Error("forced");
      }),
    ).rejects.toThrow("forced");
    expect(await db.auditEvent.count()).toBe(before);
    expect(await db.blockchainAnchor.count()).toBe(outbox);
  });
  it("anchors real hashes and verifies against the deployed registry", async () => {
    for (
      let n = 0;
      n < 12 &&
      (await db.blockchainAnchor.count({
        where: { status: { not: "CONFIRMED" } },
      }));
      n++
    )
      await anchorOnce();
    const event = await db.auditEvent.findFirstOrThrow({
      where: { resourceId: incidentId, action: "INCIDENT_CREATED" },
    });
    const anchor = await db.blockchainAnchor.findUniqueOrThrow({
      where: { eventId: event.id },
    });
    expect(anchor.status).toBe("CONFIRMED");
    expect(anchor.transactionHash).toMatch(/^0x/);
    const chain = new Chain();
    await chain.ready();
    expect((await verifyEvent(event.id, chain)).result).toBe("VERIFIED");
  });
  it("detects changed and deleted records, creates findings and notifies auditors", async () => {
    const modified = await db.$transaction((tx) =>
      capture(tx, {
        action: "TAMPER_DEMO_FIXTURE",
        resourceType: "Demo",
        resourceId: "modified",
      }),
    );
    const deleted = await db.$transaction((tx) =>
      capture(tx, {
        action: "TAMPER_DEMO_FIXTURE",
        resourceType: "Demo",
        resourceId: "deleted",
      }),
    );
    await anchorOnce();
    await db.auditEvent.update({
      where: { id: modified },
      data: { outcome: "TAMPERED" },
    });
    await db.auditEvent.delete({ where: { id: deleted } });
    const run = await verifyBatch({ id: ids.AUDITOR, role: "AUDITOR" });
    expect(run.results.find((r) => r.eventId === modified)?.result).toBe(
      "HASH_MISMATCH",
    );
    expect(run.results.find((r) => r.eventId === deleted)?.result).toBe(
      "MISSING_OFF_CHAIN_RECORD",
    );
    const f = await db.integrityVerificationFinding.findFirstOrThrow({
      where: { eventId: modified },
    });
    expect(
      await db.notification.count({
        where: { userId: ids.AUDITOR, findingId: f.id },
      }),
    ).toBe(1);
    expect(
      (
        await api
          .patch("/api/findings/" + f.id)
          .set(auth("AUDITOR"))
          .send({
            status: "ACKNOWLEDGED",
            note: "Evidence preserved for demonstration investigation.",
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .patch("/api/findings/" + f.id)
          .set(auth("AUDITOR"))
          .send({
            status: "CLOSED",
            note: "Controlled tamper exercise confirmed; isolated fixture retained.",
          })
      ).status,
    ).toBe(200);
  });
  it("distinguishes outages, absent anchors and pending confirmations", async () => {
    const id = await db.$transaction((tx) =>
      capture(tx, {
        action: "PENDING_TEST",
        resourceType: "Test",
        resourceId: "test",
      }),
    );
    const chain = new Chain();
    expect((await verifyEvent(id, chain)).result).toBe("PENDING_CONFIRMATION");
    const broken = {
      ready: async () => {},
      inventory: async () => [],
      get: async () => {
        throw new Error("RPC down");
      },
    };
    expect((await verifyEvent(id, broken)).result).toBe("VERIFICATION_ERROR");
    const offlineRun = await verifyBatch(
      { id: ids.AUDITOR, role: "AUDITOR" },
      [id],
      broken,
    );
    expect(offlineRun.results[0].result).toBe("VERIFICATION_ERROR");
    await db.blockchainAnchor.update({
      where: { eventId: id },
      data: { status: "CONFIRMED" },
    });
    expect((await verifyEvent(id, chain)).result).toBe(
      "MISSING_BLOCKCHAIN_ANCHOR",
    );
    await db.blockchainAnchor.update({
      where: { eventId: id },
      data: { status: "PENDING" },
    });
  });
  it("exports actual redacted CSV/PDF evidence and prevents audit mutations", async () => {
    const csv = await api.get("/api/audit/reports/csv").set(auth("AUDITOR"));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("INCIDENT_CREATED");
    expect(csv.text).not.toContain(password);
    const pdf = await api.get("/api/audit/reports/pdf").set(auth("AUDITOR"));
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(
      (await api.delete("/api/audit/" + randomUUID()).set(auth("ADMIN")))
        .status,
    ).toBe(404);
  });
  it("rotates refresh tokens, checks Origin, and revokes sessions on logout", async () => {
    const response = await login("CITIZEN");
    const cookie = response.headers["set-cookie"][0].split(";")[0];
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(
      (await api.post("/api/auth/refresh").set("Cookie", cookie).send({}))
        .status,
    ).toBe(403);
    const refreshed = await api
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .set("Origin", process.env.WEB_ORIGIN!)
      .send({});
    expect(refreshed.status).toBe(200);
    expect(
      (
        await api
          .post("/api/auth/refresh")
          .set("Cookie", cookie)
          .set("Origin", process.env.WEB_ORIGIN!)
          .send({})
      ).status,
    ).toBe(401);
    expect(
      (
        await api
          .post("/api/auth/logout")
          .set("Authorization", "Bearer " + refreshed.body.data.accessToken)
          .set("Origin", process.env.WEB_ORIGIN!)
          .send({})
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .get("/api/auth/me")
          .set("Authorization", "Bearer " + refreshed.body.data.accessToken)
      ).status,
    ).toBe(401);
  });
  it("retains failed submissions, retries authorization failures, and recovers existing receipts idempotently", async () => {
    for (
      let n = 0;
      n < 20 &&
      (await db.blockchainAnchor.count({
        where: { status: { not: "CONFIRMED" } },
      }));
      n++
    )
      await anchorOnce();
    const chain = new Chain(true);
    await (
      await chain.registry.setWriter(
        await (chain.registry.runner as import("ethers").Wallet).getAddress(),
        false,
      )
    ).wait();
    const id = await db.$transaction((tx) =>
      capture(tx, {
        action: "WORKER_RETRY_FIXTURE",
        resourceType: "Test",
        resourceId: randomUUID(),
      }),
    );
    try {
      await anchorOnce();
      const failed = await db.blockchainAnchor.findUniqueOrThrow({
        where: { eventId: id },
      });
      expect(failed.status).toBe("FAILED");
      expect(failed.lastError).toContain("writer only");
    } finally {
      await (
        await chain.registry.setWriter(
          await (chain.registry.runner as import("ethers").Wallet).getAddress(),
          true,
        )
      ).wait();
    }
    await db.blockchainAnchor.update({
      where: { eventId: id },
      data: { nextAttemptAt: new Date(0) },
    });
    await anchorOnce();
    expect(
      (await db.blockchainAnchor.findUniqueOrThrow({ where: { eventId: id } }))
        .status,
    ).toBe("CONFIRMED");
    const count = await chain.registry.count();
    await db.blockchainAnchor.update({
      where: { eventId: id },
      data: {
        status: "PENDING",
        transactionHash: null,
        confirmedAt: null,
        nextAttemptAt: new Date(0),
      },
    });
    await anchorOnce();
    expect(await chain.registry.count()).toBe(count);
    expect(
      (await db.blockchainAnchor.findUniqueOrThrow({ where: { eventId: id } }))
        .transactionHash,
    ).toMatch(/^0x/);
    const pendingReader = {
      ready: async () => {},
      inventory: async () => [id],
      get: async () => ({ ...(await chain.get(id)), confirmed: false }),
    };
    expect((await verifyEvent(id, pendingReader)).result).toBe(
      "PENDING_CONFIRMATION",
    );
  });
  it("changes account roles, revokes old sessions and prevents self-demotion", async () => {
    expect(
      (
        await api
          .patch("/api/users/" + ids.ADMIN)
          .set(auth("ADMIN"))
          .send({ role: "CITIZEN" })
      ).status,
    ).toBe(400);
    expect(
      (
        await api
          .patch("/api/users/" + ids.STAFF)
          .set(auth("ADMIN"))
          .send({ role: "CITIZEN" })
      ).status,
    ).toBe(409);
    expect(
      (
        await api
          .patch("/api/users/" + ids.AUDITOR)
          .set(auth("STAFF"))
          .send({ role: "ADMIN" })
      ).status,
    ).toBe(403);
    expect(
      (
        await api
          .patch("/api/users/" + ids.AUDITOR)
          .set(auth("ADMIN"))
          .send({ role: "CITIZEN" })
      ).status,
    ).toBe(200);
    expect((await api.get("/api/audit").set(auth("AUDITOR"))).status).toBe(401);
  });
  it("registers a citizen, updates a profile and consumes password reset only once", async () => {
    const email = "reset" + suffix + "@test.example";
    const registered = await api
      .post("/api/auth/register")
      .send({ name: "Reset Fictional", email, password });
    expect(registered.status).toBe(201);
    expect(registered.body.data.role).toBe("CITIZEN");
    const login = await api.post("/api/auth/login").send({ email, password });
    const bearer = { Authorization: "Bearer " + login.body.data.accessToken };
    expect(
      (
        await api
          .patch("/api/auth/profile")
          .set(bearer)
          .send({ name: "Updated Fictional" })
      ).body.data.name,
    ).toBe("Updated Fictional");
    const { opaqueToken, sha256 } =
      await import("../../backend/src/utils/security.js");
    const token = opaqueToken();
    await db.passwordReset.create({
      data: {
        userId: registered.body.data.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const newPassword = "Changed-" + randomUUID();
    expect(
      (await api.post("/api/auth/reset-password").send({ token, newPassword }))
        .status,
    ).toBe(200);
    expect(
      (await api.post("/api/auth/reset-password").send({ token, newPassword }))
        .status,
    ).toBe(400);
    expect((await api.get("/api/auth/me").set(bearer)).status).toBe(401);
    expect(
      (await api.post("/api/auth/login").send({ email, password: newPassword }))
        .status,
    ).toBe(200);
  });
});
