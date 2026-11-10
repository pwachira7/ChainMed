import fs from "node:fs";
import { createRequire } from "node:module";
import { HDNodeWallet } from "ethers";
const require = createRequire(import.meta.url);
const env = fs.readFileSync(".env", "utf8");
if (!/^NODE_ENV=development$/m.test(env) || !/^CHAIN_ID=31337$/m.test(env))
  throw new Error("Only local development chain permitted");
const {
  HARDHAT_NETWORK_MNEMONIC,
} = require("hardhat/internal/core/config/default-config");
const deployment = JSON.parse(
  fs.readFileSync("blockchain/deployment.json", "utf8"),
);
if (deployment.chainId !== 31337) throw new Error("Unexpected chain");
const updated = env
  .replace(/^CONTRACT_ADDRESS=.*$/m, "CONTRACT_ADDRESS=" + deployment.address)
  .replace(
    /^BLOCKCHAIN_PRIVATE_KEY=.*$/m,
    "BLOCKCHAIN_PRIVATE_KEY=" +
      HDNodeWallet.fromPhrase(HARDHAT_NETWORK_MNEMONIC).privateKey,
  );
fs.writeFileSync(".env", updated, { mode: 0o600 });
console.log(
  "Configured .env for disposable Hardhat chain 31337. Never fund this publicly known development signer.",
);
