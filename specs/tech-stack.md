# Tech Stack

## Framework
- **Next.js** (fullstack — App Router, API routes for backend, React for UI)

## RAG / Orchestration
- **LangChain** (JS/TS) for document loading, chunking, embedding orchestration, and retrieval chains
- **Re-ranking (RAG stage 2, if needed):** after initial vector similarity retrieval, optionally re-rank top-N candidates with a cross-encoder/re-ranker (e.g. Cohere Rerank, or a local cross-encoder) before passing final top-k to the LLM. Treated as an optional quality upgrade — see `roadmap.md` for when to add it.

## Vector store
- **Vercel Postgres + `pgvector`**
- Rationale: local Chroma/embedded stores don't persist on Vercel's serverless functions (no durable disk). Postgres+pgvector works both locally (via Docker/local Postgres) and on Vercel Postgres in production — same schema, no swap needed between environments.
- `file_id` stored as a metadata/column on each vector row, used as a hard filter at query time (never optional).
- All file and conversation access is also scoped to the current anonymous workspace. The backend must validate ownership, including for retrieval, citations, deletion, and streaming.

## Workspace lifecycle
- Each tab has a separate anonymous workspace; no login is required.
- Refreshing the same tab preserves its workspace, uploaded documents, conversation history, file selection, and conversation model selection.
- Closing the tab ends that workspace and discards its files, extracted chunks, embeddings, conversations, and messages. Reopening the app begins a fresh workspace.
- Cleanup must include server-side data, not just browser state.
- Before implementation is considered complete, validate refresh versus tab-close behavior and establish cleanup timing and fallback handling for interrupted sessions. Lifecycle implementation details remain to be verified.
- Explicitly deleting a file during an active session removes its document content, chunks, and embeddings, but preserves related conversations as read-only until session cleanup. Keep enough metadata to identify the removed source and show the notice; do not retrieve or generate further answers for those conversations.

## Document parsing (by upload type)
- Text-based PDF → LangChain PDF loader (or `pdf-parse`); retain page metadata for citations
- DOCX → `mammoth` or LangChain DOCX loader
- Legacy DOC → required in the first release; validate a compatible parser/conversion path using actual `.doc` fixtures
- TXT / Markdown → plain text loader
- Scanned/image-only PDFs and OCR are out of scope; show a clear error when a document has no extractable text.
- Documents and questions support English and Persian. Preserve Unicode text throughout parsing, retrieval, and rendering.
- Initial upload size limit: configurable 10 MB per file; revisit with representative documents.

## Embeddings & LLM
- **Dual provider support:** OpenAI (`gpt-4.1-mini`) and Anthropic (`claude-haiku-4-5-20251001`), selectable through `modelId` in the chat API; the UI model selector is a later phase
- Embeddings: the fixed OpenAI `text-embedding-3-small` model (1536 dimensions), regardless of the selected chat model; switching chat models must not require re-embedding documents
- First/default answer model: OpenAI `gpt-4.1-mini`; Anthropic chat: `claude-haiku-4-5-20251001`. Model IDs are stored with conversations/messages. Changing providers does not change embeddings.
- Retrieval takes the top 20 pgvector candidates and fuses their vector rank with BM25 lexical ranking before returning at most five excerpts. This is a lightweight local reranker; evaluate against representative documents before relying on quality gains.
- Each request uses only the current question and retrieved evidence from its selected file. Stored chat history must not be supplied as retrieval or answer context.
- Return citations linked to retrieved passages, with page numbers only where supplied by the document parser. The server must validate citation references against the retrieved evidence.

## UI stack
- **shadcn/ui** — base component library (sidebar, buttons, dropdowns/model selector, panels)
- **AI Elements** (built on shadcn) — conversation/message thread primitives, reasoning display, prompt input
- **generative-loaders** (`npm install generative-loaders`) — token-by-token text reveal using the **dissolve** effect for streamed answers, instead of snapping in full text
- Layout inspiration: Claude's web app at claude.ai — collapsible left sidebar (current workspace's chat history), centered prompt input, model selector near the input, right-side upload panel
- Product name: **DocLens**. Tagline: **Your documents. Grounded answers.**
- Support light and dark themes, English and Persian content, and right-to-left rendering where appropriate.

## Data model (draft)

| Entity | Fields |
|---|---|
| Workspace | id, created_at, lifecycle/cleanup metadata (implementation TBD) |
| File | id, workspace_id, filename, upload_date, status (pending/chunked/embedded/failed) |
| Chunk/Vector | id, file_id, chunk_text, embedding, chunk_index, source_location (including page number when available) |
| Conversation | id, workspace_id, file_id (nullable until selected or after deletion), source_filename, source_removed_at (nullable), title, selected_model, created_at |
| Message | id, conversation_id, role (user/assistant), content, citations, model_used, created_at |

- A deleted source must remain distinguishable from a conversation that has never selected a file. Do not rebind a source-removed conversation to another file; selecting a different file starts a new conversation.

## Deployment target
- **Local first** — full dev/testing loop on local Postgres+pgvector
- **Then Vercel** — same Next.js app, Vercel Postgres for the vector store, same schema/migrations
- Env vars for OpenAI key, Anthropic key, Postgres connection string (local vs. Vercel-provided)
