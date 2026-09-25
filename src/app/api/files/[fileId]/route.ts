import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/database";
import { authenticatedWorkspace, enforceSameOrigin, HttpError, isUuid, jsonError, readJson } from "@/lib/server/http";
import { deleteFileForWorkspace } from "@/lib/documents/files";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const credentials = await authenticatedWorkspace(request);
    const { fileId } = await context.params;
    if (!isUuid(fileId)) throw new HttpError(404, "File not found in this workspace.");
    const result = await getDatabase().query(
      `SELECT f.id, f.filename, f.content_type AS "contentType", f.byte_size AS "size", f.status,
              f.error_message AS "error", f.chunk_count AS "chunkCount", f.created_at AS "createdAt"
       FROM files f WHERE f.id = $1 AND f.workspace_id = $2`,
      [fileId, credentials.workspaceId],
    );
    if (!result.rowCount) throw new HttpError(404, "File not found in this workspace.");
    return NextResponse.json({ file: result.rows[0] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    enforceSameOrigin(request);
    const credentials = await authenticatedWorkspace(request);
    const { fileId } = await context.params;
    if (!isUuid(fileId)) throw new HttpError(404, "File not found in this workspace.");
    const client = await getDatabase().connect();
    try {
      const filename = await deleteFileForWorkspace(client, credentials.workspaceId, fileId);
      if (!filename) throw new HttpError(404, "File not found in this workspace.");
      return NextResponse.json({ deleted: true, filename });
    } finally {
      client.release();
    }
  } catch (error) {
    return jsonError(error);
  }
}

const renameSchema = z.object({
  filename: z.string().trim().min(1).max(255).refine((name) =>
    !/[\\/:*?"<>|]/u.test(name) && !Array.from(name).some((char) => char.charCodeAt(0) < 32)),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    enforceSameOrigin(request);
    const credentials = await authenticatedWorkspace(request);
    const { fileId } = await context.params;
    if (!isUuid(fileId)) throw new HttpError(404, "File not found in this workspace.");
    const { filename } = await readJson(request, renameSchema);
    const result = await getDatabase().query(
      `WITH renamed AS (
        UPDATE files SET filename = $1 WHERE id = $2 AND workspace_id = $3
          AND lower(substring(filename from '\\.[^.]+$')) = lower(substring($1 from '\\.[^.]+$'))
        RETURNING id, filename
      ), synced AS (
        UPDATE conversations SET source_filename = renamed.filename
        FROM renamed WHERE conversations.file_id = renamed.id AND conversations.workspace_id = $3
      ) SELECT id, filename FROM renamed`,
      [filename, fileId, credentials.workspaceId],
    );
    if (!result.rowCount) throw new HttpError(400, "The document could not be renamed. Keep its original file extension.");
    return NextResponse.json({ file: result.rows[0] });
  } catch (error) { return jsonError(error); }
}
