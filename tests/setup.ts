import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";
export default async function setup() {
  dotenv.config();
  const url = new URL(process.env.DATABASE_URL!);
  const schema = "chainmed_test_" + randomUUID().replaceAll("-", "");
  url.searchParams.set("schema", schema);
  const result = spawnSync(
    process.execPath,
    ["../scripts/prisma.mjs", "migrate", "deploy"],
    {
      cwd: "backend",
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) throw new Error(result.stderr + result.stdout);
  // A dedicated registry prevents test-schema events appearing as deleted demo records.
  const artifact = JSON.parse(
    fs.readFileSync(
      "blockchain/artifacts/contracts/ChainMedAuditRegistry.sol/ChainMedAuditRegistry.json",
      "utf8",
    ),
  );
  const provider = new JsonRpcProvider(process.env.RPC_URL, 31337, {
    cacheTimeout: -1,
  });
  const signer = await provider.getSigner(1);
  const registry = await new ContractFactory(
    artifact.abi,
    artifact.bytecode,
    signer,
  ).deploy();
  await registry.waitForDeployment();
  fs.mkdirSync(".local", { recursive: true });
  fs.writeFileSync(
    ".local/test-deployment.json",
    JSON.stringify({ address: await registry.getAddress(), schema }),
  );
}
