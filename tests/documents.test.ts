import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { test } from "node:test";
import { chunkPages } from "../src/lib/documents/chunking";
import { documentType, parseDocument } from "../src/lib/documents/parsing";

function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries: Record<string, string>) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(value);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22); header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, compressed);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10); directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBytes);
    offset += header.length + nameBytes.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(central);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(Object.keys(entries).length, 8);
  footer.writeUInt16LE(Object.keys(entries).length, 10);
  footer.writeUInt32LE(centralDirectory.length, 12);
  footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralDirectory, footer]);
}

function makeOnePagePdf(text: string) {
  const escaped = text.replace(/([\\()])/g, "\\$1");
  const body = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(`BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`)} >>\nstream\nBT /F1 12 Tf 72 720 Td (${escaped}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  for (let index = 0; index < body.length; index += 1) {
    offsets.push(Buffer.concat(parts).length);
    parts.push(Buffer.from(`${index + 1} 0 obj\n${body[index]}\nendobj\n`));
  }
  const xrefOffset = Buffer.concat(parts).length;
  const entries = offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  parts.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${entries}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return Buffer.concat(parts);
}

test("TXT and Markdown preserve English, Persian, and source-order text", async () => {
  const input = "Grounded answer: 42.\nپاسخ: چهل و دو.";
  for (const filename of ["answer.txt", "answer.md"]) {
    const result = await parseDocument(filename, Buffer.from(input, "utf8"));
    assert.equal(result.text, input);
    assert.equal(result.pages[0].pageNumber, undefined);
  }
});

test("text PDFs retain their parser-provided page numbers", async () => {
  const result = await parseDocument("answer.pdf", makeOnePagePdf("The answer is forty two."));
  assert.match(result.text, /The answer is forty two/);
  assert.equal(result.pages[0].pageNumber, 1);
});

test("DOCX parser extracts Unicode text from a normal OpenXML package", async () => {
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>Grounded answer: 42. پاسخ: چهل و دو.</w:t></w:r></w:p>
      <w:sectPr/></w:body></w:document>`;
  const bytes = makeZip({
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": documentXml,
  });
  const result = await parseDocument("answer.docx", bytes);
  assert.match(result.text, /Grounded answer: 42/);
  assert.match(result.text, /پاسخ: چهل و دو/);
});

test("legacy DOC parser extracts a real generated Word binary fixture", async () => {
  const bytes = await readFile(resolve(process.cwd(), "tests/fixtures/doc/feature-showcase.doc"));
  const result = await parseDocument("feature-showcase.doc", bytes);
  assert.ok(result.text.length > 100);
  assert.equal(result.pages[0].pageNumber, undefined);
});

test("page-aware chunks stay within size and carry source offsets", async () => {
  const text = `${"A detailed paragraph with evidence. ".repeat(45)}\n${"Another supported paragraph. ".repeat(35)}`;
  const chunks = await chunkPages([{ text, pageNumber: 7 }]);
  const [chunk] = chunks;
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((part) => part.content.length <= 900));
  assert.ok(chunks.every((part) => part.pageNumber === 7 && part.endChar > part.startChar));
  assert.equal(text.slice(chunk.startChar, chunk.endChar), chunk.content);
});

test("unsupported types, invalid UTF-8, scanned PDFs, and invalid legacy DOC are rejected", async () => {
  assert.throws(() => documentType("image.png"), /Supported file types/);
  await assert.rejects(parseDocument("broken.txt", Buffer.from([0xff, 0xfe])), /not valid UTF-8/);
  await assert.rejects(parseDocument("scan.pdf", makeOnePagePdf("")), /No selectable text/);
  const invalidDoc = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  await assert.rejects(parseDocument("broken.doc", invalidDoc), /legacy DOC file could not be read/);
});
