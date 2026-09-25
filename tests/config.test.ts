import assert from "node:assert/strict";
import { test } from "node:test";
import { parseServerConfig } from "../src/lib/config";

const database = { DATABASE_URL: "postgresql://user:password@localhost:5432/doclens" };

test("Phase 0 runs without provider keys and treats blank keys as unconfigured", () => {
  const config = parseServerConfig({ ...database, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: " " });
  assert.equal(config.OPENAI_API_KEY, undefined);
  assert.equal(config.DOCLENS_AVALAI_API_KEY, undefined);
  assert.equal(config.OPENAI_BASE_URL, "https://api.avalai.ir/v1");
  assert.equal(config.ANTHROPIC_API_KEY, undefined);
  assert.equal(config.MAX_UPLOAD_SIZE_MB, 10);
});

test("OpenAI-compatible provider URL can be overridden and must be a URL", () => {
  assert.equal(parseServerConfig({ ...database, OPENAI_BASE_URL: "https://example.com/v1" }).OPENAI_BASE_URL, "https://example.com/v1");
  assert.throws(() => parseServerConfig({ ...database, OPENAI_BASE_URL: "invalid" }));
});

test("invalid configuration reports field names without exposing values", () => {
  assert.throws(
    () => parseServerConfig({ DATABASE_URL: "https://private-password@example.com/db" }),
    (error: unknown) => error instanceof Error
      && error.message.includes("DATABASE_URL")
      && !error.message.includes("private-password"),
  );
});

test("invalid upload bounds and session cleanup timing are rejected", () => {
  assert.throws(() => parseServerConfig({ ...database, MAX_UPLOAD_SIZE_MB: "-1" }));
  assert.throws(() => parseServerConfig({
    ...database, WORKSPACE_IDLE_TTL_SECONDS: "60", WORKSPACE_CLOSE_GRACE_SECONDS: "120",
  }));
});

test("origin configuration cannot contain credentials or a path", () => {
  assert.throws(() => parseServerConfig({ ...database, APP_ORIGIN: "https://user:secret@example.com" }));
  assert.throws(() => parseServerConfig({ ...database, APP_ORIGIN: "https://example.com/path" }));
});
