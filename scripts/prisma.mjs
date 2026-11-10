import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
dotenv.config({ path: "../.env" });
const result = spawnSync(
  process.execPath,
  [require.resolve("prisma/build/index.js"), ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
