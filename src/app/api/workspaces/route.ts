import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createWorkspace } from "@/lib/workspaces/repository";
import { getDatabase } from "@/lib/server/database";
import { getServerConfig } from "@/lib/server/env";
import { enforceSameOrigin, jsonError, readJson } from "@/lib/server/http";
import { parseWorkspaceCredentials } from "@/lib/workspaces/credentials";
import { resumeWorkspace } from "@/lib/workspaces/repository";

export const runtime = "nodejs";
const workspaceSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create") }).strict(),
  z.object({ action: z.literal("resume"), credentials: z.unknown() }).strict(),
]);

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const action = await readJson(request, workspaceSchema);
    const client = await getDatabase().connect();
    try {
      if (action.action === "create") {
        const workspace = await createWorkspace(client, getServerConfig().WORKSPACE_IDLE_TTL_SECONDS);
        return NextResponse.json(workspace, { status: 201 });
      }
      const credentials = parseWorkspaceCredentials(action.credentials);
      if (!credentials) return NextResponse.json({ error: "Workspace unavailable or expired." }, { status: 401 });
      const workspace = await resumeWorkspace(client, credentials, getServerConfig().WORKSPACE_IDLE_TTL_SECONDS);
      return NextResponse.json({ ...credentials, ...workspace });
    } finally {
      client.release();
    }
  } catch (error) {
    return jsonError(error);
  }
}
