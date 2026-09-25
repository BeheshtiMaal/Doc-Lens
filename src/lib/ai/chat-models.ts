export const OPENAI_CHAT_MODEL_ID = "openai:gpt-4.1-mini";
export const ANTHROPIC_CHAT_MODEL_ID = "anthropic:claude-haiku-4-5-20251001";
export const CHAT_MODEL_IDS = [OPENAI_CHAT_MODEL_ID, ANTHROPIC_CHAT_MODEL_ID] as const;
export type ChatModelId = (typeof CHAT_MODEL_IDS)[number];

export function isChatModelId(value: string): value is ChatModelId {
  return CHAT_MODEL_IDS.some((id) => id === value);
}
