import { NextRequest } from "next/server";
import { streamFileQuestion } from "@/lib/chat/answer";
import { questionSchema } from "@/lib/chat/question-schema";
import { encodeChatEvent, type ChatStreamEvent } from "@/lib/chat/stream-protocol";
import { HttpError } from "@/lib/errors";
import { authenticatedWorkspace, enforceSameOrigin, jsonError, readJson } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const credentials = await authenticatedWorkspace(request);
    const body = await readJson(request, questionSchema);
    const encoder = new TextEncoder();
    const cancellation = new AbortController();
    const signal = AbortSignal.any([request.signal, cancellation.signal]);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (event: ChatStreamEvent) => {
          if (!closed && !signal.aborted) controller.enqueue(encoder.encode(encodeChatEvent(event)));
        };
        try {
          send({ type: "phase", phase: "retrieving" });
          const result = await streamFileQuestion(
            { ...body, workspaceId: credentials.workspaceId },
            (text) => send({ type: "delta", text }),
            () => send({ type: "phase", phase: "generating" }),
            signal,
          );
          send({ type: "done", result });
        } catch (error) {
          const message = error instanceof HttpError ? error.message : "The answer could not be completed. Try again.";
          try { send({ type: "error", message }); } catch { /* Client disconnected. */ }
        } finally {
          closed = true;
          try { controller.close(); } catch { /* Client disconnected. */ }
        }
      },
      cancel() { cancellation.abort(); },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },

    });
  } catch (error) {
    return jsonError(error);
  }
}
