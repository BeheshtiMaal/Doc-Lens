import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedWorkspace, enforceSameOrigin, HttpError, isUuid, jsonError, readJson } from "@/lib/server/http";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const credentials = await authenticatedWorkspace(request);
    const { conversationId } = await context.params;
    if (!isUuid(conversationId)) throw new HttpError(404, "Conversation not found in this workspace.");
    const client = getDatabase();
    const conversation = await client.query(
      `SELECT id, file_id AS "fileId", source_filename AS "sourceFilename",
              source_removed_at AS "sourceRemovedAt", title, selected_model AS "selectedModel",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM conversations WHERE id = $1 AND workspace_id = $2`,
      [conversationId, credentials.workspaceId],
    );
    if (!conversation.rowCount) throw new HttpError(404, "Conversation not found in this workspace.");
    const messages = await client.query(
      `SELECT id, role, content, citations, model_used AS "modelUsed", created_at AS "createdAt"
       FROM messages WHERE conversation_id = $1 ORDER BY created_at, id`,
      [conversationId],
    );
    return NextResponse.json({ conversation: conversation.rows[0], messages: messages.rows });
  } catch (error) {
    return jsonError(error);
  }
}

const renameSchema = z.object({ title: z.string().trim().min(1).max(120) });

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    enforceSameOrigin(request);
    const credentials = await authenticatedWorkspace(request);
    const { conversationId } = await context.params;
    if (!isUuid(conversationId)) throw new HttpError(404, "Conversation not found in this workspace.");
    const { title } = await readJson(request, renameSchema);
    const result = await getDatabase().query(
      'UPDATE conversations SET title = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3 RETURNING id, title',
      [title, conversationId, credentials.workspaceId],
    );
    if (!result.rowCount) throw new HttpError(404, "Conversation not found in this workspace.");
    return NextResponse.json({ conversation: result.rows[0] });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    enforceSameOrigin(request);
    const credentials = await authenticatedWorkspace(request);
    const { conversationId } = await context.params;
    if (!isUuid(conversationId)) throw new HttpError(404, "Conversation not found in this workspace.");
    const result = await getDatabase().query(
      'DELETE FROM conversations WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [conversationId, credentials.workspaceId],
    );
    if (!result.rowCount) throw new HttpError(404, "Conversation not found in this workspace.");
    return NextResponse.json({ deleted: true });
  } catch (error) { return jsonError(error); }
}
