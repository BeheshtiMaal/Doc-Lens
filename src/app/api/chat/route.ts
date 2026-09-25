import { NextRequest, NextResponse } from "next/server";
import { answerFileQuestion } from "@/lib/chat/answer";
import { questionSchema } from "@/lib/chat/question-schema";
import { authenticatedWorkspace, enforceSameOrigin, jsonError, readJson } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const credentials = await authenticatedWorkspace(request);
    const body = await readJson(request, questionSchema);
    const result = await answerFileQuestion({ ...body, workspaceId: credentials.workspaceId });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
