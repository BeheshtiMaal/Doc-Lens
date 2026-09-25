import { Client } from "pg";
import { migrateDatabase } from "../src/lib/database/migrations";
import { loadDatabaseConfig } from "./database-config";

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED || loadDatabaseConfig().DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const applied = await migrateDatabase(client);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database migrations are up to date.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database migration failed.");
  process.exitCode = 1;
});
