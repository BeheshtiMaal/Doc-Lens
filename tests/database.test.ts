import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Client } from "pg";
import pgvector from "pgvector/pg";
import { migrateDatabase } from "../src/lib/database/migrations";
import {
  createWorkspace, heartbeatWorkspace, markWorkspaceClosing, requireWorkspace,
  resumeWorkspace, sweepExpiredWorkspaces, WorkspaceAccessError,
} from "../src/lib/workspaces/repository";
import { deleteFileForWorkspace } from "../src/lib/documents/files";
import { answerFileQuestionCore, NOT_FOUND_ANSWER } from "../src/lib/chat/answer-core";

test("PostgreSQL migrations, pgvector, and workspace authorization", { timeout: 60000 }, async (t) => {
  const database = new PGlite({ extensions: { vector } });
  const server = new PGLiteSocketServer({ db: database, host: "127.0.0.1", port: 0 });
  let client: Client | undefined;
  try {
    await server.start();
    client = new Client({
      connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    });
    await client.connect();
    const connection = client;

    await t.test("migrations are repeatable and enable actual vector operations", async () => {
      assert.deepEqual(await migrateDatabase(connection), [
        "0001_workspaces.sql", "0002_documents_rag_and_conversations.sql", "0003_supported_chat_models.sql",
      ]);
      assert.deepEqual(await migrateDatabase(connection), []);
      await pgvector.registerTypes(connection);
      const result = await connection.query<{ embedding: number[]; distance: number }>(
        "SELECT $1::vector AS embedding, $1::vector <-> $2::vector AS distance",
        [pgvector.toSql([1, 2, 3]), pgvector.toSql([1, 2, 4])],
      );
      assert.deepEqual(result.rows[0].embedding, [1, 2, 3]);
      assert.equal(result.rows[0].distance, 1);
    });

    await t.test("one workspace's token cannot authorize another workspace", async () => {
      const first = await createWorkspace(connection, 1800);
      const second = await createWorkspace(connection, 1800);
      assert.equal((await requireWorkspace(connection, first)).id, first.workspaceId);
      await assert.rejects(
        requireWorkspace(connection, { workspaceId: first.workspaceId, accessToken: second.accessToken }),
        WorkspaceAccessError,
      );
      const stored = await connection.query<{ access_token_hash: string }>(
        "SELECT access_token_hash FROM workspaces WHERE id = $1", [first.workspaceId],
      );
      assert.notEqual(stored.rows[0].access_token_hash, first.accessToken);
      assert.match(stored.rows[0].access_token_hash, /^[a-f0-9]{64}$/);
    });

    await t.test("expired workspace credentials are rejected", async () => {
      const workspace = await createWorkspace(connection, 1800);
      await connection.query(
        `UPDATE workspaces
         SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 second'
         WHERE id = $1`,
        [workspace.workspaceId],
      );
      await assert.rejects(requireWorkspace(connection, workspace), WorkspaceAccessError);
      await connection.query("DELETE FROM workspaces WHERE id = $1", [workspace.workspaceId]);
    });

    await t.test("expired workspaces cascade-delete source bytes, vectors, chats, and messages", async () => {
      const workspace = await createWorkspace(connection, 1800);
      const file = await connection.query<{ id: string }>(
        `INSERT INTO files (workspace_id, filename, content_type, source_bytes, byte_size, status)
         VALUES ($1, 'source.txt', 'text/plain', $2, 4, 'embedded') RETURNING id`,
        [workspace.workspaceId, Buffer.from("test")],
      );
      const embedding = pgvector.toSql([1, ...Array.from({ length: 1535 }, () => 0)]);
      await connection.query(
        `INSERT INTO chunks (workspace_id, file_id, chunk_index, content, embedding, start_char, end_char)
         VALUES ($1, $2, 0, 'private evidence', $3::vector, 0, 16)`,
        [workspace.workspaceId, file.rows[0].id, embedding],
      );
      const conversation = await connection.query<{ id: string }>(
        `INSERT INTO conversations (workspace_id, file_id, source_filename, title)
         VALUES ($1, $2, 'source.txt', 'Question') RETURNING id`,
        [workspace.workspaceId, file.rows[0].id],
      );
      await connection.query(
        "INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', 'What is this?')",
        [conversation.rows[0].id],
      );
      await connection.query(
        `UPDATE workspaces SET created_at = now() - interval '2 hours',
           expires_at = now() - interval '1 second' WHERE id = $1`,
        [workspace.workspaceId],
      );
      assert.equal(await sweepExpiredWorkspaces(connection), 1);
      assert.equal((await connection.query("SELECT id FROM files WHERE id = $1", [file.rows[0].id])).rowCount, 0);
      assert.equal((await connection.query("SELECT id FROM chunks WHERE file_id = $1", [file.rows[0].id])).rowCount, 0);
      assert.equal((await connection.query("SELECT id FROM conversations WHERE id = $1", [conversation.rows[0].id])).rowCount, 0);
      assert.equal((await connection.query("SELECT id FROM messages WHERE conversation_id = $1", [conversation.rows[0].id])).rowCount, 0);
    });

    await t.test("file deletion removes source text and vectors but preserves read-only history", async () => {
      const workspace = await createWorkspace(connection, 1800);
      const otherWorkspace = await createWorkspace(connection, 1800);
      const fileA = await connection.query<{ id: string }>(
        `INSERT INTO files (workspace_id, filename, content_type, source_bytes, byte_size, status)
         VALUES ($1, 'same-name.txt', 'text/plain', $2, 5, 'embedded') RETURNING id`,
        [workspace.workspaceId, Buffer.from("alpha")],
      );
      const fileB = await connection.query<{ id: string }>(
        `INSERT INTO files (workspace_id, filename, content_type, source_bytes, byte_size, status)
         VALUES ($1, 'same-name.txt', 'text/plain', $2, 4, 'embedded') RETURNING id`,
        [otherWorkspace.workspaceId, Buffer.from("beta")],
      );
      const embedding = pgvector.toSql([1, ...Array.from({ length: 1535 }, () => 0)]);
      for (const [owner, file, content] of [
        [workspace, fileA, "alpha evidence"], [otherWorkspace, fileB, "beta evidence"],
      ] as const) {
        await connection.query(
          `INSERT INTO chunks (workspace_id, file_id, chunk_index, content, embedding, start_char, end_char)
           VALUES ($1, $2, 0, $3, $4::vector, 0, $5)`,
          [owner.workspaceId, file.rows[0].id, content, embedding, content.length],
        );
      }
      const filtered = await connection.query<{ content: string }>(
        "SELECT content FROM chunks WHERE workspace_id = $1 AND file_id = $2",
        [workspace.workspaceId, fileA.rows[0].id],
      );
      assert.deepEqual(filtered.rows.map((row) => row.content), ["alpha evidence"]);
      assert.equal((await connection.query(
        "SELECT id FROM chunks WHERE workspace_id = $1 AND file_id = $2",
        [workspace.workspaceId, fileB.rows[0].id],
      )).rowCount, 0);

      const conversation = await connection.query<{ id: string }>(
        `INSERT INTO conversations (workspace_id, file_id, source_filename, title)
         VALUES ($1, $2, 'same-name.txt', 'Question') RETURNING id`,
        [workspace.workspaceId, fileA.rows[0].id],
      );
      await connection.query(
        `INSERT INTO messages (conversation_id, role, content, citations)
         VALUES ($1, 'assistant', 'Supported answer', $2::jsonb)`,
        [conversation.rows[0].id, JSON.stringify([{ chunkId: "chunk", label: "Source 1", passage: "private evidence", pageNumber: null }])],
      );
      assert.equal(await deleteFileForWorkspace(connection, workspace.workspaceId, fileA.rows[0].id), "same-name.txt");
      assert.equal((await connection.query("SELECT id FROM files WHERE id = $1", [fileA.rows[0].id])).rowCount, 0);
      assert.equal((await connection.query("SELECT id FROM chunks WHERE file_id = $1", [fileA.rows[0].id])).rowCount, 0);
      const history = await connection.query<{
        file_id: string | null; source_filename: string; source_removed_at: Date; title: string;
      }>("SELECT file_id, source_filename, source_removed_at, title FROM conversations WHERE id = $1", [conversation.rows[0].id]);
      assert.equal(history.rows[0].file_id, null);
      assert.equal(history.rows[0].source_filename, "same-name.txt");
      assert.ok(history.rows[0].source_removed_at);
      const savedCitation = await connection.query<{ citations: Array<Record<string, unknown>> }>(
        "SELECT citations FROM messages WHERE conversation_id = $1", [conversation.rows[0].id],
      );
      assert.equal(savedCitation.rows[0].citations[0].sourceUnavailable, true);
      assert.equal("passage" in savedCitation.rows[0].citations[0], false);
      assert.equal((await connection.query("SELECT id FROM files WHERE id = $1", [fileB.rows[0].id])).rowCount, 1);
      const replacement = await connection.query<{ id: string }>(
        `INSERT INTO files (workspace_id, filename, content_type, source_bytes, byte_size, status)
         VALUES ($1, 'replacement.txt', 'text/plain', $2, 1, 'embedded') RETURNING id`,
        [workspace.workspaceId, Buffer.from("r")],
      );
      const before = await connection.query<{ count: string }>(
        "SELECT count(*) FROM messages WHERE conversation_id = $1", [conversation.rows[0].id],
      );
      await assert.rejects(
        answerFileQuestionCore({
          workspaceId: workspace.workspaceId, fileId: replacement.rows[0].id,
          conversationId: conversation.rows[0].id, question: "Continue after deletion?",
        }, {
          database: connection,
          embedQuestion: async () => { throw new Error("Retrieval must not start"); },
          generateAnswer: async () => { throw new Error("Generation must not start"); },
        }),
        /Conversation not found or no longer available/,
      );
      assert.equal((await connection.query<{ count: string }>(
        "SELECT count(*) FROM messages WHERE conversation_id = $1", [conversation.rows[0].id],
      )).rows[0].count, before.rows[0].count);
    });

    await t.test("an interrupted session expires and the sweeper removes its private data", async () => {
      const workspace = await createWorkspace(connection, 1800);
      const file = await connection.query<{ id: string }>(
        `INSERT INTO files (workspace_id, filename, content_type, source_bytes, byte_size)
         VALUES ($1, 'interrupted.txt', 'text/plain', $2, 4) RETURNING id`,
        [workspace.workspaceId, Buffer.from("text")],
      );
      const conversation = await connection.query<{ id: string }>(
        `INSERT INTO conversations (workspace_id, file_id, source_filename, title)
         VALUES ($1, $2, 'interrupted.txt', 'Interrupted') RETURNING id`,
        [workspace.workspaceId, file.rows[0].id],
      );
      await connection.query(
        "INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', 'Question')",
        [conversation.rows[0].id],
      );
      await connection.query(
        `UPDATE workspaces SET created_at = now() - interval '2 hours',
           expires_at = now() - interval '1 second' WHERE id = $1`,
        [workspace.workspaceId],
      );
      await assert.rejects(requireWorkspace(connection, workspace), WorkspaceAccessError);
      assert.equal(await sweepExpiredWorkspaces(connection), 1);
      assert.equal((await connection.query("SELECT id FROM files WHERE id = $1", [file.rows[0].id])).rowCount, 0);
      assert.equal((await connection.query("SELECT id FROM conversations WHERE id = $1", [conversation.rows[0].id])).rowCount, 0);
      assert.equal((await connection.query("SELECT id FROM messages WHERE conversation_id = $1", [conversation.rows[0].id])).rowCount, 0);
    });

    await t.test("a stale close hint cannot expire a resumed page generation", async () => {
      const workspace = await createWorkspace(connection, 1800);
      await markWorkspaceClosing(connection, workspace, workspace.pageGeneration, 120);
      const resumed = await resumeWorkspace(connection, workspace, 1800);
      assert.notEqual(resumed.pageGeneration, workspace.pageGeneration);
      await markWorkspaceClosing(connection, workspace, workspace.pageGeneration, 120);
      await heartbeatWorkspace(connection, workspace, resumed.pageGeneration, 1800);
      assert.equal((await requireWorkspace(connection, workspace)).id, workspace.workspaceId);
      await connection.query("UPDATE workspaces SET close_after = now() - interval '1 second' WHERE id = $1", [workspace.workspaceId]);
      assert.equal(await sweepExpiredWorkspaces(connection), 1);
      await assert.rejects(requireWorkspace(connection, workspace), WorkspaceAccessError);
    });

    await t.test("RAG uses only the selected file and current question, validates citations, and says not found", async () => {
      const workspace = await createWorkspace(connection, 1800);
      const otherWorkspace = await createWorkspace(connection, 1800);
      const fileA = await connection.query<{ id: string }>(
        `INSERT INTO files (workspace_id, filename, content_type, source_bytes, byte_size, status)
         VALUES ($1, 'a.txt', 'text/plain', $2, 1, 'embedded') RETURNING id`,
        [workspace.workspaceId, Buffer.from("a")],
      );
      const fileB = await connection.query<{ id: string }>(
        `INSERT INTO files (workspace_id, filename, content_type, source_bytes, byte_size, status)
         VALUES ($1, 'b.txt', 'text/plain', $2, 1, 'embedded') RETURNING id`,
        [otherWorkspace.workspaceId, Buffer.from("b")],
      );
      const embedding = pgvector.toSql([1, ...Array.from({ length: 1535 }, () => 0)]);
      const chunkA = await connection.query<{ id: string }>(
        `INSERT INTO chunks (workspace_id, file_id, chunk_index, content, embedding, start_char, end_char, page_number)
         VALUES ($1, $2, 0, 'A evidence says the answer is 42.', $3::vector, 0, 33, 7) RETURNING id`,
        [workspace.workspaceId, fileA.rows[0].id, embedding],
      );
      await connection.query(
        `INSERT INTO chunks (workspace_id, file_id, chunk_index, content, embedding, start_char, end_char)
         VALUES ($1, $2, 0, 'B private answer is 900.', $3::vector, 0, 24)`,
        [otherWorkspace.workspaceId, fileB.rows[0].id, embedding],
      );
      const sameWorkspaceFile = await connection.query<{ id: string }>(
        `INSERT INTO files (workspace_id, filename, content_type, source_bytes, byte_size, status)
         VALUES ($1, 'distractor.txt', 'text/plain', $2, 1, 'embedded') RETURNING id`,
        [workspace.workspaceId, Buffer.from("d")],
      );
      await connection.query(
        `INSERT INTO chunks (workspace_id, file_id, chunk_index, content, embedding, start_char, end_char)
         VALUES ($1, $2, 0, 'Distractor says the answer is 900.', $3::vector, 0, 34)`,
        [workspace.workspaceId, sameWorkspaceFile.rows[0].id, embedding],
      );
      const conversation = await connection.query<{ id: string }>(
        `INSERT INTO conversations (workspace_id, file_id, source_filename, title)
         VALUES ($1, $2, 'a.txt', 'Old question') RETURNING id`,
        [workspace.workspaceId, fileA.rows[0].id],
      );
      await connection.query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', 'Earlier answer: use B.')`,
        [conversation.rows[0].id],
      );
      let seenEvidence: string[] = [];
      let seenQuestion = "";
      await assert.rejects(
        answerFileQuestionCore({
          workspaceId: workspace.workspaceId, fileId: fileB.rows[0].id, question: "Can I read another workspace?",
        }, {
          database: connection,
          embedQuestion: async () => { throw new Error("Retrieval must not start"); },
          generateAnswer: async () => { throw new Error("Generation must not start"); },
        }),
        /File not found in this workspace/,
      );
      const result = await answerFileQuestionCore({
        workspaceId: workspace.workspaceId, fileId: fileA.rows[0].id,
        conversationId: conversation.rows[0].id, question: "What is the answer?",
        modelId: "anthropic:claude-haiku-4-5-20251001",
      }, {
        database: connection,
        embedQuestion: async () => [1, ...Array.from({ length: 1535 }, () => 0)],
        generateAnswer: async ({ question, evidence, modelId }) => {
          seenQuestion = question;
          seenEvidence = evidence.map((entry) => entry.content);
          assert.equal(modelId, "anthropic:claude-haiku-4-5-20251001");
          return "The answer is 42 [1]. [99]";
        },
      });
      assert.equal(seenQuestion, "What is the answer?");
      assert.deepEqual(seenEvidence, ["A evidence says the answer is 42."]);
      assert.equal(result.answer, "The answer is 42 [1].");
      assert.equal(result.modelId, "anthropic:claude-haiku-4-5-20251001");
      assert.equal(result.citations.length, 1);
      assert.equal(result.citations[0].chunkId, chunkA.rows[0].id);
      assert.equal(result.citations[0].pageNumber, 7);
      assert.equal((await connection.query<{ selected_model: string }>(
        "SELECT selected_model FROM conversations WHERE id = $1", [conversation.rows[0].id],
      )).rows[0].selected_model, "anthropic:claude-haiku-4-5-20251001");

      const distantButSupported = await answerFileQuestionCore({
        workspaceId: workspace.workspaceId, fileId: fileA.rows[0].id,
        conversationId: conversation.rows[0].id, question: "Which passage contains the answer?",
      }, {
        database: connection,
        // The only passage is still evidence when the embedding distance is 1.
        embedQuestion: async () => [0, 1, ...Array.from({ length: 1534 }, () => 0)],
        generateAnswer: async ({ evidence }) => {
          assert.equal(evidence[0]?.content, "A evidence says the answer is 42.");
          return "The passage says 42 [1].";
        },
      });
      assert.equal(distantButSupported.answer, "The passage says 42 [1].");
      assert.equal(distantButSupported.citations.length, 1);

      let generated = false;
      const unsupported = await answerFileQuestionCore({
        workspaceId: workspace.workspaceId, fileId: fileA.rows[0].id,
        conversationId: conversation.rows[0].id, question: "What is unrelated?",
      }, {
        database: connection,
        embedQuestion: async () => [0, 1, ...Array.from({ length: 1534 }, () => 0)],
        generateAnswer: async ({ evidence }) => {
          generated = true;
          assert.equal(evidence.length, 1);
          return NOT_FOUND_ANSWER;
        },
      });
      assert.equal(generated, true);
      assert.equal(unsupported.answer, NOT_FOUND_ANSWER);
      assert.deepEqual(unsupported.citations, []);

      const secondFile = await connection.query<{ id: string }>(
        `INSERT INTO files (workspace_id, filename, content_type, source_bytes, byte_size, status)
         VALUES ($1, 'another.txt', 'text/plain', $2, 1, 'embedded') RETURNING id`,
        [workspace.workspaceId, Buffer.from("c")],
      );
      const messageCount = await connection.query<{ count: string }>(
        "SELECT count(*) FROM messages WHERE conversation_id = $1", [conversation.rows[0].id],
      );
      await assert.rejects(
        answerFileQuestionCore({
          workspaceId: workspace.workspaceId, fileId: secondFile.rows[0].id,
          conversationId: conversation.rows[0].id, question: "Can this thread use another file?",
        }, {
          database: connection,
          embedQuestion: async () => { throw new Error("Retrieval must not start"); },
          generateAnswer: async () => { throw new Error("Generation must not start"); },
        }),
        /Conversation not found or no longer available/,
      );
      assert.equal((await connection.query<{ count: string }>(
        "SELECT count(*) FROM messages WHERE conversation_id = $1", [conversation.rows[0].id],
      )).rows[0].count, messageCount.rows[0].count);

      await assert.rejects(
        answerFileQuestionCore({
          workspaceId: workspace.workspaceId, fileId: fileA.rows[0].id,
          conversationId: conversation.rows[0].id, question: "What if the source disappears mid-answer?",
        }, {
          database: connection,
          embedQuestion: async () => [1, ...Array.from({ length: 1535 }, () => 0)],
          generateAnswer: async () => {
            assert.equal(await deleteFileForWorkspace(connection, workspace.workspaceId, fileA.rows[0].id), "a.txt");
            return "A late answer [1].";
          },
        }),
        /The source file was removed/,
      );
      assert.equal((await connection.query(
        "SELECT id FROM messages WHERE conversation_id = $1 AND content = 'A late answer [1].'",
        [conversation.rows[0].id],
      )).rowCount, 0);
    });
  } finally {
    await client?.end();
    await server.stop();
    await database.close();
  }
});
