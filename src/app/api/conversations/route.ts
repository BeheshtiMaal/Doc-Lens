import { NextRequest, NextResponse } from "next/server";
import { authenticatedWorkspace } from "@/lib/server/http";
import { getDatabase } from "@/lib/server/database";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const credentials = await authenticatedWorkspace(request);
    const result = await getDatabase().query(
      `SELECT c.id, c.file_id AS "fileId", c.source_filename AS "sourceFilename",
              c.source_removed_at AS "sourceRemovedAt", c.title, c.selected_model AS "selectedModel",
              c.created_at AS "createdAt", c.updated_at AS "updatedAt",
              (SELECT count(*)::integer FROM messages m WHERE m.conversation_id = c.id) AS "messageCount"
       FROM conversations c WHERE c.workspace_id = $1 ORDER BY c.updated_at DESC`,
      [credentials.workspaceId],
    );
    return NextResponse.json({ conversations: result.rows });
  } catch (error) {
    return jsonError(error);
  }
}
