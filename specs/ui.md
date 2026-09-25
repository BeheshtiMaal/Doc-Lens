# UI Spec

Detailed interface behavior, layered on top of `mission.md`, `tech-stack.md`, and `roadmap.md`. Reference implementation feel: **Claude's web chat interface at claude.ai**.

Product name: **DocLens**. Tagline: **Your documents. Grounded answers.** Support both light and dark themes.

## Layout overview

```
┌───────────┬──────────────────────────────────────────┐
│           │                                            │
│  Sidebar  │              Conversation area             │
│ (chats,   │         (message thread, scrollable)        │
│ collapsible)                                            │
│           │                                            │
│           ├──────────────────────────────────────────┤
│           │  [Upload] [Model selector]                │
│           │        Prompt input (centered)             │
└───────────┴──────────────────────────────────────────┘
```

## 1. Sidebar (left)
- Lists conversations in the current tab's anonymous workspace, most recent first
- Collapsible/expandable, with an icon-only collapsed state
- Built with shadcn's `Sidebar` component
- Selecting a past conversation loads its message history and its bound file
- Refreshing the page retains this history; closing the tab discards it along with uploaded files.
- Conversations whose source was deleted remain visible and read-only until the tab closes.

## 2. Conversation area (center)
- Built with **AI Elements** conversation/message primitives
- Renders user and assistant messages as a chat thread
- Earlier messages are displayed as history only. Each question is answered independently, without using previous messages as context.
- Answers include clickable citations that reveal supporting passages, with page numbers where available. Do not invent page numbers for formats that do not provide them.
- Render English and Persian text, including appropriate right-to-left direction and mixed-language content.
- Assistant messages stream in — see Streaming behavior below
- Shows a **reasoning indicator** (AI Elements' reasoning component) while the answer is being generated, before/alongside the streamed tokens — signals retrieval + generation is in progress, not a hang

## 3. Prompt input (center, bottom-anchored like Claude)
- Centered input box, similar position/prominence to claude.ai's prompt bar
- Contains or sits beside:
  - **Upload trigger** (icon button, opens the glass upload panel — see below)
  - **Model selector** (dropdown: OpenAI models / Anthropic models)
- Disabled/blocked from sending until a file is selected (see File requirement below)

## 4. Model selector
- Dropdown listing available models from both providers (OpenAI, Anthropic)
- Selection persists per conversation (stored on the Conversation record)
- Switching models mid-conversation does not require re-embedding (embeddings are provider-independent per `tech-stack.md`)

## 5. Upload panel (glass sidebar, right, triggered from prompt input)
- Opens as an overlay panel on the **right** side (distinct from the main collapsible chat sidebar — this is a transient panel, not persistent navigation)
- **Glass/frosted effect**: semi-transparent background with blur (`backdrop-filter: blur(...)`), consistent with shadcn theming — implemented as custom styling on a shadcn `Sheet` or `Dialog`
- Contents:
  - File upload control (drag-and-drop + click-to-browse) accepting text-based PDF, DOCX, legacy DOC, TXT, and Markdown; show the current file size limit (initially 10 MB)
  - List of previously uploaded files, each showing filename and ingestion status (pending/chunked/embedded/failed)
  - **Delete** action per file
  - **Select** action per file — sets it as the active file for the current/new conversation
- Closing the panel returns focus to the prompt input
- Scanned/image-only PDFs are unsupported; show a clear error if no text can be extracted.

## 6. File requirement (hard rule)
- A conversation cannot proceed without a selected file
- If no file is selected, the prompt input is disabled or sending is blocked, with a visible prompt to upload/select a file first
- The currently selected file is visibly indicated near the conversation area (e.g. a small badge/header showing the active filename)
- If that file is deleted, keep the conversation visible but block further questions. Show: **"The source file was removed. This conversation can no longer continue."**
- A source-removed conversation cannot resume by selecting another document; that selection starts a new conversation. Its old citations must indicate that the source is unavailable.

## 7. Streaming behavior
- Assistant responses stream token-by-token (not delivered as a full block)
- Uses `generative-loaders`, **dissolve** effect specifically, for how each token visually appears
- Reasoning indicator (see #2) shows first/concurrently, transitioning into the dissolving token stream as generation proceeds

## 8. States to design for
- Empty state: no conversations yet, no files uploaded — prompt user to upload first
- File processing: selected file still embedding — block questions with a status message, not a silent failure
- Upload failure: malformed/unsupported file — clear error in the upload panel, file marked "failed," retry option
- No relevant answer: assistant responds with an honest "not found in this document" message, styled distinctly enough not to be mistaken for a real answer (but not alarming)
- Source removed: retain the message thread with the explicit notice from #6 and a disabled composer until the tab closes

## 9. Session footer (always clearly visible)
- Render exactly one clearly visible footer below the prompt area, outside the scrolling conversation thread, in both empty and active chat states. Do not repeat the notice in messages, panels, or other areas.
- Copy: **"Files and chat history are temporary. Refreshing keeps them; closing this tab discards them."**
- Use readable text size and contrast in both light and dark themes; do not hide the notice in a tooltip, menu, or low-contrast fine print.
- Keep the notice visible and allow it to wrap on narrow screens without overlapping the composer.
- Closing the upload panel or collapsing the sidebar does not end the workspace. Refreshing preserves it; closing the browser tab ends it.

## Component mapping (implementation reference)

| UI piece | Library |
|---|---|
| Collapsible chat sidebar | shadcn `Sidebar` |
| Message thread, reasoning indicator | AI Elements |
| Model selector dropdown | shadcn `Select`/`DropdownMenu` |
| Prompt input | AI Elements prompt input primitive |
| Upload panel | shadcn `Sheet` or `Dialog` + custom glass styling |
| Token streaming animation | `generative-loaders` (dissolve) |
