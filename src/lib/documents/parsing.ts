import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { HttpError } from "@/lib/errors";

export type ParsedPage = { text: string; pageNumber?: number };
export type ParsedDocument = { pages: ParsedPage[]; text: string };

const parsers = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
} as const;

export function documentType(filename: string) {
  const extension = filename.toLocaleLowerCase().match(/\.[a-z0-9]+$/)?.[0] as keyof typeof parsers | undefined;
  if (!extension || !(extension in parsers)) throw new HttpError(415, "Supported file types: PDF, DOCX, DOC, TXT, and Markdown.");
  return { extension, contentType: parsers[extension] };
}

function decodeText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new HttpError(422, "The text file is not valid UTF-8.");
  }
}

function checkDocxPackage(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumFooter = 22;
  const searchStart = Math.max(0, buffer.length - minimumFooter - 0xffff);
  let end = -1;
  for (let offset = buffer.length - minimumFooter; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new HttpError(422, "The DOCX package is incomplete.");
  const disk = buffer.readUInt16LE(end + 4);
  const centralDisk = buffer.readUInt16LE(end + 6);
  const diskEntries = buffer.readUInt16LE(end + 8);
  const entryCount = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  const centralOffset = buffer.readUInt32LE(end + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount || entryCount > 1000
    || centralOffset === 0xffffffff || centralSize === 0xffffffff
    || centralOffset + centralSize > end) {
    throw new HttpError(422, "The DOCX package is malformed or uses an unsupported ZIP variant.");
  }
  let offset = centralOffset;
  let expandedBytes = 0;
  const names = new Set<string>();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > centralOffset + centralSize || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new HttpError(422, "The DOCX package directory is malformed.");
    }
    const compressed = buffer.readUInt32LE(offset + 20);
    const expanded = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    if (compressed === 0xffffffff || expanded === 0xffffffff
      || offset + 46 + nameLength + extraLength + commentLength > centralOffset + centralSize) {
      throw new HttpError(422, "The DOCX package directory is malformed.");
    }
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (name.startsWith("/") || name.split("/").includes("..")) throw new HttpError(422, "The DOCX package contains an unsafe path.");
    names.add(name);
    expandedBytes += expanded;
    if (expandedBytes > 5_000_000) throw new HttpError(413, "The DOCX expands beyond the safe processing limit.");
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) {
    throw new HttpError(422, "This ZIP file is not a valid Word DOCX document.");
  }
}

export async function parseDocument(filename: string, bytes: Uint8Array): Promise<ParsedDocument> {
  const { extension } = documentType(filename);
  let pages: ParsedPage[];
  if (extension === ".txt" || extension === ".md" || extension === ".markdown") {
    pages = [{ text: decodeText(bytes) }];
  } else if (extension === ".pdf") {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new HttpError(422, "This file is not a valid PDF.");
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText({ pageJoiner: "\n" });
      pages = result.pages.map((page) => ({ text: page.text, pageNumber: page.num }));
    } catch {
      throw new HttpError(422, "The PDF could not be read. Scanned/image-only PDFs are not supported.");
    } finally {
      await parser.destroy();
    }
  } else if (extension === ".docx") {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new HttpError(422, "This file is not a valid DOCX document.");
    checkDocxPackage(bytes);
    try {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      pages = [{ text: result.value }];
    } catch {
      throw new HttpError(422, "The DOCX file could not be read.");
    }
  } else {
    const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (!oleSignature.every((byte, index) => bytes[index] === byte)) {
      throw new HttpError(422, "This file is not a valid legacy DOC document.");
    }
    try {
      const document = await new WordExtractor().extract(Buffer.from(bytes));
      pages = [{ text: document.getBody({ filterUnicode: false }) }];
    } catch {
      throw new HttpError(422, "The legacy DOC file could not be read.");
    }
  }
  const text = pages.map((page) => page.text).join("\n").trim();
  if (!text.trim()) throw new HttpError(422, "No selectable text was found. Scanned/image-only PDFs are not supported.");
  if (text.length > 5_000_000) throw new HttpError(413, "Extracted text exceeds the safe processing limit.");
  return { pages, text };
}
