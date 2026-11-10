import fs from "node:fs";
const deployment = JSON.parse(
  fs.readFileSync(".local/test-deployment.json", "utf8"),
);
process.env.CONTRACT_ADDRESS = deployment.address;
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", deployment.schema);
process.env.DATABASE_URL = url.toString();

import { HDNodeWallet } from "ethers";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  HARDHAT_NETWORK_MNEMONIC,
} = require("hardhat/internal/core/config/default-config");
if (process.env.CHAIN_ID !== "31337")
  throw new Error("Tests require disposable chain 31337");
process.env.BLOCKCHAIN_PRIVATE_KEY = HDNodeWallet.fromPhrase(
  HARDHAT_NETWORK_MNEMONIC,
  undefined,
  "m/44'/60'/0'/0/1",
).privateKey;
