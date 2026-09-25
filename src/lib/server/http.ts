import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerConfig } from "@/lib/server/env";
import { getDatabase } from "@/lib/server/database";
import { requireWorkspace, WorkspaceAccessError } from "@/lib/workspaces/repository";
import { parseWorkspaceCredentials } from "@/lib/workspaces/credentials";
import { HttpError } from "@/lib/errors";
export { HttpError } from "@/lib/errors";

export function jsonError(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: "Workspace unavailable or expired." }, { status: 401 });
  const configMessage = error instanceof Error && error.message.startsWith("Invalid server configuration:")
    ? error.message
    : null;
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    && /^[A-Z0-9_]{2,20}$/.test(error.code) ? error.code : null;
  console.error(configMessage ?? (code ? `Request failed (${code}).` : "Request failed."));
  return NextResponse.json({ error: "The request could not be completed." }, { status: 500 });
}

export function enforceSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== getServerConfig().APP_ORIGIN) {
    throw new HttpError(403, "Request origin is not allowed.");
  }
}

export async function authenticatedWorkspace(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const credentials = parseWorkspaceCredentials({
    workspaceId: request.headers.get("x-workspace-id"),
    accessToken,
  });
  if (!credentials) throw new WorkspaceAccessError();
  const client = await getDatabase().connect();
  try {
    await requireWorkspace(client, credentials);
  } finally {
    client.release();
  }
  return credentials;
}

export async function readJson<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, "Request fields are invalid.");
  return result.data;
}

export function isUuid(value: string) {
  return z.uuid().safeParse(value).success;
}
