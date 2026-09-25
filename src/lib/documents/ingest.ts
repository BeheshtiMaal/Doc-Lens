import "server-only";

import { embedMany } from "ai";
import { getDatabase } from "@/lib/server/database";
import { HttpError } from "@/lib/server/http";
import { chunkPages } from "@/lib/documents/chunking";
import { parseDocument, type ParsedDocument } from "@/lib/documents/parsing";
import { EMBEDDING_DIMENSIONS, getEmbeddingModel } from "@/lib/ai/models";

export type FileRecord = {
  id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  status: "pending" | "chunked" | "embedded" | "failed";
  error_message: string | null;
  chunk_count: number;
  created_at: Date;
};

export class IngestionFailure extends Error {
  constructor(readonly fileId: string, message: string, readonly status: number) {
    super(message);
  }
}

const MAX_CHUNKS = 3000;
const EMBEDDING_BATCH = 64;

function safeMessage(error: unknown) {
  if (error instanceof HttpError) return { message: error.message, status: error.status };
  if (error instanceof Error && error.message.startsWith("Configure ")) {
    return { message: error.message, status: 503 };
  }
  return { message: "Document processing failed. You can delete this file and try again.", status: 503 };
}
export async function ingestFile(workspaceId: string, filename: string, contentType: string, bytes: Buffer) {
  const client = await getDatabase().connect();
  let fileId: string | undefined;
  try {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO files (workspace_id, filename, content_type, source_bytes, byte_size)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [workspaceId, filename, contentType, bytes, bytes.byteLength],
    );
    fileId = inserted.rows[0].id;
  } finally {
    client.release();
  }
  try {
    const parsed: ParsedDocument = await parseDocument(filename, bytes);
    const chunks = await chunkPages(parsed.pages);
    if (!chunks.length) throw new HttpError(422, "No text could be prepared for search.");
    if (chunks.length > MAX_CHUNKS) throw new HttpError(413, "This document is too long to process safely.");
    const model = getEmbeddingModel();

    const statusClient = await getDatabase().connect();
    try {
      await statusClient.query(
        "UPDATE files SET status = 'chunked', chunk_count = $2, updated_at = now() WHERE id = $1",
        [fileId, chunks.length],
      );
    } finally {
      statusClient.release();
    }

    const embedded: number[][] = [];
    for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH) {
      const batch = chunks.slice(start, start + EMBEDDING_BATCH);
      const result = await embedMany({
        model,
        values: batch.map((chunk) => chunk.content),
        maxParallelCalls: 1,
        maxRetries: 2,
      });
      embedded.push(...result.embeddings);
    }
    if (embedded.length !== chunks.length || embedded.some((value) => value.length !== EMBEDDING_DIMENSIONS)) {
      throw new Error("Embedding provider returned an incompatible vector dimension.");
    }

    const saveClient = await getDatabase().connect();
    try {
      await saveClient.query("BEGIN");
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        await saveClient.query(
          `INSERT INTO chunks
            (workspace_id, file_id, chunk_index, content, embedding, start_char, end_char, page_number)
           VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8)`,
          [workspaceId, fileId, chunk.index, chunk.content, `[${embedded[index].join(",")}]`,
            chunk.startChar, chunk.endChar, chunk.pageNumber],
        );
      }
      await saveClient.query("UPDATE files SET status = 'embedded', updated_at = now() WHERE id = $1", [fileId]);
      await saveClient.query("COMMIT");
    } catch (error) {
      await saveClient.query("ROLLBACK");
      throw error;
    } finally {
      saveClient.release();
    }
  } catch (error) {
    const failure = safeMessage(error);
    const failedClient = await getDatabase().connect();
    try {
      await failedClient.query(
        "UPDATE files SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1",
        [fileId, failure.message],
      );
    } finally {
      failedClient.release();
    }
    throw new IngestionFailure(fileId, failure.message, failure.status);
  }

  const result = await getDatabase().query<FileRecord>(
    `SELECT id, filename, content_type, byte_size, status, error_message, chunk_count, created_at
     FROM files WHERE id = $1 AND workspace_id = $2`,
    [fileId, workspaceId],
  );
  return result.rows[0];
}
