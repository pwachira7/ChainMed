import { createHash, randomBytes } from "node:crypto";
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const opaqueToken = () => randomBytes(32).toString("hex");
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
      .join(",") +
    "}"
  );
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
