import type { DatabaseClient } from "@/lib/database/migrations";
import {
  createWorkspaceCredentials,
  hashWorkspaceToken,
  parseWorkspaceCredentials,
  type WorkspaceCredentials,
} from "@/lib/workspaces/credentials";
import { randomUUID } from "node:crypto";

export class WorkspaceAccessError extends Error {
  constructor() {
    super("Workspace unavailable or expired.");
    this.name = "WorkspaceAccessError";
  }
}

export async function createWorkspace(client: DatabaseClient, ttlSeconds: number) {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60) {
    throw new Error("Workspace TTL must be at least 60 seconds.");
  }
  const credentials = createWorkspaceCredentials();
  const pageGeneration = randomUUID();
  const result = await client.query<{ expires_at: Date }>(
    `INSERT INTO workspaces (id, access_token_hash, page_generation, expires_at)
     VALUES ($1, $2, $3, now() + $4 * interval '1 second')
     RETURNING expires_at`,
    [credentials.workspaceId, hashWorkspaceToken(credentials.accessToken), pageGeneration, ttlSeconds],
  );
  return { ...credentials, pageGeneration, expiresAt: result.rows[0].expires_at };
}

export async function requireWorkspace(client: DatabaseClient, input: WorkspaceCredentials) {
  const credentials = parseWorkspaceCredentials(input);
  if (!credentials) throw new WorkspaceAccessError();
  const result = await client.query<{ id: string; expires_at: Date }>(
    `SELECT id, expires_at FROM workspaces
     WHERE id = $1 AND access_token_hash = $2 AND expires_at > now()
       AND (close_after IS NULL OR close_after > now())`,
    [credentials.workspaceId, hashWorkspaceToken(credentials.accessToken)],
  );
  if (!result.rows.length) throw new WorkspaceAccessError();
  return { id: result.rows[0].id, expiresAt: result.rows[0].expires_at };
}

export async function resumeWorkspace(client: DatabaseClient, input: WorkspaceCredentials, ttlSeconds: number) {
  const credentials = parseWorkspaceCredentials(input);
  if (!credentials) throw new WorkspaceAccessError();
  const pageGeneration = randomUUID();
  const result = await client.query<{ expires_at: Date }>(
    `UPDATE workspaces SET page_generation = $3, close_after = NULL,
        last_seen_at = now(), expires_at = now() + $4 * interval '1 second'
     WHERE id = $1 AND access_token_hash = $2 AND expires_at > now()
       AND (close_after IS NULL OR close_after > now())
     RETURNING expires_at`,
    [credentials.workspaceId, hashWorkspaceToken(credentials.accessToken), pageGeneration, ttlSeconds],
  );
  if (!result.rows.length) throw new WorkspaceAccessError();
  return { pageGeneration, expiresAt: result.rows[0].expires_at };
}

export async function heartbeatWorkspace(
  client: DatabaseClient, input: WorkspaceCredentials, pageGeneration: string, ttlSeconds: number,
) {
  const credentials = parseWorkspaceCredentials(input);
  if (!credentials) throw new WorkspaceAccessError();
  const result = await client.query(
    `UPDATE workspaces SET last_seen_at = now(), expires_at = now() + $4 * interval '1 second'
     WHERE id = $1 AND access_token_hash = $2 AND page_generation = $3
       AND expires_at > now() AND close_after IS NULL`,
    [credentials.workspaceId, hashWorkspaceToken(credentials.accessToken), pageGeneration, ttlSeconds],
  );
  if (!result.rowCount) throw new WorkspaceAccessError();
}

export async function markWorkspaceClosing(
  client: DatabaseClient, input: WorkspaceCredentials, pageGeneration: string, graceSeconds: number,
) {
  const credentials = parseWorkspaceCredentials(input);
  if (!credentials) return;
  await client.query(
    `UPDATE workspaces SET close_after = now() + $4 * interval '1 second'
     WHERE id = $1 AND access_token_hash = $2 AND page_generation = $3 AND expires_at > now()`,
    [credentials.workspaceId, hashWorkspaceToken(credentials.accessToken), pageGeneration, graceSeconds],
  );
}

export async function sweepExpiredWorkspaces(client: DatabaseClient, batchSize = 100) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("Workspace cleanup batch size is invalid.");
  }
  const result = await client.query(
    `DELETE FROM workspaces WHERE id IN (
       SELECT id FROM workspaces WHERE expires_at <= now() OR close_after <= now()
       ORDER BY COALESCE(close_after, expires_at) LIMIT $1 FOR UPDATE SKIP LOCKED
     )`, [batchSize],
  );
  return result.rowCount ?? 0;
}
