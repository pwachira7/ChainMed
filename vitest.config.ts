import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
dotenv.config();
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", "chainmed_test");
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 120000,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (x): x is [string, string] => typeof x[1] === "string",
        ),
      ),
      NODE_ENV: "test",
      DATABASE_URL: url.toString(),
    },
    globalSetup: ["./tests/setup.ts"],
    setupFiles: ["./tests/env.ts"],
    reporters: ["default", "json"],
    outputFile: { json: "docs/testing/vitest-results.json" },
  },
});
