import { loadExternalScript } from './loadExternalScript.js';

const PDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export async function loadPdfJs() {
  const pdfjs = await loadExternalScript(PDF_URL, 'pdfjsLib');
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
  return pdfjs;
}

function pageText(items) {
  return items.map((item) => {
    if (typeof item.str !== 'string') return '';
    return item.str + (item.hasEOL ? '\n' : ' ');
  }).join('').replace(/([\p{Script=Han}]) +(?=[\p{Script=Han}])/gu, '$1').trim();
}

export async function extractTextFromPdf(file, onProgress = () => {}, signal) {
  let task;
  try {
    signal?.throwIfAborted();
    const pdfjs = await loadPdfJs();
    signal?.throwIfAborted();
    task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const document = await task.promise;
    const pages = [];
    onProgress(0, document.numPages);
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      signal?.throwIfAborted();
      const page = await document.getPage(pageNumber);
      pages.push(pageText((await page.getTextContent()).items));
      page.cleanup();
      onProgress(pageNumber, document.numPages);
    }
    const text = pages.join('\n\n').trim();
    const meaningfulLength = text.replace(/\s/g, '').length;
    return {
      text,
      pageCount: document.numPages,
      isScanned: meaningfulLength < 100 * document.numPages,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (error?.name === 'PasswordException' || /password/i.test(error?.message || '')) {
      throw new Error('PDF có mật khẩu. Vui lòng bỏ mật khẩu trước khi nhập.', { cause: error });
    }
    throw new Error(`Không đọc được PDF: ${error?.message || 'Tệp có thể bị hỏng.'}`, { cause: error });
  } finally {
    if (task) await task.destroy();
  }
}
