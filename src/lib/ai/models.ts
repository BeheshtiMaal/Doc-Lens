import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { ANTHROPIC_CHAT_MODEL_ID, OPENAI_CHAT_MODEL_ID, type ChatModelId } from "@/lib/ai/chat-models";
import { getServerConfig, requireProviderKey } from "@/lib/server/env";

export const EMBEDDING_MODEL_ID = "text-embedding-3-small";
export { ANTHROPIC_CHAT_MODEL_ID, CHAT_MODEL_IDS, OPENAI_CHAT_MODEL_ID } from "@/lib/ai/chat-models";
export type { ChatModelId } from "@/lib/ai/chat-models";
export const EMBEDDING_DIMENSIONS = 1536;

function openAIProvider() {
  return createOpenAI({
    apiKey: requireProviderKey("openai"),
    baseURL: getServerConfig().OPENAI_BASE_URL,
  });
}

export function getChatModel(modelId: ChatModelId = OPENAI_CHAT_MODEL_ID) {
  if (modelId === OPENAI_CHAT_MODEL_ID) return openAIProvider().chat("gpt-4.1-mini");
  if (modelId === ANTHROPIC_CHAT_MODEL_ID) {
    return openAIProvider().chat("anthropic.claude-haiku-4-5-20251001-v1:0");
  }
  throw new Error("This conversation uses an unsupported model.");
}

export function getEmbeddingModel() {
  const config = getServerConfig();
  if (!config.DOCLENS_AVALAI_API_KEY && !config.OPENAI_API_KEY) {
    throw new Error("Configure DOCLENS_AVALAI_API_KEY to embed documents and questions.");
  }
  return openAIProvider().embeddingModel(EMBEDDING_MODEL_ID);
}
