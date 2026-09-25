import "server-only";

import { Pool } from "pg";
import pgvector from "pgvector/pg";
import { getServerConfig } from "@/lib/server/env";

const databaseGlobal = globalThis as typeof globalThis & { doclensPool?: Pool };

export function getDatabase() {
  if (!databaseGlobal.doclensPool) {
    databaseGlobal.doclensPool = new Pool({
      connectionString: getServerConfig().DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    databaseGlobal.doclensPool.on("error", () => {
      // Pool connection errors must not log a URL, credentials, or document data.
      console.error("An idle database connection failed.");
    });
  }
  return databaseGlobal.doclensPool;
}

export async function getVectorClient() {
  const client = await getDatabase().connect();
  try {
    await pgvector.registerTypes(client);
    return client;
  } catch (error) {
    client.release();
    throw error;
  }
}
