import dotenv from "dotenv";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
dotenv.config();
process.env.NODE_ENV = "test";
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set(
  "schema",
  JSON.parse(fs.readFileSync(".local/test-deployment.json", "utf8")).schema,
);
process.env.DATABASE_URL = url.toString();
process.env.CONTRACT_ADDRESS = JSON.parse(
  fs.readFileSync(".local/test-deployment.json", "utf8"),
).address;
const { HDNodeWallet } = await import("ethers");
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const {
  HARDHAT_NETWORK_MNEMONIC,
} = require("hardhat/internal/core/config/default-config");
process.env.BLOCKCHAIN_PRIVATE_KEY = HDNodeWallet.fromPhrase(
  HARDHAT_NETWORK_MNEMONIC,
  undefined,
  "m/44'/60'/0'/0/1",
).privateKey;
const { db } = await import("../../backend/src/config/db.js");
const { capture } = await import("../../backend/src/services/audit.js");
const { anchorOnce } = await import("../../backend/src/workers/anchor.js");
const { verifyEvent } =
  await import("../../backend/src/services/verification.js");
const { Chain } = await import("../../backend/src/services/blockchain.js");
const results = [];
const chain = new Chain();
await chain.ready();
const elapsed = async (fn: () => Promise<unknown>) => {
  const start = performance.now();
  await fn();
  return performance.now() - start;
};
for (const volume of [10, 50, 100]) {
  const baseline = [];
  const audit = [];
  const ids: string[] = [];
  for (let i = 0; i < volume; i++) {
    baseline.push(
      await elapsed(() => db.$transaction((tx) => tx.$queryRaw`SELECT 1`)),
    );
    audit.push(
      await elapsed(async () => {
        ids.push(
          await db.$transaction((tx) =>
            capture(tx, {
              action: "PERFORMANCE_FIXTURE",
              resourceType: "Benchmark",
              resourceId: randomUUID(),
            }),
          ),
        );
      }),
    );
  }
  const anchoring = await elapsed(async () => {
    for (
      let i = 0;
      i < 100 &&
      (await db.blockchainAnchor.count({
        where: { eventId: { in: ids }, status: { not: "CONFIRMED" } },
      }));
      i++
    ) {
      await anchorOnce();
    }
  });
  const confirmed = await db.blockchainAnchor.count({
    where: { eventId: { in: ids }, status: "CONFIRMED" },
  });
  if (confirmed !== volume)
    throw new Error("Anchoring failed; no performance success reported");
  const verification = await elapsed(async () => {
    for (const id of ids) {
      if ((await verifyEvent(id, chain)).result !== "VERIFIED")
        throw new Error("Verification failed");
    }
  });
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  results.push({
    volume,
    baselineTransactionMeanMs: avg(baseline),
    auditTransactionMeanMs: avg(audit),
    incrementalAuditMeanMs: avg(audit) - avg(baseline),
    anchorQueueDurationMs: anchoring,
    anchorMeanMs: anchoring / volume,
    verificationDurationMs: verification,
    verificationMeanMs: verification / volume,
  });
}
const latencies = [];
for (let i = 0; i < 20; i++)
  latencies.push(
    await elapsed(async () => {
      const response = await fetch("http://localhost:4000/api/health");
      if (!response.ok) throw new Error("Health unavailable");
    }),
  );
fs.writeFileSync(
  "docs/testing/performance-results.json",
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      node: process.version,
      environment:
        "Local macOS PostgreSQL + Hardhat single node, sequential requests; not production benchmarks",
      method:
        "Baseline SELECT 1 transaction compared with audit+outbox transaction; anchor queue includes all outstanding test-schema jobs; API measurement is health endpoint only",
      healthApiMeanMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      results,
    },
    null,
    2,
  ),
);
console.log(
  "Actual performance measurements saved to docs/testing/performance-results.json",
);
await db.$disconnect();
