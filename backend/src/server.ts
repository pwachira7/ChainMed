import { app, log } from "./app.js";
import { env } from "./config/index.js";
import { db } from "./config/db.js";
const server = app.listen(env.PORT, env.HOST, () =>
  log.info(`ChainMed API listening on http://localhost:${env.PORT}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    }),
  );
