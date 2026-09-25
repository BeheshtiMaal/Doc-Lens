import type { ChatModelId } from "@/lib/ai/chat-models";

export type ChatStreamResult = {
  conversationId: string;
  answer: string;
  citations: { chunkId: string; label: string; passage: string; pageNumber: number | null }[];
  modelId: ChatModelId;
};

export type ChatStreamEvent =
  | { type: "phase"; phase: "retrieving" | "generating" }
  | { type: "delta"; text: string }
  | { type: "done"; result: ChatStreamResult }
  | { type: "error"; message: string };

export function encodeChatEvent(event: ChatStreamEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function readChatEventStream(response: Response, onEvent: (event: ChatStreamEvent) => void | Promise<void>): Promise<ChatStreamResult> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("The answer stream is unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n");
        if (data) {
          const event = JSON.parse(data) as ChatStreamEvent;
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") return event.result;
          if (event.type === "phase" || event.type === "delta") await onEvent(event);
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (buffer.length > 1_000_000) throw new Error("The answer stream is too large.");
      if (done) break;
    }
    throw new Error("The answer stream ended unexpectedly. Try again.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
