import type { ClientBase } from "pg";
import { OPENAI_CHAT_MODEL_ID, type ChatModelId } from "@/lib/ai/chat-models";
import { HttpError } from "@/lib/errors";
import { rerankEvidence } from "@/lib/chat/rerank";

type Evidence = {
  id: string;
  content: string;
  page_number: number | null;
  start_char: number;
  end_char: number;
  distance: number;
};
type Citation = { chunkId: string; label: string; passage: string; pageNumber: number | null };
type SelectedEvidence = Omit<Evidence, "distance">;
type AnswerDatabase = Pick<ClientBase, "query">;
export type AnswerDependencies = {
  database: AnswerDatabase;
  embedQuestion(question: string): Promise<number[]>;
  generateAnswer(input: { question: string; evidence: SelectedEvidence[]; modelId: ChatModelId }): Promise<string>;
};

export const NOT_FOUND_ANSWER = "I couldn't find an answer to that in this document.";
const TOP_K = 5;
const CANDIDATE_K = 20;

export async function answerFileQuestionCore(input: {
  workspaceId: string;
  fileId: string;
  question: string;
  conversationId?: string;
  modelId?: ChatModelId;
}, dependencies: AnswerDependencies) {
  const question = input.question.trim();
  const modelId = input.modelId ?? OPENAI_CHAT_MODEL_ID;
  if (!question || question.length > 4000) throw new HttpError(400, "Question must be between 1 and 4,000 characters.");
  const { database } = dependencies;
  const fileResult = await database.query<{ id: string; filename: string; status: string }>(
    "SELECT id, filename, status FROM files WHERE id = $1 AND workspace_id = $2",
    [input.fileId, input.workspaceId],
  );
  const file = fileResult.rows[0];
  if (!file) throw new HttpError(404, "File not found in this workspace.");
  if (file.status !== "embedded") throw new HttpError(409, `This file is not ready for questions (${file.status}).`);

  let conversationId = input.conversationId;
  if (conversationId) {
    const existing = await database.query<{ id: string }>(
      `SELECT id FROM conversations WHERE id = $1 AND workspace_id = $2 AND file_id = $3
         AND source_removed_at IS NULL`,
      [conversationId, input.workspaceId, input.fileId],
    );
    if (!existing.rowCount) throw new HttpError(404, "Conversation not found or no longer available.");
  } else {
    const result = await database.query<{ id: string }>(
      `INSERT INTO conversations (workspace_id, file_id, source_filename, title, selected_model)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.workspaceId, input.fileId, file.filename, question.slice(0, 160), modelId],
    );
    conversationId = result.rows[0].id;
  }

  const savedQuestion = await database.query(
    `WITH writable AS (
       SELECT c.id FROM conversations c JOIN files f ON f.id = c.file_id AND f.workspace_id = c.workspace_id
       WHERE c.id = $1 AND c.workspace_id = $3 AND c.file_id = $4
         AND c.source_removed_at IS NULL FOR UPDATE OF c
     )
     INSERT INTO messages (conversation_id, role, content)
     SELECT id, 'user', $2 FROM writable RETURNING id`,
    [conversationId, question, input.workspaceId, input.fileId],
  );
  if (!savedQuestion.rowCount) throw new HttpError(404, "Conversation not found or no longer available.");
  await database.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [conversationId]);

  const embedding = await dependencies.embedQuestion(question);
  const matches = await database.query<Evidence>(
    `SELECT c.id, c.content, c.page_number, c.start_char, c.end_char,
            (c.embedding <=> $3::vector) AS distance
     FROM chunks c JOIN files f ON f.id = c.file_id
     WHERE c.workspace_id = $1 AND c.file_id = $2 AND f.workspace_id = $1 AND f.status = 'embedded'
     ORDER BY c.embedding <=> $3::vector LIMIT $4`,
    [input.workspaceId, input.fileId, `[${embedding.join(",")}]`, CANDIDATE_K],
  );
  const evidence = rerankEvidence(question, matches.rows, TOP_K)
    .map(({ id, content, page_number, start_char, end_char }) => ({ id, content, page_number, start_char, end_char }));
  let answer = NOT_FOUND_ANSWER;
  let citations: Citation[] = [];
  if (evidence.length) {
    answer = (await dependencies.generateAnswer({ question, evidence, modelId })).trim() || NOT_FOUND_ANSWER;
    const labels = new Set([...answer.matchAll(/\[(\d+)\]/g)]
      .map((match) => Number(match[1]))
      .filter((label) => Number.isInteger(label) && label > 0 && label <= evidence.length));
    answer = answer.replace(/\[(\d+)\]/g, (reference, rawLabel: string) =>
      labels.has(Number(rawLabel)) ? reference : "").replace(/\s+([,.!?])/g, "$1").trim();
    citations = evidence.flatMap((item, index) => labels.has(index + 1)
      ? [{ chunkId: item.id, label: `Source ${index + 1}`, passage: item.content, pageNumber: item.page_number }]
      : []);
    if (!citations.length && answer !== NOT_FOUND_ANSWER) answer = NOT_FOUND_ANSWER;
  }
  const savedAnswer = await database.query(
    `WITH writable AS (
       SELECT c.id FROM conversations c JOIN files f ON f.id = c.file_id AND f.workspace_id = c.workspace_id
       WHERE c.id = $1 AND c.workspace_id = $5 AND c.file_id = $6
         AND c.source_removed_at IS NULL FOR UPDATE OF c
     )
     INSERT INTO messages (conversation_id, role, content, citations, model_used)
     SELECT id, 'assistant', $2, $3::jsonb, $4 FROM writable RETURNING id`,
    [conversationId, answer, JSON.stringify(citations), modelId, input.workspaceId, input.fileId],
  );
  if (!savedAnswer.rowCount) throw new HttpError(409, "The source file was removed. This conversation can no longer continue.");
  await database.query("UPDATE conversations SET updated_at = now(), selected_model = $2 WHERE id = $1", [conversationId, modelId]);
  return { conversationId, answer, citations, modelId };
}
