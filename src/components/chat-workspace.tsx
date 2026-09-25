"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUp, ChevronDown, FileText, LockKeyhole, Menu, Square, Upload, X } from "lucide-react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message } from "@/components/ai-elements/message";
import { AnswerMessage, LensMark, RenameDialog, ScreenNotice, WorkspaceSidebar } from "@/components/doclens-ui";
import { DocumentDrawer } from "@/components/document-drawer";
import { shortFilename, type ChatMessage, type ConversationRecord, type FileRecord, type UploadJob } from "@/components/doclens-types";
import { useWorkspaceSession, type WorkspaceSession } from "@/components/workspace-session";
import { ANTHROPIC_CHAT_MODEL_ID, isChatModelId, OPENAI_CHAT_MODEL_ID, type ChatModelId } from "@/lib/ai/chat-models";
import { readChatEventStream } from "@/lib/chat/stream-protocol";
import { cn } from "@/lib/utils";

type PendingAnswer = { question: string; tokens: string[]; phase: "retrieving" | "generating" };
const NEW_CONVERSATION = "new";

type DocumentMention = { start: number; end: number; query: string };

function findDocumentMention(value: string, caret: number): DocumentMention | null {
  const beforeCaret = value.slice(0, caret);
  const match = /(?:^|\s)@([^@\n]*)$/u.exec(beforeCaret);
  if (!match || match[1].length > 100) return null;
  return { start: caret - match[1].length - 1, end: caret, query: match[1].trim().toLocaleLowerCase() };
}

async function workspaceRequest<T>(session: WorkspaceSession, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("authorization", "Bearer " + session.accessToken);
  headers.set("x-workspace-id", session.workspaceId);
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Request failed (" + response.status + ").");
  }
  return response.json() as Promise<T>;
}

export function ChatWorkspace() {
  const { session, status } = useWorkspaceSession();
  const reducedMotion = useReducedMotion();
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationRecord | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<ChatModelId>(OPENAI_CHAT_MODEL_ID);
  const [draft, setDraft] = useState("");
  const [mention, setMention] = useState<DocumentMention | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<PendingAnswer | null>(null);
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState(10);
  const [draggingFile, setDraggingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; kind: "chat" | "document" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [hint, setHint] = useState(false);
  const requestSerial = useRef(0);
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadTrigger = useRef<HTMLButtonElement>(null);
  const promptTextarea = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const uploadLock = useRef(false);
  const answerAbort = useRef<AbortController | null>(null);

  const refreshConversations = useCallback(async (current: WorkspaceSession) => {
    const result = await workspaceRequest<{ conversations: ConversationRecord[] }>(current, "/api/conversations");
    setConversations(result.conversations); return result.conversations;
  }, []);
  const refreshFiles = useCallback(async (current: WorkspaceSession) => {
    const result = await workspaceRequest<{ files: FileRecord[]; maxSizeMb: number }>(current, "/api/files");
    setFiles(result.files);
    if (result.maxSizeMb > 0) setMaxUploadSizeMb(Math.min(10, result.maxSizeMb));
    return result.files;
  }, []);
  const openConversation = useCallback(async (current: WorkspaceSession, id: string) => {
    const serial = ++requestSerial.current;
    setLoading(true); setError(null);
    try {
      const result = await workspaceRequest<{ conversation: ConversationRecord; messages: ChatMessage[] }>(current, "/api/conversations/" + id);
      if (serial !== requestSerial.current) return;
      setActiveConversation(result.conversation); setMessages(result.messages);
      setSelectedFileId(result.conversation.fileId);
      if (isChatModelId(result.conversation.selectedModel)) setModelId(result.conversation.selectedModel);
      sessionStorage.setItem("doclens.activeConversation:" + current.workspaceId, id);
      if (result.conversation.fileId) sessionStorage.setItem("doclens.activeFile:" + current.workspaceId, result.conversation.fileId);
      else sessionStorage.removeItem("doclens.activeFile:" + current.workspaceId);
    } catch (cause) { if (serial === requestSerial.current) setError(cause instanceof Error ? cause.message : "Chat could not be loaded."); }
    finally { if (serial === requestSerial.current) setLoading(false); }
  }, []);

  useEffect(() => {
    if (!session) return;
    const current = session; let cancelled = false;
    Promise.all([workspaceRequest<{ conversations: ConversationRecord[] }>(current, "/api/conversations"), workspaceRequest<{ files: FileRecord[]; maxSizeMb: number }>(current, "/api/files")])
      .then(async ([history, documents]) => {
        if (cancelled) return;
        setConversations(history.conversations); setFiles(documents.files);
        if (documents.maxSizeMb > 0) setMaxUploadSizeMb(Math.min(10, documents.maxSizeMb));
        const saved = sessionStorage.getItem("doclens.activeConversation:" + current.workspaceId);
        const id = saved === NEW_CONVERSATION ? undefined : history.conversations.find((chat) => chat.id === saved)?.id ?? history.conversations[0]?.id;
        if (id) await openConversation(current, id);
        else {
          const savedFile = sessionStorage.getItem("doclens.activeFile:" + current.workspaceId);
          if (documents.files.some((file) => file.id === savedFile)) setSelectedFileId(savedFile);
          setLoading(false);
        }
      }).catch((cause) => { if (!cancelled) { setError(cause instanceof Error ? cause.message : "Workspace could not be loaded."); setLoading(false); } });
    return () => { cancelled = true; requestSerial.current += 1; };
  }, [session, openConversation]);

  useEffect(() => {
    if (!session || (!uploading && !files.some((file) => file.status === "pending" || file.status === "chunked"))) return;
    const timer = window.setInterval(() => { void refreshFiles(session).catch(() => undefined); }, 2000);
    return () => window.clearInterval(timer);
  }, [session, files, uploading, refreshFiles]);

  useEffect(() => {
    if (loading || files.length || sessionStorage.getItem("doclens.uploadHint")) return;
    sessionStorage.setItem("doclens.uploadHint", "seen");
    const timer = window.setTimeout(() => setHint(true), 800);
    return () => window.clearTimeout(timer);
  }, [loading, files.length]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") { event.preventDefault(); setDocumentsOpen(true); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    const input = promptTextarea.current;
    if (input) { input.style.height = "auto"; input.style.height = Math.min(150, input.scrollHeight) + "px"; }
  }, [draft, selectedFileId]);
  useEffect(() => () => answerAbort.current?.abort(), []);

  const selectedFile = files.find((file) => file.id === selectedFileId) ?? null;
  const readyFiles = files.filter((file) => file.status === "embedded");
  const sourceRemoved = Boolean(activeConversation?.sourceRemovedAt);
  const hasChat = Boolean(activeConversation || messages.length || pendingAnswer);
  const canType = status === "ready" && readyFiles.length > 0 && !sourceRemoved && !loading && !sending;
  const canSend = canType && selectedFile?.status === "embedded";
  const mentionFiles = mention
    ? readyFiles.filter((file) => file.filename.toLocaleLowerCase().includes(mention.query)).slice(0, 8)
    : [];
  const activeMentionIndex = Math.min(mentionIndex, Math.max(mentionFiles.length - 1, 0));
  const activeMentionId = mentionFiles[activeMentionIndex]?.id;
  useEffect(() => {
    if (mention && activeMentionId) {
      mentionListRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }
  }, [mention, activeMentionId]);
  const processing = uploading || files.some((file) => file.status === "pending" || file.status === "chunked");

  function newConversation() {
    if (sending) return;
    requestSerial.current += 1; setActiveConversation(null); setMessages([]); setError(null); setLoading(false); setDraft(""); setMention(null);
    if (session) sessionStorage.setItem("doclens.activeConversation:" + session.workspaceId, NEW_CONVERSATION);
  }
  function selectFile(file: FileRecord) {
    if (sending || file.status !== "embedded" || !session) return;
    if (activeConversation?.fileId !== file.id) newConversation();
    setSelectedFileId(file.id);
    setMention(null);
    sessionStorage.setItem("doclens.activeFile:" + session.workspaceId, file.id);
    setDocumentsOpen(false);
    window.setTimeout(() => promptTextarea.current?.focus(), reducedMotion ? 130 : 530);
  }
  function updateMention(value: string, caret: number) {
    setMention(findDocumentMention(value, caret));
    setMentionIndex(0);
  }
  function selectMentionFile(file: FileRecord) {
    if (!mention || !session) return;
    const nextDraft = draft.slice(0, mention.start) + draft.slice(mention.end);
    const nextCaret = mention.start;
    selectFile(file);
    setDraft(nextDraft);
    setMention(null);
    window.requestAnimationFrame(() => {
      promptTextarea.current?.focus();
      promptTextarea.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }
  function clearFile() {
    newConversation(); setSelectedFileId(null);
    if (session) sessionStorage.removeItem("doclens.activeFile:" + session.workspaceId);
  }

  async function sendQuestion(value: string) {
    if (!session || !selectedFile || !canSend || !value.trim()) return;
    const question = value.trim(); const controller = new AbortController(); answerAbort.current = controller;
    let streamed = ""; let lastTokenAt = 0;
    // This clock is read only in the submit/regenerate event handler.
    // eslint-disable-next-line react-hooks/purity
    const revealAfter = performance.now() + (!hasChat && !reducedMotion ? 400 : 0);
    setSending(true); setPendingAnswer({ question, tokens: [], phase: "retrieving" }); setError(null); setDraft("");
    const reveal = async (text: string) => {
      for (const token of text.match(/\S+|\s+/gu) ?? []) {
        controller.signal.throwIfAborted();
        if (!/^\s+$/u.test(token)) {
          const wait = Math.max(0, revealAfter - performance.now(), lastTokenAt + (reducedMotion ? 0 : 24) - performance.now());
          if (wait) await new Promise<void>((resolve) => window.setTimeout(resolve, wait));
          controller.signal.throwIfAborted(); lastTokenAt = performance.now();
        }
        streamed += token;
        setPendingAnswer((current) => current && { ...current, tokens: [...current.tokens, token] });
      }
    };
    try {
      const response = await fetch("/api/chat/stream", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + session.accessToken, "x-workspace-id": session.workspaceId },
        body: JSON.stringify({ question, fileId: selectedFile.id, conversationId: activeConversation?.id, modelId }), cache: "no-store", signal: controller.signal });
      const result = await readChatEventStream(response, async (event) => {
        if (event.type === "phase") setPendingAnswer((current) => current && { ...current, phase: event.phase });
        if (event.type === "delta") await reveal(event.text);
      });
      if (!streamed) await reveal(result.answer);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: question, citations: [] }, { id: crypto.randomUUID(), role: "assistant", content: result.answer, citations: result.citations }]);
      sessionStorage.setItem("doclens.activeConversation:" + session.workspaceId, result.conversationId);
      const updated: ConversationRecord = { id: result.conversationId, fileId: selectedFile.id, sourceFilename: selectedFile.filename, sourceRemovedAt: null, title: activeConversation?.title ?? question.slice(0, 40), selectedModel: modelId, updatedAt: new Date().toISOString() };
      setActiveConversation(updated); setConversations((current) => [updated, ...current.filter((chat) => chat.id !== updated.id)]);
      void refreshConversations(session).catch(() => undefined);
    } catch (cause) {
      if (controller.signal.aborted) {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: question, citations: [] }, ...(streamed ? [{ id: crypto.randomUUID(), role: "assistant" as const, content: streamed, citations: [] }] : [])]);
      } else setError(cause instanceof Error ? cause.message : "The answer could not be completed. Try again.");
      void refreshConversations(session).catch(() => undefined);
    } finally { setSending(false); setPendingAnswer(null); answerAbort.current = null; }
  }

  const uploadDocuments = useCallback(async (selected: File[], retryId?: string) => {
    if (!session || uploadLock.current || sending) return;
    uploadLock.current = true; setUploading(true); setUploadError(null); setUploadNotice(null);
    let completed = 0;
    if (retryId) setJobs((current) => current.filter((job) => job.id !== retryId));
    try {
      for (const file of selected) {
        const id = crypto.randomUUID();
        let validation = "";
        if (!/\.(pdf|docx|txt|md|markdown)$/i.test(file.name)) validation = "This file type isn't supported. Use PDF, DOCX, TXT or MD.";
        else if (!file.size) validation = "This file is empty. Choose a document with text.";
        else if (file.size > maxUploadSizeMb * 1024 * 1024) validation = "This file is over " + maxUploadSizeMb + " MB. Try a smaller file.";
        setJobs((current) => [...current, { id, file, progress: 0, status: validation ? "failed" : "uploading", error: validation || undefined }]);
        if (validation) continue;
        const update = (patch: Partial<UploadJob>) => setJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job));
        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/files");
            xhr.setRequestHeader("authorization", "Bearer " + session.accessToken); xhr.setRequestHeader("x-workspace-id", session.workspaceId);
            xhr.upload.onprogress = (event) => { if (event.lengthComputable) update({ progress: Math.round(event.loaded / event.total * 100), status: event.loaded === event.total ? "reading" : "uploading" }); };
            xhr.upload.onload = () => update({ progress: 100, status: "reading" });
            xhr.onerror = () => reject(new Error("Upload couldn't connect. Check your connection and try again."));
            xhr.onload = () => {
              let payload: { error?: string; fileId?: string } = {};
              try { payload = JSON.parse(xhr.responseText); } catch { /* Handled by status below. */ }
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else {
                if (payload.fileId) setJobs((current) => current.filter((job) => job.id !== id));
                reject(new Error(payload.error || "We couldn't read this file. If it's a scan, try a text-based version."));
              }
            };
            const form = new FormData(); form.append("file", file); xhr.send(form);
          });
          completed += 1; setJobs((current) => current.filter((job) => job.id !== id));
        } catch (cause) { update({ status: "failed", error: cause instanceof Error ? cause.message : "Upload failed. Try again." }); }
        await refreshFiles(session);
      }
      if (completed) setUploadNotice(completed === 1 ? "Document ready. Choose Chat to begin." : completed + " documents ready. Choose one to begin.");
    } catch (cause) { setUploadError(cause instanceof Error ? cause.message : "Upload failed. Try again."); }
    finally { uploadLock.current = false; setUploading(false); }
  }, [session, sending, maxUploadSizeMb, refreshFiles]);

  useEffect(() => {
    const enter = (event: DragEvent) => { if (!event.dataTransfer?.types.includes("Files")) return; event.preventDefault(); dragDepth.current++; setDraggingFile(true); setDocumentsOpen(true); };
    const over = (event: DragEvent) => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); };
    const leave = (event: DragEvent) => { if (!event.dataTransfer?.types.includes("Files")) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDraggingFile(false); };
    const drop = (event: DragEvent) => { if (!event.dataTransfer?.types.includes("Files")) return; event.preventDefault(); dragDepth.current = 0; setDraggingFile(false); setDocumentsOpen(true); void uploadDocuments(Array.from(event.dataTransfer.files)); };
    window.addEventListener("dragenter", enter); window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, [uploadDocuments]);

  async function deleteFile(file: FileRecord) {
    if (!session) return;
    try {
      await workspaceRequest(session, "/api/files/" + file.id, { method: "DELETE" });
      const [, history] = await Promise.all([refreshFiles(session), refreshConversations(session)]);
      if (selectedFileId === file.id) setSelectedFileId(null);
      if (activeConversation?.fileId === file.id) setMessages((current) => current.map((message) => ({ ...message, citations: message.citations.map((citation) => ({ ...citation, passage: undefined, sourceUnavailable: true })) })));
      if (activeConversation?.fileId === file.id) setActiveConversation(history.find((chat) => chat.id === activeConversation.id) ?? { ...activeConversation, fileId: null, sourceRemovedAt: new Date().toISOString() });
    } catch (cause) { setUploadError(cause instanceof Error ? cause.message : "Delete failed. Try again."); }
  }
  async function deleteChat(id: string) {
    if (!session) return;
    try { await workspaceRequest(session, "/api/conversations/" + id, { method: "DELETE" }); if (activeConversation?.id === id) newConversation(); await refreshConversations(session); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Delete failed. Try again."); }
  }
  async function rename(name: string) {
    if (!session || !renameTarget) return;
    await workspaceRequest(session, (renameTarget.kind === "chat" ? "/api/conversations/" : "/api/files/") + renameTarget.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(renameTarget.kind === "chat" ? { title: name } : { filename: name }) });
    const [, history] = await Promise.all([refreshFiles(session), refreshConversations(session)]);
    if (activeConversation) setActiveConversation(history.find((chat) => chat.id === activeConversation.id) ?? activeConversation);
  }

  const lockedText = sourceRemoved ? "This document was removed. Chats about it are read-only." : status === "ended" ? "This workspace has ended. Reload to start again." : loading || status === "loading" ? "Opening your workspace…" : !files.length ? "Add a document to begin" : "Choose a document to ask about";
  const layoutTransition = { duration: reducedMotion ? 0.12 : hasChat ? 0.64 : 0.48, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };

  return <div className="doclens-shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <WorkspaceSidebar conversations={conversations} activeId={activeConversation?.id ?? null} busy={sending} hasFiles={files.some((file) => file.status === "embedded")} onSelect={(id) => { if (session) void openConversation(session, id); }} onNew={newConversation} onRename={(chat) => setRenameTarget({ id: chat.id, name: chat.title, kind: "chat" })} onDelete={deleteChat} mobileOpen={mobileSidebarOpen} setMobileOpen={setMobileSidebarOpen} />
    <main id="main-content" ref={setPanel} tabIndex={-1} className={cn("main-panel", hasChat && "is-chat", documentsOpen && "drawer-is-open")}>
      <div className="panel-surface grain" />
      <div className="panel-content">
        <div className="glass-header" aria-hidden="true" />
        <button className="mobile-menu icon-button" aria-label="Open chat history" onClick={() => setMobileSidebarOpen(true)}><Menu size={20} /></button>
        <motion.div layout={!reducedMotion} className="brand-position" transition={layoutTransition}>
          <motion.div layout={!reducedMotion} className="main-brand" transition={layoutTransition}>
            <motion.div layout={!reducedMotion} transition={layoutTransition}><LensMark className="main-lens" /></motion.div>
            <motion.h1 layout={!reducedMotion} className="wordmark" transition={layoutTransition}>DocLens</motion.h1>
          </motion.div>
        </motion.div>
        {hasChat && <Conversation className="chat-scroll" aria-live="polite" initial={reducedMotion ? "instant" : "smooth"} resize={reducedMotion ? "instant" : "smooth"}>
          <ConversationContent className="message-column">
            {loading ? <ScreenNotice>Opening your chat…</ScreenNotice> : messages.map((message, index) => <AnswerMessage key={message.id} message={message} question={index > 0 && messages[index - 1].role === "user" ? messages[index - 1].content : undefined} onRegenerate={sourceRemoved ? undefined : (question) => void sendQuestion(question)} busy={!canSend} />)}
            {pendingAnswer && <>
              <AnswerMessage message={{ id: "pending-question", role: "user", content: pendingAnswer.question, citations: [] }} />
              <Message from="assistant" className="chat-message answer-message" aria-label="DocLens said">
                <div className="answer-avatar" aria-hidden="true"><LensMark className="answer-avatar-mark" /></div>
                <div className="answer-body"><div className="message-bubble answer-copy" dir="auto">
                  {!pendingAnswer.tokens.length ? <div className="answer-waiting" role="status"><span>{pendingAnswer.phase === "retrieving" ? "Finding the right passages…" : "Writing your answer…"}</span></div> :
                    <div data-testid="streaming-answer" aria-live="off" className="streaming-text">{pendingAnswer.tokens.map((token, index) => /^\s+$/u.test(token) ? token : <span key={index} className="answer-token-dissolve">{token}</span>)}<span className="stream-caret" aria-hidden="true" /></div>}
                </div></div>
              </Message>
            </>}
            {sourceRemoved && <button className="new-chat-pill history-new-chat" onClick={newConversation}><PlusIcon />New chat</button>}
          </ConversationContent>
          <ConversationScrollButton className="jump-latest" aria-label="Jump to latest" size="default">Jump to latest<ChevronDown size={14} /></ConversationScrollButton>
        </Conversation>}
        {error && <div className="workspace-error" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={14} /></button></div>}
        <div className="composer-glass-zone" aria-hidden="true" />
        <motion.div layout={!reducedMotion} className="composer-position" transition={layoutTransition}>
          {(selectedFile || readyFiles.length > 0) && !sourceRemoved && status !== "ended" ? <form className={cn("composer-pill", draft.includes("\n") && "is-multiline")} onSubmit={(event) => { event.preventDefault(); if (!mention) void sendQuestion(draft); }}>
            {mention && <div ref={mentionListRef} id="document-mention-list" className="document-mention-list" role="listbox" aria-label="Documents">
              <div className="document-mention-heading">Choose a document</div>
              {mentionFiles.length ? mentionFiles.map((file, index) =>
                <button key={file.id} id={"document-mention-" + file.id} type="button" role="option" aria-selected={index === activeMentionIndex} tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setMentionIndex(index)} onClick={() => selectMentionFile(file)}>
                  <FileText size={16} aria-hidden="true" />
                  <span className="document-mention-name" dir="auto">{file.filename}</span>
                  {selectedFileId === file.id && <span className="document-mention-current">Selected</span>}
                </button>) : <div className="document-mention-empty" role="status">No matching documents</div>}
            </div>}
            {selectedFile && <div className="document-chip"><button type="button" title={selectedFile.filename} onClick={() => setDocumentsOpen(true)}><FileText size={14} /><bdi>{shortFilename(selectedFile.filename, 24)}</bdi></button><button type="button" aria-label="Clear selected document" disabled={sending} onClick={clearFile}><X size={12} /></button></div>}
            <textarea ref={promptTextarea} role="combobox" aria-label={selectedFile ? "Ask a question about your document" : "Ask a question; type @ to choose a document"}
              aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={Boolean(mention)} aria-controls={mention ? "document-mention-list" : undefined}
              aria-activedescendant={mention && mentionFiles.length ? "document-mention-" + mentionFiles[activeMentionIndex].id : undefined}
              dir="auto" value={draft} rows={1} disabled={!canType}
              placeholder={selectedFile?.status === "embedded" ? hasChat ? "Ask a follow-up or type @ to switch documents" : "Ask about " + shortFilename(selectedFile.filename, 24) : "Ask a question · type @ to choose a document"}
              onChange={(event) => { setDraft(event.currentTarget.value); updateMention(event.currentTarget.value, event.currentTarget.selectionStart); }}
              onClick={(event) => updateMention(draft, event.currentTarget.selectionStart)}
              onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updateMention(draft, event.currentTarget.selectionStart); }}
              onBlur={() => setMention(null)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (mention) {
                  if (event.key === "Escape") { event.preventDefault(); setMention(null); return; }
                  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && mentionFiles.length) {
                    event.preventDefault();
                    setMentionIndex((index) => (index + (event.key === "ArrowDown" ? 1 : mentionFiles.length - 1)) % mentionFiles.length);
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (mentionFiles.length) selectMentionFile(mentionFiles[activeMentionIndex]);
                    return;
                  }
                }
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (canSend && draft.trim()) void sendQuestion(draft); }
              }} />
            {sending ? <button className="send-button" type="button" aria-label="Stop answer" onClick={() => answerAbort.current?.abort()}><Square size={15} fill="currentColor" /></button> : draft.trim() && <button className="send-button" aria-label="Send question" disabled={!canSend || Boolean(mention)}><ArrowUp size={20} /></button>}
          </form> : <button type="button" className="composer-pill locked-composer" disabled={sourceRemoved || loading || status !== "ready"} onClick={() => setDocumentsOpen(true)}>{sourceRemoved ? <LockKeyhole size={17} /> : null}<span>{lockedText}</span>{!sourceRemoved && <Upload size={18} />}</button>}
          {!sourceRemoved && (selectedFile ? <div className="composer-meta"><select aria-label="Chat model" value={modelId} disabled={sending} onChange={(event) => { if (isChatModelId(event.target.value)) setModelId(event.target.value); }}><option value={OPENAI_CHAT_MODEL_ID}>GPT-4.1 mini</option><option value={ANTHROPIC_CHAT_MODEL_ID}>Claude Haiku 4.5</option></select><span>Answers from your document</span></div> : readyFiles.length > 0 && <div className="composer-meta document-mention-hint"><span>Type @ to choose a document before sending.</span></div>)}
        </motion.div>
      </div>
      <button ref={uploadTrigger} className={cn("upload-tab", hint && !hasChat && !files.length && "first-visit-hint")} title="Documents" aria-label="Upload and choose documents" aria-expanded={documentsOpen} aria-haspopup="dialog" disabled={status !== "ready"} onClick={() => { setUploadError(null); setUploadNotice(null); setDocumentsOpen(true); }}><Upload size={20} />{processing && <span className="processing-dot" />}</button>
      <DocumentDrawer open={documentsOpen} onOpenChange={setDocumentsOpen} container={panel} files={files} jobs={jobs} selectedId={selectedFileId} hasChat={hasChat} sending={sending} uploading={uploading} dragging={draggingFile} maxSize={maxUploadSizeMb} error={uploadError} notice={uploadNotice} inputRef={uploadInput} tabRef={uploadTrigger} onFiles={(items) => void uploadDocuments(items)} onSelect={selectFile} onRename={(file) => setRenameTarget({ id: file.id, name: file.filename, kind: "document" })} onDelete={deleteFile} onRetry={(job) => void uploadDocuments([job.file], job.id)} onDismissJob={(id) => setJobs((current) => current.filter((job) => job.id !== id))} />
    </main>
    <RenameDialog target={renameTarget} onClose={() => setRenameTarget(null)} onSave={rename} />
  </div>;
}
function PlusIcon() { return <span aria-hidden="true">+</span>; }
