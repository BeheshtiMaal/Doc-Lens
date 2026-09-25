import type { PoolClient } from "pg";

export async function deleteFileForWorkspace(client: Pick<PoolClient, "query">, workspaceId: string, fileId: string) {
  await client.query("BEGIN");
  try {
    const owned = await client.query<{ filename: string }>(
      "SELECT filename FROM files WHERE id = $1 AND workspace_id = $2 FOR UPDATE",
      [fileId, workspaceId],
    );
    if (!owned.rowCount) {
      await client.query("ROLLBACK");
      return null;
    }
    const detached = await client.query<{ id: string }>(
      `UPDATE conversations SET file_id = NULL, source_removed_at = now(), updated_at = now()
       WHERE file_id = $1 AND workspace_id = $2 AND source_removed_at IS NULL RETURNING id`,
      [fileId, workspaceId],
    );
    await client.query(
      `UPDATE messages SET citations = COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'label', item->>'label', 'pageNumber', item->'pageNumber', 'sourceUnavailable', true
         )) FROM jsonb_array_elements(citations) AS item
       ), '[]'::jsonb) WHERE conversation_id = ANY($1::uuid[])`,
      [detached.rows.map((row) => row.id)],
    );
    await client.query("DELETE FROM files WHERE id = $1 AND workspace_id = $2", [fileId, workspaceId]);
    await client.query("COMMIT");
    return owned.rows[0].filename;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
