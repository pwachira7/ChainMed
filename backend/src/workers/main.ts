import { env } from "../config/index.js";
import { db } from "../config/db.js";
import { anchorOnce } from "./anchor.js";
import { verifyBatch } from "../services/verification.js";
import pino from "pino";
const log = pino();
let stopping = false;
let lastVerify = 0;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
while (!stopping) {
  try {
    await anchorOnce();
  } catch (error) {
    log.error(
      { error: (error as Error).message },
      "Anchoring unavailable; durable queue retained",
    );
  }
  if (Date.now() - lastVerify > env.VERIFY_INTERVAL_MS) {
    try {
      await verifyBatch();
    } catch (error) {
      log.error(
        { error: (error as Error).message },
        "Scheduled verification failed",
      );
    }
    lastVerify = Date.now();
  }
  await new Promise((resolve) => setTimeout(resolve, env.WORKER_INTERVAL_MS));
}
await db.$disconnect();
