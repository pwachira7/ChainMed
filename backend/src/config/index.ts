import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";
dotenv.config({
  path: path.resolve(
    process.cwd(),
    process.cwd().endsWith("/backend") ? "../.env" : ".env",
  ),
});
export const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(4000),
    HOST: z.string().default("0.0.0.0"),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    RPC_URL: z.string().url().default("http://127.0.0.1:8545"),
    CHAIN_ID: z.coerce.number().default(31337),
    CONTRACT_ADDRESS: z.string().optional(),
    BLOCKCHAIN_PRIVATE_KEY: z.string().optional(),
    ANCHOR_CONFIRMATIONS: z.coerce.number().int().min(1).default(1),
    WORKER_INTERVAL_MS: z.coerce.number().min(100).default(5000),
    VERIFY_INTERVAL_MS: z.coerce.number().min(1000).default(300000),
  })
  .parse(process.env);
if (
  env.NODE_ENV === "production" &&
  (!env.WEB_ORIGIN.startsWith("https://") ||
    /REPLACE|CHANGE_ME/.test(env.JWT_SECRET))
)
  throw new Error("Production requires HTTPS and a random JWT secret");
