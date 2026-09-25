import { loadEnvConfig } from "@next/env";
import { parseServerConfig } from "../src/lib/config";

export function loadDatabaseConfig() {
  loadEnvConfig(process.cwd());
  return parseServerConfig(process.env);
}
