import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
dotenv.config();
if (process.env.NODE_ENV === "production")
  throw new Error("Embedded PostgreSQL is a development tool");
const url = new URL(process.env.DATABASE_URL);
const dir = path.resolve(".local/postgres");
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: (m) => {
    if (String(m).includes("ready")) console.log(m);
  },
});
if (!fs.existsSync(path.join(dir, "PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const name = url.pathname.slice(1);
const exists = await client.query(
  "SELECT 1 FROM pg_database WHERE datname=$1",
  [name],
);
await client.end();
if (!exists.rowCount) await pg.createDatabase(name);
console.log("Local PostgreSQL ready on 127.0.0.1:" + url.port);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
await new Promise(() => {});
