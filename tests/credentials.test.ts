import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWorkspaceCredentials, hashWorkspaceToken, parseWorkspaceCredentials,
} from "../src/lib/workspaces/credentials";

test("workspace credentials are independent and only their hash belongs in storage", () => {
  const first = createWorkspaceCredentials();
  const second = createWorkspaceCredentials();
  assert.notEqual(first.workspaceId, second.workspaceId);
  assert.notEqual(first.accessToken, second.accessToken);
  assert.deepEqual(parseWorkspaceCredentials(first), first);
  const hash = hashWorkspaceToken(first.accessToken);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, first.accessToken);
});

test("a workspace id without its secret token does not authorize access", () => {
  assert.equal(parseWorkspaceCredentials({ workspaceId: createWorkspaceCredentials().workspaceId }), null);
  assert.equal(parseWorkspaceCredentials({ workspaceId: "bad", accessToken: "bad" }), null);
});
