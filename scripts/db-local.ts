import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The embedded database is for local development only. Use PostgreSQL in production.");
  }
  const dataDirectory = resolve(process.cwd(), ".local/postgres");
  await mkdir(dataDirectory, { recursive: true });
  const database = new PGlite(dataDirectory, { extensions: { vector } });
  const server = new PGLiteSocketServer({
    db: database, host: "127.0.0.1", port: 5432, maxConnections: 20,
  });
  try {
    await server.start();
  } catch (error) {
    await server.stop();
    await database.close();
    throw error;
  }
  console.log("Local PostgreSQL with pgvector is listening on 127.0.0.1:5432.");
  console.log("Development fallback only. Press Ctrl+C to stop; data persists in .local/postgres.");
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await server.stop();
    await database.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Local database failed to start.");
  process.exitCode = 1;
});
