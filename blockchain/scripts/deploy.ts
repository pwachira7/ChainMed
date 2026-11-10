import { ethers } from "hardhat";
import fs from "node:fs";
async function main() {
  const registry = await (
    await ethers.getContractFactory("ChainMedAuditRegistry")
  ).deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const network = await ethers.provider.getNetwork();
  fs.writeFileSync(
    "deployment.json",
    JSON.stringify(
      {
        address,
        chainId: Number(network.chainId),
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("ChainMedAuditRegistry deployed:", address);
  console.log(
    "Set CONTRACT_ADDRESS=" +
      address +
      " in the root .env. Set BLOCKCHAIN_PRIVATE_KEY to the authorized local signer shown by hardhat node.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
