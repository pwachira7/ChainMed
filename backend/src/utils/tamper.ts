import { env } from "../config/index.js";
import { db } from "../config/db.js";
import { capture } from "../services/audit.js";
if (env.NODE_ENV !== "development" || process.env.ALLOW_DEMO_TAMPER !== "true")
  throw new Error(
    "Requires NODE_ENV=development and ALLOW_DEMO_TAMPER=true. Never enable in production.",
  );
const [mode, id] = process.argv.slice(2);
if (!["create", "modify", "delete"].includes(mode))
  throw new Error(
    "Usage: npm run tamper -w backend -- create | modify EVENT_ID | delete EVENT_ID",
  );
if (mode === "create") {
  const id = await db.$transaction((tx) =>
    capture(tx, {
      action: "TAMPER_DEMO_FIXTURE",
      resourceType: "DemoFixture",
      resourceId: "isolated-fictional-test",
      metadata: { demo: true },
    }),
  );
  console.log(
    "Fixture created:",
    id,
    "Wait for anchoring before modifying or deleting.",
  );
} else {
  const event = await db.auditEvent.findUniqueOrThrow({ where: { id } });
  if (event.action !== "TAMPER_DEMO_FIXTURE")
    throw new Error("Only isolated TAMPER_DEMO_FIXTURE records may be changed");
  const anchor = await db.blockchainAnchor.findUnique({
    where: { eventId: id },
  });
  if (anchor?.status !== "CONFIRMED")
    throw new Error("Anchor must be confirmed first");
  if (mode === "modify")
    await db.auditEvent.update({
      where: { id },
      data: { outcome: "DELIBERATELY_MODIFIED" },
    });
  else await db.auditEvent.delete({ where: { id } });
  console.log(
    "Test fixture",
    mode,
    "completed. Run full inventory verification.",
  );
}
await db.$disconnect();
