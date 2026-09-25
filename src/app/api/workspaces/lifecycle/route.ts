import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/server/database";
import { getServerConfig } from "@/lib/server/env";
import { authenticatedWorkspace, enforceSameOrigin, jsonError, readJson } from "@/lib/server/http";
import { heartbeatWorkspace, markWorkspaceClosing } from "@/lib/workspaces/repository";

export const runtime = "nodejs";
const lifecycleSchema = z.object({
  action: z.enum(["heartbeat", "close"]),
  pageGeneration: z.uuid(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const body = await readJson(request, lifecycleSchema);
    const credentials = await authenticatedWorkspace(request);
    const client = await getDatabase().connect();
    try {
      const config = getServerConfig();
      if (body.action === "heartbeat") {
        await heartbeatWorkspace(client, credentials, body.pageGeneration, config.WORKSPACE_IDLE_TTL_SECONDS);
      } else {
        await markWorkspaceClosing(client, credentials, body.pageGeneration, config.WORKSPACE_CLOSE_GRACE_SECONDS);
      }
      return new NextResponse(null, { status: 204 });
    } finally {
      client.release();
    }
  } catch (error) {
    return jsonError(error);
  }
}
