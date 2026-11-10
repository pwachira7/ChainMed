import { db } from "../config/db.js";
import { env } from "../config/index.js";
import { Chain, chainId } from "../services/blockchain.js";
export async function anchorOnce() {
  const chain = new Chain(true);
  await chain.ready();
  // A transaction-level lock serializes signer nonce usage across worker processes.
  // The row lease survives crashes; the chain lookup recovers sends whose receipt was lost.
  return db.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(724020) AS locked`;
      if (!locked[0].locked) return 0;
      const rows = await tx.blockchainAnchor.findMany({
        where: {
          status: { not: "CONFIRMED" },
          nextAttemptAt: { lte: new Date() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        orderBy: { createdAt: "asc" },
        take: 10,
      });
      for (const row of rows) {
        await tx.blockchainAnchor.update({
          where: { id: row.id },
          data: {
            leaseUntil: new Date(Date.now() + 60000),
            attempts: { increment: 1 },
          },
        });
        try {
          const commitment = await chain.get(row.eventId);
          if (commitment.exists) {
            if (commitment.digest !== row.digest)
              throw new Error("Existing chain commitment differs from outbox");
            // Recover confirmations from the registry event, including after process restart.
            const logs = await chain.registry.queryFilter(
              chain.registry.filters.Anchored(chainId(row.eventId)),
              0,
              "latest",
            );
            const log = logs[0];
            if (!log) throw new Error("Commitment receipt unavailable");
            const depth =
              (await chain.provider.getBlockNumber()) - log.blockNumber + 1;
            await tx.blockchainAnchor.update({
              where: { id: row.id },
              data: {
                status:
                  depth >= env.ANCHOR_CONFIRMATIONS ? "CONFIRMED" : "SUBMITTED",
                transactionHash: log.transactionHash,
                blockNumber: log.blockNumber,
                confirmedAt:
                  depth >= env.ANCHOR_CONFIRMATIONS ? new Date() : null,
                leaseUntil: null,
                lastError: null,
                nextAttemptAt: new Date(Date.now() + 5000),
              },
            });
            continue;
          }
          const transaction = await chain.registry.anchor(
            chainId(row.eventId),
            "0x" + row.digest,
          );
          await tx.blockchainAnchor.update({
            where: { id: row.id },
            data: { status: "SUBMITTED", transactionHash: transaction.hash },
          });
          const receipt = await transaction.wait(
            env.ANCHOR_CONFIRMATIONS,
            15000,
          );
          if (!receipt || receipt.status !== 1)
            throw new Error("Transaction not confirmed");
          await tx.blockchainAnchor.update({
            where: { id: row.id },
            data: {
              status: "CONFIRMED",
              blockNumber: receipt.blockNumber,
              confirmedAt: new Date(),
              leaseUntil: null,
              lastError: null,
            },
          });
        } catch (error) {
          await tx.blockchainAnchor.update({
            where: { id: row.id },
            data: {
              status: "FAILED",
              leaseUntil: null,
              lastError: (
                (error as { shortMessage?: string }).shortMessage ??
                (error as Error).message
              ).slice(0, 500),
              nextAttemptAt: new Date(
                Date.now() +
                  Math.min(300000, 1000 * 2 ** Math.min(row.attempts + 1, 8)),
              ),
            },
          });
        }
      }
      return rows.length;
    },
    { timeout: 240000, maxWait: 1000 },
  );
}
