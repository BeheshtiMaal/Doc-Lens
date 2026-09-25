import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ClientBase } from "pg";

export type DatabaseClient = Pick<ClientBase, "query">;

export async function migrateDatabase(
  client: DatabaseClient,
  directory = resolve(process.cwd(), "db/migrations"),
) {
  const names = (await readdir(directory)).filter((name) => /^\d+_[\w-]+\.sql$/.test(name)).sort();
  const applied: string[] = [];
  await client.query("SELECT pg_advisory_lock($1)", [4020600]);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const name of names) {
      const sql = await readFile(resolve(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE name = $1", [name],
      );
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration ${name} has changed. Add a new migration instead.`);
        }
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum],
        );
        await client.query("COMMIT");
        applied.push(name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [4020600]);
  }
}
