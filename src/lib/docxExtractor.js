import { loadExternalScript } from './loadExternalScript.js';

const MAMMOTH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

export function loadMammoth() {
  return loadExternalScript(MAMMOTH_URL, 'mammoth');
}

export async function extractTextFromDocx(file, onProgress = () => {}, signal) {
  try {
    signal?.throwIfAborted();
    const mammoth = await loadMammoth();
    signal?.throwIfAborted();
    onProgress(0, 1);
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    signal?.throwIfAborted();
    onProgress(1, 1);
    return {
      text: result.value.trim(),
      warnings: (result.messages || []).map(({ type, message }) => ({ type, message })),
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(`File DOCX không đọc được. Vui lòng kiểm tra lại. ${error?.message || ''}`.trim(), { cause: error });
  }
}
