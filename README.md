# DocLens

Your documents. Grounded answers.

DocLens implements the cherry-and-graphite workspace in `design.md`: a responsive conversation sidebar, an animated hero-to-chat transition, grounded messages, model selection, passage popovers, and a glass document drawer (a bottom sheet on mobile). Answers stream into the thread with retrieval progress and a dissolve effect. The backend from Phases 1–6 handles workspace-isolated ingestion, retrieval, grounded answers, and cleanup.

## Prerequisites

- Node.js 24 LTS recommended (minimum 22.16), npm.
- Docker with Compose for the recommended PostgreSQL setup. A development-only PGlite fallback is also included.
- An AvalAI API key is required for document embeddings and OpenAI-compatible answers. It is not required for lint, typechecking, database migrations, or tests.

## Install and configure

Run `npm ci`, then copy `.env.example` to `.env.local` if no local file exists.

The current workspace has a gitignored `.env.local` configured for the embedded database, with blank provider keys. Never commit this file. The example configuration uses the Docker database URL; choose the URL matching the database you run.

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | Server-only PostgreSQL connection string |
| DOCLENS_AVALAI_API_KEY | AvalAI key for ingestion and OpenAI-compatible chat; takes priority over OPENAI_API_KEY |
| OPENAI_API_KEY | Optional legacy fallback if DOCLENS_AVALAI_API_KEY is unset |
| OPENAI_BASE_URL | OpenAI-compatible API endpoint; defaults to https://api.avalai.ir/v1 |
| ANTHROPIC_API_KEY | Unused; all chat and embedding requests go through AvalAI using `DOCLENS_AVALAI_API_KEY` (or `OPENAI_API_KEY` fallback) |
| APP_ORIGIN | Canonical app origin, initially http://localhost:3000 |
| MAX_UPLOAD_SIZE_MB | Initial upload limit, 10 MB |
| WORKSPACE_IDLE_TTL_SECONDS | Proposed fallback cleanup lease, 1800 seconds |
| WORKSPACE_CLOSE_GRACE_SECONDS | Proposed reload grace after a departure hint, 120 seconds |

Secrets stay server-side. Embeddings use `text-embedding-3-small` (1536 vector dimensions), regardless of chat choice. Chat supports `gpt-4.1-mini` and Claude Haiku 4.5 through AvalAI; both chat models and embeddings use the configured AvalAI key and account balance. Reranking combines vector order with BM25 lexical relevance over the top 20 vector candidates, then supplies the best five passages to the answer model.

## Database: Docker (recommended)

Set DATABASE_URL in `.env.local` to:

```text
postgresql://doclens:doclens_local@127.0.0.1:5432/doclens
```

Then run:

```sh
npm run db:up
npm run db:migrate
npm run db:check
```

Compose pins PostgreSQL 17 with pgvector, binds only to localhost, checks readiness, and retains data in a named volume. `npm run db:down` stops the container without deleting data. Do not run the Docker and embedded databases on port 5432 simultaneously.

## Database: embedded local fallback

If Docker is unavailable, set DATABASE_URL to:

```text
postgresql://postgres:postgres@127.0.0.1:5432/postgres
```

In one terminal, run `npm run db:local`. In another, run `npm run db:migrate` followed by `npm run db:check`.

The fallback is PostgreSQL compiled to WebAssembly, with pgvector, exposed to the same `pg` client over localhost. It persists development data in the ignored `.local/postgres` directory. Stop it with Ctrl+C. Its socket multiplexes connections and is not a replacement for production PostgreSQL or full concurrency testing. It does not provide production database authentication; keep it bound to localhost.

Migrations are versioned, transactional, checksummed, and safe to run again. Add migrations; do not edit an already-applied migration. Phase 0 creates workspace ownership; migration 0002 creates files, 1536-dimensional vectors, conversations, and messages; migration 0003 restricts conversation model IDs to the supported providers.

## Run and verify

```sh
npm run dev
npm run check
npm run build
```

The npm commands use `scripts/run-tool.mjs` to normalize the project path before loading Next.js or Playwright. This avoids duplicate request-context modules on Windows when the folder is opened with different letter casing.

Open http://localhost:3000. `GET /api/health` is a liveness check; `npm run db:check` separately verifies the database, workspace schema, vector serialization, and distance operations.

## Document and chat API

Set a valid AvalAI key in `DOCLENS_AVALAI_API_KEY` before using the ingestion and OpenAI-compatible chat routes. The default 10 MB upload limit is configurable via `MAX_UPLOAD_SIZE_MB` (up to 100 MB locally). Supported formats are UTF-8 TXT/Markdown, text-based PDF, DOCX, and legacy OLE-based DOC. Scanned PDFs, OCR, password-protected/unsupported document variants, and DOC/DOCX pagination are not supported. PDF passages keep parser-reported page numbers.

The browser creates a separate anonymous workspace per tab and keeps its secret in `sessionStorage`. Authenticated requests send `Authorization: Bearer <token>` and `x-workspace-id`; write requests also validate the `Origin`. Available endpoints:

- `POST /api/workspaces` with `{"action":"create"}` or `{"action":"resume","credentials":{...}}`.
- `GET /api/files`, `POST /api/files` (multipart field `file`), `GET /api/files/:fileId`, `PATCH /api/files/:fileId` (rename while preserving its extension), `DELETE /api/files/:fileId`.
- `POST /api/chat` with `{ "fileId": "...", "question": "..." }`, optionally `conversationId`, and `modelId` (`openai:gpt-4.1-mini` or `anthropic:claude-haiku-4-5-20251001`). The default is OpenAI. Each request only uses that file and the current question; previous messages are display history only. The response contains citations validated against passages actually retrieved and the chosen `modelId`.
- `POST /api/chat/stream` accepts the same body and returns server-sent `phase`, `delta`, `done`, and `error` events. The UI shows retrieval/generation status and renders incoming text with a progressive word dissolve effect. The `done` event contains the final, citation-validated, persisted answer; incoming text is provisional until that event.
- `GET /api/conversations`, `GET /api/conversations/:conversationId`, `PATCH /api/conversations/:conversationId` (rename), and `DELETE /api/conversations/:conversationId`.

Configure `CRON_SECRET` to at least 16 random characters in production. Vercel calls the protected `/api/cron/cleanup` endpoint daily; run `npm run db:sweep` manually for local cleanup. A page-close hint makes a workspace unavailable after the configured 120-second reload grace. Since browser close signals are best effort, *physical deletion happens on the scheduled sweep*, not at the instant of closing. Vercel Hobby schedules run only daily, so closed workspace source data may remain on disk until the next sweep; choose an appropriate plan/schedule before production use.

Vercel Functions reject request/response bodies above 4.5 MB. The current 10 MB multipart handler works locally, but production uploads above 4.5 MB require a separate direct-upload path (for example private object storage) before claiming the full configured cap.

For browser checks:

```sh
npx playwright install chromium
npm run test:browser
```

On Windows with Microsoft Edge already installed, use `$env:PLAYWRIGHT_CHANNEL='msedge'` in PowerShell before running the browser checks to avoid an extra browser download.

After `npm run build`, you can test the optimized build without waiting for the Next.js development server's first compile by also setting `$env:PLAYWRIGHT_WEB_SERVER_COMMAND='npm run start -- --hostname 127.0.0.1 --port 3100'` before `npm run test:browser`.

`npm run check` tests configuration, migration repeatability, actual vector operations, workspace/file isolation, source-removal history, cleanup cascades, parser fixtures (including PDF, DOCX, and legacy DOC), Unicode Persian content, and source locations. These checks use an ephemeral in-memory PostgreSQL/pgvector database and do not call paid AI APIs. Browser checks cover the dark cherry design, refresh persistence, keyboard access, Persian direction, responsive layouts, reduced motion, model selection, progressive streaming and cancellation, multiple uploads, document actions, citation reveal, and runtime errors. The chat browser flow mocks the answer API; no live provider call has been tested.

## Project map

- `src/app`: App Router pages, layout, global styles, and liveness route.
- `src/components/ui`: official shadcn/ui components.
- `src/components/ai-elements`: official AI Elements source components.
- `src/lib/server`: server-only environment and database access.
- `src/lib/workspaces`: hashed bearer-token ownership, lifecycle, and cleanup.
- `src/lib/documents`: format validation, page-aware parsing/chunking, ingestion, and deletion.
- `src/lib/chat`: single-file retrieval and independent grounded answers.
- `db/migrations`: PostgreSQL migrations.
- `scripts`: local database launcher, migrations, and verification.
- `specs`: product requirements and phased roadmap.
- `docs/workspace-lifecycle.md`: tab ownership, reload/close limitations, and the cleanup plan.

## Installed foundations and boundaries

LangChain and its OpenAI/Anthropic integrations, the AI SDK, `pg`/`pgvector`, `pdf-parse`, `mammoth`, `word-extractor` (legacy DOC), and `generative-loaders` are installed and locked. Parser behavior and fixtures are implemented in Phases 1–3. The current redesign uses a CSS word dissolve for streamed answers, with a reduced-motion fade.

Workspace credentials are generated with cryptographic randomness, stored hashed on the server, and checked for ownership and expiry. Browser session transport, heartbeats, deletion, and sweeping are active as described in the [lifecycle design](docs/workspace-lifecycle.md). Immediate server-side deletion at the instant of every browser-tab close is not guaranteed by browser APIs.

The UI uses AI Elements conversation/message primitives, Radix accessible dialogs and menus, and Motion for the hero transition and drawer gestures. It follows the dark-only design in `design.md`, which supersedes the earlier light/dark UI direction. The upload tab, locked composer, Ctrl/Cmd+U shortcut, or window file drop opens the document drawer. Multiple PDF, DOCX, TXT, and Markdown files can be uploaded; the UI caps each file at 10 MB or a smaller server limit. Document and chat menus support rename and delete, and removed documents leave read-only chat history. Legacy DOC remains supported by the API.

## References

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [shadcn/ui for Next.js](https://ui.shadcn.com/docs/installation/next)
- [AI Elements](https://elements.ai-sdk.dev/)
- [pgvector](https://github.com/pgvector/pgvector)
- [PGlite socket development server](https://pglite.dev/docs/pglite-socket)
