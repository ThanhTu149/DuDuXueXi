import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

function samplePdf(pageCount, content) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${4 + 2 * i} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (let i = 0; i < pageCount; i += 1) {
    const lines = Array.from({ length: 8 }, () => `(${content}) Tj 0 -18 Td`).join(' ');
    const stream = `BT /F1 12 Tf 40 750 Td ${lines} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function sampleDocx() {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>';
  const files = {
    '[Content_Types].xml': `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': `${xml}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${Array.from({ length: 21 }, (_, i) => `<w:p><w:r><w:t>Lesson ${i + 1} vocabulary example.</w:t>${i < 20 ? '<w:br w:type="page"/>' : ''}</w:r></w:p>`).join('')}</w:body></w:document>`,
  };
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, contents] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const source = Buffer.from(contents);
    const data = deflateRawSync(source);
    const crc = crc32(source);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014B50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(source.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

const server = await createServer({ server: { port: 0 } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  const input = {
    pdf: [...samplePdf(51, 'Chinese lesson text and vocabulary.')],
    scan: [...samplePdf(1, '')],
    docx: [...sampleDocx()],
    txt: 'Bài học tiếng Trung.\n'.repeat(6000),
  };
  const result = await page.evaluate(async (data) => {
    const { validateFile } = await import('/src/lib/fileDetector.js');
    const { extractTextFromTxt } = await import('/src/lib/txtExtractor.js');
    const { extractTextFromPdf } = await import('/src/lib/pdfExtractor.js');
    const { extractTextFromDocx } = await import('/src/lib/docxExtractor.js');
    const pdfFile = new File([new Uint8Array(data.pdf)], 'lessons.pdf', { type: 'application/pdf' });
    const scanFile = new File([new Uint8Array(data.scan)], 'scan.pdf', { type: 'application/pdf' });
    const docxFile = new File([new Uint8Array(data.docx)], 'lessons.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const txtFile = new File([data.txt], 'lessons.txt', { type: 'text/plain' });
    const windowsFile = new File([new Uint8Array([0x63, 0x61, 0x66, 0xE9])], 'latin.txt', { type: 'text/plain' });
    const utf16File = new File([new Uint8Array([0xFF, 0xFE, 0x41, 0, 0x42, 0])], 'utf16.txt', { type: 'text/plain' });
    const pdfProgress = [];
    const pdf = await extractTextFromPdf(pdfFile, (current, total) => pdfProgress.push([current, total]));
    const scan = await extractTextFromPdf(scanFile);
    const docx = await extractTextFromDocx(docxFile);
    const txt = await extractTextFromTxt(txtFile);
    const windows = await extractTextFromTxt(windowsFile);
    const utf16 = await extractTextFromTxt(utf16File);
    return {
      pdf, scan, docx, txt: { length: txt.text.length, encoding: txt.encoding }, windows, utf16,
      progress: pdfProgress.at(-1),
      valid: [pdfFile, docxFile, txtFile].every((file) => validateFile(file).ok),
      rejected: validateFile(new File(['bad'], 'old.doc')).ok,
      oversized: validateFile({ name: 'huge.txt', type: 'text/plain', size: 101 * 1048576 }).ok,
      mismatched: validateFile(new File(['bad'], 'wrong.pdf', { type: 'text/plain' })).ok,
    };
  }, input);
  assert.equal(result.pdf.pageCount, 51);
  assert.equal(result.pdf.isScanned, false);
  assert.match(result.pdf.text, /Chinese lesson text/);
  assert.equal(result.scan.isScanned, true);
  assert.match(result.docx.text, /Lesson 21 vocabulary example/);
  assert.equal(result.txt.length > 100000, true);
  assert.equal(result.txt.encoding, 'UTF-8');
  assert.equal(result.windows.text, 'café');
  assert.equal(result.windows.encoding, 'windows-1252');
  assert.equal(result.utf16.text, 'AB');
  assert.deepEqual(result.progress, [51, 51]);
  assert.equal(result.valid, true);
  assert.equal(result.rejected, false);
  assert.equal(result.oversized, false);
  assert.equal(result.mismatched, false);
  assert.deepEqual(errors, []);
  console.log('Extractors OK: PDF 51 trang, DOCX 21 đoạn có ngắt trang, TXT >100KB; scan/encoding/validation OK.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
