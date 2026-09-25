import assert from "node:assert/strict";
import { Client } from "pg";
import pgvector from "pgvector/pg";
import { loadDatabaseConfig } from "./database-config";

async function main() {
  const client = new Client({
    connectionString: loadDatabaseConfig().DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    await pgvector.registerTypes(client);
    const extension = await client.query<{ extversion: string }>(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
    );
    assert.equal(extension.rowCount, 1, "Run npm run db:migrate to enable pgvector.");
    const result = await client.query<{ embedding: number[]; distance: number }>(
      "SELECT $1::vector AS embedding, $1::vector <-> $2::vector AS distance",
      [pgvector.toSql([1, 2, 3]), pgvector.toSql([1, 2, 4])],
    );
    assert.deepEqual(result.rows[0].embedding, [1, 2, 3]);
    assert.equal(result.rows[0].distance, 1);
    const schema = await client.query<{ name: string | null }>(
      "SELECT to_regclass('public.workspaces')::text AS name",
    );
    assert.ok(schema.rows[0].name, "Workspace schema is missing. Run npm run db:migrate.");
    console.log(`PostgreSQL connected. pgvector ${extension.rows[0].extversion}, vector round-trip, and workspace schema verified.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database check failed.");
  process.exitCode = 1;
});
