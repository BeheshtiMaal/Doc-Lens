"use client";

import { useState, type ReactNode } from "react";
import { Dialog as Modal, DropdownMenu, Popover } from "radix-ui";
import { Check, Copy, ChevronRight, LockKeyhole, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Message, MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import { dateGroup, shortFilename, type ChatMessage, type ConversationRecord } from "@/components/doclens-types";

export function LensMark({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 56 56" fill="none" aria-hidden="true">
    <circle cx="33" cy="22" r="17" stroke="currentColor" strokeWidth="2.5" />
    <path d="M20.5 34.5 5 50" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    <path d="M26 13h9l6 6v13H26V13Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M35 13v7h6" stroke="var(--cherry-300)" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M30 24h7m-7 4h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}

export function ActionMenu({ label, onRename, onDelete, disabled }: {
  label: string; onRename: () => void; onDelete: () => void; disabled?: boolean;
}) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild><button type="button" className="icon-button row-menu" aria-label={label} disabled={disabled}><MoreHorizontal size={18} /></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="action-menu" align="end" sideOffset={6}>
      <DropdownMenu.Item onSelect={onRename}><Pencil size={14} />Rename</DropdownMenu.Item>
      <DropdownMenu.Item className="danger" onSelect={onDelete}><Trash2 size={14} />Delete</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

export function RenameDialog({ target, onClose, onSave }: {
  target: { name: string; kind: "chat" | "document" } | null; onClose: () => void; onSave: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <Modal.Root open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <Modal.Portal><Modal.Overlay className="modal-scrim" /><Modal.Content className="rename-dialog" onOpenAutoFocus={() => { setValue(target?.name ?? ""); setError(""); }}>
      <Modal.Title>Rename {target?.kind}</Modal.Title><Modal.Description className="sr-only">Enter a new name.</Modal.Description>
      <form onSubmit={async (event) => { event.preventDefault(); if (!value.trim()) return; setBusy(true); setError(""); try { await onSave(value.trim()); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Rename failed. Try again."); } finally { setBusy(false); } }}>
        <input aria-label="New name" value={value} maxLength={target?.kind === "chat" ? 120 : 255} onChange={(event) => setValue(event.target.value)} autoFocus />
        {error && <p role="alert" className="error-note">{error}</p>}
        <div className="confirmation-actions"><button type="button" className="ghost-pill" onClick={onClose}>Cancel</button><button className="cherry-button" disabled={busy || !value.trim()}>{busy ? "Saving…" : "Save"}</button></div>
      </form>
    </Modal.Content></Modal.Portal>
  </Modal.Root>;
}

export function WorkspaceSidebar({ conversations, activeId, busy, hasFiles, onSelect, onNew, onRename, onDelete, mobileOpen, setMobileOpen }: {
  conversations: ConversationRecord[]; activeId: string | null; busy: boolean; hasFiles: boolean;
  onSelect: (id: string) => void; onNew: () => void; onRename: (chat: ConversationRecord) => void;
  onDelete: (id: string) => Promise<void>; mobileOpen: boolean; setMobileOpen: (open: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false); const [confirm, setConfirm] = useState<string | null>(null);
  const content = <>
    <button className="sidebar-brand" aria-label="DocLens — new chat" disabled={busy} onClick={() => { onNew(); setMobileOpen(false); }}><LensMark /><span className="wordmark">DocLens</span></button>
    <button className="new-chat-pill" disabled={busy || !hasFiles} title="New chat" onClick={() => { onNew(); setMobileOpen(false); }}><Plus size={18} /><span>New chat</span></button>
    <nav aria-label="Chat history" className="chat-history">
      {conversations.length === 0 && <p className="history-empty">Your chats will appear here.</p>}
      {["Today", "Yesterday", "Earlier"].map((group) => {
        const chats = conversations.filter((chat) => dateGroup(chat.updatedAt ?? chat.createdAt) === group);
        if (!chats.length) return null;
        return <section key={group}><h2>{group}</h2>{chats.map((chat) => <div key={chat.id} className={cn("history-row", activeId === chat.id && "is-selected")}>
          <button className="history-select" disabled={busy} aria-current={activeId === chat.id ? "page" : undefined} title={chat.title} onClick={() => { onSelect(chat.id); setMobileOpen(false); setExpanded(false); }}>
            <span className="history-initial">{chat.title.slice(0, 1).toUpperCase()}</span>
            <span className="history-copy"><span dir="auto">{chat.title.slice(0, 40)}</span><small>{chat.sourceRemovedAt ? "Document removed" : shortFilename(chat.sourceFilename, 27)}</small></span>
            {chat.sourceRemovedAt && <LockKeyhole size={12} className="history-lock" />}
          </button>
          <ActionMenu label={"Actions for " + chat.title} disabled={busy} onRename={() => onRename(chat)} onDelete={() => setConfirm(chat.id)} />
          {confirm === chat.id && <div className="inline-confirm"><p>Delete chat?</p><div><button className="danger" onClick={async () => { await onDelete(chat.id); setConfirm(null); }}>Delete</button><button onClick={() => setConfirm(null)}>Cancel</button></div></div>}
        </div>)}</section>;
      })}
    </nav>
    <div className="sidebar-footer"><span className="privacy-dot" /><span>Private, for this session</span></div>
  </>;
  return <>
    <aside onMouseLeave={() => setExpanded(false)} className={cn("workspace-sidebar grain", expanded && "rail-expanded")}>
      <button className="rail-brand" aria-label="Expand chat history" onMouseEnter={() => setExpanded(true)} onClick={() => setExpanded(!expanded)}><LensMark /></button>
      {content}
    </aside>
    <Modal.Root open={mobileOpen} onOpenChange={setMobileOpen}><Modal.Portal><Modal.Overlay className="mobile-sidebar-scrim" /><Modal.Content className="mobile-sidebar grain">
      <Modal.Title className="sr-only">Chat history</Modal.Title><Modal.Description className="sr-only">Choose a chat or start a new one.</Modal.Description>
      <Modal.Close className="icon-button mobile-sidebar-close" aria-label="Close chat history"><X size={18} /></Modal.Close>
      {content}
    </Modal.Content></Modal.Portal></Modal.Root>
  </>;
}

export function AnswerMessage({ message, question, onRegenerate, busy }: {
  message: ChatMessage; question?: string; onRegenerate?: (question: string) => void; busy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const answerContent = <div className="answer-body">
    <div className="message-bubble answer-copy" dir="auto"><MessageResponse>{message.content}</MessageResponse></div>
    {message.citations.length > 0 && <div className="source-chips" aria-label="Answer citations">{message.citations.map((citation, index) => <Popover.Root key={citation.chunkId + index}>
      <Popover.Trigger asChild><button className={cn("source-chip", citation.sourceUnavailable && "source-unavailable")} title={citation.sourceUnavailable ? "Document removed" : citation.label}>{citation.pageNumber ? "p. " + citation.pageNumber : citation.label}<ChevronRight size={11} /></button></Popover.Trigger>
      <Popover.Portal><Popover.Content className="source-popover" sideOffset={10} collisionPadding={18} aria-label={citation.label}>
        <div className="source-popover-title"><strong>{citation.label}{citation.pageNumber ? " · page " + citation.pageNumber : ""}</strong><Popover.Close className="icon-button" aria-label="Close source"><X size={15} /></Popover.Close></div>
        <p dir="auto">{citation.passage && !citation.sourceUnavailable ? <mark>{citation.passage}</mark> : "The source file was removed, so this passage is unavailable."}</p>
        <Popover.Arrow className="popover-arrow" />
      </Popover.Content></Popover.Portal>
    </Popover.Root>)}</div>}
    <div className="message-actions"><button className="icon-button" aria-label={copied ? "Answer copied" : "Copy answer"} title="Copy answer" onClick={async () => { try { await navigator.clipboard.writeText(message.content); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
      {question && onRegenerate && <button className="icon-button" aria-label="Regenerate answer" title="Regenerate answer" disabled={busy} onClick={() => onRegenerate(question)}><RotateCcw size={14} /></button>}
    </div>
  </div>;
  return <Message from={message.role} className={cn("chat-message", message.role === "user" ? "question-message" : "answer-message")} aria-label={message.role === "user" ? "You said" : "DocLens said"}>
    {message.role === "user" ? <div className="message-bubble" dir="auto"><p className="whitespace-pre-wrap">{message.content}</p></div> : <>
      <div className="answer-avatar" aria-hidden="true"><LensMark className="answer-avatar-mark" /></div>
      {answerContent}
    </>}
  </Message>;
}

export function ScreenNotice({ children }: { children: ReactNode }) { return <div className="screen-notice" role="status">{children}</div>; }
