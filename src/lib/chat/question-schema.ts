import { z } from "zod";
import { CHAT_MODEL_IDS } from "@/lib/ai/chat-models";

export const questionSchema = z.object({
  fileId: z.uuid(),
  conversationId: z.uuid().optional(),
  modelId: z.enum(CHAT_MODEL_IDS).optional(),
  question: z.string().trim().min(1).max(4000),
}).strict();
