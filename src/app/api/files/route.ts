import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "@/lib/server/env";
import { getDatabase } from "@/lib/server/database";
import { authenticatedWorkspace, enforceSameOrigin, HttpError, jsonError } from "@/lib/server/http";
import { documentType } from "@/lib/documents/parsing";
import { ingestFile, IngestionFailure } from "@/lib/documents/ingest";

export const runtime = "nodejs";

function safeFilename(value: string) {
  const name = value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  if (!name || name.length > 255 || name === "." || name === "..") throw new HttpError(400, "Filename is invalid.");
  return name;
}

export async function GET(request: NextRequest) {
  try {
    const credentials = await authenticatedWorkspace(request);
    const result = await getDatabase().query(
      `SELECT f.id, f.filename, f.content_type AS "contentType", f.byte_size AS "size", f.status,
              f.error_message AS "error", f.chunk_count AS "chunkCount", f.created_at AS "createdAt"
       FROM files f WHERE f.workspace_id = $1 ORDER BY f.created_at DESC`,
      [credentials.workspaceId],
    );
    return NextResponse.json({ files: result.rows, maxSizeMb: getServerConfig().MAX_UPLOAD_SIZE_MB });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const credentials = await authenticatedWorkspace(request);
    const maxBytes = getServerConfig().MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > maxBytes + 1_000_000) throw new HttpError(413, "File exceeds the configured upload limit.");
    let form: FormData;
    try { form = await request.formData(); } catch { throw new HttpError(400, "Upload must use multipart form data."); }
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
    if (!file.size) throw new HttpError(400, "The file is empty.");
    if (file.size > maxBytes) throw new HttpError(413, `The file is larger than the ${getServerConfig().MAX_UPLOAD_SIZE_MB} MB limit.`);
    const filename = safeFilename(file.name);
    const type = documentType(filename);
    const bytes = Buffer.from(await file.arrayBuffer());
    const record = await ingestFile(credentials.workspaceId, filename, type.contentType, bytes);
    return NextResponse.json({ file: record }, { status: 201 });
  } catch (error) {
    if (error instanceof IngestionFailure) {
      return NextResponse.json({ error: error.message, fileId: error.fileId }, { status: error.status });
    }
    return jsonError(error);
  }
}
