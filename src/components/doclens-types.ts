export type FileRecord = {
  id: string; filename: string; status: "pending" | "chunked" | "embedded" | "failed";
  error: string | null; size: number; createdAt?: string; pageCount?: number;
};
export type ConversationRecord = {
  id: string; fileId: string | null; sourceFilename: string; sourceRemovedAt: string | null;
  title: string; selectedModel: string; createdAt?: string; updatedAt?: string;
};
export type Citation = {
  chunkId: string; label: string; passage?: string; pageNumber: number | null; sourceUnavailable?: boolean;
};
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; citations: Citation[] };
export type UploadJob = { id: string; file: File; progress: number; status: "uploading" | "reading" | "failed"; error?: string };
export function shortFilename(name: string, length = 30) {
  if (name.length <= length) return name;
  const tail = Math.min(12, Math.max(7, name.length - name.lastIndexOf(".")));
  return name.slice(0, length - tail - 1) + "…" + name.slice(-tail);
}
export function fileSize(size: number) {
  return size >= 1024 * 1024 ? (size / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(size / 1024)) + " KB";
}
export function dateGroup(value?: string) {
  if (!value) return "Today";
  const date = new Date(value); const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  return date.toDateString() === today.toDateString() ? "Today" : date.toDateString() === yesterday.toDateString() ? "Yesterday" : "Earlier";
}
