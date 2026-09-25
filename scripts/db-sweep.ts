import { Client } from "pg";
import { sweepExpiredWorkspaces } from "../src/lib/workspaces/repository";
import { loadDatabaseConfig } from "./database-config";

async function main() {
  const client = new Client({ connectionString: loadDatabaseConfig().DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    let deleted = 0;
    while (true) {
      const batch = await sweepExpiredWorkspaces(client, 100);
      deleted += batch;
      if (batch < 100) break;
    }
    console.log(`Removed ${deleted} expired workspace(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Workspace cleanup failed.");
  process.exitCode = 1;
});
