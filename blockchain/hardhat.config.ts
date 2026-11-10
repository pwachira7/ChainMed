import "@nomicfoundation/hardhat-ethers";
import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
// Pin npm solc so compilation does not require a separate compiler download.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ solcVersion }, _hre, runSuper) =>
    solcVersion === "0.8.28"
      ? {
          compilerPath: require.resolve("solc/soljson.js"),
          isSolcJs: true,
          version: solcVersion,
          longVersion: require("solc").version(),
        }
      : runSuper(),
);
const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    localhost: {
      url: process.env.RPC_URL ?? "http://127.0.0.1:8545",
      chainId: 31337,
      ...(process.env.BLOCKCHAIN_PRIVATE_KEY
        ? { accounts: [process.env.BLOCKCHAIN_PRIVATE_KEY] }
        : {}),
    },
  },
};
export default config;
