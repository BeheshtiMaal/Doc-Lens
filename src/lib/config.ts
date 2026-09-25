import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const serverConfigSchema = z.object({
  DATABASE_URL: z.url().refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "postgres:" || protocol === "postgresql:";
    } catch {
      return false;
    }
  }),
  DOCLENS_AVALAI_API_KEY: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_BASE_URL: z.url().default("https://api.avalai.ir/v1"),
  ANTHROPIC_API_KEY: optionalSecret,
  CRON_SECRET: optionalSecret,
  APP_ORIGIN: z.url().default("http://localhost:3000").refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol)
        && url.origin === value && !url.username && !url.password;
    } catch {
      return false;
    }
  }),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().max(100).default(10),
  WORKSPACE_IDLE_TTL_SECONDS: z.coerce.number().int().min(60).default(1800),
  WORKSPACE_CLOSE_GRACE_SECONDS: z.coerce.number().int().min(10).default(120),
}).refine(
  (value) => value.WORKSPACE_CLOSE_GRACE_SECONDS < value.WORKSPACE_IDLE_TTL_SECONDS,
  { path: ["WORKSPACE_CLOSE_GRACE_SECONDS"], message: "Must be shorter than the idle TTL." },
);

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export function parseServerConfig(input: Record<string, string | undefined>): ServerConfig {
  const result = serverConfigSchema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    // Never include supplied environment values (especially secrets) in errors.
    throw new Error(`Invalid server configuration: ${fields.join(", ")}. Check .env.local against .env.example.`);
  }
  return result.data;
}
