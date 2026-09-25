# Roadmap

High-level implementation order, broken into small phases. Each phase should be independently testable before moving to the next. Backend/RAG core comes first, then UI, then deployment.

Implementation status: Phases 1–11 are implemented. The subsequent `design.md` redesign replaces the earlier light/dark direction with a dark cherry frame, graphite chat panel, responsive history rail, and mobile document bottom sheet. Local and browser validation details are recorded in `docs/design-validation.md`. The right-side glass document drawer supports a composer upload trigger, drag-and-drop or browse, selection, and deletion. Production provider calls and deployment are not verified. Phase 4 close-time physical cleanup is eventual via the sweeper, not immediate.

## Phase 0 — Project setup
- Scaffold Next.js app (App Router, TypeScript)
- Install LangChain, `pgvector` client, doc-parsing libs, shadcn/ui, AI Elements, `generative-loaders`
- Set up local Postgres with `pgvector` extension (Docker recommended, to mirror Vercel Postgres later)
- Env config for OpenAI key, Anthropic key, Postgres connection string
- Establish anonymous workspace ownership and plan the tab-session lifecycle: preserve on refresh, discard on tab close, and clean up server-side data. Validate close/refresh detection and interrupted-session cleanup before relying on the lifecycle promise.

## Phase 1 — Single-document ingestion
- API route: accept one file (start with TXT, simplest)
- Parse → chunk → embed → store in Postgres/pgvector, tagged with `file_id` and tied to the active workspace
- Retain source locations for citations and enforce the initial configurable 10 MB per-file limit
- Verify: inspect stored chunks/embeddings directly (SQL query), confirm chunking looks sane

## Phase 2 — Basic retrieval + answer (single file, no streaming yet)
- Given a question + `file_id`, embed the question, retrieve top-k chunks filtered by `file_id`, pass to LLM with a grounded-only prompt
- Validate workspace ownership before retrieval; never include earlier chat messages in retrieval or answer context
- Include clickable passage citations in the response data, with page numbers where available
- Pick and lock in embedding model + first chat model (OpenAI or Anthropic) here
- Verify: known-answer question → correct grounded answer
- Verify: question not covered by the file → bot says "not found," no hallucination

## Phase 3 — Expand parsing to all formats
- Add text-based PDF, DOCX, legacy DOC, and Markdown parsing alongside TXT; validate legacy DOC separately
- Support English and Persian documents and queries; scanned/image-only PDFs and OCR are out of scope
- Verify: same ingestion pipeline works for each format independently

## Phase 4 — File management backend
- API routes: upload file, list files, get file status, delete file
- Scope every operation to the active anonymous workspace
- Deleting a file removes its document data and vectors but marks its existing conversations as source-removed and read-only until the tab closes
- Implement workspace cleanup for files, chunks, embeddings, conversations, and messages at session end, including fallback cleanup for interrupted sessions
- Verify: full flow via API calls — upload → check status (pending/chunked/embedded/failed) → delete

## Phase 5 — Dual model provider support
- Add Anthropic + OpenAI chat model support behind a single interface in the retrieval/answer chain (implemented: OpenAI `gpt-4.1-mini`, Anthropic `claude-haiku-4-5-20251001`)
- Confirm embeddings stay provider-independent (switching chat model doesn't require re-embedding)
- Verify: same question, same file, both providers → both return grounded answers (provider-neutral contract/call routing covered by tests; live provider calls need configured keys)

## Phase 6 — Re-ranking (RAG stage 2, add only if retrieval quality needs it)
- After initial vector similarity search, rerank the top 20 candidates with BM25 lexical relevance fused with vector rank, then select top 5 (implemented; no external key/service required)
- Verify: compare answer quality/relevance with vs. without re-ranking on a few tricky questions; keep it only if it measurably helps (a deterministic lexical-match benchmark passes; representative real-document evaluation remains outstanding)

## Phase 7 — Core chat UI (Claude web-style layout)
- Build layout with shadcn: collapsible left sidebar (conversation list), centered prompt input, model selector
- Use the DocLens name and "Your documents. Grounded answers." tagline; support light and dark themes
- Wire up AI Elements for the conversation/message thread display
- Render English and Persian content with appropriate text direction; make citations open their supporting passages
- Connect to Phase 2/5 backend: send question + selected file + selected model, display answer
- No streaming or reasoning indicator yet — plain request/response display first

## Phase 8 — Streaming + reasoning indicator
- Stream LLM response token-by-token from backend (SSE or streaming API route)
- Use AI Elements' reasoning component to show a "thinking" state while generating, before/alongside the streamed answer
- Integrate `generative-loaders` dissolve effect so streamed tokens render with the dissolve animation instead of appearing in a flat snap

## Phase 9 — Upload panel (glass sidebar)
- Add an upload trigger button next to the prompt input
- On click, open a right-side glass-effect panel (shadcn Sheet/Dialog + custom glass/blur styling) containing:
  - File upload control
  - List of already-uploaded files
  - Delete action per file
  - Select action to choose the active file for the current conversation
- Wire to Phase 4 backend (upload, list, delete)

## Phase 10 — File selection → chat binding
- Ensure a conversation is bound to exactly one selected file (enforced in UI: can't send a message with no file selected)
- Reflect selected file clearly in the chat UI (e.g. header or badge)
- Preserve the current workspace and its chat state on refresh; source-removed conversations show the notice and block further questions
- Verify: switching selected file mid-session starts a new conversation scope, doesn't mix retrieval across files (browser regression and database binding test pass)

## Phase 11 — Polish & edge cases
- Empty state (no files uploaded yet), file still processing, malformed/unparseable upload, empty query
- Sidebar collapse/expand behavior, loading states across upload/chat
- Re-confirm file isolation under all edge cases
- Verify separate visitors/tabs cannot access one another's files, chats, or citations
- Verify refreshing retains files and chats, closing the tab discards the workspace, and cleanup covers server-side data; test interrupted-session handling
- Verify deleting a file leaves its chat history visible with a source-removed notice and cannot be bypassed via the API
- Verify each question is independent of prior messages, citations refer to the selected file, and English/Persian rendering works in both themes

## Phase 12 — Deploy to Vercel
- Provision Vercel Postgres, enable `pgvector`, run migrations
- Set production env vars (API keys, DB connection string)
- Deploy Next.js app, smoke-test full flow in production: upload → select → ask → streamed grounded answer
