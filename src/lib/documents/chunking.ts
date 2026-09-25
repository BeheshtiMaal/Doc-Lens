import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 900, chunkOverlap: 120 });

export type DocumentChunk = {
  index: number;
  content: string;
  startChar: number;
  endChar: number;
  pageNumber: number | null;
};

export async function chunkPages(pages: Array<{ text: string; pageNumber?: number }>): Promise<DocumentChunk[]> {
  const chunks: DocumentChunk[] = [];
  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;
    const segments = await splitter.splitText(text);
    let cursor = 0;
    for (const content of segments) {
      const foundAt = text.indexOf(content, Math.max(0, cursor - splitter.chunkOverlap));
      const startChar = foundAt < 0 ? cursor : foundAt;
      chunks.push({
        index: chunks.length,
        content,
        startChar,
        endChar: startChar + content.length,
        pageNumber: page.pageNumber ?? null,
      });
      cursor = startChar + content.length;
    }
  }
  return chunks;
}
