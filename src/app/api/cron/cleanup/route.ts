import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "@/lib/server/env";
import { getDatabase } from "@/lib/server/database";
import { jsonError } from "@/lib/server/http";
import { sweepExpiredWorkspaces } from "@/lib/workspaces/repository";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const expected = getServerConfig().CRON_SECRET;
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!expected || supplied.length !== expected.length
      || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const client = await getDatabase().connect();
    let deleted = 0;
    try {
      for (let batch = 0; batch < 10; batch += 1) {
        const count = await sweepExpiredWorkspaces(client, 100);
        deleted += count;
        if (count < 100) break;
      }
    } finally {
      client.release();
    }
    return NextResponse.json({ deletedWorkspaces: deleted });
  } catch (error) {
    return jsonError(error);
  }
}
