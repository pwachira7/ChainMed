import "../src/config/index.js";
import { db } from "../src/config/db.js";
import bcrypt from "bcryptjs";
import { capture } from "../src/services/audit.js";
import type { Role } from "@prisma/client";
if (process.env.NODE_ENV === "production")
  throw new Error("Demo seed is forbidden in production");
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error("Set SEED_PASSWORD to at least 12 characters in .env");
const hash = await bcrypt.hash(password, 12);
const people: [string, string, Role][] = [
  ["admin", "Alex Morgan", "ADMIN"],
  ["staff", "Jamie Okello", "STAFF"],
  ["auditor", "Sam Njoroge", "AUDITOR"],
  ["citizen", "Taylor Mwangi", "CITIZEN"],
];
for (const [slug, name, role] of people) {
  await db.user.upsert({
    where: { email: slug + "@chainmed.demo" },
    update: {},
    create: { email: slug + "@chainmed.demo", name, role, passwordHash: hash },
  });
}
const citizen = await db.user.findUniqueOrThrow({
  where: { email: "citizen@chainmed.demo" },
});
const admin = await db.user.findUniqueOrThrow({
  where: { email: "admin@chainmed.demo" },
});
for (const [index, category, location, urgency] of [
  [1, "Welfare check", "Demo North Community Centre", "MEDIUM"],
  [2, "Care assistance", "Fictional Riverside Hub", "LOW"],
  [3, "Safety concern", "Demo East Care Station", "HIGH"],
] as const) {
  const reference = "CM-DEMO-00" + index;
  if (!(await db.incident.findUnique({ where: { reference } })))
    await db.$transaction(async (tx) => {
      const i = await tx.incident.create({
        data: {
          reference,
          reporterId: citizen.id,
          category,
          location,
          urgency,
          description:
            "Fictional demonstration report. Community members request a coordinated care response.",
          history: { create: { toStatus: "SUBMITTED", actorId: citizen.id } },
        },
      });
      await capture(tx, {
        actor: admin,
        action: "DEMO_INCIDENT_SEEDED",
        resourceType: "Incident",
        resourceId: i.id,
        metadata: { fictional: true },
      });
    });
}
console.log(
  "Demo accounts created: admin, staff, auditor, citizen @chainmed.demo. Password is SEED_PASSWORD from your local .env.",
);
await db.$disconnect();
