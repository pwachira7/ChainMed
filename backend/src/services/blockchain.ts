import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { env } from "../config/index.js";
export const registryAbi = [
  "function anchor(bytes32 eventId,bytes32 digest)",
  "function setWriter(address writer,bool authorized)",
  "function get(bytes32 eventId) view returns(bytes32 digest,uint256 timestamp)",
  "function count() view returns(uint256)",
  "function eventAt(uint256 index) view returns(bytes32)",
  "event Anchored(bytes32 indexed eventId,bytes32 digest,address indexed writer)",
];
// A UUID fits losslessly in bytes32 as 16 bytes; zeros pad the remaining bytes.
export const chainId = (id: string) =>
  "0x" + id.replaceAll("-", "").padEnd(64, "0");
export const fromChainId = (value: string) => {
  const s = value.slice(2, 34);
  return [
    s.slice(0, 8),
    s.slice(8, 12),
    s.slice(12, 16),
    s.slice(16, 20),
    s.slice(20),
  ].join("-");
};
export class Chain {
  provider: JsonRpcProvider;
  registry: Contract;
  constructor(write = false) {
    if (!env.CONTRACT_ADDRESS)
      throw new Error("CONTRACT_ADDRESS not configured");
    this.provider = new JsonRpcProvider(env.RPC_URL, env.CHAIN_ID, {
      staticNetwork: true,
      cacheTimeout: -1,
    });
    if (write && !env.BLOCKCHAIN_PRIVATE_KEY)
      throw new Error("Blockchain signer not configured");
    this.registry = new Contract(
      env.CONTRACT_ADDRESS,
      registryAbi,
      write
        ? new Wallet(env.BLOCKCHAIN_PRIVATE_KEY!, this.provider)
        : this.provider,
    );
  }
  async ready() {
    const network = await this.provider.send("eth_chainId", []);
    if (Number(BigInt(network)) !== env.CHAIN_ID)
      throw new Error("Unexpected chain ID");
    if ((await this.provider.getCode(env.CONTRACT_ADDRESS!)) === "0x")
      throw new Error("Registry contract missing");
  }
  async get(id: string) {
    const [digest, timestamp] = await this.registry.get(chainId(id));
    if (timestamp === 0n)
      return {
        digest: String(digest).slice(2),
        exists: false,
        confirmed: false,
      };
    const logs = await this.registry.queryFilter(
      this.registry.filters.Anchored(chainId(id)),
      0,
      "latest",
    );
    if (!logs[0]) throw new Error("Registry evidence event unavailable");
    const depth =
      (await this.provider.getBlockNumber()) - logs[0].blockNumber + 1;
    return {
      digest: String(digest).slice(2),
      exists: true,
      confirmed: depth >= env.ANCHOR_CONFIRMATIONS,
    };
  }
  async inventory() {
    const count = Number(await this.registry.count());
    const ids: string[] = [];
    for (let start = 0; start < count; start += 100) {
      ids.push(
        ...(await Promise.all(
          Array.from({ length: Math.min(100, count - start) }, (_, j) =>
            this.registry.eventAt(start + j).then(fromChainId),
          ),
        )),
      );
    }
    return ids;
  }
}
