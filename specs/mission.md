# Mission

## What this is

**DocLens** is a single-file-scoped RAG (Retrieval-Augmented Generation) document Q&A system, built as a bootcamp challenge, with a chat interface inspired by Claude's web app at claude.ai. The deliverable is: **upload documents, pick exactly one to chat with, and get answers strictly from that document.**

Tagline: **Your documents. Grounded answers.**

## Core principles (non-negotiable)

These rules override convenience or shortcuts at every phase of implementation.

1. **File isolation.** A question asked against File A must never be answered using content from File B. This is the single most important behavior being tested. Retrieval is always filtered to the one selected file.
2. **Grounded-only answers.** The chatbot answers only from retrieved chunks — never from the model's general knowledge, even when it "knows" the answer.
3. **No answer without support.** If nothing relevant is retrieved in the selected file, the bot says so plainly. It never guesses or hallucinates to fill the gap.
4. **Explicit selection required.** The user must upload and then actively select a file before asking questions. No default/ambiguous "search everything" mode.
5. **Independent questions.** Earlier chat messages are display history only. Each question is retrieved and answered independently, without using earlier messages as context.
6. **Separate, temporary workspaces.** Each tab has its own anonymous workspace. Refreshing preserves its files and chat history; closing the tab discards them. Visitors must never access another workspace's data.

## Definition of done

- User can upload documents (text-based PDF, DOCX, legacy DOC, TXT, MD) via a right-side upload panel
- Start with a configurable 10 MB per-file upload limit, revisited when representative documents are available
- Documents are chunked, embedded, and stored per-file
- User selects exactly one uploaded file to chat with
- Chat UI resembles Claude's web app: collapsible sidebar of conversations from the current tab's workspace, centered prompt input, model selector, streaming token-by-token responses, reasoning indicator while generating
- Answers include clickable citations to supporting passages, with page numbers where available
- Documents and questions support English and Persian, including correct right-to-left text rendering
- Both light and dark themes are available
- Deleting a document keeps its conversations visible as read-only history until the tab closes, with an explicit source-removed notice
- Unanswerable-within-file questions get an honest "not found" response
- Deployed successfully to Vercel after local validation

## Out of scope (for now)

- User authentication / multi-user accounts
- Multi-file / cross-file queries in a single question
- Contextual follow-up questions based on earlier chat messages
- Scanned/image-only PDFs and OCR
- Permanent document or conversation storage beyond the tab's session
- Live/external document sync
- Category system (superseded by single-file scope)
