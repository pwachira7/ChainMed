import fs from "node:fs";
import { randomBytes } from "node:crypto";
if (fs.existsSync(".env")) {
  console.log(".env exists; left unchanged");
  process.exit(0);
}
const password = randomBytes(20).toString("hex");
const env = fs
  .readFileSync(".env.example", "utf8")
  .replaceAll("CHANGE_ME", password)
  .replace(
    "REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS",
    randomBytes(48).toString("hex"),
  )
  .replace(
    "SEED_PASSWORD=",
    "SEED_PASSWORD=" + randomBytes(16).toString("base64url"),
  );
fs.writeFileSync(".env", env, { mode: 0o600 });
console.log(
  "Created .env with random development secrets. Read SEED_PASSWORD locally for demo sign-in.",
);
