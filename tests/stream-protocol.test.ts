import assert from "node:assert/strict";
import test from "node:test";
import { encodeChatEvent, readChatEventStream, type ChatStreamEvent } from "../src/lib/chat/stream-protocol";

function responseFromChunks(chunks: Uint8Array[]) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

test("stream parser preserves fragmented Persian UTF-8 and events", async () => {
  const result = {
    conversationId: "conversation-1",
    answer: "پاسخ [1]",
    citations: [{ chunkId: "chunk-1", label: "Source 1", passage: "متن", pageNumber: null }],
    modelId: "openai:gpt-4.1-mini" as const,
  };
  const events: ChatStreamEvent[] = [
    { type: "phase", phase: "retrieving" },
    { type: "phase", phase: "generating" },
    { type: "delta", text: "پاسخ " },
    { type: "delta", text: "[1]" },
    { type: "done", result },
  ];
  const bytes = new TextEncoder().encode(events.map(encodeChatEvent).join("").replace(/\n/g, "\r\n"));
  const chunks = Array.from(bytes, (byte) => Uint8Array.of(byte));
  const received: ChatStreamEvent[] = [];
  assert.deepEqual(await readChatEventStream(responseFromChunks(chunks), (event) => { received.push(event); }), result);
  assert.deepEqual(received, events.slice(0, -1));
});

test("stream parser reports server errors and incomplete streams", async () => {
  const error = responseFromChunks([new TextEncoder().encode(encodeChatEvent({ type: "error", message: "Please retry." }))]);
  await assert.rejects(readChatEventStream(error, () => undefined), /Please retry/);
  const incomplete = responseFromChunks([new TextEncoder().encode(encodeChatEvent({ type: "phase", phase: "retrieving" }))]);
  await assert.rejects(readChatEventStream(incomplete, () => undefined), /ended unexpectedly/);
});

test("stream parser awaits each asynchronous delta before completing", async () => {
  const result = {
    conversationId: "conversation-2",
    answer: "One two [1].",
    citations: [],
    modelId: "openai:gpt-4.1-mini" as const,
  };
  const frames: ChatStreamEvent[] = [
    { type: "delta", text: "One " },
    { type: "delta", text: "two " },
    { type: "delta", text: "[1]." },
    { type: "done", result },
  ];
  const response = responseFromChunks([new TextEncoder().encode(frames.map(encodeChatEvent).join(""))]);
  const received: string[] = [];
  const parsed = await readChatEventStream(response, async (event) => {
    if (event.type === "delta") {
      await new Promise((resolve) => setTimeout(resolve, 1));
      received.push(event.text);
    }
  });
  assert.deepEqual(received, ["One ", "two ", "[1]."]);
  assert.deepEqual(parsed, result);
});