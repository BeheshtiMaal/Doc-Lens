"use client";

import { useState, type RefObject } from "react";
import { Dialog as Modal } from "radix-ui";
import { motion, useDragControls } from "motion/react";
import { Check, ChevronRight, Upload, X } from "lucide-react";
import { ActionMenu, LensMark } from "@/components/doclens-ui";
import { fileSize, shortFilename, dateGroup, type FileRecord, type UploadJob } from "@/components/doclens-types";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function DocumentDrawer({ open, onOpenChange, container, files, jobs, selectedId, hasChat, sending, uploading, dragging, maxSize, error, notice, inputRef, tabRef, onFiles, onSelect, onRename, onDelete, onRetry, onDismissJob }: {
  open: boolean; onOpenChange: (open: boolean) => void; container: HTMLElement | null;
  files: FileRecord[]; jobs: UploadJob[]; selectedId: string | null; hasChat: boolean;
  sending: boolean; uploading: boolean; dragging: boolean; maxSize: number; error: string | null; notice: string | null;
  inputRef: RefObject<HTMLInputElement | null>; tabRef: RefObject<HTMLButtonElement | null>;
  onFiles: (files: File[]) => void; onSelect: (file: FileRecord) => void; onRename: (file: FileRecord) => void;
  onDelete: (file: FileRecord) => Promise<void>; onRetry: (job: UploadJob) => void; onDismissJob: (id: string) => void;
}) {
  const mobile = useIsMobile(); const controls = useDragControls();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmSelect, setConfirmSelect] = useState<string | null>(null);
  return <Modal.Root open={open} onOpenChange={onOpenChange}>
    <Modal.Portal container={container}>
      <Modal.Overlay className="document-scrim" />
      <Modal.Content asChild onCloseAutoFocus={(event) => { event.preventDefault(); tabRef.current?.focus(); }}>
        <motion.section className="document-drawer" drag={mobile ? "y" : "x"} dragListener={false} dragControls={controls} dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} dragElastic={0.18}
          onDragEnd={(_, info) => { if (mobile ? info.offset.y > 70 || info.velocity.y > 450 : info.offset.x > 70 || info.velocity.x > 450) onOpenChange(false); }}>
          <button className="drawer-ear" aria-label="Close documents" onClick={() => onOpenChange(false)}><ChevronRight size={20} /></button>
          <div className="drawer-heading" onPointerDown={(event) => controls.start(event)} style={{ touchAction: "none" }}>
            <span className="sheet-grabber" />
            <Modal.Title>Your documents</Modal.Title>
            <Modal.Close className="icon-button" aria-label="Close documents"><X size={20} /></Modal.Close>
            <Modal.Description className="sr-only">Upload documents and choose one to chat with. PDF, DOCX, TXT, or Markdown, up to {maxSize} MB each.</Modal.Description>
          </div>
          <div className="drawer-body">
            <div data-testid="upload-dropzone" className={cn("upload-dropzone", files.length > 0 && "has-documents", dragging && "is-dragging")}>
              <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown" aria-label="Choose documents to upload" className="sr-only" tabIndex={-1} disabled={uploading || sending}
                onChange={(event) => { const selected = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (selected.length) onFiles(selected); }} />
              <button type="button" disabled={uploading || sending} onClick={() => inputRef.current?.click()}>
                <Upload size={24} aria-hidden="true" /><span><strong>{dragging ? "Release to upload" : "Drop files here, or browse"}</strong><small>PDF, DOCX, TXT, MD · Up to {maxSize} MB each</small></span>
              </button>
            </div>
            {error && <p role="alert" className="error-note">{error}</p>}
            {notice && <p role="status" className="upload-notice">{notice}</p>}
            <ul className="document-list">
              {jobs.map((job) => <li key={job.id} className={cn("document-row upload-job", job.status === "failed" && "is-failed")}>
                <div className="file-type-tile">{job.file.name.split(".").pop()?.toUpperCase().slice(0, 4)}</div>
                <div className="document-copy"><span title={job.file.name}><bdi>{shortFilename(job.file.name)}</bdi></span><small>{job.status === "uploading" ? "Uploading · " + job.progress + "%" : job.status === "reading" ? "Reading the document…" : job.error}</small></div>
                {job.status === "failed" ? <><button className="ghost-pill" disabled={uploading} onClick={() => onRetry(job)}>Try again</button><button className="icon-button" aria-label={"Remove " + job.file.name} onClick={() => onDismissJob(job.id)}><X size={14} /></button></> : <LensMark className="reading-lens" />}
                {job.status === "uploading" && <div className="upload-progress" role="progressbar" aria-label={"Uploading " + job.file.name} aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: job.progress + "%" }} /></div>}
              </li>)}
              {files.map((file) => <li key={file.id} className={cn("document-row", selectedId === file.id && "is-selected", file.status === "failed" && "is-failed")}>
                <div className="file-type-tile">{file.filename.split(".").pop()?.toUpperCase().slice(0, 4)}</div>
                <div className="document-copy"><span title={file.filename}><bdi>{shortFilename(file.filename)}</bdi></span><small>{file.status === "pending" || file.status === "chunked" ? "Reading the document…" : file.status === "failed" ? file.error || "Couldn't read this document. Try another version." : fileSize(file.size) + (file.pageCount ? " · " + file.pageCount + " pages" : "") + " · " + dateGroup(file.createdAt)}</small></div>
                {file.status === "embedded" ? <button className="cherry-button chat-file-button" disabled={sending} aria-pressed={selectedId === file.id} aria-label={"Chat with " + file.filename} onClick={() => {
                  if (hasChat && selectedId !== file.id) setConfirmSelect(file.id); else onSelect(file);
                }}>{selectedId === file.id && <Check size={13} />}Chat<ChevronRight size={13} /></button>
                  : file.status === "failed" ? <button className="ghost-pill" disabled={uploading || sending} onClick={() => inputRef.current?.click()}>Try again</button> : <LensMark className="reading-lens" />}
                <ActionMenu label={"Actions for " + file.filename} disabled={sending} onRename={() => onRename(file)} onDelete={() => setConfirmDelete(file.id)} />
                {confirmSelect === file.id && <div className="inline-confirm"><p>Start a new chat with this document?</p><div><button className="cherry-button" onClick={() => { onSelect(file); setConfirmSelect(null); }}>Start chat</button><button onClick={() => setConfirmSelect(null)}>Cancel</button></div></div>}
                {confirmDelete === file.id && <div className="inline-confirm"><p>Delete this document? Its chats stay as read-only history.</p><div><button className="danger" onClick={async () => { await onDelete(file); setConfirmDelete(null); }}>Delete</button><button onClick={() => setConfirmDelete(null)}>Cancel</button></div></div>}
              </li>)}
            </ul>
            {files.length === 0 && jobs.length === 0 && <p className="documents-empty">No documents yet. Drop a file above to start.</p>}
            <p className="drawer-footnote">One document. Every answer grounded in it.</p>
          </div>
        </motion.section>
      </Modal.Content>
    </Modal.Portal>
  </Modal.Root>;
}
