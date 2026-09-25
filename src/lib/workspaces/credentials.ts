import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

const credentialsSchema = z.object({
  workspaceId: z.uuid(),
  accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export type WorkspaceCredentials = z.infer<typeof credentialsSchema>;

export function createWorkspaceCredentials(): WorkspaceCredentials {
  return { workspaceId: randomUUID(), accessToken: randomBytes(32).toString("base64url") };
}

export function parseWorkspaceCredentials(value: unknown): WorkspaceCredentials | null {
  const result = credentialsSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function hashWorkspaceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
