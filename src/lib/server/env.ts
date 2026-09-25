import "server-only";

import { parseServerConfig } from "@/lib/config";

export function getServerConfig() {
  return parseServerConfig(process.env);
}

export function requireProviderKey(provider: "openai" | "anthropic") {
  const config = getServerConfig();
  if (provider === "openai") {
    const key = config.DOCLENS_AVALAI_API_KEY ?? config.OPENAI_API_KEY;
    if (!key) throw new Error("Configure DOCLENS_AVALAI_API_KEY before using this provider.");
    return key;
  }
  const key = config.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("Configure ANTHROPIC_API_KEY before using this provider.");
  }
  return key;
}
