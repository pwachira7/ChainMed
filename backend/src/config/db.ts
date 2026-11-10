import { createRequire } from "node:module";
import type { PrismaClient as PrismaClientType } from "@prisma/client";

// Prisma's generated client is CommonJS. Loading it through require keeps this
// working under Node's ESM runtime on Azure, where named CJS imports are not
// always detected from Prisma's generated re-export.
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client") as {
  PrismaClient: typeof PrismaClientType;
};

export const db = new PrismaClient();
